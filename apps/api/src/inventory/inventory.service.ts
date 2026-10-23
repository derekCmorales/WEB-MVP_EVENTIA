import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import type { HoldInput } from '@eventia/schemas'
import { PrismaService } from '../infra/prisma.service'
import { AuditService } from '../audit/audit.service'
import { RedisService } from '../infra/redis.service'
import { KeysService } from '../infra/keys.service'
import { RateLimitService } from '../infra/rate-limit.service'
import { stableString } from '../domain/stable'
import { getEnv } from '../config/env'
import { conflict, forbidden, notFound, tooMany } from '../common/problem'

const holdInclude = { items: true, session: { include: { ticketTypes: true, event: true } } } satisfies Prisma.HoldInclude

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly redis: RedisService,
    private readonly keys: KeysService,
    private readonly limits: RateLimitService,
  ) {}

  async createHold(userId: string, idempotencyKey: string, input: HoldInput, admissionToken: string | undefined, ip: string) {
    const allowed = await this.limits.hit(`hold:${userId}`, 10, 60)
    if (!allowed) throw tooMany('Demasiados apartados. Espera un minuto.')
    const requestHash = stableString(input)
    const existing = await this.prisma.hold.findUnique({
      where: { userId_idempotencyKey: { userId, idempotencyKey } },
      include: holdInclude,
    })
    if (existing) {
      if (existing.requestHash !== requestHash) throw conflict('La clave de idempotencia ya se usó con otro cuerpo')
      return presentHold(existing)
    }

    const session = await this.prisma.session.findUnique({
      where: { id: input.sessionId },
      include: { event: true, ticketTypes: true, zones: true },
    })
    if (!session || session.event.status !== 'PUBLISHED') throw notFound('La función no está a la venta')
    const now = new Date()
    if (session.salesOpenAt > now) throw conflict('La venta todavía no abre')
    if (session.salesCloseAt && session.salesCloseAt < now) throw conflict('La venta ya cerró')
    if (session.status === 'CANCELLED') throw conflict('La función fue cancelada')
    await this.assertAdmission(userId, session, admissionToken)

    const normalized = this.normalize(session, input)
    try {
      const hold = await this.prisma.$transaction(async (tx) => {
        for (const item of normalized) await this.assertLimits(tx, userId, item.ticketType, item.quantity)
        const created = await tx.hold.create({
          data: {
            userId,
            sessionId: session.id,
            expiresAt: new Date(Date.now() + getEnv().HOLD_TTL_SECONDS * 1000),
            idempotencyKey,
            requestHash,
            items: {
              create: normalized.map((item) => ({
                ticketTypeId: item.ticketType.id,
                zoneId: item.zone.id,
                quantity: item.quantity,
              })),
            },
          },
          include: holdInclude,
        })
        for (const item of normalized) await this.reserve(tx, item, created.id)
        return created
      })
      await this.remember(hold.id)
      await this.audit.record({ actorId: userId, action: 'hold_create', targetType: 'hold', targetId: hold.id, ip })
      return presentHold(hold)
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const raced = await this.prisma.hold.findUnique({
          where: { userId_idempotencyKey: { userId, idempotencyKey } },
          include: holdInclude,
        })
        if (raced && raced.requestHash === requestHash) return presentHold(raced)
        throw conflict('La clave de idempotencia ya se usó con otro cuerpo')
      }
      throw mapCapacity(error)
    }
  }

  async get(userId: string, holdId: string) {
    const hold = await this.prisma.hold.findUnique({ where: { id: holdId }, include: holdInclude })
    if (!hold || hold.userId !== userId) throw notFound('Apartado no encontrado')
    return presentHold(hold)
  }

  async release(userId: string, holdId: string, ip: string) {
    await this.prisma.$transaction(async (tx) => {
      const hold = await tx.hold.findUnique({ where: { id: holdId }, include: { items: true } })
      if (!hold || hold.userId !== userId) throw notFound('Apartado no encontrado')
      if (hold.status !== 'ACTIVE') return
      const updated = await tx.hold.updateMany({ where: { id: holdId, status: 'ACTIVE' }, data: { status: 'RELEASED' } })
      if (updated.count === 0) return
      for (const item of hold.items) await releaseHeld(tx, item.zoneId, item.quantity, holdId)
    })
    await this.redis.client?.del(`hold:${holdId}`).catch(() => undefined)
    await this.audit.record({ actorId: userId, action: 'hold_release', targetType: 'hold', targetId: holdId, ip })
    return { id: holdId, status: 'RELEASED' }
  }

  async sweep() {
    const expired = await this.prisma.hold.findMany({
      where: { status: 'ACTIVE', expiresAt: { lt: new Date() } },
      include: { items: true },
      take: 100,
    })
    let released = 0
    for (const hold of expired) {
      const did = await this.prisma.$transaction(async (tx) => {
        const updated = await tx.hold.updateMany({
          where: { id: hold.id, status: 'ACTIVE', expiresAt: { lt: new Date() } },
          data: { status: 'EXPIRED' },
        })
        if (updated.count === 0) return false
        for (const item of hold.items) await releaseHeld(tx, item.zoneId, item.quantity, hold.id)
        return true
      })
      if (did) released += 1
    }
    await this.expireOffers()
    return released
  }

  async commitHold(tx: Prisma.TransactionClient, holdId: string) {
    const hold = await tx.hold.findUnique({ where: { id: holdId }, include: { items: true } })
    if (!hold || hold.status !== 'ACTIVE' || hold.expiresAt <= new Date()) {
      throw conflict('El apartado ya no está vigente')
    }
    const updated = await tx.hold.updateMany({ where: { id: holdId, status: 'ACTIVE' }, data: { status: 'CONVERTED' } })
    if (updated.count === 0) throw conflict('El apartado ya no está vigente')
    for (const item of hold.items) {
      const rows = await tx.$queryRaw<{ id: string }[]>`
        UPDATE "Zone"
        SET "held" = "held" - ${item.quantity}, "sold" = "sold" + ${item.quantity}, "version" = "version" + 1
        WHERE "id" = ${item.zoneId} AND "held" >= ${item.quantity}
        RETURNING "id"
      `
      if (rows.length !== 1) throw conflict('No se pudo confirmar el cupo')
      await tx.seat.updateMany({ where: { holdId }, data: { status: 'SOLD', holdId: null } })
    }
    return hold
  }

  async holdOneForUser(tx: Prisma.TransactionClient, input: { userId: string; sessionId: string; ticketTypeId: string; zoneId: string; idempotencyKey: string }) {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      UPDATE "Zone"
      SET "held" = "held" + 1, "version" = "version" + 1
      WHERE "id" = ${input.zoneId} AND ("sold" + "held" + 1) <= "capacity"
      RETURNING "id"
    `
    if (rows.length !== 1) return null
    return tx.hold.create({
      data: {
        userId: input.userId,
        sessionId: input.sessionId,
        expiresAt: new Date(Date.now() + getEnv().HOLD_TTL_SECONDS * 1000),
        idempotencyKey: input.idempotencyKey,
        requestHash: 'waitlist-offer',
        items: { create: [{ ticketTypeId: input.ticketTypeId, zoneId: input.zoneId, quantity: 1 }] },
      },
    })
  }

  async releaseSold(tx: Prisma.TransactionClient, zoneId: string, quantity: number, seatIds: string[]) {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      UPDATE "Zone"
      SET "sold" = "sold" - ${quantity}, "version" = "version" + 1
      WHERE "id" = ${zoneId} AND "sold" >= ${quantity}
      RETURNING "id"
    `
    if (rows.length !== 1) throw conflict('No se pudo liberar el cupo')
    if (seatIds.length) {
      await tx.seat.updateMany({ where: { id: { in: seatIds } }, data: { status: 'FREE', holdId: null } })
    }
  }

  private normalize(session: Prisma.SessionGetPayload<{ include: { ticketTypes: true; zones: true; event: true } }>, input: HoldInput) {
    return input.items.map((item) => {
      const ticketType = session.ticketTypes.find((type) => type.id === item.ticketTypeId)
      if (!ticketType) throw notFound('El tipo de boleto no existe en esta función')
      const zone = session.zones.find((entry) => entry.id === ticketType.zoneId)
      if (!zone) throw notFound('La zona no existe')
      if (item.quantity > ticketType.perOrderLimit) throw conflict(`Máximo ${ticketType.perOrderLimit} boletos por orden`)
      return { ...item, ticketType, zone }
    })
  }

  private async assertLimits(tx: Prisma.TransactionClient, userId: string, ticketType: { id: string; perUserLimit: number }, quantity: number) {
    const [tickets, holds] = await Promise.all([
      tx.ticket.count({ where: { holderId: userId, ticketTypeId: ticketType.id, status: { in: ['ISSUED', 'USED'] } } }),
      tx.holdItem.aggregate({
        where: { ticketTypeId: ticketType.id, hold: { userId, status: 'ACTIVE', expiresAt: { gt: new Date() } } },
        _sum: { quantity: true },
      }),
    ])
    const already = tickets + (holds._sum.quantity ?? 0)
    if (already + quantity > ticketType.perUserLimit) {
      throw conflict(`Máximo ${ticketType.perUserLimit} boletos de este tipo por persona`)
    }
  }

  private async reserve(tx: Prisma.TransactionClient, item: { zone: { id: string; kind: 'GA' | 'SEATED' }; quantity: number; seatIds?: string[] }, holdId: string) {
    if (item.zone.kind === 'SEATED' && (!item.seatIds || item.seatIds.length !== item.quantity)) {
      throw conflict('Elige los asientos que quieres apartar')
    }
    const rows = await tx.$queryRaw<{ id: string }[]>`
      UPDATE "Zone"
      SET "held" = "held" + ${item.quantity}, "version" = "version" + 1
      WHERE "id" = ${item.zone.id}
        AND ("sold" + "held" + ${item.quantity}) <= "capacity"
      RETURNING "id"
    `
    if (rows.length !== 1) throw conflict('No hay cupo suficiente')
    if (item.zone.kind === 'SEATED' && item.seatIds) {
      const updated = await tx.seat.updateMany({
        where: { id: { in: item.seatIds }, zoneId: item.zone.id, status: 'FREE' },
        data: { status: 'HELD', holdId },
      })
      if (updated.count !== item.seatIds.length) throw conflict('Algunos asientos ya no están libres')
    }
  }

  private async assertAdmission(userId: string, session: { id: string; queueEnabled: boolean }, token?: string) {
    if (!session.queueEnabled) return
    if (!token) throw forbidden('Necesitas un turno de la fila para apartar', 'queue')
    const payload = await this.keys.verifyAccess(token)
    if (payload.purpose !== 'admit' || payload.sid !== session.id || payload.sub !== userId) {
      throw forbidden('El turno de la fila no es válido', 'queue')
    }
  }

  private async remember(holdId: string) {
    const client = this.redis.client
    if (!client || client.status !== 'ready') return
    await client.set(`hold:${holdId}`, '1', 'EX', getEnv().HOLD_TTL_SECONDS).catch(() => undefined)
  }

  private async expireOffers() {
    const offers = await this.prisma.waitlistEntry.findMany({
      where: { status: 'OFFERED', offerExpiresAt: { lt: new Date() }, holdId: { not: null } },
    })
    for (const offer of offers) {
      await this.prisma.$transaction(async (tx) => {
        const updated = await tx.waitlistEntry.updateMany({
          where: { id: offer.id, status: 'OFFERED' },
          data: { status: 'EXPIRED' },
        })
        if (updated.count === 0 || !offer.holdId) return
        const hold = await tx.hold.findUnique({ where: { id: offer.holdId }, include: { items: true } })
        if (!hold || hold.status !== 'ACTIVE') return
        await tx.hold.update({ where: { id: hold.id }, data: { status: 'EXPIRED' } })
        for (const item of hold.items) await releaseHeld(tx, item.zoneId, item.quantity, hold.id)
      })
    }
  }
}

async function releaseHeld(tx: Prisma.TransactionClient, zoneId: string, quantity: number, holdId: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    UPDATE "Zone"
    SET "held" = "held" - ${quantity}, "version" = "version" + 1
    WHERE "id" = ${zoneId} AND "held" >= ${quantity}
    RETURNING "id"
  `
  if (rows.length !== 1) throw conflict('No se pudo liberar el apartado')
  await tx.seat.updateMany({ where: { holdId }, data: { status: 'FREE', holdId: null } })
}

function mapCapacity(error: unknown) {
  const message = error instanceof Error ? error.message : ''
  if (message.includes('zone_capacity_ok') || message.includes('23514')) return conflict('No hay cupo suficiente')
  return error
}

export function presentHold(hold: Prisma.HoldGetPayload<{ include: typeof holdInclude }>) {
  const types = new Map(hold.session.ticketTypes.map((type) => [type.id, type]))
  const totalCents = hold.items.reduce((sum, item) => {
    const type = types.get(item.ticketTypeId)
    return sum + (type ? (type.priceCents + type.feeCents) * item.quantity : 0)
  }, 0)
  return {
    id: hold.id,
    status: hold.status,
    expiresAt: hold.expiresAt,
    sessionId: hold.sessionId,
    eventTitle: hold.session.event.title,
    currency: hold.session.ticketTypes[0]?.currency ?? 'USD',
    totalCents,
    items: hold.items.map((item) => ({
      ticketTypeId: item.ticketTypeId,
      zoneId: item.zoneId,
      quantity: item.quantity,
      name: types.get(item.ticketTypeId)?.name ?? 'Boleto',
      priceCents: types.get(item.ticketTypeId)?.priceCents ?? 0,
      feeCents: types.get(item.ticketTypeId)?.feeCents ?? 0,
    })),
  }
}

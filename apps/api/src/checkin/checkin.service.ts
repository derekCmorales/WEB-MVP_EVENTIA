import { Injectable } from '@nestjs/common'
import { signBytes, verifyTicket } from '@eventia/qr'
import type { CheckInInput, ReconcileInput } from '@eventia/schemas'
import { PrismaService } from '../infra/prisma.service'
import { KeysService } from '../infra/keys.service'
import { AuditService } from '../audit/audit.service'
import { forbidden, notFound } from '../common/problem'

@Injectable()
export class CheckInService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly keys: KeysService,
    private readonly audit: AuditService,
  ) {}

  async validate(userId: string, input: CheckInInput, ip: string) {
    return this.apply(userId, input.token, input.deviceId, Boolean(input.offline), new Date(), ip)
  }

  async reconcile(userId: string, input: ReconcileInput, ip: string) {
    const results = []
    for (const item of input.items) {
      results.push(await this.apply(userId, item.token, input.deviceId, true, new Date(item.at), ip))
    }
    return { data: results }
  }

  async manifest(userId: string, sessionId: string) {
    const session = await this.prisma.session.findUnique({ where: { id: sessionId }, include: { event: true } })
    if (!session) throw notFound('Función no encontrada')
    await this.assertDoor(userId, session.event.orgId)
    const tickets = await this.prisma.ticket.findMany({
      where: { sessionId, status: { in: ['ISSUED', 'USED', 'REFUNDED', 'CANCELLED'] } },
      select: { id: true, rev: true, status: true },
    })
    const body = {
      sessionId,
      kid: this.keys.kid,
      publicKey: Buffer.from(this.keys.ticketPublicRaw).toString('base64url'),
      issuedAt: new Date().toISOString(),
      tickets: tickets.map((ticket) => ({ tid: ticket.id, rev: ticket.rev, status: ticket.status })),
    }
    const signature = await signBytes(this.keys.ticketPrivate, new TextEncoder().encode(JSON.stringify(body)))
    return { ...body, signature }
  }

  async search(userId: string, sessionId: string, q: string) {
    const session = await this.prisma.session.findUnique({ where: { id: sessionId }, include: { event: true } })
    if (!session) throw notFound('Función no encontrada')
    await this.assertDoor(userId, session.event.orgId)
    const query = q.trim()
    const tickets = await this.prisma.ticket.findMany({
      where: {
        sessionId,
        OR: [
          { serial: { contains: query, mode: 'insensitive' } },
          { holder: { name: { contains: query, mode: 'insensitive' } } },
          { holder: { email: { contains: query, mode: 'insensitive' } } },
        ],
      },
      include: { holder: true },
      take: 20,
    })
    return {
      data: tickets.map((ticket) => ({
        id: ticket.id,
        serial: ticket.serial,
        status: ticket.status,
        rev: ticket.rev,
        holderName: ticket.holder.name,
      })),
    }
  }

  private async apply(userId: string, token: string, deviceId: string, offline: boolean, at: Date, ip: string) {
    const verified = await verifyTicket(this.keys.ticketPublicRaw, token, at.getTime())
    if (!verified.ok) {
      return { result: 'INVALID' as const, detail: 'El pase no es válido o ya venció' }
    }
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: verified.claims.tid },
      include: { order: { include: { hold: { include: { session: { include: { event: true } } } } } } },
    })
    if (!ticket) return { result: 'INVALID', detail: 'El boleto no existe' }
    await this.assertDoor(userId, ticket.order.hold.session.event.orgId)
    if (ticket.sessionId !== verified.claims.sid) {
      await this.store(ticket.id, deviceId, at, 'WRONG_EVENT', offline)
      return { result: 'WRONG_EVENT', detail: 'El pase es de otra función', serial: ticket.serial }
    }
    if (ticket.rev !== verified.claims.rev || ticket.status === 'REFUNDED' || ticket.status === 'CANCELLED') {
      await this.store(ticket.id, deviceId, at, 'REVOKED', offline)
      await this.audit.record({ actorId: userId, action: 'checkin_revoked', targetType: 'ticket', targetId: ticket.id, ip })
      return { result: 'REVOKED', detail: 'Este pase fue revocado', serial: ticket.serial }
    }
    const duplicate = await this.prisma.checkIn.findFirst({ where: { ticketId: ticket.id, result: 'OK' } })
    if (duplicate || ticket.status === 'USED') {
      await this.store(ticket.id, deviceId, at, 'DUPLICATE', offline)
      await this.audit.record({ actorId: userId, action: 'checkin_duplicate', targetType: 'ticket', targetId: ticket.id, ip })
      return { result: 'DUPLICATE', detail: 'Este boleto ya entró', serial: ticket.serial, at: duplicate?.at ?? at }
    }
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.checkIn.create({ data: { ticketId: ticket.id, deviceId, at, result: 'OK', offline } })
        await tx.ticket.update({ where: { id: ticket.id }, data: { status: 'USED' } })
      })
    } catch {
      await this.store(ticket.id, deviceId, at, 'DUPLICATE', offline)
      return { result: 'DUPLICATE', detail: 'Este boleto ya entró', serial: ticket.serial }
    }
    await this.audit.record({ actorId: userId, action: 'checkin', targetType: 'ticket', targetId: ticket.id, ip, metadata: { offline, deviceId } })
    const holder = await this.prisma.user.findUnique({ where: { id: ticket.holderId } })
    return { result: 'OK', detail: 'Acceso permitido', serial: ticket.serial, holderName: holder?.name ?? '', at }
  }

  private async store(ticketId: string, deviceId: string, at: Date, result: 'DUPLICATE' | 'INVALID' | 'REVOKED' | 'WRONG_EVENT', offline: boolean) {
    await this.prisma.checkIn.create({ data: { ticketId, deviceId, at, result, offline } })
  }

  private async assertDoor(userId: string, orgId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (user?.role === 'ADMIN') return
    const member = await this.prisma.organizationMember.findUnique({ where: { orgId_userId: { orgId, userId } } })
    if (!member) throw forbidden('No tienes permiso para validar pases de este evento', 'bfla')
  }
}

import { HttpException, Injectable } from '@nestjs/common'
import type Stripe from 'stripe'
import { randomBytes } from 'node:crypto'
import { Prisma } from '@prisma/client'
import type { OrderInput } from '@eventia/schemas'
import { PrismaService } from '../infra/prisma.service'
import { InventoryService } from '../inventory/inventory.service'
import { PaymentsService } from '../infra/payments.service'
import { AuditService } from '../audit/audit.service'
import { KeysService } from '../infra/keys.service'
import { stableString } from '../domain/stable'
import { conflict, notFound } from '../common/problem'

@Injectable()
export class CheckoutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly payments: PaymentsService,
    private readonly audit: AuditService,
    private readonly keys: KeysService,
  ) {}

  async createOrder(userId: string, idempotencyKey: string, input: OrderInput, ip: string) {
    const requestHash = stableString(input)
    const existing = await this.prisma.order.findUnique({
      where: { userId_idempotencyKey: { userId, idempotencyKey } },
    })
    if (existing) {
      if (existing.requestHash !== requestHash) throw conflict('La clave de idempotencia ya se usó con otro cuerpo')
      return presentOrder(existing)
    }
    const hold = await this.prisma.hold.findUnique({
      where: { id: input.holdId },
      include: { items: true, session: { include: { ticketTypes: true } } },
    })
    if (!hold || hold.userId !== userId) throw notFound('Apartado no encontrado')
    if (hold.status !== 'ACTIVE' || hold.expiresAt <= new Date()) throw conflict('El apartado ya no está vigente')
    const byHold = await this.prisma.order.findUnique({ where: { holdId: hold.id } })
    if (byHold) return presentOrder(byHold)

    const currency = hold.session.ticketTypes[0]?.currency ?? 'USD'
    const totalCents = hold.items.reduce((sum, item) => {
      const type = hold.session.ticketTypes.find((entry) => entry.id === item.ticketTypeId)
      if (!type) return sum
      return sum + (type.priceCents + type.feeCents) * item.quantity
    }, 0)
    try {
      const order = await this.prisma.order.create({
        data: {
          userId,
          holdId: hold.id,
          totalCents,
          currency,
          idempotencyKey,
          requestHash,
        },
      })
      await this.audit.record({ actorId: userId, action: 'order_create', targetType: 'order', targetId: order.id, ip })
      return presentOrder(order)
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const raced = await this.prisma.order.findFirst({
          where: { OR: [{ holdId: hold.id }, { userId, idempotencyKey }] },
        })
        if (raced?.userId === userId) return presentOrder(raced)
      }
      throw error
    }
  }

  async pay(userId: string, orderId: string, ip: string) {
    const order = await this.owned(userId, orderId)
    if (order.status === 'PAID') return { ...presentOrder(order), mode: order.pspProvider === 'stripe' ? 'stripe' : 'fake', clientSecret: null }
    if (order.status !== 'PENDING') throw conflict('Esta orden ya no se puede pagar')
    const intent = await this.payments.createIntent(order)
    await this.prisma.order.update({
      where: { id: order.id },
      data: { pspProvider: intent.provider, pspRef: intent.ref },
    })
    if (intent.status === 'paid') {
      const paid = await this.markPaid(order.id, intent.ref, intent.provider, ip)
      return { ...presentOrder(paid), mode: 'fake' as const, clientSecret: null }
    }
    return { ...presentOrder({ ...order, pspProvider: intent.provider, pspRef: intent.ref }), mode: 'stripe' as const, clientSecret: intent.clientSecret }
  }

  async markPaid(orderId: string, pspRef: string | null, provider: string, ip: string | null) {
    const paid = await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: orderId }, include: { hold: { include: { items: true, session: { include: { ticketTypes: true, event: true } } } } } })
      if (!order) throw notFound('Orden no encontrada')
      if (order.status === 'PAID') return order
      if (order.status !== 'PENDING') throw conflict('La orden no está pendiente')
      const moved = await tx.order.updateMany({
        where: { id: orderId, status: 'PENDING' },
        data: { status: 'PAID', pspRef, pspProvider: provider },
      })
      if (moved.count === 0) {
        const current = await tx.order.findUniqueOrThrow({ where: { id: orderId } })
        if (current.status === 'PAID') return current
        throw conflict('La orden no está pendiente')
      }
      const reservedSeats = await tx.seat.findMany({ where: { holdId: order.holdId } })
      const hold = await this.inventory.commitHold(tx, order.holdId)
      const seatsByZone = new Map<string, string[]>()
      for (const seat of reservedSeats) {
        const list = seatsByZone.get(seat.zoneId) ?? []
        list.push(seat.id)
        seatsByZone.set(seat.zoneId, list)
      }
      for (const item of hold.items) {
        const seatIds = seatsByZone.get(item.zoneId) ?? []
        for (let index = 0; index < item.quantity; index += 1) {
          await tx.ticket.create({
            data: {
              orderId: order.id,
              holderId: order.userId,
              sessionId: order.hold.sessionId,
              ticketTypeId: item.ticketTypeId,
              zoneId: item.zoneId,
              seatId: seatIds[index] ?? null,
              serial: serial(),
              kid: this.keys.kid,
            },
          })
        }
      }
      await tx.outboxEvent.create({
        data: { type: 'order.paid', payload: { orderId: order.id, userId: order.userId } },
      })
      return tx.order.findUniqueOrThrow({ where: { id: order.id } })
    })
    await this.audit.record({ actorId: paid.userId, action: 'order_paid', targetType: 'order', targetId: paid.id, ip })
    await this.publishOutbox()
    return paid
  }

  async markFailed(orderId: string, status: 'FAILED' | 'CANCELLED' = 'FAILED') {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: { hold: { include: { items: true } } } })
    if (!order || order.status !== 'PENDING') return order
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.order.updateMany({ where: { id: orderId, status: 'PENDING' }, data: { status } })
      if (updated.count === 0) return
      if (order.hold.status === 'ACTIVE') {
        await tx.hold.updateMany({ where: { id: order.holdId, status: 'ACTIVE' }, data: { status: 'RELEASED' } })
        for (const item of order.hold.items) {
          await tx.$executeRaw`
            UPDATE "Zone"
            SET "held" = "held" - ${item.quantity}, "version" = "version" + 1
            WHERE "id" = ${item.zoneId} AND "held" >= ${item.quantity}
          `
          await tx.seat.updateMany({ where: { holdId: order.holdId }, data: { status: 'FREE', holdId: null } })
        }
      }
    })
    return this.prisma.order.findUnique({ where: { id: orderId } })
  }

  async cancel(userId: string, orderId: string, ip: string) {
    const order = await this.owned(userId, orderId)
    if (order.status !== 'PENDING') throw conflict('Solo se puede cancelar una orden pendiente')
    await this.markFailed(orderId, 'CANCELLED')
    await this.audit.record({ actorId: userId, action: 'order_cancel', targetType: 'order', targetId: orderId, ip })
    const current = await this.prisma.order.findUniqueOrThrow({ where: { id: orderId } })
    return presentOrder(current)
  }

  async mine(userId: string) {
    const orders = await this.prisma.order.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 50 })
    return { data: orders.map(presentOrder) }
  }

  async get(userId: string, orderId: string) {
    return presentOrder(await this.owned(userId, orderId))
  }

  async handleStripeEvent(event: Stripe.Event, ip: string) {
    if (event.type !== 'payment_intent.succeeded' && event.type !== 'payment_intent.payment_failed') return { received: true }
    const intent = event.data.object as Stripe.PaymentIntent
    const orderId = intent.metadata?.orderId
    if (!orderId) throw conflict('El pago no trae una orden')
    const order = await this.prisma.order.findUnique({ where: { id: orderId } })
    if (!order) throw notFound('Orden no encontrada')
    if (typeof intent.amount === 'number' && intent.amount !== order.totalCents) throw conflict('El monto del pago no coincide')
    if (intent.currency && intent.currency.toUpperCase() !== order.currency) throw conflict('La moneda del pago no coincide')
    if (event.type === 'payment_intent.payment_failed') {
      await this.markFailed(orderId)
      return { received: true }
    }
    try {
      await this.markPaid(orderId, intent.id ?? null, 'stripe', ip)
    } catch (error) {
      const detail = error instanceof HttpException && typeof error.getResponse() === 'object'
        ? String((error.getResponse() as { detail?: string }).detail ?? '')
        : ''
      if (detail.includes('apartado')) {
        await this.payments.refund(intent.id ?? null, order.totalCents)
        await this.prisma.order.updateMany({ where: { id: orderId, status: 'PENDING' }, data: { status: 'FAILED' } })
        return { received: true, fulfilled: false }
      }
      throw error
    }
    return { received: true, fulfilled: true }
  }

  private async owned(userId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } })
    if (!order || order.userId !== userId) throw notFound('Orden no encontrada')
    return order
  }

  private async publishOutbox() {
    await this.prisma.outboxEvent.updateMany({ where: { publishedAt: null }, data: { publishedAt: new Date() } })
  }
}

function presentOrder(order: { id: string; status: string; totalCents: number; currency: string; holdId: string; pspProvider?: string | null; pspRef?: string | null; createdAt: Date }) {
  return {
    id: order.id,
    status: order.status,
    totalCents: order.totalCents,
    currency: order.currency,
    holdId: order.holdId,
    pspProvider: order.pspProvider ?? null,
    pspRef: order.pspRef ?? null,
    createdAt: order.createdAt,
  }
}

function serial() {
  return `EI-${randomBytes(4).toString('hex').toUpperCase()}-${randomBytes(2).toString('hex').toUpperCase()}`
}

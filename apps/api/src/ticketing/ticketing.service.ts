import { Injectable } from '@nestjs/common'
import { currentWindow, signBytes, signTicket, type TicketClaims } from '@eventia/qr'
import type { RefundInput, TransferInput, WaitlistInput } from '@eventia/schemas'
import { PrismaService } from '../infra/prisma.service'
import { KeysService } from '../infra/keys.service'
import { InventoryService } from '../inventory/inventory.service'
import { PaymentsService } from '../infra/payments.service'
import { AuditService } from '../audit/audit.service'
import { refundAmount } from '../domain/refund'
import { conflict, notFound } from '../common/problem'

@Injectable()
export class TicketingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly keys: KeysService,
    private readonly inventory: InventoryService,
    private readonly payments: PaymentsService,
    private readonly audit: AuditService,
  ) {}

  async mine(userId: string) {
    const tickets = await this.prisma.ticket.findMany({
      where: { holderId: userId },
      orderBy: { createdAt: 'desc' },
      include: this.include(),
    })
    return { data: tickets.map(presentTicket) }
  }

  async get(userId: string, ticketId: string) {
    const ticket = await this.prisma.ticket.findUnique({ where: { id: ticketId }, include: this.include() })
    if (!ticket || ticket.holderId !== userId) throw notFound('Boleto no encontrado')
    return presentTicket(ticket)
  }

  async qr(userId: string, ticketId: string) {
    const ticket = await this.prisma.ticket.findUnique({ where: { id: ticketId } })
    if (!ticket || ticket.holderId !== userId) throw notFound('Boleto no encontrado')
    if (ticket.status !== 'ISSUED') throw conflict('Este boleto ya no tiene un pase activo')
    const claims: TicketClaims = {
      tid: ticket.id,
      sid: ticket.sessionId,
      rev: ticket.rev,
      kid: this.keys.kid,
      iat: Math.floor(Date.now() / 1000),
      w: currentWindow(),
    }
    const token = await signTicket(this.keys.ticketPrivate, claims)
    return { token, expiresAt: new Date((claims.w + 1) * 30 * 1000).toISOString(), kid: this.keys.kid }
  }

  async transfer(userId: string, ticketId: string, input: TransferInput, ip: string) {
    const ticket = await this.prisma.ticket.findUnique({ where: { id: ticketId } })
    if (!ticket || ticket.holderId !== userId) throw notFound('Boleto no encontrado')
    if (ticket.status !== 'ISSUED') throw conflict('Este boleto no se puede transferir')
    if (input.toEmail === (await this.prisma.user.findUnique({ where: { id: userId } }))?.email) {
      throw conflict('No puedes transferirte el boleto a ti mismo')
    }
    const pending = await this.prisma.transfer.findFirst({ where: { ticketId, status: 'PENDING' } })
    if (pending) throw conflict('Ya hay una transferencia pendiente')
    const transfer = await this.prisma.transfer.create({
      data: {
        ticketId,
        fromId: userId,
        toEmail: input.toEmail,
        expiresAt: new Date(Date.now() + 48 * 3600 * 1000),
      },
    })
    await this.audit.record({ actorId: userId, action: 'transfer', targetType: 'ticket', targetId: ticketId, ip, metadata: { toEmail: input.toEmail } })
    return { id: transfer.id, status: transfer.status, toEmail: transfer.toEmail, expiresAt: transfer.expiresAt }
  }

  async acceptTransfer(userId: string, transferId: string, ip: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!user) throw notFound('Usuario no encontrado')
    const transfer = await this.prisma.transfer.findUnique({ where: { id: transferId }, include: { ticket: true } })
    if (!transfer || transfer.toEmail !== user.email) throw notFound('Transferencia no encontrada')
    if (transfer.status !== 'PENDING' || transfer.expiresAt < new Date()) throw conflict('La transferencia ya no está vigente')
    if (transfer.ticket.holderId !== transfer.fromId || transfer.ticket.status !== 'ISSUED') {
      throw conflict('El boleto ya no se puede recibir')
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.transfer.update({ where: { id: transferId }, data: { status: 'ACCEPTED' } })
      return tx.ticket.update({
        where: { id: transfer.ticketId },
        data: { holderId: userId, rev: { increment: 1 } },
        include: this.include(),
      })
    })
    await this.audit.record({ actorId: userId, action: 'transfer_accept', targetType: 'ticket', targetId: transfer.ticketId, ip })
    return presentTicket(updated)
  }

  async refund(userId: string, orderId: string, input: RefundInput, ip: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        tickets: true,
        hold: { include: { session: { include: { event: true } } } },
      },
    })
    if (!order) throw notFound('Orden no encontrada')
    const manager = await this.isManager(userId, order.hold.session.event.orgId)
    if (order.userId !== userId && !manager) throw notFound('Orden no encontrada')
    if (order.status !== 'PAID') throw conflict('Solo se reembolsan órdenes pagadas')
    if (order.tickets.some((ticket) => ticket.status === 'USED')) throw conflict('No se puede reembolsar un boleto que ya entró')
    const amount = refundAmount(order.hold.session.event.refundPolicy, order.hold.session.startsAt, new Date(), order.totalCents)
    if (amount <= 0) throw conflict('La política del evento no permite reembolso en este momento')
    await this.payments.refund(order.pspRef, amount)
    await this.prisma.$transaction(async (tx) => {
      await tx.order.update({ where: { id: order.id }, data: { status: 'REFUNDED' } })
      await tx.refund.create({
        data: { orderId: order.id, amountCents: amount, reason: input.reason, policy: order.hold.session.event.refundPolicy },
      })
      for (const ticket of order.tickets) {
        await tx.ticket.update({ where: { id: ticket.id }, data: { status: 'REFUNDED', rev: { increment: 1 } } })
        await this.inventory.releaseSold(tx, ticket.zoneId, 1, ticket.seatId ? [ticket.seatId] : [])
        const next = await tx.waitlistEntry.findFirst({
          where: { sessionId: ticket.sessionId, ticketTypeId: ticket.ticketTypeId, status: 'WAITING' },
          orderBy: { position: 'asc' },
        })
        if (!next) continue
        const offer = await this.inventory.holdOneForUser(tx, {
          userId: next.userId,
          sessionId: ticket.sessionId,
          ticketTypeId: ticket.ticketTypeId,
          zoneId: ticket.zoneId,
          idempotencyKey: `offer-${ticket.id}`,
        })
        if (!offer) continue
        await tx.waitlistEntry.update({
          where: { id: next.id },
          data: { status: 'OFFERED', offerExpiresAt: offer.expiresAt, holdId: offer.id },
        })
      }
      await tx.transfer.updateMany({ where: { ticketId: { in: order.tickets.map((ticket) => ticket.id) }, status: 'PENDING' }, data: { status: 'CANCELLED' } })
      await tx.outboxEvent.create({ data: { type: 'order.refunded', payload: { orderId: order.id, amountCents: amount } } })
    })
    await this.audit.record({ actorId: userId, action: 'refund', targetType: 'order', targetId: order.id, ip, metadata: { amountCents: amount } })
    return { orderId: order.id, amountCents: amount, status: 'REFUNDED' }
  }

  async joinWaitlist(userId: string, input: WaitlistInput) {
    const type = await this.prisma.ticketType.findUnique({ where: { id: input.ticketTypeId }, include: { zone: true, session: true } })
    if (!type || type.sessionId !== input.sessionId) throw notFound('El tipo de boleto no existe')
    if (type.zone.capacity - type.zone.sold - type.zone.held > 0) throw conflict('Todavía hay lugares. Puedes apartar uno.')
    const last = await this.prisma.waitlistEntry.aggregate({ where: { sessionId: input.sessionId }, _max: { position: true } })
    try {
      const entry = await this.prisma.waitlistEntry.create({
        data: {
          sessionId: input.sessionId,
          ticketTypeId: input.ticketTypeId,
          userId,
          position: (last._max.position ?? 0) + 1,
        },
      })
      return { id: entry.id, position: entry.position, status: entry.status }
    } catch {
      const existing = await this.prisma.waitlistEntry.findUnique({
        where: { sessionId_userId_ticketTypeId: { sessionId: input.sessionId, userId, ticketTypeId: input.ticketTypeId } },
      })
      if (!existing) throw conflict('No se pudo entrar a la lista de espera')
      return { id: existing.id, position: existing.position, status: existing.status }
    }
  }

  async myWaitlist(userId: string) {
    const rows = await this.prisma.waitlistEntry.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } })
    return { data: rows }
  }

  async manifestSignature(body: unknown) {
    return signBytes(this.keys.ticketPrivate, new TextEncoder().encode(JSON.stringify(body)))
  }

  private include() {
    return {
      order: { include: { hold: { include: { session: { include: { event: { include: { venue: true } } } } } } } },
    } as const
  }

  private async isManager(userId: string, orgId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (user?.role === 'ADMIN') return true
    const member = await this.prisma.organizationMember.findUnique({ where: { orgId_userId: { orgId, userId } } })
    return member?.role === 'OWNER' || member?.role === 'ORGANIZER'
  }

  }

function presentTicket(ticket: {
  id: string
  serial: string
  status: string
  rev: number
  sessionId: string
  holderId: string
  zoneId: string
  seatId: string | null
  order: { id: string; hold: { session: { startsAt: Date; event: { title: string; slug: string; city: string; venue: { name: string } | null } } } }
}) {
  return {
    id: ticket.id,
    serial: ticket.serial,
    status: ticket.status,
    rev: ticket.rev,
    sessionId: ticket.sessionId,
    holderId: ticket.holderId,
    zoneId: ticket.zoneId,
    seatId: ticket.seatId,
    orderId: ticket.order.id,
    eventTitle: ticket.order.hold.session.event.title,
    eventSlug: ticket.order.hold.session.event.slug,
    city: ticket.order.hold.session.event.city,
    venueName: ticket.order.hold.session.event.venue?.name ?? '',
    startsAt: ticket.order.hold.session.startsAt,
  }
}

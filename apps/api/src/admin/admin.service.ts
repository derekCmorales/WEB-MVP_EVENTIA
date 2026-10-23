import { Injectable } from '@nestjs/common'
import type { AdminEventPatch, AdminOrgPatch, AdminUserPatch } from '@eventia/schemas'
import { PrismaService } from '../infra/prisma.service'
import { AuditService } from '../audit/audit.service'
import { conflict, notFound } from '../common/problem'

const DAY = 24 * 60 * 60 * 1000

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async users() {
    const rows = await this.prisma.user.findMany({ orderBy: { createdAt: 'desc' }, take: 200 })
    return {
      data: rows.map((user) => ({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        suspended: Boolean(user.suspendedAt),
        createdAt: user.createdAt,
      })),
    }
  }

  async patchUser(actorId: string, userId: string, input: AdminUserPatch, ip: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!user) throw notFound('Usuario no encontrado')
    if (user.id === actorId && input.suspended) throw conflict('No puedes suspender tu propia cuenta')
    if (user.id === actorId && input.role && input.role !== 'ADMIN') throw conflict('No puedes quitarte el rol de administración')
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(input.role ? { role: input.role } : {}),
        ...(input.suspended === undefined ? {} : { suspendedAt: input.suspended ? new Date() : null }),
      },
    })
    await this.audit.record({ actorId, action: 'admin_user', targetType: 'user', targetId: userId, ip, metadata: input })
    return { id: updated.id, role: updated.role, suspended: Boolean(updated.suspendedAt) }
  }

  async organizers() {
    const rows = await this.prisma.organization.findMany({
      include: { members: { include: { user: true } }, _count: { select: { events: true } } },
      orderBy: { createdAt: 'desc' },
    })
    return {
      data: rows.map((org) => ({
        id: org.id,
        name: org.name,
        slug: org.slug,
        status: org.status,
        verified: Boolean(org.verifiedAt),
        events: org._count.events,
        owners: org.members.filter((member) => member.role === 'OWNER').map((member) => ({ name: member.user.name, email: member.user.email })),
      })),
    }
  }

  async patchOrganizer(actorId: string, orgId: string, input: AdminOrgPatch, ip: string) {
    const org = await this.prisma.organization.findUnique({ where: { id: orgId } })
    if (!org) throw notFound('Organización no encontrada')
    const updated = await this.prisma.organization.update({
      where: { id: orgId },
      data: {
        ...(input.status ? { status: input.status } : {}),
        ...(input.verified === undefined ? {} : { verifiedAt: input.verified ? new Date() : null }),
      },
    })
    await this.audit.record({ actorId, action: 'admin_org', targetType: 'organization', targetId: orgId, ip, metadata: input })
    return { id: updated.id, status: updated.status, verified: Boolean(updated.verifiedAt) }
  }

  async events() {
    const rows = await this.prisma.event.findMany({
      include: { org: true, sessions: { include: { zones: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
    return {
      data: rows.map((event) => {
        const zones = event.sessions.flatMap((session) => session.zones)
        const capacity = zones.reduce((sum, zone) => sum + zone.capacity, 0)
        const sold = zones.reduce((sum, zone) => sum + zone.sold, 0)
        return {
          id: event.id,
          title: event.title,
          slug: event.slug,
          status: event.status,
          city: event.city,
          orgName: event.org.name,
          orgStatus: event.org.status,
          capacity,
          sold,
        }
      }),
    }
  }

  async patchEvent(actorId: string, eventId: string, input: AdminEventPatch, ip: string) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } })
    if (!event) throw notFound('Evento no encontrado')
    const updated = await this.prisma.event.update({ where: { id: eventId }, data: { status: input.status } })
    await this.audit.record({ actorId, action: 'admin_event', targetType: 'event', targetId: eventId, ip, metadata: input })
    return { id: updated.id, status: updated.status }
  }

  async trail() {
    const rows = await this.prisma.auditLog.findMany({ orderBy: { at: 'desc' }, take: 80, include: { actor: true } })
    return {
      data: rows.map((row) => ({
        id: row.id,
        action: row.action,
        targetType: row.targetType,
        targetId: row.targetId,
        at: row.at,
        actor: row.actor?.email ?? null,
      })),
    }
  }

  async insights() {
    return this.collect()
  }

  async organizerInsights(userId: string) {
    const memberships = await this.prisma.organizationMember.findMany({ where: { userId } })
    const orgIds = memberships.map((item) => item.orgId)
    return this.collect(orgIds)
  }

  private async collect(orgIds?: string[]) {
    const since = new Date(Date.now() - 13 * DAY)
    const eventFilter = orgIds ? { orgId: { in: orgIds } } : {}
    const orderWhere = {
      status: 'PAID' as const,
      createdAt: { gte: since },
      ...(orgIds ? { hold: { session: { event: eventFilter } } } : {}),
    }
    const [orders, refunds, holds, orderCount, tickets, checkins, zones, types, live, waiting] = await Promise.all([
      this.prisma.order.findMany({
        where: orderWhere,
        select: {
          totalCents: true,
          createdAt: true,
          hold: { select: { session: { select: { event: { select: { id: true, title: true } } } } } },
        },
      }),
      this.prisma.refund.aggregate({
        where: orgIds ? { order: { hold: { session: { event: eventFilter } } } } : {},
        _sum: { amountCents: true },
        _count: true,
      }),
      this.prisma.hold.count({ where: orgIds ? { session: { event: eventFilter } } : {} }),
      this.prisma.order.count({ where: orgIds ? { hold: { session: { event: eventFilter } } } : {} }),
      this.prisma.ticket.groupBy({
        by: ['status', 'ticketTypeId'],
        where: orgIds ? { order: { hold: { session: { event: eventFilter } } } } : {},
        _count: true,
      }),
      this.prisma.checkIn.count({
        where: {
          result: 'OK',
          ...(orgIds ? { ticket: { order: { hold: { session: { event: eventFilter } } } } } : {}),
        },
      }),
      this.prisma.zone.findMany({
        where: orgIds ? { session: { event: eventFilter } } : {},
        select: { capacity: true, sold: true, session: { select: { event: { select: { id: true, title: true } } } } },
      }),
      this.prisma.ticketType.findMany({
        where: orgIds ? { session: { event: eventFilter } } : {},
        select: { id: true, name: true },
      }),
      this.prisma.checkIn.findMany({
        where: {
          result: 'OK',
          ...(orgIds ? { ticket: { order: { hold: { session: { event: eventFilter } } } } } : {}),
        },
        orderBy: { at: 'desc' },
        take: 8,
        include: { ticket: { include: { holder: true, order: { include: { hold: { include: { session: { include: { event: true } } } } } } } } },
      }),
      this.prisma.waitlistEntry.findMany({
        where: { status: 'WAITING', ...(orgIds ? { session: { event: eventFilter } } : {}) },
        include: { session: { include: { event: true } } },
      }),
    ])
    const names = new Map(types.map((type) => [type.id, type.name]))
    const byType = new Map<string, { name: string; issued: number; used: number }>()
    let soldTickets = 0
    let usedTickets = 0
    for (const row of tickets) {
      const current = byType.get(row.ticketTypeId) ?? { name: names.get(row.ticketTypeId) ?? 'Boleto', issued: 0, used: 0 }
      if (row.status === 'USED') {
        current.used += row._count
        usedTickets += row._count
        soldTickets += row._count
      } else if (row.status === 'ISSUED') {
        current.issued += row._count
        soldTickets += row._count
      }
      byType.set(row.ticketTypeId, current)
    }
    const days = Array.from({ length: 14 }, (_, index) => {
      const date = new Date(since.getTime() + index * DAY)
      return date.toISOString().slice(0, 10)
    })
    const series = days.map((day) => ({
      day,
      cents: orders.filter((order) => order.createdAt.toISOString().slice(0, 10) === day).reduce((sum, order) => sum + order.totalCents, 0),
    }))
    const revenue = new Map<string, { title: string; cents: number }>()
    for (const order of orders) {
      const event = order.hold.session.event
      const current = revenue.get(event.id) ?? { title: event.title, cents: 0 }
      current.cents += order.totalCents
      revenue.set(event.id, current)
    }
    const capacity = zones.reduce((sum, zone) => sum + zone.capacity, 0)
    const sold = zones.reduce((sum, zone) => sum + zone.sold, 0)
    const top = [...revenue.entries()]
      .map(([id, value]) => {
        const eventZones = zones.filter((zone) => zone.session.event.id === id)
        return {
          id,
          title: value.title,
          cents: value.cents,
          sold: eventZones.reduce((sum, zone) => sum + zone.sold, 0),
          capacity: eventZones.reduce((sum, zone) => sum + zone.capacity, 0),
        }
      })
      .sort((a, b) => b.cents - a.cents)
      .slice(0, 5)
    const waitlist = new Map<string, { title: string; count: number }>()
    for (const entry of waiting) {
      const current = waitlist.get(entry.session.event.id) ?? { title: entry.session.event.title, count: 0 }
      current.count += 1
      waitlist.set(entry.session.event.id, current)
    }
    const paid = orders.length
    return {
      salesCents: orders.reduce((sum, order) => sum + order.totalCents, 0),
      ticketsSold: soldTickets,
      refundCents: refunds._sum.amountCents ?? 0,
      refunds: refunds._count,
      checkInRate: soldTickets ? Math.round((checkins / soldTickets) * 100) : 0,
      utilization: capacity ? Math.round((sold / capacity) * 100) : 0,
      funnel: { holds, orders: orderCount, paid, checkins },
      series,
      ticketTypes: [...byType.values()],
      topEvents: top,
      live: live.map((row) => ({
        at: row.at,
        holderName: row.ticket.holder.name,
        eventTitle: row.ticket.order.hold.session.event.title,
        serial: row.ticket.serial,
      })),
      waitlist: [...waitlist.values()],
    }
  }
}

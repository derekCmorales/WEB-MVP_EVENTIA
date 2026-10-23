import { Injectable } from '@nestjs/common'
import type { CreateEventInput, InviteStaffInput, ListEventsQuery, PatchEventInput } from '@eventia/schemas'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../infra/prisma.service'
import { AuditService } from '../audit/audit.service'
import { plainText } from '../infra/text'
import { slugify } from '../domain/slug'
import { availableOf } from '../domain/capacity'
import { conflict, forbidden, notFound } from '../common/problem'

const eventInclude = {
  org: true,
  venue: true,
  sessions: { include: { zones: true, ticketTypes: true }, orderBy: { startsAt: 'asc' as const } },
} satisfies Prisma.EventInclude

@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListEventsQuery) {
    const where: Prisma.EventWhereInput = {
      status: 'PUBLISHED',
      ...(query.city ? { city: { equals: query.city, mode: 'insensitive' } } : {}),
      ...(query.q
        ? {
          OR: [
            { title: { contains: query.q, mode: 'insensitive' } },
            { city: { contains: query.q, mode: 'insensitive' } },
            { description: { contains: query.q, mode: 'insensitive' } },
          ],
        }
        : {}),
      ...(query.from || query.to
        ? {
          sessions: {
            some: {
              ...(query.from ? { startsAt: { gte: new Date(query.from) } } : {}),
              ...(query.to ? { startsAt: { lte: new Date(query.to) } } : {}),
            },
          },
        }
        : {}),
    }
    const [total, rows] = await Promise.all([
      this.prisma.event.count({ where }),
      this.prisma.event.findMany({
        where,
        include: eventInclude,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ])
    return { data: rows.map(presentEvent), page: query.page, limit: query.limit, total }
  }

  async getPublic(idOrSlug: string) {
    const event = await this.prisma.event.findFirst({
      where: { status: 'PUBLISHED', OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
      include: eventInclude,
    })
    if (!event) throw notFound('Evento no encontrado')
    return presentEvent(event)
  }

  async create(userId: string, input: CreateEventInput, ip: string) {
    if (new Date(input.endsAt) <= new Date(input.startsAt)) throw conflict('La hora de fin debe ser posterior al inicio')
    if (input.kind === 'SEATED') {
      const seats = input.seats ?? []
      if (seats.length !== input.capacity) throw conflict('En zona con asientos, el cupo debe coincidir con los asientos')
    }
    const description = plainText(input.description)
    const event = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId } })
      let membership = await tx.organizationMember.findFirst({
        where: { userId, role: { in: ['OWNER', 'ORGANIZER'] } },
        include: { org: true },
      })
      if (!membership) {
        const org = await tx.organization.create({
          data: { name: `Eventos de ${user.name}`, slug: await uniqueOrgSlug(tx, slugify(user.name)) },
        })
        membership = await tx.organizationMember.create({
          data: { orgId: org.id, userId, role: 'OWNER' },
          include: { org: true },
        })
        if (user.role === 'ATTENDEE') await tx.user.update({ where: { id: userId }, data: { role: 'ORGANIZER' } })
      }
      const venue = await tx.venue.create({
        data: {
          orgId: membership.orgId,
          name: plainText(input.venueName),
          city: plainText(input.city),
          address: plainText(input.address),
        },
      })
      const created = await tx.event.create({
        data: {
          orgId: membership.orgId,
          venueId: venue.id,
          title: plainText(input.title),
          slug: await uniqueEventSlug(tx, slugify(input.title)),
          summary: plainText(input.summary),
          description,
          city: plainText(input.city),
          refundPolicy: input.refundPolicy,
          status: input.publish ? 'PUBLISHED' : 'DRAFT',
          createdById: userId,
        },
      })
      const session = await tx.session.create({
        data: {
          eventId: created.id,
          startsAt: new Date(input.startsAt),
          endsAt: new Date(input.endsAt),
          salesOpenAt: new Date(),
          queueEnabled: input.queueEnabled,
          status: 'ON_SALE',
        },
      })
      const zone = await tx.zone.create({
        data: {
          sessionId: session.id,
          name: plainText(input.zoneName),
          kind: input.kind,
          capacity: input.capacity,
        },
      })
      if (input.kind === 'SEATED') {
        await tx.seat.createMany({
          data: (input.seats ?? []).map((seat) => ({
            zoneId: zone.id,
            sessionId: session.id,
            row: seat.row,
            number: seat.number,
            accessible: seat.accessible,
          })),
        })
      }
      await tx.ticketType.create({
        data: {
          sessionId: session.id,
          zoneId: zone.id,
          name: plainText(input.ticketName),
          priceCents: input.priceCents,
          feeCents: input.feeCents,
          currency: input.currency.toUpperCase(),
          perOrderLimit: Math.min(6, input.capacity),
          perUserLimit: Math.min(6, input.capacity),
        },
      })
      return tx.event.findUniqueOrThrow({ where: { id: created.id }, include: eventInclude })
    })
    await this.audit.record({ actorId: userId, action: 'event_create', targetType: 'event', targetId: event.id, ip })
    return presentEvent(event)
  }

  async update(userId: string, eventId: string, input: PatchEventInput, ip: string) {
    const event = await this.requireManager(userId, eventId)
    if (input.capacity !== undefined) {
      const zones = event.sessions.flatMap((session) => session.zones)
      for (const zone of zones) {
        if (input.capacity < zone.sold + zone.held) {
          throw conflict('El cupo no puede ser menor que los boletos ya apartados o vendidos')
        }
      }
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      if (input.capacity !== undefined) {
        await tx.zone.updateMany({ where: { session: { eventId } }, data: { capacity: input.capacity } })
      }
      return tx.event.update({
        where: { id: eventId },
        data: {
          title: input.title ? plainText(input.title) : undefined,
          summary: input.summary ? plainText(input.summary) : undefined,
          description: input.description ? plainText(input.description) : undefined,
          city: input.city ? plainText(input.city) : undefined,
          refundPolicy: input.refundPolicy,
        },
        include: eventInclude,
      })
    })
    await this.audit.record({ actorId: userId, action: 'event_update', targetType: 'event', targetId: eventId, ip })
    return presentEvent(updated)
  }

  async remove(userId: string, eventId: string, ip: string) {
    await this.requireManager(userId, eventId)
    const sold = await this.prisma.zone.aggregate({ where: { session: { eventId } }, _sum: { sold: true } })
    if ((sold._sum.sold ?? 0) > 0) throw conflict('No se puede eliminar porque ya tiene boletos vendidos')
    await this.prisma.event.delete({ where: { id: eventId } })
    await this.audit.record({ actorId: userId, action: 'event_delete', targetType: 'event', targetId: eventId, ip })
    return { id: eventId }
  }

  async overview(userId: string) {
    const events = await this.eventsFor(userId)
    return {
      events: events.map((event) => {
        const zones = event.sessions.flatMap((session) => session.zones)
        const capacity = zones.reduce((sum, zone) => sum + zone.capacity, 0)
        const sold = zones.reduce((sum, zone) => sum + zone.sold, 0)
        const held = zones.reduce((sum, zone) => sum + zone.held, 0)
        return {
          id: event.id,
          slug: event.slug,
          title: event.title,
          status: event.status,
          city: event.city,
          capacity,
          sold,
          held,
          available: availableOf(sold, held, capacity),
          startsAt: event.sessions[0]?.startsAt ?? null,
        }
      }),
    }
  }

  async mine(userId: string) {
    const events = await this.eventsFor(userId)
    return { data: events.map(presentEvent) }
  }

  async attendees(userId: string, eventId: string) {
    await this.requireStaff(userId, eventId)
    const tickets = await this.prisma.ticket.findMany({
      where: { order: { hold: { session: { eventId } } } },
      include: { holder: true, checkIns: { where: { result: 'OK' }, take: 1 } },
      orderBy: { createdAt: 'asc' },
    })
    return {
      data: tickets.map((ticket) => ({
        ticketId: ticket.id,
        serial: ticket.serial,
        status: ticket.status,
        rev: ticket.rev,
        holderName: ticket.holder.name,
        holderEmail: ticket.holder.email,
        checkedInAt: ticket.checkIns[0]?.at ?? null,
      })),
    }
  }

  async inviteStaff(userId: string, eventId: string, input: InviteStaffInput, ip: string) {
    const event = await this.requireManager(userId, eventId)
    const account = await this.prisma.user.findUnique({ where: { email: input.email } })
    if (!account) throw notFound('No hay una cuenta con ese correo')
    await this.prisma.organizationMember.upsert({
      where: { orgId_userId: { orgId: event.orgId, userId: account.id } },
      update: { role: 'STAFF' },
      create: { orgId: event.orgId, userId: account.id, role: 'STAFF' },
    })
    if (account.role === 'ATTENDEE') {
      await this.prisma.user.update({ where: { id: account.id }, data: { role: 'STAFF' } })
    }
    await this.audit.record({ actorId: userId, action: 'staff_invite', targetType: 'event', targetId: eventId, ip, metadata: { email: input.email } })
    return { email: account.email, role: 'STAFF' }
  }

  async orgAudit(userId: string) {
    const memberships = await this.prisma.organizationMember.findMany({ where: { userId } })
    const events = await this.prisma.event.findMany({ where: { orgId: { in: memberships.map((item) => item.orgId) } }, select: { id: true } })
    const ids = events.map((event) => event.id)
    const rows = await this.prisma.auditLog.findMany({
      where: { OR: [{ actorId: userId }, { targetId: { in: ids } }] },
      orderBy: { at: 'desc' },
      take: 100,
    })
    return { data: rows.map(({ hash, prevHash, ...row }) => row) }
  }

  private async eventsFor(userId: string) {
    const memberships = await this.prisma.organizationMember.findMany({ where: { userId, role: { in: ['OWNER', 'ORGANIZER', 'STAFF'] } } })
    return this.prisma.event.findMany({
      where: { orgId: { in: memberships.map((item) => item.orgId) } },
      include: eventInclude,
      orderBy: { createdAt: 'desc' },
    })
  }

  private async requireManager(userId: string, eventId: string) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId }, include: { ...eventInclude, org: { include: { members: true } } } })
    if (!event) throw notFound('Evento no encontrado')
    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    const member = event.org.members.find((item) => item.userId === userId && (item.role === 'OWNER' || item.role === 'ORGANIZER'))
    if (user?.role !== 'ADMIN' && !member) throw forbidden('Solo quien publicó el evento puede modificarlo')
    return event
  }

  private async requireStaff(userId: string, eventId: string) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId }, include: { org: { include: { members: true } } } })
    if (!event) throw notFound('Evento no encontrado')
    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    const member = event.org.members.find((item) => item.userId === userId)
    if (user?.role === 'ADMIN' || member) return event
    throw forbidden('No tienes permiso para ver los asistentes de este evento', 'bfla')
  }
}

function presentEvent(event: Prisma.EventGetPayload<{ include: typeof eventInclude }>) {
  return {
    id: event.id,
    slug: event.slug,
    title: event.title,
    summary: event.summary,
    description: event.description,
    city: event.city,
    venueName: event.venue?.name ?? event.city,
    address: event.venue?.address ?? '',
    coverHue: event.coverHue,
    status: event.status,
    refundPolicy: event.refundPolicy,
    organizerName: event.org.name,
    orgId: event.orgId,
    sessions: event.sessions.map((session) => ({
      id: session.id,
      startsAt: session.startsAt,
      endsAt: session.endsAt,
      salesOpenAt: session.salesOpenAt,
      salesCloseAt: session.salesCloseAt,
      queueEnabled: session.queueEnabled,
      status: session.status,
      zones: session.zones.map((zone) => ({
        id: zone.id,
        name: zone.name,
        kind: zone.kind,
        capacity: zone.capacity,
        sold: zone.sold,
        held: zone.held,
        available: availableOf(zone.sold, zone.held, zone.capacity),
      })),
      ticketTypes: session.ticketTypes.map((type) => {
        const zone = session.zones.find((item) => item.id === type.zoneId)
        return {
          id: type.id,
          name: type.name,
          zoneId: type.zoneId,
          priceCents: type.priceCents,
          feeCents: type.feeCents,
          currency: type.currency,
          perOrderLimit: type.perOrderLimit,
          perUserLimit: type.perUserLimit,
          available: zone ? availableOf(zone.sold, zone.held, zone.capacity) : 0,
        }
      }),
    })),
  }
}

async function uniqueEventSlug(tx: Prisma.TransactionClient, base: string) {
  let slug = base
  let n = 1
  while (await tx.event.findUnique({ where: { slug } })) slug = `${base}-${n++}`
  return slug
}

async function uniqueOrgSlug(tx: Prisma.TransactionClient, base: string) {
  let slug = base
  let n = 1
  while (await tx.organization.findUnique({ where: { slug } })) slug = `${base}-${n++}`
  return slug
}

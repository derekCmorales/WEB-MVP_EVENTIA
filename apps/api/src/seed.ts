import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import * as argon2 from 'argon2'

const prisma = new PrismaClient()
const ARGON: argon2.Options = { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 }

async function main() {
  if (process.env.NODE_ENV === 'production') {
    if (process.env.SEED_ON_BOOT !== 'true') throw new Error('La semilla no se ejecuta en producción')
    if (!process.env.EVENTIA_DEMO_PASSWORD) throw new Error('Falta EVENTIA_DEMO_PASSWORD para la semilla en producción')
  }
  const password = process.env.EVENTIA_DEMO_PASSWORD || 'demo1234'
  const passwordHash = await argon2.hash(password, ARGON)

  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "AuditLog", "OutboxEvent", "CheckIn", "Transfer", "Refund", "WaitlistEntry",
      "Ticket", "Order", "HoldItem", "Hold", "QueueEntry", "Seat", "TicketType",
      "Zone", "Session", "Event", "Venue", "OrganizationMember", "Organization",
      "RefreshToken", "User"
    RESTART IDENTITY CASCADE
  `)

  await prisma.user.createMany({
    data: [
      { id: 'usr_ana', email: 'ana@eventia.dev', name: 'Ana López', passwordHash, role: 'ORGANIZER' },
      { id: 'usr_luis', email: 'luis@eventia.dev', name: 'Luis García', passwordHash, role: 'ORGANIZER' },
      { id: 'usr_staff', email: 'staff@eventia.dev', name: 'Sofía Ramos', passwordHash, role: 'STAFF' },
      { id: 'usr_maya', email: 'maya@eventia.dev', name: 'Maya Chen', passwordHash, role: 'ATTENDEE' },
      { id: 'usr_admin', email: 'admin@eventia.dev', name: 'Diego Admin', passwordHash, role: 'ADMIN' },
      { id: 'usr_nora', email: 'nora@eventia.dev', name: 'Nora Díaz', passwordHash, role: 'ORGANIZER' },
    ],
  })

  await prisma.organization.createMany({
    data: [
      { id: 'org_ana', name: 'Estudio Ana', slug: 'estudio-ana' },
      { id: 'org_luis', name: 'Barrio de Luis', slug: 'barrio-de-luis' },
      { id: 'org_nora', name: 'Sala Nora', slug: 'sala-nora', status: 'PENDING' },
    ],
  })
  await prisma.organization.update({ where: { id: 'org_ana' }, data: { verifiedAt: new Date('2026-01-15T00:00:00.000Z') } })
  await prisma.organization.update({ where: { id: 'org_luis' }, data: { verifiedAt: new Date('2026-02-02T00:00:00.000Z') } })
  await prisma.organizationMember.createMany({
    data: [
      { orgId: 'org_ana', userId: 'usr_ana', role: 'OWNER' },
      { orgId: 'org_ana', userId: 'usr_admin', role: 'OWNER' },
      { orgId: 'org_luis', userId: 'usr_luis', role: 'OWNER' },
      { orgId: 'org_ana', userId: 'usr_staff', role: 'STAFF' },
      { orgId: 'org_luis', userId: 'usr_staff', role: 'STAFF' },
      { orgId: 'org_nora', userId: 'usr_nora', role: 'OWNER' },
    ],
  })

  await prisma.venue.createMany({
    data: [
      { id: 'ven_cultural', orgId: 'org_ana', name: 'Centro cultural del barrio', city: 'Guatemala', address: '6a avenida 12-40' },
      { id: 'ven_jardin', orgId: 'org_luis', name: 'Jardín central', city: 'Antigua', address: 'Parque central' },
      { id: 'ven_kiosco', orgId: 'org_luis', name: 'Kiosco principal', city: 'Guatemala', address: 'Kiosco del parque' },
    ],
  })

  await prisma.event.createMany({
    data: [
      {
        id: 'evt_taller', orgId: 'org_ana', venueId: 'ven_cultural', createdById: 'usr_ana',
        title: 'Taller de fotografía nocturna', slug: 'taller-de-fotografia-nocturna',
        summary: 'Recorrido corto para practicar luz y encuadre.',
        description: 'No necesitas cámara profesional. El cupo es real y el precio que ves es el final.',
        city: 'Guatemala', coverHue: '#2F4BFF', status: 'PUBLISHED', refundPolicy: 'MODERATE',
      },
      {
        id: 'evt_cine', orgId: 'org_luis', venueId: 'ven_jardin', createdById: 'usr_luis',
        title: 'Cine al aire libre', slug: 'cine-al-aire-libre',
        summary: 'Cortos locales al anochecer. Queda poco cupo a propósito.',
        description: 'Lleva una manta. El jardín cierra el cupo en cuanto se llena.',
        city: 'Antigua', coverHue: '#FFB27A', status: 'PUBLISHED', refundPolicy: 'FLEXIBLE',
      },
      {
        id: 'evt_bici', orgId: 'org_luis', venueId: 'ven_kiosco', createdById: 'usr_luis',
        title: 'Ruta en bicicleta por el centro', slug: 'ruta-en-bicicleta',
        summary: 'Paseo tranquilo con una parada para desayunar.',
        description: 'El punto de encuentro es el kiosco principal. Es gratis.',
        city: 'Guatemala', coverHue: '#1C1917', status: 'PUBLISHED', refundPolicy: 'FLEXIBLE',
      },
      {
        id: 'evt_cola', orgId: 'org_ana', venueId: 'ven_jardin', createdById: 'usr_ana',
        title: 'Concierto en el jardín', slug: 'concierto-en-el-jardin',
        summary: 'La venta abre con una fila justa, no gana quien hace más clics.',
        description: 'Antes de abrir, cada cuenta recibe una posición al azar.',
        city: 'Antigua', coverHue: '#2F4BFF', status: 'PUBLISHED', refundPolicy: 'STRICT',
      },
    ],
  })

  await prisma.session.createMany({
    data: [
      { id: 'ses_taller', eventId: 'evt_taller', startsAt: new Date('2026-11-14T15:00:00.000Z'), endsAt: new Date('2026-11-14T18:00:00.000Z'), salesOpenAt: new Date('2026-10-01T00:00:00.000Z'), status: 'ON_SALE' },
      { id: 'ses_cine', eventId: 'evt_cine', startsAt: new Date('2026-11-21T01:00:00.000Z'), endsAt: new Date('2026-11-21T03:00:00.000Z'), salesOpenAt: new Date('2026-10-01T00:00:00.000Z'), status: 'ON_SALE' },
      { id: 'ses_bici', eventId: 'evt_bici', startsAt: new Date('2026-12-06T14:00:00.000Z'), endsAt: new Date('2026-12-06T17:00:00.000Z'), salesOpenAt: new Date('2026-10-01T00:00:00.000Z'), status: 'ON_SALE' },
      { id: 'ses_cola', eventId: 'evt_cola', startsAt: new Date('2026-12-12T02:00:00.000Z'), endsAt: new Date('2026-12-12T05:00:00.000Z'), salesOpenAt: new Date('2026-12-01T15:00:00.000Z'), status: 'ON_SALE', queueEnabled: true },
    ],
  })

  await prisma.zone.createMany({
    data: [
      { id: 'zon_taller', sessionId: 'ses_taller', name: 'General', kind: 'GA', capacity: 12, sold: 0, held: 0 },
      { id: 'zon_cine', sessionId: 'ses_cine', name: 'Jardín', kind: 'GA', capacity: 2, sold: 1, held: 0 },
      { id: 'zon_bici', sessionId: 'ses_bici', name: 'Grupo', kind: 'GA', capacity: 15, sold: 0, held: 0 },
      { id: 'zon_cola', sessionId: 'ses_cola', name: 'Pista', kind: 'GA', capacity: 100, sold: 0, held: 0 },
    ],
  })

  await prisma.ticketType.createMany({
    data: [
      { id: 'tt_taller', sessionId: 'ses_taller', zoneId: 'zon_taller', name: 'General', priceCents: 7500, feeCents: 500, currency: 'USD', perOrderLimit: 4, perUserLimit: 4 },
      { id: 'tt_cine', sessionId: 'ses_cine', zoneId: 'zon_cine', name: 'Manta', priceCents: 4000, feeCents: 0, currency: 'USD', perOrderLimit: 2, perUserLimit: 2 },
      { id: 'tt_bici', sessionId: 'ses_bici', zoneId: 'zon_bici', name: 'Pase libre', priceCents: 0, feeCents: 0, currency: 'USD', perOrderLimit: 2, perUserLimit: 2 },
      { id: 'tt_cola', sessionId: 'ses_cola', zoneId: 'zon_cola', name: 'Pista', priceCents: 12000, feeCents: 1500, currency: 'USD', perOrderLimit: 4, perUserLimit: 4 },
    ],
  })

  await prisma.hold.create({
    data: {
      id: 'hold_maya_cine',
      userId: 'usr_maya',
      sessionId: 'ses_cine',
      status: 'CONVERTED',
      expiresAt: new Date('2026-10-20T00:00:00.000Z'),
      idempotencyKey: 'seed-maya-cine',
      requestHash: 'seed',
      items: { create: [{ ticketTypeId: 'tt_cine', zoneId: 'zon_cine', quantity: 1 }] },
    },
  })
  await prisma.order.create({
    data: {
      id: 'ord_maya_cine',
      userId: 'usr_maya',
      holdId: 'hold_maya_cine',
      status: 'PAID',
      totalCents: 4000,
      currency: 'USD',
      idempotencyKey: 'seed-maya-cine',
      requestHash: 'seed',
      pspProvider: 'fake',
      pspRef: 'seed',
      tickets: {
        create: [{
          id: 'tck_maya_cine',
          holderId: 'usr_maya',
          sessionId: 'ses_cine',
          ticketTypeId: 'tt_cine',
          zoneId: 'zon_cine',
          serial: 'EI-CINE-0001',
          kid: 'eventia-dev-1',
        }],
      },
    },
  })

  console.log(JSON.stringify({ msg: 'seed ok', passwordFrom: 'EVENTIA_DEMO_PASSWORD' }))
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

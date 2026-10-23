import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import * as argon2 from 'argon2'
import { verifyTicket } from '../../../../packages/qr/src/index'
import { authed, createTestApp, csrfOf, eventBody, register, resetDb } from './app'
import { InventoryService } from '../../src/inventory/inventory.service'
import { KeysService } from '../../src/infra/keys.service'
import { PrismaService } from '../../src/infra/prisma.service'
import type { INestApplication } from '@nestjs/common'

describe('plataforma', () => {
  let app: INestApplication

  beforeAll(async () => {
    app = await createTestApp()
  })

  beforeEach(async () => {
    await resetDb(app)
  })

  afterAll(async () => {
    await app.close()
  })

  it('recorre apartar, pagar, transferir, reembolsar y rechaza el acceso ajeno', async () => {
    const csrf = await csrfOf(app)
    const ana = await register(app, csrf, 'ana.flow@eventia.dev', 'Ana')
    const luis = await register(app, csrf, 'luis.flow@eventia.dev', 'Luis')
    const sofia = await register(app, csrf, 'sofia.flow@eventia.dev', 'Sofía')
    const anaApi = authed(app, ana.accessToken, csrf.token, csrf.cookie)
    const luisApi = authed(app, luis.accessToken, csrf.token, csrf.cookie)

    const created = await anaApi.post('/v1/organizer/events').send(eventBody({ capacity: 8, refundPolicy: 'FLEXIBLE' }))
    expect(created.status).toBe(201)
    const eventId = created.body.id as string
    const session = created.body.sessions[0]
    const ticketTypeId = session.ticketTypes[0].id as string

    const patch = await luisApi.patch(`/v1/organizer/events/${eventId}`).send({ title: 'Intento de cambio ajeno' })
    expect(patch.status).toBe(403)
    expect(patch.body.detail).toMatch(/publicó/)
    const still = await anaApi.get(`/v1/events/${created.body.slug}`)
    expect(still.body.title).toBe('Noche de jazz')

    const removed = await luisApi.delete(`/v1/organizer/events/${eventId}`)
    expect(removed.status).toBe(403)

    const spoof = await luisApi.get('/v1/tickets/mine?userId=usr_ana')
    expect(spoof.status).toBe(403)
    expect(spoof.body.detail).toMatch(/otro usuario/)

    const hold = await luisApi.post('/v1/holds').set('idempotency-key', 'hold-luis-1').send({
      sessionId: session.id,
      items: [{ ticketTypeId, quantity: 1 }],
    })
    expect(hold.status).toBe(201)
    const replay = await luisApi.post('/v1/holds').set('idempotency-key', 'hold-luis-1').send({
      sessionId: session.id,
      items: [{ ticketTypeId, quantity: 1 }],
    })
    expect(replay.body.id).toBe(hold.body.id)
    const clash = await luisApi.post('/v1/holds').set('idempotency-key', 'hold-luis-1').send({
      sessionId: session.id,
      items: [{ ticketTypeId, quantity: 2 }],
    })
    expect(clash.status).toBe(409)

    const order = await luisApi.post('/v1/orders').set('idempotency-key', 'order-luis-1').send({ holdId: hold.body.id })
    expect(order.status).toBe(201)
    expect(order.body.totalCents).toBe(2500)
    const paid = await luisApi.post(`/v1/orders/${order.body.id}/pay`).send({})
    expect(paid.status).toBe(201)
    expect(paid.body.status).toBe('PAID')

    const wallet = await luisApi.get('/v1/tickets/mine')
    expect(wallet.body.data).toHaveLength(1)
    const ticketId = wallet.body.data[0].id as string
    const hidden = await anaApi.get(`/v1/tickets/${ticketId}`)
    expect(hidden.status).toBe(404)

    const qr = await luisApi.get(`/v1/tickets/${ticketId}/qr`)
    expect(qr.status).toBe(200)
    const keys = app.get(KeysService)
    const verified = await verifyTicket(keys.ticketPublicRaw, qr.body.token)
    expect(verified.ok).toBe(true)

    const stranger = await luisApi.post('/v1/checkin').send({ token: qr.body.token, deviceId: 'door-1' })
    expect(stranger.status).toBe(403)

    const maya = await register(app, csrf, 'maya.flow@eventia.dev', 'Maya')
    const transfer = await luisApi.post(`/v1/tickets/${ticketId}/transfer`).send({ toEmail: 'maya.flow@eventia.dev' })
    expect(transfer.status).toBe(201)
    const accepted = await authed(app, maya.accessToken, csrf.token, csrf.cookie).post(`/v1/transfers/${transfer.body.id}/accept`).send({})
    expect(accepted.status).toBe(201)
    expect(accepted.body.rev).toBe(2)
    expect(accepted.body.holderId).toBe(maya.user.id)

    const invited = await anaApi.post(`/v1/organizer/events/${eventId}/staff`).send({ email: sofia.user.email })
    expect(invited.status).toBe(201)
    const sofiaApi = authed(app, sofia.accessToken, csrf.token, csrf.cookie)
    const revoked = await sofiaApi.post('/v1/checkin').send({ token: qr.body.token, deviceId: 'door-1' })
    expect(revoked.body.result).toBe('REVOKED')
    const freshQr = await authed(app, maya.accessToken, csrf.token, csrf.cookie).get(`/v1/tickets/${ticketId}/qr`)
    const first = await sofiaApi.post('/v1/checkin').send({ token: freshQr.body.token, deviceId: 'door-1' })
    expect(first.body.result).toBe('OK')
    const second = await sofiaApi.post('/v1/checkin').send({ token: freshQr.body.token, deviceId: 'door-2' })
    expect(second.body.result).toBe('DUPLICATE')

    const anaHold = await anaApi.post('/v1/holds').set('idempotency-key', 'hold-ana-2').send({
      sessionId: session.id,
      items: [{ ticketTypeId, quantity: 1 }],
    })
    const anaOrder = await anaApi.post('/v1/orders').set('idempotency-key', 'order-ana-2').send({ holdId: anaHold.body.id })
    const anaPaid = await anaApi.post(`/v1/orders/${anaOrder.body.id}/pay`).send({})
    expect(anaPaid.body.status).toBe('PAID')
    const refund = await anaApi.post(`/v1/orders/${anaOrder.body.id}/refund`).send({ reason: 'No podré asistir' })
    expect(refund.status).toBe(201)
    expect(refund.body.amountCents).toBe(2500)
  })

  it('libera el apartado al expirar y no sobrevende bajo concurrencia', async () => {
    const csrf = await csrfOf(app)
    const ana = await register(app, csrf, 'ana.race@eventia.dev', 'Ana')
    const anaApi = authed(app, ana.accessToken, csrf.token, csrf.cookie)
    const created = await anaApi.post('/v1/organizer/events').send(eventBody({ capacity: 5, title: 'Cupo justo' }))
    const session = created.body.sessions[0]
    const ticketTypeId = session.ticketTypes[0].id as string
    const zoneId = session.zones[0].id as string

    const hold = await anaApi.post('/v1/holds').set('idempotency-key', 'hold-expire').send({
      sessionId: session.id,
      items: [{ ticketTypeId, quantity: 2 }],
    })
    expect(hold.status).toBe(201)
    const prisma = app.get(PrismaService)
    await prisma.hold.update({ where: { id: hold.body.id }, data: { expiresAt: new Date(Date.now() - 1000) } })
    const released = await app.get(InventoryService).sweep()
    expect(released).toBe(1)
    const zone = await prisma.zone.findUniqueOrThrow({ where: { id: zoneId } })
    expect(zone.held).toBe(0)
    expect(zone.sold).toBe(0)

    const hash = await argon2.hash('demo1234', { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 })
    const buyers = Array.from({ length: 25 }, (_, index) => ({
      id: `buyer_${index}`,
      email: `buyer${index}@eventia.dev`,
      name: `Buyer ${index}`,
      passwordHash: hash,
      role: 'ATTENDEE' as const,
    }))
    await prisma.user.createMany({ data: buyers })
    const keys = app.get(KeysService)
    const results = await Promise.all(buyers.map(async (buyer) => {
      const token = await keys.signAccess(buyer)
      return authed(app, token, csrf.token, csrf.cookie)
        .post('/v1/holds')
        .set('idempotency-key', `race-${buyer.id}`)
        .send({ sessionId: session.id, items: [{ ticketTypeId, quantity: 1 }] })
    }))
    const won = results.filter((response) => response.status === 201)
    expect(won).toHaveLength(5)
    const after = await prisma.zone.findUniqueOrThrow({ where: { id: zoneId } })
    expect(after.sold + after.held).toBeLessThanOrEqual(after.capacity)
    expect(after.held).toBe(5)

    await Promise.all(won.map((response, index) => {
      const buyer = buyers[results.indexOf(response)]
      return keys.signAccess(buyer).then((token) => authed(app, token, csrf.token, csrf.cookie)
        .post('/v1/orders')
        .set('idempotency-key', `ord-${buyer.id}`)
        .send({ holdId: response.body.id })
        .then((order) => authed(app, token, csrf.token, csrf.cookie).post(`/v1/orders/${order.body.id}/pay`).send({})))
    }))
    const finalZone = await prisma.zone.findUniqueOrThrow({ where: { id: zoneId } })
    const tickets = await prisma.ticket.count({ where: { sessionId: session.id } })
    expect(finalZone.sold).toBe(5)
    expect(finalZone.held).toBe(0)
    expect(tickets).toBe(5)
    expect(finalZone.sold + finalZone.held).toBeLessThanOrEqual(finalZone.capacity)
  })

  it('da un solo asiento cuando dos personas lo piden a la vez', async () => {
    const csrf = await csrfOf(app)
    const ana = await register(app, csrf, 'ana.seat@eventia.dev', 'Ana')
    const anaApi = authed(app, ana.accessToken, csrf.token, csrf.cookie)
    const created = await anaApi.post('/v1/organizer/events').send(eventBody({
      kind: 'SEATED',
      capacity: 1,
      title: 'Butaca única',
      seats: [{ row: 'A', number: 1, accessible: true }],
    }))
    expect(created.status).toBe(201)
    const prisma = app.get(PrismaService)
    const seat = await prisma.seat.findFirstOrThrow({ where: { zoneId: created.body.sessions[0].zones[0].id } })
    const hash = await argon2.hash('demo1234', { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 })
    await prisma.user.createMany({
      data: [1, 2].map((n) => ({ id: `seat_${n}`, email: `seat${n}@eventia.dev`, name: `Seat ${n}`, passwordHash: hash })),
    })
    const keys = app.get(KeysService)
    const responses = await Promise.all([1, 2].map(async (n) => {
      const token = await keys.signAccess({ id: `seat_${n}`, email: `seat${n}@eventia.dev`, role: 'ATTENDEE' })
      return authed(app, token, csrf.token, csrf.cookie)
        .post('/v1/holds')
        .set('idempotency-key', `seat-key-${n}`)
        .send({
          sessionId: created.body.sessions[0].id,
          items: [{ ticketTypeId: created.body.sessions[0].ticketTypes[0].id, quantity: 1, seatIds: [seat.id] }],
        })
    }))
    expect(responses.filter((response) => response.status === 201)).toHaveLength(1)
    const zone = await prisma.zone.findUniqueOrThrow({ where: { id: created.body.sessions[0].zones[0].id } })
    expect(zone.held).toBe(1)
    expect(zone.sold + zone.held).toBeLessThanOrEqual(zone.capacity)
  })

  it('rota el refresh y revoca la familia si se reutiliza', async () => {
    const csrf = await csrfOf(app)
    const server = app.getHttpServer()
    const login = await request(server)
      .post('/v1/auth/register')
      .set('x-csrf-token', csrf.token)
      .set('cookie', csrf.cookie)
      .set('origin', 'http://localhost:4321')
      .send({ name: 'Nia', email: 'nia@eventia.dev', password: 'demo1234' })
    const refreshCookie = (login.headers['set-cookie'] as unknown as string[]).find((item) => item.startsWith('eventia_refresh='))!.split(';')[0]
    const rotated = await request(server)
      .post('/v1/auth/refresh')
      .set('x-csrf-token', csrf.token)
      .set('cookie', `${csrf.cookie}; ${refreshCookie}`)
      .set('origin', 'http://localhost:4321')
    expect(rotated.status).toBe(201)
    const reused = await request(server)
      .post('/v1/auth/refresh')
      .set('x-csrf-token', csrf.token)
      .set('cookie', `${csrf.cookie}; ${refreshCookie}`)
      .set('origin', 'http://localhost:4321')
    expect(reused.status).toBe(401)
    expect(reused.body.detail).toMatch(/reutilización/)
    const nextCookie = (rotated.headers['set-cookie'] as unknown as string[]).find((item) => item.startsWith('eventia_refresh='))!.split(';')[0]
    const afterReuse = await request(server)
      .post('/v1/auth/refresh')
      .set('x-csrf-token', csrf.token)
      .set('cookie', `${csrf.cookie}; ${nextCookie}`)
      .set('origin', 'http://localhost:4321')
    expect(afterReuse.status).toBe(401)
  })
})

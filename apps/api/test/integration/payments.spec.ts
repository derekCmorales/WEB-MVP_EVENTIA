import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import Stripe from 'stripe'
import request from 'supertest'
import { authed, createTestApp, csrfOf, eventBody, register, resetDb } from './app'
import type { INestApplication } from '@nestjs/common'

describe('stripe', () => {
  let app: INestApplication

  beforeAll(async () => {
    process.env.PAYMENTS_SPEC = 'stripe'
    app = await createTestApp()
  })

  afterAll(async () => {
    delete process.env.PAYMENTS_SPEC
    await app.close()
  })

  it('verifica la firma del webhook y emite el boleto una sola vez', async () => {
    await resetDb(app)
    const csrf = await csrfOf(app)
    const ana = await register(app, csrf, 'ana.pay@eventia.dev', 'Ana')
    const api = authed(app, ana.accessToken, csrf.token, csrf.cookie)
    const created = await api.post('/v1/organizer/events').send(eventBody({ priceCents: 2500 }))
    const session = created.body.sessions[0]
    const hold = await api.post('/v1/holds').set('idempotency-key', 'pay-hold').send({
      sessionId: session.id,
      items: [{ ticketTypeId: session.ticketTypes[0].id, quantity: 1 }],
    })
    const order = await api.post('/v1/orders').set('idempotency-key', 'pay-order').send({ holdId: hold.body.id })
    const pending = await api.post(`/v1/orders/${order.body.id}/pay`).send({})
    expect(pending.body.mode).toBe('stripe')
    expect(pending.body.status).toBe('PENDING')

    const stripe = new Stripe('sk_test_mock')
    const payload = JSON.stringify({
      id: 'evt_test_1',
      object: 'event',
      api_version: '2024-06-20',
      created: Math.floor(Date.now() / 1000),
      livemode: false,
      pending_webhooks: 1,
      request: { id: null, idempotency_key: null },
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_test_1',
          object: 'payment_intent',
          amount: 2500,
          currency: 'usd',
          metadata: { orderId: order.body.id },
        },
      },
    })
    const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: 'whsec_test' })
    const bad = await request(app.getHttpServer())
      .post('/v1/payments/stripe/webhook')
      .set('stripe-signature', 't=1,v1=nope')
      .set('content-type', 'application/json')
      .send(payload)
    expect(bad.status).toBe(400)

    const ok = await request(app.getHttpServer())
      .post('/v1/payments/stripe/webhook')
      .set('stripe-signature', signature)
      .set('content-type', 'application/json')
      .send(payload)
    expect(ok.status).toBe(201)
    const again = await request(app.getHttpServer())
      .post('/v1/payments/stripe/webhook')
      .set('stripe-signature', signature)
      .set('content-type', 'application/json')
      .send(payload)
    expect(again.status).toBe(201)
    const wallet = await api.get('/v1/tickets/mine')
    expect(wallet.body.data).toHaveLength(1)
  })
})

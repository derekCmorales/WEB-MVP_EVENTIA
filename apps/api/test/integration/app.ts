import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { AppModule } from '../../src/app.module'
import { configureApp } from '../../src/configure'
import { resetEnvCache } from '../../src/config/env'
import { PrismaService } from '../../src/infra/prisma.service'
import { KeysService } from '../../src/infra/keys.service'

export async function createTestApp() {
  if (process.env.PAYMENTS_SPEC === 'stripe') {
    process.env.PAYMENTS_MODE = 'stripe'
    process.env.STRIPE_SECRET_KEY = 'sk_test_mock'
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test'
  } else {
    process.env.PAYMENTS_MODE = 'fake'
    delete process.env.STRIPE_SECRET_KEY
    delete process.env.STRIPE_WEBHOOK_SECRET
  }
  resetEnvCache()
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
  const app = moduleRef.createNestApplication({ rawBody: true, bodyParser: false })
  await configureApp(app)
  await app.init()
  return app
}

export async function resetDb(app: INestApplication) {
  const prisma = app.get(PrismaService)
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "AuditLog", "OutboxEvent", "CheckIn", "Transfer", "Refund", "WaitlistEntry",
      "Ticket", "Order", "HoldItem", "Hold", "QueueEntry", "Seat", "TicketType",
      "Zone", "Session", "Event", "Venue", "OrganizationMember", "Organization",
      "RefreshToken", "User"
    RESTART IDENTITY CASCADE
  `)
}

export async function csrfOf(app: INestApplication) {
  const response = await request(app.getHttpServer()).get('/v1/auth/csrf')
  const setCookie = response.headers['set-cookie'] as unknown as string[]
  const cookie = setCookie.find((item) => item.startsWith('eventia_csrf='))?.split(';')[0]
  return { token: response.body.csrfToken as string, cookie: cookie ?? '' }
}

export function authed(app: INestApplication, accessToken: string, csrfToken: string, csrfCookie: string) {
  const server = app.getHttpServer()
  const headers = {
    authorization: `Bearer ${accessToken}`,
    'x-csrf-token': csrfToken,
    cookie: csrfCookie,
    origin: 'http://localhost:4321',
  }
  return {
    post: (url: string) => request(server).post(url).set(headers),
    patch: (url: string) => request(server).patch(url).set(headers),
    delete: (url: string) => request(server).delete(url).set(headers),
    get: (url: string) => request(server).get(url).set(headers),
  }
}

export async function register(app: INestApplication, csrf: { token: string; cookie: string }, email: string, name = 'Persona') {
  const response = await request(app.getHttpServer())
    .post('/v1/auth/register')
    .set('x-csrf-token', csrf.token)
    .set('cookie', csrf.cookie)
    .set('origin', 'http://localhost:4321')
    .send({ name, email, password: 'demo1234' })
  if (response.status !== 201 && response.status !== 200) {
    throw new Error(`register ${response.status} ${JSON.stringify(response.body)}`)
  }
  return response.body as { accessToken: string; user: { id: string; email: string } }
}

export async function tokenFor(app: INestApplication, user: { id: string; email: string; role: string }) {
  return app.get(KeysService).signAccess(user)
}

export function eventBody(overrides: Record<string, unknown> = {}) {
  return {
    title: 'Noche de jazz',
    summary: 'Un set corto en el patio.',
    description: 'El precio de la pantalla es el final.',
    city: 'Guatemala',
    venueName: 'Patio norte',
    address: '3a calle',
    startsAt: '2026-12-20T02:00:00.000Z',
    endsAt: '2026-12-20T04:00:00.000Z',
    capacity: 5,
    priceCents: 2500,
    feeCents: 0,
    publish: true,
    ...overrides,
  }
}

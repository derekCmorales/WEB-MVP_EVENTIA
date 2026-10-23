import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { INestApplication } from '@nestjs/common'
import { PrismaService } from '../../src/infra/prisma.service'
import { authed, createTestApp, csrfOf, register, resetDb, tokenFor } from './app'

describe('administración', () => {
  let app: INestApplication

  beforeAll(async () => {
    app = await createTestApp()
    await resetDb(app)
  })

  afterAll(async () => {
    await app.close()
  })

  it('niega el panel a quien no es admin y deja suspender a quien sí lo es', async () => {
    const csrf = await csrfOf(app)
    const ana = await register(app, csrf, 'ana.admin@eventia.dev', 'Ana')
    const visitor = await register(app, csrf, 'visita.admin@eventia.dev', 'Visita')
    const visitorApi = authed(app, visitor.accessToken, csrf.token, csrf.cookie)
    const denied = await visitorApi.get('/v1/admin/insights')
    expect(denied.status).toBe(403)
    expect(denied.body.detail).toMatch(/permiso/)

    const prisma = app.get(PrismaService)
    await prisma.user.update({ where: { id: ana.user.id }, data: { role: 'ADMIN' } })
    const adminToken = await tokenFor(app, { id: ana.user.id, email: ana.user.email, role: 'ADMIN' })
    const adminApi = authed(app, adminToken, csrf.token, csrf.cookie)
    const insights = await adminApi.get('/v1/admin/insights')
    expect(insights.status).toBe(200)
    expect(insights.body.funnel).toBeTruthy()

    const suspended = await adminApi.patch(`/v1/admin/users/${visitor.user.id}`).send({ suspended: true })
    expect(suspended.status).toBe(200)
    const blocked = await visitorApi.get('/v1/tickets/mine')
    expect(blocked.status).toBe(403)
    expect(blocked.body.detail).toMatch(/suspendida/)
  })
})

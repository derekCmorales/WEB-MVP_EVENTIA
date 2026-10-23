import { Injectable, OnModuleInit } from '@nestjs/common'
import { randomBytes, randomUUID } from 'node:crypto'
import * as argon2 from 'argon2'
import type { RegisterInput, UpdateProfileInput } from '@eventia/schemas'
import { PrismaService } from '../infra/prisma.service'
import { KeysService } from '../infra/keys.service'
import { AuditService } from '../audit/audit.service'
import { RateLimitService } from '../infra/rate-limit.service'
import { sha256 } from '../domain/stable'
import { conflict, forbidden, notFound, tooMany, unauthorized } from '../common/problem'

const ARGON: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 1,
}

const REFRESH_DAYS = 30

@Injectable()
export class IdentityService implements OnModuleInit {
  private dummyHash = ''

  constructor(
    private readonly prisma: PrismaService,
    private readonly keys: KeysService,
    private readonly audit: AuditService,
    private readonly limits: RateLimitService,
  ) {}

  async onModuleInit() {
    this.dummyHash = await argon2.hash('eventia-dummy-password', ARGON)
  }

  async register(input: RegisterInput, ip: string) {
    const existing = await this.prisma.user.findUnique({ where: { email: input.email } })
    if (existing) throw conflict('Ese correo ya está registrado')
    const user = await this.prisma.user.create({
      data: {
        email: input.email,
        name: input.name,
        passwordHash: await argon2.hash(input.password, ARGON),
      },
    })
    await this.audit.record({ actorId: user.id, action: 'register', targetType: 'user', targetId: user.id, ip })
    return this.startSession(user, ip, null)
  }

  async login(email: string, password: string, ip: string, userAgent: string | null) {
    const allowed = await this.limits.hit(`login:${ip}:${email}`, 5, 60)
    if (!allowed) throw tooMany('Demasiados intentos de acceso. Espera un minuto.')
    const user = await this.prisma.user.findUnique({ where: { email } })
    if (user?.lockedUntil && user.lockedUntil > new Date()) {
      throw forbidden('La cuenta está bloqueada temporalmente. Inténtalo más tarde.', 'lockout')
    }
    const valid = user
      ? await argon2.verify(user.passwordHash, password)
      : await argon2.verify(this.dummyHash, password).then(() => false).catch(() => false)
    if (!user || !valid) {
      if (user) {
        const failedLogins = user.failedLogins + 1
        await this.prisma.user.update({
          where: { id: user.id },
          data: failedLogins >= 5
            ? { failedLogins: 0, lockedUntil: new Date(Date.now() + 15 * 60 * 1000) }
            : { failedLogins },
        })
        await this.audit.record({ actorId: user.id, action: 'login_failed', targetType: 'user', targetId: user.id, ip })
      }
      throw unauthorized('Correo o contraseña incorrectos')
    }
    await this.prisma.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null } })
    await this.audit.record({ actorId: user.id, action: 'login', targetType: 'user', targetId: user.id, ip })
    return this.startSession(user, ip, userAgent)
  }

  async refresh(rawToken: string | undefined, ip: string, userAgent: string | null) {
    if (!rawToken) throw unauthorized('No hay sesión para renovar')
    const tokenHash = sha256(rawToken)
    const current = await this.prisma.refreshToken.findUnique({ where: { tokenHash }, include: { user: true } })
    if (!current) throw unauthorized('La sesión no es válida')
    if (current.revokedAt) {
      await this.prisma.refreshToken.updateMany({
        where: { familyId: current.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      })
      await this.audit.record({
        actorId: current.userId,
        action: 'refresh_reuse',
        targetType: 'session',
        targetId: current.familyId,
        ip,
      })
      throw unauthorized('Sesión revocada por reutilización del refresh')
    }
    if (current.expiresAt < new Date()) throw unauthorized('La sesión expiró')
    const next = await this.issueRefresh(current.userId, current.familyId, ip, userAgent)
    await this.prisma.refreshToken.update({
      where: { id: current.id },
      data: { revokedAt: new Date(), replacedById: next.id },
    })
    const accessToken = await this.keys.signAccess(current.user)
    return { accessToken, refreshToken: next.raw, user: publicUser(current.user) }
  }

  async logout(rawToken: string | undefined, ip: string) {
    if (!rawToken) return
    const current = await this.prisma.refreshToken.findUnique({ where: { tokenHash: sha256(rawToken) } })
    if (!current) return
    await this.prisma.refreshToken.updateMany({
      where: { familyId: current.familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    })
    await this.audit.record({ actorId: current.userId, action: 'logout', targetType: 'session', targetId: current.familyId, ip })
  }

  async updateProfile(userId: string, input: UpdateProfileInput) {
    const user = await this.prisma.user.update({ where: { id: userId }, data: { name: input.name } })
    return publicUser(user)
  }

  async remove(userId: string, ip: string) {
    const [events, tickets] = await Promise.all([
      this.prisma.event.count({ where: { createdById: userId, sessions: { some: { zones: { some: { sold: { gt: 0 } } } } } } }),
      this.prisma.ticket.count({ where: { holderId: userId, status: { in: ['ISSUED', 'USED'] } } }),
    ])
    if (events > 0) throw conflict('No se puede eliminar porque publicó eventos con boletos vendidos')
    if (tickets > 0) throw conflict('No se puede eliminar porque tiene inscripciones')
    await this.audit.record({ actorId: userId, action: 'account_delete', targetType: 'user', targetId: userId, ip })
    await this.prisma.user.delete({ where: { id: userId } })
    return { id: userId }
  }

  async exportData(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        orders: { select: { id: true, status: true, totalCents: true, currency: true, createdAt: true } },
        tickets: { select: { id: true, serial: true, status: true, rev: true, sessionId: true, createdAt: true } },
        memberships: { select: { orgId: true, role: true } },
      },
    })
    if (!user) throw notFound('Usuario no encontrado')
    return {
      user: publicUser(user),
      orders: user.orders,
      tickets: user.tickets,
      memberships: user.memberships,
    }
  }

  async sessions(userId: string) {
    const rows = await this.prisma.refreshToken.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    })
    const families = new Map<string, typeof rows[number]>()
    for (const row of rows) if (!families.has(row.familyId)) families.set(row.familyId, row)
    return [...families.values()].map((row) => ({
      id: row.familyId,
      createdAt: row.createdAt,
      userAgent: row.userAgent,
      ip: row.ip,
    }))
  }

  async revokeSession(userId: string, familyId: string) {
    const result = await this.prisma.refreshToken.updateMany({
      where: { userId, familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    })
    if (result.count === 0) throw notFound('Sesión no encontrada')
    return { id: familyId }
  }

  private async startSession(user: { id: string; email: string; name: string; role: 'ATTENDEE' | 'ORGANIZER' | 'STAFF' | 'ADMIN' }, ip: string, userAgent: string | null) {
    const refresh = await this.issueRefresh(user.id, randomUUID(), ip, userAgent)
    const accessToken = await this.keys.signAccess(user)
    return { accessToken, refreshToken: refresh.raw, user: publicUser(user) }
  }

  private async issueRefresh(userId: string, familyId: string, ip: string, userAgent: string | null) {
    const raw = randomBytes(32).toString('base64url')
    const id = randomUUID()
    await this.prisma.refreshToken.create({
      data: {
        id,
        userId,
        familyId,
        tokenHash: sha256(raw),
        expiresAt: new Date(Date.now() + REFRESH_DAYS * 24 * 3600 * 1000),
        ip,
        userAgent,
      },
    })
    return { id, raw }
  }
}

export function publicUser(user: { id: string; email: string; name: string; role: string; createdAt?: Date }) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    createdAt: user.createdAt,
  }
}

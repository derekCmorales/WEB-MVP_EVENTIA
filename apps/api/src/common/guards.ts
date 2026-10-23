import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { ThrottlerGuard } from '@nestjs/throttler'
import { timingSafeEqual } from 'node:crypto'
import type { Request } from 'express'
import { PrismaService } from '../infra/prisma.service'
import { KeysService } from '../infra/keys.service'
import { IS_PUBLIC, ROLES, SKIP_CSRF } from './decorators'
import { forbidden, tooMany, unauthorized } from './problem'
import { getEnv } from '../config/env'

const FOREIGN_KEYS = ['userId', 'usuarioId', 'holderId', 'organizadorId']

@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected async shouldSkip(_context: ExecutionContext) {
    return process.env.RATE_LIMIT_DISABLED === '1'
  }
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly keys: KeysService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [context.getHandler(), context.getClass()])
    const request = context.switchToHttp().getRequest<Request>()
    const header = request.header('authorization')
    if (header?.startsWith('Bearer ')) {
      try {
        const payload = await this.keys.verifyAccess(header.slice(7))
        if (payload.purpose === 'admit') throw unauthorized('Ese token no abre la API')
        const user = await this.prisma.user.findUnique({ where: { id: payload.sub } })
        if (!user) throw unauthorized()
        request.user = { id: user.id, email: user.email, role: user.role, name: user.name }
      } catch (error) {
        if (!isPublic) throw error instanceof Error && 'getStatus' in error ? error : unauthorized('La sesión no es válida')
      }
    } else if (!isPublic) {
      throw unauthorized()
    }

    if (request.user) this.rejectImpersonation(request)
    const roles = this.reflector.getAllAndOverride<string[]>(ROLES, [context.getHandler(), context.getClass()])
    if (roles?.length) {
      if (!request.user) throw unauthorized()
      if (request.user.role !== 'ADMIN' && !roles.includes(request.user.role)) {
        throw forbidden('No tienes permiso para esta acción', 'bfla')
      }
    }
    return true
  }

  private rejectImpersonation(request: Request) {
    const bags = [request.body, request.query]
    for (const bag of bags) {
      if (!bag || typeof bag !== 'object') continue
      for (const key of FOREIGN_KEYS) {
        const value = (bag as Record<string, unknown>)[key]
        if (typeof value === 'string' && value !== request.user?.id) {
          throw forbidden('No puedes actuar en nombre de otro usuario', 'bola')
        }
      }
    }
  }
}

@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>()
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) return true
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_CSRF, [context.getHandler(), context.getClass()])
    if (skip) return true
    const header = request.header('x-csrf-token') ?? ''
    const cookie = request.cookies?.eventia_csrf ?? ''
    const left = Buffer.from(header)
    const right = Buffer.from(cookie)
    if (!header || left.length !== right.length || !timingSafeEqual(left, right)) {
      throw forbidden('Falta el token CSRF o no coincide', 'csrf')
    }
    const origin = request.header('origin')
    if (origin) {
      const allowed = getEnv().WEB_ORIGIN.split(',').map((item) => item.trim())
      if (!allowed.includes(origin)) throw forbidden('Origen no permitido', 'origin')
    }
    return true
  }
}

export function clientIp(request: Request) {
  const forwarded = request.header('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0]?.trim() || request.ip || 'unknown'
  return request.ip || 'unknown'
}

export function assertRate(allowed: boolean) {
  if (!allowed) throw tooMany('Demasiadas solicitudes. Espera un momento.')
}

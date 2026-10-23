import { Body, Controller, Delete, Get, Param, Patch, Post, Req, Res } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { loginSchema, registerSchema, updateProfileSchema } from '@eventia/schemas'
import type { Request, Response } from 'express'
import { randomBytes } from 'node:crypto'
import { IdentityService } from './identity.service'
import { ZodPipe } from '../common/zod.pipe'
import { Public } from '../common/decorators'
import { clientIp } from '../common/guards'
import { getEnv } from '../config/env'

const REFRESH = 'eventia_refresh'
const CSRF = 'eventia_csrf'

@ApiTags('identity')
@Controller('auth')
export class IdentityController {
  constructor(private readonly identity: IdentityService) {}

  @Public()
  @Get('csrf')
  csrf(@Res({ passthrough: true }) res: Response) {
    const csrfToken = randomBytes(32).toString('base64url')
    res.cookie(CSRF, csrfToken, cookieBase())
    return { csrfToken }
  }

  @Public()
  @Post('register')
  async register(
    @Body(new ZodPipe(registerSchema)) body: ReturnType<typeof registerSchema.parse>,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = await this.identity.register(body, clientIp(req))
    this.setRefresh(res, session.refreshToken)
    return { accessToken: session.accessToken, user: session.user }
  }

  @Public()
  @Post('login')
  async login(
    @Body(new ZodPipe(loginSchema)) body: ReturnType<typeof loginSchema.parse>,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = await this.identity.login(body.email, body.password, clientIp(req), req.header('user-agent') ?? null)
    this.setRefresh(res, session.refreshToken)
    return { accessToken: session.accessToken, user: session.user }
  }

  @Public()
  @Post('refresh')
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const session = await this.identity.refresh(req.cookies?.[REFRESH], clientIp(req), req.header('user-agent') ?? null)
    this.setRefresh(res, session.refreshToken)
    return { accessToken: session.accessToken, user: session.user }
  }

  @Public()
  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.identity.logout(req.cookies?.[REFRESH], clientIp(req))
    res.clearCookie(REFRESH, { path: '/v1/auth' })
    return { ok: true }
  }

  @ApiBearerAuth()
  @Get('me')
  me(@Req() req: Request) {
    return { user: req.user }
  }

  @ApiBearerAuth()
  @Patch('me')
  update(@Req() req: Request, @Body(new ZodPipe(updateProfileSchema)) body: ReturnType<typeof updateProfileSchema.parse>) {
    return this.identity.updateProfile(req.user!.id, body)
  }

  @ApiBearerAuth()
  @Delete('me')
  remove(@Req() req: Request) {
    return this.identity.remove(req.user!.id, clientIp(req))
  }

  @ApiBearerAuth()
  @Get('me/export')
  exportData(@Req() req: Request) {
    return this.identity.exportData(req.user!.id)
  }

  @ApiBearerAuth()
  @Get('sessions')
  sessions(@Req() req: Request) {
    return this.identity.sessions(req.user!.id)
  }

  @ApiBearerAuth()
  @Delete('sessions/:id')
  revoke(@Req() req: Request, @Param('id') id: string) {
    return this.identity.revokeSession(req.user!.id, id)
  }

  private setRefresh(res: Response, token: string) {
    const env = getEnv()
    res.cookie(REFRESH, token, {
      ...cookieBase(),
      httpOnly: true,
      path: '/v1/auth',
      maxAge: 30 * 24 * 3600 * 1000,
      secure: env.NODE_ENV === 'production',
    })
  }
}

function cookieBase() {
  const env = getEnv()
  return {
    sameSite: 'lax' as const,
    secure: env.NODE_ENV === 'production',
    path: '/',
  }
}

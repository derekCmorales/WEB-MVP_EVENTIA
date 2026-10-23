import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { checkInSchema, reconcileSchema } from '@eventia/schemas'
import type { Request } from 'express'
import { CheckInService } from './checkin.service'
import { ZodPipe } from '../common/zod.pipe'
import { clientIp } from '../common/guards'
import { badRequest } from '../common/problem'

@ApiTags('checkin')
@ApiBearerAuth()
@Controller('checkin')
export class CheckInController {
  constructor(private readonly checkin: CheckInService) {}

  @Post()
  validate(@Req() req: Request, @Body(new ZodPipe(checkInSchema)) body: ReturnType<typeof checkInSchema.parse>) {
    return this.checkin.validate(req.user!.id, body, clientIp(req))
  }

  @Post('reconcile')
  reconcile(@Req() req: Request, @Body(new ZodPipe(reconcileSchema)) body: ReturnType<typeof reconcileSchema.parse>) {
    return this.checkin.reconcile(req.user!.id, body, clientIp(req))
  }

  @Get('manifest/:sessionId')
  manifest(@Req() req: Request, @Param('sessionId') sessionId: string) {
    return this.checkin.manifest(req.user!.id, sessionId)
  }

  @Get('search')
  search(@Req() req: Request, @Query('sessionId') sessionId?: string, @Query('q') q?: string) {
    if (!sessionId || !q) throw badRequest('Indica sessionId y q')
    return this.checkin.search(req.user!.id, sessionId, q)
  }
}

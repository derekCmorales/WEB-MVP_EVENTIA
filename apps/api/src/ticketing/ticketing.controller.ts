import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { transferSchema, waitlistSchema } from '@eventia/schemas'
import type { Request } from 'express'
import { TicketingService } from './ticketing.service'
import { ZodPipe } from '../common/zod.pipe'
import { clientIp } from '../common/guards'

@ApiTags('ticketing')
@ApiBearerAuth()
@Controller()
export class TicketingController {
  constructor(private readonly tickets: TicketingService) {}

  @Get('transfers/mine')
  incoming(@Req() req: Request) {
    return this.tickets.incoming(req.user!.id)
  }

  @Get('tickets/mine')
  mine(@Req() req: Request) {
    return this.tickets.mine(req.user!.id)
  }

  @Get('tickets/:id')
  get(@Req() req: Request, @Param('id') id: string) {
    return this.tickets.get(req.user!.id, id)
  }

  @Get('tickets/:id/qr')
  qr(@Req() req: Request, @Param('id') id: string) {
    return this.tickets.qr(req.user!.id, id)
  }

  @Post('tickets/:id/transfer')
  transfer(
    @Req() req: Request,
    @Param('id') id: string,
    @Body(new ZodPipe(transferSchema)) body: ReturnType<typeof transferSchema.parse>,
  ) {
    return this.tickets.transfer(req.user!.id, id, body, clientIp(req))
  }

  @Post('transfers/:id/accept')
  accept(@Req() req: Request, @Param('id') id: string) {
    return this.tickets.acceptTransfer(req.user!.id, id, clientIp(req))
  }

  @Post('waitlist')
  join(@Req() req: Request, @Body(new ZodPipe(waitlistSchema)) body: ReturnType<typeof waitlistSchema.parse>) {
    return this.tickets.joinWaitlist(req.user!.id, body)
  }

  @Get('waitlist/mine')
  waiting(@Req() req: Request) {
    return this.tickets.myWaitlist(req.user!.id)
  }
}

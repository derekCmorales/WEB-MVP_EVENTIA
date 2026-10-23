import { Body, Controller, Get, Headers, Param, Post, Req } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { orderSchema, refundSchema } from '@eventia/schemas'
import type { RawBodyRequest } from '@nestjs/common'
import type { Request } from 'express'
import { CheckoutService } from './checkout.service'
import { TicketingService } from '../ticketing/ticketing.service'
import { PaymentsService } from '../infra/payments.service'
import { ZodPipe } from '../common/zod.pipe'
import { Public, SkipCsrf } from '../common/decorators'
import { clientIp } from '../common/guards'
import { badRequest } from '../common/problem'
import { requireKey } from '../inventory/inventory.controller'

@ApiTags('checkout')
@Controller()
export class CheckoutController {
  constructor(
    private readonly checkout: CheckoutService,
    private readonly tickets: TicketingService,
    private readonly payments: PaymentsService,
  ) {}

  @ApiBearerAuth()
  @Post('orders')
  create(
    @Req() req: Request,
    @Body(new ZodPipe(orderSchema)) body: ReturnType<typeof orderSchema.parse>,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    return this.checkout.createOrder(req.user!.id, requireKey(idempotencyKey), body, clientIp(req))
  }

  @ApiBearerAuth()
  @Get('orders/mine')
  mine(@Req() req: Request) {
    return this.checkout.mine(req.user!.id)
  }

  @ApiBearerAuth()
  @Get('orders/:id')
  get(@Req() req: Request, @Param('id') id: string) {
    return this.checkout.get(req.user!.id, id)
  }

  @ApiBearerAuth()
  @Post('orders/:id/pay')
  pay(@Req() req: Request, @Param('id') id: string) {
    return this.checkout.pay(req.user!.id, id, clientIp(req))
  }

  @ApiBearerAuth()
  @Post('orders/:id/cancel')
  cancel(@Req() req: Request, @Param('id') id: string) {
    return this.checkout.cancel(req.user!.id, id, clientIp(req))
  }

  @ApiBearerAuth()
  @Post('orders/:id/refund')
  refund(
    @Req() req: Request,
    @Param('id') id: string,
    @Body(new ZodPipe(refundSchema)) body: ReturnType<typeof refundSchema.parse>,
  ) {
    return this.tickets.refund(req.user!.id, id, body, clientIp(req))
  }

  @Public()
  @SkipCsrf()
  @Post('payments/stripe/webhook')
  webhook(@Req() req: RawBodyRequest<Request>) {
    const signature = req.header('stripe-signature')
    if (!signature || !req.rawBody) throw badRequest('Falta la firma del webhook', 'webhook')
    const event = this.payments.constructWebhook(req.rawBody, signature)
    return this.checkout.handleStripeEvent(event, clientIp(req))
  }
}

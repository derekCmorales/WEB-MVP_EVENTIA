import { Injectable } from '@nestjs/common'
import Stripe from 'stripe'
import { getEnv } from '../config/env'
import { badRequest } from '../common/problem'

export type PaymentIntentResult = {
  mode: 'fake' | 'stripe'
  status: 'paid' | 'pending'
  provider: string
  ref: string | null
  clientSecret: string | null
}

@Injectable()
export class PaymentsService {
  private stripe: Stripe | null = null
  readonly mode: 'fake' | 'stripe'
  private readonly webhookSecret: string

  constructor() {
    const env = getEnv()
    const key = env.STRIPE_SECRET_KEY?.trim() || ''
    this.webhookSecret = env.STRIPE_WEBHOOK_SECRET?.trim() || ''
    const wantsStripe = env.PAYMENTS_MODE === 'stripe' || (env.PAYMENTS_MODE === 'auto' && key.startsWith('sk_'))
    this.mode = wantsStripe ? 'stripe' : 'fake'
    if (this.mode === 'stripe' && key && key !== 'sk_test_mock') this.stripe = new Stripe(key)
  }

  async createIntent(order: { id: string; totalCents: number; currency: string }): Promise<PaymentIntentResult> {
    if (this.mode === 'fake' || order.totalCents === 0) {
      return { mode: 'fake', status: 'paid', provider: 'fake', ref: `fake_${order.id}`, clientSecret: null }
    }
    if (!this.stripe) {
      return { mode: 'stripe', status: 'pending', provider: 'stripe', ref: `pi_mock_${order.id}`, clientSecret: `pi_mock_secret_${order.id}` }
    }
    const intent = await this.stripe.paymentIntents.create({
      amount: order.totalCents,
      currency: order.currency.toLowerCase(),
      metadata: { orderId: order.id },
      automatic_payment_methods: { enabled: true },
    }, { idempotencyKey: `order_${order.id}` })
    return {
      mode: 'stripe',
      status: 'pending',
      provider: 'stripe',
      ref: intent.id,
      clientSecret: intent.client_secret,
    }
  }

  async refund(ref: string | null, amountCents: number) {
    if (!this.stripe || !ref || !ref.startsWith('pi_')) return
    await this.stripe.refunds.create({ payment_intent: ref, amount: amountCents })
  }

  constructWebhook(raw: Buffer, signature: string) {
    if (!this.webhookSecret) throw badRequest('Webhook de Stripe no configurado', 'webhook')
    const stripe = this.stripe ?? new Stripe('sk_test_unused')
    try {
      return stripe.webhooks.constructEvent(raw, signature, this.webhookSecret)
    } catch {
      throw badRequest('La firma del webhook no es válida', 'webhook')
    }
  }
}

import { z } from 'zod'

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3001),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().optional(),
  WEB_ORIGIN: z.string().default('http://localhost:4321,http://127.0.0.1:4321'),
  EVENTIA_DEMO_PASSWORD: z.string().min(8).default('demo1234'),
  PAYMENTS_MODE: z.enum(['fake', 'stripe', 'auto']).default('auto'),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  JWT_PRIVATE_KEY: z.string().optional(),
  JWT_PUBLIC_KEY: z.string().optional(),
  TICKET_PRIVATE_KEY: z.string().optional(),
  TICKET_PUBLIC_KEY: z.string().optional(),
  TICKET_KID: z.string().default('eventia-dev-1'),
  HOLD_TTL_SECONDS: z.coerce.number().int().min(30).default(480),
  RATE_LIMIT_DISABLED: z.string().optional(),
  HOLD_SWEEPER: z.string().optional(),
  QUEUE_BATCH: z.coerce.number().int().min(1).default(20),
})

export type Env = z.infer<typeof schema>

let cached: Env | null = null

export function getEnv() {
  if (cached) return cached
  const parsed = schema.safeParse(process.env)
  if (!parsed.success) {
    const detail = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')
    throw new Error(`Configuración inválida: ${detail}`)
  }
  if (parsed.data.NODE_ENV === 'production') {
    const missing = ['JWT_PRIVATE_KEY', 'JWT_PUBLIC_KEY', 'TICKET_PRIVATE_KEY', 'TICKET_PUBLIC_KEY']
      .filter((key) => !process.env[key])
    if (missing.length) throw new Error(`Faltan secretos en producción: ${missing.join(', ')}`)
  }
  cached = parsed.data
  return cached
}

export function resetEnvCache() {
  cached = null
}

import { existsSync, readFileSync } from 'node:fs'

const file = '/tmp/eventia-testenv.json'
if (existsSync(file)) {
  Object.assign(process.env, JSON.parse(readFileSync(file, 'utf8')) as Record<string, string>)
}

process.env.NODE_ENV = 'test'
process.env.RATE_LIMIT_DISABLED = '1'
process.env.HOLD_SWEEPER = '0'
process.env.PAYMENTS_MODE ??= 'fake'
process.env.WEB_ORIGIN ??= 'http://localhost:4321'
process.env.EVENTIA_DEMO_PASSWORD ??= 'demo1234'
process.env.TICKET_KID ??= 'eventia-test'

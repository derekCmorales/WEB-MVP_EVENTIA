import { execSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { PostgreSqlContainer } from '@testcontainers/postgresql'
import { RedisContainer } from '@testcontainers/redis'

export async function setup() {
  if (process.env.USE_EXTERNAL_DB === '1') {
    if (!process.env.DATABASE_URL) throw new Error('USE_EXTERNAL_DB requiere DATABASE_URL')
    execSync('pnpm exec prisma migrate deploy', { stdio: 'inherit', env: process.env })
    return
  }

  const postgres = await new PostgreSqlContainer('postgres:16-alpine').start()
  const redis = await new RedisContainer('redis:7-alpine').start()
  const env = {
    DATABASE_URL: postgres.getConnectionUri(),
    REDIS_URL: redis.getConnectionUrl(),
  }
  writeFileSync('/tmp/eventia-testenv.json', JSON.stringify(env))
  execSync('pnpm exec prisma migrate deploy', { stdio: 'inherit', env: { ...process.env, ...env } })
  stopContainers = async () => {
    await postgres.stop()
    await redis.stop()
  }
}

let stopContainers: (() => Promise<void>) | null = null

export async function teardown() {
  await stopContainers?.()
}

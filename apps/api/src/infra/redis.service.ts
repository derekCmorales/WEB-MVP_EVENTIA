import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common'
import Redis from 'ioredis'
import { getEnv } from '../config/env'

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger('redis')
  readonly client: Redis | null

  constructor() {
    const url = getEnv().REDIS_URL
    if (!url) {
      this.client = null
      return
    }
    this.client = new Redis(url, { maxRetriesPerRequest: 2, lazyConnect: true, enableOfflineQueue: false })
    this.client.on('error', (error) => this.logger.warn(error.message))
  }

  async connect() {
    if (!this.client) return false
    try {
      if (this.client.status === 'wait') await this.client.connect()
      await this.client.ping()
      return true
    } catch (error) {
      this.logger.warn(error instanceof Error ? error.message : 'redis unavailable')
      return false
    }
  }

  async onModuleDestroy() {
    await this.client?.quit().catch(() => undefined)
  }
}

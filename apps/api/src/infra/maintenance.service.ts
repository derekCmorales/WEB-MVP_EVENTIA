import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { Queue, Worker } from 'bullmq'
import Redis from 'ioredis'
import { getEnv } from '../config/env'
import { InventoryService } from '../inventory/inventory.service'
import { QueueService } from '../queue/queue.service'

@Injectable()
export class MaintenanceService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('maintenance')
  private timer?: NodeJS.Timeout
  private worker?: Worker
  private queue?: Queue
  private connections: Redis[] = []

  constructor(
    private readonly inventory: InventoryService,
    private readonly waiting: QueueService,
  ) {}

  async onModuleInit() {
    if (process.env.HOLD_SWEEPER === '0') return
    const redisUrl = getEnv().REDIS_URL
    if (redisUrl) {
      try {
        const connection = new Redis(redisUrl, { maxRetriesPerRequest: null })
        this.connections.push(connection)
        this.queue = new Queue('eventia-maintenance', { connection })
        await this.queue.add('sweep', {}, { repeat: { every: 5000 }, jobId: 'sweep' })
        const workerConnection = new Redis(redisUrl, { maxRetriesPerRequest: null })
        this.connections.push(workerConnection)
        this.worker = new Worker('eventia-maintenance', async () => this.sweep(), { connection: workerConnection })
        return
      } catch (error) {
        this.logger.warn(error instanceof Error ? error.message : 'bullmq unavailable')
      }
    }
    this.timer = setInterval(() => void this.sweep(), 5000)
  }

  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer)
    await this.worker?.close()
    await this.queue?.close()
    await Promise.all(this.connections.map((connection) => connection.quit().catch(() => undefined)))
  }

  private async sweep() {
    await this.inventory.sweep()
    await this.waiting.admitDue()
  }
}

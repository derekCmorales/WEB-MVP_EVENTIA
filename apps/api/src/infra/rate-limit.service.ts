import { Injectable } from '@nestjs/common'
import { RedisService } from './redis.service'

type Bucket = { count: number; resetAt: number }

@Injectable()
export class RateLimitService {
  private readonly memory = new Map<string, Bucket>()

  constructor(private readonly redis: RedisService) {}

  async hit(key: string, limit: number, windowSec: number) {
    if (process.env.RATE_LIMIT_DISABLED === '1') return true
    if (this.redis.client && this.redis.client.status === 'ready') {
      const redisKey = `rl:${key}`
      const count = await this.redis.client.incr(redisKey)
      if (count === 1) await this.redis.client.expire(redisKey, windowSec)
      return count <= limit
    }
    const now = Date.now()
    const current = this.memory.get(key)
    if (!current || current.resetAt < now) {
      this.memory.set(key, { count: 1, resetAt: now + windowSec * 1000 })
      return true
    }
    current.count += 1
    return current.count <= limit
  }
}

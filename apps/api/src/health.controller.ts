import { Controller, Get } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { Public } from './common/decorators'
import { PrismaService } from './infra/prisma.service'
import { RedisService } from './infra/redis.service'

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Public()
  @Get()
  async health() {
    await this.prisma.$queryRaw`SELECT 1`
    const redis = this.redis.client?.status === 'ready' ? 'up' : this.redis.client ? 'down' : 'disabled'
    return { status: 'ok', service: 'eventia', redis }
  }
}

import { Body, Controller, Get, Param, Post, Req, Res } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { queueJoinSchema } from '@eventia/schemas'
import type { Request, Response } from 'express'
import { QueueService } from './queue.service'
import { ZodPipe } from '../common/zod.pipe'

@ApiTags('queue')
@ApiBearerAuth()
@Controller('sessions')
export class QueueController {
  constructor(private readonly queue: QueueService) {}

  @Post(':id/queue')
  join(
    @Req() req: Request,
    @Param('id') id: string,
    @Body(new ZodPipe(queueJoinSchema)) body: ReturnType<typeof queueJoinSchema.parse>,
  ) {
    return this.queue.join(req.user!.id, id, body.deviceId)
  }

  @Get(':id/queue')
  status(@Req() req: Request, @Param('id') id: string) {
    return this.queue.status(req.user!.id, id)
  }

  @Get(':id/queue/stream')
  async stream(@Req() req: Request, @Param('id') id: string, @Res() res: Response) {
    res.setHeader('content-type', 'text/event-stream')
    res.setHeader('cache-control', 'no-cache')
    res.flushHeaders?.()
    const send = async () => {
      const status = await this.queue.status(req.user!.id, id)
      res.write(`data: ${JSON.stringify(status)}\n\n`)
    }
    await send()
    const timer = setInterval(() => void send().catch(() => undefined), 2000)
    req.on('close', () => clearInterval(timer))
  }
}

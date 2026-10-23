import { Body, Controller, Delete, Get, Headers, Param, Post, Req } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { holdSchema } from '@eventia/schemas'
import type { Request } from 'express'
import { InventoryService } from './inventory.service'
import { ZodPipe } from '../common/zod.pipe'
import { badRequest } from '../common/problem'
import { clientIp } from '../common/guards'

@ApiTags('inventory')
@ApiBearerAuth()
@Controller('holds')
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Post()
  create(
    @Req() req: Request,
    @Body(new ZodPipe(holdSchema)) body: ReturnType<typeof holdSchema.parse>,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('x-admission-token') admission: string | undefined,
  ) {
    return this.inventory.createHold(req.user!.id, requireKey(idempotencyKey), body, admission, clientIp(req))
  }

  @Get(':id')
  get(@Req() req: Request, @Param('id') id: string) {
    return this.inventory.get(req.user!.id, id)
  }

  @Delete(':id')
  release(@Req() req: Request, @Param('id') id: string) {
    return this.inventory.release(req.user!.id, id, clientIp(req))
  }
}

export function requireKey(header: string | undefined) {
  const key = header?.trim() ?? ''
  if (key.length < 8 || key.length > 120) throw badRequest('La cabecera Idempotency-Key es obligatoria')
  return key
}

import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { createEventSchema, inviteStaffSchema, listEventsQuerySchema, patchEventSchema } from '@eventia/schemas'
import type { Request } from 'express'
import { CatalogService } from './catalog.service'
import { AdminService } from '../admin/admin.service'
import { ZodPipe } from '../common/zod.pipe'
import { Public } from '../common/decorators'
import { RateLimitService } from '../infra/rate-limit.service'
import { clientIp } from '../common/guards'
import { tooMany } from '../common/problem'

@ApiTags('catalog')
@Controller()
export class CatalogController {
  constructor(
    private readonly catalog: CatalogService,
    private readonly limits: RateLimitService,
    private readonly admin: AdminService,
  ) {}

  @Public()
  @Get('events')
  async list(@Query(new ZodPipe(listEventsQuerySchema)) query: ReturnType<typeof listEventsQuerySchema.parse>, @Req() req: Request) {
    const allowed = await this.limits.hit(`search:${clientIp(req)}`, 60, 60)
    if (!allowed) throw tooMany('Demasiadas búsquedas. Espera un momento.')
    return this.catalog.list(query)
  }

  @Public()
  @Get('events/:idOrSlug')
  get(@Param('idOrSlug') idOrSlug: string) {
    return this.catalog.getPublic(idOrSlug)
  }

  @ApiBearerAuth()
  @Get('organizer/overview')
  overview(@Req() req: Request) {
    return this.catalog.overview(req.user!.id)
  }

  @Get('organizer/insights')
  insights(@Req() req: Request) {
    return this.admin.organizerInsights(req.user!.id)
  }

  @ApiBearerAuth()
  @Get('organizer/events')
  mine(@Req() req: Request) {
    return this.catalog.mine(req.user!.id)
  }

  @ApiBearerAuth()
  @Post('organizer/events')
  create(@Req() req: Request, @Body(new ZodPipe(createEventSchema)) body: ReturnType<typeof createEventSchema.parse>) {
    return this.catalog.create(req.user!.id, body, clientIp(req))
  }

  @ApiBearerAuth()
  @Patch('organizer/events/:id')
  update(
    @Req() req: Request,
    @Param('id') id: string,
    @Body(new ZodPipe(patchEventSchema)) body: ReturnType<typeof patchEventSchema.parse>,
  ) {
    return this.catalog.update(req.user!.id, id, body, clientIp(req))
  }

  @ApiBearerAuth()
  @Delete('organizer/events/:id')
  remove(@Req() req: Request, @Param('id') id: string) {
    return this.catalog.remove(req.user!.id, id, clientIp(req))
  }

  @ApiBearerAuth()
  @Get('organizer/events/:id/attendees')
  attendees(@Req() req: Request, @Param('id') id: string) {
    return this.catalog.attendees(req.user!.id, id)
  }

  @ApiBearerAuth()
  @Post('organizer/events/:id/staff')
  staff(
    @Req() req: Request,
    @Param('id') id: string,
    @Body(new ZodPipe(inviteStaffSchema)) body: ReturnType<typeof inviteStaffSchema.parse>,
  ) {
    return this.catalog.inviteStaff(req.user!.id, id, body, clientIp(req))
  }

  @ApiBearerAuth()
  @Get('organizer/audit')
  audit(@Req() req: Request) {
    return this.catalog.orgAudit(req.user!.id)
  }
}

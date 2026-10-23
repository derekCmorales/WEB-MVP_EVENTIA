import { Body, Controller, Get, Param, Patch, Req } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { adminEventPatchSchema, adminOrgPatchSchema, adminUserPatchSchema } from '@eventia/schemas'
import type { Request } from 'express'
import { AdminService } from './admin.service'
import { ZodPipe } from '../common/zod.pipe'
import { Roles } from '../common/decorators'
import { clientIp } from '../common/guards'

@ApiTags('admin')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('users')
  users() {
    return this.admin.users()
  }

  @Patch('users/:id')
  patchUser(
    @Req() req: Request,
    @Param('id') id: string,
    @Body(new ZodPipe(adminUserPatchSchema)) body: ReturnType<typeof adminUserPatchSchema.parse>,
  ) {
    return this.admin.patchUser(req.user!.id, id, body, clientIp(req))
  }

  @Get('organizers')
  organizers() {
    return this.admin.organizers()
  }

  @Patch('organizers/:id')
  patchOrganizer(
    @Req() req: Request,
    @Param('id') id: string,
    @Body(new ZodPipe(adminOrgPatchSchema)) body: ReturnType<typeof adminOrgPatchSchema.parse>,
  ) {
    return this.admin.patchOrganizer(req.user!.id, id, body, clientIp(req))
  }

  @Get('events')
  events() {
    return this.admin.events()
  }

  @Patch('events/:id')
  patchEvent(
    @Req() req: Request,
    @Param('id') id: string,
    @Body(new ZodPipe(adminEventPatchSchema)) body: ReturnType<typeof adminEventPatchSchema.parse>,
  ) {
    return this.admin.patchEvent(req.user!.id, id, body, clientIp(req))
  }

  @Get('insights')
  insights() {
    return this.admin.insights()
  }

  @Get('audit')
  audit() {
    return this.admin.trail()
  }
}

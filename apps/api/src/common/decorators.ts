import { SetMetadata } from '@nestjs/common'
import type { UserRole } from '@prisma/client'

export const IS_PUBLIC = 'eventia:public'
export const SKIP_CSRF = 'eventia:skip-csrf'
export const ROLES = 'eventia:roles'

export const Public = () => SetMetadata(IS_PUBLIC, true)
export const SkipCsrf = () => SetMetadata(SKIP_CSRF, true)
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES, roles)

import { Module } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { ThrottlerModule } from '@nestjs/throttler'
import { PrismaService } from './infra/prisma.service'
import { RedisService } from './infra/redis.service'
import { KeysService } from './infra/keys.service'
import { RateLimitService } from './infra/rate-limit.service'
import { PaymentsService } from './infra/payments.service'
import { MaintenanceService } from './infra/maintenance.service'
import { AuditService } from './audit/audit.service'
import { IdentityService } from './identity/identity.service'
import { IdentityController } from './identity/identity.controller'
import { CatalogService } from './catalog/catalog.service'
import { CatalogController } from './catalog/catalog.controller'
import { InventoryService } from './inventory/inventory.service'
import { InventoryController } from './inventory/inventory.controller'
import { CheckoutService } from './checkout/checkout.service'
import { CheckoutController } from './checkout/checkout.controller'
import { TicketingService } from './ticketing/ticketing.service'
import { TicketingController } from './ticketing/ticketing.controller'
import { CheckInService } from './checkin/checkin.service'
import { CheckInController } from './checkin/checkin.controller'
import { QueueService } from './queue/queue.service'
import { QueueController } from './queue/queue.controller'
import { HealthController } from './health.controller'
import { AdminService } from './admin/admin.service'
import { AdminController } from './admin/admin.controller'
import { AppThrottlerGuard, AuthGuard, CsrfGuard } from './common/guards'

const limit = process.env.RATE_LIMIT_DISABLED === '1' ? 100_000 : 120

@Module({
  imports: [ThrottlerModule.forRoot({ throttlers: [{ ttl: 60_000, limit }] })],
  controllers: [
    HealthController,
    IdentityController,
    CatalogController,
    InventoryController,
    CheckoutController,
    TicketingController,
    CheckInController,
    QueueController,
    AdminController,
  ],
  providers: [
    PrismaService,
    RedisService,
    KeysService,
    RateLimitService,
    PaymentsService,
    AuditService,
    IdentityService,
    CatalogService,
    InventoryService,
    CheckoutService,
    TicketingService,
    CheckInService,
    QueueService,
    AdminService,
    MaintenanceService,
    { provide: APP_GUARD, useClass: AppThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
  ],
})
export class AppModule {}

import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../infra/prisma.service'
import { chainHash } from '../domain/stable'

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: {
    actorId?: string | null
    action: string
    targetType: string
    targetId: string
    ip?: string | null
    metadata?: Prisma.InputJsonValue
  }) {
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(41021)`
      const previous = await tx.auditLog.findFirst({ orderBy: { at: 'desc' } })
      const prevHash = previous?.hash ?? '0'.repeat(64)
      const body = {
        actorId: input.actorId ?? null,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        ip: input.ip ?? null,
        metadata: input.metadata ?? null,
      }
      await tx.auditLog.create({
        data: {
          actorId: input.actorId ?? null,
          action: input.action,
          targetType: input.targetType,
          targetId: input.targetId,
          ip: input.ip ?? null,
          metadata: input.metadata,
          prevHash,
          hash: chainHash(prevHash, body),
        },
      })
    })
  }
}

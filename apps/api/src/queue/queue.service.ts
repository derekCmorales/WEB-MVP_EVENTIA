import { Injectable } from '@nestjs/common'
import { randomInt } from 'node:crypto'
import { PrismaService } from '../infra/prisma.service'
import { KeysService } from '../infra/keys.service'
import { getEnv } from '../config/env'
import { conflict, notFound } from '../common/problem'

type QueueView = {
  admitted: boolean
  token: string | null
  position: number
  ahead: number
  etaSeconds: number
  admissionExpiresAt: Date | null
}

@Injectable()
export class QueueService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly keys: KeysService,
  ) {}

  async join(userId: string, sessionId: string, deviceId?: string): Promise<QueueView> {
    const session = await this.prisma.session.findUnique({ where: { id: sessionId }, include: { event: true } })
    if (!session || session.event.status !== 'PUBLISHED') throw notFound('La función no está a la venta')
    if (!session.queueEnabled) {
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000)
      const token = await this.keys.signAdmit(userId, sessionId, expiresAt)
      return { admitted: true, token, position: 0, ahead: 0, etaSeconds: 0, admissionExpiresAt: expiresAt }
    }
    const existing = await this.prisma.queueEntry.findUnique({ where: { sessionId_userId: { sessionId, userId } } })
    if (existing) return this.status(userId, sessionId)
    const beforeOpen = session.salesOpenAt > new Date()
    const entry = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(41022)`
      const max = await tx.queueEntry.aggregate({ where: { sessionId }, _max: { position: true } })
      const position = beforeOpen ? randomInt(1, 1_000_000_000) : (max._max.position ?? 0) + 1
      return tx.queueEntry.create({ data: { sessionId, userId, position, deviceId } })
    })
    return this.present(entry, session.queueEnabled)
  }

  async status(userId: string, sessionId: string): Promise<QueueView> {
    const session = await this.prisma.session.findUnique({ where: { id: sessionId } })
    if (!session) throw notFound('La función no está a la venta')
    if (!session.queueEnabled) return this.join(userId, sessionId)
    const entry = await this.prisma.queueEntry.findUnique({ where: { sessionId_userId: { sessionId, userId } } })
    if (!entry) throw notFound('No estás en la fila')
    return this.present(entry, true)
  }

  async admitDue() {
    const sessions = await this.prisma.session.findMany({
      where: { queueEnabled: true, salesOpenAt: { lte: new Date() }, status: 'ON_SALE' },
      select: { id: true },
    })
    let admitted = 0
    for (const session of sessions) admitted += await this.admitBatch(session.id)
    return admitted
  }

  async admitBatch(sessionId: string) {
    const session = await this.prisma.session.findUnique({ where: { id: sessionId } })
    if (!session || session.salesOpenAt > new Date()) return 0
    const batch = getEnv().QUEUE_BATCH
    const active = await this.prisma.queueEntry.count({
      where: { sessionId, admittedAt: { not: null }, admissionExpiresAt: { gt: new Date() } },
    })
    const room = Math.max(0, batch - active)
    if (room === 0) return 0
    const waiting = await this.prisma.queueEntry.findMany({
      where: { sessionId, admittedAt: null },
      orderBy: [{ position: 'asc' }, { joinedAt: 'asc' }],
      take: room,
    })
    const expires = new Date(Date.now() + 10 * 60 * 1000)
    if (waiting.length) {
      await this.prisma.queueEntry.updateMany({
        where: { id: { in: waiting.map((entry) => entry.id) } },
        data: { admittedAt: new Date(), admissionExpiresAt: expires },
      })
    }
    return waiting.length
  }

  private async present(entry: { id: string; sessionId: string; userId: string; position: number; admittedAt: Date | null; admissionExpiresAt: Date | null; joinedAt: Date }, queueEnabled: boolean) {
    if (!queueEnabled) throw conflict('Esta función no usa fila')
    const ahead = await this.prisma.queueEntry.count({
      where: {
        sessionId: entry.sessionId,
        admittedAt: null,
        OR: [
          { position: { lt: entry.position } },
          { position: entry.position, joinedAt: { lt: entry.joinedAt } },
        ],
      },
    })
    const admitted = Boolean(entry.admittedAt && entry.admissionExpiresAt && entry.admissionExpiresAt > new Date())
    const token = admitted && entry.admissionExpiresAt
      ? await this.keys.signAdmit(entry.userId, entry.sessionId, entry.admissionExpiresAt)
      : null
    return {
      admitted,
      token,
      position: entry.position,
      ahead,
      etaSeconds: admitted ? 0 : ahead * 4,
      admissionExpiresAt: entry.admissionExpiresAt,
    }
  }
}

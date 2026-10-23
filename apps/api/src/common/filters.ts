import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common'
import type { Response } from 'express'
import { Prisma } from '@prisma/client'

@Catch()
export class ProblemFilter implements ExceptionFilter {
  private readonly logger = new Logger('http')

  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>()
    const request = host.switchToHttp().getRequest<{ requestId?: string; method?: string; url?: string }>()
    const mapped = this.toProblem(exception)
    if (mapped.status >= 500) {
      this.logger.error(JSON.stringify({
        requestId: request.requestId,
        method: request.method,
        url: request.url,
        message: exception instanceof Error ? exception.message : 'error',
      }))
    }
    response
      .status(mapped.status)
      .setHeader('content-type', 'application/problem+json')
    if (mapped.status === 429) response.setHeader('retry-after', '60')
    response.json(mapped.body)
  }

  private toProblem(exception: unknown) {
    if (exception instanceof Prisma.PrismaClientKnownRequestError && exception.code === 'P2002') {
      return {
        status: 409,
        body: {
          type: 'https://eventia.app/problems/conflict',
          title: 'Conflicto',
          status: 409,
          detail: 'Ese dato ya existe',
        },
      }
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus()
      const raw = exception.getResponse()
      if (typeof raw === 'object' && raw && 'detail' in raw && 'type' in raw) {
        return { status, body: raw }
      }
      const message = typeof raw === 'string'
        ? raw
        : Array.isArray((raw as { message?: unknown }).message)
          ? (raw as { message: string[] }).message.join('; ')
          : (raw as { message?: string }).message ?? 'Solicitud rechazada'
      return {
        status,
        body: {
          type: `https://eventia.app/problems/${status === 429 ? 'rate-limit' : 'http'}`,
          title: status === 429 ? 'Demasiadas solicitudes' : 'Solicitud rechazada',
          status,
          detail: message,
        },
      }
    }
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: {
        type: 'https://eventia.app/problems/internal',
        title: 'Error interno',
        status: 500,
        detail: 'No se pudo completar la solicitud',
      },
    }
  }
}

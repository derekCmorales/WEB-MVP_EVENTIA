import { PipeTransform } from '@nestjs/common'
import type { ZodType } from 'zod'
import { badRequest } from './problem'

export class ZodPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown) {
    const parsed = this.schema.safeParse(value ?? {})
    if (!parsed.success) {
      const detail = parsed.error.issues.map((issue) => issue.message).join('; ')
      throw badRequest(detail || 'El cuerpo de la solicitud no es válido')
    }
    return parsed.data
  }
}

import { HttpException } from '@nestjs/common'

const titles: Record<number, string> = {
  400: 'Solicitud inválida',
  401: 'No autenticado',
  403: 'Prohibido',
  404: 'No encontrado',
  409: 'Conflicto',
  429: 'Demasiadas solicitudes',
  500: 'Error interno',
}

export class ProblemException extends HttpException {
  constructor(status: number, detail: string, code: string) {
    super(
      {
        type: `https://eventia.app/problems/${code}`,
        title: titles[status] ?? 'Error',
        status,
        detail,
      },
      status,
    )
  }
}

export const badRequest = (detail: string, code = 'validation') => new ProblemException(400, detail, code)
export const unauthorized = (detail = 'Debes iniciar sesión', code = 'unauthorized') => new ProblemException(401, detail, code)
export const forbidden = (detail: string, code = 'forbidden') => new ProblemException(403, detail, code)
export const notFound = (detail: string, code = 'not-found') => new ProblemException(404, detail, code)
export const conflict = (detail: string, code = 'conflict') => new ProblemException(409, detail, code)
export const tooMany = (detail: string) => new ProblemException(429, detail, 'rate-limit')

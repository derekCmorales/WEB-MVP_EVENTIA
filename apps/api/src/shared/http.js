import { AppError } from './errors.js'

export function ok(res, data, meta = null, status = 200) {
  res.status(status).json({
    success: true,
    data,
    error: null,
    meta,
  })
}

export function asyncHandler(handler) {
  return (req, res, next) => {
    try {
      handler(req, res, next)
    } catch (error) {
      next(error)
    }
  }
}

export function errorMiddleware(error, _req, res, next) {
  if (res.headersSent) {
    next(error)
    return
  }

  if (error instanceof SyntaxError) {
    res.status(400).json({
      success: false,
      data: null,
      error: 'El JSON no es válido',
      meta: null,
    })
    return
  }

  const known = error instanceof AppError
  const status = known ? error.status : 500
  const message = known ? error.message : 'Error interno del servidor'

  if (!known) {
    console.error(error)
  }

  res.status(status).json({
    success: false,
    data: null,
    error: message,
    meta: null,
  })
}

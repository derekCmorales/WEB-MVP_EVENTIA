import { AppError } from './errors.js'

const CLAVES_SUPLANTACION = ['usuarioId', 'userId']

export function rechazarIdentidadAjena(req, _res, next) {
  const propio = String(req.usuario.id)
  for (const clave of CLAVES_SUPLANTACION) {
    const valor = req.query?.[clave] ?? req.body?.[clave]
    if (valor == null || valor === '') continue
    if (String(valor) !== propio) {
      next(new AppError(403, 'No puedes consultar ni modificar datos de otro usuario'))
      return
    }
  }
  next()
}

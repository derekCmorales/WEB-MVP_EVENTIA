import { AppError } from './errors.js'

export function exigirSesion(usuarioService) {
  return (req, _res, next) => {
    const header = req.get('authorization') ?? ''
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
    const usuario = token ? usuarioService.obtenerPorToken(token) : null
    if (!usuario) {
      next(new AppError(401, 'Inicia sesión para continuar'))
      return
    }
    req.usuario = usuario
    next()
  }
}

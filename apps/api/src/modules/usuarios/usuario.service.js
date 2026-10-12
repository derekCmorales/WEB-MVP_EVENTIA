import { randomBytes, randomUUID } from 'node:crypto'
import { AppError } from '../../shared/errors.js'
import { hashPassword, verifyPassword } from '../../shared/password.js'
import {
  contrasenaValida,
  correoValido,
  cuerpoObjeto,
  textoObligatorio,
} from '../../shared/validate.js'

export function usuarioPublico(usuario) {
  return {
    id: usuario.id,
    nombre: usuario.nombre,
    correo: usuario.correo,
    creadoEn: usuario.creadoEn,
  }
}

function nuevoToken() {
  return randomBytes(24).toString('hex')
}

export class UsuarioService {
  constructor({ usuarios, organizaEventos, tieneInscripciones }) {
    this.usuarios = usuarios
    this.organizaEventos = organizaEventos
    this.tieneInscripciones = tieneInscripciones
  }

  registrar(body) {
    const datos = cuerpoObjeto(body)
    const nombre = textoObligatorio(datos.nombre, 'El nombre', 80)
    const correo = correoValido(datos.correo)
    const contrasena = contrasenaValida(datos.contrasena)

    if (this.usuarios.findByCorreo(correo)) {
      throw new AppError(409, 'Ese correo ya está registrado')
    }

    const usuario = this.usuarios.create({
      id: randomUUID(),
      nombre,
      correo,
      passwordHash: hashPassword(contrasena),
      token: nuevoToken(),
      creadoEn: new Date().toISOString(),
    })

    return { usuario: usuarioPublico(usuario), token: usuario.token }
  }

  iniciarSesion(body) {
    const datos = cuerpoObjeto(body)
    const correo = correoValido(datos.correo)
    const contrasena = contrasenaValida(datos.contrasena)
    const usuario = this.usuarios.findByCorreo(correo)

    if (!usuario || !verifyPassword(contrasena, usuario.passwordHash)) {
      throw new AppError(401, 'Correo o contraseña incorrectos')
    }

    const actualizado = this.usuarios.update(usuario.id, { token: nuevoToken() })
    return { usuario: usuarioPublico(actualizado), token: actualizado.token }
  }

  obtenerPorToken(token) {
    const usuario = this.usuarios.findByToken(token)
    return usuario ? usuarioPublico(usuario) : null
  }

  actualizar(id, body) {
    const datos = cuerpoObjeto(body)
    const nombre = textoObligatorio(datos.nombre, 'El nombre', 80)
    const actualizado = this.usuarios.update(id, { nombre })
    if (!actualizado) throw new AppError(404, 'Usuario no encontrado')
    return usuarioPublico(actualizado)
  }

  eliminar(id) {
    if (!this.usuarios.findById(id)) throw new AppError(404, 'Usuario no encontrado')
    if (this.organizaEventos(id)) {
      throw new AppError(409, 'No se puede eliminar porque publicó eventos')
    }
    if (this.tieneInscripciones(id)) {
      throw new AppError(409, 'No se puede eliminar porque tiene inscripciones')
    }
    this.usuarios.delete(id)
    return { id }
  }
}

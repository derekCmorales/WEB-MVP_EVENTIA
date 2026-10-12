import { AppError } from './errors.js'

export function cuerpoObjeto(body) {
  if (body == null || typeof body !== 'object' || Array.isArray(body)) {
    throw new AppError(400, 'El cuerpo de la solicitud no es válido')
  }
  return body
}

export function textoObligatorio(valor, etiqueta, maximo) {
  if (typeof valor !== 'string' || valor.trim() === '') {
    throw new AppError(400, `${etiqueta} es obligatorio`)
  }
  const limpio = valor.trim()
  if (limpio.length > maximo) {
    throw new AppError(400, `${etiqueta} admite máximo ${maximo} caracteres`)
  }
  return limpio
}

export function correoValido(valor) {
  const correo = textoObligatorio(valor, 'El correo', 120).toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
    throw new AppError(400, 'El correo no es válido')
  }
  return correo
}

export function contrasenaValida(valor) {
  if (typeof valor !== 'string' || valor.length < 6 || valor.length > 72) {
    throw new AppError(400, 'La contraseña debe tener entre 6 y 72 caracteres')
  }
  return valor
}

export function cupoValido(valor) {
  if (!Number.isInteger(valor) || valor < 1 || valor > 500) {
    throw new AppError(400, 'El cupo debe ser un entero entre 1 y 500')
  }
  return valor
}

export function fechaValida(valor) {
  const fecha = textoObligatorio(valor, 'La fecha', 40)
  const instante = new Date(fecha)
  if (Number.isNaN(instante.getTime())) {
    throw new AppError(400, 'La fecha no es válida')
  }
  return fecha
}

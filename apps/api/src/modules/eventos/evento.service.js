import { randomUUID } from 'node:crypto'
import { AppError } from '../../shared/errors.js'
import { calcularCupoDisponible } from '../eventos/cupo.js'
import {
  cuerpoObjeto,
  cupoValido,
  fechaValida,
  textoObligatorio,
} from '../../shared/validate.js'

function leerEvento(body, parcial) {
  const datos = cuerpoObjeto(body)
  const resultado = {}
  const campos = [
    ['titulo', () => textoObligatorio(datos.titulo, 'El título', 120)],
    ['descripcion', () => textoObligatorio(datos.descripcion, 'La descripción', 1000)],
    ['lugar', () => textoObligatorio(datos.lugar, 'El lugar', 160)],
    ['fecha', () => fechaValida(datos.fecha)],
    ['cupo', () => cupoValido(datos.cupo)],
  ]

  for (const [campo, leer] of campos) {
    if (!parcial || datos[campo] !== undefined) {
      resultado[campo] = leer()
    }
  }

  if (parcial && Object.keys(resultado).length === 0) {
    throw new AppError(400, 'No hay datos para actualizar')
  }

  return resultado
}

export class EventoService {
  constructor({ eventos, existeUsuario, contarInscripciones, obtenerUsuario }) {
    this.eventos = eventos
    this.existeUsuario = existeUsuario
    this.contarInscripciones = contarInscripciones
    this.obtenerUsuario = obtenerUsuario
  }

  listar(texto = '') {
    const consulta = typeof texto === 'string' ? texto.slice(0, 100) : ''
    const lista = this.eventos
      .buscar(consulta)
      .map((evento) => this.#publico(evento))
      .sort((a, b) => a.fecha.localeCompare(b.fecha))
    return lista
  }

  obtener(id) {
    const evento = this.eventos.findById(id)
    if (!evento) throw new AppError(404, 'Evento no encontrado')
    return this.#publico(evento)
  }

  crear(organizadorId, body) {
    if (!this.existeUsuario(organizadorId)) {
      throw new AppError(404, 'El organizador no existe')
    }
    const datos = leerEvento(body, false)
    const evento = this.eventos.create({
      id: randomUUID(),
      ...datos,
      organizadorId,
      creadoEn: new Date().toISOString(),
    })
    return this.#publico(evento)
  }

  actualizar(eventoId, organizadorId, body) {
    const actual = this.#exigirPropietario(eventoId, organizadorId)
    const cambios = leerEvento(body, true)
    const cupo = cambios.cupo ?? actual.cupo
    const inscritos = this.contarInscripciones(eventoId)
    if (cupo < inscritos) {
      throw new AppError(409, 'El cupo no puede ser menor que las inscripciones ya hechas')
    }
    const actualizado = this.eventos.update(eventoId, cambios)
    return this.#publico(actualizado)
  }

  eliminar(eventoId, organizadorId) {
    this.#exigirPropietario(eventoId, organizadorId)
    if (this.contarInscripciones(eventoId) > 0) {
      throw new AppError(409, 'No se puede eliminar porque ya tiene inscripciones')
    }
    this.eventos.delete(eventoId)
    return { id: eventoId }
  }

  #exigirPropietario(eventoId, organizadorId) {
    const evento = this.eventos.findById(eventoId)
    if (!evento) throw new AppError(404, 'Evento no encontrado')
    if (evento.organizadorId !== organizadorId) {
      throw new AppError(403, 'Solo quien publicó el evento puede modificarlo')
    }
    return evento
  }

  #publico(evento) {
    const inscritos = this.contarInscripciones(evento.id)
    const organizador = this.obtenerUsuario(evento.organizadorId)
    return {
      id: evento.id,
      titulo: evento.titulo,
      descripcion: evento.descripcion,
      lugar: evento.lugar,
      fecha: evento.fecha,
      cupo: evento.cupo,
      inscritos,
      cupoDisponible: calcularCupoDisponible(evento.cupo, inscritos),
      organizadorId: evento.organizadorId,
      organizadorNombre: organizador?.nombre ?? 'Organizador',
      creadoEn: evento.creadoEn,
    }
  }
}

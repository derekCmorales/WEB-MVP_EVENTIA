import { randomUUID } from 'node:crypto'
import { AppError } from '../../shared/errors.js'
import { cuerpoObjeto, textoObligatorio } from '../../shared/validate.js'

export class InscripcionService {
  constructor({ usuarios, inscripciones, eventoService }) {
    this.usuarios = usuarios
    this.inscripciones = inscripciones
    this.eventoService = eventoService
  }

  listar(usuarioId) {
    if (!this.usuarios.findById(usuarioId)) {
      throw new AppError(404, 'Usuario no encontrado')
    }

    return this.inscripciones
      .listarPorUsuario(usuarioId)
      .map((inscripcion) => ({
        id: inscripcion.id,
        creadoEn: inscripcion.creadoEn,
        evento: this.eventoService.obtener(inscripcion.eventoId),
      }))
      .sort((a, b) => b.creadoEn.localeCompare(a.creadoEn))
  }

  inscribir(usuarioId, body) {
    if (!this.usuarios.findById(usuarioId)) {
      throw new AppError(404, 'Usuario no encontrado')
    }

    const datos = cuerpoObjeto(body)
    const eventoId = textoObligatorio(datos.eventoId, 'El evento', 80)
    const disponibilidad = this.eventoService.obtener(eventoId)

    if (this.inscripciones.existe(usuarioId, eventoId)) {
      throw new AppError(409, 'Ya estás inscrito a este evento')
    }
    if (disponibilidad.cupoDisponible <= 0) {
      throw new AppError(409, 'El evento no tiene cupo disponible')
    }

    const inscripcion = this.inscripciones.create({
      id: randomUUID(),
      usuarioId,
      eventoId,
      creadoEn: new Date().toISOString(),
    })

    return {
      id: inscripcion.id,
      creadoEn: inscripcion.creadoEn,
      evento: this.eventoService.obtener(eventoId),
    }
  }
}

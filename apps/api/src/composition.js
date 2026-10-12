import { EventoRepository } from './modules/eventos/evento.repository.js'
import { EventoService } from './modules/eventos/evento.service.js'
import { InscripcionRepository } from './modules/usuarios/inscripcion.repository.js'
import { InscripcionService } from './modules/usuarios/inscripcion.service.js'
import { UsuarioRepository } from './modules/usuarios/usuario.repository.js'
import { UsuarioService } from './modules/usuarios/usuario.service.js'

// Monolito modular: Usuarios y Eventos no se importan entre sí.
// Aquí se inyectan los puertos que materializan las dependencias.
export function crearServicios(store) {
  const usuarios = new UsuarioRepository(store)
  const eventos = new EventoRepository(store)
  const inscripciones = new InscripcionRepository(store)

  const eventoService = new EventoService({
    eventos,
    existeUsuario: (id) => usuarios.findById(id) != null,
    contarInscripciones: (eventoId) => inscripciones.contarPorEvento(eventoId),
    obtenerUsuario: (id) => {
      const usuario = usuarios.findById(id)
      return usuario ? { nombre: usuario.nombre } : null
    },
  })

  const usuarioService = new UsuarioService({
    usuarios,
    organizaEventos: (id) => eventos.contarPorOrganizador(id) > 0,
    tieneInscripciones: (id) => inscripciones.contarPorUsuario(id) > 0,
  })

  const inscripcionService = new InscripcionService({
    usuarios,
    inscripciones,
    eventoService,
  })

  return { usuarioService, eventoService, inscripcionService }
}

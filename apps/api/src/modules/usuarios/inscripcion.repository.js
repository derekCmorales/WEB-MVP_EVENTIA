export class InscripcionRepository {
  constructor(store) {
    this.store = store
  }

  listarPorUsuario(usuarioId) {
    return this.store
      .read()
      .inscripciones.filter((item) => item.usuarioId === usuarioId)
      .map((item) => ({ ...item }))
  }

  contarPorEvento(eventoId) {
    return this.store.read().inscripciones.filter((item) => item.eventoId === eventoId).length
  }

  contarPorUsuario(usuarioId) {
    return this.store.read().inscripciones.filter((item) => item.usuarioId === usuarioId).length
  }

  existe(usuarioId, eventoId) {
    return this.store
      .read()
      .inscripciones.some((item) => item.usuarioId === usuarioId && item.eventoId === eventoId)
  }

  create(inscripcion) {
    this.store.update((data) => ({
      ...data,
      inscripciones: [...data.inscripciones, inscripcion],
    }))
    return { ...inscripcion }
  }
}

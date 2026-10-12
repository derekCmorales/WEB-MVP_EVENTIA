export class EventoRepository {
  constructor(store) {
    this.store = store
  }

  findAll() {
    return this.store.read().eventos.map((evento) => ({ ...evento }))
  }

  findById(id) {
    const evento = this.store.read().eventos.find((item) => item.id === id)
    return evento ? { ...evento } : null
  }

  buscar(texto) {
    const consulta = texto.trim().toLowerCase()
    return this.findAll().filter((evento) => {
      if (!consulta) return true
      return [evento.titulo, evento.descripcion, evento.lugar]
        .join(' ')
        .toLowerCase()
        .includes(consulta)
    })
  }

  contarPorOrganizador(organizadorId) {
    return this.store.read().eventos.filter((evento) => evento.organizadorId === organizadorId)
      .length
  }

  create(evento) {
    this.store.update((data) => ({
      ...data,
      eventos: [...data.eventos, evento],
    }))
    return { ...evento }
  }

  update(id, cambios) {
    const actual = this.findById(id)
    if (!actual) return null
    const actualizado = { ...actual, ...cambios }
    this.store.update((data) => ({
      ...data,
      eventos: data.eventos.map((evento) => (evento.id === id ? actualizado : evento)),
    }))
    return { ...actualizado }
  }

  delete(id) {
    const existe = this.findById(id)
    if (!existe) return false
    this.store.update((data) => ({
      ...data,
      eventos: data.eventos.filter((evento) => evento.id !== id),
    }))
    return true
  }
}

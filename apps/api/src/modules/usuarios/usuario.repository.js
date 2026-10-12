export class UsuarioRepository {
  constructor(store) {
    this.store = store
  }

  findAll() {
    return this.store.read().usuarios.map((usuario) => ({ ...usuario }))
  }

  findById(id) {
    const usuario = this.store.read().usuarios.find((item) => item.id === id)
    return usuario ? { ...usuario } : null
  }

  findByCorreo(correo) {
    const normalizado = correo.toLowerCase()
    const usuario = this.store.read().usuarios.find(
      (item) => item.correo.toLowerCase() === normalizado,
    )
    return usuario ? { ...usuario } : null
  }

  findByToken(token) {
    const usuario = this.store.read().usuarios.find((item) => item.token === token)
    return usuario ? { ...usuario } : null
  }

  create(usuario) {
    this.store.update((data) => ({
      ...data,
      usuarios: [...data.usuarios, usuario],
    }))
    return { ...usuario }
  }

  update(id, cambios) {
    const actual = this.findById(id)
    if (!actual) return null
    const actualizado = { ...actual, ...cambios }
    this.store.update((data) => ({
      ...data,
      usuarios: data.usuarios.map((usuario) => (usuario.id === id ? actualizado : usuario)),
    }))
    return { ...actualizado }
  }

  delete(id) {
    const existe = this.findById(id)
    if (!existe) return false
    this.store.update((data) => ({
      ...data,
      usuarios: data.usuarios.filter((usuario) => usuario.id !== id),
    }))
    return true
  }
}

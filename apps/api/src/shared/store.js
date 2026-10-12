import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { createSeedData } from '../seed.js'

const VACIO = {
  usuarios: [],
  eventos: [],
  inscripciones: [],
}

export class MemoryStore {
  constructor(initial = VACIO) {
    this.data = {
      usuarios: [...initial.usuarios],
      eventos: [...initial.eventos],
      inscripciones: [...initial.inscripciones],
    }
  }

  read() {
    return this.data
  }

  update(recipe) {
    this.data = recipe(this.data)
  }
}

export class FileStore {
  constructor(filePath) {
    this.filePath = filePath
    this.data = this.#load()
  }

  read() {
    return this.data
  }

  update(recipe) {
    this.data = recipe(this.data)
    this.#save()
  }

  #load() {
    if (!existsSync(this.filePath)) return structuredClone(VACIO)
    let parsed
    try {
      parsed = JSON.parse(readFileSync(this.filePath, 'utf8'))
    } catch {
      throw new Error(`No se pudo leer el almacén en ${this.filePath}`)
    }
    return {
      usuarios: Array.isArray(parsed.usuarios) ? parsed.usuarios : [],
      eventos: Array.isArray(parsed.eventos) ? parsed.eventos : [],
      inscripciones: Array.isArray(parsed.inscripciones) ? parsed.inscripciones : [],
    }
  }

  #save() {
    mkdirSync(dirname(this.filePath), { recursive: true })
    const temporal = `${this.filePath}.tmp`
    writeFileSync(temporal, JSON.stringify(this.data, null, 2))
    renameSync(temporal, this.filePath)
  }
}

export function abrirAlmacen(filePath) {
  const store = new FileStore(filePath)
  if (store.read().usuarios.length === 0) {
    const semilla = createSeedData()
    store.update(() => semilla)
  }
  return store
}

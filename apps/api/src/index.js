import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createApp } from './app.js'
import { abrirAlmacen } from './shared/store.js'

const raiz = dirname(fileURLToPath(import.meta.url))
const archivo = join(raiz, '../data/db.json')
const store = abrirAlmacen(archivo)
const app = createApp(store)
const puerto = Number(process.env.PORT) || 3001

app.listen(puerto, () => {
  console.log(`EventIA API en http://localhost:${puerto}`)
})

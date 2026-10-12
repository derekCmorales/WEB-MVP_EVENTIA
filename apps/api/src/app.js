import cors from 'cors'
import express from 'express'
import { crearServicios } from './composition.js'
import { registrarRutasEvento } from './modules/eventos/evento.routes.js'
import { registrarRutasUsuario } from './modules/usuarios/usuario.routes.js'
import { leerConfig } from './shared/config.js'
import { errorMiddleware, ok } from './shared/http.js'

export function createApp(store) {
  const servicios = crearServicios(store)
  const app = express()
  const { corsOrigin } = leerConfig()

  app.disable('x-powered-by')
  app.use(
    cors(
      corsOrigin
        ? { origin: corsOrigin, methods: ['GET', 'POST', 'PATCH', 'DELETE'] }
        : undefined,
    ),
  )
  app.use(express.json({ limit: '100kb' }))

  app.get('/api/salud', (_req, res) => {
    ok(res, { servicio: 'eventia' })
  })

  registrarRutasUsuario(app, servicios)
  registrarRutasEvento(app, servicios)
  app.use(errorMiddleware)

  return app
}

import { asyncHandler, ok } from '../../shared/http.js'
import { exigirSesion } from '../../shared/sesion.js'

export function registrarRutasEvento(app, { usuarioService, eventoService }) {
  const sesion = exigirSesion(usuarioService)

  app.get('/api/eventos', asyncHandler((req, res) => {
    const data = eventoService.listar(req.query.q)
    ok(res, data, { total: data.length })
  }))

  app.get('/api/eventos/:id', asyncHandler((req, res) => {
    ok(res, eventoService.obtener(req.params.id))
  }))

  app.post('/api/eventos', sesion, asyncHandler((req, res) => {
    ok(res, eventoService.crear(req.usuario.id, req.body), null, 201)
  }))

  app.patch('/api/eventos/:id', sesion, asyncHandler((req, res) => {
    ok(res, eventoService.actualizar(req.params.id, req.usuario.id, req.body))
  }))

  app.delete('/api/eventos/:id', sesion, asyncHandler((req, res) => {
    ok(res, eventoService.eliminar(req.params.id, req.usuario.id))
  }))
}

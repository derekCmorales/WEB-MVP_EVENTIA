import { asyncHandler, ok } from '../../shared/http.js'
import { exigirSesion } from '../../shared/sesion.js'

export function registrarRutasUsuario(app, { usuarioService, inscripcionService }) {
  const sesion = exigirSesion(usuarioService)
  app.post('/api/usuarios', asyncHandler((req, res) => {
    ok(res, usuarioService.registrar(req.body), null, 201)
  }))

  app.post('/api/sesion', asyncHandler((req, res) => {
    ok(res, usuarioService.iniciarSesion(req.body))
  }))

  app.get('/api/sesion/yo', sesion, asyncHandler((req, res) => {
    ok(res, req.usuario)
  }))

  app.patch('/api/usuarios/yo', sesion, asyncHandler((req, res) => {
    ok(res, usuarioService.actualizar(req.usuario.id, req.body))
  }))

  app.delete('/api/usuarios/yo', sesion, asyncHandler((req, res) => {
    ok(res, usuarioService.eliminar(req.usuario.id))
  }))

  app.get('/api/usuarios/yo/inscripciones', sesion, asyncHandler((req, res) => {
    const data = inscripcionService.listar(req.usuario.id)
    ok(res, data, { total: data.length })
  }))

  app.post('/api/usuarios/yo/inscripciones', sesion, asyncHandler((req, res) => {
    ok(res, inscripcionService.inscribir(req.usuario.id, req.body), null, 201)
  }))
}

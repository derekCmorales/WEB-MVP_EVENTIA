import assert from 'node:assert/strict'
import { once } from 'node:events'
import test from 'node:test'
import { createApp } from '../src/app.js'
import { createSeedData, DEMO_PASSWORD } from '../src/seed.js'
import { MemoryStore } from '../src/shared/store.js'

test('solo el organizador puede modificar su evento', async () => {
  const app = createApp(new MemoryStore(createSeedData()))
  const server = await escuchar(app)

  try {
    const ana = await iniciarSesion(server.base, 'ana@eventia.dev')
    const luis = await iniciarSesion(server.base, 'luis@eventia.dev')

    const intento = await api(server.base, '/api/eventos/evt-foto', {
      method: 'PATCH',
      token: luis.token,
      body: { titulo: 'Intento de cambio ajeno' },
    })

    assert.equal(intento.status, 403)
    assert.match(intento.payload.error, /organizador|publicó/i)

    const detalle = await api(server.base, '/api/eventos/evt-foto')
    assert.equal(detalle.payload.data.titulo, 'Taller de fotografía nocturna')

    const borrado = await api(server.base, '/api/eventos/evt-foto', {
      method: 'DELETE',
      token: luis.token,
    })
    assert.equal(borrado.status, 403)

    const sigue = await api(server.base, '/api/eventos/evt-foto')
    assert.equal(sigue.status, 200)
    assert.ok(ana.token)
  } finally {
    await cerrar(server)
  }
})

test('no se pueden consultar inscripciones ajenas con usuarioId en la solicitud', async () => {
  const app = createApp(new MemoryStore(createSeedData()))
  const server = await escuchar(app)

  try {
    const ana = await iniciarSesion(server.base, 'ana@eventia.dev')

    const ajeno = await api(server.base, '/api/usuarios/yo/inscripciones?usuarioId=usr-luis', {
      token: ana.token,
    })
    assert.equal(ajeno.status, 403)
    assert.match(ajeno.payload.error, /otro usuario/i)

    const propias = await api(server.base, '/api/usuarios/yo/inscripciones', {
      token: ana.token,
    })
    assert.equal(propias.status, 200)
    assert.equal(propias.payload.meta.total, 0)
  } finally {
    await cerrar(server)
  }
})

test('no se puede inscribir en nombre de otro usuario', async () => {
  const app = createApp(new MemoryStore(createSeedData()))
  const server = await escuchar(app)

  try {
    const ana = await iniciarSesion(server.base, 'ana@eventia.dev')

    const suplantacion = await api(server.base, '/api/usuarios/yo/inscripciones', {
      method: 'POST',
      token: ana.token,
      body: { eventoId: 'evt-foto', usuarioId: 'usr-luis' },
    })
    assert.equal(suplantacion.status, 403)

    const propias = await api(server.base, '/api/usuarios/yo/inscripciones', { token: ana.token })
    assert.equal(propias.payload.meta.total, 0)
  } finally {
    await cerrar(server)
  }
})

test('los tokens de demostración ya no son valores fijos predecibles', () => {
  const a = createSeedData()
  const b = createSeedData()
  assert.notEqual(a.usuarios[0].token, 'token-ana-demo')
  assert.notEqual(a.usuarios[0].token, b.usuarios[0].token)
})

async function iniciarSesion(base, correo) {
  const acceso = await api(base, '/api/sesion', {
    method: 'POST',
    body: { correo, contrasena: DEMO_PASSWORD },
  })
  assert.equal(acceso.status, 200)
  return { token: acceso.payload.data.token, usuario: acceso.payload.data.usuario }
}

async function escuchar(app) {
  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const puerto = server.address().port
  return { server, base: `http://127.0.0.1:${puerto}` }
}

async function cerrar({ server }) {
  server.closeAllConnections?.()
  server.close()
  await once(server, 'close')
}

async function api(base, path, { method = 'GET', token, body } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const payload = await response.json()
  return { status: response.status, payload }
}

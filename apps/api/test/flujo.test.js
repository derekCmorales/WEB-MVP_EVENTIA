import assert from 'node:assert/strict'
import { once } from 'node:events'
import test from 'node:test'
import { createApp } from '../src/app.js'
import { calcularCupoDisponible } from '../src/modules/eventos/cupo.js'
import { createSeedData, DEMO_PASSWORD } from '../src/seed.js'
import { MemoryStore } from '../src/shared/store.js'

test('el cupo disponible resta inscritos y no baja de cero', () => {
  assert.equal(calcularCupoDisponible(2, 1), 1)
  assert.equal(calcularCupoDisponible(2, 2), 0)
  assert.equal(calcularCupoDisponible(2, 3), 0)
})

test('flujo principal: consultar, ver cupo, inscribir y agotar el lugar', async () => {
  const app = createApp(new MemoryStore(createSeedData()))
  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const base = `http://127.0.0.1:${server.address().port}`

  try {
    const busqueda = await api(base, '/api/eventos?q=cine')
    assert.equal(busqueda.status, 200)
    assert.equal(busqueda.payload.data.length, 1)
    assert.equal(busqueda.payload.data[0].cupoDisponible, 1)

    const detalle = await api(base, '/api/eventos/evt-cine')
    assert.equal(detalle.payload.data.cupo, 2)
    assert.equal(detalle.payload.data.inscritos, 1)
    assert.equal(detalle.payload.data.cupoDisponible, 1)

    const sinSesion = await api(base, '/api/usuarios/yo/inscripciones', {
      method: 'POST',
      body: { eventoId: 'evt-cine' },
    })
    assert.equal(sinSesion.status, 401)

    const acceso = await api(base, '/api/sesion', {
      method: 'POST',
      body: { correo: 'ana@eventia.dev', contrasena: DEMO_PASSWORD },
    })
    assert.equal(acceso.status, 200)
    const token = acceso.payload.data.token

    const inscripcion = await api(base, '/api/usuarios/yo/inscripciones', {
      method: 'POST',
      token,
      body: { eventoId: 'evt-cine' },
    })
    assert.equal(inscripcion.status, 201)
    assert.equal(inscripcion.payload.data.evento.cupoDisponible, 0)
    assert.equal(inscripcion.payload.data.evento.inscritos, 2)

    const repetida = await api(base, '/api/usuarios/yo/inscripciones', {
      method: 'POST',
      token,
      body: { eventoId: 'evt-cine' },
    })
    assert.equal(repetida.status, 409)

    const mias = await api(base, '/api/usuarios/yo/inscripciones', { token })
    assert.equal(mias.payload.meta.total, 1)
    assert.equal(mias.payload.data[0].evento.id, 'evt-cine')
    assert.equal(mias.payload.data[0].evento.cupoDisponible, 0)

    const luis = await api(base, '/api/sesion', {
      method: 'POST',
      body: { correo: 'luis@eventia.dev', contrasena: DEMO_PASSWORD },
    })
    const sinLugar = await api(base, '/api/eventos', {
      method: 'POST',
      token: luis.payload.data.token,
      body: {
        titulo: 'Mesa de dos',
        descripcion: 'Un evento mínimo para llenar el cupo.',
        lugar: 'Sala 1',
        fecha: '2026-11-01T18:00',
        cupo: 1,
      },
    })
    const eventoId = sinLugar.payload.data.id
    await api(base, '/api/usuarios/yo/inscripciones', {
      method: 'POST',
      token: luis.payload.data.token,
      body: { eventoId },
    })
    const lleno = await api(base, '/api/usuarios/yo/inscripciones', {
      method: 'POST',
      token,
      body: { eventoId },
    })
    assert.equal(lleno.status, 409)
    assert.match(lleno.payload.error, /cupo/)
  } finally {
    server.closeAllConnections?.()
    server.close()
    await once(server, 'close')
  }
})

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

async function request(path, { method = 'GET', token, body, signal } = {}) {
  let response
  try {
    response = await fetch(`/api${path}`, {
      method,
      signal,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch (error) {
    if (error.name === 'AbortError') throw error
    throw new Error('No se pudo conectar con la API')
  }

  let payload
  try {
    payload = await response.json()
  } catch {
    throw new Error('Respuesta inválida del servidor')
  }

  if (!response.ok || !payload.success) {
    const error = new Error(payload.error || 'No se pudo completar la solicitud')
    error.status = response.status
    throw error
  }

  return payload
}

export function listarEventos(q, signal) {
  const params = new URLSearchParams()
  if (q.trim()) params.set('q', q.trim())
  const consulta = params.toString()
  return request(`/eventos${consulta ? `?${consulta}` : ''}`, { signal })
}

export function obtenerEvento(id) {
  return request(`/eventos/${id}`)
}

export function crearEvento(token, datos) {
  return request('/eventos', { method: 'POST', token, body: datos })
}

export function actualizarEvento(token, id, datos) {
  return request(`/eventos/${id}`, { method: 'PATCH', token, body: datos })
}

export function eliminarEvento(token, id) {
  return request(`/eventos/${id}`, { method: 'DELETE', token })
}

export function registrarUsuario(datos) {
  return request('/usuarios', { method: 'POST', body: datos })
}

export function iniciarSesion(datos) {
  return request('/sesion', { method: 'POST', body: datos })
}

export function obtenerYo(token) {
  return request('/sesion/yo', { token })
}

export function listarInscripciones(token) {
  return request('/usuarios/yo/inscripciones', { token })
}

export function inscribirme(token, eventoId) {
  return request('/usuarios/yo/inscripciones', {
    method: 'POST',
    token,
    body: { eventoId },
  })
}

import { useState } from 'react'
import { registrarUsuario } from '../api.js'
import { Campo } from './Campo.jsx'

export function Registro({ onListo, onIrAcceso }) {
  const [nombre, setNombre] = useState('')
  const [correo, setCorreo] = useState('')
  const [contrasena, setContrasena] = useState('')
  const [error, setError] = useState('')
  const [pendiente, setPendiente] = useState(false)

  async function crear(event) {
    event.preventDefault()
    setPendiente(true)
    setError('')
    try {
      const respuesta = await registrarUsuario({ nombre, correo, contrasena })
      onListo(respuesta.data)
    } catch (fallo) {
      setError(fallo.message)
    } finally {
      setPendiente(false)
    }
  }

  return (
    <section className="bloque estrecho">
      <h1>Crear cuenta</h1>
      <p>Con tu cuenta puedes publicar eventos e inscribirte.</p>
      <form className="formulario" onSubmit={crear}>
        <Campo
          id="registro-nombre"
          etiqueta="Nombre"
          autoComplete="name"
          value={nombre}
          onChange={(event) => setNombre(event.target.value)}
          required
          maxLength={80}
        />
        <Campo
          id="registro-correo"
          etiqueta="Correo"
          type="email"
          autoComplete="email"
          value={correo}
          onChange={(event) => setCorreo(event.target.value)}
          required
        />
        <Campo
          id="registro-contrasena"
          etiqueta="Contraseña"
          type="password"
          autoComplete="new-password"
          value={contrasena}
          onChange={(event) => setContrasena(event.target.value)}
          required
          minLength={6}
        />
        {error ? <p role="alert">{error}</p> : null}
        <button type="submit" className="solido" disabled={pendiente}>
          {pendiente ? 'Creando…' : 'Registrarme'}
        </button>
      </form>
      <button type="button" className="enlace" onClick={onIrAcceso}>
        Ya tengo cuenta
      </button>
    </section>
  )
}

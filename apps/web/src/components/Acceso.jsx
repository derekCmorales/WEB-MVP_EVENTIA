import { useState } from 'react'
import { iniciarSesion } from '../api.js'
import { Campo } from './Campo.jsx'

export function Acceso({ onListo, onIrRegistro }) {
  const [correo, setCorreo] = useState('')
  const [contrasena, setContrasena] = useState('')
  const [error, setError] = useState('')
  const [pendiente, setPendiente] = useState(false)

  async function entrar(datos) {
    setPendiente(true)
    setError('')
    try {
      const respuesta = await iniciarSesion(datos)
      onListo(respuesta.data)
    } catch (fallo) {
      setError(fallo.message)
    } finally {
      setPendiente(false)
    }
  }

  return (
    <section className="bloque estrecho">
      <h1>Entrar</h1>
      <p>Usa tu cuenta para inscribirte y consultar tus lugares.</p>
      <form
        className="formulario"
        onSubmit={(event) => {
          event.preventDefault()
          entrar({ correo, contrasena })
        }}
      >
        <Campo
          id="acceso-correo"
          etiqueta="Correo"
          type="email"
          autoComplete="email"
          value={correo}
          onChange={(event) => setCorreo(event.target.value)}
          required
        />
        <Campo
          id="acceso-contrasena"
          etiqueta="Contraseña"
          type="password"
          autoComplete="current-password"
          value={contrasena}
          onChange={(event) => setContrasena(event.target.value)}
          required
        />
        {error ? <p role="alert">{error}</p> : null}
        <button type="submit" className="solido" disabled={pendiente}>
          {pendiente ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
      <div className="demo">
        <p>Cuentas de demostración, contraseña demo1234:</p>
        <button type="button" onClick={() => entrar({ correo: 'ana@eventia.dev', contrasena: 'demo1234' })}>
          Entrar como Ana
        </button>
        <button type="button" onClick={() => entrar({ correo: 'luis@eventia.dev', contrasena: 'demo1234' })}>
          Entrar como Luis
        </button>
      </div>
      <button type="button" className="enlace" onClick={onIrRegistro}>
        Crear una cuenta
      </button>
    </section>
  )
}

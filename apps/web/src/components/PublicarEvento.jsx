import { useState } from 'react'
import { crearEvento } from '../api.js'
import { EVENTO_VACIO, FormularioEvento } from './FormularioEvento.jsx'

export function PublicarEvento({ token, onCreado }) {
  const [valor, setValor] = useState(EVENTO_VACIO)
  const [error, setError] = useState('')
  const [pendiente, setPendiente] = useState(false)

  async function publicar() {
    setPendiente(true)
    setError('')
    try {
      const respuesta = await crearEvento(token, valor)
      onCreado(respuesta.data.id)
    } catch (fallo) {
      setError(fallo.message)
    } finally {
      setPendiente(false)
    }
  }

  return (
    <section className="bloque estrecho">
      <h1>Publicar un evento</h1>
      <p>Quedará a tu nombre. El cupo es el máximo de personas que pueden inscribirse.</p>
      <FormularioEvento
        idPrefijo="nuevo"
        valor={valor}
        onChange={setValor}
        onSubmit={publicar}
        textoBoton="Publicar evento"
        error={error}
        pendiente={pendiente}
      />
    </section>
  )
}

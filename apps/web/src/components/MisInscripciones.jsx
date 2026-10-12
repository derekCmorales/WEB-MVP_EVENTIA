import { useEffect, useState } from 'react'
import { listarInscripciones } from '../api.js'
import { formatoFecha, textoCupo } from '../formato.js'

export function MisInscripciones({ token, recarga, onAbrir }) {
  const [items, setItems] = useState([])
  const [error, setError] = useState('')
  const [listo, setListo] = useState(false)

  useEffect(() => {
    let activo = true
    listarInscripciones(token)
      .then((respuesta) => {
        if (!activo) return
        setItems(respuesta.data)
        setListo(true)
      })
      .catch((fallo) => {
        if (activo) setError(fallo.message)
      })
    return () => {
      activo = false
    }
  }, [token, recarga])

  return (
    <section className="bloque">
      <h1>Mis inscripciones</h1>
      <p>Estos son los eventos en los que ya apartaste un lugar.</p>
      {error ? <p role="alert">{error}</p> : null}
      {listo && items.length === 0 ? <p className="vacio">Todavía no te inscribes a ningún evento.</p> : null}
      <div className="rejilla">
        {items.map((item) => (
          <button key={item.id} type="button" className="tarjeta" onClick={() => onAbrir(item.evento.id)}>
            <time dateTime={item.evento.fecha}>{formatoFecha(item.evento.fecha)}</time>
            <strong>{item.evento.titulo}</strong>
            <span>{item.evento.lugar}</span>
            <span className={item.evento.cupoDisponible > 0 ? 'cupo-pill' : 'cupo-pill agotado'}>
              {textoCupo(item.evento.cupoDisponible)}
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}

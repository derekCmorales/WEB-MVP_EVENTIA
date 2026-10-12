import { useEffect, useState } from 'react'
import { listarEventos } from '../api.js'
import { formatoFecha, textoCupo } from '../formato.js'

export function Explorar({ recarga, onAbrir }) {
  const [consulta, setConsulta] = useState('')
  const [eventos, setEventos] = useState([])
  const [estado, setEstado] = useState('cargando')
  const [error, setError] = useState('')

  useEffect(() => {
    const control = new AbortController()
    const espera = setTimeout(() => {
      setEstado('cargando')
      listarEventos(consulta, control.signal)
        .then((respuesta) => {
          setEventos(respuesta.data)
          setEstado('listo')
          setError('')
        })
        .catch((fallo) => {
          if (fallo.name === 'AbortError') return
          setEstado('error')
          setError(fallo.message)
        })
    }, 200)

    return () => {
      clearTimeout(espera)
      control.abort()
    }
  }, [consulta, recarga])

  return (
    <section className="bloque">
      <div className="intro">
        <p className="kicker">Actividades cerca de ti</p>
        <h1>Descubre un evento y aparta tu lugar.</h1>
        <p>Busca por nombre, descripción o lugar. El cupo se actualiza al inscribirte.</p>
      </div>
      <form role="search" onSubmit={(event) => event.preventDefault()}>
        <label className="campo" htmlFor="buscar">
          <span>Buscar eventos</span>
          <input
            id="buscar"
            value={consulta}
            onChange={(event) => setConsulta(event.target.value)}
            placeholder="Cine, bicicleta, jardín…"
          />
        </label>
      </form>
      {estado === 'cargando' && eventos.length === 0 ? <p>Cargando eventos…</p> : null}
      {error ? <p role="alert">{error}</p> : null}
      {estado === 'listo' && eventos.length === 0 ? (
        <p className="vacio">No hay eventos con esa búsqueda.</p>
      ) : null}
      <div className="rejilla">
        {eventos.map((evento) => (
          <button key={evento.id} type="button" className="tarjeta" onClick={() => onAbrir(evento.id)}>
            <time dateTime={evento.fecha}>{formatoFecha(evento.fecha)}</time>
            <strong>{evento.titulo}</strong>
            <span>{evento.lugar}</span>
            <span className={evento.cupoDisponible > 0 ? 'cupo-pill' : 'cupo-pill agotado'}>
              {textoCupo(evento.cupoDisponible)}
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}

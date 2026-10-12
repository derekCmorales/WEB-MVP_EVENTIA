import { useEffect, useState } from 'react'
import { actualizarEvento, eliminarEvento, inscribirme, listarInscripciones, obtenerEvento } from '../api.js'
import { formatoFecha, textoCupo } from '../formato.js'
import { FormularioEvento } from './FormularioEvento.jsx'

export function DetalleEvento({ eventoId, sesion, onInscrito, onEliminado, onRequiereSesion }) {
  const [evento, setEvento] = useState(null)
  const [yaInscrito, setYaInscrito] = useState(false)
  const [editando, setEditando] = useState(false)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [pendiente, setPendiente] = useState(false)

  useEffect(() => {
    let activo = true
    setError('')
    obtenerEvento(eventoId)
      .then((respuesta) => {
        if (activo) setEvento(respuesta.data)
      })
      .catch((fallo) => {
        if (activo) setError(fallo.message)
      })
    return () => {
      activo = false
    }
  }, [eventoId])

  useEffect(() => {
    if (!sesion) {
      setYaInscrito(false)
      return undefined
    }
    let activo = true
    listarInscripciones(sesion.token)
      .then((respuesta) => {
        if (!activo) return
        setYaInscrito(respuesta.data.some((item) => item.evento.id === eventoId))
      })
      .catch(() => {
        if (activo) setYaInscrito(false)
      })
    return () => {
      activo = false
    }
  }, [sesion, eventoId])

  async function inscribir() {
    if (!sesion) {
      onRequiereSesion()
      return
    }
    setPendiente(true)
    setError('')
    try {
      const respuesta = await inscribirme(sesion.token, eventoId)
      setEvento(respuesta.data.evento)
      setYaInscrito(true)
      setAviso('Inscripción realizada.')
      onInscrito()
    } catch (fallo) {
      setError(fallo.message)
    } finally {
      setPendiente(false)
    }
  }

  async function guardar(valor) {
    setPendiente(true)
    setError('')
    try {
      const respuesta = await actualizarEvento(sesion.token, eventoId, {
        titulo: valor.titulo,
        descripcion: valor.descripcion,
        lugar: valor.lugar,
        fecha: valor.fecha,
        cupo: Number(valor.cupo),
      })
      setEvento(respuesta.data)
      setEditando(false)
      setAviso('Evento actualizado.')
      onInscrito()
    } catch (fallo) {
      setError(fallo.message)
    } finally {
      setPendiente(false)
    }
  }

  async function eliminar() {
    setPendiente(true)
    setError('')
    try {
      await eliminarEvento(sesion.token, eventoId)
      onEliminado()
    } catch (fallo) {
      setError(fallo.message)
      setPendiente(false)
    }
  }

  if (error && !evento) return <p role="alert">{error}</p>
  if (!evento) return <p>Cargando evento…</p>

  const esOrganizador = sesion?.usuario.id === evento.organizadorId
  const ocupado = evento.cupo === 0 ? 0 : Math.round((evento.inscritos / evento.cupo) * 100)

  return (
    <article className="bloque estrecho detalle">
      <p className="kicker">{evento.organizadorNombre}</p>
      <h1>{evento.titulo}</h1>
      <p className="meta">
        <time dateTime={evento.fecha}>{formatoFecha(evento.fecha)}</time>
        <span>{evento.lugar}</span>
      </p>
      <p>{evento.descripcion}</p>
      <div className="disponibilidad">
        <div className="cupo-barra" style={{ '--ocupado': `${ocupado}%` }} aria-hidden="true">
          <span />
        </div>
        <p>
          <strong>{textoCupo(evento.cupoDisponible)}</strong>
          <span>
            {evento.inscritos} de {evento.cupo} lugares ocupados
          </span>
        </p>
      </div>
      {aviso ? <p role="status">{aviso}</p> : null}
      {error ? <p role="alert">{error}</p> : null}
      {editando ? (
        <FormularioEvento
          idPrefijo="editar"
          valor={evento}
          onChange={setEvento}
          onSubmit={() => guardar(evento)}
          textoBoton="Guardar cambios"
          error=""
          pendiente={pendiente}
        />
      ) : (
        <div className="acciones">
          <button type="button" className="solido" onClick={inscribir} disabled={pendiente || yaInscrito || evento.cupoDisponible <= 0}>
            {yaInscrito ? 'Ya estás inscrito' : evento.cupoDisponible <= 0 ? 'Cupo agotado' : 'Inscribirme'}
          </button>
          {esOrganizador ? (
            <>
              <button type="button" onClick={() => setEditando(true)}>
                Editar
              </button>
              <button type="button" onClick={eliminar} disabled={pendiente}>
                Eliminar
              </button>
            </>
          ) : null}
        </div>
      )}
    </article>
  )
}

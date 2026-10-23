import { useEffect, useState } from 'react'
import { api } from '../../lib/api'

type Status = { admitted: boolean; token: string | null; position: number; ahead: number; etaSeconds: number }

export default function QueueIsland({ sessionId }: { sessionId: string }) {
  const [status, setStatus] = useState<Status | null>(null)
  const [error, setError] = useState('')

  async function refresh() {
    const body = await api<Status>(`/v1/sessions/${sessionId}/queue`)
    setStatus(body)
  }

  useEffect(() => {
    const pull = () => refresh().catch((reason: Error) => {
      if (!reason.message.toLowerCase().includes('fila')) setError(reason.message)
    })
    pull()
    const timer = setInterval(pull, 2000)
    return () => clearInterval(timer)
  }, [sessionId])

  async function join() {
    setError('')
    try {
      const body = await api<Status>(`/v1/sessions/${sessionId}/queue`, {
        method: 'POST',
        body: JSON.stringify({ deviceId: 'web' }),
      })
      setStatus(body)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo entrar a la fila')
    }
  }

  return (
    <div className="stack" style={{ maxWidth: 560 }}>
      <div className="eyebrow">Fila</div>
      <h1 style={{ fontSize: 48 }}>Tu turno.</h1>
      {error && <p className="err">{error} <a href="/entrar">Entrar</a></p>}
      {!status && <button className="btn btn-a" type="button" onClick={join}>Pedir turno</button>}
      {status && !status.admitted && (
        <div className="card panel stack">
          <div className="price">Puesto {status.position}</div>
          <p className="help">{status.ahead} personas delante. Estimado: {Math.ceil(status.etaSeconds / 60)} min.</p>
          <button className="btn btn-s" type="button" onClick={join}>Actualizar turno</button>
        </div>
      )}
      {status?.admitted && (
        <div className="banner ok">
          <strong>Ya puedes apartar.</strong>
          <p>El pase de admisión dura unos minutos.</p>
          <a className="btn btn-a" href="/explorar" style={{ marginTop: 12 }}>Volver al evento</a>
        </div>
      )}
    </div>
  )
}

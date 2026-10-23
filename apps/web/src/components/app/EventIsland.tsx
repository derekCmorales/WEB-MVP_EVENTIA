import { useEffect, useState } from 'react'
import { toast } from '@eventia/ui'
import { api, currentUser, idempotency, money, when } from '../../lib/api'

type Detail = {
  title: string
  summary: string
  description: string
  city: string
  venueName: string
  address: string
  coverHue: string
  organizerName: string
  refundPolicy: string
  sessions: {
    id: string
    startsAt: string
    endsAt: string
    salesOpenAt: string
    queueEnabled: boolean
    zones: { id: string; name: string; kind: string; capacity: number; available: number; sold: number }[]
    ticketTypes: { id: string; name: string; zoneId: string; priceCents: number; feeCents: number; currency: string; perOrderLimit: number; available: number }[]
  }[]
}

const policies: Record<string, string> = {
  FLEXIBLE: 'Reembolso completo hasta que empiece.',
  MODERATE: 'Completo hasta 48 h antes; después, la mitad.',
  STRICT: 'Completo hasta 7 días antes.',
}

export default function EventIsland({ slug }: { slug: string }) {
  const [event, setEvent] = useState<Detail | null>(null)
  const [qty, setQty] = useState(1)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [admission, setAdmission] = useState<string | null>(null)
  const [queueNote, setQueueNote] = useState('')
  const [zoneId, setZoneId] = useState('')
  const [typeId, setTypeId] = useState('')

  useEffect(() => {
    api<Detail>(`/v1/events/${slug}`).then(setEvent).catch((reason: Error) => setError(reason.message))
  }, [slug])

  if (!event) return <p className="help">{error || 'Cargando el evento…'}</p>
  const session = event.sessions[0]
  const zone = session?.zones.find((item) => item.id === zoneId) ?? session?.zones[0]
  const type = session?.ticketTypes.find((item) => item.id === typeId) ?? session?.ticketTypes.find((item) => item.zoneId === zone?.id) ?? session?.ticketTypes[0]
  if (!session || !type || !zone) return <p className="err">Este evento todavía no tiene boletos.</p>
  const finalCents = type.priceCents + type.feeCents
  const salesOpen = new Date(session.salesOpenAt) <= new Date()

  async function apartar() {
    setBusy(true)
    setError('')
    try {
      if (!currentUser()) {
        window.location.href = '/entrar'
        return
      }
      const headers: Record<string, string> = { 'idempotency-key': idempotency(`hold:${session.id}:${type.id}:${qty}`) }
      if (admission) headers['x-admission-token'] = admission
      const hold = await api<{ id: string }>('/v1/holds', {
        method: 'POST',
        headers,
        body: JSON.stringify({ sessionId: session.id, items: [{ ticketTypeId: type.id, quantity: qty }] }),
      })
      window.location.href = `/checkout/${hold.id}`
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'No se pudo apartar'
      setError(message)
      toast(message)
      setBusy(false)
    }
  }

  async function pedirTurno() {
    setError('')
    try {
      if (!currentUser()) {
        window.location.href = '/entrar'
        return
      }
      const status = await api<{ admitted: boolean; token: string | null; position: number; ahead: number; etaSeconds: number }>(`/v1/sessions/${session.id}/queue`, {
        method: 'POST',
        body: JSON.stringify({ deviceId: 'web' }),
      })
      setAdmission(status.token)
      setQueueNote(status.admitted ? 'Ya puedes apartar.' : `Vas en el puesto ${status.position}. Delante: ${status.ahead}.`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo entrar a la fila')
    }
  }

  async function lista() {
    setError('')
    try {
      await api('/v1/waitlist', { method: 'POST', body: JSON.stringify({ sessionId: session.id, ticketTypeId: type.id }) })
      setQueueNote('Estás en la lista de espera. Si se libera un lugar, te apartamos uno por unos minutos.')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo entrar a la lista')
    }
  }

  return (
    <div className="split">
      <div className="stack">
        <div className="event-art card" style={{ height: 280, background: `linear-gradient(160deg, ${event.coverHue}, #1c1917 72%)` }} />
        <div className="eyebrow">{event.city} · {event.organizerName}</div>
        <h1 style={{ fontSize: '52px' }}>{event.title}</h1>
        <p style={{ fontSize: 18, color: 'var(--ink2)', maxWidth: 640 }}>{event.description}</p>
        <p className="mono">{event.venueName} · {event.address}</p>
        <p className="mono">{when(session.startsAt)} – {when(session.endsAt)}</p>
        <p className="help">{policies[event.refundPolicy]}</p>
      </div>
      <aside className="card panel stack">
        <div className="stack">
          {session.zones.map((item) => {
            const taken = item.capacity - item.available
            return (
              <button key={item.id} type="button" className={`ui-zone ${item.id === zone.id ? 'on' : ''}`} onClick={() => { setZoneId(item.id); const next = session.ticketTypes.find((ticket) => ticket.zoneId === item.id); if (next) setTypeId(next.id) }}>
                <div className="between"><strong>{item.name}</strong><span className="mono">{item.kind === 'SEATED' ? 'Asientos' : 'General'}</span></div>
                <div className="ui-dots" aria-hidden="true">
                  {Array.from({ length: Math.min(item.capacity, 36) }, (_, index) => (
                    <i key={index} className={index < taken ? 'on' : 'left'} />
                  ))}
                </div>
                <span className="mono">Quedan {item.available}</span>
              </button>
            )
          })}
        </div>
        <div className="mono">{type.name} · {zone.name}</div>
        <div className="price">{money(finalCents, type.currency)}</div>
        <p className="help">Precio final. Incluye {money(type.feeCents, type.currency)} de cargo de servicio.</p>
        <p className="mono">Quedan {zone.available} de {zone.capacity}</p>
        {zone.available > 0 && salesOpen && (
          <label className="field">
            Cantidad
            <input type="number" min={1} max={Math.min(type.perOrderLimit, zone.available)} value={qty} onChange={(input) => setQty(Number(input.target.value))} />
          </label>
        )}
        {session.queueEnabled && (
          <div className="row">
            <button className="btn btn-s" type="button" onClick={pedirTurno}>Pedir turno en la fila</button>
            <a className="btn btn-s" href={`/fila/${session.id}`}>Ver la fila</a>
          </div>
        )}
        {queueNote && <p className="help">{queueNote}</p>}
        {zone.available > 0 && salesOpen && (!session.queueEnabled || admission) && (
          <button className="btn btn-a" type="button" disabled={busy} onClick={apartar}>{busy ? 'Apartando…' : 'Apartar lugar'}</button>
        )}
        {!salesOpen && <p className="help">La venta abre el {when(session.salesOpenAt)}.</p>}
        {zone.available === 0 && <button className="btn btn-p" type="button" onClick={lista}>Unirme a la lista de espera</button>}
        {error && <p className="err">{error}</p>}
      </aside>
    </div>
  )
}

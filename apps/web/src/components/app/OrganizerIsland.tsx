import { useEffect, useState } from 'react'
import { api, money, when } from '../../lib/api'

type Overview = {
  id: string
  slug: string
  title: string
  status: string
  city: string
  capacity: number
  sold: number
  held: number
  available: number
  startsAt: string | null
}

type Attendee = {
  ticketId: string
  orderId: string
  serial: string
  status: string
  holderName: string
  holderEmail: string
  checkedInAt: string | null
}

type Audit = { id: string; action: string; targetType: string; at: string }

const empty = {
  title: '',
  summary: '',
  description: '',
  city: 'Guatemala',
  venueName: '',
  address: '',
  startsAt: '',
  endsAt: '',
  capacity: 40,
  price: '25.00',
  fee: '1.50',
  refundPolicy: 'MODERATE',
  queueEnabled: false,
}

export default function OrganizerIsland() {
  const [events, setEvents] = useState<Overview[]>([])
  const [selected, setSelected] = useState('')
  const [attendees, setAttendees] = useState<Attendee[]>([])
  const [audit, setAudit] = useState<Audit[]>([])
  const [form, setForm] = useState(empty)
  const [staffEmail, setStaffEmail] = useState('')
  const [reason, setReason] = useState('El asistente no podrá venir')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')

  async function load() {
    const [overview, trail] = await Promise.all([
      api<{ events: Overview[] }>('/v1/organizer/overview'),
      api<{ data: Audit[] }>('/v1/organizer/audit'),
    ])
    setEvents(overview.events)
    setAudit(trail.data)
    setSelected((current) => current || overview.events[0]?.id || '')
  }

  useEffect(() => {
    load().catch((reason: Error) => setError(reason.message))
  }, [])

  useEffect(() => {
    if (!selected) return
    api<{ data: Attendee[] }>(`/v1/organizer/events/${selected}/attendees`)
      .then((body) => setAttendees(body.data))
      .catch((reason: Error) => setError(reason.message))
  }, [selected])

  function set<K extends keyof typeof empty>(key: K, value: (typeof empty)[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  async function create(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    setNote('')
    try {
      const created = await api<{ title: string }>('/v1/organizer/events', {
        method: 'POST',
        body: JSON.stringify({
          title: form.title,
          summary: form.summary,
          description: form.description,
          city: form.city,
          venueName: form.venueName,
          address: form.address,
          startsAt: new Date(form.startsAt).toISOString(),
          endsAt: new Date(form.endsAt).toISOString(),
          capacity: Number(form.capacity),
          priceCents: Math.round(Number(form.price) * 100),
          feeCents: Math.round(Number(form.fee) * 100),
          refundPolicy: form.refundPolicy,
          queueEnabled: form.queueEnabled,
          publish: true,
        }),
      })
      setNote(`Publicado: ${created.title}`)
      setForm(empty)
      await load()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo publicar')
    }
  }

  async function invite(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    try {
      await api(`/v1/organizer/events/${selected}/staff`, { method: 'POST', body: JSON.stringify({ email: staffEmail }) })
      setNote(`Puerta habilitada para ${staffEmail}`)
      setStaffEmail('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo invitar')
    }
  }

  async function refund(orderId: string) {
    setError('')
    try {
      const body = await api<{ amountCents: number }>(`/v1/orders/${orderId}/refund`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      })
      setNote(`Reembolso de ${money(body.amountCents)}`)
      const next = await api<{ data: Attendee[] }>(`/v1/organizer/events/${selected}/attendees`)
      setAttendees(next.data)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo reembolsar')
    }
  }

  return (
    <div className="stack">
      <div>
        <div className="eyebrow">Organizador</div>
        <h1 style={{ fontSize: 52, marginTop: 8 }}>Tu cartelera.</h1>
      </div>
      {error && <p className="err">{error} <a href="/entrar">Entrar</a></p>}
      {note && <div className="banner ok">{note}</div>}
      <div className="grid-cards">
        {events.map((event) => {
          const ratio = event.capacity ? event.sold / event.capacity : 0
          return (
            <button key={event.id} className="card event-card" type="button" onClick={() => setSelected(event.id)} style={{ textAlign: 'left', borderColor: selected === event.id ? 'var(--acc)' : undefined }}>
              <div className="event-body">
                <div className="mono">{event.city} · {event.status}</div>
                <strong style={{ fontFamily: 'Inter Tight, sans-serif', fontSize: 22 }}>{event.title}</strong>
                <div className="meter" aria-hidden="true"><i style={{ width: `${Math.round(ratio * 100)}%` }} /></div>
                <div className="mono">{event.sold} vendidos · {event.held} apartados · {event.available} libres</div>
                {event.startsAt && <div className="mono">{when(event.startsAt)}</div>}
              </div>
            </button>
          )
        })}
      </div>

      <form className="card panel stack" onSubmit={create}>
        <h2 style={{ fontSize: 28 }}>Publicar un evento</h2>
        <label className="field">Título<input required maxLength={120} value={form.title} onChange={(input) => set('title', input.target.value)} /></label>
        <label className="field">Resumen<input required maxLength={200} value={form.summary} onChange={(input) => set('summary', input.target.value)} /></label>
        <label className="field">Descripción<textarea required maxLength={4000} value={form.description} onChange={(input) => set('description', input.target.value)} /></label>
        <div className="row">
          <label className="field">Ciudad<input required value={form.city} onChange={(input) => set('city', input.target.value)} /></label>
          <label className="field">Lugar<input required value={form.venueName} onChange={(input) => set('venueName', input.target.value)} /></label>
        </div>
        <label className="field">Dirección<input required value={form.address} onChange={(input) => set('address', input.target.value)} /></label>
        <div className="row">
          <label className="field">Empieza<input required type="datetime-local" value={form.startsAt} onChange={(input) => set('startsAt', input.target.value)} /></label>
          <label className="field">Termina<input required type="datetime-local" value={form.endsAt} onChange={(input) => set('endsAt', input.target.value)} /></label>
        </div>
        <div className="row">
          <label className="field">Cupo<input required type="number" min={1} value={form.capacity} onChange={(input) => set('capacity', Number(input.target.value))} /></label>
          <label className="field">Precio USD<input required inputMode="decimal" value={form.price} onChange={(input) => set('price', input.target.value)} /></label>
          <label className="field">Cargo USD<input required inputMode="decimal" value={form.fee} onChange={(input) => set('fee', input.target.value)} /></label>
        </div>
        <label className="field">Reembolso
          <select value={form.refundPolicy} onChange={(input) => set('refundPolicy', input.target.value)}>
            <option value="FLEXIBLE">Flexible</option>
            <option value="MODERATE">Moderada</option>
            <option value="STRICT">Estricta</option>
          </select>
        </label>
        <label className="row"><input type="checkbox" checked={form.queueEnabled} onChange={(input) => set('queueEnabled', input.target.checked)} /> Abrir con fila de espera</label>
        <button className="btn btn-a" type="submit">Publicar</button>
      </form>

      {selected && (
        <div className="stack">
          <h2 style={{ fontSize: 28 }}>Asistentes</h2>
          <form className="row" onSubmit={invite}>
            <label className="field" style={{ flex: 1 }}>Invitar a la puerta<input type="email" required value={staffEmail} onChange={(input) => setStaffEmail(input.target.value)} placeholder="persona@correo.com" /></label>
            <button className="btn btn-s" type="submit">Invitar</button>
          </form>
          <label className="field">Motivo del reembolso<input value={reason} onChange={(input) => setReason(input.target.value)} /></label>
          <table className="plain">
            <thead><tr><th>Serie</th><th>Persona</th><th>Estado</th><th></th></tr></thead>
            <tbody>
              {attendees.map((person) => (
                <tr key={person.ticketId}>
                  <td className="mono">{person.serial}</td>
                  <td>{person.holderName}<div className="help">{person.holderEmail}</div></td>
                  <td className="mono">{person.status}{person.checkedInAt ? ` · ${when(person.checkedInAt)}` : ''}</td>
                  <td>{person.status === 'ISSUED' && <button className="btn btn-s" type="button" onClick={() => refund(person.orderId)}>Reembolsar</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {attendees.length === 0 && <p className="help">Todavía no hay boletos emitidos.</p>}
        </div>
      )}

      <div className="stack">
        <h2 style={{ fontSize: 28 }}>Bitácora</h2>
        {audit.slice(0, 12).map((row) => (
          <div key={row.id} className="between"><span className="mono">{row.action}</span><span className="help">{when(row.at)}</span></div>
        ))}
      </div>
    </div>
  )
}

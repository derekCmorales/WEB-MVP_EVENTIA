import { useEffect, useState } from 'react'
import { api, money, when } from '../../lib/api'

type EventCard = {
  id: string
  slug: string
  title: string
  summary: string
  city: string
  coverHue: string
  organizerName: string
  sessions: { startsAt: string; zones: { capacity: number; sold: number; available: number }[]; ticketTypes: { priceCents: number; feeCents: number; currency: string }[] }[]
}

export default function ExploreIsland() {
  const [q, setQ] = useState('')
  const [city, setCity] = useState('')
  const [events, setEvents] = useState<EventCard[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setQ(params.get('q') ?? '')
    setCity(params.get('ciudad') ?? '')
  }, [])

  useEffect(() => {
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (city) params.set('city', city)
    const handle = setTimeout(() => {
      api<{ data: EventCard[] }>(`/v1/events?${params.toString()}`)
        .then((body) => { setEvents(body.data); setError('') })
        .catch((reason: Error) => setError(reason.message))
    }, 180)
    return () => clearTimeout(handle)
  }, [q, city])

  return (
    <div className="stack">
      <div>
        <div className="eyebrow">Explorar</div>
        <h1 style={{ fontSize: '56px', marginTop: 12 }}>Qué pasa cerca de ti.</h1>
      </div>
      <div className="row">
        <label className="field" style={{ flex: 1, minWidth: 220 }}>
          Buscar
          <input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Jazz, foto, ciudad…" />
        </label>
        <label className="field">
          Ciudad
          <input value={city} onChange={(event) => setCity(event.target.value)} placeholder="Guatemala" />
        </label>
      </div>
      <div className="chips">
        {['', 'Guatemala', 'Antigua'].map((item) => (
          <button key={item || 'todas'} className={`btn btn-s chip ${city === item ? 'on' : ''}`} type="button" onClick={() => setCity(item)} style={{ height: 36 }}>
            {item || 'Todas'}
          </button>
        ))}
      </div>
      {error && <p className="err">{error}</p>}
      <div className="grid-cards">
        {events.map((event) => {
          const session = event.sessions[0]
          const zone = session?.zones[0]
          const type = session?.ticketTypes[0]
          const ratio = zone ? zone.sold / Math.max(zone.capacity, 1) : 0
          return (
            <a key={event.id} className="card event-card" href={`/eventos/${event.slug}`}>
              <div className="event-art" style={{ background: `linear-gradient(145deg, ${event.coverHue}, #1c1917 70%)` }} />
              <div className="event-body">
                <div className="mono">{event.city} · {event.organizerName}</div>
                <strong style={{ fontFamily: 'Inter Tight, Inter, sans-serif', fontSize: 22, letterSpacing: '-.03em' }}>{event.title}</strong>
                <p className="help">{event.summary}</p>
                <div className="between">
                  <span className="mono">{session ? when(session.startsAt) : ''}</span>
                  <span className="price">{type ? money(type.priceCents + type.feeCents, type.currency) : ''}</span>
                </div>
                <div className="between">
                  <div className="eq" aria-hidden="true">
                    {Array.from({ length: 12 }, (_, index) => (
                      <i key={index} className={index / 12 < ratio ? 'on' : ''} style={{ height: 8 + (index % 5) * 3 }} />
                    ))}
                  </div>
                  <span className="mono">{zone ? `Quedan ${zone.available}` : ''}</span>
                </div>
              </div>
            </a>
          )
        })}
      </div>
      {events.length === 0 && !error && <p className="help">No hay eventos con ese filtro.</p>}
    </div>
  )
}

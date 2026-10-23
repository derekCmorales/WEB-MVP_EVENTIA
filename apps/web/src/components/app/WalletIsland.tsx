import { useEffect, useState } from 'react'
import { api, when } from '../../lib/api'

type Ticket = { id: string; serial: string; status: string; eventTitle: string; city: string; venueName: string; startsAt: string }
type Incoming = { id: string; expiresAt: string; ticket: Ticket }

export default function WalletIsland() {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [incoming, setIncoming] = useState<Incoming[]>([])
  const [error, setError] = useState('')

  async function load() {
    try {
      const [wallet, transfers] = await Promise.all([
        api<{ data: Ticket[] }>('/v1/tickets/mine'),
        api<{ data: Incoming[] }>('/v1/transfers/mine'),
      ])
      setTickets(wallet.data)
      setIncoming(transfers.data)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Inicia sesión para ver tus boletos')
    }
  }

  useEffect(() => { void load() }, [])

  async function accept(id: string) {
    await api(`/v1/transfers/${id}/accept`, { method: 'POST' })
    await load()
  }

  return (
    <div className="stack">
      <div>
        <div className="eyebrow">Cartera</div>
        <h1 style={{ fontSize: 52, marginTop: 8 }}>Tus pases.</h1>
      </div>
      {error && <p className="err">{error} <a href="/entrar">Entrar</a></p>}
      {incoming.length > 0 && (
        <div className="stack">
          <h2 style={{ fontSize: 28 }}>Te enviaron un pase</h2>
          {incoming.map((item) => (
            <div key={item.id} className="card panel between">
              <div>
                <strong>{item.ticket.eventTitle}</strong>
                <p className="help">Vence {when(item.expiresAt)}</p>
              </div>
              <button className="btn btn-a" type="button" onClick={() => accept(item.id)}>Aceptar</button>
            </div>
          ))}
        </div>
      )}
      <div className="grid-cards">
        {tickets.map((ticket) => (
          <a key={ticket.id} className="pass-mini" href={`/boletos/${ticket.id}`}>
            <div style={{ padding: 18 }}>
              <div className="mono">{ticket.city}</div>
              <strong style={{ display: 'block', margin: '8px 0', fontFamily: 'Inter Tight, sans-serif', fontSize: 22 }}>{ticket.eventTitle}</strong>
              <div className="mono">{when(ticket.startsAt)}</div>
              <div className="mono" style={{ marginTop: 8 }}>{ticket.serial} · {ticket.status}</div>
            </div>
            <div className="stub"><span className="mono" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>{ticket.venueName || 'PASE'}</span></div>
          </a>
        ))}
      </div>
      {tickets.length === 0 && !error && <p className="help">Todavía no tienes boletos. <a href="/explorar">Explorar</a></p>}
    </div>
  )
}

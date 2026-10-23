import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { api, when } from '../../lib/api'

type Ticket = { id: string; serial: string; status: string; eventTitle: string; city: string; venueName: string; startsAt: string; rev: number }

export default function TicketIsland({ ticketId }: { ticketId: string }) {
  const [ticket, setTicket] = useState<Ticket | null>(null)
  const [src, setSrc] = useState('')
  const [token, setToken] = useState('')
  const [email, setEmail] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    api<Ticket>(`/v1/tickets/${ticketId}`).then(setTicket).catch((reason: Error) => setError(reason.message))
  }, [ticketId])

  useEffect(() => {
    if (!ticket || ticket.status !== 'ISSUED') return
    let stop = false
    const paint = async () => {
      const qr = await api<{ token: string }>(`/v1/tickets/${ticketId}/qr`)
      if (stop) return
      setToken(qr.token)
      setSrc(await QRCode.toDataURL(qr.token, { margin: 1, width: 280, color: { dark: '#1c1917', light: '#ffffff' } }))
    }
    void paint()
    const timer = setInterval(() => void paint().catch(() => undefined), 20000)
    return () => { stop = true; clearInterval(timer) }
  }, [ticket, ticketId])

  async function transfer(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    try {
      const body = await api<{ id: string }>(`/v1/tickets/${ticketId}/transfer`, { method: 'POST', body: JSON.stringify({ toEmail: email }) })
      setNote(`Transferencia ${body.id} enviada. La otra persona la acepta en su cartera.`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo transferir')
    }
  }

  if (!ticket) return <p className="help">{error || 'Cargando el pase…'}</p>
  return (
    <div className="split">
      <div className="stack">
        <div className="eyebrow">{ticket.city} · rev {ticket.rev}</div>
        <h1 style={{ fontSize: 48 }}>{ticket.eventTitle}</h1>
        <p className="mono">{ticket.venueName} · {when(ticket.startsAt)}</p>
        <p className="mono">{ticket.serial}</p>
        {ticket.status === 'ISSUED' && src && (
          <div className={`pass-flip ${src ? 'flipped' : ''}`}>
            <div className="pass-flip-inner">
              <div className="pass-face card panel">
                <div className="mono">{ticket.serial}</div>
                <strong style={{ fontFamily: 'Inter Tight, sans-serif', fontSize: 28 }}>{ticket.eventTitle}</strong>
                <p className="help">Gira el pase para el código.</p>
              </div>
              <div className="pass-face back">
                <img className="qr qr-spin" alt="Código QR del pase" src={src} />
              </div>
            </div>
          </div>
        )}
        {ticket.status !== 'ISSUED' && <div className="banner warn">Este pase está {ticket.status.toLowerCase()}.</div>}
        <p className="help">El código cambia solo. Una captura deja de servir en menos de un minuto.</p>
        <textarea readOnly value={token} aria-label="Contenido del pase" style={{ width: '100%', minHeight: 72 }} />
      </div>
      {ticket.status === 'ISSUED' && (
        <form className="card panel stack" onSubmit={transfer}>
          <h2 style={{ fontSize: 28 }}>Transferir</h2>
          <label className="field">Correo de quien lo recibe<input type="email" required value={email} onChange={(input) => setEmail(input.target.value)} /></label>
          <button className="btn btn-p" type="submit">Enviar pase</button>
          {note && <p className="help">{note}</p>}
          {error && <p className="err">{error}</p>}
        </form>
      )}
    </div>
  )
}

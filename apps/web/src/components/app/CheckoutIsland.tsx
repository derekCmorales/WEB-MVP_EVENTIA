import { useEffect, useState } from 'react'
import { api, idempotency, money } from '../../lib/api'

type Hold = {
  id: string
  status: string
  expiresAt: string
  eventTitle: string
  currency: string
  totalCents: number
  items: { name: string; quantity: number; priceCents: number; feeCents: number }[]
}

export default function CheckoutIsland({ holdId }: { holdId: string }) {
  const [hold, setHold] = useState<Hold | null>(null)
  const [left, setLeft] = useState('')
  const [error, setError] = useState('')
  const [paid, setPaid] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api<Hold>(`/v1/holds/${holdId}`).then(setHold).catch((reason: Error) => setError(reason.message))
  }, [holdId])

  useEffect(() => {
    if (!hold) return
    const tick = () => {
      const ms = new Date(hold.expiresAt).getTime() - Date.now()
      if (ms <= 0) setLeft('00:00')
      else {
        const minutes = Math.floor(ms / 60000)
        const seconds = Math.floor((ms % 60000) / 1000)
        setLeft(`${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`)
      }
    }
    tick()
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [hold])

  async function pay() {
    setBusy(true)
    setError('')
    try {
      const order = await api<{ id: string }>('/v1/orders', {
        method: 'POST',
        headers: { 'idempotency-key': idempotency(`order:${holdId}`) },
        body: JSON.stringify({ holdId }),
      })
      const result = await api<{ status: string; mode: string; clientSecret: string | null }>(`/v1/orders/${order.id}/pay`, { method: 'POST' })
      if (result.status === 'PAID' || result.mode === 'fake') {
        setPaid(true)
        return
      }
      setError('El pago quedó pendiente. Completa el cobro de Stripe con el client secret de prueba.')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo pagar')
    } finally {
      setBusy(false)
    }
  }

  if (!hold) return <p className="help">{error || 'Cargando el apartado…'}</p>
  if (paid) {
    return (
      <div className="stack" style={{ maxWidth: 560 }}>
        <div className="banner ok"><strong>Listo. Tu pase ya está en la cartera.</strong><p>El QR cambia cada medio minuto.</p></div>
        <a className="btn btn-a" href="/boletos">Ver mis boletos</a>
      </div>
    )
  }

  return (
    <div className="stack" style={{ maxWidth: 560 }}>
      <div className="eyebrow">Checkout</div>
      <h1 style={{ fontSize: 48 }}>{hold.eventTitle}</h1>
      <p className="mono timer">El apartado vence en {left}</p>
      <div className="card panel stack">
        {hold.items.map((item) => (
          <div key={item.name} className="between">
            <span>{item.quantity} × {item.name}</span>
            <span>{money((item.priceCents + item.feeCents) * item.quantity, hold.currency)}</span>
          </div>
        ))}
        <div className="between"><strong>Total</strong><span className="price">{money(hold.totalCents, hold.currency)}</span></div>
        <button className="btn btn-a" type="button" disabled={busy || left === '00:00'} onClick={pay}>{busy ? 'Pagando…' : 'Pagar'}</button>
        <p className="help">Sin llaves de Stripe el cobro es de prueba y el boleto se emite al instante.</p>
        {error && <p className="err">{error}</p>}
      </div>
    </div>
  )
}

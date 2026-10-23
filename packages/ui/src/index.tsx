import { useEffect, useState, type ReactNode } from 'react'

type ToastItem = { id: number; text: string }
type Bus = { items: ToastItem[]; listeners: Set<() => void>; seq: number }

function bus(): Bus {
  const w = window as Window & { __eventiaToasts?: Bus }
  if (!w.__eventiaToasts) w.__eventiaToasts = { items: [], listeners: new Set(), seq: 1 }
  return w.__eventiaToasts
}

export function toast(text: string) {
  const current = bus()
  const item = { id: current.seq++, text }
  current.items = [...current.items, item].slice(-4)
  current.listeners.forEach((listener) => listener())
  setTimeout(() => {
    current.items = current.items.filter((entry) => entry.id !== item.id)
    current.listeners.forEach((listener) => listener())
  }, 3200)
}

export function ToastHost() {
  const [items, setItems] = useState<ToastItem[]>([])
  useEffect(() => {
    const current = bus()
    const pull = () => setItems([...current.items])
    current.listeners.add(pull)
    pull()
    return () => { current.listeners.delete(pull) }
  }, [])
  return (
    <div className="ui-toast-host" aria-live="polite">
      {items.map((item) => <div key={item.id} className="ui-toast" role="status">{item.text}</div>)}
    </div>
  )
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="ui-empty">
      <svg viewBox="0 0 120 72" aria-hidden="true">
        <rect x="8" y="10" width="104" height="52" rx="10" fill="#fff" stroke="#1C1917" />
        <path d="M78 10v52" stroke="#CFCBC6" strokeDasharray="3 3" />
        <circle cx="92" cy="36" r="6" fill="#2F4BFF" />
        <path d="M20 28h40M20 38h28" stroke="#E7E5E4" strokeWidth="3" />
      </svg>
      <strong>{title}</strong>
      <p className="help">{body}</p>
    </div>
  )
}

export function Skeleton({ height = 120 }: { height?: number }) {
  return <div className="ui-skel" style={{ height }} />
}

export function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="ui-modal" role="presentation" onClick={onClose}>
      <div className="ui-sheet stack" role="dialog" aria-modal="true" aria-label={title} onClick={(event) => event.stopPropagation()}>
        <div className="between"><h2 style={{ fontSize: 28 }}>{title}</h2><button className="btn btn-s" type="button" onClick={onClose}>Cerrar</button></div>
        {children}
      </div>
    </div>
  )
}

export function Drawer({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="ui-drawer" role="presentation" onClick={onClose}>
      <div className="ui-sheet stack" role="dialog" aria-modal="true" aria-label={title} onClick={(event) => event.stopPropagation()}>
        <div className="between"><h2 style={{ fontSize: 28 }}>{title}</h2><button className="btn btn-s" type="button" onClick={onClose}>Cerrar</button></div>
        {children}
      </div>
    </div>
  )
}

export function Steps({ labels, current }: { labels: string[]; current: number }) {
  return (
    <div>
      <div className="ui-steps" aria-hidden="true">{labels.map((label, index) => <i key={label} className={`ui-step ${index <= current ? 'on' : ''}`} />)}</div>
      <p className="mono" style={{ marginTop: 8 }}>Paso {current + 1} de {labels.length} · {labels[current]}</p>
    </div>
  )
}

export function Bars({ series }: { series: { day: string; cents: number }[] }) {
  const max = Math.max(1, ...series.map((point) => point.cents))
  const width = 560
  const height = 140
  const gap = 6
  const bar = (width - gap * series.length) / Math.max(series.length, 1)
  return (
    <svg className="ui-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Ventas por día">
      {series.map((point, index) => {
        const h = Math.max(2, (point.cents / max) * (height - 16))
        return <rect key={point.day} x={index * (bar + gap)} y={height - h} width={bar} height={h} rx="3" fill={point.cents ? '#2F4BFF' : '#E7E5E4'} />
      })}
    </svg>
  )
}

export function FieldError({ children }: { children?: string }) {
  if (!children) return null
  return <span className="ui-inline">{children}</span>
}

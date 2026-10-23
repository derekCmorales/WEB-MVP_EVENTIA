import { useEffect, useState } from 'react'
import { Modal } from '@eventia/ui'
import { api } from '../../lib/api'

type Hit = { slug: string; title: string; city: string }

export default function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<Hit[]>([])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setOpen(true)
      }
      if (event.key === 'Escape') setOpen(false)
    }
    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.closest('[data-command]')) {
        event.preventDefault()
        setOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    document.addEventListener('click', onClick)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('click', onClick)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    const handle = setTimeout(() => {
      api<{ data: Hit[] }>(`/v1/events?q=${encodeURIComponent(q)}`)
        .then((body) => setHits(body.data))
        .catch(() => setHits([]))
    }, 120)
    return () => clearTimeout(handle)
  }, [open, q])

  if (!open) return null
  return (
    <Modal title="Buscar eventos" onClose={() => setOpen(false)}>
      <label className="field">Qué estás buscando
        <input autoFocus value={q} onChange={(event) => setQ(event.target.value)} placeholder="Foto, ciudad, cine…" />
      </label>
      <div className="stack">
        {hits.map((hit) => (
          <a key={hit.slug} href={`/eventos/${hit.slug}`} className="between card panel">
            <strong>{hit.title}</strong>
            <span className="mono">{hit.city}</span>
          </a>
        ))}
        {hits.length === 0 && <p className="help">Ningún evento coincide.</p>}
      </div>
    </Modal>
  )
}

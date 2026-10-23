import { useEffect, useState } from 'react'
import { api, logout, when } from '../../lib/api'

type Session = { id: string; createdAt: string; userAgent: string | null; ip: string | null }
type Me = { id: string; email: string; name: string; role: string }

export default function AccountIsland() {
  const [me, setMe] = useState<Me | null>(null)
  const [name, setName] = useState('')
  const [sessions, setSessions] = useState<Session[]>([])
  const [confirm, setConfirm] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')

  async function load() {
    const [profile, list] = await Promise.all([
      api<{ user: Me }>('/v1/auth/me'),
      api<Session[]>('/v1/auth/sessions'),
    ])
    setMe(profile.user)
    setName(profile.user.name)
    setSessions(list)
  }

  useEffect(() => {
    load().catch((reason: Error) => setError(reason.message))
  }, [])

  async function save(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    try {
      const updated = await api<Me>('/v1/auth/me', { method: 'PATCH', body: JSON.stringify({ name }) })
      setMe(updated)
      setNote('Nombre actualizado.')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo guardar')
    }
  }

  async function revoke(id: string) {
    await api(`/v1/auth/sessions/${id}`, { method: 'DELETE' })
    await load()
  }

  async function download() {
    const data = await api<unknown>('/v1/auth/me/export')
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'eventia-datos.json'
    link.click()
    URL.revokeObjectURL(url)
  }

  async function remove(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    if (confirm !== 'ELIMINAR') {
      setError('Escribe ELIMINAR para confirmar.')
      return
    }
    try {
      await api('/v1/auth/me', { method: 'DELETE' })
      window.location.href = '/'
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo eliminar')
    }
  }

  if (!me && error) return <p className="err">{error} <a href="/entrar">Entrar</a></p>
  if (!me) return <p className="help">Cargando tu cuenta…</p>

  return (
    <div className="stack" style={{ maxWidth: 640 }}>
      <div className="eyebrow">Cuenta</div>
      <h1 style={{ fontSize: 48 }}>{me.name}</h1>
      <p className="mono">{me.email} · {me.role}</p>
      {note && <div className="banner ok">{note}</div>}
      {error && <p className="err">{error}</p>}
      <form className="card panel stack" onSubmit={save}>
        <label className="field">Nombre<input required maxLength={80} value={name} onChange={(input) => setName(input.target.value)} /></label>
        <div className="row">
          <button className="btn btn-p" type="submit">Guardar</button>
          <button className="btn btn-s" type="button" onClick={() => download()}>Descargar mis datos</button>
          <button className="btn btn-s" type="button" onClick={() => logout().then(() => { window.location.href = '/' })}>Salir</button>
        </div>
      </form>
      <div className="stack">
        <h2 style={{ fontSize: 28 }}>Sesiones</h2>
        {sessions.map((session) => (
          <div key={session.id} className="between card panel">
            <div>
              <div className="mono">{when(session.createdAt)}</div>
              <p className="help">{session.userAgent || 'Navegador'} · {session.ip || 'IP local'}</p>
            </div>
            <button className="btn btn-s" type="button" onClick={() => revoke(session.id)}>Cerrar</button>
          </div>
        ))}
      </div>
      <form className="card panel stack" onSubmit={remove}>
        <h2 style={{ fontSize: 28 }}>Eliminar cuenta</h2>
        <p className="help">Si tienes boletos vigentes o eventos con ventas, la cuenta se conserva.</p>
        <label className="field">Escribe ELIMINAR<input value={confirm} onChange={(input) => setConfirm(input.target.value)} /></label>
        <button className="btn btn-s" type="submit">Eliminar</button>
      </form>
    </div>
  )
}

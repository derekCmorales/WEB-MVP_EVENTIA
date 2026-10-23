import { useEffect, useState } from 'react'
import { login, register } from '../../lib/api'

export default function AuthIsland({ mode }: { mode: 'login' | 'register' }) {
  const [tab, setTab] = useState(mode)
  const [ready, setReady] = useState(false)
  useEffect(() => setReady(true), [])
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      if (tab === 'login') await login(email, password)
      else await register(name, email, password)
      window.location.href = '/explorar'
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo entrar')
      setBusy(false)
    }
  }

  return (
    <form className="card panel stack" data-hydrated={ready ? 'true' : 'false'} style={{ maxWidth: 440 }} onSubmit={submit}>
      <div className="row">
        <button type="button" className={`btn ${tab === 'login' ? 'btn-p' : 'btn-s'}`} onClick={() => setTab('login')}>Entrar</button>
        <button type="button" className={`btn ${tab === 'register' ? 'btn-p' : 'btn-s'}`} onClick={() => setTab('register')}>Crear cuenta</button>
      </div>
      {tab === 'register' && (
        <label className="field">Nombre<input value={name} onChange={(input) => setName(input.target.value)} required minLength={1} maxLength={80} /></label>
      )}
      <label className="field">Correo<input type="email" value={email} onChange={(input) => setEmail(input.target.value)} required autoComplete="email" /></label>
      <label className="field">Contraseña<input type="password" value={password} onChange={(input) => setPassword(input.target.value)} required minLength={8} autoComplete={tab === 'login' ? 'current-password' : 'new-password'} /></label>
      <button className="btn btn-a" type="submit" disabled={busy}>{busy ? 'Un momento…' : tab === 'login' ? 'Entrar' : 'Crear cuenta'}</button>
      {error && <p className="err">{error}</p>}
      <p className="help">Cuentas de demostración, contraseña demo1234: ana@eventia.dev, luis@eventia.dev, staff@eventia.dev.</p>
    </form>
  )
}

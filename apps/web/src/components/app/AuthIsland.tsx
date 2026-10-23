import { useEffect, useState } from 'react'
import { FieldError, toast } from '@eventia/ui'
import { login, register } from '../../lib/api'

export default function AuthIsland({ mode }: { mode: 'login' | 'register' }) {
  const [tab, setTab] = useState(mode)
  const [ready, setReady] = useState(false)
  useEffect(() => setReady(true), [])
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [emailError, setEmailError] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setEmailError(email.includes('@') ? '' : 'Escribe un correo válido')
    setPasswordError(password.length >= 8 ? '' : 'Mínimo 8 caracteres')
    if (!email.includes('@') || password.length < 8) return
    setBusy(true)
    setError('')
    try {
      if (tab === 'login') await login(email, password)
      else await register(name, email, password)
      window.location.href = '/explorar'
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'No se pudo entrar'
      setError(message)
      toast(message)
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
      <label className="field">Correo<input type="email" value={email} onChange={(input) => setEmail(input.target.value)} onBlur={() => setEmailError(email.includes('@') ? '' : 'Escribe un correo válido')} required autoComplete="email" aria-invalid={Boolean(emailError)} /><FieldError>{emailError}</FieldError></label>
      <label className="field">Contraseña<input type="password" value={password} onChange={(input) => setPassword(input.target.value)} onBlur={() => setPasswordError(password.length >= 8 ? '' : 'Mínimo 8 caracteres')} required minLength={8} autoComplete={tab === 'login' ? 'current-password' : 'new-password'} aria-invalid={Boolean(passwordError)} /><FieldError>{passwordError}</FieldError></label>
      <button className="btn btn-a" type="submit" disabled={busy}>{busy ? 'Un momento…' : tab === 'login' ? 'Entrar' : 'Crear cuenta'}</button>
      {error && <p className="err">{error}</p>}
      <p className="help">Cuentas de demostración, contraseña demo1234: ana@eventia.dev, luis@eventia.dev, staff@eventia.dev, admin@eventia.dev.</p>
    </form>
  )
}

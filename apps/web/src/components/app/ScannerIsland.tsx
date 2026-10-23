import { useEffect, useState } from 'react'
import { b64urlToBytes, verifyTicket } from '@eventia/qr'
import { api } from '../../lib/api'

type SessionOption = { id: string; label: string }
type Manifest = {
  sessionId: string
  publicKey: string
  tickets: { tid: string; rev: number; status: string }[]
}
type Result = { result: string; detail: string; serial?: string; holderName?: string }

const dbName = 'eventia-scanner'

function openDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(dbName, 1)
    request.onupgradeneeded = () => request.result.createObjectStore('pending', { keyPath: 'id' })
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function enqueue(item: { token: string; at: string }) {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('pending', 'readwrite')
    tx.objectStore('pending').put({ id: crypto.randomUUID(), ...item })
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function pending() {
  const db = await openDb()
  return new Promise<{ id: string; token: string; at: string }[]>((resolve, reject) => {
    const tx = db.transaction('pending', 'readonly')
    const request = tx.objectStore('pending').getAll()
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function clearPending(ids: string[]) {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('pending', 'readwrite')
    ids.forEach((id) => tx.objectStore('pending').delete(id))
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export default function ScannerIsland() {
  const [sessions, setSessions] = useState<SessionOption[]>([])
  const [sessionId, setSessionId] = useState('')
  const [token, setToken] = useState('')
  const [offline, setOffline] = useState(false)
  const [manifest, setManifest] = useState<Manifest | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const [queued, setQueued] = useState(0)
  const [error, setError] = useState('')

  useEffect(() => {
    api<{ data: { title: string; sessions: { id: string; startsAt: string }[] }[] }>('/v1/organizer/events')
      .then((body) => {
        const options = body.data.flatMap((event) => event.sessions.map((session) => ({
          id: session.id,
          label: event.title,
        })))
        setSessions(options)
        setSessionId(options[0]?.id ?? '')
      })
      .catch((reason: Error) => setError(reason.message))
    pending().then((rows) => setQueued(rows.length)).catch(() => undefined)
  }, [])

  async function download() {
    setError('')
    const body = await api<Manifest>(`/v1/checkin/manifest/${sessionId}`)
    setManifest(body)
    localStorage.setItem(`eventia.manifest.${sessionId}`, JSON.stringify(body))
  }

  function localManifest() {
    if (manifest?.sessionId === sessionId) return manifest
    const raw = localStorage.getItem(`eventia.manifest.${sessionId}`)
    return raw ? JSON.parse(raw) as Manifest : null
  }

  async function validate(event?: React.FormEvent) {
    event?.preventDefault()
    setError('')
    setResult(null)
    const value = token.trim()
    if (!sessionId || value.length < 10) {
      setError('Elige la función y pega el pase.')
      return
    }
    try {
      if (offline) {
        const book = localManifest()
        if (!book) throw new Error('Descarga el manifiesto antes de quedar sin conexión.')
        const verified = await verifyTicket(b64urlToBytes(book.publicKey), value)
        if (!verified.ok) {
          setResult({ result: 'INVALID', detail: 'El pase no es válido o ya venció' })
          return
        }
        const row = book.tickets.find((item) => item.tid === verified.claims.tid)
        if (!row || row.rev !== verified.claims.rev || row.status === 'REFUNDED' || row.status === 'CANCELLED') {
          setResult({ result: 'REVOKED', detail: 'Este pase fue revocado' })
          return
        }
        if (row.status === 'USED') {
          setResult({ result: 'DUPLICATE', detail: 'Este boleto ya entró' })
          return
        }
        row.status = 'USED'
        localStorage.setItem(`eventia.manifest.${sessionId}`, JSON.stringify(book))
        setManifest(book)
        await enqueue({ token: value, at: new Date().toISOString() })
        setQueued((count) => count + 1)
        setResult({ result: 'OK', detail: 'Guardado sin conexión. Se enviará al reconectar.' })
        return
      }
      const body = await api<Result>('/v1/checkin', {
        method: 'POST',
        body: JSON.stringify({ token: value, deviceId: 'web-puerta', offline: false }),
      })
      setResult(body)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo validar')
    }
  }

  async function reconcile() {
    setError('')
    const rows = await pending()
    if (rows.length === 0) return
    const body = await api<{ data: Result[] }>('/v1/checkin/reconcile', {
      method: 'POST',
      body: JSON.stringify({ deviceId: 'web-puerta', items: rows.map((row) => ({ token: row.token, at: row.at })) }),
    })
    await clearPending(rows.map((row) => row.id))
    setQueued(0)
    setResult(body.data[body.data.length - 1] ?? null)
  }

  async function scanCamera() {
    setError('')
    const Detector = (window as Window & { BarcodeDetector?: new (options: { formats: string[] }) => { detect: (source: ImageBitmapSource) => Promise<{ rawValue: string }[]> } }).BarcodeDetector
    if (!Detector || !navigator.mediaDevices) {
      setError('Este navegador no lee QR con la cámara. Pega el contenido del pase.')
      return
    }
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
    const video = document.createElement('video')
    video.srcObject = stream
    await video.play()
    const detector = new Detector({ formats: ['qr_code'] })
    const found = await detector.detect(video)
    stream.getTracks().forEach((track) => track.stop())
    const raw = found[0]?.rawValue
    if (!raw) {
      setError('No se leyó un código. Acerca el pase e inténtalo de nuevo.')
      return
    }
    setToken(raw)
  }

  const tone = result?.result === 'OK' ? 'ok' : result?.result === 'DUPLICATE' ? 'warn' : 'bad'

  return (
    <div className="stack" style={{ maxWidth: 640 }}>
      <div>
        <div className="eyebrow">Puerta</div>
        <h1 style={{ fontSize: 52, marginTop: 8 }}>Validar pases.</h1>
      </div>
      {error && <p className="err">{error} <a href="/entrar">Entrar</a></p>}
      <form className="card panel stack" onSubmit={validate}>
        <label className="field">Función
          <select value={sessionId} onChange={(input) => setSessionId(input.target.value)} aria-label="Función">
            {sessions.map((session) => <option key={session.id} value={session.id}>{session.label}</option>)}
          </select>
        </label>
        <div className="row">
          <button className="btn btn-s" type="button" onClick={() => download().catch((reason: Error) => setError(reason.message))}>Descargar manifiesto</button>
          <button className="btn btn-s" type="button" onClick={() => scanCamera().catch((reason: Error) => setError(reason.message))}>Leer con cámara</button>
          <label className="row"><input type="checkbox" checked={offline} onChange={(input) => setOffline(input.target.checked)} /> Sin conexión</label>
        </div>
        <label className="field">Contenido del pase
          <textarea required minLength={10} value={token} onChange={(input) => setToken(input.target.value)} aria-label="Contenido del pase" />
        </label>
        <button className="btn btn-a" type="submit">Validar</button>
        {queued > 0 && <button className="btn btn-p" type="button" onClick={() => reconcile().catch((reason: Error) => setError(reason.message))}>Enviar {queued} pendientes</button>}
      </form>
      {result && (
        <div className={`banner ${tone}`}>
          <strong>{result.detail}</strong>
          {result.holderName && <p>{result.holderName}</p>}
          {result.serial && <p className="mono">{result.serial}</p>}
        </div>
      )}
    </div>
  )
}

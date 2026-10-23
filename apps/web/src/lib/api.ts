export type User = { id: string; email: string; name: string; role: string }

type State = { access: string | null; user: User | null; csrf: string | null }
type BootWindow = Window & { __eventia?: State; __eventiaBoot?: Promise<void> }

function state() {
  const w = window as BootWindow
  if (!w.__eventia) w.__eventia = { access: null, user: null, csrf: null }
  return w.__eventia
}

export function currentUser() {
  return state().user
}

export function boot() {
  const w = window as BootWindow
  if (!w.__eventiaBoot) w.__eventiaBoot = runBoot()
  return w.__eventiaBoot
}

async function runBoot() {
  try {
    await ensureCsrf()
    const peek = await fetch('/v1/auth/session', { credentials: 'include' })
    const body = peek.ok ? await peek.json() : { user: null }
    // Peek only. Rotating here races with login and with the next navigation:
    // the server revokes the token before the browser stores the replacement.
    state().user = body.user ?? null
    if (!body.user) state().access = null
  } catch {
    state().access = null
    state().user = null
  }
  paintAccount()
}

async function ensureCsrf() {
  const current = state()
  if (current.csrf) return current.csrf
  const response = await fetch('/v1/auth/csrf', { credentials: 'include' })
  const body = await response.json()
  current.csrf = body.csrfToken as string
  return current.csrf
}

export function refresh() {
  const w = window as BootWindow & { __eventiaRefresh?: Promise<boolean> }
  if (!w.__eventiaRefresh) {
    w.__eventiaRefresh = rotate().finally(() => {
      w.__eventiaRefresh = undefined
    })
  }
  return w.__eventiaRefresh
}

async function rotate() {
  const csrf = await ensureCsrf()
  const response = await fetch('/v1/auth/refresh', {
    method: 'POST',
    credentials: 'include',
    headers: { 'x-csrf-token': csrf },
  })
  if (!response.ok) {
    state().access = null
    state().user = null
    paintAccount()
    return false
  }
  const body = await response.json()
  state().access = body.accessToken
  state().user = body.user
  paintAccount()
  return true
}

export async function api<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  await boot()
  const headers = new Headers(init.headers)
  const method = (init.method ?? 'GET').toUpperCase()
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json')
  if (method !== 'GET' && method !== 'HEAD') headers.set('x-csrf-token', state().csrf ?? '')
  if (state().access) headers.set('authorization', `Bearer ${state().access}`)
  const response = await fetch(path, { ...init, headers, credentials: 'include' })
  if (response.status === 401 && retry && !path.startsWith('/v1/auth/')) {
    const ok = await refresh()
    if (ok) return api(path, init, false)
  }
  const text = await response.text()
  const data = text ? JSON.parse(text) : null
  if (!response.ok) {
    const error = new Error(data?.detail || 'No se pudo completar la solicitud') as Error & { status: number }
    error.status = response.status
    throw error
  }
  return data as T
}

export async function login(email: string, password: string) {
  const body = await api<{ accessToken: string; user: User }>('/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
  state().access = body.accessToken
  state().user = body.user
  paintAccount()
  return body.user
}

export async function register(name: string, email: string, password: string) {
  const body = await api<{ accessToken: string; user: User }>('/v1/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name, email, password }),
  })
  state().access = body.accessToken
  state().user = body.user
  paintAccount()
  return body.user
}

export async function logout() {
  await api('/v1/auth/logout', { method: 'POST' })
  state().access = null
  state().user = null
  paintAccount()
}

export function idempotency(scope: string) {
  const key = `eventia.idem.${scope}`
  const existing = sessionStorage.getItem(key)
  if (existing) return existing
  const created = crypto.randomUUID()
  sessionStorage.setItem(key, created)
  return created
}

export function money(cents: number, currency = 'USD') {
  return new Intl.NumberFormat('es-GT', { style: 'currency', currency }).format(cents / 100)
}

export function when(value: string | Date) {
  return new Intl.DateTimeFormat('es-GT', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function paintAccount() {
  const user = state().user
  document.querySelectorAll<HTMLAnchorElement>('[data-account]').forEach((link) => {
    link.textContent = user ? 'Mis boletos' : 'Entrar'
    link.href = user ? '/boletos' : '/entrar'
  })
  document.querySelectorAll<HTMLElement>('[data-admin]').forEach((link) => {
    link.hidden = user?.role !== 'ADMIN'
  })
}

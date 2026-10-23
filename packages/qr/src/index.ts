export const QR_WINDOW_SEC = 30

export type TicketClaims = {
  tid: string
  sid: string
  rev: number
  kid: string
  iat: number
  w: number
}

export type VerifyResult =
  | { ok: true; claims: TicketClaims }
  | { ok: false; reason: 'formato' | 'firma' | 'ventana' | 'claims'; claims?: TicketClaims }

export function currentWindow(now = Date.now()) {
  return Math.floor(now / 1000 / QR_WINDOW_SEC)
}

export function bytesToB64url(bytes: Uint8Array) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

export function b64urlToBytes(value: string) {
  const pad = value.length % 4 === 0 ? '' : '='.repeat(4 - (value.length % 4))
  const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/') + pad)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

function copyBytes(bytes: Uint8Array) {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return copy
}

async function importPrivate(pkcs8: Uint8Array) {
  return crypto.subtle.importKey('pkcs8', copyBytes(pkcs8), { name: 'Ed25519' }, false, ['sign'])
}

async function importPublic(raw: Uint8Array) {
  return crypto.subtle.importKey('raw', copyBytes(raw), { name: 'Ed25519' }, false, ['verify'])
}

export async function signBytes(privateKeyPkcs8: Uint8Array, payload: Uint8Array) {
  const key = await importPrivate(privateKeyPkcs8)
  const signature = new Uint8Array(await crypto.subtle.sign({ name: 'Ed25519' }, key, copyBytes(payload)))
  return `${bytesToB64url(payload)}.${bytesToB64url(signature)}`
}

export async function verifyBytes(publicKeyRaw: Uint8Array, token: string) {
  const [payloadPart, signaturePart] = token.split('.')
  if (!payloadPart || !signaturePart || token.split('.').length !== 2) return null
  const payload = b64urlToBytes(payloadPart)
  const signature = b64urlToBytes(signaturePart)
  const key = await importPublic(publicKeyRaw)
  const valid = await crypto.subtle.verify({ name: 'Ed25519' }, key, signature, payload)
  return valid ? payload : null
}

export async function signTicket(privateKeyPkcs8: Uint8Array, claims: TicketClaims) {
  return signBytes(privateKeyPkcs8, new TextEncoder().encode(JSON.stringify(claims)))
}

export async function verifyTicket(publicKeyRaw: Uint8Array, token: string, now = Date.now()): Promise<VerifyResult> {
  const payload = await verifyBytes(publicKeyRaw, token)
  if (!payload) return { ok: false, reason: 'firma' }
  let claims: TicketClaims
  try {
    claims = JSON.parse(new TextDecoder().decode(payload)) as TicketClaims
  } catch {
    return { ok: false, reason: 'formato' }
  }
  if (!claims?.tid || !claims.sid || !claims.kid || !Number.isInteger(claims.rev) || !Number.isInteger(claims.w)) {
    return { ok: false, reason: 'claims' }
  }
  if (Math.abs(claims.w - currentWindow(now)) > 1) return { ok: false, reason: 'ventana', claims }
  return { ok: true, claims }
}

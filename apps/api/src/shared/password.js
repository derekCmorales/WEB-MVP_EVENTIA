import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

const KEY_LENGTH = 32

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, KEY_LENGTH).toString('hex')
  return `${salt}:${hash}`
}

export function verifyPassword(password, stored) {
  const [salt, hash] = String(stored).split(':')
  if (!salt || !hash) return false

  const next = scryptSync(password, salt, KEY_LENGTH)
  const saved = Buffer.from(hash, 'hex')
  if (next.length !== saved.length) return false
  return timingSafeEqual(next, saved)
}

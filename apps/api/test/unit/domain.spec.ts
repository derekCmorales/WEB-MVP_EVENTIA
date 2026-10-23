import { generateKeyPairSync } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { currentWindow, signTicket, verifyTicket } from '../../../../packages/qr/src/index'
import { fits } from '../../src/domain/capacity'
import { refundAmount } from '../../src/domain/refund'
import { chainHash, stableString } from '../../src/domain/stable'

describe('cupo', () => {
  it('acepta solo lo que cabe', () => {
    expect(fits(0, 0, 5, 1)).toBe(true)
    expect(fits(3, 2, 5, 1)).toBe(false)
    expect(fits(4, 0, 5, 1)).toBe(true)
    expect(fits(0, 0, 5, 0)).toBe(false)
  })
})

describe('reembolsos', () => {
  const total = 8000
  const starts = new Date('2026-12-01T00:00:00.000Z')

  it('aplica la política del evento', () => {
    expect(refundAmount('FLEXIBLE', starts, new Date('2026-11-30T23:00:00.000Z'), total)).toBe(8000)
    expect(refundAmount('FLEXIBLE', starts, new Date('2026-12-01T00:00:00.000Z'), total)).toBe(0)
    expect(refundAmount('MODERATE', starts, new Date('2026-11-20T00:00:00.000Z'), total)).toBe(8000)
    expect(refundAmount('MODERATE', starts, new Date('2026-11-30T00:00:00.000Z'), total)).toBe(4000)
    expect(refundAmount('STRICT', starts, new Date('2026-11-01T00:00:00.000Z'), total)).toBe(8000)
    expect(refundAmount('STRICT', starts, new Date('2026-11-28T00:00:00.000Z'), total)).toBe(0)
  })
})

describe('auditoría', () => {
  it('encadena el hash sin depender del orden de las claves', () => {
    const left = chainHash('abc', { b: 1, a: { d: 2, c: 3 } })
    const right = chainHash('abc', { a: { c: 3, d: 2 }, b: 1 })
    expect(left).toBe(right)
    expect(left).not.toBe(chainHash('zzz', { a: 1 }))
    expect(stableString({ a: 1 })).toContain('"a"')
  })
})

describe('qr', () => {
  const keys = (() => {
    const pair = generateKeyPairSync('ed25519')
    const pkcs8 = new Uint8Array(pair.privateKey.export({ type: 'pkcs8', format: 'der' }))
    const spki = new Uint8Array(pair.publicKey.export({ type: 'spki', format: 'der' }))
    return { pkcs8, raw: spki.slice(-32) }
  })()

  it('firma una ventana vigente y rechaza una captura vieja o alterada', async () => {
    const token = await signTicket(keys.pkcs8, {
      tid: 'tck', sid: 'ses', rev: 2, kid: 'eventia-dev-1', iat: 1, w: currentWindow(),
    })
    const ok = await verifyTicket(keys.raw, token)
    expect(ok.ok).toBe(true)

    const stale = await signTicket(keys.pkcs8, {
      tid: 'tck', sid: 'ses', rev: 2, kid: 'eventia-dev-1', iat: 1, w: currentWindow() - 5,
    })
    const expired = await verifyTicket(keys.raw, stale)
    expect(expired.ok).toBe(false)
    if (!expired.ok) expect(expired.reason).toBe('ventana')

    const [payload, signature] = token.split('.')
    const tampered = `${payload.slice(0, -2)}aa.${signature}`
    const forged = await verifyTicket(keys.raw, tampered)
    expect(forged.ok).toBe(false)
  })
})

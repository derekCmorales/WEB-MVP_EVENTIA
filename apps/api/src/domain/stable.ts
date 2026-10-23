import { createHash } from 'node:crypto'

export function stableString(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => stableString(item)).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableString(item)}`).join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

export function chainHash(previous: string, body: unknown) {
  return createHash('sha256').update(previous + stableString(body)).digest('hex')
}

export function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

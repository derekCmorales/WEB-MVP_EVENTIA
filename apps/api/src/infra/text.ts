import sanitizeHtml from 'sanitize-html'

export function plainText(value: string) {
  return sanitizeHtml(value, { allowedTags: [], allowedAttributes: {} }).trim()
}

export function requireIdempotencyKey(header: string | undefined) {
  const key = header?.trim() ?? ''
  if (key.length < 8 || key.length > 120) {
    throw new Error('idempotency')
  }
  return key
}

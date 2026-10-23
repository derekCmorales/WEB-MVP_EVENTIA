import { defineMiddleware } from 'astro:middleware'

const apiOrigin = process.env.API_PROXY ?? 'http://127.0.0.1:3001'

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname, search } = context.url
  if (!pathname.startsWith('/v1') && !pathname.startsWith('/docs')) return next()
  const incoming = context.request
  const headers = new Headers(incoming.headers)
  headers.delete('host')
  const method = incoming.method
  const body = method === 'GET' || method === 'HEAD' ? undefined : await incoming.arrayBuffer()
  const response = await fetch(new URL(pathname + search, apiOrigin), { method, headers, body, redirect: 'manual' })
  const outgoing = new Headers(response.headers)
  outgoing.delete('content-encoding')
  outgoing.delete('content-length')
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers: outgoing })
})

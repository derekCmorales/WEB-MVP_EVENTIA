import http from 'k6/http'
import { check } from 'k6'

// Optional load probe. The gate that proves zero oversell is the Vitest race
// in apps/api/test/integration/platform.spec.ts. Point BASE, TOKEN and SESSION
// at a published session whose capacity you already know.
export const options = { vus: 50, iterations: 50 }

const base = __ENV.BASE || 'http://127.0.0.1:3001'
const token = __ENV.TOKEN
const csrf = __ENV.CSRF
const sessionId = __ENV.SESSION
const ticketTypeId = __ENV.TYPE

export default function () {
  const response = http.post(
    `${base}/v1/holds`,
    JSON.stringify({ sessionId, items: [{ ticketTypeId, quantity: 1 }] }),
    {
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
        'x-csrf-token': csrf,
        'idempotency-key': `k6-${__VU}-${__ITER}`,
        origin: 'http://127.0.0.1:4321',
      },
    },
  )
  check(response, { 'hold accepted or sold out': (result) => result.status === 201 || result.status === 409 })
}

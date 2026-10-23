export type RefundPolicyName = 'FLEXIBLE' | 'MODERATE' | 'STRICT'

/**
 * FLEXIBLE: full refund until the session starts.
 * MODERATE: full refund until 48h before, half after that, nothing once it starts.
 * STRICT: full refund until 7 days before, nothing after.
 */
export function refundAmount(policy: RefundPolicyName, startsAt: Date, now: Date, totalCents: number) {
  const remainingMs = startsAt.getTime() - now.getTime()
  if (remainingMs <= 0 || totalCents <= 0) return 0
  const hours = remainingMs / 3_600_000
  if (policy === 'FLEXIBLE') return totalCents
  if (policy === 'MODERATE') return hours >= 48 ? totalCents : Math.floor(totalCents / 2)
  return hours >= 24 * 7 ? totalCents : 0
}

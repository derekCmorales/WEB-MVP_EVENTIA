/** Predicate mirrored by the atomic SQL update. The database check is authoritative. */
export function fits(sold: number, held: number, capacity: number, quantity: number) {
  return Number.isInteger(quantity)
    && quantity > 0
    && sold >= 0
    && held >= 0
    && sold + held + quantity <= capacity
}

export function availableOf(sold: number, held: number, capacity: number) {
  return Math.max(0, capacity - sold - held)
}

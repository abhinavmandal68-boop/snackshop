export function timestampMillis(value) {
  if (!value) return NaN
  return value.toMillis?.() ?? value.toDate?.().getTime() ?? new Date(value).getTime()
}

export function mergeLiveOrders(sources) {
  const unique = new Map()
  for (const orders of sources.values()) for (const order of orders) unique.set(order.id, order)
  return [...unique.values()].sort((a, b) => (timestampMillis(b.createdAt) || 0) - (timestampMillis(a.createdAt) || 0))
}

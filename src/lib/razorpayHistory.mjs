export const RAZORPAY_HISTORY_MS = 24 * 60 * 60 * 1000
const SHOP_OFFSET_MS = 5.5 * 60 * 60 * 1000

export function timestampMillis(value) {
  if (!value) return NaN
  return value.toMillis?.() ?? value.toDate?.().getTime() ?? new Date(value).getTime()
}

export function isRecentRazorpayOrder(order, now = Date.now()) {
  if (order.status !== 'paid' || order.paymentMethod !== 'upi') return false
  const paid = timestampMillis(order.paidAt || order.createdAt)
  return Number.isFinite(paid) && paid <= now && now - paid < RAZORPAY_HISTORY_MS
}

// Keep the listener bound stable for a shop day instead of refetching on every
// minute tick. The UI expires orders after exactly 24 hours. The query reads
// at most two shop days and renews at midnight in India.
export function historyQueryStart(now = Date.now()) {
  return Math.floor((now + SHOP_OFFSET_MS) / RAZORPAY_HISTORY_MS) * RAZORPAY_HISTORY_MS - SHOP_OFFSET_MS - RAZORPAY_HISTORY_MS
}

export const razorpayQueryStart = historyQueryStart

export function mergeLiveOrders(sources) {
  const unique = new Map()
  for (const orders of sources.values()) for (const order of orders) unique.set(order.id, order)
  return [...unique.values()].sort((a, b) => (timestampMillis(b.createdAt) || 0) - (timestampMillis(a.createdAt) || 0))
}

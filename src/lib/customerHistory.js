export const ORDER_HISTORY_HOURS = 24
export const FULFILLED_REQUEST_HISTORY_HOURS = 24

export function createdAtMillis(record) {
  const timestamp = record.createdAt
  if (!timestamp) return NaN
  if (typeof timestamp.toMillis === 'function') return timestamp.toMillis()
  if (typeof timestamp.toDate === 'function') return timestamp.toDate().getTime()
  if (timestamp instanceof Date) return timestamp.getTime()
  return NaN
}

export function withinHistoryWindow(record, hours, now = Date.now()) {
  const created = createdAtMillis(record)
  return Number.isFinite(created) && created <= now && now - created < hours * 60 * 60 * 1000
}

export function requestStatus(record) {
  return record.status || (record.resolved ? 'completed' : 'pending')
}

export function fulfilledRequestExpiryMillis(record) {
  if (requestStatus(record) !== 'completed') return Infinity
  const seenAt = record.customerSeenAt
  if (!seenAt) return Infinity
  const seen = typeof seenAt.toMillis === 'function'
    ? seenAt.toMillis()
    : typeof seenAt.toDate === 'function'
      ? seenAt.toDate().getTime()
      : seenAt instanceof Date
        ? seenAt.getTime()
        : NaN
  return Number.isFinite(seen) ? seen + FULFILLED_REQUEST_HISTORY_HOURS * 3600000 : Infinity
}

// Open requests never age out. Fulfilled requests remain visible until the customer
// acknowledges the update, then disappear from only the customer UI after 24 hours.
export function customerRequestVisible(record, now = Date.now()) {
  return now < fulfilledRequestExpiryMillis(record)
}

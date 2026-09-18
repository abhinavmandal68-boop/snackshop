export const ORDER_HISTORY_HOURS = 24
export const REQUEST_HISTORY_HOURS = 48

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

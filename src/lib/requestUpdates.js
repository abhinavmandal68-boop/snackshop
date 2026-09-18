export const requestStatus = request => request.status || (request.resolved ? 'completed' : 'pending')

// Initial snapshots show persistent badges, not a burst of stale notifications.
export function requestTransitions(previous, requests) {
  if (!previous) return []
  return requests.flatMap(request => {
    const status = requestStatus(request)
    return previous.has(request.id) && previous.get(request.id) !== status && ['in_progress', 'completed'].includes(status)
      ? [{ id: request.id, status }]
      : []
  })
}

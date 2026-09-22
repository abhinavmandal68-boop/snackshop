import { useCallback, useEffect, useRef, useState } from 'react'
import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore'
import { db } from './firebase'
import { REQUEST_HISTORY_HOURS, withinHistoryWindow } from './customerHistory'
import { requestUpdateKey, unreadRequestUpdates } from './requestUpdates'

const storageKey = uid => `snackshop:seen-request-updates:${uid}`

const readAcknowledged = uid => {
  try {
    return JSON.parse(localStorage.getItem(storageKey(uid)) || '[]')
  } catch {
    return []
  }
}

export default function useRequestUpdateBadge(uid) {
  const [unreadCount, setUnreadCount] = useState(0)
  const currentUpdates = useRef([])

  useEffect(() => {
    if (!uid) {
      currentUpdates.current = []
      setUnreadCount(0)
      return undefined
    }

    const requestsQuery = query(
      collection(db, 'requests'),
      where('userId', '==', uid),
      orderBy('createdAt', 'desc')
    )

    return onSnapshot(requestsQuery, snapshot => {
      const requests = snapshot.docs
        .map(item => ({ id: item.id, ...item.data({ serverTimestamps: 'estimate' }) }))
        .filter(request => withinHistoryWindow(request, REQUEST_HISTORY_HOURS))
      currentUpdates.current = requests
      setUnreadCount(unreadRequestUpdates(requests, readAcknowledged(uid)).length)
    }, error => console.error('Request update badge:', error))
  }, [uid])

  const markRequestUpdatesRead = useCallback(() => {
    if (!uid) return
    const keys = currentUpdates.current.map(requestUpdateKey)
    try {
      localStorage.setItem(storageKey(uid), JSON.stringify(keys))
    } catch {
      // The badge still clears for this session when storage is unavailable.
    }
    setUnreadCount(0)
  }, [uid])

  return { unreadCount, markRequestUpdatesRead }
}

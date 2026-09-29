import { useCallback, useEffect, useRef, useState } from 'react'
import { collection, doc, onSnapshot, orderBy, query, serverTimestamp, updateDoc, where } from 'firebase/firestore'
import { db } from './firebase'
import { customerRequestVisible } from './customerHistory'
import { requestStatus, requestUpdateKey, unreadRequestUpdates } from './requestUpdates'

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
        .filter(request => customerRequestVisible(request))
      currentUpdates.current = requests
      setUnreadCount(unreadRequestUpdates(requests, readAcknowledged(uid)).length)
    }, error => console.error('Request update badge:', error))
  }, [uid])

  const markRequestUpdatesRead = useCallback(async () => {
    if (!uid) return
    const keys = currentUpdates.current.map(requestUpdateKey)
    const newlySeenFulfilled = currentUpdates.current.filter(request =>
      requestStatus(request) === 'completed' && !request.customerSeenAt
    )
    try {
      localStorage.setItem(storageKey(uid), JSON.stringify(keys))
    } catch {
      // The badge still clears for this session when storage is unavailable.
    }
    setUnreadCount(0)
    const results = await Promise.allSettled(newlySeenFulfilled.map(request =>
      updateDoc(doc(db, 'requests', request.id), { customerSeenAt: serverTimestamp() })
    ))
    const failed = results.find(result => result.status === 'rejected')
    if (failed) console.error('Could not acknowledge fulfilled request:', failed.reason)
  }, [uid])

  return { unreadCount, markRequestUpdatesRead }
}

import { useEffect, useState } from 'react'
import { createdAtMillis, withinHistoryWindow } from './customerHistory'

// Expire cards even if no Firestore updates arrive while the page stays open.
export function useHistoryWindow(records, hours) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    let timer
    const refresh = () => {
      clearTimeout(timer)
      const current = Date.now()
      setNow(current)
      const expiries = records.map(record => createdAtMillis(record) + hours * 3600000).filter(time => time > current)
      const delay = expiries.length ? Math.min(60000, Math.min(...expiries) - current + 1) : 60000
      timer = setTimeout(refresh, delay)
    }
    refresh()
    window.addEventListener('focus', refresh)
    return () => { clearTimeout(timer); window.removeEventListener('focus', refresh) }
  }, [records, hours])
  return records.filter(record => withinHistoryWindow(record, hours, now))
}

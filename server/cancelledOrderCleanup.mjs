import { FieldPath } from 'firebase-admin/firestore'
import { shopDateKey } from '../src/lib/monthlyReports.mjs'
import { runReportedTransaction } from './reportedTransaction.mjs'

export function cancellationCutoff(now = new Date()) {
  const day = shopDateKey(now)
  if (!day) throw new Error('Invalid cleanup date')
  return new Date(`${day}T00:00:00+05:30`).getTime()
}

export function isExpiredCancellation(snapshot, cutoff) {
  if (!snapshot.exists || snapshot.data().status !== 'cancelled') return false
  // Older clients did not record cancelledAt. The last server write is a
  // conservative fallback; createdAt could predate today's cancellation.
  const timestamp = snapshot.data().cancelledAt ?? snapshot.updateTime
  const millis = timestamp?.toMillis?.()
  return Number.isFinite(millis) && millis < cutoff
}

export async function cleanupCancelledOrders(db, { now = new Date(), pageSize = 25 } = {}) {
  const cutoff = cancellationCutoff(now)
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50) throw new Error('Invalid cleanup page size')
  let cursor, deleted = 0, skipped = 0
  while (true) {
    let query = db.collection('orders').where('status', '==', 'cancelled')
      .orderBy(FieldPath.documentId()).limit(pageSize)
    if (cursor) query = query.startAfter(cursor)
    const page = await query.get()
    if (page.empty) break
    // Re-read inside a transaction so a late payment or a new cancellation
    // cannot be deleted using a stale query snapshot. Archive reports through
    // the same path as manual deletion; never adjust product stock here.
    const result = await runReportedTransaction(db, async tx => {
      const current = await tx.getAllWithReports(...page.docs.map(document => document.ref))
      let removed = 0, retained = 0
      for (const snapshot of current) {
        if (!isExpiredCancellation(snapshot, cutoff)) { retained++; continue }
        tx.delete(snapshot.ref)
        removed++
      }
      return { removed, retained }
    })
    deleted += result.removed
    skipped += result.retained
    cursor = page.docs.at(-1).id
    if (page.size < pageSize) break
  }
  return { deleted, skipped }
}

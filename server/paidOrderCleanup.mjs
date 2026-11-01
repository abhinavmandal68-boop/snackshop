import { FieldPath } from 'firebase-admin/firestore'
import { canDeletePaidOrder } from '../src/lib/monthlyReports.mjs'
import { runReportedTransaction } from './reportedTransaction.mjs'

// Each request handles one bounded page, including orders never opened in the UI.
export async function deletePaidOrdersPage(db, { cursor = '', pageSize = 50 } = {}) {
  if (typeof cursor !== 'string' || (cursor && !/^[A-Za-z0-9_-]{1,150}$/.test(cursor)) || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50) {
    throw Object.assign(new Error('Invalid paid-order selection'), { status: 400 })
  }
  let query = db.collection('orders').where('status', '==', 'paid').orderBy(FieldPath.documentId()).limit(pageSize)
  if (cursor) query = query.startAfter(cursor)
  const page = await query.get()
  const result = await runReportedTransaction(db, async tx => {
    const current = await tx.getAllWithReports(...page.docs.map(document => document.ref))
    const deletedIds = []
    let skipped = 0
    for (const snapshot of current) {
      // Recheck payments inside the transaction; loans and unaccepted orders stay.
      if (!snapshot.exists) continue
      if (!canDeletePaidOrder(snapshot.data())) { skipped++; continue }
      tx.delete(snapshot.ref)
      deletedIds.push(snapshot.id)
    }
    return { deleted: deletedIds.length, deletedIds, skipped }
  })
  return { ...result, cursor: page.docs.at(-1)?.id || cursor, done: page.size < pageSize }
}

import test from 'node:test'
import assert from 'node:assert/strict'
import { orderContribution, ledgerContribution, contributionDelta, archivedContribution, reportTotals, monthlyCsv, monthBounds, shopDateKey, canDeleteHistory } from '../src/lib/monthlyReports.mjs'
import { runReportedTransaction } from '../server/reportedTransaction.mjs'
import { cashPaymentPatch } from '../src/lib/orderPayments.mjs'

const pending = { createdAt: new Date('2026-09-30T12:00:00+05:30'), total: 100, paymentMethod: 'cash', status: 'pending' }
const partial = { ...pending, ...cashPaymentPatch(pending, { type: 'partial', amount: 30 }, new Date('2026-09-30T12:00:00+05:30')) }
const paid = { ...partial, ...cashPaymentPatch(partial, { type: 'full' }, new Date('2026-10-02T12:00:00+05:30')) }

test('monthly reports count the order once and put repayments in their collection month', () => {
  const report = orderContribution(paid)
  assert.equal(report['2026-09'].orderCount, 1)
  assert.equal(report['2026-09'].revenueCents, 3000)
  assert.equal(report['2026-10'].revenueCents, 7000)
  assert.equal(report['2026-10'].orderCount, undefined)
  assert.equal(report['2026-09'].owedCents, 0)
  const delta = contributionDelta(orderContribution(partial), report)
  assert.equal(delta['2026-09'].owedCents, -7000)
  assert.equal(delta['2026-10'].revenueCents, 7000)
  assert.equal(delta['2026-09'].orderCount, undefined)
})

test('monthly CSV has only requested metrics and preserves report totals after archival', () => {
  const original = orderContribution(paid), archived = archivedContribution(original)
  assert.deepEqual(contributionDelta(original, archived), { '2026-09': { historyCount: -1 } })
  const report = { month: '2026-09', ...archived['2026-09'], ...ledgerContribution({ type: 'procurement', amount: 10, transactionDate: '2026-09-01' })['2026-09'], refundCents: 200 }
  assert.deepEqual(reportTotals(report), { revenue: 30, profit: 22 })
  assert.equal(monthlyCsv([report]), '\uFEFFMonth,No of orders,Revenue (INR),Profit (INR)\r\n2026-09,1,30.00,22.00\r\n')
  assert.equal(canDeleteHistory(partial), false)
  assert.equal(canDeleteHistory(pending), false)
  assert.equal(canDeleteHistory(paid), true)
})

test('month boundaries use shop time even when the server is in UTC', () => {
  assert.equal(shopDateKey(new Date('2026-09-30T18:30:00Z')), '2026-10-01')
  assert.deepEqual(monthBounds('2026-12').map(date => date.toISOString()), ['2026-11-30T18:30:00.000Z', '2026-12-31T18:30:00.000Z'])
  assert.throws(() => monthBounds('2026-13'))
})

function fakeDb() {
  const documents = new Map(), writes = []
  const reference = (collection, id) => ({ path: `${collection}/${id}`, id, parent: { id: collection } })
  return {
    documents, writes,
    collection: collection => ({ doc: id => reference(collection, id) }),
    runTransaction: async fn => {
      let writing = false
      return fn({
        get: async ref => {
          assert.equal(writing, false, 'All reads must precede writes')
          return { exists: documents.has(ref.path), data: () => documents.get(ref.path) }
        },
        set: (ref, data, options) => { writing = true; writes.push({ ref, data }); if (!ref.id.startsWith('__report_')) documents.set(ref.path, options?.merge ? { ...documents.get(ref.path), ...data } : data) },
        update: (ref, data) => { writing = true; documents.set(ref.path, { ...documents.get(ref.path), ...data }) },
        delete: ref => { writing = true; documents.delete(ref.path) },
      })
    },
  }
}

test('payment retries and repeated initialization do not double-count; archive keeps money', async () => {
  const db = fakeDb(), ref = db.collection('orders').doc('test')
  db.documents.set(ref.path, paid)
  const sync = () => runReportedTransaction(db, async tx => { const current = await tx.get(ref); tx.set(ref, current.data()) })
  await sync()
  const firstReports = db.writes.filter(write => write.ref.id.startsWith('__report_')).length
  assert.equal(firstReports, 2)
  await sync()
  assert.equal(db.writes.filter(write => write.ref.id.startsWith('__report_')).length, firstReports)
  await runReportedTransaction(db, async tx => { await tx.get(ref); tx.delete(ref) })
  const archive = db.writes.filter(write => write.ref.id.startsWith('__report_')).at(-1)
  assert.equal(archive.data.historyCount.operand, -1)
  assert.equal(archive.data.revenueCents, undefined)
  assert.equal(db.documents.has(ref.path), false)
})

test('bulk history deletion updates a shared month once and leaves its money intact', async () => {
  const db = fakeDb()
  const refs = ['one', 'two'].map(id => db.collection('orders').doc(id))
  await runReportedTransaction(db, async tx => { refs.forEach(ref => tx.set(ref, paid)) })
  db.writes.length = 0
  await runReportedTransaction(db, async tx => {
    await Promise.all(refs.map(ref => tx.get(ref)))
    refs.forEach(ref => tx.delete(ref))
  })
  const reports = db.writes.filter(write => write.ref.id.startsWith('__report_'))
  assert.equal(reports.length, 1)
  assert.equal(reports[0].data.historyCount.operand, -2)
  assert.equal(reports[0].data.revenueCents, undefined)
  assert.equal(db.documents.has(refs[0].path), false)
  assert.equal(db.documents.has(refs[1].path), false)
})

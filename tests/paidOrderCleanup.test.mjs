import test from 'node:test'
import assert from 'node:assert/strict'
import { Timestamp } from 'firebase-admin/firestore'
import { mutateOrder } from '../api/shop.mjs'
import { database } from './helpers/firestore.mjs'
import { deletePaidOrdersPage } from '../server/paidOrderCleanup.mjs'
import { runReportedTransaction } from '../server/reportedTransaction.mjs'
import { cashPaymentPatch } from '../src/lib/orderPayments.mjs'
import { orderMonthlyReports, reportTotals, monthlyCsv } from '../src/lib/monthlyReports.mjs'

const at = value => Timestamp.fromDate(new Date(value))
const october = at('2026-10-12T12:00:00+05:30')
const november = at('2026-11-01T12:00:00+05:30')
const paid = { status: 'paid', paymentMethod: 'cash', total: 100, amountPaid: 100, createdAt: october, paidAt: october }

test('clear all paid pages, keep unpaid and active orders, preserve October profit and separate finance entries', async () => {
  const db = database({}, { retry: true })
  const orders = {
    a: paid, b: paid, c: { ...paid, paymentMethod: 'upi', accepted: true },
    d: { ...paid, paymentMethod: 'upi', accepted: false },
    loan: { ...paid, status: 'loaned', amountPaid: 0 },
    partial: { ...paid, status: 'partially_paid', amountPaid: 40, cashPayments: [{ amount: 40, paidAt: october }] },
    pending: { ...paid, status: 'pending', amountPaid: 0 },
    cancelled: { ...paid, status: 'cancelled', amountPaid: 0 },
    inconsistent: { ...paid, amountPaid: 20 },
  }
  await runReportedTransaction(db, async tx => {
    for (const [id, order] of Object.entries(orders)) tx.set(db.collection('orders').doc(id), order)
    tx.set(db.collection('ledger').doc('stock'), { type: 'procurement', amount: 150, transactionDate: '2026-10-01' })
    tx.set(db.collection('ledger').doc('refund'), { type: 'refund', amount: 10, transactionDate: '2026-10-02' })
    tx.set(db.collection('ledger').doc('cashback'), { type: 'cashback', amount: 5, transactionDate: '2026-10-03' })
    tx.set(db.collection('ledger').doc('next-stock'), { type: 'procurement', amount: 200, transactionDate: '2026-11-01' })
  })
  const before = { ...db.data.get('ledger/__report_2026-10') }
  assert.equal(before.orderCount, Object.keys(orders).length)
  let cursor = '', deleted = 0, pages = 0, done = false
  do {
    const result = await deletePaidOrdersPage(db, { cursor, pageSize: 2 })
    cursor = result.cursor; done = result.done; deleted += result.deleted; pages++
  } while (!done)
  assert.equal(deleted, 3); assert.equal(pages, 3)
  for (const id of ['a', 'b', 'c']) assert.equal(db.data.has(`orders/${id}`), false)
  for (const id of ['loan', 'partial', 'pending', 'cancelled', 'd', 'inconsistent']) assert.ok(db.data.has(`orders/${id}`))
  const after = db.data.get('ledger/__report_2026-10')
  assert.deepEqual(reportTotals(after), reportTotals(before))
  assert.equal(after.orderCount, before.orderCount)
  assert.equal(after.historyCount, before.historyCount - deleted)
  assert.equal(after.procurementCents, 15000)
  assert.equal(db.data.get('ledger/stock').amount, 150)
  assert.deepEqual(orderMonthlyReports([after, db.data.get('ledger/__report_2026-11')]), [after])
  await deletePaidOrdersPage(db)
  assert.deepEqual(reportTotals(db.data.get('ledger/__report_2026-10')), reportTotals(before))
})

test('a loan or partial payment survives until fully paid; later repayments keep their collection month', async () => {
  for (const amountPaid of [0, 40]) {
    const order = { ...paid, status: amountPaid ? 'partially_paid' : 'loaned', amountPaid, cashPayments: amountPaid ? [{ amount: amountPaid, paidAt: october }] : [] }
    const db = database({}, { retry: true })
    await runReportedTransaction(db, async tx => tx.set(db.collection('orders').doc('loan'), order))
    assert.equal((await deletePaidOrdersPage(db)).deleted, 0)
    await runReportedTransaction(db, async tx => {
      const snap = await tx.getWithReport(db.collection('orders').doc('loan'))
      tx.update(snap.ref, cashPaymentPatch(snap.data(), { type: 'full' }, november))
    })
    const beforeOctober = reportTotals(db.data.get('ledger/__report_2026-10'))
    const beforeNovember = reportTotals(db.data.get('ledger/__report_2026-11'))
    assert.equal(beforeOctober.revenue, amountPaid)
    assert.equal(beforeNovember.revenue, 100 - amountPaid)
    assert.equal((await deletePaidOrdersPage(db)).deleted, 1)
    assert.deepEqual(reportTotals(db.data.get('ledger/__report_2026-10')), beforeOctober)
    assert.deepEqual(reportTotals(db.data.get('ledger/__report_2026-11')), beforeNovember)
  }
})

test('individual loan and partial deletions clear balances and preserve collected cash and stock', async () => {
  const admin = { uid: 'admin' }
  const inventory = { stock: 5, reserved: 2 }
  const db = database({ 'products/snack': inventory }, { retry: true })
  const order = { paymentMethod: 'cash', total: 100, createdAt: october, stockDeducted: true, items: [{ productId: 'snack', qty: 1 }] }
  await runReportedTransaction(db, async tx => {
    tx.set(db.collection('orders').doc('loan'), { ...order, status: 'loaned', amountPaid: 0 })
    tx.set(db.collection('orders').doc('partial'), { ...order, status: 'partially_paid', amountPaid: 40, cashPayments: [{ amount: 40, paidAt: november }] })
  })
  const octoberReport = 'ledger/__report_2026-10'
  const novemberReport = 'ledger/__report_2026-11'
  assert.equal(db.data.get(octoberReport).owedCents, 16000)
  const collections = { ...db.data.get(novemberReport) }

  for (const [orderId, owedCents] of [['loan', 6000], ['partial', 0]]) {
    assert.deepEqual(await mutateOrder(db, admin, 'delete', { orderId }), { deleted: true })
    assert.equal(db.data.has(`orders/${orderId}`), false)
    assert.equal(db.data.get(octoberReport).owedCents, owedCents)
  }

  assert.equal(db.data.get(octoberReport).historyCount, 0)
  assert.equal(db.data.get(octoberReport).orderCount, 2)
  assert.equal(collections.revenueCents, 4000)
  assert.deepEqual(db.data.get(novemberReport), collections)
  assert.deepEqual(db.data.get('products/snack'), inventory)
})

test('individual deletion archives collections from an older partial order without a saved report', async () => {
  const db = database({ 'orders/partial': { ...paid, status: 'partially_paid', amountPaid: 40 } }, { retry: true })
  await mutateOrder(db, { uid: 'admin' }, 'delete', { orderId: 'partial' })
  const report = db.data.get('ledger/__report_2026-10')
  assert.equal(report.revenueCents, 4000)
  assert.equal(report.owedCents || 0, 0)
  assert.equal(report.historyCount || 0, 0)
})

test('individual deletion rejects an order that was fully paid before the delete transaction', async () => {
  const db = database({ 'orders/partial': { ...paid, status: 'partially_paid', amountPaid: 40 } }, {
    beforeTransaction(current) { current.data.set('orders/partial', paid) },
  })
  await assert.rejects(mutateOrder(db, { uid: 'admin' }, 'delete', { orderId: 'partial' }), /can be deleted individually/)
  assert.deepEqual(db.data.get('orders/partial'), paid)
})

test('recheck a changed payment in the transaction, and archive untracked legacy paid orders once', async () => {
  const db = database({ 'orders/a': paid, 'orders/b': paid }, {
    retry: true,
    beforeTransaction(current) { current.data.set('orders/a', { ...paid, status: 'partially_paid', amountPaid: 40 }) },
  })
  assert.deepEqual(await deletePaidOrdersPage(db), { deleted: 1, deletedIds: ['b'], skipped: 1, cursor: 'b', done: true })
  assert.ok(db.data.has('orders/a'))
  assert.equal(reportTotals(db.data.get('ledger/__report_2026-10')).revenue, 100)
  assert.equal((await deletePaidOrdersPage(db)).deleted, 0)
  assert.equal(reportTotals(db.data.get('ledger/__report_2026-10')).revenue, 100)
})

test('reject invalid cursors and page sizes; distinguish order CSV from finance profit export', async () => {
  for (const options of [{ cursor: '../orders' }, { cursor: null }, { pageSize: 0 }, { pageSize: 51 }]) {
    await assert.rejects(deletePaidOrdersPage({}, options), /Invalid paid-order selection/)
  }
  const reports = [{ month: '2026-10', orderCount: 3, revenueCents: 30000, procurementCents: 15000 }]
  assert.match(monthlyCsv(reports), /2026-10,3,300.00,150.00/)
  assert.equal(monthlyCsv(reports, { ordersOnly: true }), '\uFEFFMonth,No of orders,Revenue (INR)\r\n2026-10,3,300.00\r\n')
})

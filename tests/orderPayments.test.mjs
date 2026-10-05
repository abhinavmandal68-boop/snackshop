import test from 'node:test'
import assert from 'node:assert/strict'
import { cashPaymentPatch, collectedAmount, outstandingAmount, loanSummary, revenueReceipts } from '../src/lib/orderPayments.mjs'

const initial = { id: 'cash-order', paymentMethod: 'cash', status: 'pending', total: 100, createdAt: new Date('2026-09-20T12:00:00+05:30') }
const firstDate = new Date('2026-09-25T12:00:00+05:30')
const secondDate = new Date('2026-10-05T12:00:00+05:30')

test('full cash payment is collected once; legacy cash and Razorpay orders still count', () => {
  const paid = { ...initial, ...cashPaymentPatch(initial, { type: 'full' }, firstDate) }
  assert.equal(collectedAmount(paid), 100)
  assert.equal(outstandingAmount(paid), 0)
  assert.equal(revenueReceipts([paid]).reduce((sum, receipt) => sum + receipt.total, 0), 100)
  assert.throws(() => cashPaymentPatch(paid, { type: 'full' }, secondDate))
  assert.equal(collectedAmount({ status: 'paid', paymentMethod: 'cash', total: 45 }), 45)
  assert.equal(collectedAmount({ status: 'paid', paymentMethod: 'upi', total: 65 }), 65)
})

test('partial payment and later settlement preserve separate collection dates', () => {
  const partial = { ...initial, ...cashPaymentPatch(initial, { type: 'partial', amount: 30 }, firstDate) }
  assert.equal(partial.status, 'partially_paid')
  assert.equal(partial.stockDeducted, true)
  assert.equal(collectedAmount(partial), 30)
  assert.equal(outstandingAmount(partial), 70)
  const paid = { ...partial, ...cashPaymentPatch(partial, { type: 'full' }, secondDate) }
  assert.equal(paid.status, 'paid')
  assert.equal(collectedAmount(paid), 100)
  assert.equal(outstandingAmount(paid), 0)
  const receipts = revenueReceipts([paid])
  assert.deepEqual(receipts.map(receipt => receipt.total), [30, 70])
  assert.deepEqual(receipts.map(receipt => receipt.paidAt), [firstDate, secondDate])
})

test('loan produces no revenue and only allows full settlement afterward', () => {
  const loaned = { ...initial, ...cashPaymentPatch(initial, { type: 'loan' }, firstDate) }
  assert.equal(loaned.status, 'loaned')
  assert.equal(collectedAmount(loaned), 0)
  assert.equal(outstandingAmount(loaned), 100)
  assert.deepEqual(revenueReceipts([loaned]), [])
  assert.throws(() => cashPaymentPatch(loaned, { type: 'partial', amount: 20 }, secondDate))
  assert.throws(() => cashPaymentPatch(loaned, { type: 'loan' }, secondDate))
  const partial = { ...initial, ...cashPaymentPatch(initial, { type: 'partial', amount: 20 }, firstDate) }
  assert.throws(() => cashPaymentPatch(partial, { type: 'partial', amount: 10 }, secondDate))
  const another = { ...initial, id: 'another', total: 60, ...cashPaymentPatch({ ...initial, total: 60 }, { type: 'loan' }, firstDate) }
  assert.deepEqual(loanSummary([partial, another]), { partial: 80, loaned: 60, total: 140, count: 2 })
  assert.equal(revenueReceipts([partial, another]).reduce((sum, receipt) => sum + receipt.total, 0), 20)
  const paid = { ...loaned, ...cashPaymentPatch(loaned, { type: 'full' }, secondDate) }
  assert.equal(collectedAmount(paid), 100)
  assert.equal(outstandingAmount(paid), 0)
})

test('invalid partial amounts and non-cash or cancelled orders cannot be recorded', () => {
  for (const amount of [-10, 0, 100, 101, NaN, Infinity, 'bad']) {
    assert.throws(() => cashPaymentPatch(initial, { type: 'partial', amount }, firstDate))
  }
  assert.throws(() => cashPaymentPatch({ ...initial, paymentMethod: 'upi' }, { type: 'full' }, firstDate))
  assert.throws(() => cashPaymentPatch({ ...initial, status: 'cancelled' }, { type: 'full' }, firstDate))
  assert.equal(collectedAmount({ ...initial, status: 'cancelled', amountPaid: 100 }), 0)
})

test('decimal installments settle exactly and existing partial amounts retain their history', () => {
  const order = { ...initial, total: 0.3 }
  const partial = { ...order, ...cashPaymentPatch(order, { type: 'partial', amount: 0.1 }, firstDate) }
  const paid = { ...partial, ...cashPaymentPatch(partial, { type: 'full' }, secondDate) }
  assert.equal(paid.amountPaid, 0.3)
  assert.equal(paid.status, 'paid')
  assert.deepEqual(paid.cashPayments.map(payment => payment.amount), [0.1, 0.2])
  const legacyPartial = { ...initial, status: 'partially_paid', amountPaid: 30 }
  const migrated = { ...legacyPartial, ...cashPaymentPatch(legacyPartial, { type: 'full' }, secondDate) }
  assert.deepEqual(migrated.cashPayments.map(payment => payment.amount), [30, 70])
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { isRecentRazorpayOrder, razorpayQueryStart, mergeLiveOrders, RAZORPAY_HISTORY_MS } from '../src/lib/razorpayHistory.mjs'

test('accepted Razorpay payments remain recent for 24 hours from payment, not creation', () => {
  const now = Date.parse('2026-10-07T12:00:00+05:30')
  const order = { id: 'paid', status: 'paid', paymentMethod: 'upi', accepted: true, createdAt: new Date(now - 2 * RAZORPAY_HISTORY_MS), paidAt: { toMillis: () => now - RAZORPAY_HISTORY_MS + 1 } }
  assert.equal(isRecentRazorpayOrder(order, now), true)
  assert.equal(isRecentRazorpayOrder(order, now + 1), false)
  assert.equal(isRecentRazorpayOrder({ ...order, accepted: false }, now), true)
  assert.equal(isRecentRazorpayOrder({ ...order, paymentMethod: 'cash' }, now), false)
  assert.equal(isRecentRazorpayOrder({ ...order, status: 'draft' }, now), false)
  assert.equal(isRecentRazorpayOrder({ ...order, paidAt: new Date(now + 1) }, now), false)
})

test('recent-payment query stays stable during the shop day and renews at Indian midnight', () => {
  const morning = Date.parse('2026-10-07T00:01:00+05:30')
  const evening = Date.parse('2026-10-07T23:59:59+05:30')
  assert.equal(new Date(razorpayQueryStart(morning)).toISOString(), '2026-10-05T18:30:00.000Z')
  assert.equal(razorpayQueryStart(morning), razorpayQueryStart(evening))
  assert.equal(razorpayQueryStart(evening + 1000) - razorpayQueryStart(evening), RAZORPAY_HISTORY_MS)
})

test('orders present in both verified and recent queries are counted only once', () => {
  const order = { id: 'same-order', createdAt: new Date('2026-10-07'), status: 'paid', accepted: false }
  const sources = new Map([['verified', [order]], ['recent', [{ ...order, accepted: true }]]])
  assert.equal(mergeLiveOrders(sources).length, 1)
  assert.equal(mergeLiveOrders(sources)[0].accepted, true)
  sources.set('verified', [])
  assert.equal(mergeLiveOrders(sources).length, 1, 'Acceptance must not remove the recent card')
})

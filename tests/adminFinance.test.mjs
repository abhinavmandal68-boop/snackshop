import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { cashPaymentPatch, revenueReceipts } from '../src/lib/orderPayments.mjs'

test('admin preview renders loan totals, highlighted balances, and three cash choices', async () => {
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
  try {
    const { default: AdminPreview } = await server.ssrLoadModule('/src/pages/AdminPreview.jsx')
    const html = renderToStaticMarkup(React.createElement(AdminPreview))
    assert.match(html, /loan-summary-total[^>]*>₹110/)
    assert.match(html, /loan-summary-partial[^>]*>Partial <strong>₹50/)
    assert.match(html, /loan-summary-loaned[^>]*>Loaned <strong>₹60/)
    assert.match(html, /order-outstanding-partially_paid/)
    assert.match(html, /order-outstanding-loaned/)
    for (const label of ['Paid in full', 'Paid partially', 'Loaned']) assert.ok(html.includes(label))
    assert.ok(!html.includes('Record partial payment'))
    assert.ok(!html.includes('Awaiting verify'))
    assert.ok(html.includes('Active orders (live)'))
    assert.ok(html.includes('Unpaid loans (live)'))
    assert.ok(html.includes('Paid Razorpay orders (last 24 hours)'))
    assert.ok(html.includes('Sample recent Razorpay customer'))
    assert.ok(html.includes('Download monthly CSV'))
    assert.ok(html.includes('September 2026'))
    assert.ok(!html.includes('Sample customer E'), 'Completed history must stay hidden until expanded')
  } finally { await server.close() }
})

test('a collapsed month shows stored totals and CSV without loading order history', async () => {
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
  try {
    const { MonthlyHistory } = await server.ssrLoadModule('/src/pages/AdminPage.jsx')
    let fetched = false
    const report = { month: '2026-09', orderCount: 1000, revenueCents: 500000, procurementCents: 300000 }
    const html = renderToStaticMarkup(React.createElement(MonthlyHistory, { report, liveOrders: [], revision: 0, reportsReady: true, processing: {}, loadHistory: () => { fetched = true; return [] } }))
    assert.equal(fetched, false)
    assert.ok(html.includes('1000 orders'))
    assert.ok(html.includes('₹5,000'))
    assert.ok(html.includes('₹2,000'))
    assert.ok(html.includes('CSV'))
    assert.ok(!html.includes('admin-order-list'))
  } finally { await server.close() }
})

test('loaned and partially paid orders have only the full-payment action', async () => {
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
  try {
    const { default: CashPaymentActions } = await server.ssrLoadModule('/src/components/CashPaymentActions.jsx')
    for (const status of ['loaned', 'partially_paid']) {
      const order = { status, paymentMethod: 'cash', total: 100, amountPaid: status === 'partially_paid' ? 30 : 0 }
      const html = renderToStaticMarkup(React.createElement(CashPaymentActions, { order, onSave: () => {} }))
      assert.equal((html.match(/<button/g) || []).length, 1)
      assert.ok(html.includes('Paid in full'))
      assert.ok(html.includes(status === 'partially_paid' ? 'Collect ₹70' : 'Collect ₹100'))
      assert.ok(!html.includes('cash-choice-partial'))
      assert.ok(!html.includes('cash-choice-loan'))
    }
  } finally { await server.close() }
})

test('finance totals and monthly sales include only collections, with repayment in its own month', async () => {
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
  try {
    const { financeTotals, financeMonthOptions, localDateKey } = await server.ssrLoadModule('/src/components/Ledger.jsx')
    const pending = { id: 'partial', status: 'pending', paymentMethod: 'cash', total: 100 }
    const partial = { ...pending, ...cashPaymentPatch(pending, { type: 'partial', amount: 30 }, new Date('2026-09-25T12:00:00+05:30')) }
    const loan = { ...pending, id: 'loan', ...cashPaymentPatch(pending, { type: 'loan' }, new Date('2026-09-25T12:00:00+05:30')) }
    const entries = [{ type: 'procurement', amount: 10 }, { type: 'refund', amount: 2 }]
    assert.equal(financeTotals(entries, [partial, loan]).sales, 30)
    assert.equal(financeTotals(entries, [partial, loan]).profit, 22)
    const paid = { ...partial, ...cashPaymentPatch(partial, { type: 'full' }, new Date('2026-10-05T12:00:00+05:30')) }
    const receipts = revenueReceipts([paid, loan])
    const september = receipts.filter(receipt => localDateKey(receipt.paidAt).startsWith('2026-09'))
    const october = receipts.filter(receipt => localDateKey(receipt.paidAt).startsWith('2026-10'))
    assert.equal(financeTotals([], september).sales, 30)
    assert.equal(financeTotals([], october).sales, 70)
    assert.equal(financeTotals([], receipts).sales, 100)
    assert.ok(financeMonthOptions([], [paid]).some(option => option.value === '2026-09'))
  } finally { await server.close() }
})

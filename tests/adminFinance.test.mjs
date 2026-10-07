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
    assert.ok(html.includes('All orders (last 24 hours)'))
    assert.ok(html.includes('Sample recent Razorpay customer'))
    assert.ok(html.includes('Sample customer D'), 'Completed cash orders must remain visible for 24 hours')
    assert.ok(html.includes('Sample cancelled customer'))
    assert.ok(!html.includes('Download monthly CSV'))
    assert.ok(!html.includes('Monthly history'))
    assert.ok(!html.includes('Order workflow'))
    assert.ok(!html.includes('Delete this order'))
    assert.ok(!html.includes('Sample customer E'))
    assert.ok(!html.includes('Sample old pending customer'))
    assert.ok(!html.includes('Sample old recently paid customer'), 'The window uses creation time, not payment time')
    assert.ok(!html.includes('Sample draft customer'))
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


test('admin products stay hidden until a search and show only matching inventory', async () => {
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
  try {
    const { AdminView } = await server.ssrLoadModule('/src/pages/AdminPage.jsx')
    const props = {
      products: [
        { id: 'chips', name: 'Spicy Chips', category: 'chips', price: 20, stock: 4 },
        { id: 'drink', name: 'Cola Bottle', category: 'drinks', price: 30, stock: 2 },
      ],
      orders: [], requests: [], tab: 'products', setTab: () => {},
      totalRevenue: 0, pendingPayments: 0, needsActionCount: 0, pendingReqs: 0,
      adding: false, processing: {}, requestMonthGroups: {}, setProductSearch: () => {},
    }
    const render = extra => renderToStaticMarkup(React.createElement(AdminView, { ...props, ...extra }))
    for (const productSearch of ['', '   ']) {
      const html = render({ productSearch })
      assert.ok(html.includes('Search for a product or category'))
      assert.ok(!html.includes('Spicy Chips'))
      assert.ok(!html.includes('Cola Bottle'))
      assert.ok(!html.includes('No products match'))
    }
    const matching = render({ productSearch: '  SPICY  ' })
    assert.ok(matching.includes('Spicy Chips'))
    assert.ok(!matching.includes('Cola Bottle'))
    const category = render({ productSearch: 'drinks' })
    assert.ok(category.includes('Cola Bottle'))
    assert.ok(!category.includes('Spicy Chips'))
    const empty = render({ productSearch: 'missing snack' })
    assert.ok(empty.includes('No products match'))
    assert.ok(!empty.includes('Spicy Chips'))
    const loading = render({ products: [], productSearch: 'chips', productLoadStatus: 'loading' })
    assert.ok(loading.includes('Loading products...'))
    assert.ok(!loading.includes('No products yet'))
  } finally { await server.close() }
})

test('admin orders expire at 24 hours while old requests remain visible', async () => {
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
  try {
    const { AdminView } = await server.ssrLoadModule('/src/pages/AdminPage.jsx')
    const now = Date.now()
    const props = {
      products: [], orders: [
        { id: 'edge', customerName: 'Expired boundary customer', status: 'pending', paymentMethod: 'cash', total: 20, createdAt: new Date(now - 24 * 3600000) },
        { id: 'future', customerName: 'Future customer', status: 'paid', paymentMethod: 'cash', total: 20, createdAt: new Date(now + 3600000) },
      ], requests: [], tab: 'orders', setTab: () => {}, reports: [{ month: '2026-09', orderCount: 5 }],
      totalRevenue: 0, pendingPayments: 0, needsActionCount: 0, pendingReqs: 0, processing: {},
    }
    const html = renderToStaticMarkup(React.createElement(AdminView, props))
    assert.ok(html.includes('No orders in the last 24 hours.'))
    assert.ok(!html.includes('Expired boundary customer'))
    assert.ok(!html.includes('Future customer'))
    assert.ok(!html.includes('Monthly history'))
    const request = { id: 'old-request', customerName: 'Old request customer', message: 'Keep this old request visible', status: 'pending', resolved: false, createdAt: { toDate: () => new Date(now - 48 * 3600000) } }
    const requestsHtml = renderToStaticMarkup(React.createElement(AdminView, { ...props, tab: 'requests', requests: [request], pendingReqs: 1, requestMonthGroups: { 'Old requests': [request] } }))
    assert.ok(requestsHtml.includes('Keep this old request visible'))
    assert.ok(requestsHtml.includes('1 request'))
  } finally { await server.close() }
})

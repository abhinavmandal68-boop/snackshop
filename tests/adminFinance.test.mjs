import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { cashPaymentPatch, revenueReceipts } from '../src/lib/orderPayments.mjs'

test('admin preview hides existing orders and loans while retaining collapsed months and CSV', async () => {
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
  try {
    const { default: AdminPreview } = await server.ssrLoadModule('/src/pages/AdminPreview.jsx')
    const html = renderToStaticMarkup(React.createElement(AdminPreview))
    assert.ok(html.includes('Waiting for new orders'))
    assert.ok(html.includes('Show pending orders'))
    assert.ok(html.includes('Show past 24 hours'))
    assert.ok(html.includes('Simulate new order'))
    assert.ok(html.includes('Download monthly CSV'))
    assert.ok(html.includes('Monthly history'))
    assert.ok(html.includes('September 2026'))
    assert.ok(!html.includes('Order workflow'))
    assert.ok(!html.includes('Delete this order'))
    assert.ok(!html.includes('admin-order-list'))
    for (const customer of ['Sample recent Razorpay customer', 'Sample customer D', 'Sample cancelled customer', 'Sample customer E', 'Sample old pending customer', 'Sample old recently paid customer', 'Sample draft customer']) assert.ok(!html.includes(customer))
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
      ], requests: [], orderView: 'history', orderLoadStatus: { history: 'ready', pending: 'idle', loans: 'idle' }, tab: 'orders', setTab: () => {}, reports: [{ month: '2026-09', orderCount: 5 }],
      totalRevenue: 0, pendingPayments: 0, needsActionCount: 0, pendingReqs: 0, processing: {},
    }
    const html = renderToStaticMarkup(React.createElement(AdminView, props))
    assert.ok(html.includes('No orders in the last 24 hours.'))
    assert.ok(!html.includes('Expired boundary customer'))
    assert.ok(!html.includes('Future customer'))
    assert.ok(html.includes('Monthly history'))
    const request = { id: 'old-request', customerName: 'Old request customer', message: 'Keep this old request visible', status: 'pending', resolved: false, createdAt: { toDate: () => new Date(now - 48 * 3600000) } }
    const requestsHtml = renderToStaticMarkup(React.createElement(AdminView, { ...props, tab: 'requests', requests: [request], pendingReqs: 1, requestMonthGroups: { 'Old requests': [request] } }))
    assert.ok(requestsHtml.includes('Keep this old request visible'))
    assert.ok(requestsHtml.includes('1 request'))
  } finally { await server.close() }
})


test('requested order views show all recent statuses and loans stay hidden until requested', async () => {
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
  try {
    const { AdminView } = await server.ssrLoadModule('/src/pages/AdminPage.jsx')
    const createdAt = { toDate: () => new Date(Date.now() - 3600000) }
    const props = {
      products: [], requests: [], tab: 'orders', setTab: () => {}, processing: {},
      totalRevenue: 0, pendingPayments: 0, needsActionCount: 0, pendingReqs: 0,
      orderLoadStatus: { pending: 'idle', history: 'idle', loans: 'idle' },
      orders: [
        { id: 'partial', customerName: 'Partial customer', status: 'partially_paid', paymentMethod: 'cash', total: 80, amountPaid: 30, createdAt },
        { id: 'loan', customerName: 'Loan customer', status: 'loaned', paymentMethod: 'cash', total: 60, amountPaid: 0, createdAt },
        { id: 'cash', customerName: 'Pending cash customer', status: 'pending', paymentMethod: 'cash', total: 40, createdAt },
        { id: 'paid', customerName: 'Paid cash customer', status: 'paid', paymentMethod: 'cash', total: 40, createdAt },
        { id: 'cancelled', customerName: 'Cancelled customer', status: 'cancelled', paymentMethod: 'cash', total: 40, createdAt },
      ],
    }
    const render = extra => renderToStaticMarkup(React.createElement(AdminView, { ...props, ...extra }))
    const initial = render({})
    assert.ok(!initial.includes('Pending cash customer'))
    assert.ok(!initial.includes('Paid cash customer'))
    const newOrder = { ...props.orders[2], id: 'new', customerName: 'Incoming cash customer' }
    const incoming = render({ newOrders: [newOrder] })
    assert.ok(incoming.includes('Incoming cash customer'))
    assert.ok(!incoming.includes('Pending cash customer'))
    assert.ok(!incoming.includes('Paid cash customer'))
    const pending = render({ orderView: 'pending', orderLoadStatus: { ...props.orderLoadStatus, pending: 'ready' } })
    assert.ok(pending.includes('Pending cash customer'))
    assert.ok(!pending.includes('Paid cash customer'))
    const history = render({ orderView: 'history', orderLoadStatus: { ...props.orderLoadStatus, history: 'ready' } })
    for (const order of props.orders) assert.ok(history.includes(order.customerName))
    assert.ok(history.includes('order-outstanding-partially_paid'))
    assert.ok(history.includes('order-outstanding-loaned'))
    for (const label of ['Paid in full', 'Paid partially', 'Loaned']) assert.ok(history.includes(label))
    const hiddenLoans = render({ tab: 'loans' })
    assert.ok(hiddenLoans.includes('Show unpaid loans'))
    assert.ok(!hiddenLoans.includes('Loan customer'))
    const loadedLoans = render({ tab: 'loans', orderLoadStatus: { ...props.orderLoadStatus, loans: 'ready' } })
    assert.ok(loadedLoans.includes('Loan customer'))
    assert.ok(loadedLoans.includes('Partial customer'))
    assert.ok(!loadedLoans.includes('Paid cash customer'))
  } finally { await server.close() }
})

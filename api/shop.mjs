import { FieldPath, Timestamp } from 'firebase-admin/firestore'
import { adminDb, authenticate } from '../server/firebaseAdmin.mjs'
import { runReportedTransaction } from '../server/reportedTransaction.mjs'
import { createServerTimer } from '../server/timing.mjs'
import { cashPaymentPatch, collectedAmount, outstandingAmount } from '../src/lib/orderPayments.mjs'
import { canDeleteHistory, REPORT_TYPE, shopDateKey } from '../src/lib/monthlyReports.mjs'

const fail = message => { throw Object.assign(new Error(message), { status: 400 }) }
const validId = id => typeof id === 'string' && /^[A-Za-z0-9_-]{1,150}$/.test(id)
const paymentState = order => ({
  status: order.status, paymentMethod: order.paymentMethod, total: order.total,
  amountPaid: collectedAmount(order), accepted: Boolean(order.accepted), stockDeducted: Boolean(order.stockDeducted),
  ...(order.paidAt ? { paidAt: order.paidAt.toMillis?.() ?? order.paidAt } : {}),
  ...(Array.isArray(order.cashPayments) ? { cashPayments: order.cashPayments.map(payment => ({
    ...payment, paidAt: payment.paidAt?.toMillis?.() ?? payment.paidAt,
  })) } : {}),
})

export async function initializeReports(db) {
  const metaRef = db.collection('ledger').doc('__report_meta')
  const meta = (await metaRef.get()).data() || { phase: 'orders', cursor: '', processed: 0 }
  if (meta.ready) return { ready: true }
  const phase = meta.phase || 'orders'
  let query = db.collection(phase).orderBy(FieldPath.documentId()).limit(25)
  if (meta.cursor) query = query.startAfter(meta.cursor)
  const page = await query.get()
  const refs = page.docs.filter(document => !document.id.startsWith('__report_')).map(document => document.ref)
  if (refs.length) {
    // One page transaction updates each shared month once. Avoid rewriting
    // every order while customers and administrators are changing them.
    await runReportedTransaction(db, async tx => {
      const snapshots = await tx.getAllWithReports(...refs)
      for (const current of snapshots) {
        if (!current.exists) continue
        const data = current.data()
        // Normalize old verified orders so the small live query finds them.
        if (phase === 'orders' && data.status === 'paid' && data.paymentMethod === 'upi' && data.accepted === undefined) tx.update(current.ref, { accepted: false })
        else tx.report(current.ref)
      }
    })
  }
  const next = { type: 'monthly_report_meta', phase, cursor: page.docs.at(-1)?.id || meta.cursor || '', processed: (meta.processed || 0) + page.size, ready: false }
  if (page.size < 25) {
    if (phase === 'orders') { next.phase = 'ledger'; next.cursor = '' }
    else next.ready = true
  }
  const saved = await db.runTransaction(async tx => {
    const current = (await tx.get(metaRef)).data()
    // Concurrent administrators can resume setup without moving its cursor back.
    if (current && (current.ready || current.phase !== phase || (current.cursor || '') !== (meta.cursor || ''))) return current
    tx.set(metaRef, next)
    return next
  })
  return { ready: saved.ready, processed: saved.processed }
}

export async function mutateOrder(db, user, action, body) {
  if (!validId(body.orderId)) fail('Invalid order')
  const ref = db.collection('orders').doc(body.orderId)
  return runReportedTransaction(db, async tx => {
    const snap = await tx.getWithReport(ref)
    if (action === 'create') {
      if (snap.exists) {
        if (snap.data().userId !== user.uid || snap.data().paymentMethod !== 'cash') fail('Order already exists')
        return { orderId: ref.id, total: snap.data().total }
      }
      const items = body.items
      if (!Array.isArray(items) || !items.length || items.length > 50 || new Set(items.map(item => item.productId)).size !== items.length) fail('Invalid order items')
      if (items.some(item => !validId(item.productId) || !Number.isInteger(item.qty) || item.qty <= 0 || item.qty > 1000)) fail('Invalid order quantity')
      const products = await tx.getAll(...items.map(item => db.collection('products').doc(item.productId)))
      let total = 0
      const savedItems = products.map((product, index) => {
        const item = items[index], data = product.data()
        if (!product.exists || !Number.isFinite(data.price) || data.price <= 0) fail('A product is no longer available')
        if ((data.stock || 0) - (data.reserved || 0) < item.qty) fail(`${data.name} has insufficient stock`)
        total += Math.round(data.price * 100) * item.qty
        return { productId: item.productId, name: data.name, qty: item.qty, price: data.price }
      })
      if (total <= 0 || total > 5000000) fail('Invalid order total')
      products.forEach((product, index) => tx.update(product.ref, { reserved: (product.data().reserved || 0) + items[index].qty }))
      const customerName = String(user.name || body.customerName || user.email?.split('@')[0] || 'Customer').trim().slice(0, 120)
      tx.set(ref, { userId: user.uid, customerName, items: savedItems, total: total / 100, paymentMethod: 'cash', status: 'pending', createdAt: Timestamp.now() })
      return { orderId: ref.id, total: total / 100 }
    }
    if (!snap.exists) fail('This order no longer exists')
    const order = snap.data()
    if (action === 'cancel' && order.userId !== user.uid) throw Object.assign(new Error('This is not your order'), { status: 403 })
    if (action === 'delete') {
      if (!canDeleteHistory(order)) fail('Active orders and unpaid loans cannot be deleted. Complete or cancel them first.')
      tx.delete(ref)
      return { deleted: true }
    }
    if (action === 'accept') {
      if (order.status !== 'paid' || order.paymentMethod !== 'upi') fail('This order is not awaiting acceptance')
      if (order.accepted) return { accepted: true }
      tx.update(ref, { accepted: true })
      return { accepted: true }
    }
    let patch, deduct = false
    if (action === 'pay') {
      const expectedCollected = Number(body.expectedCollected)
      if (body.expectedStatus !== order.status || !Number.isFinite(expectedCollected) || Math.round(expectedCollected * 100) !== Math.round(collectedAmount(order) * 100)) {
        // A retry or another administrator may have already changed this order.
        // Return its saved state without collecting money or deducting stock again.
        return { success: false, updated: true, order: paymentState(order) }
      }
      if (order.paymentMethod !== 'cash' && order.status !== 'utr_submitted') fail('Payment is not awaiting verification')
      patch = order.paymentMethod === 'cash' ? cashPaymentPatch(order, body.selection || { type: 'full' }, Timestamp.now()) : { status: 'paid', accepted: true, paidAt: Timestamp.now(), stockDeducted: true }
      deduct = !order.stockDeducted && !outstandingAmount(order)
    } else {
      const allowed = action === 'cancel' ? ['draft', 'pending', 'utr_submitted'] : ['pending', 'utr_submitted']
      if (!allowed.includes(order.status)) {
        if (action === 'cancel') return { cancelled: false }
        fail('This order has already been updated and cannot be rejected')
      }
      patch = { status: 'cancelled', cancelledBy: action === 'cancel' ? 'customer' : 'admin' }
    }
    const items = action === 'pay' && !deduct ? [] : (order.items || []).filter(item => item.productId)
    const products = await tx.getAll(...items.map(item => db.collection('products').doc(item.productId)))
    products.forEach((product, index) => {
      if (!product.exists) return
      const data = product.data(), qty = items[index].qty
      if (deduct && Number(data.stock || 0) < qty) fail(`${data.name} has insufficient stock`)
      tx.update(product.ref, { reserved: Math.max(0, (data.reserved || 0) - qty), ...(deduct ? { stock: data.stock - qty } : {}) })
    })
    tx.update(ref, patch)
    return { success: true, ...(action === 'pay' ? { order: paymentState({ ...order, ...patch }) } : {}) }
  })
}

export function acceptOrders(db, ids) {
  if (!Array.isArray(ids) || !ids.length || ids.length > 50 || ids.some(id => !validId(id)) || new Set(ids).size !== ids.length) fail('Invalid order selection')
  return runReportedTransaction(db, async tx => {
    const orders = await tx.getAllWithReports(...ids.map(id => db.collection('orders').doc(id)))
    for (const snap of orders) {
      const order = snap.data()
      if (!snap.exists || order.status !== 'paid' || order.paymentMethod !== 'upi') fail('An order is no longer awaiting acceptance. Refresh and try again.')
      if (!order.accepted) tx.update(snap.ref, { accepted: true })
    }
    return { acceptedIds: ids }
  })
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const timed = createServerTimer(res)
  try {
    const db = adminDb(), body = req.body || {}, action = body.action
    if (!['create', 'cancel', 'pay', 'accept', 'acceptMany', 'reject', 'delete', 'deleteHistory', 'initializeReports', 'addLedger', 'deleteLedger'].includes(action)) fail('Unknown action')
    const user = await timed('auth', () => authenticate(req, db, !['create', 'cancel'].includes(action)))
    if (action === 'initializeReports') return res.status(200).json(await initializeReports(db))
    if (action === 'acceptMany') return res.status(200).json(await timed('order_transaction', () => acceptOrders(db, body.ids)))
    if (action === 'deleteHistory') {
      if (!Array.isArray(body.ids) || !body.ids.length || body.ids.length > 50 || body.ids.some(id => !validId(id)) || new Set(body.ids).size !== body.ids.length) fail('Invalid history selection')
      const result = await runReportedTransaction(db, async tx => {
        const snaps = await Promise.all(body.ids.map(id => tx.get(db.collection('orders').doc(id))))
        let deleted = 0, skipped = 0
        for (const snap of snaps) {
          if (!snap.exists) continue
          if (!canDeleteHistory(snap.data())) { skipped++; continue }
          tx.delete(snap.ref); deleted++
        }
        return { deleted, skipped }
      })
      return res.status(200).json(result)
    }
    if (['addLedger', 'deleteLedger'].includes(action)) {
      const entry = body.entry || {}
      let ref
      if (action === 'addLedger') {
        if (!['procurement', 'refund', 'cashback', 'self'].includes(entry.type) || !Number.isFinite(entry.amount) || entry.amount <= 0 || entry.amount > 10000000) fail('Invalid finance entry')
        const now = new Date(), minimum = `${now.getUTCFullYear() - 1}-01-01`
        const maximum = shopDateKey(now)
        if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.transactionDate || '') || shopDateKey(new Date(`${entry.transactionDate}T12:00:00+05:30`)) !== entry.transactionDate || entry.transactionDate < minimum || entry.transactionDate > maximum) fail('Invalid transaction date')
        ref = db.collection('ledger').doc()
      } else {
        if (!validId(body.entryId) || body.entryId.startsWith('__report_')) fail('Invalid finance entry')
        ref = db.collection('ledger').doc(body.entryId)
      }
      await runReportedTransaction(db, async tx => {
        const current = await tx.get(ref)
        if (action === 'addLedger') tx.set(ref, { type: entry.type, amount: Math.round(entry.amount * 100) / 100, transactionDate: entry.transactionDate, note: String(entry.note || '').slice(0, 500), createdAt: Timestamp.now() })
        else if (current.exists && current.data().type !== REPORT_TYPE) tx.delete(ref)
      })
      return res.status(200).json({ success: true })
    }
    return res.status(200).json(await timed('order_transaction', () => mutateOrder(db, user, action, body)))
  } catch (error) {
    console.error('Shop operation failed:', error.code || error.message)
    const quota = error.code === 8 || error.code === 'resource-exhausted' || /quota|RESOURCE_EXHAUSTED/i.test(error.message)
    return res.status(quota ? 429 : error.status || 500).json({ error: quota ? 'Firestore daily quota is exhausted. Retry after the daily reset.' : error.status ? error.message : 'The operation could not complete. Please retry.' })
  }
}

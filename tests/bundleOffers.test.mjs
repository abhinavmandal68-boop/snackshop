import test from 'node:test'
import assert from 'node:assert/strict'
import { Timestamp } from 'firebase-admin/firestore'
import { database } from './helpers/firestore.mjs'
import { mutateOffer } from '../server/bundleOffers.mjs'
import { reserveUpiOrder } from '../server/checkoutOrder.mjs'
import { mutateOrder } from '../api/shop.mjs'
import { priceWithOffers, offerList } from '../src/lib/bundleOffers.mjs'
import { runReportedTransaction } from '../server/reportedTransaction.mjs'
import { deletePaidOrdersPage } from '../server/paidOrderCleanup.mjs'
import { reportTotals } from '../src/lib/monthlyReports.mjs'

const offer = { id: 'kurkure-combo', name: 'Kurkure + chocolate', baseProductId: 'kurkure', pairedProductIds: ['chocopie', 'chocobakes', 'bon'], discount: 5, active: true, paymentMethod: 'upi' }
const user = { uid: 'customer', name: 'Customer' }
const line = (productId, qty = 1, price = 20) => ({ productId, qty, price })
const products = () => Object.fromEntries(['kurkure', 'chocopie', 'chocobakes', 'bon', 'other'].map(id => [`products/${id}`, { name: id, price: 20, stock: 20, reserved: 0 }]))
const state = () => ({ ...products(), 'settings/offers': { offers: [offer] } })

test('₹5 applies to each matching pair, using mixed companions without reusing quantities', () => {
  for (const [base, companions, expected] of [[1, [1, 0, 0], 5], [2, [1, 0, 0], 5], [2, [1, 1, 0], 10], [1, [2, 3, 4], 5], [4, [1, 1, 1], 15]]) {
    const items = [line('kurkure', base), ...['chocopie', 'chocobakes', 'bon'].map((id, i) => line(id, companions[i])).filter(item => item.qty)]
    const pricing = priceWithOffers(items, [offer], 'upi')
    assert.equal(pricing.discount, expected)
    assert.equal(pricing.subtotal - pricing.total, expected)
    assert.equal(pricing.appliedOffers[0].pairs, expected / 5)
  }
})

test('cash, loan payment types, paused offers, and nonmatching baskets receive no discount', () => {
  for (const method of ['cash', 'loaned', 'partially_paid']) assert.equal(priceWithOffers([line('kurkure'), line('chocopie')], [offer], method).discount, 0)
  for (const items of [[line('kurkure')], [line('chocopie')], [line('kurkure'), line('other')]]) assert.equal(priceWithOffers(items, [offer], 'upi').discount, 0)
  assert.equal(priceWithOffers([line('kurkure'), line('chocopie')], [{ ...offer, active: false }], 'upi').discount, 0)
  assert.equal(priceWithOffers([line('kurkure')], [{ ...offer, pairedProductIds: ['kurkure'] }], 'upi').discount, 0)
  assert.deepEqual(offerList(undefined), [])
})

test('choose the largest total saving without stacking; handle paise and later price reductions safely', () => {
  const items = [line('kurkure', 2), line('chocopie'), line('bon')]
  const competing = { ...offer, id: 'other', discount: 8, pairedProductIds: ['bon'] }
  assert.equal(priceWithOffers(items, [competing, offer], 'upi').discount, 10)
  const decimal = priceWithOffers([line('kurkure', 2, 10.1), line('bon', 2, 10.2)], [{ ...offer, discount: 0.3 }], 'upi')
  assert.equal(decimal.total, 40); assert.equal(decimal.discount, 0.6)
  assert.equal(priceWithOffers([line('kurkure', 1, 2), line('bon', 1, 3)], [offer], 'upi').discount, 0)
})

test('admin can create, edit, pause and remove offers, preserving unrelated offers and trusted product names', async () => {
  const db = database(products(), { retry: true })
  await mutateOffer(db, 'saveOffer', { offer: { ...offer, baseProductName: 'forged' } })
  assert.equal(db.data.get('settings/offers').offers[0].baseProductName, 'kurkure')
  await mutateOffer(db, 'saveOffer', { offer: { ...offer, id: 'another' } })
  await mutateOffer(db, 'saveOffer', { offer: { ...offer, discount: 6, active: false } })
  assert.equal(db.data.get('settings/offers').offers.length, 2)
  assert.equal(db.data.get('settings/offers').offers.find(item => item.id === offer.id).discount, 6)
  assert.equal(db.data.get('settings/offers').offers.find(item => item.id === offer.id).active, false)
  await mutateOffer(db, 'deleteOffer', { offerId: offer.id })
  assert.deepEqual(db.data.get('settings/offers').offers.map(item => item.id), ['another'])
})

test('validate offer input and prevent discounts that make a pair free; allow pausing after products are removed', async () => {
  for (const patch of [{ discount: 0 }, { discount: 40 }, { discount: 1.001 }, { paymentMethod: 'cash' }, { baseProductId: '../bad' }, { pairedProductIds: ['kurkure'] }, { pairedProductIds: ['bon', 'bon'] }, { pairedProductIds: [] }, { name: '' }, { active: 'true' }]) {
    const db = database(products())
    await assert.rejects(mutateOffer(db, 'saveOffer', { offer: { ...offer, ...patch } }))
    assert.equal(db.data.has('settings/offers'), false)
  }
  const db = database(state())
  db.data.delete('products/kurkure')
  await assert.rejects(mutateOffer(db, 'saveOffer', { offer }), /no longer available/)
  await mutateOffer(db, 'saveOffer', { offer: { ...offer, active: false } })
  assert.equal(db.data.get('settings/offers').offers[0].active, false)
})

test('UPI checkout calculates trusted prices and pair discounts; retries preserve the original quote and reserve stock once', async () => {
  const db = database(state(), { retry: true })
  const body = { firestoreOrderId: 'upi-order', items: [{ ...line('kurkure', 2), price: 1 }, line('bon', 2)], total: 1, discount: 999 }
  const first = await reserveUpiOrder(db, user, body)
  assert.equal(first.subtotal, 80); assert.equal(first.discount, 10); assert.equal(first.total, 70)
  assert.equal(first.items[0].price, 20); assert.equal(first.pricingVersion, 1)
  db.data.set('settings/offers', { offers: [] })
  const retried = await reserveUpiOrder(db, user, body)
  assert.deepEqual(retried, first)
  assert.equal(db.data.get('products/kurkure').reserved, 2)
  assert.equal(db.data.get('products/bon').reserved, 2)
})

test('cash creation stays full-price even when the client supplies discount fields', async () => {
  const db = database(state(), { retry: true })
  const result = await mutateOrder(db, user, 'create', { orderId: 'cash-order', items: [line('kurkure'), line('bon')], discount: 5, total: 35, appliedOffers: [offer] })
  assert.equal(result.total, 40)
  assert.equal(db.data.get('orders/cash-order').discount, undefined)
})

test('discounted receipts feed monthly profits and remain accurate after deleting paid order history', async () => {
  const db = database(state(), { retry: true })
  await reserveUpiOrder(db, user, { firestoreOrderId: 'paid-order', items: [line('kurkure'), line('chocopie')] })
  const paidAt = Timestamp.fromDate(new Date('2026-11-02T12:00:00+05:30'))
  await runReportedTransaction(db, async tx => {
    const ref = db.collection('orders').doc('paid-order')
    await tx.getWithReport(ref)
    tx.update(ref, { status: 'paid', paidAt, accepted: true })
    tx.set(db.collection('ledger').doc('stock'), { type: 'procurement', amount: 10, transactionDate: '2026-11-02' })
  })
  const report = () => reportTotals(db.data.get('ledger/__report_2026-11'))
  assert.deepEqual(report(), { revenue: 35, profit: 25 })
  assert.equal((await deletePaidOrdersPage(db)).deleted, 1)
  assert.deepEqual(report(), { revenue: 35, profit: 25 })
})

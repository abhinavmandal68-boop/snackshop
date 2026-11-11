import test from 'node:test'
import assert from 'node:assert/strict'
import { reserveUpiOrder } from '../server/checkoutOrder.mjs'
import { mutateOrder } from '../api/shop.mjs'
import { database } from './helpers/firestore.mjs'

const user = { uid: 'customer' }
const inventory = {
  'products/balaji': { name: 'BALAJI Masala Masti', price: 20, stock: 10 },
  'products/other': { name: 'Kurkure', price: 25, stock: 10 },
}

test('UPI discounts each complete pair, using only catalog prices and product names', async () => {
  for (const [qty, discount] of [[1, 0], [2, 5], [3, 5], [4, 10], [5, 10], [6, 15]]) {
    const db = database(inventory)
    const order = await reserveUpiOrder(db, user, {
      firestoreOrderId: 'new-order',
      pricingVersion: 1,
      balajiDiscount: 99,
      total: 1,
      items: [
        { productId: 'balaji', qty, name: 'Kurkure', price: 1 },
        { productId: 'other', qty: 2, name: 'Balaji', price: 1 },
      ],
    })

    assert.equal(order.total, qty * 20 + 50 - discount)
    assert.equal(order.balajiDiscount ?? 0, discount)
    assert.equal(db.data.get('products/balaji').reserved, qty)
  }
})

test('retrying a draft keeps its quoted amount and reserves stock once', async () => {
  const db = database(inventory, { retry: true })
  const request = { firestoreOrderId: 'retry-order', items: [{ productId: 'balaji', qty: 2 }] }
  const original = await reserveUpiOrder(db, user, request)
  assert.equal(original.total, 35)

  db.data.set('products/balaji', { ...db.data.get('products/balaji'), price: 100 })
  const retry = await reserveUpiOrder(db, user, request)
  assert.equal(retry.total, 35)
  assert.equal(retry.balajiDiscount, 5)
  assert.equal(db.data.get('products/balaji').reserved, 2)
})

test('cash orders keep the full catalog total even when the cart qualifies for the online offer', async () => {
  const db = database(inventory)
  const order = await mutateOrder(db, user, 'create', {
    orderId: 'cash-order',
    balajiDiscount: 5,
    total: 35,
    items: [{ productId: 'balaji', qty: 2, price: 1 }],
  })

  assert.equal(order.total, 40)
  assert.equal(db.data.get('orders/cash-order').balajiDiscount, undefined)
})

test('a discount leaves enough for the Razorpay minimum', async () => {
  const db = database({ 'products/balaji': { name: 'Balaji', price: 2.5, stock: 10 } })
  const order = await reserveUpiOrder(db, user, {
    firestoreOrderId: 'low-price',
    items: [{ productId: 'balaji', qty: 2 }],
  })
  assert.equal(order.total, 1)
  assert.equal(order.balajiDiscount, 4)
})

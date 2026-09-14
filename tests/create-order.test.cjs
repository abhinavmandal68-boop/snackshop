// Validate payment startup with mocked services; never create real payment orders.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const { transformSync } = require('esbuild')

const source = transformSync(fs.readFileSync('api/razorpay/create-order.mjs', 'utf8'), {
  format: 'cjs',
}).code

async function start({ items, products, owner = 'customer', status = 'draft', authFails = false, readFails = false } = {}) {
  const calls = { batches: 0, paymentOrders: [], saves: [] }
  const order = {
    userId: owner, paymentMethod: 'upi', status, total: 1,
    items: items || [{ productId: 'chips', qty: 2 }, { productId: 'juice', qty: 1 }],
  }
  const prices = products || { chips: { price: 20 }, juice: { price: 15.5 } }
  const db = {
    collection(kind) {
      return { doc(id) {
        if (kind === 'products') return { id }
        return {
          get: async () => ({ exists: true, data: () => order }),
          update: async data => { calls.saves.push(data) },
        }
      } }
    },
    async getAll(...args) {
      calls.batches++
      const options = args.pop()
      assert.equal(JSON.stringify(options), JSON.stringify({ fieldMask: ['price'] }))
      assert.deepEqual(args.map(ref => ref.id), order.items.map(item => item.productId))
      if (readFails) throw new Error('Database unavailable')
      return args.map(ref => ({ exists: !!prices[ref.id], data: () => prices[ref.id] }))
    },
  }
  const services = {
    razorpay: function () {
      this.orders = { create: async data => {
        calls.paymentOrders.push(data)
        return { id: 'rzp-order' }
      } }
    },
    'firebase-admin/app': { getApps: () => [{}] },
    'firebase-admin/auth': { getAuth: () => ({ verifyIdToken: async () => {
      if (authFails) throw Object.assign(new Error('Expired'), { code: 'auth/id-token-expired' })
      return { uid: 'customer' }
    } }) },
    'firebase-admin/firestore': { getFirestore: () => db },
  }
  const context = {
    module: { exports: {} }, performance,
    console: { error() {} },
    process: { env: { RAZORPAY_KEY_ID: 'test-key', RAZORPAY_KEY_SECRET: 'test-secret' } },
    require: name => { assert.ok(name in services, name); return services[name] },
  }
  vm.runInNewContext(source, context)
  const res = {
    headers: {},
    setHeader(name, value) { this.headers[name] = value },
    status(code) { this.code = code; return this },
    json(body) { this.body = body; return this },
  }
  await context.module.exports.default({
    method: 'POST', headers: { authorization: 'Bearer test-token' },
    body: { firestoreOrderId: 'shop-order' },
  }, res)
  return { calls, res }
}

test('batches prices and charges the server total before returning a persisted payment order', async () => {
  const { calls, res } = await start()
  assert.equal(res.code, 200)
  assert.equal(calls.batches, 1)
  assert.equal(calls.paymentOrders.length, 1)
  assert.equal(calls.paymentOrders[0].amount, 5550)
  assert.equal(calls.saves[0].razorpayOrderId, res.body.razorpayOrderId)
  assert.equal(res.body.amount, 5550)
  for (const stage of ['auth', 'order_read', 'products_read', 'razorpay_order', 'order_save']) {
    assert.match(res.headers['Server-Timing'], new RegExp(`${stage};dur=\\d+\\.\\d`))
  }
})

test('rejects unauthorized and non-draft orders before reading prices or creating payment orders', async () => {
  for (const options of [{ authFails: true }, { owner: 'someone-else' }, { status: 'paid' }]) {
    const { calls, res } = await start(options)
    assert.ok([400, 401, 403].includes(res.code))
    assert.equal(calls.batches, 0)
    assert.equal(calls.paymentOrders.length, 0)
  }
})

test('invalid quantities, missing products, bad prices and excessive totals cannot start payment', async () => {
  for (const options of [
    { items: [{ productId: 'chips', qty: 0 }] },
    { items: [] },
    { products: { chips: { price: 20 } } },
    { products: { chips: { price: -1 }, juice: { price: 15 } } },
    { products: { chips: { price: 30000 }, juice: { price: 15 } } },
  ]) {
    const { calls, res } = await start(options)
    assert.equal(res.code, 400)
    assert.equal(calls.paymentOrders.length, 0)
    assert.equal(calls.saves.length, 0)
  }
})

test('a batch read failure records its timing and does not start payment', async () => {
  const { calls, res } = await start({ readFails: true })
  assert.equal(res.code, 500)
  assert.equal(calls.paymentOrders.length, 0)
  assert.match(res.headers['Server-Timing'], /products_read;dur=/)
})

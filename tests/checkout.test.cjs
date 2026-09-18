// Exercise checkout callbacks with deferred services; no live payments or database writes.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const { transformSync } = require('esbuild')

const source = transformSync(fs.readFileSync('src/components/CartDrawer.jsx', 'utf8'), {
  loader: 'jsx', format: 'cjs',
}).code

function deferred() {
  let resolve
  const promise = new Promise(r => { resolve = r })
  return { promise, resolve }
}

function setup({ creationFails = false, startFails = false } = {}) {
  const hooks = []
  let cursor = 0
  let options
  let failureHandler
  let creates = 0
  let releases = 0
  let clears = 0
  let closes = 0
  let verifyCalls = 0
  let verification = deferred()
  const creation = deferred()
  const react = {
    useState(initial) {
      const index = cursor++
      if (!(index in hooks)) hooks[index] = initial
      return [hooks[index], value => { hooks[index] = value }]
    },
    useRef(initial) {
      const index = cursor++
      if (!(index in hooks)) hooks[index] = { current: initial }
      return hooks[index]
    },
    useEffect() {},
    createElement(type, props, ...children) { return { type, props: props || {}, children } },
  }
  const services = {
    react,
    'framer-motion': { motion: { div: 'div', aside: 'aside', button: 'button' }, AnimatePresence: 'AnimatePresence' },
    '../lib/motion': { drawerTransition: {}, reveal: {} },
    'lucide-react': {},
    'react-hot-toast': Object.assign(() => {}, { error() {} }),
    'firebase/firestore': {
      collection: () => ({}), doc: (_db, kind) => ({ id: 'test-order', kind }), serverTimestamp: () => 0,
      async runTransaction(_db, callback) {
        await callback({
          async get(ref) {
            if (ref.kind === 'products') {
              creates++
              await creation.promise
              if (creationFails) throw new Error('Sold out')
            }
            return { exists: () => true, data: () => ({ stock: 10, reserved: 0, status: 'draft', items: [] }) }
          },
          set() {},
          update(_ref, data) { if (data.status === 'cancelled') releases++ },
        })
      },
    },
    '../lib/firebase': { db: {} },
    '../lib/CartContext': { useCart: () => ({ items: { snack: 1 }, clearCart: () => { clears++ } }) },
    '../lib/AuthContext': { useAuth: () => ({ user: { uid: 'test-user', email: 'test@example.com', getIdToken: async () => 'test-token' } }) },
    './CheckoutStatus': { default: 'CheckoutStatus', __esModule: true },
  }
  const context = {
    module: { exports: {} }, React: react, console: { error() {} },
    require: name => { assert.ok(name in services, name); return services[name] },
    localStorage: { setItem() {}, removeItem() {} },
    window: { Razorpay: function(config) {
      options = config
      this.on = (_event, callback) => { failureHandler = callback }
      this.open = () => {}
    } },
    fetch: async url => {
      if (url.includes('create-order')) return { ok: !startFails, json: async () => ({ error: 'Could not start payment' }) }
      verifyCalls++
      return verification.promise
    },
  }
  vm.runInNewContext(source, context)
  const render = () => {
    cursor = 0
    return context.module.exports.default({ products: [{ id: 'snack', name: 'Snack', price: 10 }], open: true, onClose: () => { closes++ } })
  }
  function find(node, predicate) {
    if (!node || typeof node !== 'object') return
    if (predicate(node)) return node
    for (const child of (Array.isArray(node) ? node : node.children || [])) {
      const match = find(child, predicate)
      if (match) return match
    }
  }
  const button = text => find(render(), node => node.type === 'button' && node.children.flat(Infinity).includes(text))
  const close = () => find(render(), node => node.props?.['aria-label'] === 'Close checkout').props.onClick()
  button('Proceed to pay').props.onClick()
  // Payment button contains nested text.
  const upi = find(render(), node => node.type === 'button' && find(node, child => child.children?.includes('Pay by UPI')))
  return {
    start: () => upi.props.onClick(), close, creation,
    step: () => hooks[0],
    counts: () => ({ creates, releases, clears, closes, verifyCalls }),
    paid: () => options.handler({ razorpay_payment_id: 'payment-1', razorpay_order_id: 'rzp-order-1', razorpay_signature: 'test-signature' }),
    dismiss: () => options.modal.ondismiss(),
    fail: () => failureHandler({ error: { description: 'Declined' } }),
    resolveVerification: success => verification.resolve({ ok: success, json: async () => ({ success }) }),
    retry: () => {
      verification = deferred()
      return find(render(), node => node.type === 'CheckoutStatus').props.onRetry()
    },
  }
}

test('shows loading immediately, prevents duplicates, and waits for verification before success', async () => {
  const flow = setup()
  const start = flow.start()
  assert.equal(flow.step(), 'payment')
  await flow.start()
  flow.close()
  assert.equal(flow.counts().creates, 1)
  assert.equal(flow.counts().closes, 0)
  flow.creation.resolve()
  await start
  const paid = flow.paid()
  assert.equal(flow.step(), 'confirming')
  assert.equal(flow.counts().clears, 0)
  await flow.dismiss()
  await flow.fail()
  flow.close()
  assert.equal(flow.counts().releases, 0)
  assert.equal(flow.counts().closes, 0)
  flow.resolveVerification(true)
  await paid
  assert.equal(flow.step(), 'done')
  assert.equal(flow.counts().clears, 1)
})

test('verification failure offers a retry of the same payment without cancelling or charging again', async () => {
  const flow = setup()
  flow.creation.resolve()
  await flow.start()
  const paid = flow.paid()
  flow.resolveVerification(false)
  await paid
  assert.equal(flow.step(), 'verification_error')
  await flow.dismiss()
  assert.equal(flow.counts().releases, 0)
  const retry = flow.retry()
  assert.equal(flow.step(), 'confirming')
  flow.resolveVerification(true)
  await retry
  assert.equal(flow.step(), 'done')
  assert.equal(flow.counts().creates, 1)
  assert.equal(flow.counts().verifyCalls, 2)
})

test('a declined attempt can retry inside Razorpay; dismissal releases the order', async () => {
  const flow = setup()
  flow.creation.resolve()
  await flow.start()
  await flow.fail()
  assert.equal(flow.step(), 'payment')
  assert.equal(flow.counts().releases, 0)
  await flow.dismiss()
  assert.equal(flow.step(), 'cart')
  assert.equal(flow.counts().releases, 1)
})

test('reservation failure returns to payment choice and unlocks checkout', async () => {
  const flow = setup({ creationFails: true })
  flow.creation.resolve()
  await flow.start()
  assert.equal(flow.step(), 'method')
  flow.close()
  assert.equal(flow.step(), 'cart')
})

test('payment startup failure releases the order and returns to cart', async () => {
  const flow = setup({ startFails: true })
  flow.creation.resolve()
  await flow.start()
  assert.equal(flow.step(), 'cart')
  assert.equal(flow.counts().releases, 1)
})


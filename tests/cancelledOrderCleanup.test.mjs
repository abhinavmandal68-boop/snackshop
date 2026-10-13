import test from 'node:test'
import assert from 'node:assert/strict'
import { Timestamp } from 'firebase-admin/firestore'
import { cancellationCutoff, isExpiredCancellation, cleanupCancelledOrders } from '../server/cancelledOrderCleanup.mjs'
import { createCleanupHandler } from '../api/cron/cleanup-cancelled-orders.mjs'
import { mutateOrder } from '../api/shop.mjs'
import { orderContribution } from '../src/lib/monthlyReports.mjs'

const at = value => Timestamp.fromDate(new Date(value))
const midnight = new Date('2026-10-15T00:00:00+05:30')
const createdAt = at('2026-10-01T12:00:00+05:30')

// In-memory transaction fixture: apply SDK increments/server timestamps only
// at commit, and support a query-to-transaction race without touching live data.
function database(initial, { beforeTransaction, retry = false } = {}) {
  const data = new Map(Object.entries(initial)), times = new Map()
  let hook = beforeTransaction
  const ref = (collection, id) => ({ id, path: `${collection}/${id}`, parent: { id: collection } })
  const snapshot = reference => ({ ref: reference, id: reference.id, exists: data.has(reference.path),
    data: () => data.get(reference.path), updateTime: times.get(reference.path) || createdAt })
  function merge(previous, patch) {
    const next = { ...previous }
    for (const [key, value] of Object.entries(patch)) {
      if (value?.constructor.name === 'NumericIncrementTransform') next[key] = (next[key] || 0) + value.operand
      else if (value?.constructor.name === 'ServerTimestampTransform') next[key] = at('2026-10-14T20:00:00+05:30')
      else if (value && value.constructor === Object) next[key] = merge(next[key] || {}, value)
      else next[key] = value
    }
    return next
  }
  const db = {
    data, times,
    collection(name) {
      let status, limit = Infinity, cursor = ''
      const query = {
        doc: id => ref(name, id),
        where(field, operator, value) { assert.equal(field, 'status'); assert.equal(operator, '=='); status = value; return query },
        orderBy() { return query },
        limit(count) { limit = count; return query },
        startAfter(id) { cursor = id; return query },
        async get() {
          const docs = [...data.entries()].filter(([path, item]) => path.startsWith(`${name}/`) && item.status === status && path.split('/')[1] > cursor)
            .sort(([a], [b]) => a.localeCompare(b)).slice(0, limit).map(([path]) => snapshot(ref(name, path.split('/')[1])))
          return { docs, size: docs.length, empty: !docs.length }
        },
      }
      return query
    },
    async runTransaction(operation) {
      hook?.(db); hook = null
      async function attempt(commit) {
        const writes = []
        const tx = {
          get: async reference => snapshot(reference),
          getAll: async (...references) => references.map(snapshot),
          set: (reference, patch, options) => writes.push(['set', reference, patch, options]),
          update: (reference, patch) => writes.push(['update', reference, patch]),
          delete: reference => writes.push(['delete', reference]),
        }
        const result = await operation(tx)
        if (commit) for (const [method, reference, patch, options] of writes) {
          if (method === 'delete') data.delete(reference.path)
          else data.set(reference.path, merge(method === 'update' || options?.merge ? data.get(reference.path) || {} : {}, patch))
        }
        return result
      }
      if (retry) await attempt(false)
      return attempt(true)
    },
  }
  return db
}

function cancelled(by = 'customer', when = '2026-10-14T23:59:59+05:30') {
  return { status: 'cancelled', cancelledBy: by, cancelledAt: at(when), createdAt, paymentMethod: 'cash', total: 20 }
}

test('IST midnight changes the cutoff exactly, including year rollover', () => {
  assert.equal(cancellationCutoff(new Date('2026-10-14T23:59:59+05:30')), Date.parse('2026-10-14T00:00:00+05:30'))
  assert.equal(cancellationCutoff(midnight), midnight.getTime())
  assert.equal(cancellationCutoff(new Date('2027-01-01T00:00:00+05:30')), Date.parse('2026-12-31T18:30:00Z'))
  assert.throws(() => cancellationCutoff(new Date('invalid')))
})

test('use cancellation day, not creation day; legacy orders use their last server write', () => {
  const cutoff = midnight.getTime()
  const snap = (order, updateTime = createdAt) => ({ exists: true, data: () => order, updateTime })
  assert.equal(isExpiredCancellation(snap(cancelled()), cutoff), true)
  assert.equal(isExpiredCancellation(snap(cancelled('admin', '2026-10-15T00:00:00+05:30')), cutoff), false)
  assert.equal(isExpiredCancellation(snap({ ...cancelled(), cancelledAt: undefined }, at('2026-10-15T00:10:00+05:30')), cutoff), false)
  assert.equal(isExpiredCancellation(snap({ ...cancelled(), cancelledAt: undefined }), cutoff), true)
  assert.equal(isExpiredCancellation(snap({ ...cancelled(), status: 'paid' }), cutoff), false)
  assert.equal(isExpiredCancellation(snap({ ...cancelled(), cancelledAt: 'invalid' }), cutoff), false)
  assert.equal(isExpiredCancellation({ exists: false }, cutoff), false)
})

test('paginate both cancellation sources, retain other orders, and preserve report totals on retries', async () => {
  const initial = { 'ledger/__report_2026-10': { orderCount: 5, historyCount: 5, revenueCents: 20000, procurementCents: 10000 },
    'products/snack': { stock: 9, reserved: 2 },
    'orders/a': cancelled(), 'orders/b': cancelled('admin'), 'orders/c': cancelled(),
    'orders/d': cancelled('customer', '2026-10-15T00:01:00+05:30'),
    'orders/e': { ...cancelled(), status: 'paid' },
    'orders/f': { ...cancelled(), status: 'loaned' }, 'orders/g': { ...cancelled(), status: 'pending' },
  }
  for (const id of ['a', 'b', 'c']) initial[`orderReports/${id}`] = { contribution: orderContribution(initial[`orders/${id}`]) }
  const db = database(initial, { retry: true })
  assert.deepEqual(await cleanupCancelledOrders(db, { now: midnight, pageSize: 2 }), { deleted: 3, skipped: 1 })
  for (const id of ['a', 'b', 'c']) assert.equal(db.data.has(`orders/${id}`), false)
  for (const id of ['d', 'e', 'f', 'g']) assert.equal(db.data.has(`orders/${id}`), true)
  assert.deepEqual(db.data.get('products/snack'), { stock: 9, reserved: 2 })
  const report = db.data.get('ledger/__report_2026-10')
  assert.equal(report.orderCount, 5)
  assert.equal(report.historyCount, 2)
  assert.equal(report.revenueCents, 20000)
  assert.equal(report.procurementCents, 10000)
  assert.equal(db.data.get('orderReports/a').contribution['2026-10'].historyCount, 0)
  assert.deepEqual(await cleanupCancelledOrders(db, { now: midnight, pageSize: 2 }), { deleted: 0, skipped: 1 })
  assert.equal(db.data.get('ledger/__report_2026-10').historyCount, 2)
})

test('a payment or recancellation between query and transaction is retained', async () => {
  const db = database({ 'orders/a': cancelled(), 'orders/b': cancelled() }, {
    beforeTransaction(current) {
      current.data.set('orders/a', { ...cancelled(), status: 'paid' })
      current.data.set('orders/b', cancelled('admin', '2026-10-15T00:01:00+05:30'))
    },
  })
  assert.deepEqual(await cleanupCancelledOrders(db, { now: midnight }), { deleted: 0, skipped: 2 })
  assert.equal(db.data.size, 2)
})

for (const [action, by] of [['cancel', 'customer'], ['reject', 'admin']]) {
  test(`${by} cancellation stamps server time and releases reservations once`, async () => {
    const order = { status: 'pending', userId: 'customer', createdAt, paymentMethod: 'cash', total: 20, items: [{ productId: 'snack', qty: 2 }] }
    const db = database({ 'orders/a': order, 'products/snack': { stock: 9, reserved: 2 } }, { retry: true })
    await mutateOrder(db, { uid: 'customer' }, action, { orderId: 'a' })
    assert.equal(db.data.get('orders/a').status, 'cancelled')
    assert.equal(db.data.get('orders/a').cancelledBy, by)
    assert.equal(db.data.get('orders/a').cancelledAt.toMillis(), Date.parse('2026-10-14T20:00:00+05:30'))
    assert.deepEqual(db.data.get('products/snack'), { stock: 9, reserved: 0 })
    if (action === 'cancel') {
      assert.deepEqual(await mutateOrder(db, { uid: 'customer' }, action, { orderId: 'a' }), { cancelled: false })
      assert.deepEqual(db.data.get('products/snack'), { stock: 9, reserved: 0 })
    }
  })
}

function response() {
  return { headers: {}, setHeader(name, value) { this.headers[name] = value }, status(code) { this.code = code; return this }, json(body) { this.body = body; return this } }
}

test('cron rejects unauthenticated, disabled, and wrong-method requests before Firestore access', async () => {
  for (const [secret, method, authorization, expected] of [
    ['test-only-secret', 'GET', undefined, 401], ['test-only-secret', 'GET', 'Bearer invalid', 401],
    ['', 'GET', 'Bearer ', 503], ['test-only-secret', 'POST', 'Bearer test-only-secret', 405],
  ]) {
    const handler = createCleanupHandler({ getSecret: () => secret, getDb: () => assert.fail('Unexpected database access') })
    const res = response()
    await handler({ method, headers: { authorization } }, res)
    assert.equal(res.code, expected)
    assert.equal(res.headers['Cache-Control'], 'no-store')
  }
})

test('authorized cron invokes cleanup and reports only counts', async () => {
  const db = {}, handler = createCleanupHandler({ getSecret: () => 'test-only-secret', getDb: () => db,
    cleanup: async value => { assert.equal(value, db); return { deleted: 2, skipped: 1 } },
  })
  const res = response()
  await handler({ method: 'GET', headers: { authorization: 'Bearer test-only-secret' } }, res)
  assert.equal(res.code, 200)
  assert.deepEqual(res.body, { success: true, deleted: 2, skipped: 1 })
})

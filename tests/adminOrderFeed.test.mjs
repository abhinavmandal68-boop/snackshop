import test from 'node:test'
import assert from 'node:assert/strict'
import { createAdminOrderFeed, monthOrdersForView } from '../src/lib/adminOrderFeed.mjs'

const millis = value => value?.toMillis?.() ?? (value instanceof Date ? value.getTime() : NaN)
const snapshot = records => ({ docs: records.map(record => ({ id: record.id, data: () => record })) })
function backend(records = []) {
  const reads = [], listeners = []
  const matches = (record, filters) => filters.every(({ field, op, value }) => {
    if (op === '==') return record[field] === value
    if (op === 'in') return value.includes(record[field])
    if (op === '>=') return millis(record[field]) >= millis(value)
    if (op === '<') return millis(record[field]) < millis(value)
    throw new Error('Unexpected query')
  })
  const api = {
    collection: (_, name) => name,
    query: (name, ...filters) => ({ name, filters }),
    where: (field, op, value) => ({ field, op, value }),
    Timestamp: { fromMillis: value => ({ toMillis: () => value }) },
    onSnapshot: (query, callback) => {
      const listener = { query, callback, closed: false }
      listeners.push(listener)
      callback(snapshot(records.filter(record => matches(record, query.filters))))
      return () => { listener.closed = true }
    },
    getDocs: async query => {
      reads.push(query)
      return snapshot(records.filter(record => matches(record, query.filters)))
    },
  }
  return { api, reads, listeners, notify: () => listeners.filter(listener => !listener.closed).forEach(listener => listener.callback(snapshot(records.filter(record => matches(record, listener.query.filters))))) }
}

test('refresh watches only future orders and payments, with no historical order fetch', () => {
  const since = Date.now()
  const records = [{ id: 'old', createdAt: new Date(since - 3600000), status: 'pending', paymentMethod: 'cash' }]
  const fake = backend(records), notices = []
  let current = [], incoming = new Set()
  const feed = createAdminOrderFeed({ db: {}, since, onChange: (orders, ids) => { current = orders; incoming = ids }, onIncoming: order => notices.push(order.id) }, fake.api)
  const stop = feed.start()
  assert.equal(fake.reads.length, 0)
  assert.deepEqual(current, [])
  assert.deepEqual(fake.listeners.map(listener => listener.query.filters[0].field), ['createdAt', 'paidAt'])
  for (const listener of fake.listeners) assert.equal(millis(listener.query.filters[0].value), since)
  records.push({ id: 'new-cash', createdAt: new Date(since + 1), status: 'pending', paymentMethod: 'cash' })
  records.push({ id: 'old-draft-now-paid', createdAt: new Date(since - 3600000), paidAt: new Date(since + 1), status: 'paid', accepted: false, paymentMethod: 'upi' })
  fake.notify()
  fake.notify()
  assert.deepEqual([...incoming].sort(), ['new-cash', 'old-draft-now-paid'])
  assert.deepEqual(notices, ['new-cash', 'old-draft-now-paid'], 'Each incoming order pops up once')
  assert.ok(!current.some(order => order.id === 'old'))
  assert.equal(fake.reads.length, 0)
  stop()
  assert.ok(fake.listeners.every(listener => listener.closed))
})

test('pending orders and loans read once when requested and cache until explicit refresh', async () => {
  const now = Date.now()
  const records = [
    { id: 'pending', createdAt: new Date(now - 48 * 3600000), status: 'pending', paymentMethod: 'cash' },
    { id: 'upi', createdAt: new Date(now - 48 * 3600000), status: 'paid', paymentMethod: 'upi', accepted: false },
    { id: 'loan', createdAt: new Date(now - 48 * 3600000), status: 'loaned', paymentMethod: 'cash', total: 40 },
  ]
  const fake = backend(records)
  const feed = createAdminOrderFeed({ db: {}, onChange: () => {} }, fake.api)
  feed.start()
  assert.equal(fake.reads.length, 0)
  await Promise.all([feed.load('pending'), feed.load('pending')])
  assert.equal(fake.reads.length, 2)
  assert.equal(feed.records('pending').length, 2)
  await feed.load('pending')
  assert.equal(fake.reads.length, 2)
  await feed.load('loans')
  assert.equal(fake.reads.length, 3)
  await feed.load('loans')
  assert.equal(fake.reads.length, 3)
  feed.patch('loan', { status: 'paid', amountPaid: 40 })
  assert.equal(feed.records('loans')[0].status, 'paid', 'Successful settlement updates cached cards without a read')
  await feed.load('loans', true)
  assert.equal(fake.reads.length, 4)
  assert.equal(records.length, 3, 'Loading and hiding never deletes stored records')
})

test('months load all non-draft statuses only when opened and use Indian month boundaries', async () => {
  const timestamp = new Date('2026-09-30T18:30:00Z')
  const records = ['pending', 'utr_submitted', 'paid', 'partially_paid', 'loaned', 'cancelled', 'draft'].map(status => ({ id: status, status, createdAt: timestamp }))
  records.push({ id: 'september', status: 'paid', createdAt: new Date(timestamp.getTime() - 1) })
  const fake = backend(records)
  const feed = createAdminOrderFeed({ db: {}, onChange: () => {} }, fake.api)
  assert.equal(fake.reads.length, 0)
  await feed.load('month:2026-10')
  assert.equal(fake.reads.length, 1)
  const query = fake.reads[0]
  assert.equal(new Date(millis(query.filters[0].value)).toISOString(), '2026-09-30T18:30:00.000Z')
  assert.equal(new Date(millis(query.filters[1].value)).toISOString(), '2026-10-31T18:30:00.000Z')
  const visible = monthOrdersForView('2026-10', feed.records('month:2026-10'), [{ ...records[0], status: 'paid', accepted: true }])
  assert.equal(visible.length, 6)
  assert.ok(visible.some(order => order.status === 'loaned'))
  assert.ok(visible.some(order => order.status === 'cancelled'))
  assert.ok(!visible.some(order => order.status === 'draft' || order.id === 'september'))
  assert.equal(visible.find(order => order.id === 'pending').status, 'paid')
  await feed.load('month:2026-10')
  assert.equal(fake.reads.length, 1, 'Reopening a month uses the cache')
  await feed.load('month:2026-10', true)
  assert.equal(fake.reads.length, 2)
})

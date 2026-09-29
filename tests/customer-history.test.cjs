const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const { transformSync } = require('esbuild')
const context = { module: { exports: {} } }
vm.runInNewContext(transformSync(fs.readFileSync('src/lib/customerHistory.js', 'utf8'), { format: 'cjs' }).code, context)
const { customerRequestVisible, fulfilledRequestExpiryMillis, withinHistoryWindow } = context.module.exports
const now = Date.parse('2026-09-19T12:00:00Z')
const record = age => ({ createdAt: { toMillis: () => now - age } })

test('customer orders expire at exactly 24 hours, including August history', () => {
  assert.equal(withinHistoryWindow(record(24 * 3600000 - 1), 24, now), true)
  assert.equal(withinHistoryWindow(record(24 * 3600000), 24, now), false)
  assert.equal(withinHistoryWindow({ createdAt: { toMillis: () => Date.parse('2026-08-25T12:00:00Z') } }, 24, now), false)
})
test('open requests remain visible regardless of age', () => {
  for (const status of ['pending', 'in_progress']) {
    assert.equal(customerRequestVisible({ ...record(365 * 24 * 3600000), status }, now), true)
  }
})
test('fulfilled requests expire 24 hours after the customer sees them', () => {
  const unseen = { ...record(365 * 24 * 3600000), status: 'completed' }
  const seen = age => ({ ...unseen, customerSeenAt: { toMillis: () => now - age } })
  assert.equal(customerRequestVisible(unseen, now), true)
  assert.equal(customerRequestVisible(seen(24 * 3600000 - 1), now), true)
  assert.equal(customerRequestVisible(seen(24 * 3600000), now), false)
  assert.equal(fulfilledRequestExpiryMillis(seen(0)), now + 24 * 3600000)
})
test('missing, invalid and future timestamps do not expose old history indefinitely', () => {
  assert.equal(withinHistoryWindow({}, 24, now), false)
  assert.equal(withinHistoryWindow(record(NaN), 24, now), false)
  assert.equal(withinHistoryWindow(record(-1000), 24, now), false)
  assert.equal(withinHistoryWindow({ createdAt: { toDate: () => new Date(now - 1000) } }, 24, now), true)
})

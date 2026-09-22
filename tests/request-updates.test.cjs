const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const { transformSync } = require('esbuild')
const context = { module: { exports: {} } }
vm.runInNewContext(transformSync(fs.readFileSync('src/lib/requestUpdates.js', 'utf8'), { format: 'cjs' }).code, context)
const { requestStatus, requestTransitions, requestUpdateKey, unreadRequestUpdates } = context.module.exports

test('initial history and unrelated changes do not send stale notifications', () => {
  assert.equal(requestTransitions(null, [{ id: 'a', status: 'completed' }]).length, 0)
  assert.equal(requestTransitions(new Map([['a', 'completed']]), [{ id: 'a', status: 'completed', message: 'edited' }]).length, 0)
})
test('progress and stocked transitions notify once and support legacy resolved requests', () => {
  assert.equal(requestStatus({ resolved: true }), 'completed')
  const requests = [{ id: 'a', status: 'in_progress' }, { id: 'b', resolved: true }]
  const updates = requestTransitions(new Map([['a', 'pending'], ['b', 'in_progress']]), requests)
  assert.equal(updates.length, 2)
  assert.equal(updates[0].status, 'in_progress')
  assert.equal(updates[1].status, 'completed')
  assert.equal(requestTransitions(new Map([['a', 'in_progress'], ['b', 'completed']]), requests).length, 0)
})

test('updated requests stay unread until their exact status update is acknowledged', () => {
  const requests = [
    { id: 'pending', status: 'pending' },
    { id: 'sourcing', status: 'in_progress' },
    { id: 'stocked', status: 'completed' },
  ]
  assert.deepEqual(unreadRequestUpdates(requests, []).map(r => r.id), ['sourcing', 'stocked'])
  assert.deepEqual(unreadRequestUpdates(requests, [requestUpdateKey(requests[1])]).map(r => r.id), ['stocked'])
  assert.equal(requestUpdateKey({ id: 'sourcing', status: 'completed' }), 'sourcing:completed')
})

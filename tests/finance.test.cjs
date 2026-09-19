const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const { transformSync } = require('esbuild')

const source = transformSync(fs.readFileSync('src/components/Ledger.jsx', 'utf8'), { loader: 'jsx', format: 'cjs' }).code
const services = {
  react: { useMemo() {}, useState() {}, useEffect() {} },
  'lucide-react': new Proxy({}, { get: () => () => null }),
  'react-hot-toast': { __esModule: true, default: {} },
  'firebase/firestore': {},
  '../lib/firebase': {},
  'framer-motion': { motion: {}, AnimatePresence() {} },
  '../lib/motion': {},
}
const context = { module: { exports: {} }, exports: {}, require: name => services[name] || {} }
vm.runInNewContext(source, context)
const { financeTotals } = context.module.exports

test('finance totals combine paid orders and new transaction entries', () => {
  const totals = financeTotals(
    [
      { type: 'spent', amount: 500 },
      { type: 'earned', amount: 50 },
      { type: 'refund', amount: 20 },
      { type: 'self', amount: 30 },
    ],
    [
      { status: 'paid', total: 400 },
      { status: 'pending', total: 900 },
      { status: 'cancelled', total: 300 },
    ],
  )

  assert.equal(totals.sales, 400)
  assert.equal(totals.income, 450)
  assert.equal(totals.spent, 500)
  assert.equal(totals.refund, 20)
  assert.equal(totals.self, 30)
  assert.equal(totals.profit, -70)
})

test('finance totals preserve spreadsheet-style legacy entries', () => {
  const totals = financeTotals([{ spent: 265, earned: 35, self: 10, refund: 5 }], [])
  assert.deepEqual(
    { spent: totals.spent, earned: totals.earned, self: totals.self, refund: totals.refund, profit: totals.profit },
    { spent: 265, earned: 35, self: 10, refund: 5, profit: -235 },
  )
})

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
const { financeTotals, financeMonthOptions, transactionDateBounds, isTransactionDateAllowed } = context.module.exports

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
  assert.equal(totals.netStockCost, 480)
  assert.equal(totals.profit, -80)
})

test('finance totals preserve spreadsheet-style legacy entries', () => {
  const totals = financeTotals([{ spent: 265, earned: 35, self: 10, refund: 5 }], [])
  assert.deepEqual(
    { spent: totals.spent, earned: totals.earned, self: totals.self, refund: totals.refund, netStockCost: totals.netStockCost, profit: totals.profit },
    { spent: 265, earned: 35, self: 10, refund: 5, netStockCost: 260, profit: -260 },
  )
})

test('cashback improves profit while self use remains independent', () => {
  const totals = financeTotals(
    [
      { type: 'procurement', amount: 500 },
      { type: 'cashback', amount: 25 },
      { type: 'refund', amount: 15 },
      { type: 'self', amount: 90 },
    ],
    [{ status: 'paid', total: 300 }],
  )

  assert.equal(totals.recovered, 40)
  assert.equal(totals.self, 90)
  assert.equal(totals.netStockCost, 460)
  assert.equal(totals.profit, -160)
})

test('transaction dates allow today through the start of the previous calendar year only', () => {
  const now = new Date('2026-09-26T12:00:00+05:30')
  const bounds = transactionDateBounds(now)
  assert.equal(bounds.min, '2025-01-01')
  assert.equal(bounds.max, '2026-09-26')
  assert.equal(isTransactionDateAllowed('2026-09-26', now), true)
  assert.equal(isTransactionDateAllowed('2025-01-01', now), true)
  assert.equal(isTransactionDateAllowed('2024-12-31', now), false)
  assert.equal(isTransactionDateAllowed('2026-09-27', now), false)
})

test('finance month options always include August and retain older data months', () => {
  const now = new Date('2026-09-26T12:00:00+05:30')
  const options = financeMonthOptions(
    [{ transactionDate: '2024-08-10', type: 'spent', amount: 50 }],
    [{ createdAt: '2026-08-12', status: 'paid', total: 90 }],
    now,
  )
  const values = Array.from(options, option => option.value)
  assert.equal(values.includes('2026-08'), true)
  assert.equal(values.includes('2024-08'), true)
})

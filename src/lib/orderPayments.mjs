export const money = value => `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
const cents = value => Math.round(Number(value || 0) * 100)
const activeCashStatuses = ['paid', 'partially_paid', 'loaned']

export function collectedAmount(order) {
  if (!activeCashStatuses.includes(order.status)) return 0
  if (order.paymentMethod === 'cash' && Number.isFinite(order.amountPaid)) {
    return Math.max(0, Math.min(cents(order.total), cents(order.amountPaid))) / 100
  }
  return order.status === 'paid' ? Number(order.total || 0) : 0
}

export function outstandingAmount(order) {
  if (order.paymentMethod !== 'cash' || !['partially_paid', 'loaned'].includes(order.status)) return 0
  return Math.max(0, cents(order.total) - cents(collectedAmount(order))) / 100
}

export function loanSummary(orders) {
  const partial = orders.filter(o => o.status === 'partially_paid')
  const loaned = orders.filter(o => o.status === 'loaned')
  const sum = records => records.reduce((amount, order) => amount + cents(outstandingAmount(order)), 0) / 100
  return { partial: sum(partial), loaned: sum(loaned), total: sum([...partial, ...loaned]), count: orders.filter(o => outstandingAmount(o) > 0).length }
}

// Cash receipts are dated individually so later repayments do not rewrite old revenue.
// Older fully paid orders remain compatible without a migration.
export function revenueReceipts(orders) {
  return orders.flatMap(order => {
    if (!activeCashStatuses.includes(order.status)) return []
    if (order.paymentMethod === 'cash' && Array.isArray(order.cashPayments)) {
      return order.cashPayments.filter(payment => payment.amount > 0).map((payment, index) => ({
        ...order, id: `${order.id}-receipt-${index}`, orderId: order.id,
        status: 'paid', total: payment.amount, amountPaid: payment.amount,
        cashPayments: undefined, paidAt: payment.paidAt, createdAt: payment.paidAt,
      }))
    }
    const amount = collectedAmount(order)
    return amount > 0 ? [{ ...order, total: amount }] : []
  })
}

export function cashPaymentPatch(order, selection, paidAt) {
  const initial = order.status === 'pending'
  if (order.paymentMethod !== 'cash' || (!initial && outstandingAmount(order) <= 0)) {
    throw new Error('This cash order is no longer awaiting payment. Refresh and try again.')
  }
  const total = cents(order.total)
  const previous = cents(collectedAmount(order))
  const remaining = total - previous
  if (!['full', 'partial', 'loan'].includes(selection?.type) || (!initial && selection.type !== 'full')) {
    throw new Error('Choose a cash payment option.')
  }
  const amount = selection.type === 'full' ? remaining : selection.type === 'loan' ? 0 : cents(selection.amount)
  if (selection.type === 'partial' && (!Number.isFinite(Number(selection.amount)) || amount <= 0 || amount >= remaining)) {
    throw new Error(`Enter a partial payment greater than zero and less than ${money(remaining / 100)}.`)
  }
  if (!Number.isFinite(total) || total <= 0) throw new Error('Invalid order total.')
  const amountPaid = previous + amount
  const status = amountPaid === total ? 'paid' : amountPaid > 0 ? 'partially_paid' : 'loaned'
  const cashPayments = [...(order.cashPayments || [])]
  // Preserve any previously collected amount on records lacking receipt history.
  if (!cashPayments.length && previous > 0) cashPayments.push({ amount: previous / 100, paidAt: order.paidAt || order.createdAt })
  if (amount > 0) cashPayments.push({ amount: amount / 100, paidAt })
  return { status, amountPaid: amountPaid / 100, accepted: true, stockDeducted: true, cashPayments,
    ...(status === 'paid' ? { paidAt } : {}) }
}

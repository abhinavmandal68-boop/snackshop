import { outstandingAmount, revenueReceipts } from './orderPayments.mjs'

export const REPORT_TYPE = 'monthly_report'
const cents = value => Math.round(Number(value || 0) * 100)
export function shopDateKey(value) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const date = value?.toDate?.() || (value?._seconds !== undefined ? new Date(value._seconds * 1000) : new Date(value))
  if (!Number.isFinite(date.getTime())) return ''
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date)
  const part = type => parts.find(p => p.type === type).value
  return `${part('year')}-${part('month')}-${part('day')}`
}
export const monthLabel = month => new Date(`${month}-01T12:00:00+05:30`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' })
export const monthBounds = month => {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Invalid month')
  const [year, number] = month.split('-').map(Number)
  const next = number === 12 ? `${year + 1}-01` : `${year}-${String(number + 1).padStart(2, '0')}`
  return [new Date(`${month}-01T00:00:00+05:30`), new Date(`${next}-01T00:00:00+05:30`)]
}
export const isActiveOrder = order => ['pending', 'utr_submitted'].includes(order.status) || (order.status === 'paid' && order.paymentMethod === 'upi' && !order.accepted)
export const canDeleteHistory = order => order.status === 'cancelled' || (order.status === 'paid' && !isActiveOrder(order))

export function orderContribution(order) {
  if (!order || order.status === 'draft') return {}
  const month = shopDateKey(order.createdAt).slice(0, 7)
  if (!month) throw new Error('Order is missing its creation date')
  const result = { [month]: { orderCount: 1, historyCount: 1, paidCount: order.status === 'paid' ? 1 : 0, owedCents: cents(outstandingAmount(order)), activeCount: isActiveOrder(order) ? 1 : 0 } }
  for (const receipt of revenueReceipts([order])) {
    const day = shopDateKey(receipt.paidAt || receipt.createdAt)
    if (!day) throw new Error('Payment is missing its collection date')
    const key = day.slice(0, 7)
    const target = result[key] ||= {}
    target.revenueCents = (target.revenueCents || 0) + cents(receipt.total)
    target[`dailySalesCents.${day}`] = (target[`dailySalesCents.${day}`] || 0) + cents(receipt.total)
    target[`dailyReceiptCounts.${day}`] = (target[`dailyReceiptCounts.${day}`] || 0) + 1
  }
  return result
}

export function ledgerContribution(entry) {
  if (!entry || entry.type === REPORT_TYPE || entry.type === 'monthly_report_meta') return {}
  const month = shopDateKey(entry.transactionDate || entry.createdAt).slice(0, 7)
  if (!month) throw new Error('Finance entry is missing its date')
  const fields = { procurementCents: 0, refundCents: 0, cashbackCents: 0, earnedCents: 0, selfCents: 0 }
  if (['procurement', 'spent'].includes(entry.type)) fields.procurementCents = cents(entry.amount || entry.spent)
  else if (['refund', 'cashback', 'earned', 'self'].includes(entry.type)) fields[`${entry.type}Cents`] = cents(entry.amount)
  else for (const type of ['procurement', 'refund', 'cashback', 'earned', 'self']) fields[`${type}Cents`] = cents(entry[type] || (type === 'procurement' ? entry.spent : 0))
  return { [month]: fields }
}

export function contributionDelta(before = {}, after = {}) {
  const result = {}
  for (const month of new Set([...Object.keys(before), ...Object.keys(after)])) {
    for (const key of new Set([...Object.keys(before[month] || {}), ...Object.keys(after[month] || {})])) {
      const change = (after[month]?.[key] || 0) - (before[month]?.[key] || 0)
      if (change) (result[month] ||= {})[key] = change
    }
  }
  return result
}
export function archivedContribution(contribution) {
  return Object.fromEntries(Object.entries(contribution).map(([month, fields]) => [month, { ...fields, ...(fields.historyCount !== undefined ? { historyCount: 0 } : {}) }]))
}
export function reportTotals(report) {
  const revenue = Number(report.revenueCents || 0) / 100
  return { revenue, profit: (Number(report.revenueCents || 0) - Number(report.procurementCents || 0) + Number(report.refundCents || 0) + Number(report.cashbackCents || 0)) / 100 }
}
function monthlyCsv(reports) {
  return '\uFEFFMonth,No of orders,Revenue (INR),Profit (INR)\r\n' + [...reports].sort((a, b) => a.month.localeCompare(b.month)).map(report => {
    const { revenue, profit } = reportTotals(report)
    return `${report.month},${Number(report.orderCount || 0)},${revenue.toFixed(2)},${profit.toFixed(2)}`
  }).join('\r\n') + '\r\n'
}
export function downloadMonthlyCsv(reports, name = 'monthly-report') {
  const url = URL.createObjectURL(new Blob([monthlyCsv(reports)], { type: 'text/csv;charset=utf-8;' }))
  const link = document.createElement('a')
  link.href = url; link.download = `snackshop-${name}.csv`
  document.body.appendChild(link); link.click(); link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
export function reportReceipts(reports) {
  return reports.flatMap(report => Object.entries(report.dailySalesCents || {}).filter(([, amount]) => amount > 0).map(([day, amount]) => ({ id: `report-${day}`, status: 'paid', total: amount / 100, createdAt: new Date(`${day}T12:00:00+05:30`), paidAt: new Date(`${day}T12:00:00+05:30`), receiptCount: report.dailyReceiptCounts?.[day] || 1, reportReceipt: true })))
}

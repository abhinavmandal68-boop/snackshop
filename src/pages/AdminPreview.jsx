import { useState } from 'react'
import { AdminView } from './AdminPage'
import { LedgerView } from '../components/Ledger'
import { previewProducts } from './DesignPreview'
import { orderContribution, ledgerContribution, isActiveOrder, shopDateKey, REPORT_TYPE } from '../lib/monthlyReports.mjs'
import { isRecentRazorpayOrder } from '../lib/razorpayHistory.mjs'
import { cashPaymentPatch, collectedAmount, outstandingAmount } from '../lib/orderPayments.mjs'

const timestampFor = date => ({ toDate: () => new Date(`${date}T10:30:00+05:30`) })
const timestamp = timestampFor('2026-09-26')
const sampleOrders = [
  { id: 'sample-recent-razorpay', customerName: 'Sample recent Razorpay customer', status: 'paid', paymentMethod: 'upi', accepted: true, total: 25, paidAt: new Date(Date.now() - 2 * 3600000), createdAt: new Date(Date.now() - 2 * 3600000), items: [{ name: 'Chips', qty: 1 }] },
  { id: 'sample-partial', customerName: 'Sample customer · Partial', status: 'partially_paid', paymentMethod: 'cash', accepted: true, stockDeducted: true, amountPaid: 30, cashPayments: [{ amount: 30, paidAt: timestamp }], total: 80, createdAt: timestamp, items: [{ name: 'Snack combo', qty: 1 }] },
  { id: 'sample-loaned', customerName: 'Sample customer · Loan', status: 'loaned', paymentMethod: 'cash', accepted: true, stockDeducted: true, amountPaid: 0, cashPayments: [], total: 60, createdAt: timestamp, items: [{ name: 'Cold drinks', qty: 2 }] },
  { id: 'sample-paid', customerName: 'Sample customer A', status: 'paid', paymentMethod: 'upi', accepted: false, total: 75, createdAt: timestamp, items: [{ name: 'KitKat', qty: 3 }] },
  { id: 'sample-paid-two', customerName: 'Sample customer D', status: 'paid', paymentMethod: 'cash', accepted: true, total: 145, createdAt: timestamp, items: [{ name: 'Snack combo', qty: 1 }] },
  { id: 'sample-paid-old', customerName: 'Sample customer E', status: 'paid', paymentMethod: 'cash', accepted: true, total: 185, createdAt: timestampFor('2026-09-23'), items: [{ name: 'Cold drinks', qty: 5 }] },
  { id: 'sample-cash', customerName: 'Sample customer B', status: 'pending', paymentMethod: 'cash', total: 40, createdAt: timestamp, items: [{ productId: 'sprite', name: 'Sprite', qty: 1 }] },
  { id: 'sample-verify', customerName: 'Sample customer C', status: 'utr_submitted', paymentMethod: 'upi', total: 30, utr: 'SAMPLE-ONLY', createdAt: timestamp, items: [{ name: 'Oreo Original', qty: 1 }] },
]
const sampleRequests = [
  { id: 'sample-request-a', customerName: 'Sample customer A', message: 'Could we get some spicy banana chips?', status: 'pending', resolved: false, createdAt: timestamp },
  { id: 'sample-request-b', customerName: 'Sample customer B', message: 'More dark chocolate, please.', status: 'in_progress', resolved: false, createdAt: timestamp },
]
const emptyProduct = { name: '', category: 'chips', price: '', stock: '', imageUrl: '' }
const sampleEntries = [
  { id: 'sample-spend', type: 'procurement', amount: 300, note: 'Wholesale chips restock', transactionDate: '2026-09-26', createdAt: timestamp },
  { id: 'sample-refund', type: 'refund', amount: 35, note: 'Damaged carton refund', transactionDate: '2026-09-26', createdAt: timestamp },
  { id: 'sample-cashback', type: 'cashback', amount: 12, note: 'Wholesale payment offer', transactionDate: '2026-09-26', createdAt: timestamp },
  { id: 'sample-self', type: 'self', amount: 20, note: 'Cold drink for myself', transactionDate: '2026-09-26', createdAt: timestamp },
  { id: 'sample-spend-old', type: 'procurement', amount: 120, note: 'Biscuits restock', transactionDate: '2026-09-23', createdAt: timestampFor('2026-09-23') },
]

export default function AdminPreview() {
  const [products, setProducts] = useState(previewProducts)
  const [orders, setOrders] = useState(sampleOrders)
  const [requests, setRequests] = useState(sampleRequests)
  const [tab, setTab] = useState('orders')
  const [shopOpen, setShopOpen] = useState(true)
  const [adding, setAdding] = useState(false)
  const [newProduct, setNewProduct] = useState(emptyProduct)
  const [editingId, setEditingId] = useState(null)
  const [editData, setEditData] = useState({})
  const [entries, setEntries] = useState(sampleEntries)
  const totalRevenue = orders.reduce((sum, o) => sum + collectedAmount(o), 0)
  const needsActionCount = orders.filter(o => o.status === 'pending' || o.status === 'utr_submitted' || (o.status === 'paid' && !o.accepted)).length
  const pendingPayments = orders.filter(o => o.status === 'utr_submitted').length
  const pendingReqs = requests.filter(r => !r.resolved).length
  const group = records => records.length ? { 'September 2026': records } : {}
  const updateOrder = (order, patch) => setOrders(prev => prev.map(o => o.id === order.id ? { ...o, ...patch } : o))
  const reset = () => {
    setProducts(previewProducts); setOrders(sampleOrders); setRequests(sampleRequests); setEntries(sampleEntries)
    setEditingId(null); setAdding(false); setNewProduct(emptyProduct); setShopOpen(true)
  }
  const addProduct = () => {
    if (!newProduct.name.trim() || !(Number(newProduct.price) > 0) || Number(newProduct.stock) < 0) return
    setProducts(prev => [...prev, { ...newProduct, id: `sample-${Date.now()}`, price: Number(newProduct.price), stock: Number(newProduct.stock) }])
    setAdding(false); setNewProduct(emptyProduct)
  }
  const saveEdit = id => {
    setProducts(prev => prev.map(p => p.id === id ? { ...editData, price: Number(editData.price), stock: Number(editData.stock) } : p))
    setEditingId(null)
  }
  const financePreview = <LedgerView entries={entries} orders={orders}
    addEntry={entry => setEntries(prev => [{ ...entry, id: `sample-${Date.now()}`, createdAt: timestamp }, ...prev])}
    deleteEntry={id => setEntries(prev => prev.filter(e => e.id !== id))} />
  const saved = {}
  for (const contribution of [...orders.map(orderContribution), ...entries.map(ledgerContribution)]) {
    for (const [month, fields] of Object.entries(contribution)) {
      const report = saved[month] ||= { month, type: REPORT_TYPE }
      for (const [field, amount] of Object.entries(fields)) {
        if (field.includes('.')) {
          const [map, key] = field.split('.')
          report[map] ||= {}
          report[map][key] = (report[map][key] || 0) + amount
        } else report[field] = (report[field] || 0) + amount
      }
    }
  }
  const reports = Object.values(saved).sort((a, b) => b.month.localeCompare(a.month))
  return <AdminView {...{
    products, orders: orders.filter(order => isActiveOrder(order) || outstandingAmount(order) > 0 || isRecentRazorpayOrder(order)), requests, shopOpen, tab, setTab, reports, historyRevision: orders.length, reportStatus: 'ready', loadHistory: month => Promise.resolve(orders.filter(order => shopDateKey(order.createdAt).startsWith(month))), totalRevenue, pendingPayments, needsActionCount, pendingReqs,
    adding, setAdding, newProduct, setNewProduct, addProduct, editingId, editData, setEditData, saveEdit, setEditingId,
    togglingShop: false, deletingAll: false, deletingAllRequests: false, processing: {},
    toggleShopStatus: () => setShopOpen(open => !open), handleLogout: reset,
    restockProduct: id => setProducts(prev => prev.map(p => p.id === id ? { ...p, stock: p.stock + 10 } : p)),
    deleteProduct: id => setProducts(prev => prev.filter(p => p.id !== id)),
    markAsPaid: (order, selection = { type: 'full' }) => {
      updateOrder(order, order.paymentMethod === 'cash' ? cashPaymentPatch(order, selection, new Date()) : { status: 'paid', paidAt: new Date() })
      if (order.status === 'pending' || order.status === 'utr_submitted') {
        setProducts(prev => prev.map(product => ({ ...product, stock: Math.max(0, product.stock - (order.items || []).filter(item => item.productId === product.id).reduce((qty, item) => qty + item.qty, 0)) })))
      }
      return true
    },
    markAsCancelled: order => updateOrder(order, { status: 'cancelled' }),
    acceptPaidOrder: order => updateOrder(order, { accepted: true }),
    acceptAllPaidOrders: () => setOrders(prev => prev.map(o => o.status === 'paid' ? { ...o, accepted: true } : o)),
    deleteOrder: id => setOrders(prev => prev.filter(o => o.id !== id)),
    deleteAllOrders: () => setOrders(prev => prev.filter(order => isActiveOrder(order) || outstandingAmount(order) > 0)), deleteMonthOrders: history => setOrders(prev => prev.filter(order => !history.some(item => item.id === order.id))), monthGroups: group(orders),
    setRequestStatus: (id, status) => setRequests(prev => prev.map(r => r.id === id ? { ...r, status, resolved: status === 'completed' } : r)),
    deleteRequest: id => setRequests(prev => prev.filter(r => r.id !== id)),
    deleteAllRequests: () => setRequests([]), deleteMonthRequests: () => setRequests([]), requestMonthGroups: group(requests),
  }} preview financePreview={financePreview} />
}

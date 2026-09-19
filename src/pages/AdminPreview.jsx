import { useState } from 'react'
import { AdminView } from './AdminPage'
import { LedgerView } from '../components/Ledger'
import { previewProducts } from './DesignPreview'

const timestamp = { toDate: () => new Date('2026-09-19T10:30:00+05:30') }
const sampleOrders = [
  { id: 'sample-paid', customerName: 'Sample customer A', status: 'paid', paymentMethod: 'upi', accepted: false, total: 75, createdAt: timestamp, items: [{ name: 'KitKat', qty: 3 }] },
  { id: 'sample-cash', customerName: 'Sample customer B', status: 'pending', paymentMethod: 'cash', total: 40, createdAt: timestamp, items: [{ name: 'Sprite', qty: 1 }] },
  { id: 'sample-verify', customerName: 'Sample customer C', status: 'utr_submitted', paymentMethod: 'upi', total: 30, utr: 'SAMPLE-ONLY', createdAt: timestamp, items: [{ name: 'Oreo Original', qty: 1 }] },
]
const sampleRequests = [
  { id: 'sample-request-a', customerName: 'Sample customer A', message: 'Could we get some spicy banana chips?', status: 'pending', resolved: false, createdAt: timestamp },
  { id: 'sample-request-b', customerName: 'Sample customer B', message: 'More dark chocolate, please.', status: 'in_progress', resolved: false, createdAt: timestamp },
]
const emptyProduct = { name: '', category: 'chips', price: '', stock: '', imageUrl: '' }
const sampleEntries = [
  { id: 'sample-spend', type: 'spent', amount: 300, note: 'Wholesale chips restock', transactionDate: '2026-09-19', createdAt: timestamp },
  { id: 'sample-self', type: 'self', amount: 20, note: 'Cold drink for myself', transactionDate: '2026-09-18', createdAt: timestamp },
]

export default function AdminPreview() {
  const [products, setProducts] = useState(previewProducts)
  const [orders, setOrders] = useState(sampleOrders)
  const [requests, setRequests] = useState(sampleRequests)
  const [tab, setTab] = useState('products')
  const [shopOpen, setShopOpen] = useState(true)
  const [adding, setAdding] = useState(false)
  const [newProduct, setNewProduct] = useState(emptyProduct)
  const [editingId, setEditingId] = useState(null)
  const [editData, setEditData] = useState({})
  const [entries, setEntries] = useState(sampleEntries)
  const totalRevenue = orders.filter(o => o.status === 'paid').reduce((sum, o) => sum + o.total, 0)
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
  const financePreview = <><p className="admin-preview-note">Sample finance activity. Changes here are local; production records stay in Firebase.</p><LedgerView entries={entries} orders={orders}
    addEntry={entry => setEntries(prev => [{ ...entry, id: `sample-${Date.now()}`, createdAt: timestamp }, ...prev])}
    deleteEntry={id => setEntries(prev => prev.filter(e => e.id !== id))} /></>
  return <AdminView {...{
    products, orders, requests, shopOpen, tab, setTab, totalRevenue, pendingPayments, needsActionCount, pendingReqs,
    adding, setAdding, newProduct, setNewProduct, addProduct, editingId, editData, setEditData, saveEdit, setEditingId,
    togglingShop: false, deletingAll: false, deletingAllRequests: false, processing: {},
    toggleShopStatus: () => setShopOpen(open => !open), handleLogout: reset,
    restockProduct: id => setProducts(prev => prev.map(p => p.id === id ? { ...p, stock: p.stock + 10 } : p)),
    deleteProduct: id => setProducts(prev => prev.filter(p => p.id !== id)),
    markAsPaid: order => updateOrder(order, { status: 'paid' }),
    markAsCancelled: order => updateOrder(order, { status: 'cancelled' }),
    acceptPaidOrder: order => updateOrder(order, { accepted: true }),
    acceptAllPaidOrders: () => setOrders(prev => prev.map(o => o.status === 'paid' ? { ...o, accepted: true } : o)),
    deleteOrder: id => setOrders(prev => prev.filter(o => o.id !== id)),
    deleteAllOrders: () => setOrders([]), deleteMonthOrders: () => setOrders([]), monthGroups: group(orders),
    setRequestStatus: (id, status) => setRequests(prev => prev.map(r => r.id === id ? { ...r, status, resolved: status === 'completed' } : r)),
    deleteRequest: id => setRequests(prev => prev.filter(r => r.id !== id)),
    deleteAllRequests: () => setRequests([]), deleteMonthRequests: () => setRequests([]), requestMonthGroups: group(requests),
  }} preview financePreview={financePreview} />
}

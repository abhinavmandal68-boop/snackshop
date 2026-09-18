import { useState, useEffect } from 'react'
import { Package, Clock, CheckCircle, XCircle, ChevronDown, ChevronUp, Banknote, QrCode, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { collection, query, where, onSnapshot, orderBy, doc, runTransaction } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuth } from '../lib/AuthContext'
import { motion, AnimatePresence } from 'framer-motion'
import { quickTransition, press } from '../lib/motion'
import { ORDER_HISTORY_HOURS } from '../lib/customerHistory'
import { useHistoryWindow } from '../lib/useHistoryWindow'



// ── Status config — mirrors AdminPage.jsx order statuses ────────
const ORDER_STATUSES = {
  pending:       { label: 'Awaiting confirmation', color: 'var(--warning)', dim: 'var(--warning-dim)', Icon: Clock,       hint: 'Your order is awaiting confirmation.' },
  utr_submitted: { label: 'Awaiting confirmation', color: 'var(--warning)', dim: 'var(--warning-dim)', Icon: Clock,       hint: 'Payment received — verifying now.' },
  paid:          { label: 'Confirmed',             color: 'var(--success)', dim: 'var(--success-dim)', Icon: CheckCircle, hint: 'Order confirmed! See you soon.' },
  cancelled:     { label: 'Cancelled',             color: 'var(--danger)',  dim: 'var(--danger-dim)',  Icon: XCircle,     hint: 'This order was cancelled.' },
}

function StatusBadge({ status }) {
  const cfg = ORDER_STATUSES[status] || ORDER_STATUSES.pending
  const { Icon } = cfg
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '4px 12px', borderRadius: 100, fontSize: 11, fontWeight: 700,
      background: cfg.dim, color: cfg.color, whiteSpace: 'nowrap',
    }}>
      <Icon size={11} />
      {cfg.label}
    </span>
  )
}

function OrderCard({ order }) {
  const cfg = ORDER_STATUSES[order.status] || ORDER_STATUSES.pending
  const MethodIcon = order.paymentMethod === 'cash' ? Banknote : QrCode
  const [cancelling, setCancelling] = useState(false)
  const canCancel = order.status === 'pending' || order.status === 'utr_submitted'

  const handleCancel = async () => {
    if (!confirm('Cancel this order?')) return
    setCancelling(true)
    try {
      await runTransaction(db, async (tx) => {
        const orderRef = doc(db, 'orders', order.id)
        const orderSnap = await tx.get(orderRef)
        if (!orderSnap.exists()) return
        const orderData = orderSnap.data()

        const productRefs = (orderData.items || [])
          .filter(it => it.productId)
          .map(it => doc(db, 'products', it.productId))
        const productSnaps = await Promise.all(productRefs.map(ref => tx.get(ref)))

        productSnaps.forEach((snap, i) => {
          if (!snap.exists()) return
          const data = snap.data()
          const qty = orderData.items[i]?.qty || 0
          tx.update(productRefs[i], { reserved: Math.max(0, (data.reserved || 0) - qty) })
        })

        tx.update(orderRef, { status: 'cancelled', cancelledBy: 'customer' })
      })
      toast.success('Order cancelled')
    } catch (err) {
      toast.error(`Could not cancel: ${err.message}`)
    }
    setCancelling(false)
  }

  return (
    <div style={{
      background: 'var(--surface2)',
      border: `1px solid ${order.status === 'paid' ? 'rgba(46,204,113,0.2)' : order.status === 'cancelled' ? 'rgba(255,92,92,0.2)' : 'var(--border)'}`,
      borderRadius: 10,
      padding: '12px 14px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)', fontSize: 11 }}>
          <MethodIcon size={12} />
          {order.paymentMethod === 'cash' ? 'Cash on pickup' : 'UPI'}
        </div>
        <StatusBadge status={order.status} />
      </div>

      <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6, marginBottom: 6 }}>
        {(order.items || []).map(it => `${it.name} ×${it.qty}`).join(', ')}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: 'var(--text-hint)' }}>
          {order.createdAt?.toDate?.()?.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) || '—'}
        </span>
        <span style={{ fontFamily: 'Syne', fontWeight: 800, color: 'var(--accent)', fontSize: 14 }}>₹{order.total}</span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
        <span style={{ fontSize: 11, color: cfg.color, fontStyle: 'italic' }}>{cfg.hint}</span>
        {canCancel && (
          <motion.button whileTap={press}
            onClick={handleCancel}
            disabled={cancelling}
            style={{
              display: 'flex', alignItems: 'center', gap: 4, background: 'var(--danger-dim)',
              border: 'none', borderRadius: 100, padding: '4px 10px', color: 'var(--danger)',
              fontSize: 11, fontWeight: 600, flexShrink: 0,
            }}
          >
            <X size={11} /> {cancelling ? 'Cancelling…' : 'Cancel order'}
          </motion.button>
        )}
      </div>
    </div>
  )
}

export default function MyOrders() {
  const { user } = useAuth()
  const [orders, setOrders] = useState([])
  const [open, setOpen] = useState(true)
  const [historyError, setHistoryError] = useState('')

  useEffect(() => {
    if (!user?.uid) return
    setOrders([])
    setHistoryError('')
    const q = query(
      collection(db, 'orders'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    )
    const unsub = onSnapshot(q, snap => {
      setOrders(snap.docs.map(d => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) })))
    }, err => { console.error('Orders listener:', err); setHistoryError('Could not load your orders. Please refresh to try again.') })
    return unsub
  }, [user?.uid])

  // Customer-only visibility window; no records are deleted.
  const visibleOrders = useHistoryWindow(orders, ORDER_HISTORY_HOURS)
  const recentOrders = visibleOrders.filter(o => o.status !== 'draft')

  const activeCount = recentOrders.filter(o => o.status !== 'paid' && o.status !== 'cancelled').length

  return (
    <div id="my-orders" style={{ marginTop: 36, scrollMarginTop: 100 }}>
      <motion.button whileTap={press}
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-controls="customer-orders"
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'none', border: 'none', padding: '6px 0', cursor: 'pointer', marginBottom: 8 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Package size={15} color="var(--text-secondary)" />
          <span style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 15 }}>My orders · last 24 hours</span>
          {activeCount > 0 && (
            <span style={{ background: 'var(--accent)', color: 'var(--accent-text)', borderRadius: 100, padding: '1px 8px', fontSize: 11, fontWeight: 700 }}>
              {activeCount} pending
            </span>
          )}
        </div>
        {open ? <ChevronUp size={14} color="var(--text-hint)" /> : <ChevronDown size={14} color="var(--text-hint)" />}
      </motion.button>

      <AnimatePresence initial={false}>{open && (
        <motion.div id="customer-orders" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={quickTransition} style={{ display: 'flex', flexDirection: 'column', gap: 8, overflow: 'hidden' }}>
          {historyError && <p role="alert" className="history-empty">{historyError}</p>}
          {!historyError && recentOrders.length === 0 && <p className="history-empty">No orders in the last 24 hours.</p>}
          {recentOrders.map(o => <OrderCard key={o.id} order={o} />)}
        </motion.div>
      )}</AnimatePresence>
    </div>
  )
}

import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Edit2, Trash2, Check, X, LogOut, Package, MessageSquare, ShoppingBag, ImageIcon, Upload, Link, ChevronDown, ChevronUp, Clock, Loader, CheckCircle, Wallet, Store, DoorClosed, Eye, EyeOff, Search, Download, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'
import {
  collection, onSnapshot, addDoc, updateDoc, deleteDoc,
  doc, orderBy, query, writeBatch, getDoc, setDoc, serverTimestamp, deleteField, where, getDocs, Timestamp
} from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { signOut, onAuthStateChanged } from 'firebase/auth'
import { motion, AnimatePresence } from 'framer-motion'
import { press, quickTransition } from '../lib/motion'
import { db, auth, storage } from '../lib/firebase'
import Ledger from '../components/Ledger'
import { shopApi } from '../lib/shopApi'
import { REPORT_TYPE, isActiveOrder, canDeleteHistory, monthLabel, monthBounds, reportTotals, downloadMonthlyCsv } from '../lib/monthlyReports.mjs'
import { createAdminOrderFeed, monthOrdersForView } from '../lib/adminOrderFeed.mjs'
import { ORDER_HISTORY_HOURS } from '../lib/customerHistory'
import { useHistoryWindow } from '../lib/useHistoryWindow'
import ThemeToggle from '../components/ThemeToggle'
import useThemePreference from '../lib/useThemePreference'
import CashPaymentActions from '../components/CashPaymentActions'
import { cashPaymentPatch, collectedAmount, outstandingAmount, loanSummary, money } from '../lib/orderPayments.mjs'

const CATEGORIES = ['chips', 'biscuits', 'sweets', 'namkeen', 'noodles', 'drinks']

export const REQUEST_STATUSES = {
  pending:     { label: 'Pending',     color: 'var(--warning)',  dim: 'var(--warning-dim)',  icon: Clock },
  in_progress: { label: 'In Progress', color: 'var(--info)',     dim: 'var(--info-dim)',   icon: Loader },
  completed:   { label: 'Completed',   color: 'var(--success)',  dim: 'var(--success-dim)',  icon: CheckCircle },
}

function StatCard({ label, value, color, maskable = false }) {
  const [revealed, setRevealed] = useState(false)
  const hidden = maskable && !revealed

  return (
    <motion.div 
      whileHover={{ y: -3 }}
      transition={{ type: 'spring', stiffness: 300 }}
      style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '16px 20px', position: 'relative' }}
    >
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>{label}</div>
      <div style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 26, color: color || 'var(--accent)', filter: hidden ? 'blur(8px)' : 'none', userSelect: hidden ? 'none' : 'auto', transition: 'filter 0.2s' }}>
        {hidden ? '••••••' : value}
      </div>
      {maskable && (
        <motion.button className="icon-button icon-button--compact" whileTap={press}
          onClick={() => setRevealed(r => !r)}
          aria-label={revealed ? 'Hide revenue' : 'Show revenue'}
          style={{ position: 'absolute', top: 12, right: 12, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: 5, color: 'var(--text-secondary)', display: 'flex', cursor: 'pointer' }}
          title={revealed ? 'Hide revenue' : 'Show revenue'}
        >
          {revealed ? <EyeOff size={13} /> : <Eye size={13} />}
        </motion.button>
      )}
    </motion.div>
  )
}

function NoImagePlaceholder({ small = false }) {
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      <ImageIcon size={small ? 18 : 26} color="var(--text-hint)" aria-label="No product image" />
    </div>
  )
}

function ImageUploader({ currentUrl, onUploaded, productId, preview = false }) {
  const [uploading, setUploading] = useState(false)
  const [mode, setMode] = useState('file')
  const [urlInput, setUrlInput] = useState('')
  const inputRef = useRef()

  const handleFile = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { toast.error('Select an image file'); return }
    if (file.size > 5 * 1024 * 1024) { toast.error('Image must be under 5MB'); return }
    if (preview) {
      onUploaded(URL.createObjectURL(file))
      return
    }
    setUploading(true)
    try {
      const storageRef = ref(storage, `products/${productId || Date.now()}_${file.name}`)
      await uploadBytes(storageRef, file)
      const url = await getDownloadURL(storageRef)
      onUploaded(url)
      toast.success('Image uploaded!')
    } catch {
      const localUrl = URL.createObjectURL(file)
      onUploaded(localUrl)
      toast('Storage not enabled — image set temporarily', { icon: 'i' })
    }
    setUploading(false)
  }

  const handleUrlSave = () => {
    if (!urlInput.trim()) { toast.error('Enter an image URL'); return }
    onUploaded(urlInput.trim())
    setUrlInput('')
    setMode('file')
    toast.success('Image URL saved!')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <input ref={inputRef} type="file" accept="image/*" onChange={handleFile} style={{ display: 'none' }} />
      <motion.div
        whileHover={{ scale: mode === 'file' ? 1.02 : 1 }}
        onClick={() => mode === 'file' && inputRef.current.click()}
        style={{ width: 72, height: 72, borderRadius: 10, border: `2px dashed ${currentUrl ? 'var(--success)' : 'var(--border-hover)'}`, background: 'var(--surface2)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: mode === 'file' ? 'pointer' : 'default', overflow: 'hidden', flexShrink: 0 }}
      >
        {uploading ? (
          <div style={{ fontSize: 10, color: 'var(--text-hint)', textAlign: 'center', padding: 4 }}>Uploading...</div>
        ) : currentUrl ? (
          <img src={currentUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => e.target.style.display = 'none'} />
        ) : (
          <>
            <ImageIcon size={20} color="var(--text-hint)" />
            <div style={{ fontSize: 9, color: 'var(--text-hint)', marginTop: 3 }}>Click to upload</div>
          </>
        )}
      </motion.div>
      <div style={{ display: 'flex', gap: 4 }}>
        <motion.button whileTap={press} onClick={() => inputRef.current.click()} style={{ flex: 1, padding: '4px 6px', background: mode === 'file' ? 'var(--accent-dim)' : 'var(--surface2)', border: `1px solid ${mode === 'file' ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 6, color: mode === 'file' ? 'var(--accent)' : 'var(--text-secondary)', fontSize: 10, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3, cursor: 'pointer' }}>
          <Upload size={9} /> Upload
        </motion.button>
        <motion.button whileTap={press} onClick={() => setMode(m => m === 'url' ? 'file' : 'url')} style={{ flex: 1, padding: '4px 6px', background: mode === 'url' ? 'var(--accent-dim)' : 'var(--surface2)', border: `1px solid ${mode === 'url' ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 6, color: mode === 'url' ? 'var(--accent)' : 'var(--text-secondary)', fontSize: 10, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3, cursor: 'pointer' }}>
          <Link size={9} /> URL
        </motion.button>
      </div>
      {mode === 'url' && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} style={{ display: 'flex', gap: 4, marginTop: 2 }}>
          <input value={urlInput} onChange={e => setUrlInput(e.target.value)} placeholder="Paste image URL..." style={{ fontSize: 11, padding: '5px 8px', flex: 1 }} onKeyDown={e => e.key === 'Enter' && handleUrlSave()} />
          <motion.button whileTap={press} onClick={handleUrlSave} style={{ padding: '5px 8px', background: 'var(--accent)', color: 'var(--accent-text)', borderRadius: 6, fontSize: 11, fontWeight: 700, border: 'none', cursor: 'pointer' }}>OK</motion.button>
        </motion.div>
      )}
    </div>
  )
}

function groupByMonth(orders) {
  const groups = {}
  for (const order of orders) {
    let label = 'Unknown'
    try {
      const date = order.createdAt?.toDate ? order.createdAt.toDate() : new Date(order.createdAt)
      label = date.toLocaleString('en-IN', { month: 'long', year: 'numeric' })
    } catch {}
    if (!groups[label]) groups[label] = []
    groups[label].push(order)
  }
  return groups
}

export function MonthGroup({ label, orders, processing, onMarkPaid, onReject, onAcceptPaid, onDelete, onDeleteAll, summary, onToggle, loading, error, onRetry, reportsReady = true, keepOpen = false }) {
  const [manuallyCollapsed, setCollapsed] = useState(Boolean(summary))
  const collapsed = keepOpen ? false : manuallyCollapsed
  const orderCount = summary ? (summary.orderCount || 0) : orders.length
  const paidTotal = summary ? reportTotals(summary).revenue : orders.reduce((s, o) => s + collectedAmount(o), 0)
  const owedTotal = summary ? Number(summary.owedCents || 0) / 100 : loanSummary(orders).total
  const pendingCount = orders.filter(o => o.status === 'utr_submitted' || o.status === 'pending').length

  return (
    <div style={{ marginBottom: 20 }}>
      <div 
        className="monthly-order-heading"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, padding: '10px 14px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', cursor: keepOpen ? 'default' : 'pointer' }}
        onClick={() => { if (!keepOpen) { onToggle?.(collapsed); setCollapsed(c => !c) } }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {!keepOpen && <motion.div animate={{ rotate: collapsed ? -90 : 0 }} transition={{ duration: 0.2 }}>
            <ChevronDown size={15} color="var(--text-secondary)" />
          </motion.div>}
          <span style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 15 }}>{label}</span>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{orderCount} order{orderCount !== 1 ? 's' : ''}</span>
          {pendingCount > 0 && (
            <span style={{ background: 'var(--warning)', color: 'white', borderRadius: 100, padding: '1px 8px', fontSize: 11, fontWeight: 700 }}>{pendingCount} pending</span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 14, color: 'var(--accent)' }}>{money(paidTotal)} collected</span>
          {owedTotal > 0 && <span className="order-owed-total">{money(owedTotal)} owed</span>}
          {summary && <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{money(reportTotals(summary).profit)} profit</span>}
          {summary && <button className="monthly-report-button" disabled={!reportsReady} onClick={e => { e.stopPropagation(); downloadMonthlyCsv([summary], summary.month) }} title={`Download ${label} CSV`}><Download size={13} /> CSV</button>}
          {summary && !collapsed && <button className="monthly-report-button" disabled={loading} onClick={e => { e.stopPropagation(); onRetry?.() }} aria-label={`Refresh ${label}`}><RefreshCw size={13} /></button>}
          {onDeleteAll && (!summary || !collapsed) && <motion.button
            whileTap={press}
            disabled={loading || (summary && (!reportsReady || !orders.some(canDeleteHistory)))}
            onClick={e => { e.stopPropagation(); onDeleteAll(orders) }}
            style={{ background: 'var(--danger-dim)', border: 'none', borderRadius: 6, padding: '4px 10px', color: 'var(--danger)', fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}
            title={`Delete completed ${label} history; keep active orders and loans`}
          >
            <Trash2 size={11} /> {summary ? 'Delete history' : 'Delete all'}
          </motion.button>}
        </div>
      </div>

      <AnimatePresence>
        {!collapsed && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={quickTransition}
            className="admin-order-list"
            style={{ display: 'flex', flexDirection: 'column', gap: 8, overflow: 'hidden', position: 'relative' }}
          >
            {loading && <p role="status">Loading this month's orders...</p>}
            {error && <p role="alert">{error} <button className="monthly-report-button" onClick={onRetry}>Retry</button></p>}
            {summary && !loading && !error && orders.length === 0 && <p className="monthly-history-note">No orders stored for this month. Saved reports remain available.</p>}
            <AnimatePresence initial={false} mode="popLayout">
            {orders.map(o => {
              const needsAction = o.status === 'utr_submitted' || o.status === 'pending'
              const isNewPaidRazorpayOrder = o.status === 'paid' && o.paymentMethod === 'upi' && !o.accepted
              const isProcessing = processing[o.id]
              const balance = outstandingAmount(o)
              const hasBalance = balance > 0
              const cashAction = o.paymentMethod === 'cash' && (o.status === 'pending' || hasBalance)
              const debtTone = o.status === 'loaned' ? 'danger' : 'warning'
              return (
                <motion.div 
                  key={o.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className={hasBalance ? `order-outstanding order-outstanding-${o.status}` : ''}
                  style={{ background: hasBalance ? `var(--${debtTone}-dim)` : 'var(--surface)', border: `1px solid ${hasBalance ? `var(--${debtTone})` : (needsAction || isNewPaidRazorpayOrder) ? 'rgba(var(--accent-rgb),0.4)' : 'var(--border)'}`, borderRadius: 'var(--radius)', padding: '14px 16px', position: 'relative' }}
                >
                  {(needsAction || isNewPaidRazorpayOrder) && (
                    <div style={{ position: 'absolute', top: -9, left: 14, background: 'var(--accent)', color: 'var(--accent-text)', fontSize: 10, fontWeight: 700, padding: '2px 10px', borderRadius: 100, fontFamily: 'Syne' }}>
                      {isNewPaidRazorpayOrder ? 'READY TO ACCEPT' : 'ACTION REQUIRED'}
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 5 }}>{o.customerName}</div>
                      
                      {/* FIX: Always render the ordered items so the admin can start preparing them! */}
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4, fontStyle: o.status === 'paid' ? 'normal' : 'italic' }}>
                        {(o.items || []).map(item => `${item.name} x${item.qty}`).join(', ')}
                      </div>

                      {o.utr && (
                        <div style={{ fontSize: 11, background: 'var(--surface2)', borderRadius: 6, padding: '3px 8px', display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'monospace', color: 'var(--text-secondary)', marginBottom: 4 }}>
                          UTR: <strong style={{ color: 'var(--accent)' }}>{o.utr}</strong>
                        </div>
                      )}
                      <div style={{ fontSize: 11, color: 'var(--text-hint)' }}>
                        {o.createdAt?.toDate?.()?.toLocaleString('en-IN') || '—'}
                      </div>
                      {o.status === 'paid' && ['cash', 'upi'].includes(o.paymentMethod) && (
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6 }}>
                          {o.paymentMethod === 'cash' ? 'Paid by cash' : 'Paid by RazorPay'}
                        </div>
                      )}
                      {hasBalance && <div className={`order-payment-balance order-payment-balance-${o.status}`}>
                        <strong>{o.status === 'loaned' ? 'Loaned' : 'Paid partially'} · Cash</strong>
                        <span>Received {money(collectedAmount(o))} <b>Outstanding {money(balance)}</b></span>
                      </div>}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                      <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 18 }}>₹{o.total}</div>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 100, background: hasBalance ? `var(--${debtTone}-dim)` : o.status === 'paid' ? 'var(--success-dim)' : o.status === 'cancelled' ? 'var(--danger-dim)' : o.status === 'utr_submitted' ? 'var(--accent-dim)' : 'var(--warning-dim)', color: hasBalance ? `var(--${debtTone})` : o.status === 'paid' ? 'var(--success)' : o.status === 'cancelled' ? 'var(--danger)' : o.status === 'utr_submitted' ? 'var(--accent)' : 'var(--warning)' }}>
                        {o.status === 'partially_paid' ? 'Paid partially' : o.status === 'loaned' ? 'Loaned' : o.status === 'utr_submitted' ? 'UPI · verify' : o.status === 'pending' ? 'Cash · awaiting' : o.status === 'paid' ? o.paymentMethod === 'cash' ? 'Paid in full' : o.accepted ? 'Accepted' : 'Awaiting acceptance' : o.status}
                      </span>
                      {o.status === 'cancelled' && o.cancelledBy && (
                        <span style={{ fontSize: 10, color: 'var(--text-hint)' }}>
                          by {o.cancelledBy === 'customer' ? 'customer' : 'you'}
                        </span>
                      )}
                      {onDelete && <motion.button
                        whileTap={press}
                        onClick={() => onDelete(o.id)}
                        style={{ background: 'var(--danger-dim)', border: 'none', borderRadius: 6, padding: '3px 8px', color: 'var(--danger)', fontSize: 11, display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer' }}
                        title="Delete this order"
                      >
                        <Trash2 size={10} /> Delete
                      </motion.button>}
                    </div>
                  </div>

                  {cashAction ? <div className="cash-order-controls">
                    <CashPaymentActions order={o} processing={isProcessing} onSave={onMarkPaid} />
                    {o.status === 'pending' && <button className="cash-reject" disabled={isProcessing} onClick={() => onReject(o)}>Reject order</button>}
                  </div> : (needsAction || isNewPaidRazorpayOrder) && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                      {isNewPaidRazorpayOrder ? (
                        <motion.button
                          whileTap={press}
                          onClick={() => onAcceptPaid(o)}
                          disabled={isProcessing}
                          style={{ flex: 1, padding: 10, background: isProcessing ? 'var(--surface2)' : 'var(--success)', border: 'none', borderRadius: 8, color: isProcessing ? 'var(--text-secondary)' : 'white', fontFamily: 'Syne', fontWeight: 700, fontSize: 13, cursor: isProcessing ? 'not-allowed' : 'pointer' }}
                        >
                            {isProcessing ? 'Processing...' : 'Accept verified order'}
                        </motion.button>
                      ) : (
                        <>
                          <motion.button
                            whileTap={press}
                            onClick={() => onMarkPaid(o)}
                            disabled={isProcessing}
                            style={{ flex: 1, padding: 10, background: isProcessing ? 'var(--surface2)' : 'var(--success)', border: 'none', borderRadius: 8, color: isProcessing ? 'var(--text-secondary)' : 'white', fontFamily: 'Syne', fontWeight: 700, fontSize: 13, cursor: isProcessing ? 'not-allowed' : 'pointer' }}
                          >
                            {isProcessing
                              ? 'Processing...'
                              : o.status === 'pending'
                                ? 'Accept cash + deduct stock'
                                : 'Verify UPI + deduct stock'}
                          </motion.button>
                          <motion.button
                            whileTap={press}
                            onClick={() => onReject(o)}
                            disabled={isProcessing}
                            style={{ padding: '10px 16px', background: 'var(--danger-dim)', border: 'none', borderRadius: 8, color: 'var(--danger)', fontSize: 13, fontWeight: 600, cursor: isProcessing ? 'not-allowed' : 'pointer' }}
                          >
                            Reject payment
                          </motion.button>
                        </>
                      )}
                    </div>
                  )}
                </motion.div>
              )
            })}

            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function RequestStatusBadge({ status }) {
  const cfg = REQUEST_STATUSES[status] || REQUEST_STATUSES.pending
  const Icon = cfg.icon
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 100, fontSize: 11, fontWeight: 700, background: cfg.dim, color: cfg.color, whiteSpace: 'nowrap' }}>
      <Icon size={10} />
      {cfg.label}
    </span>
  )
}

export function MonthlyHistory({ report, liveOrders, revision, reportsReady, loadHistory, ...actions }) {
  const [orders, setOrders] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const generation = useRef(0)
  const load = async (force = false) => {
    const current = ++generation.current
    setLoading(true); setError('')
    try {
      let loaded
      if (loadHistory) loaded = await loadHistory(report.month, force)
      else {
        const [start, end] = monthBounds(report.month)
        const snapshot = await getDocs(query(collection(db, 'orders'), where('createdAt', '>=', Timestamp.fromDate(start)), where('createdAt', '<', Timestamp.fromDate(end)), orderBy('createdAt', 'desc')))
        loaded = snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
      }
      if (current === generation.current) setOrders(loaded.filter(order => order.status !== 'draft'))
    } catch (err) { if (current === generation.current) setError(`Could not load this month: ${err.message}`) }
    finally { if (current === generation.current) setLoading(false) }
  }
  useEffect(() => () => { generation.current++ }, [])
  const history = monthOrdersForView(report.month, orders || [], liveOrders)
  return <MonthGroup {...actions} summary={report} label={monthLabel(report.month)} orders={history} loading={loading} error={error} reportsReady={reportsReady}
    onRetry={() => load(true)} onToggle={open => { if (open && orders === null && !loading) load() }} />
}

function RequestMonthGroup({ label, requests, onSetStatus, onDelete, onDeleteAll }) {
  const [collapsed, setCollapsed] = useState(false)
  const pendingCount = requests.filter(r => !r.resolved).length

  return (
    <div style={{ marginBottom: 20 }}>
      <div
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, padding: '10px 14px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}
        onClick={() => setCollapsed(c => !c)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <motion.div animate={{ rotate: collapsed ? -90 : 0 }} transition={{ duration: 0.2 }}>
            <ChevronDown size={15} color="var(--text-secondary)" />
          </motion.div>
          <span style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 15 }}>{label}</span>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{requests.length} request{requests.length !== 1 ? 's' : ''}</span>
          {pendingCount > 0 && (
            <span style={{ background: 'var(--warning)', color: 'white', borderRadius: 100, padding: '1px 8px', fontSize: 11, fontWeight: 700 }}>{pendingCount} open</span>
          )}
        </div>
        <motion.button
          whileTap={press}
          onClick={e => { e.stopPropagation(); onDeleteAll(requests) }}
          style={{ background: 'var(--danger-dim)', border: 'none', borderRadius: 6, padding: '4px 10px', color: 'var(--danger)', fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}
          title={`Delete all ${label} requests`}
        >
          <Trash2 size={11} /> Delete all
        </motion.button>
      </div>

      <AnimatePresence>
        {!collapsed && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={quickTransition}
            style={{ display: 'flex', flexDirection: 'column', gap: 8, overflow: 'hidden', position: 'relative' }}
          >
            <AnimatePresence initial={false} mode="popLayout">
            {requests.map(r => {
              const status = r.status || (r.resolved ? 'completed' : 'pending')
              const nextStatus = status === 'pending' ? 'in_progress' : status === 'in_progress' ? 'completed' : null

              return (
                <motion.div
                  key={r.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: status === 'completed' ? 0.6 : 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  style={{
                    background: 'var(--surface)',
                    border: `1px solid ${status === 'pending' ? 'rgba(var(--accent-rgb),0.2)' : status === 'in_progress' ? 'rgba(var(--accent-rgb),0.2)' : 'var(--border)'}`,
                    borderRadius: 'var(--radius)',
                    padding: '14px 16px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 600, fontSize: 14 }}>{r.customerName}</span>
                        <RequestStatusBadge status={status} />
                      </div>
                      <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>{r.message}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-hint)' }}>{r.createdAt?.toDate?.()?.toLocaleString('en-IN') || '—'}</div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                      {nextStatus && (
                        <motion.button
                          whileTap={press}
                          onClick={() => onSetStatus(r.id, nextStatus)}
                          style={{
                            background: REQUEST_STATUSES[nextStatus].dim,
                            border: 'none',
                            borderRadius: 8,
                            padding: '6px 12px',
                            color: REQUEST_STATUSES[nextStatus].color,
                            fontSize: 12,
                            fontWeight: 600,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                            whiteSpace: 'nowrap',
                            cursor: 'pointer'
                          }}
                        >
                          {nextStatus === 'in_progress' ? <><Loader size={11} /> Mark In Progress</> : <><CheckCircle size={11} /> Mark Stocked</>}
                        </motion.button>
                      )}

                      <motion.button
                        whileTap={press}
                        onClick={() => onDelete(r.id)}
                        style={{ background: 'var(--danger-dim)', border: 'none', borderRadius: 8, padding: '5px 10px', color: 'var(--danger)', fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}
                        title="Delete request"
                      >
                        <Trash2 size={11} /> Delete
                      </motion.button>
                    </div>
                  </div>
                </motion.div>
              )
            })}

            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function AdminPage() {
  const navigate = useNavigate()
  const [tab, setTab] = useState('orders')
  const [products, setProducts] = useState([])
  const [productSearch, setProductSearch] = useState('')
  const [productLoadStatus, setProductLoadStatus] = useState('idle')
  const productsLoaded = useRef(false)
  const productRequest = useRef(null)
  const [orders, setOrders] = useState([])
  const [incomingIds, setIncomingIds] = useState(new Set())
  const [orderView, setOrderView] = useState('new')
  const [orderLoadStatus, setOrderLoadStatus] = useState({ pending: 'idle', history: 'idle', loans: 'idle' })
  const orderFeed = useRef(null)
  if (!orderFeed.current) orderFeed.current = createAdminOrderFeed({
    db,
    onChange: (records, ids) => { setOrders(records); setIncomingIds(ids) },
    onIncoming: order => toast(`New order from ${order.customerName}`),
    onError: error => toast.error(`Could not watch new orders: ${error.message}`),
  })
  const [reports, setReports] = useState([])
  const [reportStatus, setReportStatus] = useState('preparing')
  const [reportError, setReportError] = useState('')
  const [reportProgress, setReportProgress] = useState(0)
  const [historyRevision, setHistoryRevision] = useState(0)
  const reportSetupBusy = useRef(false)
  const mounted = useRef(true)
  const [requests, setRequests] = useState([])
  const [editingId, setEditingId] = useState(null)
  const [editData, setEditData] = useState({})
  const [adding, setAdding] = useState(false)
  const [processing, setProcessing] = useState({})
  const deletingAll = false
  const [deletingAllRequests, setDeletingAllRequests] = useState(false)
  const [newProduct, setNewProduct] = useState({ name: '', category: 'chips', price: '', stock: '', imageUrl: '' })
  const [shopOpen, setShopOpen] = useState(true)
  const [togglingShop, setTogglingShop] = useState(false)

  const loadProducts = (force = false) => {
    if (productRequest.current) return productRequest.current
    if (productsLoaded.current && !force) return Promise.resolve()
    setProductLoadStatus('loading')
    productRequest.current = getDocs(collection(db, 'products'))
      .then(snapshot => {
        if (!mounted.current) return
        setProducts(snapshot.docs.map(d => ({ id: d.id, ...d.data() })))
        productsLoaded.current = true
        setProductLoadStatus('ready')
      })
      .catch(err => {
        if (!mounted.current) return
        setProductLoadStatus('error')
        toast.error(`Could not load products: ${err.message}`)
      })
      .finally(() => { productRequest.current = null })
    return productRequest.current
  }

  const invalidateProducts = () => {
    productsLoaded.current = false
    setProductLoadStatus('idle')
  }

  // Read inventory once when Products opens; searches use the cached list.
  useEffect(() => {
    if (tab === 'products') loadProducts()
  }, [tab])

  const loadOrderView = async (view, force = false) => {
    if (view !== 'loans') setOrderView(view)
    if (orderLoadStatus[view] === 'ready' && !force) return
    setOrderLoadStatus(previous => ({ ...previous, [view]: 'loading' }))
    try {
      await orderFeed.current.load(view, force)
      if (mounted.current) setOrderLoadStatus(previous => ({ ...previous, [view]: 'ready' }))
    } catch (error) {
      if (mounted.current) {
        setOrderLoadStatus(previous => ({ ...previous, [view]: 'error' }))
        toast.error(`Could not load ${view}: ${error.message}`)
      }
    }
  }

  const loadHistory = async (month, force = false) => {
    const view = `month:${month}`
    await orderFeed.current.load(view, force)
    return orderFeed.current.records(view)
  }

  const prepareReports = async () => {
    if (reportSetupBusy.current) return
    reportSetupBusy.current = true
    setReportStatus('preparing'); setReportError('')
    try {
      while (mounted.current) {
        const result = await shopApi('initializeReports')
        if (!mounted.current) break
        if (result.ready) {
          const snapshot = await getDocs(query(collection(db, 'ledger'), where('type', '==', REPORT_TYPE)))
          if (!mounted.current) break
          setReports(snapshot.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => b.month.localeCompare(a.month)))
          setReportStatus('ready'); break
        }
        setReportProgress(result.processed || 0)
      }
    } catch (err) { if (mounted.current) { setReportStatus('error'); setReportError(err.message) } }
    finally { reportSetupBusy.current = false }
  }


  useEffect(() => {
    mounted.current = true
    const unsub = onAuthStateChanged(auth, user => { if (!user) navigate('/admin'); else prepareReports() })

    const ordersUnsub = orderFeed.current.start()
    const reportsUnsub = onSnapshot(query(collection(db, 'ledger'), where('type', '==', REPORT_TYPE)), snap => {
      setReports(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => b.month.localeCompare(a.month)))
    }, err => { setReportStatus('error'); setReportError(err.message) })

    const rUnsub = onSnapshot(
      query(collection(db, 'requests'), orderBy('createdAt', 'desc')),
      snap => setRequests(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      err => console.error('Requests error:', err)
    )

    const sUnsub = onSnapshot(doc(db, 'settings', 'shopStatus'), snap => {
      setShopOpen(snap.exists() ? snap.data().open !== false : true)
    }, err => console.error('Shop status error:', err))

    return () => { mounted.current = false; unsub(); ordersUnsub(); reportsUnsub(); rUnsub(); sUnsub() }
  }, [])

  const toggleShopStatus = async () => {
    setTogglingShop(true)
    try {
      await setDoc(doc(db, 'settings', 'shopStatus'), { open: !shopOpen }, { merge: true })
      toast.success(!shopOpen ? 'Shop marked as open' : 'Shop marked as closed')
    } catch (err) {
      toast.error(`Failed: ${err.message}`)
    }
    setTogglingShop(false)
  }

  const totalRevenue = reports.reduce((sum, report) => sum + reportTotals(report).revenue, 0)
  const newOrders = orders.filter(order => incomingIds.has(order.id) && isActiveOrder(order))
  const pendingPayments = newOrders.filter(order => order.status === 'utr_submitted').length
  const needsActionCount = newOrders.length
  const pendingReqs = requests.filter(r => !r.resolved).length
  const monthGroups = groupByMonth(orders)
  const requestMonthGroups = groupByMonth(requests)

  // Live favicon + tab title badge — shows the number of orders needing
  // action, including newly payment-verified Razorpay orders, NOT requests. Updates automatically
  // as needsActionCount changes, and reverts to the plain icon at 0.
  useEffect(() => {
    const baseIcon = (badge) => `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' rx='22' fill='#fc6c26'/><text x='50' y='76' text-anchor='middle' font-size='80' font-weight='900' fill='#fff4d6' font-family='Arial'>S</text>${badge}</svg>`

    const badgeMarkup = needsActionCount > 0 ? `
      <circle cx='78' cy='24' r='${needsActionCount > 9 ? 26 : 22}' fill='#242720' stroke='#fff4d6' stroke-width='4'/>
      <text x='78' y='${needsActionCount > 9 ? '33' : '32'}' text-anchor='middle' font-size='${needsActionCount > 9 ? '30' : '34'}' font-weight='900' fill='#ffffff' font-family='Arial'>${needsActionCount > 99 ? '99+' : needsActionCount}</text>
    ` : ''

    const svg = baseIcon(badgeMarkup)
    const href = `data:image/svg+xml,${encodeURIComponent(svg)}`

    let link = document.querySelector("link[rel='icon']")
    if (!link) {
      link = document.createElement('link')
      link.rel = 'icon'
      document.head.appendChild(link)
    }
    link.href = href

    document.title = needsActionCount > 0
      ? `(${needsActionCount}) SnackShop Admin`
      : 'SnackShop Admin'
    return () => { link.href = '/favicon.svg?v=2'; document.title = 'SnackShop' }
  }, [needsActionCount])

  const handleLogout = async () => {
  await signOut(auth)
  navigate('/')
 }

  const markAsPaid = async (order, selection = { type: 'full' }) => {
    if (processing[order.id]) return false
    setProcessing(p => ({ ...p, [order.id]: true }))
    try {
      await shopApi('pay', { orderId: order.id, selection, expectedStatus: order.status, expectedCollected: collectedAmount(order) })
      orderFeed.current.patch(order.id, order.paymentMethod === 'cash'
        ? cashPaymentPatch(order, selection, new Date())
        : { status: 'paid', accepted: true, paidAt: new Date(), stockDeducted: true })
      invalidateProducts()
      setHistoryRevision(value => value + 1)
      toast.success(`Payment recorded for ${order.customerName}`)
      return true
    } catch (err) {
      toast.error(`Failed: ${err.message}`)
      return false
    } finally {
      setProcessing(p => ({ ...p, [order.id]: false }))
    }
  }

  const acceptPaidOrder = async (order) => {
    if (processing[order.id]) return
    setProcessing(p => ({ ...p, [order.id]: true }))
    try {
      await shopApi('accept', { orderId: order.id })
      orderFeed.current.patch(order.id, { accepted: true })
      invalidateProducts()
      setHistoryRevision(value => value + 1)
      toast.success(`Order accepted for ${order.customerName}`)
    } catch (err) {
      console.error(err)
      toast.error(`Failed: ${err.message}`)
    }
    setProcessing(p => ({ ...p, [order.id]: false }))
  }

  const markAsCancelled = async (order) => {
    if (processing[order.id]) return
    setProcessing(p => ({ ...p, [order.id]: true }))
    try {
      await shopApi('reject', { orderId: order.id })
      orderFeed.current.patch(order.id, { status: 'cancelled', cancelledBy: 'admin' })
      invalidateProducts()
      setHistoryRevision(value => value + 1)
      toast('Order rejected')
    } catch (err) {
      toast.error(`Failed: ${err.message}`)
    }
    setProcessing(p => ({ ...p, [order.id]: false }))
  }

  const deleteOrder = async id => {
    if (reportStatus !== 'ready') { toast.error('Finish monthly report setup before deleting history.'); return }
    if (!confirm('Delete this completed order? Its saved monthly report will be kept.')) return
    try { await shopApi('delete', { orderId: id }); setHistoryRevision(value => value + 1); toast.success('Order history deleted; report kept') }
    catch (err) { toast.error(err.message) }
  }

  const deleteMonthOrders = async monthOrders => {
    if (reportStatus !== 'ready') { toast.error('Finish monthly report setup before deleting history.'); return }
    const history = monthOrders.filter(canDeleteHistory)
    if (!history.length) return
    if (!confirm(`Delete ${history.length} completed orders? Download the CSV first. Monthly reports, active orders and unpaid loans will be kept. This cannot be undone.`)) return
    let deleted = 0
    try {
      for (let offset = 0; offset < history.length; offset += 50) {
        const result = await shopApi('deleteHistory', { ids: history.slice(offset, offset + 50).map(order => order.id) })
        deleted += result.deleted
      }
      toast.success(`${deleted} completed orders deleted; reports kept`)
    } catch (err) { toast.error(`${deleted} deleted. ${err.message}`) }
    finally { setHistoryRevision(value => value + 1) }
  }

  const acceptAllPaidOrders = async (visibleOrders = orders) => {
    const pendingPaidOrders = visibleOrders.filter(
      o => o.status === 'paid' && o.paymentMethod === 'upi' && !o.accepted
    )

    if (pendingPaidOrders.length === 0) {
      toast('No verified orders waiting for acceptance')
      return
    }

    if (!confirm(`Accept all ${pendingPaidOrders.length} verified Razorpay orders?`)) return

    setProcessing(p => ({
      ...p,
      ...Object.fromEntries(pendingPaidOrders.map(o => [o.id, true]))
    }))

    try {
      invalidateProducts()
      for (let offset = 0; offset < pendingPaidOrders.length; offset += 5) await Promise.all(pendingPaidOrders.slice(offset, offset + 5).map(async order => {
        await shopApi('accept', { orderId: order.id })
        orderFeed.current.patch(order.id, { accepted: true })
      }))
      setHistoryRevision(value => value + 1)
      toast.success(`${pendingPaidOrders.length} orders accepted`)
    } catch (err) {
      toast.error(`Failed: ${err.message}`)
    }

    setProcessing(p => {
      const next = { ...p }
      pendingPaidOrders.forEach(o => { delete next[o.id] })
      return next
    })
  }

  const deleteAllOrders = async () => deleteMonthOrders(orders)


  const saveEdit = async (id) => {
    try {
      const patch = {
        name: editData.name,
        category: editData.category,
        price: Number(editData.price),
        stock: Number(editData.stock),
        stockMax: Number(editData.stockMax || editData.stock),
        imageUrl: editData.imageUrl || '',
      }
      await updateDoc(doc(db, 'products', id), patch)
      setProducts(previous => previous.map(product => product.id === id ? { ...product, ...patch } : product))
      toast.success('Product updated')
      setEditingId(null)
    } catch (err) {
      toast.error(`Save failed: ${err.message}`)
    }
  }

  const deleteProduct = async (id) => {
    if (!confirm('Delete this product?')) return
    await deleteDoc(doc(db, 'products', id))
    setProducts(previous => previous.filter(product => product.id !== id))
    toast.success('Deleted')
  }

  const addProduct = async () => {
    if (!newProduct.name || !newProduct.price || !newProduct.stock) { toast.error('Fill name, price and stock'); return }
    try {
      const product = {
        name: newProduct.name.trim(),
        category: newProduct.category,
        price: Number(newProduct.price),
        stock: Number(newProduct.stock),
        stockMax: Number(newProduct.stock),
        reserved: 0,
        imageUrl: newProduct.imageUrl || '',
      }
      const added = await addDoc(collection(db, 'products'), product)
      setProducts(previous => [...previous, { id: added.id, ...product }])
      toast.success('Product added!')
      setAdding(false)
      setNewProduct({ name: '', category: 'chips', price: '', stock: '', imageUrl: '' })
    } catch (err) {
      toast.error(`Failed: ${err.message}`)
    }
  }

  const restockProduct = async (id) => {
    const val = prompt('Set new stock quantity:')
    if (val === null || isNaN(Number(val))) return
    await updateDoc(doc(db, 'products', id), { stock: Number(val), stockMax: Number(val) })
    setProducts(previous => previous.map(product => product.id === id ? { ...product, stock: Number(val), stockMax: Number(val) } : product))
    toast.success('Stock updated')
  }

  const setRequestStatus = async (id, newStatus) => {
    try {
      await updateDoc(doc(db, 'requests', id), {
        status: newStatus,
        resolved: newStatus === 'completed',
        completedAt: newStatus === 'completed' ? serverTimestamp() : deleteField(),
        customerSeenAt: deleteField(),
      })
      toast.success(`Request marked as ${REQUEST_STATUSES[newStatus]?.label}`)
    } catch (err) {
      toast.error(`Failed: ${err.message}`)
    }
  }

  const deleteRequest = async (id) => {
    if (!confirm('Delete this request permanently?')) return
    await deleteDoc(doc(db, 'requests', id))
    toast.success('Request deleted')
  }

  const deleteAllRequests = async () => {
    if (!confirm(`Delete ALL ${requests.length} requests permanently? This cannot be undone.`)) return
    setDeletingAllRequests(true)
    try {
      const batch = writeBatch(db)
      requests.forEach(r => batch.delete(doc(db, 'requests', r.id)))
      await batch.commit()
      toast.success('All requests deleted')
    } catch (err) {
      toast.error(`Failed: ${err.message}`)
    }
    setDeletingAllRequests(false)
  }

  const deleteMonthRequests = async (monthRequests) => {
    if (!confirm(`Delete all ${monthRequests.length} requests in this month? This cannot be undone.`)) return
    const batch = writeBatch(db)
    monthRequests.forEach(r => batch.delete(doc(db, 'requests', r.id)))
    await batch.commit()
    toast.success(`${monthRequests.length} requests deleted`)
  }

  return <AdminView {...{ loadHistory, newOrders, orderView, setOrderView, orderLoadStatus, loadOrderView, productSearch, setProductSearch, productLoadStatus, loadProducts, reports, reportStatus, reportError, reportProgress, prepareReports, historyRevision, products, orders, requests, shopOpen, togglingShop, toggleShopStatus, handleLogout, tab, setTab, totalRevenue, pendingPayments, needsActionCount, pendingReqs, adding, setAdding, newProduct, setNewProduct, addProduct, editingId, editData, setEditData, saveEdit, setEditingId, restockProduct, deleteProduct, processing, markAsPaid, markAsCancelled, acceptPaidOrder, deleteOrder, deleteMonthOrders, deletingAll, acceptAllPaidOrders, deleteAllOrders, monthGroups, deletingAllRequests, deleteAllRequests, setRequestStatus, deleteRequest, deleteMonthRequests, requestMonthGroups }} />
}

export function AdminView({ onPreviewNewOrder, newOrders = [], orderView = 'new', setOrderView, orderLoadStatus = { pending: 'idle', history: 'idle', loans: 'idle' }, loadOrderView, productSearch = '', setProductSearch, productLoadStatus = 'ready', loadProducts, loadHistory, reports, reportStatus = 'ready', reportError, reportProgress, prepareReports, historyRevision, products, orders, requests, shopOpen, togglingShop, toggleShopStatus, handleLogout, tab, setTab, totalRevenue, pendingPayments, needsActionCount, pendingReqs, adding, setAdding, newProduct, setNewProduct, addProduct, editingId, editData, setEditData, saveEdit, setEditingId, restockProduct, deleteProduct, processing, markAsPaid, markAsCancelled, acceptPaidOrder, deleteOrder, deleteMonthOrders, deletingAll, acceptAllPaidOrders, deleteAllOrders, monthGroups, deletingAllRequests, deleteAllRequests, setRequestStatus, deleteRequest, deleteMonthRequests, requestMonthGroups, preview = false, financePreview }) {
  const { theme, toggleTheme } = useThemePreference()
  const loans = loanSummary(orders)
  const outstandingOrders = orders.filter(order => outstandingAmount(order) > 0)
  const recentOrders = useHistoryWindow(orders, ORDER_HISTORY_HOURS).filter(order => order.status !== 'draft')
  const displayedOrders = orderView === 'new' ? newOrders.filter(isActiveOrder) : orderView === 'pending' && orderLoadStatus.pending === 'ready' ? orders.filter(isActiveOrder) : orderView === 'history' && orderLoadStatus.history === 'ready' ? recentOrders : []
  const verifiedRecentOrders = newOrders.filter(order => order.status === 'paid' && order.paymentMethod === 'upi' && !order.accepted)
  const normalizedProductSearch = productSearch.trim().toLowerCase()
  const filteredProducts = productLoadStatus === 'ready'
    ? products.filter(product => !normalizedProductSearch || [product.name, product.category, product.packSize]
      .filter(Boolean)
      .some(value => String(value).toLowerCase().includes(normalizedProductSearch)))
      .sort((a, b) => (b.stock || 0) - (a.stock || 0) || (a.name || '').localeCompare(b.name || ''))
    : []
  const tabs = [
    { id: 'products', label: 'Products', icon: Package },
    { id: 'orders', label: 'Orders', icon: ShoppingBag },
    { id: 'loans', label: 'Loans', icon: Wallet },
    { id: 'requests', label: 'Requests', icon: MessageSquare },
    { id: 'finance', label: 'Finance', icon: Wallet },
  ]

  return (
    <motion.div className="admin-shell" data-theme={theme} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.22 }} style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      {preview && <div className="preview-banner">LOCAL ADMIN PREVIEW <span>Sample data · changes stay in this browser</span><a href="/preview">View shop ↗</a></div>}
      <style>{`
        @keyframes badgePulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(255,159,67,0.55); }
          50% { box-shadow: 0 0 0 5px rgba(255,159,67,0); }
        }
        .admin-tab-badge {
          animation: badgePulse 1.6s ease-in-out infinite;
        }
        .no-spinner::-webkit-outer-spin-button,
        .no-spinner::-webkit-inner-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        .no-spinner {
          -moz-appearance: textfield;
        }
      `}</style>
      <header className="admin-header" style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 30 }}>
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '0 16px', height: 78, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <a className="store-brand" href={preview ? '/admin-preview' : '/admin/dashboard'}><span className="brand-stamp"><img src="/favicon.svg?v=3" alt="" aria-hidden="true" /></span>snackshop<span className="brand-period">.</span></a>
            <span style={{ fontSize: 11, color: 'var(--accent)', background: 'var(--accent-dim)', padding: '2px 8px', borderRadius: 100, fontWeight: 600 }}>BACK OFFICE</span>
          </div>
          <div className="admin-header-actions" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <ThemeToggle theme={theme} onToggle={toggleTheme} />
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={press}
              onClick={toggleShopStatus}
              disabled={togglingShop}
              style={{
                background: shopOpen ? 'var(--success-dim)' : 'var(--danger-dim)',
                border: `1px solid ${shopOpen ? 'rgba(46,204,113,0.3)' : 'rgba(255,92,92,0.3)'}`,
                borderRadius: 100, padding: '6px 14px',
                color: shopOpen ? 'var(--success)' : 'var(--danger)',
                display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600,
                cursor: togglingShop ? 'not-allowed' : 'pointer', opacity: togglingShop ? 0.6 : 1,
              }}
              title="Toggle whether the shop shows as open for pickup"
            >
              {shopOpen ? <Store size={13} /> : <DoorClosed size={13} />}
              {shopOpen ? 'Shop Open' : 'Shop Closed'}
            </motion.button>
            <motion.button 
              whileHover={{ scale: 1.02 }}
              whileTap={press}
              onClick={handleLogout} 
              style={{ background: 'var(--danger-dim)', border: '1px solid rgba(255,92,92,0.2)', borderRadius: 8, padding: '6px 12px', color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, cursor: 'pointer' }}
            >
              <LogOut size={13} /> {preview ? 'Reset demo' : 'Logout'}
            </motion.button>
          </div>
        </div>
      </header>

      <main className="admin-main" style={{ maxWidth: 1180, margin: '0 auto', padding: '24px 16px' }}>
        <div className="admin-intro"><div><span className="eyebrow">THE OTHER SIDE OF THE COUNTER</span><h1>A little shop. All in order.</h1><p>Keep the shelves stocked, the orders moving, and the next break sorted.</p></div><a href={preview ? '/preview' : '/'} className="admin-shop-link">Visit the shop ↗</a></div>
        {/* Stats Grid */}
        {preview && <p className="admin-preview-note" role="status">This is the actual dashboard UI with sample data. All actions and image selections stay local; reload or reset to start again.</p>}
        <div className="admin-stats" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 28 }}>
          <StatCard label="Total products" value={productLoadStatus === 'ready' ? products.length : '--'} />
          <StatCard label="Paid orders" value={reports ? (reportStatus === 'ready' ? reports.reduce((sum, report) => sum + (report.paidCount || 0), 0) : 'Loading') : orders.filter(o => o.status === 'paid').length} color="var(--success)" />
          <StatCard label="Revenue" value={reports && reportStatus !== 'ready' ? 'Loading' : money(totalRevenue)} color="var(--accent)" maskable />
          <div className="admin-loan-summary">
            <button className="loan-summary-link" onClick={() => setTab('loans')}>Loans <span>View balances ↗</span></button>
            <div className="loan-summary-total">{orderLoadStatus.loans === 'ready' ? money(loans.total) : '--'}</div>
            {orderLoadStatus.loans === 'ready' && <div className="loan-summary-breakdown">
              <span className="loan-summary-partial">Partial <strong>{money(loans.partial)}</strong></span>
              <span className="loan-summary-loaned">Loaned <strong>{money(loans.loaned)}</strong></span>
            </div>}
          </div>
        </div>

        {/* Dynamic Animated Tabs */}
        <nav className="admin-tabs" aria-label="Dashboard sections" style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {tabs.map(t => (
            <motion.button whileTap={press}
              key={t.id} aria-current={tab === t.id ? 'page' : undefined}
              onClick={() => setTab(t.id)} 
              style={{ 
                position: 'relative', 
                padding: '8px 18px', 
                borderRadius: 100, 
                fontSize: 13, 
                fontFamily: 'Syne', 
                fontWeight: 600, 
                background: 'transparent', 
                color: tab === t.id ? 'var(--accent-text)' : 'var(--text-secondary)', 
                border: 'none', 
                display: 'flex', 
                alignItems: 'center', 
                gap: 6, 
                cursor: 'pointer',
                zIndex: 1 
              }}
            >
              {tab === t.id && (
                <motion.div
                  layoutId="activeTabPill"
                  style={{ position: 'absolute', inset: 0, background: 'var(--accent)', borderRadius: 100, zIndex: -1 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
              <t.icon size={13} /> {t.label}
              {t.id === 'loans' && orderLoadStatus.loans === 'ready' && loans.count > 0 && <span className="loan-tab-count">{loans.count}</span>}
              {t.id === 'orders' && needsActionCount > 0 && (
                <span className="admin-tab-badge" style={{ background: 'var(--warning)', color: 'white', borderRadius: 100, width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700 }}>
                  {needsActionCount}
                </span>
              )}
              {t.id === 'requests' && pendingReqs > 0 && (
                <span className="admin-tab-badge" style={{ background: 'var(--danger)', color: 'white', borderRadius: 100, width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700 }}>
                  {pendingReqs}
                </span>
              )}
            </motion.button>
          ))}
        </nav>

        {/* ── PRODUCTS TAB ── */}
        {tab === 'products' && (
          <div>
            <div className="admin-products-toolbar">
              <div>
                <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                  {productLoadStatus === 'loading' || productLoadStatus === 'idle'
                    ? 'Loading products...'
                    : productLoadStatus === 'error' ? 'Could not load products.'
                    : normalizedProductSearch ? `${filteredProducts.length} matching products` : `${products.length} products`}
                </p>
                <label className="admin-product-search">
                  <Search size={16} aria-hidden="true" />
                  <input
                    type="search"
                    value={productSearch}
                    onChange={event => setProductSearch(event.target.value)}
                    placeholder="Search products or categories"
                    aria-label="Search admin products"
                  />
                  {productSearch && (
                    <motion.button
                      className="icon-button icon-button--compact"
                      type="button"
                      whileTap={press}
                      onClick={() => setProductSearch('')}
                      aria-label="Clear product search"
                    >
                      <X size={15} />
                    </motion.button>
                  )}
                </label>
              </div>
              {loadProducts && <button className="monthly-report-button" disabled={productLoadStatus === 'loading'} onClick={() => loadProducts(true)}><RefreshCw size={14} /> Refresh products</button>}
              <motion.button 
                className="admin-add-product-button"
                whileHover={{ scale: 1.02 }}
                whileTap={press}
                onClick={() => setAdding(a => !a)} 
                style={{ padding: '9px 18px', background: 'var(--accent)', color: 'var(--accent-text)', border: 'none', borderRadius: 10, fontFamily: 'Syne', fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
              >
                <Plus size={14} /> Add product
              </motion.button>
            </div>

            <AnimatePresence>
              {adding && (
                <motion.div 
                  initial={{ opacity: 0, height: 0, y: -10 }}
                  animate={{ opacity: 1, height: 'auto', y: 0 }}
                  exit={{ opacity: 0, height: 0 }}
                  style={{ background: 'var(--surface)', border: '1px solid var(--accent)', borderRadius: 'var(--radius)', padding: 16, marginBottom: 16, overflow: 'hidden' }}
                >
                  <p style={{ fontFamily: 'Syne', fontWeight: 700, marginBottom: 14, fontSize: 14, color: 'var(--accent)' }}>New product</p>
                  <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                    <ImageUploader preview={preview} currentUrl={newProduct.imageUrl} productId={`new_${Date.now()}`} onUploaded={url => setNewProduct(p => ({ ...p, imageUrl: url }))} />
                    <div className="admin-product-fields" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10, flex: 1, minWidth: 260 }}>
                      <input value={newProduct.name} onChange={e => setNewProduct(p => ({ ...p, name: e.target.value }))} placeholder="Product name *" />
                      <select value={newProduct.category} onChange={e => setNewProduct(p => ({ ...p, category: e.target.value }))}>
                        {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                      <input type="number" className="no-spinner" value={newProduct.price} onChange={e => setNewProduct(p => ({ ...p, price: e.target.value }))} placeholder="Price ₹ *" />
                      <input type="number" className="no-spinner" value={newProduct.stock} onChange={e => setNewProduct(p => ({ ...p, stock: e.target.value }))} placeholder="Stock qty *" />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                    <motion.button whileTap={press} onClick={addProduct} style={{ padding: '9px 22px', background: 'var(--accent)', color: 'var(--accent-text)', border: 'none', borderRadius: 8, fontFamily: 'Syne', fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                      <Check size={13} /> Save product
                    </motion.button>
                    <motion.button whileTap={press} onClick={() => setAdding(false)} style={{ padding: '9px 14px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer' }}>Cancel</motion.button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
              {(productLoadStatus === 'loading' || productLoadStatus === 'idle') && <div className="admin-search-empty" role="status">Loading products...</div>}
              {productLoadStatus === 'error' && <div className="admin-search-empty" role="alert"><p>Could not load products.</p><button onClick={() => loadProducts(true)}>Retry</button></div>}
              {productLoadStatus === 'ready' && products.length === 0 && (
                <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-hint)', fontSize: 14 }}>
                  No products yet — click "Add product" to get started
                </div>
              )}
              {normalizedProductSearch && productLoadStatus === 'ready' && products.length > 0 && filteredProducts.length === 0 && (
                <div className="admin-search-empty">
                  <Search size={22} aria-hidden="true" />
                  <p>No products match “{productSearch.trim()}”</p>
                  <button type="button" onClick={() => setProductSearch('')}>Clear search</button>
                </div>
              )}
              <AnimatePresence>
                {filteredProducts.map((p, i) => (
                  <motion.div 
                    key={p.id}
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, height: 0 }}
                    style={{ padding: '12px 16px', borderBottom: i < filteredProducts.length - 1 ? '1px solid var(--border)' : 'none' }}
                  >
                    {editingId === p.id ? (
                      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                        <ImageUploader preview={preview} currentUrl={editData.imageUrl} productId={p.id} onUploaded={url => setEditData(d => ({ ...d, imageUrl: url }))} />
                        <div className="admin-product-fields" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 8, flex: 1 }}>
                          <input value={editData.name || ''} onChange={e => setEditData(d => ({ ...d, name: e.target.value }))} style={{ fontSize: 13 }} placeholder="Name" />
                          <select value={editData.category || 'chips'} onChange={e => setEditData(d => ({ ...d, category: e.target.value }))}>
                            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                          <input type="number" className="no-spinner" value={editData.price || ''} onChange={e => setEditData(d => ({ ...d, price: e.target.value }))} placeholder="₹" />
                          <input type="number" className="no-spinner" value={editData.stock || ''} onChange={e => setEditData(d => ({ ...d, stock: e.target.value }))} placeholder="Stock" />
                        </div>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <motion.button whileTap={press} onClick={() => saveEdit(p.id)} style={{ background: 'var(--success)', border: 'none', borderRadius: 8, padding: '8px 16px', color: 'white', fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}><Check size={13} /> Save</motion.button>
                          <motion.button className="icon-button icon-button--compact" whileTap={press} aria-label={`Cancel editing ${p.name}`} onClick={() => setEditingId(null)} style={{ background: 'var(--surface2)', border: 'none', borderRadius: 6, padding: '8px 10px', color: 'var(--text-secondary)', display: 'flex', cursor: 'pointer' }}><X size={14} /></motion.button>
                        </div>
                      </div>
                    ) : (
                      <div className="admin-inventory-row" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ width: 52, height: 52, borderRadius: 10, background: 'var(--surface2)', border: '1px solid var(--border)', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {p.imageUrl || p.image ? <img src={p.imageUrl || p.image} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.target.style.display = 'none' }} /> : <NoImagePlaceholder small />}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 14 }}>{p.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-hint)', textTransform: 'capitalize' }}>{p.category}</div>
                        </div>
                        <div style={{ fontFamily: 'Syne', fontWeight: 700, color: 'var(--accent)', minWidth: 50, textAlign: 'right' }}>₹{p.price}</div>
                        <span style={{ padding: '3px 10px', borderRadius: 100, fontSize: 12, fontWeight: 600, minWidth: 64, textAlign: 'center', background: p.stock === 0 ? 'var(--danger-dim)' : p.stock <= 3 ? 'var(--warning-dim)' : 'var(--success-dim)', color: p.stock === 0 ? 'var(--danger)' : p.stock <= 3 ? 'var(--warning)' : 'var(--success)' }}>
                          {p.stock} left
                        </span>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <motion.button whileTap={press} onClick={() => restockProduct(p.id)} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 10px', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer' }}>Restock</motion.button>
                          <motion.button className="icon-button icon-button--compact" whileTap={press} aria-label={`Edit ${p.name}`} onClick={() => { setEditingId(p.id); setEditData({ ...p }) }} style={{ background: 'var(--surface2)', border: 'none', borderRadius: 6, padding: 6, color: 'var(--text-secondary)', display: 'flex', cursor: 'pointer' }}><Edit2 size={13} /></motion.button>
                          <motion.button className="icon-button icon-button--compact" whileTap={press} aria-label={`Delete ${p.name}`} onClick={() => deleteProduct(p.id)} style={{ background: 'var(--danger-dim)', border: 'none', borderRadius: 6, padding: 6, color: 'var(--danger)', display: 'flex', cursor: 'pointer' }}><Trash2 size={13} /></motion.button>
                        </div>
                      </div>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>
        )}

        {/* ── ORDERS TAB ── */}
        {tab === 'orders' && (
          <div>
            <div className="admin-order-views">
              {preview && onPreviewNewOrder && <button className="monthly-report-button" onClick={onPreviewNewOrder}><Plus size={14} /> Simulate new order</button>}
              <button className="monthly-report-button" aria-pressed={orderView === 'new'} onClick={() => setOrderView('new')}>New incoming{newOrders.length > 0 ? ` (${newOrders.length})` : ''}</button>
              <button className="monthly-report-button" aria-pressed={orderView === 'history'} onClick={() => loadOrderView('history')}>Show past 24 hours</button>
              {orderView !== 'new' && <button className="monthly-report-button" disabled={orderLoadStatus[orderView] === 'loading'} onClick={() => loadOrderView(orderView, true)}><RefreshCw size={14} /> Refresh</button>}
            </div>
            {newOrders.length > 0 && <>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
                <button className="monthly-report-button" onClick={() => acceptAllPaidOrders(newOrders)} disabled={verifiedRecentOrders.length === 0}>
                  <Check size={13} /> {`Accept verified (${verifiedRecentOrders.length})`}
                </button>
              </div>
              <MonthGroup keepOpen label="Orders awaiting your action" orders={newOrders} processing={processing} onMarkPaid={markAsPaid} onReject={markAsCancelled} onAcceptPaid={acceptPaidOrder} />
            </>}
            {orderView === 'new' ? (newOrders.length === 0 && <div className="loans-empty">No orders awaiting action. New orders will appear here automatically.</div>)
              : orderLoadStatus[orderView] === 'loading' ? <div className="loans-empty" role="status">Loading orders...</div>
              : orderView !== 'new' && orderLoadStatus[orderView] === 'error' ? <div className="loans-empty" role="alert">Could not load orders. Use Refresh to try again.</div>
              : displayedOrders.length === 0 ? (
              <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-hint)', fontSize: 14, background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>{orderView === 'new' ? 'Waiting for new orders. Choose a view above to load existing orders.' : orderView === 'pending' ? 'No pending orders.' : 'No orders in the last 24 hours.'}</div>
            ) : (
              <>
                <MonthGroup key={orderView} label={orderView === 'new' ? 'New incoming orders' : orderView === 'pending' ? 'Pending orders' : 'All orders (last 24 hours)'} orders={displayedOrders} processing={processing} onMarkPaid={markAsPaid} onReject={markAsCancelled} onAcceptPaid={acceptPaidOrder} />
              </>
            )}
          </div>
        )}

        {tab === 'orders' && reports && <section>
          <div className="monthly-reports-toolbar"><div><h2>Monthly history</h2><p>Open a month to view its full order list.</p></div><button className="monthly-report-button" disabled={reportStatus !== 'ready' || !reports.length} onClick={() => downloadMonthlyCsv(reports)}><Download size={14} /> Download monthly CSV</button></div>
          {reportStatus !== 'ready' && <div className="monthly-report-setup" role="status"><strong>Monthly report setup</strong><p>{reportStatus === 'error' ? reportError : `Preparing saved summaries (${reportProgress || 0} records processed). This runs once.`}</p>{reportStatus === 'error' && <button className="monthly-report-button" onClick={prepareReports}>Retry setup</button>}</div>}
          {reports.map(report => <MonthlyHistory key={report.month} report={report} loadHistory={loadHistory} liveOrders={orders} reportsReady={reportStatus === 'ready'} processing={processing} onMarkPaid={markAsPaid} onReject={markAsCancelled} onAcceptPaid={acceptPaidOrder} />)}
        </section>}

        {tab === 'loans' && <section className="admin-loans-section">
          <div className="loans-heading"><div><h2>Outstanding loans</h2><p>Record cash received to update revenue and clear balances.</p></div>{orderLoadStatus.loans === 'ready' && <strong>{money(loans.total)} owed</strong>}</div>
          <div className="admin-order-views"><button className="monthly-report-button" disabled={orderLoadStatus.loans === 'loading'} onClick={() => loadOrderView('loans', orderLoadStatus.loans === 'ready')}><Wallet size={14} /> {orderLoadStatus.loans === 'ready' ? 'Refresh loans' : 'Show unpaid loans'}</button></div>
          {orderLoadStatus.loans === 'idle' ? <div className="loans-empty">Choose Show unpaid loans to load outstanding balances.</div>
            : orderLoadStatus.loans === 'loading' ? <div className="loans-empty" role="status">Loading loans...</div>
            : orderLoadStatus.loans === 'error' ? <div className="loans-empty" role="alert">Could not load loans. Try again.</div>
            : outstandingOrders.length ? <MonthGroup label="All outstanding balances" orders={outstandingOrders} processing={processing} onMarkPaid={markAsPaid} onReject={markAsCancelled} onAcceptPaid={acceptPaidOrder} /> : <div className="loans-empty">All clear — no outstanding balances.</div>}
        </section>}

        {/* ── REQUESTS TAB ── */}
        {tab === 'requests' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {requests.length > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  {requests.length} request{requests.length !== 1 ? 's' : ''} · {pendingReqs} open
                </p>
                <motion.button
                  whileTap={press}
                  onClick={deleteAllRequests}
                  disabled={deletingAllRequests}
                  style={{ padding: '7px 14px', background: 'var(--danger-dim)', border: '1px solid rgba(255,92,92,0.25)', borderRadius: 8, color: 'var(--danger)', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', opacity: deletingAllRequests ? 0.6 : 1 }}
                >
                  <Trash2 size={12} /> {deletingAllRequests ? 'Deleting…' : `Delete all (${requests.length})`}
                </motion.button>
              </div>
            )}

            {requests.length === 0 && (
              <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-hint)', fontSize: 14, background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>No requests yet</div>
            )}

            {Object.entries(requestMonthGroups).map(([label, monthRequests]) => (
              <RequestMonthGroup
                key={label}
                label={label}
                requests={monthRequests}
                onSetStatus={setRequestStatus}
                onDelete={deleteRequest}
                onDeleteAll={deleteMonthRequests}
              />
            ))}
          </div>
        )}

        {/* ── FINANCE TAB ── */}
        {tab === 'finance' && (reportStatus !== 'ready'
          ? <div className="monthly-report-setup" role="status"><strong>Monthly report setup</strong><p>{reportStatus === 'error' ? reportError : `Preparing saved summaries (${reportProgress || 0} records processed). This runs once.`}</p>{reportStatus === 'error' && <button className="monthly-report-button" onClick={prepareReports}>Retry setup</button>}</div>
          : preview ? financePreview : <Ledger orders={orders} reports={reports} reportsReady />)}
        <footer className="store-footer"><span className="footer-wordmark">snackshop.</span><span>Behind every good break, a well-stocked shelf.</span></footer>
      </main>
    </motion.div>
  )
}

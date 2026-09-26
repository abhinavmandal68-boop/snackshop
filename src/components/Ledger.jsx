import { useMemo, useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import { collection, onSnapshot, addDoc, deleteDoc, doc, orderBy, query, serverTimestamp } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { motion, AnimatePresence } from 'framer-motion'
import { press } from '../lib/motion'

export const MANUAL_TRANSACTION_TYPES = {
  procurement: { label: 'Procurement cost', shortLabel: 'Procurement', tone: 'danger' },
  refund: { label: 'Supplier refund', shortLabel: 'Refund', tone: 'warning' },
  cashback: { label: 'Cashback', shortLabel: 'Cashback', tone: 'success' },
  self: { label: 'Self use', shortLabel: 'Self use', tone: 'info' },
}

// Older records stay readable after the finance redesign.
export const TRANSACTION_TYPES = {
  ...MANUAL_TRANSACTION_TYPES,
  spent: { ...MANUAL_TRANSACTION_TYPES.procurement, label: 'Stock purchase' },
  earned: { label: 'Other income (legacy)', shortLabel: 'Income', tone: 'success' },
}

const money = value => `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`

const asDate = value => {
  if (!value) return new Date(0)
  if (typeof value.toDate === 'function') return value.toDate()
  if (typeof value.toMillis === 'function') return new Date(value.toMillis())
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(`${value}T12:00:00`)
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? new Date(0) : date
}

const pad = value => String(value).padStart(2, '0')
export const localDateKey = value => {
  const date = asDate(value)
  return date.getTime() ? `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` : ''
}
export const transactionDateBounds = (now = new Date()) => ({
  min: `${now.getFullYear() - 1}-01-01`,
  max: localDateKey(now),
})
export const isTransactionDateAllowed = (value, now = new Date()) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false
  const { min, max } = transactionDateBounds(now)
  return value >= min && value <= max
}

const entryDate = entry => asDate(entry.transactionDate || entry.paidAt || entry.createdAt)
const dateMatches = (entry, dateKey) => localDateKey(entryDate(entry)) === dateKey

export function financeTotals(entries, orders) {
  const totals = { sales: 0, procurement: 0, spent: 0, earned: 0, self: 0, refund: 0, cashback: 0 }

  orders.filter(order => order.status === 'paid').forEach(order => {
    totals.sales += Number(order.total || 0)
  })

  entries.forEach(entry => {
    if (entry.type === 'procurement' || entry.type === 'spent') {
      totals.procurement += Number(entry.amount || entry.spent || 0)
      return
    }
    if (entry.type && TRANSACTION_TYPES[entry.type]) {
      totals[entry.type] += Number(entry.amount || 0)
      return
    }
    totals.procurement += Number(entry.procurement || entry.spent || 0)
    totals.earned += Number(entry.earned || 0)
    totals.self += Number(entry.self || 0)
    totals.refund += Number(entry.refund || 0)
    totals.cashback += Number(entry.cashback || 0)
  })

  totals.spent = totals.procurement
  totals.income = totals.sales + totals.earned
  totals.recovered = totals.refund + totals.cashback
  totals.netStockCost = totals.procurement - totals.recovered
  totals.profit = totals.sales - totals.netStockCost
  return totals
}

function StatBox({ label, value, tone }) {
  return (
    <div className={`finance-stat-box finance-stat-${tone || 'neutral'}`}>
      <div className="finance-stat-top"><div className="finance-stat-label">{label}</div></div>
      <div className="finance-stat-value">{value}</div>
    </div>
  )
}

function TypeBadge({ type }) {
  const meta = TRANSACTION_TYPES[type] || { shortLabel: 'Legacy', tone: 'neutral' }
  return <span className={`finance-type-badge finance-type-${meta.tone}`}>{meta.shortLabel}</span>
}

function ActivityRow({ item, onDelete }) {
  const isSale = item.kind === 'daily-sales'
  const meta = isSale ? { label: 'Earned', tone: 'success' } : (TRANSACTION_TYPES[item.type] || { label: 'Ledger entry', tone: 'neutral' })
  const positive = isSale || item.type === 'refund' || item.type === 'cashback' || item.type === 'earned'
  const amount = isSale ? item.total : Number(item.amount || item[item.type] || 0)
  const title = isSale ? 'Daily sales' : item.note || meta.label

  return (
    <motion.div layout initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} className="finance-activity-row">
      <div className="finance-activity-copy">
        <div className="finance-activity-heading"><strong>{title}</strong>{isSale ? <span className="finance-type-badge finance-type-success">Earned</span> : <TypeBadge type={item.type} />}</div>
      </div>
      <div className="finance-activity-values">
        <strong className={positive ? 'is-positive' : item.type === 'self' ? 'is-independent' : 'is-negative'}>{positive ? '+' : item.type === 'self' ? '' : '−'}{money(amount)}</strong>
        {!isSale && <motion.button whileTap={press} type="button" onClick={() => onDelete(item.id)} aria-label={`Delete ${title}`}>Delete</motion.button>}
      </div>
    </motion.div>
  )
}

function TransactionForm({ saving, onSave, onClose }) {
  const bounds = transactionDateBounds()
  const [draft, setDraft] = useState({ type: 'procurement', amount: '', note: '', transactionDate: bounds.max })

  const submit = event => {
    event.preventDefault()
    const amount = Number(draft.amount)
    if (!Number.isFinite(amount) || amount <= 0) return toast.error('Enter an amount greater than zero')
    if (!isTransactionDateAllowed(draft.transactionDate)) return toast.error(`Choose a date from ${bounds.min} through today`)
    onSave({ ...draft, amount, note: draft.note.trim() })
  }

  return (
    <motion.form initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="finance-entry-form" onSubmit={submit}>
      <div className="finance-entry-form-heading">
        <div><span className="eyebrow">ADD</span><h3>New transaction</h3></div>
        <button type="button" onClick={onClose} aria-label="Close transaction form">Close</button>
      </div>
      <fieldset className="finance-type-picker">
        <legend>Transaction type</legend>
        {Object.entries(MANUAL_TRANSACTION_TYPES).map(([value, type]) => {
          return <button key={value} type="button" className={draft.type === value ? `is-active finance-choice-${type.tone}` : ''} onClick={() => setDraft(current => ({ ...current, type: value }))}>{type.label}</button>
        })}
      </fieldset>
      <div className="finance-entry-fields">
        <label>Transaction date<input type="date" min={bounds.min} max={bounds.max} value={draft.transactionDate} onChange={event => setDraft(value => ({ ...value, transactionDate: event.target.value }))} required /></label>
        <label>Amount (₹)<input className="no-spinner" type="number" min="0.01" step="0.01" inputMode="decimal" value={draft.amount} onChange={event => setDraft(value => ({ ...value, amount: event.target.value }))} placeholder="0.00" autoFocus required /></label>
        <label className="finance-note-field">Description <span>(optional)</span><input value={draft.note} maxLength={120} onChange={event => setDraft(value => ({ ...value, note: event.target.value }))} /></label>
      </div>
      <div className="finance-entry-actions"><button type="button" onClick={onClose}>Cancel</button><motion.button whileTap={press} type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save transaction'}</motion.button></div>
    </motion.form>
  )
}

function DailyFlow({ entries, orders, selectedDate }) {
  const selected = asDate(selectedDate)
  const year = selected.getFullYear()
  const month = selected.getMonth()
  const days = new Date(year, month + 1, 0).getDate()
  const todayKey = localDateKey(new Date())
  const points = Array.from({ length: days }, (_, index) => {
    const key = `${year}-${pad(month + 1)}-${pad(index + 1)}`
    if (key > todayKey) return null
    const totals = financeTotals(entries.filter(item => dateMatches(item, key)), orders.filter(item => dateMatches(item, key)))
    return { key, day: index + 1, income: totals.sales, out: totals.procurement }
  }).filter(Boolean)
  const shown = points.filter(point => point.key <= selectedDate).slice(-7)
  const ceiling = Math.max(1, ...shown.flatMap(point => [point.income, point.out]))

  return <section className="finance-panel finance-flow-panel">
    <div className="finance-panel-heading"><div><span className="eyebrow">DAILY FLOW</span><h3>{selected.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</h3></div><div className="finance-flow-legend"><span className="is-earned">Earned</span><span className="is-cost">Procurement</span></div></div>
    <div className="finance-flow-chart" aria-label="Daily earned and procurement chart">
      {shown.map(point => <div className={`finance-flow-day ${point.key === selectedDate ? 'is-selected' : ''}`} key={point.key} tabIndex="0">
        <div className="finance-flow-tooltip"><strong>{asDate(point.key).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</strong><span>Procurement: {money(point.out)}</span><span>Earned: {money(point.income)}</span></div>
        <div className="finance-flow-bars"><i className="is-earned" style={{ height: `${Math.max(point.income ? 8 : 0, (point.income / ceiling) * 100)}%` }} /><i className="is-cost" style={{ height: `${Math.max(point.out ? 8 : 0, (point.out / ceiling) * 100)}%` }} /></div>
        <span>{point.day}</span>
      </div>)}
    </div>
  </section>
}

export default function Ledger({ orders = [] }) {
  const [entries, setEntries] = useState([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, 'ledger'), orderBy('createdAt', 'desc')), snap => setEntries(snap.docs.map(entry => ({ id: entry.id, ...entry.data() }))), err => console.error('Ledger error:', err))
    return unsub
  }, [])

  const addEntry = async transaction => {
    setSaving(true)
    try {
      await addDoc(collection(db, 'ledger'), { ...transaction, createdAt: serverTimestamp() })
      toast.success('Transaction saved')
    } catch (err) {
      toast.error(`Failed: ${err.message}`)
      throw err
    } finally { setSaving(false) }
  }

  const deleteEntry = async id => {
    if (!confirm('Delete this finance entry?')) return
    try { await deleteDoc(doc(db, 'ledger', id)); toast.success('Entry deleted') } catch (err) { toast.error(`Delete failed: ${err.message}`) }
  }

  return <LedgerView {...{ entries, orders, saving, addEntry, deleteEntry }} />
}

export function LedgerView({ entries, orders = [], saving = false, addEntry, deleteEntry }) {
  const bounds = transactionDateBounds()
  const [showForm, setShowForm] = useState(false)
  const [selectedDate, setSelectedDate] = useState(bounds.max)
  const selectedEntries = useMemo(() => entries.filter(entry => dateMatches(entry, selectedDate)), [entries, selectedDate])
  const selectedOrders = useMemo(() => orders.filter(order => order.status === 'paid' && dateMatches(order, selectedDate)), [orders, selectedDate])
  const totals = useMemo(() => financeTotals(selectedEntries, selectedOrders), [selectedEntries, selectedOrders])

  const activity = useMemo(() => {
    const records = [...selectedEntries].sort((a, b) => entryDate(b) - entryDate(a))
    if (totals.sales > 0) records.unshift({ id: `sales-${selectedDate}`, kind: 'daily-sales', total: totals.sales, orderCount: selectedOrders.length })
    return records
  }, [selectedEntries, selectedOrders.length, selectedDate, totals.sales])

  const moveDate = offset => {
    const next = asDate(selectedDate)
    next.setDate(next.getDate() + offset)
    const key = localDateKey(next)
    if (key >= bounds.min && key <= bounds.max) setSelectedDate(key)
  }
  const selectedLabel = asDate(selectedDate).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })

  const saveEntry = async transaction => {
    try { await addEntry(transaction); setSelectedDate(transaction.transactionDate); setShowForm(false) } catch { /* Keep open for retry. */ }
  }

  return (
    <div className="finance-ledger">
      <div className="finance-overview-heading">
        <div><span className="eyebrow">FINANCE</span><h2>Shop money</h2></div>
        <motion.button whileTap={press} onClick={() => setShowForm(value => !value)} className="finance-add-button">New transaction</motion.button>
      </div>

      <div className="finance-date-toolbar">
        <button type="button" onClick={() => moveDate(-1)} disabled={selectedDate <= bounds.min} aria-label="Previous day">‹</button>
        <label><span>{selectedLabel}</span><input type="date" min={bounds.min} max={bounds.max} value={selectedDate} onChange={event => setSelectedDate(event.target.value)} aria-label="Finance date" /></label>
        <button type="button" onClick={() => moveDate(1)} disabled={selectedDate >= bounds.max} aria-label="Next day">›</button>
        {selectedDate !== bounds.max && <button type="button" className="finance-today-button" onClick={() => setSelectedDate(bounds.max)}>Today</button>}
      </div>

      <div className="finance-stats">
        <StatBox label="Earned sales" value={money(totals.sales)} tone="success" />
        <StatBox label="Procurement" value={money(totals.procurement)} tone="danger" />
        <StatBox label="Refunds + cashback" value={`+${money(totals.recovered)}`} tone="warning" />
        <StatBox label="Profit" value={`${totals.profit >= 0 ? '+' : '−'}${money(Math.abs(totals.profit))}`} tone={totals.profit >= 0 ? 'accent' : 'danger'} />
      </div>

      <div className="finance-self-strip"><div><span>Self use</span><strong>{money(totals.self)}</strong></div></div>

      <AnimatePresence>{showForm && <TransactionForm saving={saving} onSave={saveEntry} onClose={() => setShowForm(false)} />}</AnimatePresence>

      <div className="finance-dashboard-grid">
        <DailyFlow entries={entries} orders={orders} selectedDate={selectedDate} />
        <section className="finance-panel finance-activity-panel">
          <div className="finance-panel-heading"><div><span className="eyebrow">ACTIVITY</span><h3>{selectedLabel}</h3></div></div>
          <div className="finance-activity-list">
            {activity.length === 0 ? <div className="finance-empty"><strong>No activity</strong></div> : <AnimatePresence initial={false}>{activity.map(item => <ActivityRow key={`${item.kind || 'ledger'}-${item.id}`} item={item} onDelete={deleteEntry} />)}</AnimatePresence>}
          </div>
        </section>
      </div>
    </div>
  )
}

import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp } from 'firebase/firestore'
import { AnimatePresence, motion } from 'framer-motion'
import { db } from '../lib/firebase'
import { press } from '../lib/motion'

export const MANUAL_TRANSACTION_TYPES = {
  procurement: { label: 'Procurement cost', shortLabel: 'Procurement', tone: 'danger' },
  refund: { label: 'Supplier refund', shortLabel: 'Refund', tone: 'warning' },
  cashback: { label: 'Cashback', shortLabel: 'Cashback', tone: 'success' },
  self: { label: 'Self use', shortLabel: 'Self use', tone: 'info' },
}

export const TRANSACTION_TYPES = {
  ...MANUAL_TRANSACTION_TYPES,
  spent: { ...MANUAL_TRANSACTION_TYPES.procurement, label: 'Stock purchase' },
  earned: { label: 'Other income (legacy)', shortLabel: 'Income', tone: 'success' },
}

const money = value => `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
const pad = value => String(value).padStart(2, '0')

const asDate = value => {
  if (!value) return new Date(0)
  if (typeof value.toDate === 'function') return value.toDate()
  if (typeof value.toMillis === 'function') return new Date(value.toMillis())
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(`${value}T12:00:00`)
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? new Date(0) : date
}

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
const monthKey = entry => localDateKey(entryDate(entry)).slice(0, 7)
const dateLabel = value => asDate(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })

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
  return <div className={`finance-stat-box finance-stat-${tone || 'neutral'}`}><div className="finance-stat-label">{label}</div><div className="finance-stat-value">{value}</div></div>
}

function TypeBadge({ type }) {
  const meta = TRANSACTION_TYPES[type] || { shortLabel: 'Legacy', tone: 'neutral' }
  return <span className={`finance-type-badge finance-type-${meta.tone}`}>{meta.shortLabel}</span>
}

function buildActivity(entries, orders) {
  const saleDays = new Map()
  orders.filter(order => order.status === 'paid').forEach(order => {
    const key = localDateKey(entryDate(order))
    if (!key) return
    const current = saleDays.get(key) || { id: `sales-${key}`, kind: 'daily-sales', transactionDate: key, total: 0, orderCount: 0 }
    current.total += Number(order.total || 0)
    current.orderCount += 1
    saleDays.set(key, current)
  })
  return [...saleDays.values(), ...entries.map(entry => ({ ...entry, kind: 'ledger' }))]
    .sort((a, b) => entryDate(b) - entryDate(a))
}

function ActivityRow({ item, onDelete }) {
  const isSale = item.kind === 'daily-sales'
  const isLegacy = !isSale && !item.type
  const meta = isSale ? { label: 'Earned', tone: 'success' } : (TRANSACTION_TYPES[item.type] || { label: 'Ledger entry', tone: 'neutral' })
  const positive = isSale || item.type === 'refund' || item.type === 'cashback' || item.type === 'earned'
  const amount = isSale ? Number(item.total || 0) : Number(item.amount || item[item.type] || 0)
  const title = isSale ? 'Daily sales' : item.note || (isLegacy ? 'Imported ledger entry' : meta.label)
  const legacyValues = isLegacy
    ? [['spent', 'Procurement'], ['earned', 'Income'], ['refund', 'Refund'], ['cashback', 'Cashback'], ['self', 'Self use']].filter(([type]) => Number(item[type] || 0) > 0)
    : []

  return <motion.div layout initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} className="finance-activity-row">
    <div className="finance-activity-copy">
      <div className="finance-activity-heading"><strong>{title}</strong>{isSale ? <span className="finance-type-badge finance-type-success">Earned</span> : <TypeBadge type={item.type} />}</div>
      <time dateTime={localDateKey(entryDate(item))}>{dateLabel(entryDate(item))}</time>
    </div>
    <div className="finance-activity-values">
      {legacyValues.length ? <div className="finance-legacy-values">{legacyValues.map(([type, label]) => <span key={type}><small>{label}</small><strong>{money(item[type])}</strong></span>)}</div> : <strong className={positive ? 'is-positive' : item.type === 'self' ? 'is-independent' : 'is-negative'}>{positive ? '+' : item.type === 'self' ? '' : '−'}{money(amount)}</strong>}
      {!isSale && <motion.button whileTap={press} type="button" onClick={() => onDelete(item.id)} aria-label={`Delete ${title}`}>Delete</motion.button>}
    </div>
  </motion.div>
}

function TransactionForm({ saving, onSave, onCancel }) {
  const bounds = transactionDateBounds()
  const [draft, setDraft] = useState({ type: 'procurement', amount: '', note: '', transactionDate: bounds.max })

  const submit = event => {
    event.preventDefault()
    const amount = Number(draft.amount)
    if (!Number.isFinite(amount) || amount <= 0) return toast.error('Enter an amount greater than zero')
    if (!isTransactionDateAllowed(draft.transactionDate)) return toast.error(`Choose a date from ${bounds.min} through today`)
    onSave({ ...draft, amount, note: draft.note.trim() })
  }

  return <motion.form initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="finance-entry-form finance-entry-page" onSubmit={submit}>
    <div className="finance-entry-form-heading"><h3>New transaction</h3></div>
    <fieldset className="finance-type-picker">
      <legend>Transaction type</legend>
      {Object.entries(MANUAL_TRANSACTION_TYPES).map(([value, type]) => <button key={value} type="button" className={draft.type === value ? `is-active finance-choice-${type.tone}` : ''} onClick={() => setDraft(current => ({ ...current, type: value }))}>{type.label}</button>)}
    </fieldset>
    <div className="finance-entry-fields">
      <label>Transaction date<input type="date" min={bounds.min} max={bounds.max} value={draft.transactionDate} onChange={event => setDraft(value => ({ ...value, transactionDate: event.target.value }))} required /></label>
      <label>Amount (₹)<input className="no-spinner" type="number" min="0.01" step="0.01" inputMode="decimal" value={draft.amount} onChange={event => setDraft(value => ({ ...value, amount: event.target.value }))} placeholder="0.00" autoFocus required /></label>
      <label className="finance-note-field">Description <span>(optional)</span><input value={draft.note} maxLength={120} onChange={event => setDraft(value => ({ ...value, note: event.target.value }))} /></label>
    </div>
    <div className="finance-entry-actions"><button type="button" onClick={onCancel}>Cancel</button><motion.button whileTap={press} type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save transaction'}</motion.button></div>
  </motion.form>
}

function DailyFlow({ entries, orders }) {
  const pointMap = new Map()
  const pointFor = item => {
    const key = localDateKey(entryDate(item))
    if (!key) return null
    if (!pointMap.has(key)) pointMap.set(key, { key, date: asDate(key).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }), earned: 0, procurement: 0 })
    return pointMap.get(key)
  }
  orders.filter(order => order.status === 'paid').forEach(order => { const point = pointFor(order); if (point) point.earned += Number(order.total || 0) })
  entries.forEach(entry => { if (entry.type === 'procurement' || entry.type === 'spent' || (!entry.type && Number(entry.spent || 0))) { const point = pointFor(entry); if (point) point.procurement += Number(entry.amount || entry.procurement || entry.spent || 0) } })
  const points = [...pointMap.values()].sort((a, b) => a.key.localeCompare(b.key)).slice(-10)
  const ceiling = Math.max(1, ...points.flatMap(point => [point.earned, point.procurement]))

  return <section className="finance-panel finance-flow-panel">
    <div className="finance-panel-heading"><h3>Daily flow</h3><div className="finance-flow-legend"><span className="is-earned">Earned</span><span className="is-cost">Procurement</span></div></div>
    {points.length ? <div className="finance-flow-chart" aria-label="Daily earned and procurement chart">
      {points.map(point => <div className="finance-flow-day" key={point.key} tabIndex="0">
        <div className="finance-flow-tooltip"><strong>{point.date}</strong><span>Procurement: {money(point.procurement)}</span><span>Earned: {money(point.earned)}</span></div>
        <div className="finance-flow-bars"><i className="is-earned" style={{ height: `${Math.max(point.earned ? 8 : 0, (point.earned / ceiling) * 100)}%` }} /><i className="is-cost" style={{ height: `${Math.max(point.procurement ? 8 : 0, (point.procurement / ceiling) * 100)}%` }} /></div>
        <span>{point.date}</span>
      </div>)}
    </div> : <div className="finance-chart-empty">No data</div>}
  </section>
}

function TransactionMix({ totals }) {
  const data = [
    { label: 'Procurement', value: totals.procurement, color: '#f87171' },
    { label: 'Refunds', value: totals.refund, color: '#f5c842' },
    { label: 'Cashback', value: totals.cashback, color: '#2ecc71' },
    { label: 'Self use', value: totals.self, color: '#f08a5d' },
  ].filter(item => item.value > 0)
  const total = data.reduce((sum, item) => sum + item.value, 0)
  let cursor = 0
  const stops = data.map(item => {
    const start = cursor
    cursor += (item.value / total) * 100
    return `${item.color} ${start}% ${cursor}%`
  }).join(', ')

  return <section className="finance-panel finance-mix-panel">
    <div className="finance-panel-heading"><h3>Transaction mix</h3></div>
    {data.length ? <div className="finance-mix-content">
      <div className="finance-donut" style={{ background: `conic-gradient(${stops})` }}><span>{money(total)}</span></div>
      <div className="finance-mix-list">{data.map(item => <div key={item.label}><span><i style={{ background: item.color }} />{item.label}</span><strong>{money(item.value)}</strong></div>)}</div>
    </div> : <div className="finance-chart-empty">No data</div>}
  </section>
}

function PeriodPicker({ period, options, onChange, count }) {
  return <div className="finance-period-bar"><span>{count} transaction{count === 1 ? '' : 's'}</span><select value={period} onChange={event => onChange(event.target.value)} aria-label="Finance month">{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
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
    try { await addDoc(collection(db, 'ledger'), { ...transaction, createdAt: serverTimestamp() }); toast.success('Transaction saved') }
    catch (err) { toast.error(`Failed: ${err.message}`); throw err }
    finally { setSaving(false) }
  }

  const deleteEntry = async id => {
    if (!confirm('Delete this finance entry?')) return
    try { await deleteDoc(doc(db, 'ledger', id)); toast.success('Entry deleted') }
    catch (err) { toast.error(`Delete failed: ${err.message}`) }
  }

  return <LedgerView {...{ entries, orders, saving, addEntry, deleteEntry }} />
}

export function LedgerView({ entries, orders = [], saving = false, addEntry, deleteEntry }) {
  const currentMonth = transactionDateBounds().max.slice(0, 7)
  const [activeView, setActiveView] = useState('dashboard')
  const [period, setPeriod] = useState(currentMonth)
  const [historyType, setHistoryType] = useState('all')

  const periodOptions = useMemo(() => {
    const values = new Set([currentMonth])
    entries.forEach(entry => { const value = monthKey(entry); if (value) values.add(value) })
    orders.filter(order => order.status === 'paid').forEach(order => { const value = monthKey(order); if (value) values.add(value) })
    return [{ value: 'all', label: 'All time' }, ...[...values].sort().reverse().map(value => ({ value, label: asDate(`${value}-01`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }) }))]
  }, [currentMonth, entries, orders])

  const selectedEntries = useMemo(() => period === 'all' ? entries : entries.filter(entry => monthKey(entry) === period), [entries, period])
  const selectedOrders = useMemo(() => {
    const paid = orders.filter(order => order.status === 'paid')
    return period === 'all' ? paid : paid.filter(order => monthKey(order) === period)
  }, [orders, period])
  const totals = useMemo(() => financeTotals(selectedEntries, selectedOrders), [selectedEntries, selectedOrders])
  const activity = useMemo(() => buildActivity(selectedEntries, selectedOrders), [selectedEntries, selectedOrders])
  const transactionCount = selectedEntries.length + selectedOrders.length
  const history = historyType === 'all' ? activity : activity.filter(item => (item.kind === 'daily-sales' ? 'sale' : item.type === 'spent' ? 'procurement' : item.type) === historyType)

  const saveEntry = async transaction => {
    try {
      await addEntry(transaction)
      setPeriod(transaction.transactionDate.slice(0, 7))
      setActiveView('dashboard')
    } catch { /* Keep the form visible for retry. */ }
  }

  return <div className="finance-ledger">
    <div className="finance-overview-heading"><div><span className="eyebrow">FINANCE</span><h2>Shop money</h2></div></div>
    <nav className="finance-view-tabs" aria-label="Finance sections">
      {[['dashboard', 'Dashboard'], ['add', 'Add'], ['history', 'History']].map(([value, label]) => <button type="button" key={value} className={activeView === value ? 'is-active' : ''} onClick={() => setActiveView(value)}>{label}</button>)}
    </nav>

    {activeView === 'dashboard' && <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <PeriodPicker period={period} options={periodOptions} onChange={setPeriod} count={transactionCount} />
      <div className="finance-stats">
        <StatBox label="Profit" value={`${totals.profit >= 0 ? '+' : '−'}${money(Math.abs(totals.profit))}`} tone={totals.profit >= 0 ? 'success' : 'danger'} />
        <StatBox label="Earned sales" value={money(totals.sales)} tone="success" />
        <StatBox label="Procurement" value={money(totals.procurement)} tone="danger" />
        <StatBox label="Transactions" value={transactionCount} tone="accent" />
      </div>
      <div className="finance-self-strip"><div><span>Self use</span><strong>{money(totals.self)}</strong></div></div>
      <div className="finance-dashboard-grid"><DailyFlow entries={selectedEntries} orders={selectedOrders} /><TransactionMix totals={totals} /></div>
      <section className="finance-recent-panel">
        <div className="finance-section-heading"><h3>Recent transactions</h3>{activity.length > 5 && <button type="button" onClick={() => setActiveView('history')}>View all</button>}</div>
        <div className="finance-activity-list">{activity.length ? <AnimatePresence initial={false}>{activity.slice(0, 5).map(item => <ActivityRow key={`${item.kind}-${item.id}`} item={item} onDelete={deleteEntry} />)}</AnimatePresence> : <div className="finance-empty"><strong>No transactions</strong></div>}</div>
      </section>
    </motion.div>}

    {activeView === 'add' && <TransactionForm saving={saving} onSave={saveEntry} onCancel={() => setActiveView('dashboard')} />}

    {activeView === 'history' && <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <PeriodPicker period={period} options={periodOptions} onChange={setPeriod} count={transactionCount} />
      <div className="finance-history-filters">{[['all', 'All'], ['sale', 'Earned'], ['procurement', 'Procurement'], ['refund', 'Refunds'], ['cashback', 'Cashback'], ['self', 'Self use']].map(([value, label]) => <button type="button" key={value} className={historyType === value ? 'is-active' : ''} onClick={() => setHistoryType(value)}>{label}</button>)}</div>
      <div className="finance-activity-list">{history.length ? <AnimatePresence initial={false}>{history.map(item => <ActivityRow key={`${item.kind}-${item.id}`} item={item} onDelete={deleteEntry} />)}</AnimatePresence> : <div className="finance-empty"><strong>No transactions</strong></div>}</div>
    </motion.div>}
  </div>
}

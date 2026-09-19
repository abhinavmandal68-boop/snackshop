import { useMemo, useState, useEffect } from 'react'
import { Wallet, Plus, Trash2, TrendingUp, TrendingDown, ShoppingBag, X, Search } from 'lucide-react'
import toast from 'react-hot-toast'
import { collection, onSnapshot, addDoc, deleteDoc, doc, orderBy, query, serverTimestamp } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { motion, AnimatePresence } from 'framer-motion'
import { press } from '../lib/motion'

export const TRANSACTION_TYPES = {
  spent: { label: 'Stock purchase', shortLabel: 'Spent', tone: 'danger' },
  earned: { label: 'Other income', shortLabel: 'Income', tone: 'success' },
  self: { label: 'Self-use', shortLabel: 'Self', tone: 'info' },
  refund: { label: 'Refund', shortLabel: 'Refund', tone: 'warning' },
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

const entryDate = entry => asDate(entry.transactionDate || entry.createdAt)

export function financeTotals(entries, orders) {
  const totals = { sales: 0, spent: 0, earned: 0, self: 0, refund: 0 }

  orders.filter(order => order.status === 'paid').forEach(order => {
    totals.sales += Number(order.total || 0)
  })

  entries.forEach(entry => {
    if (entry.type && TRANSACTION_TYPES[entry.type]) {
      totals[entry.type] += Number(entry.amount || 0)
      return
    }
    totals.spent += Number(entry.spent || 0)
    totals.earned += Number(entry.earned || 0)
    totals.self += Number(entry.self || 0)
    totals.refund += Number(entry.refund || 0)
  })

  totals.income = totals.sales + totals.earned
  totals.profit = totals.income - totals.spent - totals.refund
  return totals
}

function StatBox({ label, value, color, hint }) {
  return (
    <div className="finance-stat-box">
      <div className="finance-stat-label">{label}</div>
      <div className="finance-stat-value" style={{ color: color || 'var(--text)' }}>{value}</div>
      {hint && <div className="finance-stat-hint">{hint}</div>}
    </div>
  )
}

function TypeBadge({ type }) {
  const meta = TRANSACTION_TYPES[type] || { shortLabel: 'Legacy', tone: 'neutral' }
  return <span className={`finance-type-badge finance-type-${meta.tone}`}>{meta.shortLabel}</span>
}

function ActivityRow({ item, onDelete }) {
  const date = entryDate(item)
  const isSale = item.kind === 'sale'
  const legacyValues = !item.type && !isSale
    ? Object.keys(TRANSACTION_TYPES).filter(type => Number(item[type] || 0) > 0)
    : []
  const amount = isSale ? Number(item.total || 0) : Number(item.amount || 0)
  const positive = isSale || item.type === 'earned'
  const title = isSale
    ? item.customerName || 'Customer order'
    : item.note || (item.type ? TRANSACTION_TYPES[item.type]?.label : 'Imported ledger entry')
  const details = isSale
    ? (item.items || []).map(product => `${product.name} ×${product.qty}`).join(', ')
    : item.type ? TRANSACTION_TYPES[item.type]?.label : 'Older spreadsheet-style entry'

  return (
    <motion.div layout initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} className="finance-activity-row">
      <div className={`finance-activity-icon ${isSale ? 'is-sale' : ''}`}>
        {isSale ? <ShoppingBag size={16} /> : <Wallet size={16} />}
      </div>
      <div className="finance-activity-copy">
        <div className="finance-activity-heading">
          <strong>{title}</strong>
          {isSale ? <span className="finance-type-badge finance-type-success">Sale</span> : item.type && <TypeBadge type={item.type} />}
        </div>
        <p>{details || 'No details added'}</p>
        <time dateTime={date.toISOString()}>{date.getTime() ? date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Date unavailable'}</time>
      </div>
      <div className="finance-activity-values">
        {legacyValues.length > 0 ? (
          <div className="finance-legacy-values">
            {legacyValues.map(type => <span key={type}><TypeBadge type={type} /> <strong>{money(item[type])}</strong></span>)}
          </div>
        ) : (
          <strong className={positive ? 'is-positive' : 'is-negative'}>{positive ? '+' : '−'}{money(amount)}</strong>
        )}
        {!isSale && (
          <motion.button whileTap={press} type="button" onClick={() => onDelete(item.id)} aria-label={`Delete ${title}`}>
            <Trash2 size={14} /> <span>Delete</span>
          </motion.button>
        )}
      </div>
    </motion.div>
  )
}

function TransactionForm({ saving, onSave, onClose }) {
  const today = new Date().toLocaleDateString('en-CA')
  const [draft, setDraft] = useState({ type: 'spent', amount: '', note: '', transactionDate: today })

  const submit = event => {
    event.preventDefault()
    const amount = Number(draft.amount)
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Enter an amount greater than zero')
      return
    }
    if (!draft.note.trim()) {
      toast.error('Add a short description so you remember what this was for')
      return
    }
    onSave({ ...draft, amount, note: draft.note.trim() })
  }

  return (
    <motion.form initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="finance-entry-form" onSubmit={submit}>
      <div className="finance-entry-form-heading">
        <div><span className="eyebrow">NEW TRANSACTION</span><h3>What changed?</h3></div>
        <button type="button" onClick={onClose} aria-label="Close transaction form"><X size={17} /></button>
      </div>
      <div className="finance-entry-fields">
        <label>Type<select value={draft.type} onChange={event => setDraft(value => ({ ...value, type: event.target.value }))}>
          {Object.entries(TRANSACTION_TYPES).map(([value, type]) => <option key={value} value={value}>{type.label}</option>)}
        </select></label>
        <label>Amount (₹)<input className="no-spinner" type="number" min="0.01" step="0.01" inputMode="decimal" value={draft.amount} onChange={event => setDraft(value => ({ ...value, amount: event.target.value }))} placeholder="0" autoFocus /></label>
        <label>Date<input type="date" value={draft.transactionDate} onChange={event => setDraft(value => ({ ...value, transactionDate: event.target.value }))} /></label>
        <label className="finance-note-field">Description<input value={draft.note} onChange={event => setDraft(value => ({ ...value, note: event.target.value }))} placeholder="e.g. Wholesale chips restock" /></label>
      </div>
      <div className="finance-entry-actions">
        <button type="button" onClick={onClose}>Cancel</button>
        <motion.button whileTap={press} type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save transaction'}</motion.button>
      </div>
    </motion.form>
  )
}

export default function Ledger({ orders = [] }) {
  const [entries, setEntries] = useState([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'ledger'), orderBy('createdAt', 'desc')),
      snap => setEntries(snap.docs.map(entry => ({ id: entry.id, ...entry.data() }))),
      err => console.error('Ledger error:', err)
    )
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
    } finally {
      setSaving(false)
    }
  }

  const deleteEntry = async id => {
    if (!confirm('Delete this finance entry?')) return
    try {
      await deleteDoc(doc(db, 'ledger', id))
      toast.success('Entry deleted')
    } catch (err) {
      toast.error(`Delete failed: ${err.message}`)
    }
  }

  return <LedgerView {...{ entries, orders, saving, addEntry, deleteEntry }} />
}

export function LedgerView({ entries, orders = [], saving = false, addEntry, deleteEntry }) {
  const [showForm, setShowForm] = useState(false)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const totals = useMemo(() => financeTotals(entries, orders), [entries, orders])

  const activity = useMemo(() => [
    ...orders.filter(order => order.status === 'paid').map(order => ({ ...order, kind: 'sale' })),
    ...entries.map(entry => ({ ...entry, kind: 'ledger' })),
  ].sort((a, b) => entryDate(b) - entryDate(a)), [entries, orders])

  const visibleActivity = activity.filter(item => {
    const itemType = item.kind === 'sale' ? 'sale' : item.type || 'legacy'
    if (filter !== 'all' && filter !== itemType) return false
    const haystack = [item.customerName, item.note, ...(item.items || []).map(product => product.name)].filter(Boolean).join(' ').toLowerCase()
    return haystack.includes(search.trim().toLowerCase())
  })

  const saveEntry = async transaction => {
    try {
      await addEntry(transaction)
      setShowForm(false)
    } catch {
      // Keep the form open so the transaction can be retried.
    }
  }

  return (
    <div className="finance-ledger">
      <div className="finance-overview-heading">
        <div><span className="eyebrow">MONEY IN, MONEY OUT</span><h2>Know what the shop is making.</h2><p>Sales come from paid orders automatically. Record purchases, refunds and self-use below.</p></div>
        <motion.button whileTap={press} onClick={() => setShowForm(value => !value)} className="finance-add-button"><Plus size={15} /> Add transaction</motion.button>
      </div>

      <div className="finance-stats">
        <StatBox label="Sales from orders" value={money(totals.sales)} color="var(--success)" hint="Automatic" />
        <StatBox label="Stock spending" value={money(totals.spent)} color="var(--danger)" hint="Money out" />
        <StatBox label="Cash profit" value={`${totals.profit >= 0 ? '+' : '−'}${money(Math.abs(totals.profit))}`} color={totals.profit >= 0 ? 'var(--accent)' : 'var(--danger)'} hint="Income − spending − refunds" />
        <StatBox label="Self-use" value={money(totals.self)} hint="Tracked separately" />
      </div>

      <AnimatePresence>{showForm && <TransactionForm saving={saving} onSave={saveEntry} onClose={() => setShowForm(false)} />}</AnimatePresence>

      <div className="finance-section-heading">
        <div><h3>Activity</h3><p>{visibleActivity.length} of {activity.length} records</p></div>
        <label className="finance-search"><Search size={15} /><input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search finance activity" aria-label="Search finance activity" /></label>
      </div>
      <div className="finance-filters" aria-label="Filter finance activity">
        {[['all', 'All'], ['sale', 'Sales'], ['spent', 'Spent'], ['earned', 'Other income'], ['self', 'Self-use'], ['refund', 'Refunds']].map(([value, label]) => (
          <button key={value} type="button" className={filter === value ? 'is-active' : ''} onClick={() => setFilter(value)}>{label}</button>
        ))}
      </div>

      <div className="finance-activity-list">
        {visibleActivity.length === 0 ? (
          <div className="finance-empty"><Wallet size={24} /><strong>No matching activity</strong><p>Try another filter, or add the first transaction.</p></div>
        ) : (
          <AnimatePresence initial={false}>{visibleActivity.map(item => <ActivityRow key={`${item.kind}-${item.id}`} item={item} onDelete={deleteEntry} />)}</AnimatePresence>
        )}
      </div>

      <div className="finance-footnote"><TrendingUp size={14} /><span>Other income: {money(totals.earned)}</span><TrendingDown size={14} /><span>Refunds: {money(totals.refund)}</span></div>
    </div>
  )
}

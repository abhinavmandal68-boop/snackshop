import { useState, useEffect } from 'react'
import { Wallet, Plus, Trash2, TrendingUp, TrendingDown } from 'lucide-react'
import toast from 'react-hot-toast'
import {
  collection, onSnapshot, addDoc, updateDoc, deleteDoc,
  doc, serverTimestamp,
} from 'firebase/firestore'
import { db, auth } from '../lib/firebase'

function StatBox({ label, value, color }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '12px 14px', minWidth: 0 }}>
      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
      <div style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 18, color: color || 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</div>
    </div>
  )
}

// A single number input that only writes to Firestore on blur / Enter,
// so typing doesn't spam the database on every keystroke.
function LiveNumberField({ value, onCommit, placeholder }) {
  const [local, setLocal] = useState(value ?? '')

  useEffect(() => { setLocal(value ?? '') }, [value])

  const commit = () => {
    const num = local === '' ? 0 : Number(local)
    if (!isNaN(num) && num !== value) onCommit(num)
  }

  return (
    <input
      type="number"
      inputMode="decimal"
      value={local}
      placeholder={placeholder}
      onChange={e => setLocal(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') { commit(); e.target.blur() } }}
      style={{ fontSize: 14, padding: '8px 10px', textAlign: 'right' }}
    />
  )
}

function EntryCard({ entry, onUpdate, onDelete }) {
  const profit = (entry.earned || 0) - (entry.spent || 0)

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 10 }}>
        <div>
          <label style={{ fontSize: 10, color: 'var(--text-hint)', display: 'block', marginBottom: 3 }}>Spent</label>
          <LiveNumberField value={entry.spent} onCommit={v => onUpdate(entry.id, { spent: v })} placeholder="0" />
        </div>
        <div>
          <label style={{ fontSize: 10, color: 'var(--text-hint)', display: 'block', marginBottom: 3 }}>Earned</label>
          <LiveNumberField value={entry.earned} onCommit={v => onUpdate(entry.id, { earned: v })} placeholder="0" />
        </div>
        <div>
          <label style={{ fontSize: 10, color: 'var(--text-hint)', display: 'block', marginBottom: 3 }}>SELF</label>
          <LiveNumberField value={entry.self} onCommit={v => onUpdate(entry.id, { self: v })} placeholder="0" />
        </div>
      </div>

      <input
        value={entry.note || ''}
        onChange={e => onUpdate(entry.id, { note: e.target.value })}
        placeholder="Note (optional) — e.g. Oreo restock, Diwali order..."
        style={{ fontSize: 12, padding: '7px 10px', marginBottom: 10 }}
      />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, color: profit >= 0 ? 'var(--success)' : 'var(--danger)' }}>
          {profit >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
          {profit >= 0 ? '+' : ''}₹{profit} profit
        </div>
        <button
          onClick={() => onDelete(entry.id)}
          style={{ background: 'var(--danger-dim)', border: 'none', borderRadius: 6, padding: '5px 9px', color: 'var(--danger)', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}
        >
          <Trash2 size={11} /> Delete
        </button>
      </div>
    </div>
  )
}

export default function Ledger() {
  const [entries, setEntries] = useState([])
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    // Wait for Firebase Auth to restore the signed-in admin before reading
    // the admin-only ledger collection.
    let stopLedger = () => {}

    const stopAuth = auth.onAuthStateChanged(user => {
      if (!user) return

      stopLedger()
      stopLedger = onSnapshot(
        collection(db, 'ledger'),
        snap => {
          const data = snap.docs.map(d => ({ id: d.id, ...d.data() }))
          data.sort((a, b) => {
            const aTime = a.createdAt?.toMillis?.() ?? a.createdAt?.seconds * 1000 ?? new Date(a.createdAt || 0).getTime()
            const bTime = b.createdAt?.toMillis?.() ?? b.createdAt?.seconds * 1000 ?? new Date(b.createdAt || 0).getTime()
            return bTime - aTime
          })
          setEntries(data)
        },
        err => console.error('Ledger error:', err)
      )
    })

    return () => {
      stopLedger()
      stopAuth()
    }
  }, [])

  const addEntry = async () => {
    setAdding(true)
    try {
      await addDoc(collection(db, 'ledger'), {
        spent: 0,
        earned: 0,
        self: 0,
        note: '',
        createdAt: serverTimestamp(),
      })
    } catch (err) {
      toast.error(`Failed: ${err.message}`)
    }
    setAdding(false)
  }

  const updateEntry = async (id, patch) => {
    try {
      await updateDoc(doc(db, 'ledger', id), patch)
    } catch (err) {
      toast.error(`Save failed: ${err.message}`)
    }
  }

  const deleteEntry = async (id) => {
    if (!confirm('Delete this entry?')) return
    await deleteDoc(doc(db, 'ledger', id))
    toast.success('Entry deleted')
  }

  const totalSpent = entries.reduce((s, e) => s + (e.spent || 0), 0)
  const totalEarned = entries.reduce((s, e) => s + (e.earned || 0), 0)
  const totalSelf = entries.reduce((s, e) => s + (e.self || 0), 0)
  const profit = totalEarned - totalSpent

  return (
    <div>
      {/* Totals */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10, marginBottom: 20 }}>
        <StatBox label="Total spent" value={`₹${totalSpent}`} color="var(--danger)" />
        <StatBox label="Total earned" value={`₹${totalEarned}`} color="var(--success)" />
        <StatBox label="Profit" value={`${profit >= 0 ? '+' : ''}₹${profit}`} color={profit >= 0 ? 'var(--accent)' : 'var(--danger)'} />
        <StatBox label="SELF total" value={`₹${totalSelf}`} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{entries.length} entr{entries.length === 1 ? 'y' : 'ies'}</p>
        <button
          onClick={addEntry}
          disabled={adding}
          style={{ padding: '9px 18px', background: 'var(--accent)', color: 'var(--accent-text)', border: 'none', borderRadius: 10, fontFamily: 'Syne', fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, opacity: adding ? 0.6 : 1 }}
        >
          <Plus size={14} /> Add entry
        </button>
      </div>

      {entries.length === 0 ? (
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-hint)', fontSize: 14, background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
          No entries yet — tap "Add entry" to start tracking.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {entries.map(e => (
            <EntryCard key={e.id} entry={e} onUpdate={updateEntry} onDelete={deleteEntry} />
          ))}
        </div>
      )}
    </div>
  )
}
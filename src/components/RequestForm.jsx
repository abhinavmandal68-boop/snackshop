import { useState, useEffect } from 'react'
import { MessageSquare, Send, Clock, Loader, CheckCircle, ChevronDown, ChevronUp } from 'lucide-react'
import toast from 'react-hot-toast'
import { collection, addDoc, serverTimestamp, query, where, onSnapshot, orderBy } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuth } from '../lib/AuthContext'

const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000

// ── Status config (mirrors AdminPage.jsx REQUEST_STATUSES) ────────
const REQUEST_STATUSES = {
  pending:     { label: 'Pending',     color: 'var(--warning)',  dim: 'var(--warning-dim)',  Icon: Clock,       hint: 'We received your request and will look into it soon.' },
  in_progress: { label: 'In Progress', color: 'var(--accent)',   dim: 'var(--accent-dim)',   Icon: Loader,      hint: "We're working on sourcing this for you!" },
  completed:   { label: 'Completed',   color: 'var(--success)',  dim: 'var(--success-dim)',  Icon: CheckCircle, hint: 'Your request has been fulfilled. Check the shop!' },
}

function StatusBadge({ status }) {
  const cfg = REQUEST_STATUSES[status] || REQUEST_STATUSES.pending
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

function RequestCard({ r }) {
  const status = r.status || (r.resolved ? 'completed' : 'pending')
  const cfg = REQUEST_STATUSES[status] || REQUEST_STATUSES.pending
  const isFulfilled = status === 'completed'

  return (
    <div style={{
      background: isFulfilled ? 'rgba(46,204,113,0.08)' : 'var(--surface2)',
      border: `1px solid ${status === 'in_progress' ? 'rgba(245,200,66,0.25)' : isFulfilled ? 'rgba(46,204,113,0.4)' : 'var(--border)'}`,
      boxShadow: isFulfilled ? '0 0 0 1px rgba(46,204,113,0.15)' : 'none',
      borderRadius: 10,
      padding: '12px 14px',
      transition: 'border-color 0.3s',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', flex: 1, lineHeight: 1.4, margin: 0 }}>{r.message}</p>
        <StatusBadge status={status} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
        <span style={{ fontSize: 11, color: 'var(--text-hint)' }}>
          {r.createdAt?.toDate?.()?.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) || '—'}
        </span>
        <span style={{ fontSize: 11, color: cfg.color, fontStyle: 'italic', fontWeight: isFulfilled ? 700 : 400 }}>{cfg.hint}</span>
      </div>
    </div>
  )
}

export default function RequestForm() {
  const { user, profile } = useAuth()
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [myRequests, setMyRequests] = useState([])
  const [historyOpen, setHistoryOpen] = useState(true)

  // Live-subscribe to this user's own requests, newest first.
  // Also watch for a request just flipping to 'completed' so we can
  // surface it immediately (toast + auto-open the history panel) instead
  // of it silently sitting there until the customer happens to check.
  useEffect(() => {
    if (!user?.uid) return
    const q = query(
      collection(db, 'requests'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    )
    const unsub = onSnapshot(q, snap => {
      const justCompleted = snap.docChanges().some(change =>
        change.type === 'modified' && change.doc.data().status === 'completed'
      )
      if (justCompleted) {
        toast.success('🎉 Your requested item is back in stock!', { duration: 5000 })
        setHistoryOpen(true)
      }

      const now = Date.now()
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }))

      // Pending/in-progress requests stay visible indefinitely — only
      // completed ones age out, 2 days after they were fulfilled (falling
      // back to createdAt for older requests marked complete before this
      // field existed).
      const visible = all.filter(r => {
        const status = r.status || (r.resolved ? 'completed' : 'pending')
        if (status !== 'completed') return true
        const completedAt = r.completedAt?.toDate?.() || r.createdAt?.toDate?.()
        if (!completedAt) return true // still resolving, show it for now
        return now - completedAt.getTime() < TWO_DAYS_MS
      })

      // Surface freshly-fulfilled requests at the top so a customer doesn't
      // have to scroll past newer pending requests to spot good news.
      visible.sort((a, b) => {
        const aDone = (a.status || (a.resolved ? 'completed' : 'pending')) === 'completed' ? 0 : 1
        const bDone = (b.status || (b.resolved ? 'completed' : 'pending')) === 'completed' ? 0 : 1
        if (aDone !== bDone) return aDone - bDone
        return 0 // preserve existing createdAt-desc order within each group
      })

      setMyRequests(visible)
    }, err => console.error('Requests listener:', err))
    return unsub
  }, [user?.uid])

  const handleSend = async () => {
    if (!message.trim()) { toast.error('Write your request first'); return }
    setSending(true)
    try {
      await addDoc(collection(db, 'requests'), {
        userId: user.uid,
        customerName: profile?.name || profile?.email?.split('@')[0] || 'Customer',
        message: message.trim(),
        status: 'pending',
        resolved: false,
        createdAt: serverTimestamp(),
      })
      toast.success('Request sent!')
      setMessage('')
      setHistoryOpen(true)
    } catch (err) {
      toast.error(`Failed: ${err.message}`)
    }
    setSending(false)
  }

  const openCount = myRequests.filter(r => {
    const s = r.status || (r.resolved ? 'completed' : 'pending')
    return s !== 'completed'
  }).length

  const fulfilledCount = myRequests.length - openCount

  return (
    <div style={{ marginTop: 36 }}>
      {/* Section header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <MessageSquare size={15} color="var(--text-secondary)" />
        <span style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 15 }}>Request a snack</span>
        <span style={{ fontSize: 12, color: 'var(--text-hint)' }}>Can't find something? Let us know</span>
      </div>

      {/* Compose box */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 16 }}>
        <textarea
          value={message}
          onChange={e => setMessage(e.target.value)}
          placeholder="e.g. Haldiram's Aloo Bhujia 400g, or any Oreo flavour…"
          rows={3}
          style={{ width: '100%', resize: 'vertical', fontSize: 13, lineHeight: 1.5, padding: '10px 12px', borderRadius: 8, boxSizing: 'border-box' }}
          onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSend() }}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
          <button
            onClick={handleSend}
            disabled={sending || !message.trim()}
            style={{
              padding: '9px 20px', background: sending || !message.trim() ? 'var(--surface2)' : 'var(--accent)',
              color: sending || !message.trim() ? 'var(--text-hint)' : 'var(--accent-text)',
              border: 'none', borderRadius: 10, fontFamily: 'Syne', fontWeight: 700, fontSize: 13,
              display: 'flex', alignItems: 'center', gap: 6, cursor: sending ? 'not-allowed' : 'pointer',
              transition: 'all 0.15s',
            }}
          >
            <Send size={13} /> {sending ? 'Sending…' : 'Send request'}
          </button>
        </div>
      </div>

      {/* My requests history */}
      {myRequests.length > 0 && (
        <div style={{ marginTop: 16 }}>
          {/* Collapsible header */}
          <button
            onClick={() => setHistoryOpen(o => !o)}
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'none', border: 'none', padding: '6px 0', cursor: 'pointer', marginBottom: 8 }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 13, color: 'var(--text-secondary)' }}>My requests</span>
              {openCount > 0 && (
                <span style={{ background: 'var(--accent)', color: 'var(--accent-text)', borderRadius: 100, padding: '1px 8px', fontSize: 11, fontWeight: 700 }}>
                  {openCount} active
                </span>
              )}
              {fulfilledCount > 0 && (
                <span style={{ background: 'var(--success)', color: '#fff', borderRadius: 100, padding: '1px 8px', fontSize: 11, fontWeight: 700 }}>
                  {fulfilledCount} ready 🎉
                </span>
              )}
            </div>
            {historyOpen
              ? <ChevronUp size={14} color="var(--text-hint)" />
              : <ChevronDown size={14} color="var(--text-hint)" />
            }
          </button>

          {historyOpen && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {myRequests.map(r => <RequestCard key={r.id} r={r} />)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
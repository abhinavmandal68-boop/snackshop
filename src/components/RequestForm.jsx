import { useState } from 'react'
import { Send, MessageSquarePlus } from 'lucide-react'
import toast from 'react-hot-toast'
import { collection, addDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../lib/firebase'

export default function RequestForm() {
  const [name, setName] = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [open, setOpen] = useState(false)

  const handleSend = async () => {
    if (!message.trim()) { toast.error('Please describe what you want'); return }
    setSending(true)
    try {
      await addDoc(collection(db, 'requests'), {
        customerName: name.trim() || 'Anonymous',
        message: message.trim(),
        resolved: false,
        createdAt: serverTimestamp(),
      })
      toast.success('Request sent to admin!')
      setName(''); setMessage(''); setOpen(false)
    } catch {
      toast.error('Could not send request')
    }
    setSending(false)
  }

  return (
    <div style={{ marginTop: 32 }}>
      <button onClick={() => setOpen(o => !o)} style={{ width: '100%', padding: '12px 20px', background: 'var(--surface)', border: '1px dashed var(--border-hover)', borderRadius: 'var(--radius)', color: 'var(--text-secondary)', fontSize: 14, display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
        <MessageSquarePlus size={16} /> Want something specific? Request it from admin
      </button>
      {open && (
        <div style={{ marginTop: 12, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 16, animation: 'fadeIn 0.2s ease' }}>
          <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(-8px) } to { opacity: 1; transform: none } }`}</style>
          <p style={{ fontFamily: 'Syne', fontWeight: 600, marginBottom: 12, fontSize: 14 }}>Request a snack</p>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Your name (optional)" style={{ marginBottom: 8 }} />
          <textarea value={message} onChange={e => setMessage(e.target.value)} placeholder="e.g. Haldiram's Bhujia, Parle-G big pack..." rows={3} style={{ resize: 'none', marginBottom: 10 }} />
          <button onClick={handleSend} disabled={sending} style={{ width: '100%', padding: 10, borderRadius: 8, background: 'var(--accent)', color: 'var(--accent-text)', fontFamily: 'Syne', fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <Send size={13} /> {sending ? 'Sending...' : 'Send request'}
          </button>
        </div>
      )}
    </div>
  )
}

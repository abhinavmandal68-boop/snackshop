import { useEffect, useRef, useState } from 'react'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { shopApi } from '../lib/shopApi'
import { canEditLoanNote } from '../lib/loanOrderNotes.mjs'
import { motion } from 'framer-motion'
import { press } from '../lib/motion'

export default function LoanOrderNote({ order, processing, onSaved }) {
  const [eligible, setEligible] = useState(() => canEditLoanNote(order))
  const [note, setNote] = useState(order.loanNote || '')
  const [savedNote, setSavedNote] = useState(order.loanNote || '')
  const previousSaved = useRef(order.loanNote || '')
  const savingRef = useRef(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const latest = order.loanNote || ''
    const previous = previousSaved.current
    setNote(draft => draft === previous ? latest : draft)
    previousSaved.current = latest
    setSavedNote(latest)
  }, [order.loanNote])

  useEffect(() => {
    let active = true
    setEligible(canEditLoanNote(order))
    if (order.status === 'loaned' && order.paymentMethod === 'cash' && !canEditLoanNote(order) && order.userId) {
      // Older orders only store a UID/name. Resolve their existing profile.
      getDoc(doc(db, 'users', order.userId)).then(snapshot => {
        if (active) setEligible(canEditLoanNote(order, snapshot.data() || {}))
      }).catch(err => console.warn('Could not check loan note account:', err.code))
    }
    return () => { active = false }
  }, [order.userId, order.customerName, order.customerEmail, order.status, order.paymentMethod])

  const save = async event => {
    event.preventDefault()
    if (savingRef.current || processing) return
    savingRef.current = true
    setSaving(true)
    setError('')
    setSaved(false)
    try {
      const result = await shopApi('saveLoanNote', { orderId: order.id, note })
      previousSaved.current = result.loanNote
      setNote(result.loanNote)
      setSavedNote(result.loanNote)
      onSaved?.(order.id, result.loanNote)
      setSaved(true)
    } catch (err) {
      setError(err.message || 'Could not save the note. Please try again.')
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  if (!eligible) return order.loanNote
    ? <p className="order-loan-note-summary"><strong>Ordered for:</strong> {order.loanNote}</p>
    : null

  return <form className="order-loan-note" onSubmit={save}>
    <label htmlFor={`loan-note-${order.id}`}>Ordered for <span>(optional)</span></label>
    <textarea id={`loan-note-${order.id}`} rows={2} maxLength={300} value={note}
      placeholder="Name of the person who ordered"
      disabled={saving || processing}
      onChange={event => { setNote(event.target.value); setSaved(false); setError('') }} />
    <div className="order-loan-note-actions">
      <motion.button type="submit" whileTap={press} disabled={saving || processing || note === savedNote}>{saving ? 'Saving…' : 'Save note'}</motion.button>
      {saved && <span role="status">Saved</span>}
      <small className="order-note-count">{note.length}/300</small>
    </div>
    {error && <p role="alert">{error}</p>}
  </form>
}

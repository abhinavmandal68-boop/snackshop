import { useState } from 'react'
import { money, outstandingAmount } from '../lib/orderPayments.mjs'

export default function CashPaymentActions({ order, processing, onSave }) {
  const [partial, setPartial] = useState(false)
  const [amount, setAmount] = useState('')
  const [error, setError] = useState('')
  const initial = order.status === 'pending'
  const balance = initial ? Number(order.total) : outstandingAmount(order)
  const savePartial = async event => {
    event.preventDefault()
    const value = Number(amount)
    if (!Number.isFinite(value) || Math.round(value * 100) <= 0 || Math.round(value * 100) >= Math.round(balance * 100)) {
      setError(`Enter an amount greater than zero and less than ${money(balance)}.`)
      return
    }
    const saved = await onSave(order, { type: 'partial', amount: value })
    if (saved !== false) { setPartial(false); setAmount(''); setError('') }
  }
  return <div className="cash-payment-actions">
    <div className="cash-payment-options">
      <button className="cash-choice cash-choice-full" disabled={processing} onClick={() => onSave(order, { type: 'full' })}>
        Paid in full<small>{initial ? money(balance) : `Collect ${money(balance)}`}</small>
      </button>
      {initial && <button className="cash-choice cash-choice-partial" disabled={processing} aria-expanded={partial} onClick={() => { setPartial(open => !open); setError('') }}>
        Paid partially<small>Enter amount received</small>
      </button>}
      {initial && <button className="cash-choice cash-choice-loan" disabled={processing} onClick={() => onSave(order, { type: 'loan' })}>
        Loaned<small>{money(balance)} owed</small>
      </button>}
    </div>
    {initial && partial && <form className="cash-partial-form" onSubmit={savePartial}>
      <label>Amount received (₹)<input className="no-spinner" type="number" min="0.01" max={((Math.round(balance * 100) - 1) / 100).toFixed(2)} step="0.01" inputMode="decimal" value={amount} onChange={event => setAmount(event.target.value)} autoFocus required /></label>
      <button type="submit" disabled={processing}>{processing ? 'Saving…' : 'Save payment'}</button>
      <button type="button" disabled={processing} onClick={() => { setPartial(false); setError('') }}>Cancel</button>
      {error && <p role="alert">{error}</p>}
    </form>}
  </div>
}

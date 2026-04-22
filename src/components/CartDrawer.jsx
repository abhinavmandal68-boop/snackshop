import { useState } from 'react'
import { X, Trash2, CheckCircle, Copy, ArrowRight, Loader } from 'lucide-react'
import toast from 'react-hot-toast'
import { collection, addDoc, updateDoc, doc, serverTimestamp } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useCart } from '../lib/CartContext'

const UPI_ID = 'abhinavmandal68@oksbi'
const OWNER_NAME = 'Abhinav Mandal'

export default function CartDrawer({ products, open, onClose }) {
  const { items, removeFromCart, clearCart } = useCart()
  const [name, setName] = useState('')
  const [step, setStep] = useState('cart') // cart | qr | utr | done
  const [utr, setUtr] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [orderId, setOrderId] = useState(null)

  const cartProducts = products.filter(p => items[p.id])
  const total = cartProducts.reduce((s, p) => s + p.price * items[p.id], 0)

  const handleProceed = async () => {
    if (!name.trim()) { toast.error('Please enter your name'); return }
    if (cartProducts.length === 0) { toast.error('Cart is empty'); return }

    try {
      const orderItems = cartProducts.map(p => ({
        productId: p.id,
        name: p.name,
        qty: items[p.id],
        price: p.price,
      }))
      const ref = await addDoc(collection(db, 'orders'), {
        customerName: name.trim(),
        items: orderItems,
        total,
        status: 'pending',
        createdAt: serverTimestamp(),
      })
      setOrderId(ref.id)
      setStep('qr')
    } catch (err) {
      console.error(err)
      toast.error('Could not create order, try again')
    }
  }

  const handleSubmitUTR = async () => {
    if (utr.trim().length < 6) { toast.error('Enter a valid UTR / transaction ID'); return }
    setSubmitting(true)
    try {
      await updateDoc(doc(db, 'orders', orderId), {
        utr: utr.trim(),
        status: 'utr_submitted',
      })
      clearCart()
      setStep('done')
    } catch (err) {
      toast.error('Submission failed, try again')
    }
    setSubmitting(false)
  }

  const handleClose = () => {
    if (step === 'done' || step === 'cart') {
      setStep('cart'); setName(''); setUtr(''); setOrderId(null)
    }
    onClose()
  }

  const copyUPI = () => { navigator.clipboard.writeText(UPI_ID); toast.success('UPI ID copied!') }

  if (!open) return null

  return (
    <>
      <div onClick={handleClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 40, backdropFilter: 'blur(3px)' }} />
      <div style={{ position: 'fixed', right: 0, top: 0, bottom: 0, width: '100%', maxWidth: 420, background: 'var(--surface)', borderLeft: '1px solid var(--border)', zIndex: 50, display: 'flex', flexDirection: 'column', animation: 'slideIn 0.22s ease' }}>
        <style>{`
          @keyframes slideIn { from { transform: translateX(100%) } to { transform: translateX(0) } }
          @keyframes spin { to { transform: rotate(360deg) } }
          @keyframes popIn { from { transform: scale(0.88); opacity: 0 } to { transform: scale(1); opacity: 1 } }
        `}</style>

        {/* Header */}
        <div style={{ padding: '18px 20px 14px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <h2 style={{ fontFamily: 'Syne', fontSize: 19, fontWeight: 700 }}>
            {step === 'cart' && 'Your Cart'}
            {step === 'qr' && 'Scan & Pay'}
            {step === 'utr' && 'Confirm Payment'}
            {step === 'done' && 'Order Placed!'}
          </h2>
          <button onClick={handleClose} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: 6, color: 'var(--text)', display: 'flex' }}>
            <X size={17} />
          </button>
        </div>

        {/* Step pills */}
        {(step === 'qr' || step === 'utr') && (
          <div style={{ padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 6, borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
            {['Scan QR', 'Enter UTR'].map((label, i) => {
              const active = (i === 0 && step === 'qr') || (i === 1 && step === 'utr')
              const done = i === 0 && step === 'utr'
              return (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <div style={{ width: 20, height: 20, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, background: done ? 'var(--success)' : active ? 'var(--accent)' : 'var(--surface2)', color: done ? 'white' : active ? 'var(--accent-text)' : 'var(--text-hint)' }}>
                      {done ? '✓' : i + 1}
                    </div>
                    <span style={{ fontSize: 12, color: active ? 'var(--text)' : 'var(--text-hint)', fontWeight: active ? 500 : 400 }}>{label}</span>
                  </div>
                  {i === 0 && <ArrowRight size={11} color="var(--text-hint)" />}
                </div>
              )
            })}
          </div>
        )}

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>

          {/* CART */}
          {step === 'cart' && (
            <>
              {cartProducts.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-hint)' }}>
                  <div style={{ fontSize: 40, marginBottom: 10 }}>🛒</div>
                  <p style={{ fontSize: 14 }}>Your cart is empty</p>
                </div>
              ) : (
                <>
                  {cartProducts.map(p => (
                    <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 0', borderBottom: '1px solid var(--border)' }}>
                      <div>
                        <div style={{ fontWeight: 500, fontSize: 14 }}>{p.name}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>₹{p.price} × {items[p.id]}</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 15 }}>₹{p.price * items[p.id]}</span>
                        <button onClick={() => removeFromCart(p.id)} style={{ background: 'var(--danger-dim)', border: 'none', borderRadius: 6, padding: 6, color: 'var(--danger)', display: 'flex' }}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                  <div style={{ marginTop: 20 }}>
                    <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Your name</label>
                    <input value={name} onChange={e => setName(e.target.value)} placeholder="Enter your name..." />
                  </div>
                </>
              )}
            </>
          )}

          {/* QR */}
          {step === 'qr' && (
            <div style={{ textAlign: 'center', animation: 'popIn 0.3s ease' }}>
              <div style={{ display: 'inline-flex', gap: 12, background: 'var(--surface2)', borderRadius: 100, padding: '8px 20px', marginBottom: 18, fontSize: 13, alignItems: 'center' }}>
                <span style={{ color: 'var(--text-secondary)' }}>{cartProducts.length} item{cartProducts.length > 1 ? 's' : ''}</span>
                <span style={{ width: 1, height: 14, background: 'var(--border)' }} />
                <span style={{ fontFamily: 'Syne', fontWeight: 800, color: 'var(--accent)', fontSize: 16 }}>₹{total}</span>
              </div>

              <div style={{ background: 'white', borderRadius: 20, padding: '16px 16px 10px', display: 'inline-block', marginBottom: 16 }}>
                <img src="/qr.jpeg" alt="UPI QR" style={{ width: 230, height: 230, display: 'block', objectFit: 'contain', borderRadius: 10 }} />
                <p style={{ fontSize: 12, color: '#555', marginTop: 8, fontWeight: 600 }}>{OWNER_NAME}</p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 22 }}>
                <code style={{ fontSize: 13, color: 'var(--text-secondary)', background: 'var(--surface2)', padding: '5px 12px', borderRadius: 8 }}>{UPI_ID}</code>
                <button onClick={copyUPI} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '5px 8px', color: 'var(--text-secondary)', display: 'flex' }}>
                  <Copy size={13} />
                </button>
              </div>

              <ol style={{ textAlign: 'left', paddingLeft: 18, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 2.2 }}>
                <li>Open GPay / PhonePe / Paytm / any UPI app</li>
                <li>Scan QR or pay to UPI ID above</li>
                <li>Pay exactly <strong style={{ color: 'var(--accent)', fontFamily: 'Syne' }}>₹{total}</strong></li>
                <li>Note the <strong style={{ color: 'var(--text)' }}>UTR / transaction ID</strong> shown after payment</li>
              </ol>
            </div>
          )}

          {/* UTR */}
          {step === 'utr' && (
            <div style={{ animation: 'popIn 0.3s ease' }}>
              <div style={{ background: 'var(--success-dim)', border: '1px solid rgba(46,204,113,0.2)', borderRadius: 12, padding: '14px 16px', marginBottom: 20, display: 'flex', gap: 10 }}>
                <span style={{ fontSize: 20, flexShrink: 0 }}>✅</span>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--success)', marginBottom: 3 }}>Payment done? Almost there!</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>Enter your UTR below. Abhinav will verify and confirm your order — stock updates automatically.</div>
                </div>
              </div>
              <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>UTR / Transaction ID</label>
              <input value={utr} onChange={e => setUtr(e.target.value)} placeholder="e.g. 512345678901" style={{ marginBottom: 8, fontFamily: 'monospace', letterSpacing: '0.05em' }} />
              <p style={{ fontSize: 11, color: 'var(--text-hint)', lineHeight: 1.6, marginBottom: 20 }}>Find this in your UPI app → payment history → transaction details. Usually a 12-digit number.</p>

              <div style={{ background: 'var(--surface2)', borderRadius: 12, padding: '12px 14px' }}>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8, fontWeight: 500 }}>Order summary</p>
                {cartProducts.map(p => (
                  <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '3px 0', color: 'var(--text)' }}>
                    <span>{p.name} ×{items[p.id]}</span>
                    <span style={{ fontWeight: 500 }}>₹{p.price * items[p.id]}</span>
                  </div>
                ))}
                <div style={{ borderTop: '1px solid var(--border)', marginTop: 8, paddingTop: 8, display: 'flex', justifyContent: 'space-between', fontFamily: 'Syne', fontWeight: 700 }}>
                  <span>Total paid</span>
                  <span style={{ color: 'var(--accent)' }}>₹{total}</span>
                </div>
              </div>
            </div>
          )}

          {/* DONE */}
          {step === 'done' && (
            <div style={{ textAlign: 'center', padding: '50px 20px', animation: 'popIn 0.35s ease' }}>
              <CheckCircle size={62} color="var(--success)" style={{ margin: '0 auto 16px', display: 'block' }} />
              <h3 style={{ fontFamily: 'Syne', fontSize: 22, fontWeight: 800, marginBottom: 10 }}>Order submitted!</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.7, maxWidth: 280, margin: '0 auto' }}>
                Abhinav will verify your payment and confirm the order. Stock updates automatically once confirmed.
              </p>
              <div style={{ background: 'var(--surface2)', borderRadius: 12, padding: '12px 16px', marginTop: 20, fontSize: 13, color: 'var(--text-secondary)' }}>
                Order by <strong style={{ color: 'var(--text)' }}>{name}</strong> · <strong style={{ color: 'var(--accent)', fontFamily: 'Syne' }}>₹{total}</strong>
              </div>
              <button onClick={() => { setStep('cart'); setName(''); setUtr(''); setOrderId(null); onClose() }} style={{ marginTop: 24, padding: '11px 28px', background: 'var(--accent)', color: 'var(--accent-text)', borderRadius: 100, fontFamily: 'Syne', fontWeight: 700, fontSize: 14 }}>
                Back to shop
              </button>
            </div>
          )}
        </div>

        {/* Footers */}
        {step === 'cart' && cartProducts.length > 0 && (
          <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Total</span>
              <span style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 22 }}>₹{total}</span>
            </div>
            <button onClick={handleProceed} style={{ width: '100%', padding: 13, borderRadius: 12, background: 'var(--accent)', color: 'var(--accent-text)', fontFamily: 'Syne', fontWeight: 700, fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              Proceed to pay ₹{total} <ArrowRight size={16} />
            </button>
          </div>
        )}

        {step === 'qr' && (
          <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
            <button onClick={() => setStep('utr')} style={{ width: '100%', padding: 13, borderRadius: 12, background: 'var(--accent)', color: 'var(--accent-text)', fontFamily: 'Syne', fontWeight: 700, fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              I've paid — Enter transaction ID <ArrowRight size={16} />
            </button>
            <p style={{ fontSize: 11, color: 'var(--text-hint)', textAlign: 'center', marginTop: 8 }}>Only tap after completing UPI payment</p>
          </div>
        )}

        {step === 'utr' && (
          <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
            <button onClick={handleSubmitUTR} disabled={submitting} style={{ width: '100%', padding: 13, borderRadius: 12, background: submitting ? 'var(--surface2)' : 'var(--success)', color: submitting ? 'var(--text-secondary)' : 'white', fontFamily: 'Syne', fontWeight: 700, fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              {submitting ? <><Loader size={15} style={{ animation: 'spin 1s linear infinite' }} /> Submitting...</> : <><CheckCircle size={15} /> Submit & confirm order</>}
            </button>
          </div>
        )}
      </div>
    </>
  )
}

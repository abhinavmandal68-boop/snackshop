import { useState, useEffect, useRef } from 'react'
import { X, Trash2, CheckCircle, Copy, ArrowRight, Banknote, QrCode, Clock, XCircle, ShoppingCart } from 'lucide-react'
import toast from 'react-hot-toast'
import { collection, doc, serverTimestamp, runTransaction, updateDoc } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useCart } from '../lib/CartContext'
import { useAuth } from '../lib/AuthContext'

const UPI_ID = 'abhinavmandal68@oksbi'
const OWNER_NAME = 'Abhinav Mandal'
const TIMER_SECONDS = 120 

export default function CartDrawer({ products, open, onClose }) {
  const { items, addToCart, decrementFromCart, removeFromCart, clearCart } = useCart()
  const { profile, user } = useAuth()
  const customerName = user?.displayName || profile?.name || user?.email?.split('@')[0] || profile?.email?.split('@')[0] || 'Customer'
  
  const [step, setStep] = useState('cart')
  const [orderId, setOrderId] = useState(null)
  const [cancelling, setCancelling] = useState(false)

  const [finalTotal, setFinalTotal] = useState(0)
  const [finalName, setFinalName] = useState('')

  const [secondsLeft, setSecondsLeft] = useState(TIMER_SECONDS)
  const timerRef = useRef(null)

  const cartProducts = products.filter(p => items[p.id])
  const total = cartProducts.reduce((s, p) => s + p.price * items[p.id], 0)

  useEffect(() => {
    if (step === 'qr') {
      setSecondsLeft(TIMER_SECONDS)
      timerRef.current = setInterval(() => {
        setSecondsLeft(s => {
          if (s <= 1) {
            clearInterval(timerRef.current)
            handleAutoCancel()
            return 0
          }
          return s - 1
        })
      }, 1000)
    }
    return () => clearInterval(timerRef.current)
  }, [step])

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && open) handleClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, step]) 

  const formatTime = (s) => {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  const handleProceed = () => {
    if (cartProducts.length === 0) { toast.error('Cart is empty'); return }
    setStep('method')
  }

  const createOrder = async (paymentMethod) => {
    const orderItems = cartProducts.map(p => ({
      productId: p.id, name: p.name, qty: items[p.id], price: p.price,
    }))

    const orderRef = doc(collection(db, 'orders'))

    try {
      await runTransaction(db, async (tx) => {
        const productRefs = orderItems.map(it => doc(db, 'products', it.productId))
        const productSnaps = await Promise.all(productRefs.map(ref => tx.get(ref)))

        for (let i = 0; i < orderItems.length; i++) {
          const snap = productSnaps[i]
          const it = orderItems[i]
          if (!snap.exists()) throw new Error(`${it.name} is no longer available`)
          
          const data = snap.data()
          const available = (data.stock || 0) - (data.reserved || 0)
          if (available < it.qty) {
            throw new Error(available <= 0 ? `${it.name} just sold out` : `Only ${available} ${it.name} left`)
          }
        }

        productSnaps.forEach((snap, i) => {
          const data = snap.data()
          tx.update(productRefs[i], { reserved: (data.reserved || 0) + orderItems[i].qty })
        })

        tx.set(orderRef, {
          customerName, 
          userId: user?.uid || profile?.id || null, 
          items: orderItems, 
          total,
          // FIX: Create UPI orders as 'draft' so the admin doesn't see them until they click "I have paid"
          status: paymentMethod === 'upi' ? 'draft' : 'pending', 
          paymentMethod, 
          createdAt: serverTimestamp(),
        })
      })

      setOrderId(orderRef.id)
      setFinalTotal(total)
      setFinalName(customerName)
      return orderRef.id
    } catch (err) {
      console.error(err)
      toast.error(err.message || 'Could not create order, try again')
      return null
    }
  }

  const handleChooseUPI = async () => {
    const id = await createOrder('upi')
    if (id) setStep('qr')
  }

  const handleChooseCash = async () => {
    const id = await createOrder('cash')
    if (id) {
      clearCart()
      setStep('cash_pending')
    }
  }

  // FIX: Push the status update to Firestore so the Admin gets the notification
  const handleConfirmPaid = async () => {
    if (!orderId) return
    try {
      await updateDoc(doc(db, 'orders', orderId), { status: 'pending' })
      clearCart()
      setStep('done')
    } catch (err) {
      console.error('Failed to update order status:', err)
      toast.error('Could not submit payment, try again')
    }
  }

  const releaseOrder = async (id) => {
    if (!id) return
    try {
      await runTransaction(db, async (tx) => {
        const orderRef2 = doc(db, 'orders', id)
        const orderSnap = await tx.get(orderRef2)
        // Release reservation if it's draft or pending
        if (!orderSnap.exists() || (orderSnap.data().status !== 'pending' && orderSnap.data().status !== 'draft')) return

        const orderData = orderSnap.data()
        const productRefs = (orderData.items || []).filter(it => it.productId).map(it => doc(db, 'products', it.productId))
        const productSnaps = await Promise.all(productRefs.map(ref => tx.get(ref)))

        productSnaps.forEach((snap, i) => {
          if (!snap.exists()) return
          const data = snap.data()
          const qty = orderData.items[i]?.qty || 0
          tx.update(productRefs[i], { reserved: Math.max(0, (data.reserved || 0) - qty) })
        })

        tx.update(orderRef2, { status: 'cancelled', cancelledBy: 'customer' })
      })
    } catch (err) {
      console.error(`Could not release order ${id}:`, err)
    }
  }

  const handleCancelOrder = async () => {
    if (!orderId) { resetAndClose(false); return }
    setCancelling(true)
    await releaseOrder(orderId)
    toast('Order cancelled', { icon: '✕' })
    setCancelling(false)
    setStep('cart')
    setOrderId(null)
    clearInterval(timerRef.current)
  }

  const handleAutoCancel = async () => {
    await releaseOrder(orderId)
    toast.error('Payment window expired — order cancelled')
    setStep('cart')
    setOrderId(null)
  }

  const resetAndClose = (keepCart = true) => {
    setStep('cart')
    setOrderId(null)
    if (!keepCart) clearCart()
    onClose()
  }

  const handleClose = () => {
    if (step === 'qr' && orderId) releaseOrder(orderId)
    resetAndClose()
  }

  const copyUPI = () => { navigator.clipboard.writeText(UPI_ID); toast.success('UPI ID copied!') }

  if (!open) return null
  const isUrgent = secondsLeft <= 20

  return (
    <>
      <div onClick={handleClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 40, backdropFilter: 'blur(3px)' }} />
      <div style={{ position: 'fixed', right: 0, top: 0, bottom: 0, width: '100%', maxWidth: 420, background: 'var(--surface)', borderLeft: '1px solid var(--border)', zIndex: 50, display: 'flex', flexDirection: 'column', overflow: 'hidden', animation: 'slideIn 0.22s ease' }}>
        <style>{`
          @keyframes slideIn { from { transform: translateX(100%) } to { transform: translateX(0) } }
          @keyframes popIn { from { transform: scale(0.88); opacity: 0 } to { transform: scale(1); opacity: 1 } }
          @keyframes pulseRed { 0%,100%{opacity:1} 50%{opacity:0.4} }
        `}</style>

        {/* Header */}
        <div style={{ padding: '18px 20px 14px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <h2 style={{ fontFamily: 'Syne', fontSize: 19, fontWeight: 700 }}>
            {step === 'cart' && 'Your Cart'}
            {step === 'method' && 'Choose Payment'}
            {step === 'qr' && 'Scan & Pay'}
            {step === 'cash_pending' && 'Pay by Cash'}
            {step === 'done' && 'Order Placed!'}
          </h2>
          <button onClick={handleClose} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: 6, color: 'var(--text)', display: 'flex' }}>
            <X size={17} />
          </button>
        </div>

        {/* Countdown timer bar */}
        {step === 'qr' && (
          <div style={{ padding: '9px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', flexShrink: 0, background: isUrgent ? 'var(--danger-dim)' : 'var(--surface2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: isUrgent ? 'var(--danger)' : 'var(--text-secondary)', animation: isUrgent ? 'pulseRed 1s infinite' : 'none' }}>
              <Clock size={13} />
              <span style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 13 }}>{formatTime(secondsLeft)} left to complete</span>
            </div>
            <button onClick={handleCancelOrder} disabled={cancelling} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', color: 'var(--danger)', fontSize: 12, fontWeight: 600, padding: 0 }}>
              <XCircle size={13} /> {cancelling ? 'Cancelling…' : 'Cancel'}
            </button>
          </div>
        )}

        {/* Content */}
        <div className="custom-scrollbar" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '16px 20px', WebkitOverflowScrolling: 'touch' }}>

          {/* CART */}
          {step === 'cart' && (
            <>
              {cartProducts.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '80px 20px', color: 'var(--text-hint)' }}>
                  <ShoppingCart size={48} style={{ opacity: 0.2, margin: '0 auto 16px', display: 'block' }} />
                  <p style={{ fontSize: 15, fontFamily: 'Syne', fontWeight: 600, color: 'var(--text-secondary)' }}>Your cart is empty</p>
                  <p style={{ fontSize: 13, marginTop: 4 }}>Add some snacks to get started!</p>
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface2)', borderRadius: 10, padding: '8px 12px', marginBottom: 14, fontSize: 13, color: 'var(--text-secondary)' }}>
                    Ordering as <strong style={{ color: 'var(--text)' }}>{customerName}</strong>
                  </div>
                  {cartProducts.map(p => (
                    <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 0', borderBottom: '1px solid var(--border)' }}>
                      <div>
                        <div style={{ fontWeight: 500, fontSize: 14 }}>{p.name}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>₹{p.price} × {items[p.id]}</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 15 }}>₹{p.price * items[p.id]}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 2, background: 'var(--surface2)', borderRadius: 8 }}>
                          <button onClick={() => decrementFromCart(p.id)} style={{ background: 'none', border: 'none', padding: '6px 9px', color: 'var(--text)', fontWeight: 700, cursor: 'pointer', display: 'flex' }}>−</button>
                          <span style={{ fontWeight: 700, fontSize: 13, minWidth: 16, textAlign: 'center' }}>{items[p.id]}</span>
                          <button onClick={() => addToCart(p, 1)} disabled={(p.visibleStock ?? p.stock ?? 0) - items[p.id] <= 0} style={{ background: 'none', border: 'none', padding: '6px 9px', color: 'var(--text)', fontWeight: 700, cursor: 'pointer', display: 'flex', opacity: (p.visibleStock ?? p.stock ?? 0) - items[p.id] <= 0 ? 0.35 : 1 }}>+</button>
                        </div>
                        <button onClick={() => removeFromCart(p.id)} style={{ background: 'var(--danger-dim)', border: 'none', borderRadius: 6, padding: 6, color: 'var(--danger)', display: 'flex' }}><Trash2 size={13} /></button>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </>
          )}

          {/* METHOD CHOICE */}
          {step === 'method' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, animation: 'popIn 0.3s ease' }}>
              <div style={{ display: 'inline-flex', gap: 12, background: 'var(--surface2)', borderRadius: 100, padding: '8px 20px', marginBottom: 6, fontSize: 13, alignItems: 'center', alignSelf: 'center' }}>
                <span style={{ color: 'var(--text-secondary)' }}>{cartProducts.length} item{cartProducts.length > 1 ? 's' : ''}</span>
                <span style={{ width: 1, height: 14, background: 'var(--border)' }} />
                <span style={{ fontFamily: 'Syne', fontWeight: 800, color: 'var(--accent)', fontSize: 16 }}>₹{total}</span>
              </div>
              <button onClick={handleChooseUPI} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 18px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 14, textAlign: 'left', color: 'var(--text)' }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, background: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><QrCode size={18} color="var(--accent)" /></div>
                <div style={{ flex: 1 }}><div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 14 }}>Pay by UPI</div><div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Scan QR, instant confirmation</div></div>
                <ArrowRight size={15} color="var(--text-hint)" />
              </button>
              <button onClick={handleChooseCash} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 18px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 14, textAlign: 'left', color: 'var(--text)' }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, background: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Banknote size={18} color="var(--success)" /></div>
                <div style={{ flex: 1 }}><div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 14 }}>Pay by Cash</div><div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Pay the admin directly on pickup</div></div>
                <ArrowRight size={15} color="var(--text-hint)" />
              </button>
              <button onClick={() => setStep('cart')} style={{ marginTop: 4, padding: 10, background: 'none', border: 'none', color: 'var(--text-hint)', fontSize: 13 }}>← Back to cart</button>
            </div>
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
                <button onClick={copyUPI} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '5px 8px', color: 'var(--text-secondary)', display: 'flex' }}><Copy size={13} /></button>
              </div>
              <ol style={{ textAlign: 'left', paddingLeft: 18, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 2.2 }}>
                <li>Open GPay / PhonePe / Paytm / any UPI app</li>
                <li>Scan QR or pay to UPI ID above</li>
                <li>Pay exactly <strong style={{ color: 'var(--accent)', fontFamily: 'Syne' }}>₹{total}</strong></li>
                <li>Tap "I've paid" below once done</li>
              </ol>
            </div>
          )}

          {/* CASH PENDING */}
          {step === 'cash_pending' && (
            <div style={{ textAlign: 'center', padding: '50px 20px', animation: 'popIn 0.35s ease' }}>
              <Banknote size={62} color="var(--success)" style={{ margin: '0 auto 16px', display: 'block' }} />
              <h3 style={{ fontFamily: 'Syne', fontSize: 22, fontWeight: 800, marginBottom: 10 }}>Order placed!</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.7, maxWidth: 280, margin: '0 auto' }}>
                Pay <strong style={{ color: 'var(--accent)' }}>₹{finalTotal}</strong> in cash to the admin on pickup. The admin will verify and confirm your order — stock updates automatically once confirmed.
              </p>
              <div style={{ background: 'var(--surface2)', borderRadius: 12, padding: '12px 16px', marginTop: 20, fontSize: 13, color: 'var(--text-secondary)' }}>
                Order by <strong style={{ color: 'var(--text)' }}>{finalName}</strong> · <strong style={{ color: 'var(--accent)', fontFamily: 'Syne' }}>₹{finalTotal}</strong>
              </div>
              <button onClick={() => resetAndClose()} style={{ marginTop: 24, padding: '11px 28px', background: 'var(--accent)', color: 'var(--accent-text)', borderRadius: 100, fontFamily: 'Syne', fontWeight: 700, fontSize: 14 }}>Back to shop</button>
            </div>
          )}

          {/* DONE */}
          {step === 'done' && (
            <div style={{ textAlign: 'center', padding: '50px 20px', animation: 'popIn 0.35s ease' }}>
              <CheckCircle size={62} color="var(--success)" style={{ margin: '0 auto 16px', display: 'block' }} />
              <h3 style={{ fontFamily: 'Syne', fontSize: 22, fontWeight: 800, marginBottom: 10 }}>Order submitted!</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.7, maxWidth: 280, margin: '0 auto' }}>
                The admin will verify your payment and confirm the order. Stock updates automatically once confirmed.
              </p>
              <div style={{ background: 'var(--surface2)', borderRadius: 12, padding: '12px 16px', marginTop: 20, fontSize: 13, color: 'var(--text-secondary)' }}>
                Order by <strong style={{ color: 'var(--text)' }}>{finalName}</strong> · <strong style={{ color: 'var(--accent)', fontFamily: 'Syne' }}>₹{finalTotal}</strong>
              </div>
              <button onClick={() => resetAndClose()} style={{ marginTop: 24, padding: '11px 28px', background: 'var(--accent)', color: 'var(--accent-text)', borderRadius: 100, fontFamily: 'Syne', fontWeight: 700, fontSize: 14 }}>Back to shop</button>
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
              Proceed to buy <ArrowRight size={16} />
            </button>
          </div>
        )}

        {step === 'qr' && (
          <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
            <button onClick={handleConfirmPaid} style={{ width: '100%', padding: 13, borderRadius: 12, background: 'var(--success-dim)', color: 'var(--success)', border: '1px solid rgba(46,204,113,0.3)', fontFamily: 'Syne', fontWeight: 700, fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <CheckCircle size={16} /> I've paid
            </button>
            <p style={{ fontSize: 11, color: 'var(--text-hint)', textAlign: 'center', marginTop: 8 }}>Only tap after completing UPI payment</p>
          </div>
        )}
      </div>
    </>
  )
}
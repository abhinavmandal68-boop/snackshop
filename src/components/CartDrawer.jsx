import { useState, useEffect, useRef } from 'react'
import { X, Trash2, CheckCircle, ArrowRight, Banknote, ShoppingBag, Plus, Minus, ShieldCheck } from 'lucide-react'
import toast from 'react-hot-toast'
import { collection, doc, onSnapshot } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useCart } from '../lib/CartContext'
import { useAuth } from '../lib/AuthContext'
import CheckoutStatus from './CheckoutStatus'
import { shopApi } from '../lib/shopApi'
import { createPaymentConfirmation } from '../lib/paymentConfirmation.mjs'
import { motion, AnimatePresence, useDragControls, useReducedMotion } from 'framer-motion'
import { cartTransition, reveal, press } from '../lib/motion'
import useMediaQuery from '../lib/useMediaQuery'
import ProductArtwork from './ProductArtwork'
import { money } from '../lib/orderPayments.mjs'

const PENDING_ORDER_KEY = 'snackshop_pending_order'

export default function CartDrawer({ products, shopOpen = true, open, onClose, onOrderPlaced }) {
  const isMobile = useMediaQuery('(max-width: 700px)')
  const reduceMotion = useReducedMotion()
  const dragControls = useDragControls()
  const dialogRef = useRef(null)
  const { items, totalItems, addToCart, decrementFromCart, removeFromCart, clearCart } = useCart()
  const { profile, user } = useAuth()
  const customerName =
    user?.displayName ||
    profile?.name ||
    user?.email?.split('@')[0] ||
    profile?.email?.split('@')[0] ||
    'Customer'

  const [step, setStep] = useState('cart')
  const stepRef = useRef(step)
  stepRef.current = step
  const [orderId, setOrderId] = useState(null)

  const [finalTotal, setFinalTotal] = useState(0)
  const [finalName, setFinalName] = useState('')

  // Prevent Razorpay dismiss/failure handlers from cancelling
  // an order after payment has already been successfully verified.
  const paymentCompletedRef = useRef(false)
  const paymentReceivedRef = useRef(false)
  const checkoutBusyRef = useRef(false)
  const retryVerificationRef = useRef(null)
  const paymentConfirmationRef = useRef(null)
  const checkoutLocked = ['payment', 'confirming', 'verification_error', 'creating_cash', 'cancelling_payment'].includes(step)

  const cartProducts = products.filter(p => items[p.id])
  const total = cartProducts.reduce((s, p) => s + p.price * items[p.id], 0)

  useEffect(() => () => paymentConfirmationRef.current?.stop(), [])

  useEffect(() => {
    if (!open) return undefined
    const previousFocus = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const focusable = () => [...(dialogRef.current?.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), [tabindex="0"]') || [])].filter(element => element.getClientRects().length)
    ;(focusable()[0] || dialogRef.current)?.focus()
    const trapFocus = event => {
      // Razorpay owns focus while its external payment window is open.
      if (stepRef.current === 'payment') return
      if (event.key !== 'Tab') return
      const elements = focusable()
      const first = elements[0]
      const last = elements[elements.length - 1]
      if (!first) { event.preventDefault(); dialogRef.current?.focus(); return }
      if (!elements.includes(document.activeElement)) { event.preventDefault(); (event.shiftKey ? last : first).focus(); return }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialogRef.current)) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', trapFocus)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', trapFocus)
      if (previousFocus?.isConnected) previousFocus.focus()
      else document.querySelector('.shop-header-actions button')?.focus()
    }
  }, [open])

  useEffect(() => {
    if (open && step !== 'payment') dialogRef.current?.querySelector('#checkout-title')?.focus()
  }, [step, open])

  // RECOVERY: if the browser killed the tab mid-payment,
  // release any leftover draft order reservation.
  useEffect(() => {
    const raw = localStorage.getItem(PENDING_ORDER_KEY)
    if (!raw) return

    try {
      const { id } = JSON.parse(raw)

      if (id) {
        releaseOrder(id).finally(() => {
          localStorage.removeItem(PENDING_ORDER_KEY)
        })
      }
    } catch {
      localStorage.removeItem(PENDING_ORDER_KEY)
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && open) handleClose()
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, step])

  const handleProceed = () => {
    if (cartProducts.length === 0) {
      toast.error('Cart is empty')
      return
    }

    setStep('method')
  }

  const createOrder = async () => {
    const orderItems = cartProducts.map(p => ({
      productId: p.id,
      name: p.name,
      qty: items[p.id],
      price: p.price,
    }))

    const orderRef = doc(collection(db, 'orders'))

    try {
      const result = await shopApi('create', { orderId: orderRef.id, items: orderItems, customerName })

      setOrderId(orderRef.id)
      setFinalTotal(result.total)
      setFinalName(customerName)

      localStorage.setItem(
        PENDING_ORDER_KEY,
        JSON.stringify({
          id: orderRef.id,
          createdAt: Date.now(),
        })
      )

      return orderRef.id
    } catch (err) {
      console.error(err)
      toast.error(err.message || 'Could not create order, try again')
      return null
    }
  }

  const handleChooseUPI = async () => {
    if (checkoutBusyRef.current) return
    if (!user) {
      toast.error('Please sign in before paying')
      return
    }
    if (!window.Razorpay) {
      toast.error('Payment could not load. Please refresh and try again.')
      return
    }

    checkoutBusyRef.current = true
    paymentReceivedRef.current = false
    paymentCompletedRef.current = false
    retryVerificationRef.current = null
    setStep('payment')
    const id = doc(collection(db, 'orders')).id
    setOrderId(id)

    try {
      // Save the reference before requesting checkout so interrupted requests
      // can still release a server-created draft.
      localStorage.setItem(PENDING_ORDER_KEY, JSON.stringify({ id, createdAt: Date.now() }))
      const token = await user.getIdToken()

      const response = await fetch('/api/razorpay/create-order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          firestoreOrderId: id,
          customerName,
          items: cartProducts.map(p => ({ productId: p.id, qty: items[p.id] })),
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Could not start payment')
      }

      setFinalTotal(data.amount / 100)
      setFinalName(data.name || customerName)

      const options = {
        key: data.keyId,
        amount: data.amount,
        currency: data.currency,
        name: 'SnackShop',
        description: 'SnackShop Order',
        order_id: data.razorpayOrderId,

        prefill: {
          name: customerName,
          email: user.email || '',
        },

        theme: {
          color: '#fc6c26',
        },

        handler: async (paymentResponse) => {
          // Razorpay has returned a payment: dismissal must no longer release it,
          // including while our server is verifying it or awaiting a retry.
          if (paymentReceivedRef.current) return
          paymentReceivedRef.current = true
          const confirmation = createPaymentConfirmation({
            paymentId: paymentResponse.razorpay_payment_id,
            razorpayOrderId: paymentResponse.razorpay_order_id,
            // The signed webhook may confirm payment before the HTTP request
            // returns. Only a matching server-confirmed payment completes it.
            watch: onPaid => onSnapshot(doc(db, 'orders', id), snapshot => onPaid(snapshot.data()),
              error => console.warn('Could not watch payment confirmation:', error.code)),
            onConfirming: () => setStep('confirming'),
            verify: async () => {
              const verifyToken = await user.getIdToken()
              const verifyResponse = await fetch('/api/razorpay/verify-payment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${verifyToken}` },
                body: JSON.stringify({
                  firestoreOrderId: id,
                  razorpayPaymentId: paymentResponse.razorpay_payment_id,
                  razorpayOrderId: paymentResponse.razorpay_order_id,
                  razorpaySignature: paymentResponse.razorpay_signature,
                }),
              })
              const verifyData = await verifyResponse.json()
              if (!verifyResponse.ok || !verifyData.success) throw new Error(verifyData.error || 'Payment verification failed')
            },
            onComplete: async () => {
              paymentCompletedRef.current = true
              localStorage.removeItem(PENDING_ORDER_KEY)
              await onOrderPlaced?.()
              clearCart()
              checkoutBusyRef.current = false
              retryVerificationRef.current = null
              setStep('done')
            },
            onError: err => {
              console.error('Payment verification failed:', err)
              toast.error(err.message || 'Payment verification failed')
              setStep('verification_error')
            },
          })
          paymentConfirmationRef.current = confirmation
          retryVerificationRef.current = confirmation.retry
          await confirmation.retry()
        },

        modal: {
          ondismiss: async () => {
            if (paymentReceivedRef.current || paymentCompletedRef.current) return

            setStep('cancelling_payment')
            await releaseOrder(id)

            checkoutBusyRef.current = false
            setOrderId(null)
            setStep('cart')

            toast('Payment cancelled', {
              icon: '✕',
            })
          },
        },
      }

      const razorpay = new window.Razorpay(options)

      razorpay.on('payment.failed', async (response) => {
        if (paymentReceivedRef.current || paymentCompletedRef.current) return

        console.error(
          'Razorpay payment failed:',
          response.error
        )

        // Checkout allows retries. Release the reservation only on dismissal.
        toast.error(
          response.error?.description ||
            'Payment failed'
        )
      })

      razorpay.open()
    } catch (err) {
      console.error(
        'Could not start Razorpay payment:',
        err
      )

      await releaseOrder(id)

      checkoutBusyRef.current = false
      setOrderId(null)
      setStep('cart')

      toast.error(
        err.message || 'Could not start payment'
      )
    }
  }

  const handleChooseCash = async () => {
    if (checkoutBusyRef.current) return
    checkoutBusyRef.current = true
    setStep('creating_cash')
    const id = await createOrder()

    if (id) {
      localStorage.removeItem(PENDING_ORDER_KEY)
      await onOrderPlaced?.()
      clearCart()
      setStep('cash_pending')
    } else {
      setStep('method')
    }
    checkoutBusyRef.current = false
  }

  const releaseOrder = async (id) => {
    if (!id) return

    try {
      await shopApi('cancel', { orderId: id })
    } catch (err) {
      console.error(
        `Could not release order ${id}:`,
        err
      )
    }

    localStorage.removeItem(PENDING_ORDER_KEY)
  }

  const resetAndClose = (keepCart = true) => {
    setStep('cart')
    setOrderId(null)

    if (!keepCart) {
      clearCart()
    }

    onClose()
  }

  const handleClose = () => {
    // Keep the customer in checkout until payment/confirmation settles.
    if (checkoutBusyRef.current || checkoutLocked) {
      return
    }

    if (step === 'method') {
      setStep('cart')
      return
    }

    resetAndClose()
  }

  const titles = {
    cart: 'Your bag', method: 'Choose your payment', payment: 'Secure payment',
    confirming: 'Confirming your order', verification_error: 'Confirmation pending',
    creating_cash: 'Placing your order', cancelling_payment: 'Returning to your bag',
    cash_pending: 'You’re all set', done: 'You’re all set',
  }
  const canDrag = isMobile && step === 'cart' && !checkoutLocked

  return <AnimatePresence>
    {open && <motion.div key="checkout-backdrop" className="checkout-backdrop" {...reveal} onClick={handleClose} />}
    {open && <motion.aside
      ref={dialogRef}
      className={`live-checkout ${isMobile ? 'is-mobile' : ''}`}
      key="checkout-drawer"
      role="dialog" tabIndex={-1} aria-modal="true" aria-labelledby="checkout-title"
      initial={isMobile ? { y: '100%', opacity: 0.8 } : { x: '100%', opacity: 0.8 }}
      animate={{ x: 0, y: 0, opacity: 1 }}
      exit={isMobile ? { y: '100%', opacity: 0.8 } : { x: '100%', opacity: 0.8 }}
      transition={reduceMotion ? { duration: 0 } : cartTransition}
      drag={canDrag ? 'y' : false} dragControls={dragControls} dragListener={false}
      dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: 0.3 }}
      onDragEnd={(_, info) => {
        if (canDrag && !checkoutBusyRef.current && (info.offset.y > 100 || (info.offset.y > 30 && info.velocity.y > 650))) handleClose()
      }}
    >
      {isMobile && <div className={`checkout-drag-handle ${canDrag ? 'is-draggable' : ''}`} aria-hidden="true" onPointerDown={event => { if (canDrag) dragControls.start(event) }}><span /></div>}
      <header className="checkout-header">
        <div><p className="eyebrow">SNACKSHOP CHECKOUT</p><h2 id="checkout-title" tabIndex={-1}>{titles[step]}</h2></div>
        <motion.button type="button" className="icon-button checkout-close" whileTap={press} onClick={handleClose} disabled={checkoutLocked} aria-label={step === 'method' ? 'Back to cart' : 'Close checkout'}><X size={19} /></motion.button>
      </header>
      <div className="checkout-content custom-scrollbar">
        {!shopOpen && <p className="shop-notice" role="status">Pickup is paused. You can order now and collect when the shop reopens.</p>}
        <motion.div key={step} className="checkout-step" {...reveal} transition={{ duration: reduceMotion ? 0 : 0.16 }}>
          {checkoutLocked && <CheckoutStatus step={step} orderId={orderId} onRetry={() => retryVerificationRef.current?.()} />}
          {step === 'cart' && (cartProducts.length === 0 ? <div className="checkout-empty">
            <span className="checkout-empty-icon"><ShoppingBag size={32} strokeWidth={1.4} /></span>
            <h3>A little room for something good.</h3><p>Your bag is empty. Find your next favourite on the shelves.</p>
            <motion.button className="checkout-secondary" whileTap={press} onClick={handleClose}>Explore the shelves <ArrowRight size={16} /></motion.button>
          </div> : <>
            <p className="checkout-customer">Ordering as <strong>{customerName}</strong></p>
            <div className="checkout-cart-items">
              {cartProducts.map(product => {
                const available = Math.max(0, (product.visibleStock ?? product.stock ?? 0) - items[product.id])
                return <div className="checkout-cart-item" key={product.id}>
                  <div className="checkout-item-image"><ProductArtwork product={product} eager /></div>
                  <div className="checkout-item-detail">
                    <div className="checkout-item-heading"><h3>{product.name}</h3><strong>{money(product.price * items[product.id])}</strong></div>
                    <p>{money(product.price)} each</p>
                    <div className="checkout-item-actions">
                      <div className="checkout-quantity">
                        <motion.button className="icon-button" whileTap={press} onClick={() => decrementFromCart(product.id)} aria-label={`Decrease ${product.name} quantity`}><Minus size={15} /></motion.button>
                        <span aria-live="polite">{items[product.id]}</span>
                        <motion.button className="icon-button" whileTap={press} disabled={available === 0} onClick={() => { if (available > 0) addToCart(product, 1) }} aria-label={`Increase ${product.name} quantity`}><Plus size={15} /></motion.button>
                      </div>
                      <motion.button className="icon-button checkout-remove" whileTap={press} onClick={() => removeFromCart(product.id)} aria-label={`Remove ${product.name} from cart`}><Trash2 size={15} /></motion.button>
                    </div>
                  </div>
                </div>
              })}
            </div>
          </>)}
          {step === 'method' && <div className="checkout-payment">
            <div className="checkout-payment-summary"><span>{totalItems} {totalItems === 1 ? 'item' : 'items'} in your bag</span><strong>{money(total)}</strong></div>
            <p className="checkout-payment-intro">Choose how you’d like to pay.</p>
            <motion.button className="checkout-payment-option" whileTap={press} onClick={handleChooseUPI}>
              <span className="checkout-method-icon">UPI</span><span><strong>Pay online</strong><small>Secure payment through Razorpay</small></span><ArrowRight size={17} aria-hidden="true" />
            </motion.button>
            <motion.button className="checkout-payment-option" whileTap={press} onClick={handleChooseCash}>
              <span className="checkout-method-icon"><Banknote size={22} /></span><span><strong>Pay with cash</strong><small>Pay the admin when you collect</small></span><ArrowRight size={17} aria-hidden="true" />
            </motion.button>
            <p className="checkout-security"><ShieldCheck size={14} aria-hidden="true" /> Online payment is confirmed securely.</p>
            <motion.button className="checkout-back" whileTap={press} onClick={() => setStep('cart')}>← Back to your bag</motion.button>
          </div>}
          {(step === 'cash_pending' || step === 'done') && <section className="checkout-confirmation" role="status" aria-live="polite">
            <span className="checkout-confirmation-icon">{step === 'done' ? <CheckCircle size={34} strokeWidth={1.5} /> : <Banknote size={34} strokeWidth={1.5} />}</span>
            <p className="eyebrow">{step === 'done' ? 'PAYMENT VERIFIED' : 'CASH ORDER PLACED'}</p>
            <h3>{step === 'done' ? 'Good things are on their way.' : 'Your snacks are reserved.'}</h3>
            <p>{step === 'done' ? 'Your payment is verified. The admin will accept your order for pickup.' : 'Pay the admin in cash when you collect. Your order is awaiting confirmation.'}</p>
            <dl className="checkout-receipt">
              <div><dt>Ordered by</dt><dd>{finalName}</dd></div>
              <div><dt>Payment</dt><dd>{step === 'done' ? 'Paid online' : 'Cash on pickup'}</dd></div>
              <div><dt>Order reference</dt><dd className="checkout-receipt-reference">{orderId}</dd></div>
              <div className="checkout-receipt-total"><dt>{step === 'done' ? 'Amount paid' : 'Amount to pay'}</dt><dd>{money(finalTotal)}</dd></div>
            </dl>
            <motion.button className="checkout-primary" whileTap={press} onClick={() => resetAndClose()}>Back to the shop <ArrowRight size={17} /></motion.button>
          </section>}
        </motion.div>
      </div>
      {step === 'cart' && cartProducts.length > 0 && <footer className="checkout-footer">
        <div className="checkout-total"><span>Total <small>{totalItems} {totalItems === 1 ? 'item' : 'items'}</small></span><strong>{money(total)}</strong></div>
        <motion.button className="checkout-primary" whileTap={press} onClick={handleProceed}>Continue to payment <ArrowRight size={17} /></motion.button>
        <p>Choose online payment or cash on pickup.</p>
      </footer>}
    </motion.aside>}
  </AnimatePresence>
}

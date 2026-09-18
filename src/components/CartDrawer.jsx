import { useState, useEffect, useRef } from 'react'
import { X, Trash2, CheckCircle, ArrowRight, Banknote, ShoppingCart } from 'lucide-react'
import toast from 'react-hot-toast'
import { collection, doc, serverTimestamp, runTransaction } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useCart } from '../lib/CartContext'
import { useAuth } from '../lib/AuthContext'
import CheckoutStatus from './CheckoutStatus'
import { motion, AnimatePresence } from 'framer-motion'
import { drawerTransition, reveal, press } from '../lib/motion'

const PENDING_ORDER_KEY = 'snackshop_pending_order'

export default function CartDrawer({ products, open, onClose }) {
  const { items, addToCart, decrementFromCart, removeFromCart, clearCart } = useCart()
  const { profile, user } = useAuth()
  const customerName =
    user?.displayName ||
    profile?.name ||
    user?.email?.split('@')[0] ||
    profile?.email?.split('@')[0] ||
    'Customer'

  const [step, setStep] = useState('cart')
  const [orderId, setOrderId] = useState(null)
  const [cancelling, setCancelling] = useState(false)

  const [finalTotal, setFinalTotal] = useState(0)
  const [finalName, setFinalName] = useState('')

  // Prevent Razorpay dismiss/failure handlers from cancelling
  // an order after payment has already been successfully verified.
  const paymentCompletedRef = useRef(false)
  const paymentReceivedRef = useRef(false)
  const checkoutBusyRef = useRef(false)
  const verificationBusyRef = useRef(false)
  const retryVerificationRef = useRef(null)
  const checkoutLocked = ['payment', 'confirming', 'verification_error', 'creating_cash', 'cancelling_payment'].includes(step)

  const cartProducts = products.filter(p => items[p.id])
  const total = cartProducts.reduce((s, p) => s + p.price * items[p.id], 0)

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

  const createOrder = async (paymentMethod) => {
    const orderItems = cartProducts.map(p => ({
      productId: p.id,
      name: p.name,
      qty: items[p.id],
      price: p.price,
    }))

    const orderRef = doc(collection(db, 'orders'))

    try {
      await runTransaction(db, async (tx) => {
        const productRefs = orderItems.map(it =>
          doc(db, 'products', it.productId)
        )

        const productSnaps = await Promise.all(
          productRefs.map(ref => tx.get(ref))
        )

        for (let i = 0; i < orderItems.length; i++) {
          const snap = productSnaps[i]
          const it = orderItems[i]

          if (!snap.exists()) {
            throw new Error(`${it.name} is no longer available`)
          }

          const data = snap.data()
          const available = (data.stock || 0) - (data.reserved || 0)

          if (available < it.qty) {
            throw new Error(
              available <= 0
                ? `${it.name} just sold out`
                : `Only ${available} ${it.name} left`
            )
          }
        }

        productSnaps.forEach((snap, i) => {
          const data = snap.data()

          tx.update(productRefs[i], {
            reserved: (data.reserved || 0) + orderItems[i].qty,
          })
        })

        tx.set(orderRef, {
          customerName,
          userId: user?.uid || profile?.id || null,
          items: orderItems,
          total,

          // UPI orders remain draft until Razorpay payment
          // is successfully verified by the backend.
          status: paymentMethod === 'upi' ? 'draft' : 'pending',

          paymentMethod,
          createdAt: serverTimestamp(),
        })
      })

      setOrderId(orderRef.id)
      setFinalTotal(total)
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
    const id = await createOrder('upi')

    if (!id) {
      checkoutBusyRef.current = false
      setStep('method')
      return
    }

    try {
      const token = await user.getIdToken()

      const response = await fetch('/api/razorpay/create-order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          firestoreOrderId: id,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Could not start payment')
      }

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
          color: '#000000',
        },

        handler: async (paymentResponse) => {
          // Razorpay has returned a payment: dismissal must no longer release it,
          // including while our server is verifying it or awaiting a retry.
          if (paymentReceivedRef.current) return
          paymentReceivedRef.current = true
          const verifyPayment = async () => {
            if (verificationBusyRef.current || paymentCompletedRef.current) return
            verificationBusyRef.current = true
            setStep('confirming')
            try {
              const verifyToken = await user.getIdToken()

              const verifyResponse = await fetch(
                '/api/razorpay/verify-payment',
                {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${verifyToken}`,
                  },
                  body: JSON.stringify({
                    firestoreOrderId: id,
                    razorpayPaymentId:
                      paymentResponse.razorpay_payment_id,
                    razorpayOrderId:
                      paymentResponse.razorpay_order_id,
                    razorpaySignature:
                      paymentResponse.razorpay_signature,
                  }),
                }
              )

              const verifyData = await verifyResponse.json()

              if (!verifyResponse.ok || !verifyData.success) {
                throw new Error(
                  verifyData.error || 'Payment verification failed'
                )
              }

              paymentCompletedRef.current = true

              localStorage.removeItem(PENDING_ORDER_KEY)

              clearCart()

              checkoutBusyRef.current = false
              retryVerificationRef.current = null
              setStep('done')
            } catch (err) {
              console.error(
                'Payment verification failed:',
                err
              )

              toast.error(
                err.message || 'Payment verification failed'
              )
              setStep('verification_error')
            } finally {
              verificationBusyRef.current = false
            }
          }
          retryVerificationRef.current = verifyPayment
          await verifyPayment()
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
    const id = await createOrder('cash')

    checkoutBusyRef.current = false
    if (id) {
      localStorage.removeItem(PENDING_ORDER_KEY)
      clearCart()
      setStep('cash_pending')
    } else {
      setStep('method')
    }
  }

  const releaseOrder = async (id) => {
    if (!id) return

    try {
      await runTransaction(db, async (tx) => {
        const orderRef2 = doc(db, 'orders', id)
        const orderSnap = await tx.get(orderRef2)

        // Only draft/pending orders can have their reservation released.
        if (
          !orderSnap.exists() ||
          (
            orderSnap.data().status !== 'pending' &&
            orderSnap.data().status !== 'draft'
          )
        ) {
          return
        }

        const orderData = orderSnap.data()

        const productRefs = (orderData.items || [])
          .filter(it => it.productId)
          .map(it => doc(db, 'products', it.productId))

        const productSnaps = await Promise.all(
          productRefs.map(ref => tx.get(ref))
        )

        productSnaps.forEach((snap, i) => {
          if (!snap.exists()) return

          const data = snap.data()
          const qty = orderData.items[i]?.qty || 0

          tx.update(productRefs[i], {
            reserved: Math.max(
              0,
              (data.reserved || 0) - qty
            ),
          })
        })

        tx.update(orderRef2, {
          status: 'cancelled',
          cancelledBy: 'customer',
        })
      })
    } catch (err) {
      console.error(
        `Could not release order ${id}:`,
        err
      )
    }

    localStorage.removeItem(PENDING_ORDER_KEY)
  }

  const handleCancelOrder = async () => {
    if (!orderId) {
      resetAndClose(false)
      return
    }

    setCancelling(true)

    await releaseOrder(orderId)

    toast('Order cancelled', {
      icon: '✕',
    })

    setCancelling(false)
    setStep('cart')
    setOrderId(null)
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

  return (
    <AnimatePresence>
      {open && <motion.div key="checkout-backdrop" {...reveal}
        onClick={handleClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.65)',
          zIndex: 40,
          backdropFilter: 'blur(3px)',
        }}
      />}

      {open && <motion.aside className="live-checkout" key="checkout-drawer" role="dialog" tabIndex={-1} aria-modal="true" aria-label="Checkout"
        initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={drawerTransition}
        style={{
          position: 'fixed',
          right: 0,
          top: 0,
          bottom: 0,
          width: '100%',
          maxWidth: 420,
          background: 'var(--surface)',
          borderLeft: '1px solid var(--border)',
          zIndex: 50,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >

        {/* Header */}
        <div
          style={{
            padding: '18px 20px 14px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexShrink: 0,
          }}
        >
          <h2
            style={{
              fontFamily: 'Syne',
              fontSize: 19,
              fontWeight: 700,
            }}
          >
            {step === 'cart' && 'Your Cart'}
            {step === 'method' && 'Choose Payment'}
            {step === 'payment' && 'Payment'}
            {step === 'confirming' && 'Confirming Order'}
            {step === 'verification_error' && 'Confirmation Pending'}
            {step === 'creating_cash' && 'Placing Order'}
            {step === 'cancelling_payment' && 'Closing Payment'}
            {step === 'cash_pending' && 'Pay by Cash'}
            {step === 'done' && 'Order Placed!'}
          </h2>

          <motion.button whileTap={press}
            onClick={handleClose}
            disabled={checkoutLocked}
            aria-label="Close checkout"
            style={{
              background: 'var(--surface2)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: 6,
              color: 'var(--text)',
              display: 'flex',
              opacity: checkoutLocked ? 0.35 : 1,
            }}
          >
            <X size={17} />
          </motion.button>
        </div>

        {/* Content */}
        <div
          className="custom-scrollbar"
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            padding: '16px 20px',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          <motion.div key={step} {...reveal} style={{ minHeight: '100%' }}>
          {checkoutLocked && (
            <CheckoutStatus
              step={step}
              orderId={orderId}
              onRetry={() => retryVerificationRef.current?.()}
            />
          )}
          {/* CART */}
          {step === 'cart' && (
            <>
              {cartProducts.length === 0 ? (
                <div
                  style={{
                    textAlign: 'center',
                    padding: '80px 20px',
                    color: 'var(--text-hint)',
                  }}
                >
                  <ShoppingCart
                    size={48}
                    style={{
                      opacity: 0.2,
                      margin: '0 auto 16px',
                      display: 'block',
                    }}
                  />

                  <p
                    style={{
                      fontSize: 15,
                      fontFamily: 'Syne',
                      fontWeight: 600,
                      color: 'var(--text-secondary)',
                    }}
                  >
                    Your cart is empty
                  </p>

                  <p
                    style={{
                      fontSize: 13,
                      marginTop: 4,
                    }}
                  >
                    Add some snacks to get started!
                  </p>
                </div>
              ) : (
                <>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      background: 'var(--surface2)',
                      borderRadius: 10,
                      padding: '8px 12px',
                      marginBottom: 14,
                      fontSize: 13,
                      color: 'var(--text-secondary)',
                    }}
                  >
                    Ordering as{' '}
                    <strong
                      style={{
                        color: 'var(--text)',
                      }}
                    >
                      {customerName}
                    </strong>
                  </div>

                  {cartProducts.map(p => (
                    <div
                      key={p.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '11px 0',
                        borderBottom:
                          '1px solid var(--border)',
                      }}
                    >
                      <div>
                        <div
                          style={{
                            fontWeight: 500,
                            fontSize: 14,
                          }}
                        >
                          {p.name}
                        </div>

                        <div
                          style={{
                            fontSize: 12,
                            color: 'var(--text-secondary)',
                            marginTop: 2,
                          }}
                        >
                          ₹{p.price} × {items[p.id]}
                        </div>
                      </div>

                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                        }}
                      >
                        <span
                          style={{
                            fontFamily: 'Syne',
                            fontWeight: 700,
                            fontSize: 15,
                          }}
                        >
                          ₹{p.price * items[p.id]}
                        </span>

                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 2,
                            background: 'var(--surface2)',
                            borderRadius: 8,
                          }}
                        >
                          <motion.button whileTap={press}
                            onClick={() =>
                              decrementFromCart(p.id)
                            }
                            style={{
                              background: 'none',
                              border: 'none',
                              padding: '6px 9px',
                              color: 'var(--text)',
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'flex',
                            }}
                          >
                            −
                          </motion.button>

                          <span
                            style={{
                              fontWeight: 700,
                              fontSize: 13,
                              minWidth: 16,
                              textAlign: 'center',
                            }}
                          >
                            {items[p.id]}
                          </span>

                          <motion.button whileTap={press}
                            onClick={() =>
                              addToCart(p, 1)
                            }
                            disabled={
                              (p.visibleStock ??
                                p.stock ??
                                0) -
                                items[p.id] <=
                              0
                            }
                            style={{
                              background: 'none',
                              border: 'none',
                              padding: '6px 9px',
                              color: 'var(--text)',
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'flex',
                              opacity:
                                (p.visibleStock ??
                                  p.stock ??
                                  0) -
                                  items[p.id] <=
                                0
                                  ? 0.35
                                  : 1,
                            }}
                          >
                            +
                          </motion.button>
                        </div>

                        <motion.button whileTap={press}
                          onClick={() =>
                            removeFromCart(p.id)
                          }
                          style={{
                            background:
                              'var(--danger-dim)',
                            border: 'none',
                            borderRadius: 6,
                            padding: 6,
                            color: 'var(--danger)',
                            display: 'flex',
                          }}
                        >
                          <Trash2 size={13} />
                        </motion.button>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </>
          )}

          {/* METHOD CHOICE */}
          {step === 'method' && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              <div
                style={{
                  display: 'inline-flex',
                  gap: 12,
                  background: 'var(--surface2)',
                  borderRadius: 100,
                  padding: '8px 20px',
                  marginBottom: 6,
                  fontSize: 13,
                  alignItems: 'center',
                  alignSelf: 'center',
                }}
              >
                <span
                  style={{
                    color: 'var(--text-secondary)',
                  }}
                >
                  {cartProducts.length} item
                  {cartProducts.length > 1 ? 's' : ''}
                </span>

                <span
                  style={{
                    width: 1,
                    height: 14,
                    background: 'var(--border)',
                  }}
                />

                <span
                  style={{
                    fontFamily: 'Syne',
                    fontWeight: 800,
                    color: 'var(--accent)',
                    fontSize: 16,
                  }}
                >
                  ₹{total}
                </span>
              </div>

              <motion.button whileTap={press}
                onClick={handleChooseUPI}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '16px 18px',
                  background: 'var(--surface2)',
                  border: '1px solid var(--border)',
                  borderRadius: 14,
                  textAlign: 'left',
                  color: 'var(--text)',
                  cursor: 'pointer',
                }}
              >
                <div
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 10,
                    background: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    fontWeight: 800,
                    color: '#111',
                    fontSize: 13,
                  }}
                >
                  UPI
                </div>

                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      fontFamily: 'Syne',
                      fontWeight: 700,
                      fontSize: 14,
                    }}
                  >
                    Pay by UPI
                  </div>

                  <div
                    style={{
                      fontSize: 12,
                      color: 'var(--text-secondary)',
                    }}
                  >
                    Secure Razorpay payment
                  </div>
                </div>

                <ArrowRight
                  size={15}
                  color="var(--text-hint)"
                />
              </motion.button>

              <motion.button whileTap={press}
                onClick={handleChooseCash}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '16px 18px',
                  background: 'var(--surface2)',
                  border: '1px solid var(--border)',
                  borderRadius: 14,
                  textAlign: 'left',
                  color: 'var(--text)',
                  cursor: 'pointer',
                }}
              >
                <div
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 10,
                    background: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Banknote
                    size={18}
                    color="var(--success)"
                  />
                </div>

                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      fontFamily: 'Syne',
                      fontWeight: 700,
                      fontSize: 14,
                    }}
                  >
                    Pay by Cash
                  </div>

                  <div
                    style={{
                      fontSize: 12,
                      color: 'var(--text-secondary)',
                    }}
                  >
                    Pay the admin directly on pickup
                  </div>
                </div>

                <ArrowRight
                  size={15}
                  color="var(--text-hint)"
                />
              </motion.button>

              <motion.button whileTap={press}
                onClick={() => setStep('cart')}
                style={{
                  marginTop: 4,
                  padding: 10,
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-hint)',
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                ← Back to cart
              </motion.button>
            </div>
          )}

          {/* CASH PENDING */}
          {step === 'cash_pending' && (
            <div
              style={{
                textAlign: 'center',
                padding: '50px 20px',
              }}
            >
              <Banknote
                size={62}
                color="var(--success)"
                style={{
                  margin: '0 auto 16px',
                  display: 'block',
                }}
              />

              <h3
                style={{
                  fontFamily: 'Syne',
                  fontSize: 22,
                  fontWeight: 800,
                  marginBottom: 10,
                }}
              >
                Order placed!
              </h3>

              <p
                style={{
                  color: 'var(--text-secondary)',
                  fontSize: 14,
                  lineHeight: 1.7,
                  maxWidth: 280,
                  margin: '0 auto',
                }}
              >
                Pay{' '}
                <strong
                  style={{
                    color: 'var(--accent)',
                  }}
                >
                  ₹{finalTotal}
                </strong>{' '}
                in cash to the admin on pickup.
                The admin will verify and confirm
                your order — stock updates
                automatically once confirmed.
              </p>

              <div
                style={{
                  background: 'var(--surface2)',
                  borderRadius: 12,
                  padding: '12px 16px',
                  marginTop: 20,
                  fontSize: 13,
                  color: 'var(--text-secondary)',
                }}
              >
                Order by{' '}
                <strong
                  style={{
                    color: 'var(--text)',
                  }}
                >
                  {finalName}
                </strong>{' '}
                ·{' '}
                <strong
                  style={{
                    color: 'var(--accent)',
                    fontFamily: 'Syne',
                  }}
                >
                  ₹{finalTotal}
                </strong>
              </div>

              <motion.button whileTap={press}
                onClick={() => resetAndClose()}
                style={{
                  marginTop: 24,
                  padding: '11px 28px',
                  background: 'var(--accent)',
                  color: 'var(--accent-text)',
                  borderRadius: 100,
                  fontFamily: 'Syne',
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: 'pointer',
                }}
              >
                Back to shop
              </motion.button>
            </div>
          )}

          {/* DONE */}
          {step === 'done' && (
            <div
              style={{
                textAlign: 'center',
                padding: '50px 20px',
              }}
            >
              <CheckCircle
                size={62}
                color="var(--success)"
                style={{
                  margin: '0 auto 16px',
                  display: 'block',
                }}
              />

              <h3
                style={{
                  fontFamily: 'Syne',
                  fontSize: 22,
                  fontWeight: 800,
                  marginBottom: 10,
                }}
              >
                Payment successful!
              </h3>

              <p
                style={{
                  color: 'var(--text-secondary)',
                  fontSize: 14,
                  lineHeight: 1.7,
                  maxWidth: 280,
                  margin: '0 auto',
                }}
              >
                Your payment has been verified
                and your order has been placed.
              </p>

              <div
                style={{
                  background: 'var(--surface2)',
                  borderRadius: 12,
                  padding: '12px 16px',
                  marginTop: 20,
                  fontSize: 13,
                  color: 'var(--text-secondary)',
                }}
              >
                Order by{' '}
                <strong
                  style={{
                    color: 'var(--text)',
                  }}
                >
                  {finalName}
                </strong>{' '}
                ·{' '}
                <strong
                  style={{
                    color: 'var(--accent)',
                    fontFamily: 'Syne',
                  }}
                >
                  ₹{finalTotal}
                </strong>
              </div>

              <motion.button whileTap={press}
                onClick={() => resetAndClose()}
                style={{
                  marginTop: 24,
                  padding: '11px 28px',
                  background: 'var(--accent)',
                  color: 'var(--accent-text)',
                  borderRadius: 100,
                  fontFamily: 'Syne',
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: 'pointer',
                }}
              >
                Back to shop
              </motion.button>
            </div>
          )}
          </motion.div>
        </div>

        {/* CART FOOTER */}
        {step === 'cart' &&
          cartProducts.length > 0 && (
            <div
              style={{
                padding: '14px 20px',
                borderTop: '1px solid var(--border)',
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: 12,
                }}
              >
                <span
                  style={{
                    color: 'var(--text-secondary)',
                    fontSize: 14,
                  }}
                >
                  Total
                </span>

                <span
                  style={{
                    fontFamily: 'Syne',
                    fontWeight: 800,
                    fontSize: 22,
                  }}
                >
                  ₹{total}
                </span>
              </div>

              <motion.button whileTap={press}
                onClick={handleProceed}
                style={{
                  width: '100%',
                  padding: 13,
                  borderRadius: 12,
                  background: 'var(--accent)',
                  color: 'var(--accent-text)',
                  fontFamily: 'Syne',
                  fontWeight: 700,
                  fontSize: 15,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  cursor: 'pointer',
                }}
              >
                Proceed to pay
                <ArrowRight size={16} />
              </motion.button>
            </div>
          )}
      </motion.aside>}
    </AnimatePresence>
  )
}

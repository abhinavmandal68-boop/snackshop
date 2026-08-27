import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react'
import { doc, runTransaction } from 'firebase/firestore'
import { db } from './firebase'
import { useAuth } from './AuthContext'

const CartContext = createContext(null)

export function CartProvider({ children }) {
  const [items, setItems] = useState({})
  const { user } = useAuth()
  const itemsRef = useRef(items)
  itemsRef.current = items

  // Reserve `qty` more of `product` for THIS cart, the moment it's added.
  // Returns { success, remaining, depleted, message } so the UI can tell
  // the customer exactly what happened — including "you just took the
  // last one" — using the live count from inside the same transaction,
  // not a stale read from before the update.
  const addToCart = useCallback(async (product, qty) => {
    if (!user) return { success: false, message: 'Sign in to add items to your cart' }
    const ref = doc(db, 'products', product.id)
    let remaining = null
    try {
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref)
        if (!snap.exists()) throw new Error(`${product.name} is no longer available`)
        const data = snap.data()
        const available = (data.stock || 0) - (data.reserved || 0)
        if (available < qty) {
          throw new Error(
            available <= 0
              ? `${product.name} just sold out`
              : `Only ${available} ${product.name} left`
          )
        }
        const newReserved = (data.reserved || 0) + qty
        tx.update(ref, { reserved: newReserved })
        remaining = (data.stock || 0) - newReserved
      })
    } catch (err) {
      return { success: false, message: err.message }
    }
    setItems(prev => ({ ...prev, [product.id]: (prev[product.id] || 0) + qty }))
    const depleted = remaining === 0
    return {
      success: true,
      remaining,
      depleted,
      message: depleted ? `That's all we had of ${product.name} — added to your cart` : null,
    }
  }, [user])

  const releaseReservation = useCallback(async (productId, qty) => {
    if (qty <= 0) return
    const ref = doc(db, 'products', productId)
    try {
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref)
        if (!snap.exists()) return
        const data = snap.data()
        tx.update(ref, { reserved: Math.max(0, (data.reserved || 0) - qty) })
      })
    } catch (err) {
      console.error(`Could not release reservation for ${productId}:`, err)
    }
  }, [])

  const decrementFromCart = useCallback(async (productId) => {
    const current = itemsRef.current[productId] || 0
    if (current <= 0) return
    setItems(prev => {
      const c = prev[productId] || 0
      if (c <= 1) { const next = { ...prev }; delete next[productId]; return next }
      return { ...prev, [productId]: c - 1 }
    })
    await releaseReservation(productId, 1)
  }, [releaseReservation])

  const removeFromCart = useCallback(async (productId) => {
    const qty = itemsRef.current[productId] || 0
    setItems(prev => { const next = { ...prev }; delete next[productId]; return next })
    await releaseReservation(productId, qty)
  }, [releaseReservation])

  // `release: true` (default) — cart was abandoned/emptied by the user, so
  // give every reserved unit back. Pass `release: false` right after an
  // order is created (CartDrawer.createOrder): the order doc now OWNS the
  // reservation, so clearing local cart state must NOT also decrement
  // `reserved` — that would free stock the pending order still holds.
  // If the order is later cancelled, releaseOrder() gives it back and the
  // customer sees it available again automatically (live listener).
  const clearCart = useCallback(async ({ release = true } = {}) => {
    const snapshot = itemsRef.current
    setItems({})
    if (release) {
      await Promise.all(
        Object.entries(snapshot).map(([productId, qty]) => releaseReservation(productId, qty))
      )
    }
  }, [releaseReservation])

  useEffect(() => {
    const releaseAll = () => {
      Object.entries(itemsRef.current).forEach(([productId, qty]) => {
        releaseReservation(productId, qty)
      })
    }
    window.addEventListener('beforeunload', releaseAll)
    return () => window.removeEventListener('beforeunload', releaseAll)
  }, [releaseReservation])

  useEffect(() => {
    if (!user) {
      const snapshot = itemsRef.current
      Object.entries(snapshot).forEach(([productId, qty]) => releaseReservation(productId, qty))
      setItems({})
    }
  }, [user, releaseReservation])

  const totalItems = Object.values(items).reduce((s, v) => s + v, 0)

  return (
    <CartContext.Provider value={{ items, addToCart, decrementFromCart, removeFromCart, clearCart, totalItems }}>
      {children}
    </CartContext.Provider>
  )
}

export const useCart = () => useContext(CartContext)
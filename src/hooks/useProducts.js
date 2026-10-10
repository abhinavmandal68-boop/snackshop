import { useState, useEffect, useCallback, useRef } from 'react'
import { collection, onSnapshot, getDocsFromServer } from 'firebase/firestore'
import { getAuth, onAuthStateChanged } from 'firebase/auth'
import { db } from '../lib/firebase'

export function useProducts() {
  const [rawProducts, setRawProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const sessionRef = useRef(0)

  const refreshProducts = useCallback(async () => {
    const user = getAuth().currentUser
    const session = sessionRef.current
    if (!user) return
    try {
      // Checkout has committed its reservation/payment before this server read.
      const snap = await getDocsFromServer(collection(db, 'products'))
      if (session !== sessionRef.current || getAuth().currentUser?.uid !== user.uid) return
      setRawProducts(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })))
      setError(null)
      setLoading(false)
    } catch (err) {
      // An inventory read must never turn a completed purchase into a failure.
      // The existing live listener continues to reconcile stock on reconnect.
      console.warn('Could not refresh stock after checkout:', err.code)
    }
  }, [])

  useEffect(() => {
    const auth = getAuth()
    let pUnsub = null

    // Firestore rules require isSignedIn() to read /products, so don't
    // attach the listener until we actually have an authenticated user —
    // otherwise every unauthenticated mount throws a permission-denied
    // error from Firestore.
    const authUnsub = onAuthStateChanged(auth, (user) => {
      sessionRef.current += 1
      // tear down any previous listener before re-subscribing
      if (pUnsub) {
        pUnsub()
        pUnsub = null
      }

      if (!user) {
        setRawProducts([])
        setLoading(false)
        return
      }

      setLoading(true)
      pUnsub = onSnapshot(
        collection(db, 'products'),
        (snap) => {
          const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
          setRawProducts(data)
          setError(null)
          setLoading(false)
        },
        (err) => {
          console.error('Firestore products error:', err)
          setError(err)
          setLoading(false)
        }
      )
    })

    return () => {
      sessionRef.current += 1
      authUnsub()
      if (pUnsub) pUnsub()
    }
  }, [])

  // `reserved` is an atomic counter on the product doc itself, updated inside
  // a Firestore transaction whenever an order is created or released (see
  // CartDrawer/MyOrders/AdminPage). Because it lives on the product doc and
  // is only ever changed transactionally, two people can never both "win"
  // the same last unit — the second transaction re-reads the fresh value
  // and correctly sees it as unavailable.
  const merged = rawProducts.map(p => ({
    ...p,
    visibleStock: Math.max(0, (p.stock || 0) - (p.reserved || 0)),
    reservedQty: p.reserved || 0,
  }))

  // Sort: in-stock items first (by category, then name), out-of-stock items after (same order)
  const products = [...merged].sort((a, b) => {
    const aOut = a.visibleStock <= 0 ? 1 : 0
    const bOut = b.visibleStock <= 0 ? 1 : 0
    if (aOut !== bOut) return aOut - bOut // in-stock (0) before out-of-stock (1)

    return (
      (a.category || '').localeCompare(b.category || '') ||
      (a.name || '').localeCompare(b.name || '')
    )
  })

  return { products, loading, error, refreshProducts }
}
import { useState, useEffect } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../lib/firebase'

export function useProducts() {
  const [rawProducts, setRawProducts] = useState([])
  const [pendingOrders, setPendingOrders] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Listen to products
    const pUnsub = onSnapshot(collection(db, 'products'), (snap) => {
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      data.sort((a, b) =>
        (a.category || '').localeCompare(b.category || '') ||
        (a.name || '').localeCompare(b.name || '')
      )
      setRawProducts(data)
      setLoading(false)
    }, (err) => {
      console.error('Firestore products error:', err)
      setLoading(false)
    })

    // Listen to pending + utr_submitted orders — these are "reserved" stock
    const oUnsub = onSnapshot(
      query(
        collection(db, 'orders'),
        where('status', 'in', ['pending', 'utr_submitted'])
      ),
      (snap) => {
        setPendingOrders(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      },
      (err) => console.error('Firestore pending orders error:', err)
    )

    return () => { pUnsub(); oUnsub() }
  }, [])

  // Calculate reserved quantity per product from pending orders
  const reservedQty = {}
  for (const order of pendingOrders) {
    for (const item of (order.items || [])) {
      if (item.productId) {
        reservedQty[item.productId] = (reservedQty[item.productId] || 0) + (item.qty || 0)
      }
    }
  }

  // Merge: visible stock = actual stock - reserved qty
  const products = rawProducts.map(p => ({
    ...p,
    visibleStock: Math.max(0, (p.stock || 0) - (reservedQty[p.id] || 0)),
    reservedQty: reservedQty[p.id] || 0,
  }))

  return { products, loading }
}

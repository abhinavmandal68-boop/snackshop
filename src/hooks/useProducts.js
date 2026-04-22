import { useState, useEffect } from 'react'
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore'
import { db } from '../lib/firebase'

export function useProducts() {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Real-time listener — Firestore pushes updates instantly to all browsers
    const q = query(collection(db, 'products'), orderBy('category'), orderBy('name'))
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      setProducts(data)
      setLoading(false)
    }, (err) => {
      console.error('Firestore error:', err)
      setLoading(false)
    })
    return () => unsub()
  }, [])

  return { products, loading }
}

import { useState, useEffect } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '../lib/firebase'

export function useProducts() {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // No orderBy — avoids needing a Firestore composite index
    const unsub = onSnapshot(collection(db, 'products'), (snap) => {
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      // Sort client-side instead
      data.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name))
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
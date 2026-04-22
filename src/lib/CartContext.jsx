import { createContext, useContext, useState, useCallback } from 'react'

const CartContext = createContext(null)

export function CartProvider({ children }) {
  const [items, setItems] = useState({})

  const addToCart = useCallback((product, qty) => {
    setItems(prev => ({ ...prev, [product.id]: (prev[product.id] || 0) + qty }))
  }, [])

  const removeFromCart = useCallback((productId) => {
    setItems(prev => { const next = { ...prev }; delete next[productId]; return next })
  }, [])

  const clearCart = useCallback(() => setItems({}), [])
  const totalItems = Object.values(items).reduce((s, v) => s + v, 0)

  return (
    <CartContext.Provider value={{ items, addToCart, removeFromCart, clearCart, totalItems }}>
      {children}
    </CartContext.Provider>
  )
}

export const useCart = () => useContext(CartContext)

import { useState } from 'react'
import { ShoppingCart, Minus, Plus, Zap } from 'lucide-react'
import toast from 'react-hot-toast'
import { useCart } from '../lib/CartContext'

const EMOJIS = {
  chips: ['🌶️', '🥔', '🔺', '🍿', '🌽', '⚡', '🧂', '🫙'],
  biscuits: ['🍪', '⚫', '🟡', '🥐', '🍩', '🧁', '🍫', '🥮'],
}

function getEmoji(product, index) {
  const pool = EMOJIS[product.category] || ['🛍️']
  return pool[index % pool.length]
}

function StockAlert({ stock }) {
  if (stock === 0) return null
  if (stock === 1) return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: '#ff5c5c', background: 'rgba(255,92,92,0.1)', padding: '3px 8px', borderRadius: 100, marginBottom: 8, fontFamily: 'Syne' }}>
      <Zap size={10} /> Last 1 available!
    </div>
  )
  if (stock === 2) return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: '#ff9f43', background: 'rgba(255,159,67,0.1)', padding: '3px 8px', borderRadius: 100, marginBottom: 8, fontFamily: 'Syne' }}>
      <Zap size={10} /> Only 2 left!
    </div>
  )
  if (stock <= 5) return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: '#ff9f43', background: 'rgba(255,159,67,0.1)', padding: '3px 8px', borderRadius: 100, marginBottom: 8, fontFamily: 'Syne' }}>
      <Zap size={10} /> Only {stock} left
    </div>
  )
  return null
}

export default function ProductCard({ product, index }) {
  const { items, addToCart } = useCart()
  const inCart = items[product.id] || 0
  const available = product.stock - inCart
  const [qty, setQty] = useState(1)
  const outOfStock = available <= 0
  const pct = product.stockMax > 0 ? (available / product.stockMax) * 100 : 0
  const barColor = pct > 40 ? '#2ecc71' : pct > 15 ? '#ff9f43' : '#ff5c5c'

  const handleAdd = () => {
    if (qty > available) { toast.error(`Only ${available} available`); return }
    addToCart(product, qty)
    toast.success(`Added ${qty}× ${product.name}`)
    setQty(1)
  }

  return (
    <div
      style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 16, display: 'flex', flexDirection: 'column', gap: 6, transition: 'border-color 0.2s', opacity: outOfStock ? 0.55 : 1 }}
      onMouseEnter={e => { if (!outOfStock) e.currentTarget.style.borderColor = 'rgba(245,200,66,0.35)' }}
      onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
    >
      <div style={{ fontSize: 32, marginBottom: 2 }}>{getEmoji(product, index)}</div>
      <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 15, lineHeight: 1.2 }}>{product.name}</div>
      <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'Syne', color: 'var(--accent)' }}>₹{product.price}</div>
      <StockAlert stock={available} />
      <div style={{ height: 3, background: 'var(--surface2)', borderRadius: 3, margin: '2px 0 6px' }}>
        <div style={{ height: 3, width: `${Math.max(0, pct)}%`, background: barColor, borderRadius: 3, transition: 'width 0.4s ease' }} />
      </div>
      {outOfStock ? (
        <div style={{ fontSize: 12, color: 'var(--text-hint)', fontStyle: 'italic', textAlign: 'center', padding: '6px 0' }}>Out of stock</div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
          <button onClick={() => setQty(q => Math.max(1, q - 1))} style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Minus size={13} />
          </button>
          <span style={{ minWidth: 24, textAlign: 'center', fontWeight: 600, fontSize: 14 }}>{qty}</span>
          <button onClick={() => setQty(q => Math.min(q + 1, available))} style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Plus size={13} />
          </button>
          <button onClick={handleAdd} style={{ flex: 1, height: 30, borderRadius: 8, background: 'var(--accent)', color: 'var(--accent-text)', fontSize: 12, fontWeight: 700, fontFamily: 'Syne', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
            <ShoppingCart size={12} /> Add
          </button>
        </div>
      )}
      {inCart > 0 && <div style={{ fontSize: 11, color: 'var(--accent)', textAlign: 'center' }}>{inCart} in cart</div>}
    </div>
  )
}

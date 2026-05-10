import { useState } from 'react'
import { ShoppingCart, Minus, Plus, Zap, Clock } from 'lucide-react'
import toast from 'react-hot-toast'
import { useCart } from '../lib/CartContext'

function NoImagePlaceholder() {
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{
        fontSize: 13,
        fontFamily: 'Syne',
        fontWeight: 700,
        color: 'rgba(255,255,255,0.1)',
        transform: 'rotate(-35deg)',
        letterSpacing: '0.08em',
        userSelect: 'none',
        whiteSpace: 'nowrap',
      }}>
        NO IMAGE
      </span>
    </div>
  )
}

function StockAlert({ stock, reserved }) {
  if (stock === 0 && reserved > 0) return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: '#ff9f43', background: 'rgba(255,159,67,0.1)', padding: '3px 8px', borderRadius: 100, marginBottom: 8, fontFamily: 'Syne' }}>
      <Clock size={10} /> {reserved} reserved
    </div>
  )
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
  const available = (product.visibleStock ?? product.stock) - inCart
  const [qty, setQty] = useState(1)

  const outOfStock = available <= 0
  const pct = product.stockMax > 0
    ? ((product.visibleStock ?? product.stock) / product.stockMax) * 100
    : 0
  const barColor = pct > 40 ? '#2ecc71' : pct > 15 ? '#ff9f43' : '#ff5c5c'

  const handleAdd = () => {
    if (qty > available) { toast.error(`Only ${available} available`); return }
    addToCart(product, qty)
    toast.success(`Added ${qty}x ${product.name}`)
    setQty(1)
  }

  return (
    <div
      style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden', display: 'flex', flexDirection: 'column', transition: 'border-color 0.2s, transform 0.15s', opacity: outOfStock ? 0.6 : 1 }}
      onMouseEnter={e => { if (!outOfStock) { e.currentTarget.style.borderColor = 'rgba(245,200,66,0.4)'; e.currentTarget.style.transform = 'translateY(-2px)' } }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.transform = 'none' }}
    >
      {/* Image area */}
      <div style={{ height: 140, background: 'var(--surface2)', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        {product.imageUrl
          ? <img src={product.imageUrl} alt={product.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.target.style.display = 'none' }} />
          : <NoImagePlaceholder />
        }
        {outOfStock && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
            <span style={{ color: 'white', fontFamily: 'Syne', fontWeight: 700, fontSize: 13, letterSpacing: '0.05em' }}>
              {product.reservedQty > 0 ? 'FULLY RESERVED' : 'OUT OF STOCK'}
            </span>
            {product.reservedQty > 0 && (
              <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11 }}>awaiting payment confirmation</span>
            )}
          </div>
        )}
      </div>

      {/* Info */}
      <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
        <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 15, lineHeight: 1.2 }}>{product.name}</div>
        <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'Syne', color: 'var(--accent)' }}>₹{product.price}</div>

        <StockAlert stock={available + inCart} reserved={product.reservedQty || 0} />

        <div style={{ height: 3, background: 'var(--surface2)', borderRadius: 3 }}>
          <div style={{ height: 3, width: `${Math.max(0, pct)}%`, background: barColor, borderRadius: 3, transition: 'width 0.4s ease' }} />
        </div>

        {!outOfStock && (
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

        {inCart > 0 && (
          <div style={{ fontSize: 11, color: 'var(--accent)', textAlign: 'center' }}>{inCart} in your cart</div>
        )}
      </div>
    </div>
  )
}

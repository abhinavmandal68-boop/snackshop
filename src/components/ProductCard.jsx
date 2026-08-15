import { useState } from 'react'
import toast from 'react-hot-toast'
import { useCart } from '../lib/CartContext'

export default function ProductCard({ product }) {
  const { items, addToCart } = useCart()
  const [qty, setQty] = useState(1)

  if (!product) return null // guard: never crash the page over one bad/missing item

  const inCart = items[product.id] || 0
  const available = (product.visibleStock ?? product.stock ?? 0) - inCart
  const outOfStock = available <= 0

  const handleIncrement = () => {
    if (qty >= available) {
      toast.error("That's all we have in stock at the moment")
      return
    }
    setQty(q => q + 1)
  }

  const handleAdd = () => {
    if (qty > available) { toast.error("That's all we have in stock at the moment"); return }
    addToCart(product, qty)
    toast.success(`Added ${qty}x ${product.name}`)
    setQty(1)
  }

  return (
    <div
      style={{
        background: '#141414',
        border: '1px solid #27272a',
        borderRadius: 16,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        opacity: outOfStock ? 0.6 : 1,
      }}
    >
      {/* Product Image */}
      <div
        style={{
          width: '100%',
          height: 140,
          background: product.bg || '#1e1e1e',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 12,
          position: 'relative',
        }}
      >
        {product.imageUrl || product.image ? (
          <img
            src={product.imageUrl || product.image}
            alt={product.name}
            style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }}
            onError={e => { e.target.style.display = 'none' }}
          />
        ) : (
          <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.15)', transform: 'rotate(-35deg)', letterSpacing: '0.08em' }}>NO IMAGE</span>
        )}
        {outOfStock && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: 'white', fontWeight: 700, fontSize: 12, letterSpacing: '0.05em' }}>OUT OF STOCK</span>
          </div>
        )}
      </div>

      {/* Card Content */}
      <div style={{ padding: 14, display: 'flex', flexDirection: 'column', flexGrow: 1 }}>
        <div style={{ minHeight: 44, marginBottom: 4 }}>
          <h3
            style={{
              fontFamily: 'Syne', fontWeight: 700, fontSize: 15, color: '#ffffff', margin: 0, lineHeight: 1.3,
              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
            }}
          >
            {product.name}
          </h3>
        </div>

        <div style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 18, color: '#ffd700', marginBottom: 8 }}>
          ₹{product.price}
        </div>

        {/* Stock badge */}
        <div style={{ minHeight: 24, marginBottom: 12 }}>
          {available > 0 && available <= 5 ? (
            <div
              style={{
                fontSize: 11, color: available <= 1 ? '#ef4444' : '#f59e0b',
                background: available <= 1 ? '#2c1212' : '#261c0c',
                padding: '3px 8px', borderRadius: 6, display: 'inline-block', fontWeight: 600,
              }}
            >
              ⚡ {available === 1 ? 'Last 1 available!' : `Only ${available} left!`}
            </div>
          ) : !outOfStock ? (
            <div style={{ height: 4, width: '100%', background: '#22c55e', borderRadius: 2, marginTop: 10 }} />
          ) : null}
        </div>

        {/* Bottom actions */}
        {!outOfStock && (
          <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 6, paddingTop: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', background: '#27272a', borderRadius: 8, padding: '4px 6px', gap: 8 }}>
              <button
                onClick={() => setQty(q => Math.max(1, q - 1))}
                style={{ background: 'none', border: 'none', color: '#a1a1aa', cursor: 'pointer', fontSize: 14, fontWeight: 700, padding: '0 4px' }}
              >
                -
              </button>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{qty}</span>
              <button
                onClick={handleIncrement}
                style={{ background: 'none', border: 'none', color: '#a1a1aa', cursor: 'pointer', fontSize: 14, fontWeight: 700, padding: '0 4px' }}
              >
                +
              </button>
            </div>

            <button
              onClick={handleAdd}
              style={{
                flexGrow: 1, background: '#ffd700', color: '#000000', border: 'none', borderRadius: 8,
                padding: '8px 10px', fontFamily: 'Syne', fontWeight: 700, fontSize: 13, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
              }}
            >
              Add
            </button>
          </div>
        )}

        {inCart > 0 && (
          <div style={{ fontSize: 11, color: '#ffd700', textAlign: 'center', marginTop: 6 }}>{inCart} in your cart</div>
        )}
      </div>
    </div>
  )
}
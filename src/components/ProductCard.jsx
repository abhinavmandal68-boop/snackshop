import { useState } from 'react'

export default function ProductCard({ product }) {
  const [qty, setQty] = useState(1)

  return (
    <div
      style={{
        background: '#141414',
        border: '1px solid #27272a',
        borderRadius: 16,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        height: '100%', // Forces all cards in a grid row to equal height
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
        }}
      >
        <img
          src={product.image}
          alt={product.name}
          style={{
            maxHeight: '100%',
            maxWidth: '100%',
            objectFit: 'contain',
          }}
        />
      </div>

      {/* Card Content Wrapper */}
      <div
        style={{
          padding: 14,
          display: 'flex',
          flexDirection: 'column',
          flexGrow: 1, // Fills available vertical height
        }}
      >
        {/* Fixed Title Block (Handles 1 vs 2 line titles smoothly) */}
        <div style={{ minHeight: 44, marginBottom: 4 }}>
          <h3
            style={{
              fontFamily: 'Syne',
              fontWeight: 700,
              fontSize: 15,
              color: '#ffffff',
              margin: 0,
              lineHeight: 1.3,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {product.name}
          </h3>
        </div>

        {/* Price */}
        <div
          style={{
            fontFamily: 'Syne',
            fontWeight: 800,
            fontSize: 18,
            color: '#ffd700',
            marginBottom: 8,
          }}
        >
          ₹{product.price}
        </div>

        {/* Stock Status Badge Slot (Consistent Height) */}
        <div style={{ minHeight: 24, marginBottom: 12 }}>
          {product.stock && product.stock <= 5 ? (
            <div
              style={{
                fontSize: 11,
                color: product.stock <= 1 ? '#ef4444' : '#f59e0b',
                background: product.stock <= 1 ? '#2c1212' : '#261c0c',
                padding: '3px 8px',
                borderRadius: 6,
                display: 'inline-block',
                fontWeight: 600,
              }}
            >
              ⚡ {product.stock === 1 ? 'Last 1 available!' : `Only ${product.stock} left!`}
            </div>
          ) : (
            <div
              style={{
                height: 4,
                width: '100%',
                background: '#22c55e',
                borderRadius: 2,
                marginTop: 10,
              }}
            />
          )}
        </div>

        {/* Bottom Actions Row — Locked to the Bottom */}
        <div
          style={{
            marginTop: 'auto', // Pushes this container directly to the bottom
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            paddingTop: 8,
          }}
        >
          {/* Quantity Selector */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              background: '#27272a',
              borderRadius: 8,
              padding: '4px 6px',
              gap: 8,
            }}
          >
            <button
              onClick={() => setQty(Math.max(1, qty - 1))}
              style={{
                background: 'none',
                border: 'none',
                color: '#a1a1aa',
                cursor: 'pointer',
                fontSize: 14,
                fontWeight: 700,
                padding: '0 4px',
              }}
            >
              -
            </button>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{qty}</span>
            <button
              onClick={() => setQty(qty + 1)}
              style={{
                background: 'none',
                border: 'none',
                color: '#a1a1aa',
                cursor: 'pointer',
                fontSize: 14,
                fontWeight: 700,
                padding: '0 4px',
              }}
            >
              +
            </button>
          </div>

          {/* Add Button */}
          <button
            style={{
              flexGrow: 1,
              background: '#ffd700',
              color: '#000000',
              border: 'none',
              borderRadius: 8,
              padding: '8px 10px',
              fontFamily: 'Syne',
              fontWeight: 700,
              fontSize: 13,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
            }}
          >
            🛒 Add
          </button>
        </div>
      </div>
    </div>
  )
}
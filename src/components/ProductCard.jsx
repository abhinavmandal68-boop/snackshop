import { useState } from 'react'
import toast from 'react-hot-toast'
import { useCart } from '../lib/CartContext'

export default function ProductCard({ product }) {
  const { items, addToCart } = useCart()
  const [qty, setQty] = useState(1)

  if (!product) return null

  const inCart = items[product.id] || 0

  const available =
    (product.visibleStock ?? product.stock ?? 0) -
    inCart

  const outOfStock = available <= 0

  const handleIncrement = () => {
    if (qty >= available) {
      toast.error(
        "That's all we have in stock at the moment"
      )
      return
    }

    setQty(q => q + 1)
  }

  const handleAdd = () => {
    if (qty > available) {
      toast.error(
        "That's all we have in stock at the moment"
      )
      return
    }

    addToCart(product, qty)

    toast.success(
      `Added ${qty}x ${product.name}`
    )

    setQty(1)
  }

  return (
    <div
      className="product-card"
      style={{
        background: '#141414',
        border: '1px solid #27272a',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        opacity: outOfStock ? 0.6 : 1,
      }}
    >

      {/* ================= PRODUCT IMAGE ================= */}

      <div
        className="product-image-container"
        style={{
          width: '100%',
          background: product.bg || '#1e1e1e',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
        }}
      >

        {product.imageUrl || product.image ? (

          <img
            src={product.imageUrl || product.image}
            alt={product.name}
            className="product-image"
            onError={e => {
              e.target.style.display = 'none'
            }}
          />

        ) : (

          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: 'rgba(255,255,255,0.15)',
              transform: 'rotate(-35deg)',
              letterSpacing: '0.08em',
            }}
          >
            NO IMAGE
          </span>

        )}

        {/* ================= OUT OF STOCK ================= */}

        {outOfStock && (

          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(0,0,0,0.65)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 8,
            }}
          >

            <span
              className="out-of-stock-text"
              style={{
                color: 'white',
                fontWeight: 700,
                letterSpacing: '0.05em',
                textAlign: 'center',
              }}
            >
              OUT OF STOCK
            </span>

          </div>

        )}

      </div>

      {/* ================= CARD CONTENT ================= */}

      <div
        className="product-card-content"
        style={{
          display: 'flex',
          flexDirection: 'column',
          flexGrow: 1,
          minWidth: 0,
        }}
      >

        {/* Product name */}

        <div
          className="product-name-container"
        >
          <h3
            className="product-name"
            style={{
              fontFamily: 'Syne',
              fontWeight: 700,
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
          className="product-price"
          style={{
            fontFamily: 'Syne',
            fontWeight: 800,
            color: '#ffd700',
          }}
        >
          ₹{product.price}
        </div>

        {/* ================= STOCK BADGE ================= */}

        <div className="stock-area">

          {available > 0 && available <= 5 ? (

            <div
              className="stock-badge"
              style={{
                color:
                  available <= 1
                    ? '#ef4444'
                    : '#f59e0b',

                background:
                  available <= 1
                    ? '#2c1212'
                    : '#261c0c',

                borderRadius: 6,
                display: 'inline-block',
                fontWeight: 600,
              }}
            >
              ⚡{' '}

              {available === 1
                ? 'Last 1 available!'
                : `Only ${available} left!`}
            </div>

          ) : !outOfStock ? (

            <div
              style={{
                height: 4,
                width: '100%',
                background: '#22c55e',
                borderRadius: 2,
                marginTop: 10,
              }}
            />

          ) : null}

        </div>

        {/* ================= BOTTOM ACTIONS ================= */}

        {!outOfStock && (

          <div
            className="product-actions"
            style={{
              marginTop: 'auto',
              display: 'flex',
              alignItems: 'center',
            }}
          >

            {/* Quantity selector */}

            <div
              className="quantity-selector"
              style={{
                display: 'flex',
                alignItems: 'center',
                background: '#27272a',
                borderRadius: 8,
                flexShrink: 0,
              }}
            >

              <button
                onClick={() =>
                  setQty(q =>
                    Math.max(1, q - 1)
                  )
                }
                className="quantity-button"
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#a1a1aa',
                  cursor: 'pointer',
                  fontWeight: 700,
                }}
                aria-label="Decrease quantity"
              >
                −
              </button>

              <span
                className="quantity-number"
                style={{
                  fontWeight: 700,
                  color: '#fff',
                  textAlign: 'center',
                }}
              >
                {qty}
              </span>

              <button
                onClick={handleIncrement}
                className="quantity-button"
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#a1a1aa',
                  cursor: 'pointer',
                  fontWeight: 700,
                }}
                aria-label="Increase quantity"
              >
                +
              </button>

            </div>

            {/* Add button */}

            <button
              onClick={handleAdd}
              className="product-add-button"
              style={{
                flexGrow: 1,
                background: '#ffd700',
                color: '#000000',
                border: 'none',
                borderRadius: 8,
                fontFamily: 'Syne',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minWidth: 0,
              }}
            >
              Add
            </button>

          </div>

        )}

        {/* ================= CART COUNT ================= */}

        {inCart > 0 && (

          <div
            className="product-cart-count"
            style={{
              color: '#ffd700',
              textAlign: 'center',
            }}
          >
            {inCart} in your cart
          </div>

        )}

      </div>
    </div>
  )
}
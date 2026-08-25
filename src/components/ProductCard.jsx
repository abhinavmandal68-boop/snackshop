import toast from 'react-hot-toast'
import { useCart } from '../lib/CartContext'

export default function ProductCard({ product }) {
  const { items, addToCart, decrementFromCart } = useCart()

  if (!product) return null

  const inCart = items[product.id] || 0

  const available =
    (product.visibleStock ?? product.stock ?? 0) -
    inCart

  const outOfStock = available <= 0

  const handleAdd = () => {
    if (available <= 0) {
      toast.error("That's all we have in stock at the moment")
      return
    }
    addToCart(product, 1)
  }

  const handleIncrement = () => {
    if (available <= 0) {
      toast.error("That's all we have in stock at the moment")
      return
    }
    addToCart(product, 1)
  }

  const handleDecrement = () => {
    decrementFromCart(product.id)
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
        opacity: outOfStock && inCart === 0 ? 0.6 : 1,
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

        {outOfStock && inCart === 0 && (

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

        {/* ================= ADD / STEPPER — Blinkit-style, anchored under the image ================= */}

        <div
          style={{
            position: 'absolute',
            bottom: -14,
            left: '50%',
            transform: 'translateX(-50%)',
            width: '78%',
            minWidth: 76,
          }}
        >
          {inCart > 0 ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: '#ffd700',
                borderRadius: 8,
                boxShadow: '0 2px 6px rgba(0,0,0,0.35)',
                padding: '0 2px',
              }}
            >
              <button
                onClick={handleDecrement}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#000',
                  fontWeight: 800,
                  fontSize: 15,
                  padding: '6px 10px',
                  cursor: 'pointer',
                  lineHeight: 1,
                }}
                aria-label="Remove one"
              >
                −
              </button>

              <span
                style={{
                  fontFamily: 'Syne',
                  fontWeight: 800,
                  color: '#000',
                  fontSize: 13,
                }}
              >
                {inCart}
              </span>

              <button
                onClick={handleIncrement}
                disabled={available <= 0}
                style={{
                  background: 'none',
                  border: 'none',
                  color: available <= 0 ? 'rgba(0,0,0,0.35)' : '#000',
                  fontWeight: 800,
                  fontSize: 15,
                  padding: '6px 10px',
                  cursor: available <= 0 ? 'not-allowed' : 'pointer',
                  lineHeight: 1,
                }}
                aria-label="Add one more"
              >
                +
              </button>
            </div>
          ) : !outOfStock ? (
            <button
              onClick={handleAdd}
              style={{
                width: '100%',
                background: '#ffd700',
                color: '#000000',
                border: 'none',
                borderRadius: 8,
                fontFamily: 'Syne',
                fontWeight: 700,
                fontSize: 13,
                padding: '7px 0',
                cursor: 'pointer',
                boxShadow: '0 2px 6px rgba(0,0,0,0.35)',
              }}
            >
              ADD
            </button>
          ) : null}
        </div>

      </div>

      {/* ================= CARD CONTENT ================= */}

      <div
        className="product-card-content"
        style={{
          display: 'flex',
          flexDirection: 'column',
          flexGrow: 1,
          minWidth: 0,
          paddingTop: 18,
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

      </div>
    </div>
  )
}
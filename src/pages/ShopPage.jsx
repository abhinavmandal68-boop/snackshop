import { useState, useEffect } from 'react'
import { ShoppingCart, LogOut } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { signOut } from 'firebase/auth'
import { auth } from '../lib/firebase'
import { useAuth } from '../lib/AuthContext'
import { CartProvider, useCart } from '../lib/CartContext'
import { useProducts } from '../hooks/useProducts'
import ProductCard from '../components/ProductCard'
import CartDrawer from '../components/CartDrawer'
import RequestForm from '../components/RequestForm'
import MyOrders from '../components/MyOrders'

function Shop() {
  const { products, loading } = useProducts()
  const { totalItems } = useCart()
  const { profile, user } = useAuth()

  const [tab, setTab] = useState('all')
  const [cartOpen, setCartOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  const filtered =
    tab === 'all'
      ? products
      : products.filter(p => p.category === tab)

  const displayName =
    profile?.name ||
    user?.displayName ||
    user?.email?.split('@')[0] ||
    profile?.email?.split('@')[0] ||
    'Customer'

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20)
    }

    window.addEventListener('scroll', handleScroll)

    return () => {
      window.removeEventListener('scroll', handleScroll)
    }
  }, [])

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--bg)',
        color: 'var(--text)',
      }}
    >
      {/* ================= HEADER ================= */}

      <motion.header
        animate={{
          boxShadow: scrolled
            ? '0 10px 30px rgba(0,0,0,0.5)'
            : '0 0 0px rgba(0,0,0,0)',
          backgroundColor: scrolled
            ? 'rgba(13, 13, 13, 0.95)'
            : 'rgba(14, 14, 14, 0.75)',
        }}
        transition={{ duration: 0.2 }}
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 40,
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div className="shop-header-inner">

          {/* Logo */}

          <span
            style={{
              fontFamily: 'Syne',
              fontWeight: 800,
              fontSize: 20,
              letterSpacing: '-0.02em',
              color: '#ffd700',
              whiteSpace: 'nowrap',
            }}
          >
            SnackShop
          </span>

          {/* Header right */}

          <div
            className="shop-header-actions"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            {/* Cart */}

            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.92 }}
              onClick={() => setCartOpen(true)}
              style={{
                padding: '7px 14px',
                background:
                  totalItems > 0
                    ? '#ffd700'
                    : 'var(--surface)',
                color:
                  totalItems > 0
                    ? '#000'
                    : 'var(--text)',
                border: '1px solid var(--border)',
                borderRadius: 100,
                fontFamily: 'Syne',
                fontWeight: 700,
                fontSize: 13,
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              <ShoppingCart size={14} />

              <motion.span
                key={totalItems}
                initial={{ scale: 1.3 }}
                animate={{ scale: 1 }}
              >
                {totalItems > 0
                  ? `${totalItems}`
                  : 'Cart'}
              </motion.span>
            </motion.button>

            {/* Logout */}

            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={() => signOut(auth)}
              title="Logout"
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 100,
                padding: '7px 10px',
                color: 'var(--text-hint)',
                display: 'flex',
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              <LogOut size={14} />
            </motion.button>
          </div>
        </div>
      </motion.header>

      {/* ================= MAIN ================= */}

      <main className="shop-main">

        {/* ================= HERO ================= */}

        <motion.div
          initial={{
            opacity: 0,
            y: 15,
          }}
          animate={{
            opacity: 1,
            y: 0,
          }}
          transition={{
            duration: 0.4,
          }}
          className="shop-hero"
        >
          <h1
            className="shop-title"
            style={{
              fontFamily: 'Syne',
              fontWeight: 800,
              lineHeight: 1.05,
            }}
          >
            Hey {displayName.split(' ')[0]}!
            <br />

            <span
              style={{
                color: '#ffd700',
              }}
            >
              What's snacking?
            </span>
          </h1>

          <p
            className="shop-subtitle"
            style={{
              color: 'var(--text-secondary)',
            }}
          >
            Live inventory · Pay by UPI · Instant confirmation
          </p>
        </motion.div>

        {/* ================= CATEGORY BAR ================= */}

        <div className="shop-categories">
          {[
            'all',
            'chips',
            'biscuits',
            'sweets',
            'namkeen',
          ].map(cat => (
            <button
              key={cat}
              onClick={() => setTab(cat)}
              style={{
                position: 'relative',
                padding: '8px 18px',
                borderRadius: 100,
                fontSize: 13,
                fontWeight: 600,
                fontFamily: 'Syne',
                whiteSpace: 'nowrap',
                background: 'transparent',
                color:
                  tab === cat
                    ? '#000'
                    : 'var(--text-secondary)',
                border: 'none',
                cursor: 'pointer',
                zIndex: 1,
                flexShrink: 0,
              }}
            >
              {tab === cat && (
                <motion.div
                  layoutId="activeCategoryPill"
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background: '#ffd700',
                    borderRadius: 100,
                    zIndex: -1,
                  }}
                  transition={{
                    type: 'spring',
                    stiffness: 400,
                    damping: 30,
                  }}
                />
              )}

              {cat === 'all'
                ? 'All Snacks'
                : cat.charAt(0).toUpperCase() +
                  cat.slice(1)}
            </button>
          ))}
        </div>

        {/* ================= PRODUCTS ================= */}

        {loading ? (
          <div className="products-grid">

            {[...Array(10)].map((_, i) => (
              <div
                key={i}
                className="product-skeleton"
              />
            ))}

          </div>
        ) : filtered.length === 0 ? (

          <div
            style={{
              textAlign: 'center',
              padding: '60px 20px',
              color: 'var(--text-hint)',
            }}
          >
            <p style={{ fontSize: 14 }}>
              No products in this category yet
            </p>
          </div>

        ) : (

          <AnimatePresence mode="wait">

            <motion.div
              layout
              className="products-grid"
            >
              {filtered.map((p, i) => (

                <motion.div
                  key={p.id}
                  layout
                  initial={{
                    opacity: 0,
                    y: 20,
                  }}
                  animate={{
                    opacity: 1,
                    y: 0,
                  }}
                  exit={{
                    opacity: 0,
                    scale: 0.9,
                  }}
                  transition={{
                    duration: 0.3,
                    delay: (i % 5) * 0.04,
                  }}
                  style={{
                    minWidth: 0,
                    height: '100%',
                  }}
                >
                  <ProductCard
                    product={p}
                    index={i}
                  />
                </motion.div>

              ))}
            </motion.div>

          </AnimatePresence>
        )}

        {/* ================= MY ORDERS ================= */}

        <div className="request-section-wrapper">
          <MyOrders />
        </div>

        {/* ================= REQUEST FORM ================= */}

        <div className="request-section-wrapper">
          <RequestForm />
        </div>

      </main>

      {/* ================= CART ================= */}

      <CartDrawer
        products={products}
        open={cartOpen}
        onClose={() => setCartOpen(false)}
      />

      <style>{`
        @keyframes pulse {
          0%, 100% {
            opacity: 1;
          }

          50% {
            opacity: 0.3;
          }
        }

        @keyframes shimmer {
          0%, 100% {
            opacity: 0.55;
          }

          50% {
            opacity: 0.22;
          }
        }

        div::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </div>
  )
}

export default function ShopPage() {
  return (
    <CartProvider>
      <Shop />
    </CartProvider>
  )
}
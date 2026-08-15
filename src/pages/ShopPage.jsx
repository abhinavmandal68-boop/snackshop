import { useState, useEffect } from 'react'
import { ShoppingCart, LogOut, User } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { signOut } from 'firebase/auth'
import { auth } from '../lib/firebase'
import { useAuth } from '../lib/AuthContext'
import { CartProvider, useCart } from '../lib/CartContext'
import { useProducts } from '../hooks/useProducts'
import ProductCard from '../components/ProductCard'
import CartDrawer from '../components/CartDrawer'
import RequestForm from '../components/RequestForm'

function Shop() {
  const { products, loading } = useProducts()
  const { totalItems } = useCart()
  const { profile } = useAuth()
  const [tab, setTab] = useState('all')
  const [cartOpen, setCartOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  const filtered = tab === 'all' ? products : products.filter(p => p.category === tab)
  const displayName = profile?.name || profile?.email?.split('@')[0] || 'Customer'

  // JS Scroll listener to mutate header styling smoothly
  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20)
    }
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)' }}>
      {/* Sticky Header with Dynamic Scroll Motion */}
      <motion.header 
        animate={{
          boxShadow: scrolled ? '0 10px 30px rgba(0,0,0,0.5)' : '0 0 0px rgba(0,0,0,0)',
          backgroundColor: scrolled ? 'rgba(13, 13, 13, 0.95)' : 'rgba(14, 14, 14, 0.75)'
        }}
        transition={{ duration: 0.2 }}
        style={{ 
          position: 'sticky', 
          top: 0, 
          zIndex: 40, 
          backdropFilter: 'blur(16px)', 
          borderBottom: '1px solid var(--border)' 
        }}
      >
        <div style={{ maxWidth: 700, margin: '0 auto', padding: '0 16px', height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 20, letterSpacing: '-0.02em', color: '#ffd700' }}>
            SnackShop
          </span>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ fontSize: 11, color: 'var(--text-hint)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#2ecc71', display: 'inline-block', animation: 'pulse 2s infinite' }} />
              <span className="hide-on-mobile">Live</span>
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 100, padding: '5px 10px', fontSize: 12, color: 'var(--text-secondary)' }}>
              <User size={12} />
              <span>{displayName}</span>
            </div>

            <motion.button
              whileTap={{ scale: 0.92 }}
              onClick={() => setCartOpen(true)}
              style={{ padding: '7px 14px', background: totalItems > 0 ? '#ffd700' : 'var(--surface)', color: totalItems > 0 ? '#000' : 'var(--text)', border: '1px solid var(--border)', borderRadius: 100, fontFamily: 'Syne', fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}
            >
              <ShoppingCart size={14} />
              {totalItems > 0 ? `${totalItems}` : 'Cart'}
            </motion.button>

            <button
              onClick={() => signOut(auth)}
              title="Logout"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 100, padding: '7px 10px', color: 'var(--text-hint)', display: 'flex', cursor: 'pointer' }}
            >
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </motion.header>

      <main style={{ maxWidth: 700, margin: '0 auto', padding: '24px 16px 48px' }}>
        {/* Animated Hero Banner */}
        <motion.div 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          style={{ marginBottom: 24 }}
        >
          <h1 style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 'clamp(22px, 5vw, 32px)', lineHeight: 1.1, marginBottom: 6 }}>
            Hey {displayName.split(' ')[0]}!<br />
            <span style={{ color: '#ffd700' }}>What's snacking?</span>
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Live inventory · Pay by UPI · Instant confirmation</p>
        </motion.div>

        {/* Swipeable Category Pill Filter Bar */}
        <div 
          style={{ 
            display: 'flex', 
            gap: 8, 
            marginBottom: 24, 
            overflowX: 'auto', 
            paddingBottom: 4, 
            scrollbarWidth: 'none',
            WebkitOverflowScrolling: 'touch' 
          }}
        >
          {['all', 'chips', 'biscuits', 'sweets', 'namkeen'].map(cat => (
            <motion.button 
              key={cat} 
              whileTap={{ scale: 0.95 }}
              onClick={() => setTab(cat)} 
              style={{ 
                padding: '8px 18px', 
                borderRadius: 100, 
                fontSize: 13, 
                fontWeight: 600, 
                fontFamily: 'Syne', 
                whiteSpace: 'nowrap',
                background: tab === cat ? '#ffd700' : 'var(--surface)', 
                color: tab === cat ? '#000' : 'var(--text-secondary)', 
                border: tab === cat ? '1px solid #ffd700' : '1px solid var(--border)', 
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
            >
              {cat === 'all' ? 'All Snacks' : cat.charAt(0).toUpperCase() + cat.slice(1)}
            </motion.button>
          ))}
        </div>

        {/* Product Grid with Scroll Reveals */}
        {loading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(145px, 1fr))', gap: 12 }}>
            {[...Array(6)].map((_, i) => (
              <div key={i} style={{ height: 260, background: 'var(--surface)', borderRadius: 16, animation: 'shimmer 1.4s ease infinite' }} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-hint)' }}>
            <p style={{ fontSize: 14 }}>No products in this category yet</p>
          </div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div 
              layout
              style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(145px, 1fr))', gap: 12 }}
            >
              {filtered.map((p, i) => (
                <motion.div
                  key={p.id}
                  initial={{ opacity: 0, y: 25 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-50px' }}
                  transition={{ duration: 0.35, delay: (i % 3) * 0.08 }}
                >
                  <ProductCard product={p} index={i} />
                </motion.div>
              ))}
            </motion.div>
          </AnimatePresence>
        )}

        <RequestForm />
      </main>

      <CartDrawer products={products} open={cartOpen} onClose={() => setCartOpen(false)} />

      {/* Global Embedded Styles for Animation and Mobile Tweaks */}
      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.3 } }
        @keyframes shimmer { 0%, 100% { opacity: .5 } 50% { opacity: .2 } }
        div::-webkit-scrollbar { display: none; }
        @media (max-width: 480px) {
          .hide-on-mobile { display: none; }
        }
      `}</style>
    </div>
  )
}

export default function ShopPage() {
  return <CartProvider><Shop /></CartProvider>
}
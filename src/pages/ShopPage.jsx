import { useState } from 'react'
import { ShoppingCart, LogOut, User } from 'lucide-react'
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

  const filtered = tab === 'all' ? products : products.filter(p => p.category === tab)
  const displayName = profile?.name || profile?.email?.split('@')[0] || 'Customer'

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <header style={{ position: 'sticky', top: 0, zIndex: 30, background: 'rgba(14,14,14,0.88)', backdropFilter: 'blur(12px)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ maxWidth: 700, margin: '0 auto', padding: '0 16px', height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {/* Brand — no emoji */}
          <span style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 20, letterSpacing: '-0.02em' }}>SnackShop</span>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ fontSize: 11, color: 'var(--text-hint)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#2ecc71', display: 'inline-block', animation: 'pulse 2s infinite' }} />
              Live
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 100, padding: '5px 10px', fontSize: 12, color: 'var(--text-secondary)' }}>
              <User size={11} />
              {displayName}
            </div>
            <button
              onClick={() => setCartOpen(true)}
              style={{ padding: '7px 14px', background: totalItems > 0 ? 'var(--accent)' : 'var(--surface)', color: totalItems > 0 ? 'var(--accent-text)' : 'var(--text)', border: '1px solid var(--border)', borderRadius: 100, fontFamily: 'Syne', fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 5, transition: 'all 0.2s' }}
            >
              <ShoppingCart size={14} />
              {totalItems > 0 ? `${totalItems}` : 'Cart'}
            </button>
            <button
              onClick={() => signOut(auth)}
              title="Logout"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 100, padding: '7px 10px', color: 'var(--text-hint)', display: 'flex' }}
            >
              <LogOut size={14} />
            </button>
          </div>
        </div>
        <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>
      </header>

      <main style={{ maxWidth: 700, margin: '0 auto', padding: '24px 16px 48px' }}>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 28, lineHeight: 1.1, marginBottom: 6 }}>
            Hey {displayName.split(' ')[0]}!<br />
            <span style={{ color: 'var(--accent)' }}>What's snacking?</span>
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Live inventory · Pay by UPI · Instant confirmation</p>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {['all', 'chips', 'biscuits', 'sweets', 'namkeen'].map(cat => (
            <button key={cat} onClick={() => setTab(cat)} style={{ padding: '7px 18px', borderRadius: 100, fontSize: 13, fontWeight: 600, fontFamily: 'Syne', background: tab === cat ? 'var(--accent)' : 'var(--surface)', color: tab === cat ? 'var(--accent-text)' : 'var(--text-secondary)', border: tab === cat ? '1px solid transparent' : '1px solid var(--border)', transition: 'all 0.15s', textTransform: 'capitalize' }}>
              {cat === 'all' ? 'All snacks' : cat}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
            {[...Array(6)].map((_, i) => (
              <div key={i} style={{ height: 260, background: 'var(--surface)', borderRadius: 'var(--radius)', animation: 'shimmer 1.4s ease infinite' }} />
            ))}
            <style>{`@keyframes shimmer { 0%,100%{opacity:.5} 50%{opacity:.2} }`}</style>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-hint)' }}>
            <p style={{ fontSize: 14 }}>No products in this category yet</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
            {filtered.map((p, i) => <ProductCard key={p.id} product={p} index={i} />)}
          </div>
        )}

        <RequestForm />
      </main>

      <CartDrawer products={products} open={cartOpen} onClose={() => setCartOpen(false)} />
    </div>
  )
}

export default function ShopPage() {
  return <CartProvider><Shop /></CartProvider>
}

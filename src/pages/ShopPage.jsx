import { useState, useEffect, useRef } from 'react'
import { ShoppingBag, ArrowRight } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { signOut } from 'firebase/auth'
import { doc, onSnapshot } from 'firebase/firestore'
import { auth, db } from '../lib/firebase'
import { useAuth } from '../lib/AuthContext'
import { CartProvider, useCart } from '../lib/CartContext'
import { useProducts } from '../hooks/useProducts'
import { cartTransition, drawerTransition, press, reveal } from '../lib/motion'
import ProductCard from '../components/ProductCard'
import CartDrawer from '../components/CartDrawer'
import RequestForm from '../components/RequestForm'
import MyOrders from '../components/MyOrders'
import ProfileMenu from '../components/ProfileMenu'
import HeaderSearch from '../components/HeaderSearch'
import useThemePreference from '../lib/useThemePreference'
import useRequestUpdateBadge from '../lib/useRequestUpdateBadge'

const categories = ['all', 'chips', 'biscuits', 'sweets', 'namkeen', 'noodles', 'drinks']

const normalizeSearchValue = value => String(value || '')
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/&/g, ' and ')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim()

const productMatchesSearch = (product, query) => {
  const normalizedQuery = normalizeSearchValue(query)
  if (!normalizedQuery) return true
  const searchable = normalizeSearchValue([
    product.name,
    product.category,
    product.demoBrand,
    product.demoLabel,
    product.demoFlavour,
    product.packSize,
  ].filter(Boolean).join(' '))
  const compactQuery = normalizedQuery.replace(/\s/g, '')
  const compactSearchable = searchable.replace(/\s/g, '')
  return searchable.includes(normalizedQuery)
    || compactSearchable.includes(compactQuery)
    || normalizedQuery.split(' ').every(token => searchable.includes(token) || compactSearchable.includes(token))
}

function ShopView({ products, loading = false, error, displayName = 'friend', shopOpen = true, onLogout, requestUpdateCount = 0, onRequestHistoryOpen, onOrderPlaced }) {
  const { theme, toggleTheme } = useThemePreference()
  const { totalItems, items } = useCart()
  const [tab, setTab] = useState('all')
  const [query, setQuery] = useState('')
  const [cartOpen, setCartOpen] = useState(false)
  const [profileRequestSignal, setProfileRequestSignal] = useState(0)
  const [requestDraft, setRequestDraft] = useState('')
  const productsGridRef = useRef(null)
  const hasSearchQuery = Boolean(normalizeSearchValue(query))
  const filtered = products.filter(p => (hasSearchQuery || tab === 'all' || p.category === tab) && productMatchesSearch(p, query))
  const cartProducts = products.filter(p => items[p.id])
  const total = cartProducts.reduce((sum, p) => sum + p.price * items[p.id], 0)

  const showFirstSearchResult = () => {
    productsGridRef.current?.querySelector('[data-search-result]')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  const openRequestComposer = () => {
    setRequestDraft(query.trim())
    setProfileRequestSignal(value => value + 1)
  }

  useEffect(() => {
    if (!query.trim() || filtered.length === 0) return undefined
    const followTimer = window.setTimeout(showFirstSearchResult, 260)
    return () => window.clearTimeout(followTimer)
  }, [query, filtered.length])

  useEffect(() => {
    if (!cartOpen) return
    const previousFocus = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const dialog = document.querySelector('.shop-shell [role="dialog"]')
    const focusable = () => [...(dialog?.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), [tabindex="0"]') || [])].filter(element => element.getClientRects().length)
    ;(focusable()[0] || dialog)?.focus()
    return () => {
      document.body.style.overflow = previousOverflow
      if (previousFocus?.isConnected) previousFocus.focus()
    }
  }, [cartOpen])

  return (
    <motion.div className="shop-shell" data-theme={theme} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.22 }}>
      <header className="store-header">
        <div className="shop-header-inner">
          <a className="store-brand" href="/" aria-label="SnackShop home"><span className="brand-stamp"><img src="/favicon.svg?v=3" alt="" aria-hidden="true" /></span>snackshop<span className="brand-period">.</span></a>
          <div className="shop-header-actions">
            <HeaderSearch query={query} onQueryChange={setQuery} onShowResults={showFirstSearchResult} onRequestProduct={openRequestComposer} resultCount={filtered.length} />
            <ProfileMenu displayName={displayName} theme={theme} onToggleTheme={toggleTheme} onLogout={onLogout} openRequestSignal={profileRequestSignal} requestUpdateCount={requestUpdateCount} onRequestHistoryOpen={onRequestHistoryOpen}
              requestFormContent={<RequestForm embedded showHistory={false} notifyUpdates={false} initialMessage={requestDraft} />}
              ordersContent={<MyOrders embedded />}
              requestsContent={<RequestForm historyOnly notifyUpdates={false} />}
            />
          </div>
        </div>
      </header>
      <main className="shop-main">
        <motion.section className="store-hero" {...reveal}>
          <div className="hero-copy">
            <div className="hero-intro">
              <span className="hero-greeting">Good to see you, {displayName.trim().split(/\s+/)[0] || 'friend'}.</span>
              <span className={`pickup-status ${shopOpen ? '' : 'closed'}`} role="status">
                <span className={`status-dot ${shopOpen ? '' : 'closed'}`} aria-hidden="true" />
                {shopOpen ? 'Pickup available' : 'Pickup paused'}
              </span>
            </div>
            <h1>The good stuff.<br /><span>On your time.</span></h1>
            <p>A little salty. A little sweet. Your everyday favourites,<br className="desktop-break" /> for noon cravings and midnight munchies.</p>
          </div>
        </motion.section>
        {!shopOpen && <p className="shop-notice">You can still place an order. Pickup will be available when the shop reopens.</p>}
        <section className="catalog-section" aria-label="Browse snacks">
          <div className="catalog-heading"><div><span className="eyebrow">ON THE SHELVES</span><h2>Find your favourite<span>.</span></h2></div></div>
          <div className="catalog-toolbar"><div className="shop-categories" aria-label="Categories">{categories.map(cat => <motion.button whileTap={press} key={cat} aria-pressed={tab === cat} className={`category-button ${tab === cat ? 'selected' : ''}`} onClick={() => setTab(cat)}>{tab === cat && <motion.span className="category-marker" layoutId="category-marker" transition={drawerTransition} />}{cat === 'all' ? 'Everything' : cat.charAt(0).toUpperCase() + cat.slice(1)}</motion.button>)}</div><span className="product-result-count">{loading ? 'Stocking the shelves…' : `${filtered.length} ${filtered.length === 1 ? 'item' : 'items'}`}</span></div>
          {error && <p className="shop-notice">We couldn't load the shelves. Please refresh to try again.</p>}
          <div className="products-grid" ref={productsGridRef}>
            {loading ? Array.from({ length: 8 }, (_, i) => <div className="product-skeleton" key={i} />) : <AnimatePresence mode="popLayout">{filtered.map(p => <motion.div key={p.id} data-search-result layout="position" {...reveal} style={{ minWidth: 0 }}><ProductCard product={p} /></motion.div>)}</AnimatePresence>}
          </div>
          {!loading && !error && filtered.length === 0 && <div className="catalog-empty"><h3>No snacks found.</h3><p>Try another name or request it from the shop.</p><div className="catalog-empty-actions">{query.trim() && <motion.button className="catalog-request-button" whileTap={press} onClick={openRequestComposer}>Request “{query.trim()}”</motion.button>}<motion.button whileTap={press} onClick={() => { setQuery(''); setTab('all') }}>Show everything</motion.button></div></div>}
        </section>
        <footer className="store-footer"><span className="footer-wordmark">snackshop.</span><span>A small shop for your everyday breaks.</span><span>Built by Abhinav.</span></footer>
      </main>
      <RequestForm notificationsOnly />
      <div className="bottom-cart-wrap">
        <AnimatePresence>
          {totalItems > 0 && <motion.button
            className="bottom-cart-bar"
            type="button"
            aria-label={`Open your cart, ${totalItems} ${totalItems === 1 ? 'item' : 'items'}, total ₹${total}`}
            initial={{ y: 22, opacity: 0, scale: 0.97 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 16, opacity: 0, scale: 0.98 }}
            transition={cartTransition}
            whileTap={press}
            onClick={() => setCartOpen(true)}
          >
            <span className="bottom-cart-icon" aria-hidden="true"><ShoppingBag size={20} strokeWidth={2.2} /></span>
            <span className="bottom-cart-copy">
              <strong>{`${totalItems} ${totalItems === 1 ? 'item' : 'items'}`}</strong>
              <span aria-live="polite">₹{total}</span>
            </span>
            <span className="bottom-cart-action">View cart <ArrowRight size={18} aria-hidden="true" /></span>
          </motion.button>}
        </AnimatePresence>
      </div>
      <CartDrawer onOrderPlaced={onOrderPlaced} products={products} shopOpen={shopOpen} open={cartOpen} onClose={() => setCartOpen(false)} />
    </motion.div>
  )
}

function LiveShop() {
  const { products, loading, error, refreshProducts } = useProducts()
  const { profile, user } = useAuth()
  const [shopOpen, setShopOpen] = useState(true)
  const { unreadCount, markRequestUpdatesRead } = useRequestUpdateBadge(user?.uid)
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'shopStatus'), snap => setShopOpen(snap.exists() ? snap.data().open !== false : true), err => console.error('Shop status error:', err))
    return unsub
  }, [])
  return <ShopView onOrderPlaced={refreshProducts} products={products} loading={loading} error={error} shopOpen={shopOpen} displayName={profile?.name || user?.displayName || user?.email?.split('@')[0] || 'friend'} onLogout={() => signOut(auth)} requestUpdateCount={unreadCount} onRequestHistoryOpen={markRequestUpdatesRead} />
}

export default function ShopPage() {
  return <CartProvider><LiveShop /></CartProvider>
}

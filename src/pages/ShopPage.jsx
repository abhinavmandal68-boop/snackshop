import { useState, useEffect, useRef } from 'react'
import { ShoppingBag, ArrowUpRight, ArrowRight, X } from 'lucide-react'
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
import useMediaQuery from '../lib/useMediaQuery'
import useRequestUpdateBadge from '../lib/useRequestUpdateBadge'

const categories = ['all', 'chips', 'biscuits', 'sweets', 'namkeen', 'drinks']

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

export function ShopView({ products, loading = false, error, displayName = 'friend', shopOpen = true, preview = false, onLogout, requestUpdateCount = 0, onRequestHistoryOpen }) {
  const { theme, toggleTheme } = useThemePreference()
  const isMobile = useMediaQuery('(max-width: 700px)')
  const { totalItems, items, addToCart, decrementFromCart } = useCart()
  const [tab, setTab] = useState('all')
  const [query, setQuery] = useState(() => preview && typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('q') || '' : '')
  const [cartOpen, setCartOpen] = useState(false)
  const [previewPayment, setPreviewPayment] = useState(false)
  const [previewRequestUpdateCount, setPreviewRequestUpdateCount] = useState(preview ? 1 : 0)
  const [profileRequestSignal, setProfileRequestSignal] = useState(0)
  const [requestDraft, setRequestDraft] = useState('')
  const productsGridRef = useRef(null)
  useEffect(() => { if (!cartOpen) setPreviewPayment(false) }, [cartOpen])
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
    const keepFocusInBag = event => {
      // The live checkout can hand focus to Razorpay's external modal.
      if (!preview || event.key !== 'Tab') return
      const elements = focusable()
      const first = elements[0]
      const last = elements[elements.length - 1]
      if (!first) { event.preventDefault(); dialog?.focus(); return }
      if (event.shiftKey && (document.activeElement === first || !dialog?.contains(document.activeElement))) { event.preventDefault(); last.focus() }
      if (!event.shiftKey && (document.activeElement === last || !dialog?.contains(document.activeElement))) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', keepFocusInBag)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', keepFocusInBag)
      if (previousFocus?.isConnected) previousFocus.focus()
    }
  }, [cartOpen, preview])

  return (
    <motion.div className="shop-shell" data-theme={theme} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.22 }}>
      {preview && <div className="preview-banner">LOCAL DESIGN PREVIEW <span>Sample products · no real orders or payments</span><a href="/admin-preview">View admin ↗</a><a href="/login">View login ↗</a></div>}
      <header className="store-header">
        <div className="shop-header-inner">
          <a className="store-brand" href={preview ? '/preview' : '/'} aria-label="SnackShop home"><span className="brand-stamp">S</span>snackshop<span className="brand-period">.</span></a>
          <span className="header-note">Your campus corner shop.</span>
          <div className="shop-header-actions">
            <HeaderSearch query={query} onQueryChange={setQuery} onShowResults={showFirstSearchResult} onRequestProduct={openRequestComposer} resultCount={filtered.length} preview={preview} />
            <ProfileMenu displayName={displayName} theme={theme} onToggleTheme={toggleTheme} onLogout={onLogout} preview={preview} openRequestSignal={profileRequestSignal} requestUpdateCount={preview ? previewRequestUpdateCount : requestUpdateCount} onRequestHistoryOpen={preview ? () => setPreviewRequestUpdateCount(0) : onRequestHistoryOpen}
              requestFormContent={preview ? <div className="profile-request-preview"><textarea rows="3" placeholder="Which snack should we stock?" defaultValue={requestDraft} /><button type="button" disabled>Send request</button></div> : <RequestForm embedded showHistory={false} notifyUpdates={false} initialMessage={requestDraft} />}
              ordersContent={preview ? <p className="profile-history-empty">No orders in the last 24 hours.</p> : <MyOrders embedded />}
              requestsContent={preview ? <p className="profile-history-empty">No requests in the last 48 hours.</p> : <RequestForm historyOnly notifyUpdates={false} />}
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
          <div className="hero-ticket" aria-label="Order, pay, pick up">
            <span className="ticket-kicker">THE SNACK BREAK CLUB</span>
            <div className="ticket-illustration" aria-hidden="true"><ShoppingBag size={63} strokeWidth={1.3} /><span className="ticket-star">✳</span></div>
            <span className="ticket-title">Small bag.<br />Big mood.</span>
            <span className="ticket-bottom">ORDER. PAY. PICK UP. <ArrowUpRight size={17} /></span>
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
        {preview && <div className="preview-community"><span className="eyebrow">SOMETHING MISSING?</span><h3>Open your profile to request a snack or review your account history.</h3><p>Your next favourite order belongs here.</p></div>}
        <footer className="store-footer"><span className="footer-wordmark">snackshop.</span><span>A small shop for your everyday breaks.</span><span>Built by Abhinav.</span></footer>
      </main>
      {!preview && <RequestForm notificationsOnly />}
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
      {preview ? <AnimatePresence>
        {cartOpen && <motion.div key="backdrop" className="preview-backdrop" {...reveal} onClick={() => setCartOpen(false)} />}
        {cartOpen && <motion.aside key="bag" className="preview-bag" role="dialog" tabIndex={-1} aria-modal="true" aria-label="Preview shopping bag" initial={isMobile ? { y: '100%', opacity: 0.8 } : { x: '100%', opacity: 0.8 }} animate={{ x: 0, y: 0, opacity: 1 }} exit={isMobile ? { y: '100%', opacity: 0.8 } : { x: '100%', opacity: 0.8 }} transition={cartTransition} onKeyDown={e => { if (e.key === 'Escape') setCartOpen(false) }}>
          <div className="preview-bag-heading"><h2>{previewPayment ? 'Choose payment' : <>Your bag <span>({totalItems})</span></>}</h2><motion.button whileTap={press} autoFocus aria-label="Close bag" onClick={() => setCartOpen(false)}><X /></motion.button></div>
          <div className="preview-bag-items">{previewPayment ? <div className="preview-payment-options"><span className="eyebrow">HOW WOULD YOU LIKE TO PAY?</span><p>This is a local preview. These options show the payment-selection state; no payment or order can be submitted.</p><motion.button disabled>Pay by UPI</motion.button><motion.button disabled>Cash on pickup</motion.button></div> : cartProducts.length ? cartProducts.map(p => <div className="preview-bag-row" key={p.id}><div><strong>{p.name}</strong><p>₹{p.price} each</p></div><div className="preview-stepper"><motion.button whileTap={press} aria-label={`Remove one ${p.name}`} onClick={() => decrementFromCart(p.id)}>−</motion.button><span>{items[p.id]}</span><motion.button whileTap={press} disabled={items[p.id] >= p.stock} aria-label={`Add one ${p.name}`} onClick={() => addToCart(p, 1)}>+</motion.button></div></div>) : <p>Your bag is waiting for something good.</p>}</div>
          <div className="preview-bag-footer"><div><span>Total</span><strong>₹{total}</strong></div><p>This is a design preview. Checkout is disabled; no orders will be created.</p><motion.button whileTap={press} disabled={totalItems === 0} onClick={() => setPreviewPayment(value => !value)}>{previewPayment ? 'Back to bag' : 'Proceed to pay'} <ArrowUpRight size={17} /></motion.button></div>
        </motion.aside>}
      </AnimatePresence> : <CartDrawer products={products} open={cartOpen} onClose={() => setCartOpen(false)} />}
    </motion.div>
  )
}

function LiveShop() {
  const { products, loading, error } = useProducts()
  const { profile, user } = useAuth()
  const [shopOpen, setShopOpen] = useState(true)
  const { unreadCount, markRequestUpdatesRead } = useRequestUpdateBadge(user?.uid)
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'shopStatus'), snap => setShopOpen(snap.exists() ? snap.data().open !== false : true), err => console.error('Shop status error:', err))
    return unsub
  }, [])
  return <ShopView products={products} loading={loading} error={error} shopOpen={shopOpen} displayName={profile?.name || user?.displayName || user?.email?.split('@')[0] || 'friend'} onLogout={() => signOut(auth)} requestUpdateCount={unreadCount} onRequestHistoryOpen={markRequestUpdatesRead} />
}

export default function ShopPage() {
  return <CartProvider><LiveShop /></CartProvider>
}

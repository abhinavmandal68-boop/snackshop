import { useState, useEffect, useRef, useCallback } from 'react'
import { ShoppingBag, ArrowRight, ChevronDown } from 'lucide-react'
import toast from 'react-hot-toast'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { signOut } from 'firebase/auth'
import { doc, onSnapshot } from 'firebase/firestore'
import { auth, db } from '../lib/firebase'
import { useAuth } from '../lib/AuthContext'
import { CartProvider, useCart } from '../lib/CartContext'
import { useProducts } from '../hooks/useProducts'
import { cartTransition, drawerTransition, press, reveal } from '../lib/motion'
import ProductCard from '../components/ProductCard'
import ProductSkeleton from '../components/ProductSkeleton'
import { money } from '../lib/orderPayments.mjs'
import CartDrawer from '../components/CartDrawer'
import RequestForm from '../components/RequestForm'
import MyOrders from '../components/MyOrders'
import ProfileMenu from '../components/ProfileMenu'
import HeaderSearch from '../components/HeaderSearch'
import useThemePreference from '../lib/useThemePreference'
import useRequestUpdateBadge from '../lib/useRequestUpdateBadge'
import { shopApi } from '../lib/shopApi'

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

export function ShopView({ products, loading = false, error, soldOutProducts = [], soldOutLoading = false, soldOutError, showSoldOut = false, setShowSoldOut, tab = 'all', setTab, displayName = 'friend', shopOpen = true, onLogout, requestUpdateCount = 0, onRequestHistoryOpen, onOrderPlaced }) {
  const { theme, toggleTheme } = useThemePreference()
  const reduceMotion = useReducedMotion()
  const { totalItems, items, storedProducts } = useCart()
  const [restockStatuses, setRestockStatuses] = useState({})
  const restockBusy = useRef(new Set())
  const [query, setQuery] = useState('')
  const [cartOpen, setCartOpen] = useState(false)
  const [profileRequestSignal, setProfileRequestSignal] = useState(0)
  const [requestDraft, setRequestDraft] = useState('')
  const productsGridRef = useRef(null)
  const hasSearchQuery = Boolean(normalizeSearchValue(query))
  const filtered = products.filter(p => (hasSearchQuery || tab === 'all' || p.category === tab) && productMatchesSearch(p, query))
  const filteredSoldOut = soldOutProducts.filter(p => (tab === 'all' || p.category === tab) && productMatchesSearch(p, query))
  // Retain cart lines when a live stock query removes a newly sold-out product.
  const cartProducts = Object.keys(items).map(id => products.find(p => p.id === id) || (storedProducts[id] && { ...storedProducts[id], stock: 0, visibleStock: 0 })).filter(Boolean)
  const total = cartProducts.reduce((sum, p) => sum + p.price * items[p.id], 0)

  const showFirstSearchResult = useCallback(() => {
    productsGridRef.current?.querySelector('[data-search-result]')?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' })
  }, [reduceMotion])

  useEffect(() => {
    if (!hasSearchQuery || loading || filtered.length === 0) return undefined
    const followTimer = window.setTimeout(showFirstSearchResult, 260)
    return () => window.clearTimeout(followTimer)
  }, [query, hasSearchQuery, loading, filtered.length, showFirstSearchResult])

  const openRequestComposer = () => {
    setRequestDraft(query.trim())
    setProfileRequestSignal(value => value + 1)
  }

  const requestRestock = async product => {
    if (restockBusy.current.has(product.id) || restockStatuses[product.id] === 'sent') return
    restockBusy.current.add(product.id)
    setRestockStatuses(previous => ({ ...previous, [product.id]: 'sending' }))
    try {
      const result = await shopApi('requestRestock', { productId: product.id, customerName: displayName })
      setRestockStatuses(previous => ({ ...previous, [product.id]: 'sent' }))
      toast.success(result.alreadyRequested ? 'You already requested this restock.' : `Restock request sent for ${product.name}.`)
    } catch (err) {
      setRestockStatuses(previous => ({ ...previous, [product.id]: 'idle' }))
      toast.error(err.message)
    } finally { restockBusy.current.delete(product.id) }
  }

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
          {hasSearchQuery && <div className="catalog-search-summary" role="status"><span>{loading ? 'Searching the shelves…' : `${filtered.length} ${filtered.length === 1 ? 'result' : 'results'} for`} <strong>“{query.trim()}”</strong></span><motion.button whileTap={press} onClick={() => setQuery('')}>Clear search</motion.button></div>}
          <div className="products-grid" ref={productsGridRef} aria-busy={loading}>
            {loading ? <>{Array.from({ length: 8 }, (_, i) => <ProductSkeleton key={i} />)}<span className="sr-only" role="status">Loading snacks…</span></> : <AnimatePresence initial={false} mode="popLayout">{filtered.map(p => <motion.div key={p.id} data-search-result layout="position" {...reveal} style={{ minWidth: 0 }}><ProductCard product={p} /></motion.div>)}</AnimatePresence>}
          </div>
          {!loading && !error && filtered.length === 0 && <div className="catalog-empty"><h3>No snacks found.</h3><p>Try another name or request it from the shop.</p><div className="catalog-empty-actions">{query.trim() && <motion.button className="catalog-request-button" whileTap={press} onClick={openRequestComposer}>Request “{query.trim()}”</motion.button>}<motion.button whileTap={press} onClick={() => { setQuery(''); setTab('all') }}>Show everything</motion.button></div></div>}
          <div className="sold-out-section">
            <motion.button type="button" className="sold-out-toggle" whileTap={press} aria-expanded={showSoldOut} aria-controls="sold-out-products" onClick={() => setShowSoldOut(value => !value)}>
              {showSoldOut ? 'Hide out-of-stock items' : 'Show out-of-stock items'}{tab !== 'all' ? ` in ${tab}` : ''}<ChevronDown size={16} style={{ transform: showSoldOut ? 'rotate(180deg)' : undefined }} aria-hidden="true" />
            </motion.button>
            {showSoldOut && <section id="sold-out-products" aria-label="Out-of-stock snacks" className="sold-out-catalog">
              <div className="sold-out-heading"><h3>Out of stock{tab !== 'all' ? ` · ${tab.charAt(0).toUpperCase() + tab.slice(1)}` : ''}</h3><p>Missing a favourite? Request a restock from the shop.</p></div>
              {soldOutError ? <p className="shop-notice" role="alert">We couldn't load out-of-stock items. Hide and reopen this section to try again.</p> : <>
                <div className="products-grid" aria-busy={soldOutLoading}>
                  {soldOutLoading ? <><ProductSkeleton /><ProductSkeleton /><span className="sr-only" role="status">Loading out-of-stock snacks…</span></> : filteredSoldOut.map(p => <ProductCard key={p.id} product={p} onRequestRestock={requestRestock} restockStatus={restockStatuses[p.id]} />)}
                </div>
                {!soldOutLoading && filteredSoldOut.length === 0 && <p className="sold-out-empty" role="status">{hasSearchQuery ? 'No out-of-stock items match your search in this section.' : 'No out-of-stock items in this section.'}</p>}
              </>}
            </section>}
          </div>
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
              <span aria-live="polite">{money(total)}</span>
            </span>
            <span className="bottom-cart-action">View cart <ArrowRight size={18} aria-hidden="true" /></span>
          </motion.button>}
        </AnimatePresence>
      </div>
      <CartDrawer onOrderPlaced={onOrderPlaced} products={cartProducts} shopOpen={shopOpen} open={cartOpen} onClose={() => setCartOpen(false)} />
    </motion.div>
  )
}

function LiveShop() {
  const [tab, setTab] = useState('all')
  const [showSoldOut, setShowSoldOut] = useState(false)
  const { products, loading, error, refreshProducts, soldOutProducts, soldOutLoading, soldOutError } = useProducts({ includeSoldOut: showSoldOut, category: tab })
  const { profile, user } = useAuth()
  const [shopOpen, setShopOpen] = useState(true)
  const { unreadCount, markRequestUpdatesRead } = useRequestUpdateBadge(user?.uid)
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'shopStatus'), snap => setShopOpen(snap.exists() ? snap.data().open !== false : true), err => console.error('Shop status error:', err))
    return unsub
  }, [])
  return <ShopView tab={tab} setTab={setTab} showSoldOut={showSoldOut} setShowSoldOut={setShowSoldOut} soldOutProducts={soldOutProducts} soldOutLoading={soldOutLoading} soldOutError={soldOutError} onOrderPlaced={refreshProducts} products={products} loading={loading} error={error} shopOpen={shopOpen} displayName={profile?.name || user?.displayName || user?.email?.split('@')[0] || 'friend'} onLogout={() => signOut(auth)} requestUpdateCount={unreadCount} onRequestHistoryOpen={markRequestUpdatesRead} />
}

export default function ShopPage() {
  return <CartProvider><LiveShop /></CartProvider>
}

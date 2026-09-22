import { useEffect, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { press, quickTransition } from '../lib/motion'

export default function HeaderSearch({ query, onQueryChange, onShowResults, onRequestProduct, resultCount, preview = false }) {
  const [open, setOpen] = useState(() => preview && typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('search') === 'open')
  const rootRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 80)
    const closeOnOutsidePress = event => {
      if (!rootRef.current?.contains(event.target)) setOpen(false)
    }
    const closeOnEscape = event => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsidePress)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      window.clearTimeout(focusTimer)
      document.removeEventListener('pointerdown', closeOnOutsidePress)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  return (
    <div className="header-search-root" ref={rootRef}>
      <motion.button
        type="button"
        className={`header-search-trigger ${query ? 'has-query' : ''}`}
        aria-label={open ? 'Close product search' : 'Search products'}
        aria-expanded={open}
        whileTap={press}
        onClick={() => setOpen(value => !value)}
      >
        {open ? <X size={18} /> : <Search size={18} />}
        {query && !open && <span className="header-search-indicator" aria-hidden="true" />}
      </motion.button>

      <AnimatePresence>
        {open && <motion.div
          className="header-search-popover"
          role="search"
          initial={{ opacity: 0, y: -8, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -6, scale: 0.98 }}
          transition={quickTransition}
        >
          <span className="header-search-label">SEARCH THE SHELVES</span>
          <label className="header-search-box">
            <Search size={18} aria-hidden="true" />
            <input
              ref={inputRef}
              type="search"
              aria-label="Search snacks"
              placeholder="Looking for something?"
              value={query}
              onChange={event => onQueryChange(event.target.value)}
              onKeyDown={event => {
                if (event.key !== 'Enter' || !query.trim() || resultCount === 0) return
                event.preventDefault()
                setOpen(false)
                onShowResults?.()
              }}
            />
            {query && <motion.button type="button" whileTap={press} onClick={() => onQueryChange('')} aria-label="Clear search"><X size={16} /></motion.button>}
          </label>
          <div className="header-search-status" aria-live="polite">
            {!query && 'Start typing to filter the products below.'}
            {query && resultCount > 0 && `${resultCount} ${resultCount === 1 ? 'snack' : 'snacks'} found`}
            {query && resultCount === 0 && <span>No snacks found. <button type="button" onClick={() => { setOpen(false); onRequestProduct?.() }}>Request this snack</button></span>}
          </div>
        </motion.div>}
      </AnimatePresence>
    </div>
  )
}

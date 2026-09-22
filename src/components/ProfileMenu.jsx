import { useEffect, useRef, useState } from 'react'
import { ChevronDown, LogOut, UserRound } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { press, quickTransition } from '../lib/motion'
import ThemeToggle from './ThemeToggle'

export default function ProfileMenu({ displayName, theme, onToggleTheme, onLogout, ordersContent, requestsContent, preview = false }) {
  const [open, setOpen] = useState(() => preview && typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('profile') === 'open')
  const [activeSection, setActiveSection] = useState(() => {
    if (!preview || typeof window === 'undefined') return null
    const section = new URLSearchParams(window.location.search).get('section')
    return section === 'orders' || section === 'requests' ? section : null
  })
  const rootRef = useRef(null)
  const firstName = displayName?.trim().split(/\s+/)[0] || 'Friend'
  const initial = firstName.charAt(0).toUpperCase()

  useEffect(() => {
    if (!open) return undefined
    const closeOnOutsidePress = event => {
      if (!rootRef.current?.contains(event.target)) setOpen(false)
    }
    const closeOnEscape = event => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsidePress)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePress)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  const toggleSection = section => setActiveSection(current => current === section ? null : section)

  return (
    <div className="profile-menu-root" ref={rootRef}>
      <motion.button
        type="button"
        className="profile-trigger"
        aria-label="Open profile menu"
        aria-expanded={open}
        aria-haspopup="menu"
        whileTap={press}
        onClick={() => setOpen(value => !value)}
      >
        <span className="profile-avatar" aria-hidden="true">{initial}</span>
        <span className="profile-trigger-name">{firstName}</span>
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={quickTransition} aria-hidden="true"><ChevronDown size={15} /></motion.span>
      </motion.button>

      <AnimatePresence>
        {open && <motion.div
          className="profile-popover"
          role="menu"
          aria-label="Profile"
          initial={{ opacity: 0, y: -8, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -6, scale: 0.98 }}
          transition={quickTransition}
        >
          <div className="profile-popover-heading">
            <span className="profile-avatar large" aria-hidden="true">{initial}</span>
            <div><strong>{firstName}</strong><span>Your SnackShop account</span></div>
          </div>

          <div className="profile-history-links" aria-label="Your history">
            <button type="button" aria-expanded={activeSection === 'orders'} onClick={() => toggleSection('orders')}>
              <span><strong>Previous orders</strong><small>Available for 24 hours</small></span>
              <motion.span animate={{ rotate: activeSection === 'orders' ? 180 : 0 }} transition={quickTransition}><ChevronDown size={15} /></motion.span>
            </button>
            <AnimatePresence initial={false}>{activeSection === 'orders' && <motion.div className="profile-history-panel" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={quickTransition}>{ordersContent}</motion.div>}</AnimatePresence>
            <button type="button" aria-expanded={activeSection === 'requests'} onClick={() => toggleSection('requests')}>
              <span><strong>Previous requests</strong><small>Available for 48 hours</small></span>
              <motion.span animate={{ rotate: activeSection === 'requests' ? 180 : 0 }} transition={quickTransition}><ChevronDown size={15} /></motion.span>
            </button>
            <AnimatePresence initial={false}>{activeSection === 'requests' && <motion.div className="profile-history-panel" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={quickTransition}>{requestsContent}</motion.div>}</AnimatePresence>
          </div>

          <div className="profile-appearance">
            <span><UserRound size={15} /> Appearance</span>
            <ThemeToggle theme={theme} onToggle={onToggleTheme} />
          </div>

          <motion.button
            type="button"
            className="profile-logout"
            role="menuitem"
            whileTap={press}
            onClick={() => { setOpen(false); if (!preview) onLogout?.() }}
          >
            <LogOut size={17} /> Logout
          </motion.button>
        </motion.div>}
      </AnimatePresence>
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import { Bell, ChevronDown, LogOut, UserRound } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { press, quickTransition } from '../lib/motion'
import ThemeToggle from './ThemeToggle'

export default function ProfileMenu({ displayName, theme, onToggleTheme, onLogout, requestFormContent, ordersContent, requestsContent, requestUpdateCount = 0, onRequestHistoryOpen, openRequestSignal = 0, preview = false }) {
  const [open, setOpen] = useState(() => preview && typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('profile') === 'open')
  const [activeSection, setActiveSection] = useState(() => {
    if (!preview || typeof window === 'undefined') return null
    const section = new URLSearchParams(window.location.search).get('section')
    return section === 'new-request' || section === 'orders' || section === 'requests' ? section : null
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

  useEffect(() => {
    if (!openRequestSignal) return
    setOpen(true)
    setActiveSection('new-request')
  }, [openRequestSignal])

  const toggleSection = section => setActiveSection(current => {
    const next = current === section ? null : section
    if (section === 'requests' && next === 'requests') onRequestHistoryOpen?.()
    return next
  })

  return (
    <div className="profile-menu-root" ref={rootRef}>
      <motion.button
        type="button"
        className="profile-trigger"
        aria-label={requestUpdateCount > 0 ? `Open profile menu, ${requestUpdateCount} unread request ${requestUpdateCount === 1 ? 'update' : 'updates'}` : 'Open profile menu'}
        aria-expanded={open}
        aria-haspopup="menu"
        whileTap={press}
        onClick={() => setOpen(value => !value)}
      >
        <span className="profile-avatar" aria-hidden="true">{initial}</span>
        <AnimatePresence>
          {requestUpdateCount > 0 && <motion.span className="profile-update-badge" aria-hidden="true" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={quickTransition}><Bell size={10} fill="currentColor" /></motion.span>}
        </AnimatePresence>
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
            <button type="button" aria-expanded={activeSection === 'new-request'} onClick={() => toggleSection('new-request')}>
              <span><strong>Request a snack</strong><small>Can't find something? Let us know</small></span>
              <motion.span animate={{ rotate: activeSection === 'new-request' ? 180 : 0 }} transition={quickTransition}><ChevronDown size={15} /></motion.span>
            </button>
            <AnimatePresence initial={false}>{activeSection === 'new-request' && <motion.div className="profile-history-panel profile-request-panel" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={quickTransition}>{requestFormContent}</motion.div>}</AnimatePresence>
            <button type="button" aria-expanded={activeSection === 'orders'} onClick={() => toggleSection('orders')}>
              <span><strong>Previous orders</strong><small>Available for 24 hours</small></span>
              <motion.span animate={{ rotate: activeSection === 'orders' ? 180 : 0 }} transition={quickTransition}><ChevronDown size={15} /></motion.span>
            </button>
            <AnimatePresence initial={false}>{activeSection === 'orders' && <motion.div className="profile-history-panel" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={quickTransition}>{ordersContent}</motion.div>}</AnimatePresence>
            <button type="button" aria-expanded={activeSection === 'requests'} onClick={() => toggleSection('requests')}>
              <span><strong>Previous requests {requestUpdateCount > 0 && <span className="profile-update-label">{requestUpdateCount} new</span>}</strong><small>Available for 48 hours</small></span>
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

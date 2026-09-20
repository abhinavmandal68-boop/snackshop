import { AnimatePresence, motion } from 'framer-motion'
import { Moon, Sun } from 'lucide-react'
import { press } from '../lib/motion'

export default function ThemeToggle({ theme, onToggle }) {
  const dark = theme === 'dark'
  const nextTheme = dark ? 'light' : 'dark'

  return (
    <motion.button
      type="button"
      className="theme-toggle"
      onClick={onToggle}
      whileHover={{ y: -1 }}
      whileTap={press}
      aria-label={`Switch to ${nextTheme} theme`}
      aria-pressed={dark}
      title={`Switch to ${nextTheme} theme`}
    >
      <span className="theme-toggle-track" aria-hidden="true">
        <motion.span
          className="theme-toggle-thumb"
          animate={{ x: dark ? 17 : 0 }}
          transition={{ type: 'spring', stiffness: 520, damping: 34 }}
        >
          <AnimatePresence initial={false} mode="wait">
            <motion.span
              key={theme}
              className="theme-toggle-icon"
              initial={{ opacity: 0, rotate: dark ? -70 : 70, scale: 0.65 }}
              animate={{ opacity: 1, rotate: 0, scale: 1 }}
              exit={{ opacity: 0, rotate: dark ? 70 : -70, scale: 0.65 }}
              transition={{ duration: 0.16 }}
            >
              {dark ? <Moon size={10} /> : <Sun size={10} />}
            </motion.span>
          </AnimatePresence>
        </motion.span>
      </span>
      <span className="theme-toggle-label">{dark ? 'Light' : 'Dark'}</span>
    </motion.button>
  )
}

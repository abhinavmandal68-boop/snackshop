import { useEffect, useState } from 'react'

const STORAGE_KEY = 'snackshop-theme'

const getPreviewTheme = () => {
  if (!import.meta.env.DEV || typeof window === 'undefined') return null
  if (!['/preview', '/admin-preview'].includes(window.location.pathname)) return null
  const theme = new URLSearchParams(window.location.search).get('theme')
  return theme === 'light' || theme === 'dark' ? theme : null
}

const initialTheme = () => {
  if (typeof window === 'undefined') return 'light'
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY)
    if (saved === 'light' || saved === 'dark') return saved
  } catch {
    // Storage can be unavailable in privacy-restricted browsers.
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export default function useThemePreference(temporary = false) {
  const previewTheme = getPreviewTheme()
  const [theme, setTheme] = useState(() => previewTheme || initialTheme())

  useEffect(() => {
    if (previewTheme || temporary) return
    try { window.localStorage.setItem(STORAGE_KEY, theme) } catch {
      // The theme still works for this session when storage is unavailable.
    }
  }, [theme, previewTheme, temporary])

  useEffect(() => {
    if (previewTheme || temporary) return
    const syncTheme = event => {
      if (event.key === STORAGE_KEY && (event.newValue === 'light' || event.newValue === 'dark')) {
        setTheme(event.newValue)
      }
    }
    window.addEventListener('storage', syncTheme)
    return () => window.removeEventListener('storage', syncTheme)
  }, [previewTheme, temporary])

  return {
    theme,
    toggleTheme: () => setTheme(current => current === 'dark' ? 'light' : 'dark'),
  }
}

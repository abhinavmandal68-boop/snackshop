import { useEffect, useState } from 'react'

const STORAGE_KEY = 'snackshop-theme'

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

export default function useThemePreference() {
  const [theme, setTheme] = useState(initialTheme)

  useEffect(() => {
    try { window.localStorage.setItem(STORAGE_KEY, theme) } catch {
      // The theme still works for this session when storage is unavailable.
    }
  }, [theme])

  useEffect(() => {
    const syncTheme = event => {
      if (event.key === STORAGE_KEY && (event.newValue === 'light' || event.newValue === 'dark')) {
        setTheme(event.newValue)
      }
    }
    window.addEventListener('storage', syncTheme)
    return () => window.removeEventListener('storage', syncTheme)
  }, [])

  return {
    theme,
    toggleTheme: () => setTheme(current => current === 'dark' ? 'light' : 'dark'),
  }
}

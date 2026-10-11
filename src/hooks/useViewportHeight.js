import { useEffect } from 'react'

export default function useViewportHeight() {
  useEffect(() => {
    const viewport = window.visualViewport
    let frame
    const apply = () => {
      document.documentElement.style.setProperty('--visual-viewport-height', `${viewport?.height || window.innerHeight}px`)
    }
    const update = () => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(apply)
    }
    apply()
    viewport?.addEventListener('resize', update)
    window.addEventListener('resize', update)
    return () => {
      window.cancelAnimationFrame(frame)
      viewport?.removeEventListener('resize', update)
      window.removeEventListener('resize', update)
      document.documentElement.style.removeProperty('--visual-viewport-height')
    }
  }, [])
}

import { useEffect, useState } from 'react'

export default function useMediaQuery(query) {
  const readMatch = () => typeof window !== 'undefined' && window.matchMedia(query).matches
  const [matches, setMatches] = useState(readMatch)

  useEffect(() => {
    const media = window.matchMedia(query)
    const update = event => setMatches(event.matches)
    setMatches(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [query])

  return matches
}

import { useEffect, useState } from 'react'

// Реактивно следит за медиа-запросом (напр. мобильный брейкпоинт), чтобы
// рендерить разную разметку там, где CSS-медиазапросов недостаточно — как
// таблица со сменой набора колонок между desktop/mobile.
export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(query).matches : false
  )

  useEffect(() => {
    const mql = window.matchMedia(query)
    const handler = (e) => setMatches(e.matches)
    setMatches(mql.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [query])

  return matches
}

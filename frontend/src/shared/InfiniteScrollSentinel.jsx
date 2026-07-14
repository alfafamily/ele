import { useEffect, useRef } from 'react'
import { Spinner } from './ui'

// Подгрузка по скроллу — наблюдатель за нижним
// краем списка вызывает loadMore(), как только попадает в область видимости.
export function InfiniteScrollSentinel({ hasMore, loading, onLoadMore }) {
  const ref = useRef(null)

  useEffect(() => {
    if (!hasMore) return
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) onLoadMore()
      },
      { rootMargin: '200px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [hasMore, onLoadMore])

  if (!hasMore) return null

  return (
    <div ref={ref} style={{ padding: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9 }}>
      {loading ? <Spinner size={18} /> : null}
    </div>
  )
}

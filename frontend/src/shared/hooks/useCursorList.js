import { useCallback, useEffect, useRef, useState } from 'react'
import { apiGet } from '../api/client'

// Переиспользуемый хук бесконечной подгрузки под курсорную пагинацию DRF
// (ТЗ §8.7): next/previous — уже готовые URL, не offset, поэтому loadMore()
// просто дёргает next напрямую, не пересчитывает страницу сам.
export function useCursorList(basePath, params = {}) {
  const paramsKey = JSON.stringify(params)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(null)
  const nextRef = useRef(null)
  const requestIdRef = useRef(0)

  const buildInitialUrl = useCallback(() => {
    const query = new URLSearchParams()
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') query.set(key, value)
    }
    const qs = query.toString()
    return qs ? `${basePath}?${qs}` : basePath
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basePath, paramsKey])

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current
    setLoading(true)
    setError(null)
    try {
      const data = await apiGet(buildInitialUrl())
      if (requestId !== requestIdRef.current) return
      setItems(data.results)
      nextRef.current = data.next
    } catch (err) {
      if (requestId !== requestIdRef.current) return
      setError(err)
    } finally {
      if (requestId === requestIdRef.current) setLoading(false)
    }
  }, [buildInitialUrl])

  useEffect(() => {
    load()
  }, [load])

  const loadMore = useCallback(async () => {
    if (!nextRef.current || loadingMore) return
    setLoadingMore(true)
    try {
      const data = await apiGet(nextRef.current)
      setItems((prev) => [...prev, ...data.results])
      nextRef.current = data.next
    } catch (err) {
      setError(err)
    } finally {
      setLoadingMore(false)
    }
  }, [loadingMore])

  return {
    items,
    loading,
    loadingMore,
    error,
    hasMore: Boolean(nextRef.current),
    loadMore,
    refetch: load,
  }
}

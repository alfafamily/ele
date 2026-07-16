import { useCallback, useEffect, useRef, useState } from 'react'
import { apiGet } from '../api/client'
import { readListCache, writeListCache } from '../listCache'

// Переиспользуемый хук бесконечной подгрузки под курсорную пагинацию DRF:
// next/previous — уже готовые URL, не offset, поэтому loadMore() просто
// дёргает next напрямую, не пересчитывает страницу сам.
//
// options.cacheKey — если задан, уже подгруженные страницы и курсор next
// сохраняются в listCache. options.restore — восстанавливать ли их из кэша при
// монтировании (обычно true только при переходе «назад», POP): тогда список
// открывается там же, где его оставили, а не с первой страницы. При смене
// фильтров/сортировки (другой paramsKey) кэш не подходит и список грузится
// заново. Кэш пишется всегда (даже при restore=false) — на будущий возврат.
export function useCursorList(basePath, params = {}, { cacheKey, restore = true } = {}) {
  const paramsKey = JSON.stringify(params)
  // Снимок из кэша годится только если совпадают параметры запроса.
  const cached = restore && cacheKey ? readListCache(cacheKey) : null
  const restorable = cached && cached.paramsKey === paramsKey && Array.isArray(cached.items)

  const [items, setItems] = useState(restorable ? cached.items : [])
  const [loading, setLoading] = useState(!restorable)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(null)
  const nextRef = useRef(restorable ? cached.next : null)
  const requestIdRef = useRef(0)
  // Для каких params данные уже есть (восстановлены из кэша или загружены) —
  // чтобы не грузить повторно. Через paramsKey, а не булев флаг: булев «skip
  // первый раз» ломался под StrictMode (эффект в dev вызывается дважды, второй
  // проход сбрасывал восстановленные страницы загрузкой первой). Загружаем
  // только когда для текущих params данных ещё нет.
  const loadedParamsRef = useRef(restorable ? paramsKey : null)

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
    if (loadedParamsRef.current === paramsKey) return
    loadedParamsRef.current = paramsKey
    load()
  }, [load, paramsKey])

  // Держим кэш в актуальном состоянии, пока список открыт.
  useEffect(() => {
    if (!cacheKey) return
    writeListCache(cacheKey, { paramsKey, items, next: nextRef.current })
  }, [cacheKey, paramsKey, items])

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

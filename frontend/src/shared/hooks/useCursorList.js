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
  // Снимок из кэша берём ОДИН раз при монтировании (годится только если совпадают
  // параметры запроса). Пересчёт на каждый рендер приводил к «залипанию» скелетона
  // при обновлении страницы (F5): эффект записи кэша успевал записать пустой
  // items:[] ДО ответа сервера, restorable перескакивал false→true, эффект дёргал
  // silentRefresh (requestId++), и finally первого load() пропускал setLoading(false)
  // (requestId уже не совпадал) — loading оставался true навсегда. Захват при
  // монтировании убирает этот перескок; смену параметров обрабатывает loadedParamsRef.
  const initRef = useRef(null)
  if (initRef.current === null) {
    const c = restore && cacheKey ? readListCache(cacheKey) : null
    initRef.current = {
      cached: c,
      restorable: !!(c && c.paramsKey === paramsKey && Array.isArray(c.items)),
    }
  }
  const { cached, restorable } = initRef.current

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
  // Сколько элементов было восстановлено из кэша — столько же догружаем при
  // фоновом обновлении, чтобы прокрутка легла на прежнее место.
  const restoredCountRef = useRef(restorable ? cached.items.length : 0)
  const didSilentRefreshRef = useRef(false)

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

  // Фоновое обновление восстановленного из кэша списка: перезагружаем столько же
  // страниц, сколько было показано, и заменяем список — без скелетона и сброса
  // прокрутки. Так возврат «назад» показывает актуальное состояние объектов
  // (например, только что списанного в активной вкладке уже нет).
  const silentRefresh = useCallback(async () => {
    const requestId = ++requestIdRef.current
    try {
      let url = buildInitialUrl()
      const acc = []
      let next = null
      do {
        const data = await apiGet(url)
        if (requestId !== requestIdRef.current) return
        acc.push(...data.results)
        next = data.next
        url = next
      } while (next && acc.length < restoredCountRef.current)
      if (requestId !== requestIdRef.current) return
      setItems(acc)
      nextRef.current = next
    } catch {
      // Сеть/ошибка — оставляем восстановленные из кэша данные как есть.
    }
  }, [buildInitialUrl])

  useEffect(() => {
    if (loadedParamsRef.current === paramsKey) {
      if (restorable && !didSilentRefreshRef.current) {
        didSilentRefreshRef.current = true
        silentRefresh()
      }
      return
    }
    loadedParamsRef.current = paramsKey
    load()
  }, [load, paramsKey, restorable, silentRefresh])

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

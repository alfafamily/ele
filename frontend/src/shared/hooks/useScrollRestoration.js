import { useEffect, useLayoutEffect, useRef } from 'react'
import { readListCache, writeListCache } from '../listCache'

// Сохранение и восстановление позиции прокрутки окна для списков (прокрутка —
// на документе, отдельного скролл-контейнера нет). Пока список открыт, пишем
// текущий scrollY в listCache; при возврате со страницы объекта — один раз,
// как только список готов к показу (ready), возвращаем прокрутку на место.
//
// Восстановление — синхронно в useLayoutEffect (до отрисовки, без «прыжка» и
// без requestAnimationFrame): под StrictMode эффекты в dev вызываются дважды
// (setup → cleanup → setup), и отложенная через rAF прокрутка успевала
// отмениться в cleanup, а повторный setup её уже не назначал. Синхронный вызов
// выполняется в первом же setup и не отменяется.
export function useScrollRestoration(cacheKey, ready) {
  const restored = useRef(false)

  useEffect(() => {
    const onScroll = () => writeListCache(cacheKey, { scrollY: window.scrollY })
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [cacheKey])

  useLayoutEffect(() => {
    if (restored.current || !ready) return
    const y = readListCache(cacheKey)?.scrollY
    if (y == null) return
    restored.current = true
    window.scrollTo(0, y)
  }, [cacheKey, ready])
}

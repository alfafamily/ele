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

    // Мобильные браузеры могут не долистать/сбросить прокрутку уже ПОСЛЕ этого
    // синхронного вызова: динамический вьюпорт (показ/скрытие адресной строки)
    // меняет высоту документа, из-за чего scrollTo клампится к меньшему максимуму
    // и оседает у верха; плюс собственное восстановление навигации браузера может
    // сработать кадром-двумя позже. На десктопе прокрутка ложится сразу и цикл
    // ниже завершается на первом же кадре (позиция уже верна) — поведение не
    // меняется. Идемпотентно доназначаем несколько кадров, пока не ляжет; при
    // первом действии пользователя (касание/колесо) прекращаем, чтобы не мешать.
    let cancelled = false
    const stop = () => {
      cancelled = true
    }
    window.addEventListener('touchstart', stop, { passive: true, once: true })
    window.addEventListener('wheel', stop, { passive: true, once: true })
    let frames = 0
    const tick = () => {
      if (cancelled) return
      if (Math.abs(window.scrollY - y) > 2) window.scrollTo(0, y)
      if (++frames < 30 && Math.abs(window.scrollY - y) > 2) {
        requestAnimationFrame(tick)
      } else {
        window.removeEventListener('touchstart', stop)
        window.removeEventListener('wheel', stop)
      }
    }
    requestAnimationFrame(tick)
  }, [cacheKey, ready])
}

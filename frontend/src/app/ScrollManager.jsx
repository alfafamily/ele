import { useEffect } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'

// Управление прокруткой при навигации. Браузерное авто-восстановление отключено
// (history.scrollRestoration = 'manual' в main.jsx), потому что для SPA оно
// срабатывает до отрисовки контента и сбрасывает список в начало.
//
// Здесь берём на себя простую часть: при переходе «вперёд» (PUSH/REPLACE —
// открытие карточки, заход в раздел) прокручиваем страницу в начало. Возврат
// «назад» (POP) не трогаем — списки восстанавливают свою позицию сами
// (useScrollRestoration), а на прочих экранах прокрутка остаётся как есть.
export function ScrollManager() {
  const { pathname } = useLocation()
  const navType = useNavigationType()

  useEffect(() => {
    if (navType !== 'POP') window.scrollTo(0, 0)
  }, [pathname, navType])

  return null
}

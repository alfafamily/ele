import { useEffect } from 'react'

// B54 (a11y): точечная замена заголовка вкладки на имя открытого объекта
// (карточки). Вызывать безусловно (до любых early-return), передавая имя или
// null/''. Пока имя не пришло (объект грузится) — заголовок остаётся разделом
// от <RouteTitle>; когда данные загрузились, показываем «Имя · ELE». RouteTitle
// сбросит заголовок обратно на раздел при следующей смене маршрута.
export function useDocumentTitle(name) {
  useEffect(() => {
    if (name) document.title = `${name} · ELE`
  }, [name])
}

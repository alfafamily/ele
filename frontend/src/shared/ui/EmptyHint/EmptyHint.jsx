import './EmptyHint.css'

// Компактная подпись пустого состояния ВНУТРИ секции / списка / пикера
// («За сотрудником не закреплено…», «Регламенты пока не созданы.», в пикере —
// «Ничего не найдено»). В отличие от EmptyState (крупный блок-карточка для
// пустых страниц-списков) — это неброская строка приглушённым текстом.
//   center — вариант для пикеров: по центру, с внутренними отступами;
//   style/className — тонкая подстройка отступов конкретного места.
export function EmptyHint({ children, center = false, style, className = '' }) {
  const cls = ['ele-empty-hint', center ? 'ele-empty-hint--center' : '', className].filter(Boolean).join(' ')
  return (
    <div className={cls} style={style}>
      {children}
    </div>
  )
}

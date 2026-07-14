import './TabBar.css'

// Переиспользуемая группа переключателей. По умолчанию — сегмент-контрол
// (вкладки «Активные/Архив»). variant="filter" даёт вид фильтра-чипов
// («Все/Закреплённое/Свободное»): раздельные круглые пилюли — визуально
// отличается от вкладок-навигации.
export function TabBar({ options, value, onChange, size, scroll, variant }) {
  const className = [
    'ele-tabbar',
    size === 'control' ? 'ele-tabbar--control' : '',
    scroll ? 'ele-tabbar--scroll' : '',
    variant === 'filter' ? 'ele-tabbar--filter' : '',
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <div className={className}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className={'ele-tabbar__item' + (opt.value === value ? ' ele-tabbar__item--active' : '')}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

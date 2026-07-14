import './TabBar.css'

// Переиспользуемая группа переключателей — и вкладки «Активные/Архив»
// (§5.1, §5.2), и фильтры-кнопки («Все/Закреплённое/Свободное» и т.п.).
export function TabBar({ options, value, onChange, size, scroll }) {
  const className = ['ele-tabbar', size === 'control' ? 'ele-tabbar--control' : '', scroll ? 'ele-tabbar--scroll' : '']
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

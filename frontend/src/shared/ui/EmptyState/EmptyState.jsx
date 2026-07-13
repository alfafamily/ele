import './EmptyState.css'

// Пустое состояние списков (§8.5): «нет данных» / «нет результатов поиска» —
// иллюстрация(иконка) + текст + опциональный CTA (напр. «Сбросить фильтры»).
export function EmptyState({ icon, title, description, action }) {
  return (
    <div className="ele-empty">
      {icon ? (
        <div className="ele-empty__icon" aria-hidden>
          {icon}
        </div>
      ) : null}
      <div className="ele-empty__title">{title}</div>
      {description ? <div className="ele-empty__description">{description}</div> : null}
      {action ? <div className="ele-empty__action">{action}</div> : null}
    </div>
  )
}

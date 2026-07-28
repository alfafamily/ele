// B32. Единая строка блока «Размещение/Закреплено за» на карточках объектов:
// [кружок: аватар сотрудника или иконка места/оборудования] + подпись/название/детали.
// circle — узел <AvatarCircle> или <LeadIconCircle>; title может быть ссылкой.
export function PlacementRow({ circle, label, title, sub }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      {circle}
      <div style={{ minWidth: 0 }}>
        {label ? <div style={{ fontSize: 12, color: 'var(--color-text-placeholder)' }}>{label}</div> : null}
        <div style={{ fontSize: 15, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
        {sub ? <div style={{ fontSize: 13, color: 'var(--color-text-placeholder)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</div> : null}
      </div>
    </div>
  )
}

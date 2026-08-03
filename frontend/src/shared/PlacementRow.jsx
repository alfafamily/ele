import { TruncatedText } from './TruncatedText.jsx'

// B32. Единая строка блока «Размещение/Закреплено за» на карточках объектов:
// [кружок: аватар сотрудника или иконка места/оборудования] + подпись/название/детали.
// circle — узел <AvatarCircle> или <LeadIconCircle>; title может быть ссылкой.
// title/sub обрезаются в «…» с тултипом полного текста при наведении (десктоп).
export function PlacementRow({ circle, label, title, sub }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      {circle}
      <div style={{ minWidth: 0 }}>
        {label ? <TruncatedText style={{ fontSize: 12, color: 'var(--color-text-placeholder)' }}>{label}</TruncatedText> : null}
        <TruncatedText style={{ fontSize: 15, fontWeight: 600 }}>{title}</TruncatedText>
        {sub ? <TruncatedText style={{ fontSize: 13, color: 'var(--color-text-placeholder)' }}>{sub}</TruncatedText> : null}
      </div>
    </div>
  )
}

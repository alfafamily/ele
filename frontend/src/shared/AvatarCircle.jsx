import { nameInitials } from './employeeName.js'
import { AcceptanceOverlay } from './AcceptanceIcon.jsx'

// B32. Аватар сотрудника: фото или инициалы-заглушка. По умолчанию кружок с
// серой заливкой (на белой подложке блока); на сером фоне (модалки) — передать
// tinted для белой заливки с обводкой. Текст инициалов всегда контрастный.
// status — опц. иконка статуса акцепта в углу.
export function AvatarCircle({ avatar, name, size = 46, status, overlaySize, tinted }) {
  return (
    <div style={{ position: 'relative', flex: 'none' }}>
      <span
        style={{
          width: size, height: size, borderRadius: '50%',
          background: tinted ? 'var(--color-surface)' : 'var(--color-fill-active-tint)',
          border: tinted ? '1px solid var(--color-border)' : 'none',
          color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center',
          justifyContent: 'center', fontSize: Math.round(size / 3), fontWeight: 600, overflow: 'hidden',
        }}
      >
        {avatar ? (
          <img src={avatar.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          nameInitials(name)
        )}
      </span>
      {status ? <AcceptanceOverlay status={status} size={overlaySize || Math.round(size * 0.4)} /> : null}
    </div>
  )
}

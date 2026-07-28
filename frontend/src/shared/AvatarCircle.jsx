import { nameInitials } from './employeeName.js'
import { AcceptanceOverlay } from './AcceptanceIcon.jsx'

// B32. Аватар сотрудника: фото или инициалы-заглушка на белом фоне с обводкой
// (контрастный тёмный текст). status — опц. иконка статуса акцепта в углу.
export function AvatarCircle({ avatar, name, size = 46, status, overlaySize }) {
  return (
    <div style={{ position: 'relative', flex: 'none' }}>
      <span
        style={{
          width: size, height: size, borderRadius: '50%',
          background: 'var(--color-surface)', border: '1px solid var(--color-border)',
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

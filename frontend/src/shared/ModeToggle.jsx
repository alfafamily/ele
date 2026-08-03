import { Icon } from './ui'

// Переключатель режима размещения (сегментированные кнопки) — например
// «Сотрудник / РМ / МОП / Склад». B65: каждый вариант — иконка над короткой
// подписью. options — [{ value, label, icon? }]; иконка необязательна, но её
// место всегда зарезервировано, чтобы кнопки были равной высоты.
export function ModeToggle({ mode, onChange, options, style }) {
  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 14, ...style }}>
      {options.map((m) => {
        const active = mode === m.value
        return (
          <button
            key={m.value}
            type="button"
            onClick={() => onChange(m.value)}
            style={{
              flex: 1,
              minWidth: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 4,
              padding: '9px 4px',
              fontSize: 12,
              fontWeight: 600,
              fontFamily: 'inherit',
              cursor: 'pointer',
              borderRadius: 8,
              border: 'none',
              color: active ? 'var(--color-primary-text)' : 'var(--color-text-secondary)',
              background: active ? 'var(--color-primary)' : 'var(--color-fill-input)',
            }}
          >
            {m.icon ? <Icon name={m.icon} size={18} strokeWidth={2} /> : <span style={{ height: 18 }} />}
            <span style={{ maxWidth: '100%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {m.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}

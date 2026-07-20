// Переключатель режима (сегментированные кнопки) — например, размещение
// «За сотрудником / На складе / На рабочем месте».
export function ModeToggle({ mode, onChange, options, style }) {
  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 14, ...style }}>
      {options.map((m) => (
        <button
          key={m.value}
          type="button"
          onClick={() => onChange(m.value)}
          style={{
            flex: 1,
            padding: '8px 6px',
            fontSize: 12.5,
            fontWeight: 600,
            fontFamily: 'inherit',
            cursor: 'pointer',
            borderRadius: 8,
            border: 'none',
            color: mode === m.value ? 'var(--color-primary-text)' : 'var(--color-text-secondary)',
            background: mode === m.value ? 'var(--color-primary)' : 'var(--color-fill-input)',
          }}
        >
          {m.label}
        </button>
      ))}
    </div>
  )
}

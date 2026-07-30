// Сегментированный переключатель (пилюли с заливкой активного, а не вкладки).
// Для выбора из 2–3 взаимоисключающих значений в формах создания — например
// Вид средства (Пропуск СКУД/Ключ), Тип корп. связи (SIM/E-SIM), Учёт пробега.
// options — [{ value, label }]. Необязательная подпись сверху — label.
export function Segmented({ value, onChange, options, label }) {
  return (
    <div>
      {label ? (
        <div style={{ fontSize: 12, color: 'var(--color-text-placeholder)', marginBottom: 8 }}>{label}</div>
      ) : null}
      <div style={{ display: 'flex', gap: 8 }}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            style={{
              flex: 1,
              padding: '9px 6px',
              fontSize: 13,
              fontWeight: 600,
              fontFamily: 'inherit',
              cursor: 'pointer',
              borderRadius: 8,
              border: 'none',
              color: value === o.value ? 'var(--color-primary-text)' : 'var(--color-text-secondary)',
              background: value === o.value ? 'var(--color-primary)' : 'var(--color-fill-input)',
            }}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

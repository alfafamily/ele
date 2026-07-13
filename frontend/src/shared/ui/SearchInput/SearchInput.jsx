export function SearchInput({ value, onChange, placeholder = 'Поиск' }) {
  return (
    <div
      style={{
        flex: 1,
        height: 44,
        background: 'var(--color-surface)',
        boxShadow: 'inset 0 0 0 1px var(--color-border)',
        borderRadius: 'var(--radius-control)',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '0 14px',
      }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9FA2B2" strokeWidth="1.8">
        <circle cx="11" cy="11" r="7" />
        <path d="M20 20l-3.5-3.5" />
      </svg>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 14, fontFamily: 'inherit' }}
      />
    </div>
  )
}

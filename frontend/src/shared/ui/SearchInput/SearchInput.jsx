import { Icon } from '../Icon/Icon.jsx'

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
      <Icon name="search" size={18} style={{ color: '#9FA2B2' }} />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 14, fontFamily: 'inherit' }}
      />
    </div>
  )
}

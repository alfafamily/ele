// Перенесено 1:1 из design/ELE_design_dc.html (.spin) — тёмное кольцо на
// светлом фоне, для загрузочных состояний вне кнопок (B4, bootstrap-гейт).
export function Spinner({ size = 34 }) {
  return (
    <span
      aria-hidden
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        borderRadius: '50%',
        border: `${Math.max(2, Math.round(size / 11))}px solid var(--color-bg-app)`,
        borderTopColor: 'var(--color-text-primary)',
        animation: 'ele-spin 0.8s linear infinite',
      }}
    />
  )
}

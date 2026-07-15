// Нейтральная информационная плашка (этаж, счётчик, «Архив», «Реквизиты: N»
// и т.п.). Единый серо-синий тон из токенов (--color-badge-*), контрастный к
// любой подложке объекта: белой, fill-input, ховер-заливке. Семантические
// цветные статусы — отдельно, в StatusPill.
export function Badge({ children, style }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        fontSize: 11,
        fontWeight: 600,
        lineHeight: 1.4,
        color: 'var(--color-badge-text)',
        background: 'var(--color-badge-bg)',
        padding: '2px 8px',
        borderRadius: 20,
        whiteSpace: 'nowrap',
        flex: 'none',
        ...style,
      }}
    >
      {children}
    </span>
  )
}

import { useState } from 'react'
import { Input } from '../../shared/ui'

// Ширина полей ввода/просмотра — под ~20 символов, не на всю ширину блока.
export const FIELD_W = 'min(100%, 220px)'

export const fieldError = (e) =>
  e.errors ? Object.values(e.errors).flat().join(' ') : e.detail || 'Не удалось сохранить.'

function iconPaths(kind) {
  switch (kind) {
    case 'edit':
      return (
        <>
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
        </>
      )
    case 'delete':
      return (
        <>
          <path d="M4 7h16" />
          <path d="M9 7V5h6v2" />
          <path d="M6 7l1 13h10l1-13" />
        </>
      )
    case 'apply':
      return <path d="M5 12l5 5L20 6" />
    default: // cancel
      return <path d="M18 6L6 18M6 6l12 12" />
  }
}

// Иконочная кнопка действия. Плоская (в режиме просмотра — рядом с полем) или
// outlined — полноценная кнопка в высоту инпута с контуром (как «…» в списках),
// для действий Применить/Отменить при редактировании/добавлении.
export function IconBtn({ kind, title, onClick, disabled, outlined }) {
  const color = kind === 'delete' ? 'var(--color-error)' : kind === 'apply' ? 'var(--color-success)' : 'var(--color-text-muted)'
  const base = { border: 'none', cursor: disabled ? 'default' : 'pointer', color, opacity: disabled ? 0.4 : 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }
  const style = outlined
    ? { ...base, width: 'var(--control-height)', height: 'var(--control-height)', borderRadius: 'var(--radius-control)', background: 'var(--color-surface)', boxShadow: 'inset 0 0 0 1px var(--color-border)' }
    : { ...base, background: 'none', padding: 6 }
  return (
    <button type="button" title={title} aria-label={title} onClick={onClick} disabled={disabled} style={style}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {iconPaths(kind)}
      </svg>
    </button>
  )
}

// Просмотр поля — лейбл + значение под ним, без заливки (как на карточке
// оборудования). Вид инпута появляется только в режиме редактирования.
export function FieldView({ label, value, mono }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 12, color: 'var(--color-text-placeholder)', marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
      <div
        style={{
          fontSize: 14,
          fontWeight: 500,
          fontFamily: mono ? 'var(--font-mono)' : 'inherit',
          color: value ? 'inherit' : 'var(--color-text-placeholder)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {value || '—'}
      </div>
    </div>
  )
}

// Поле с inline-редактированием: просмотр (лейбл+значение) ↔ инпут c
// Применить/Отменить. onSave(value) и onClear() — async, возвращают текст
// ошибки или null/undefined при успехе.
export function InlineField({ label, value, mono, placeholder, onSave, onClear }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const apply = async () => {
    setBusy(true)
    const err = await onSave(draft.trim())
    setBusy(false)
    if (err) setError(err)
    else {
      setEditing(false)
      setError(null)
    }
  }

  const clear = async () => {
    setBusy(true)
    const err = await onClear()
    setBusy(false)
    setError(err || null)
  }

  if (editing) {
    return (
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
        <div style={{ width: FIELD_W }}>
          <Input label={label} value={draft} placeholder={placeholder} onChange={(e) => setDraft(e.target.value)} error={error} autoFocus style={mono ? { fontFamily: 'var(--font-mono)' } : undefined} />
        </div>
        <IconBtn outlined kind="apply" title="Применить" onClick={apply} disabled={busy} />
        <IconBtn outlined kind="cancel" title="Отменить" onClick={() => { setEditing(false); setError(null) }} disabled={busy} />
      </div>
    )
  }

  return (
    <div>
      {/* maxWidth (не width) — поле сжимается по контенту, иконки действий стоят
          вплотную к нему, а не у правого края блока. */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
        <div style={{ maxWidth: FIELD_W, minWidth: 0 }}>
          <FieldView label={label} value={value} mono={mono} />
        </div>
        <IconBtn kind="edit" title="Редактировать" onClick={() => { setDraft(value || ''); setError(null); setEditing(true) }} disabled={busy} />
        {onClear ? <IconBtn kind="delete" title="Очистить" onClick={clear} disabled={busy || !value} /> : null}
      </div>
      {error ? <div style={{ fontSize: 12, color: 'var(--color-error)', marginTop: 4 }}>{error}</div> : null}
    </div>
  )
}

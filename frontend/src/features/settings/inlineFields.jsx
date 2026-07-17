import { useState } from 'react'
import { Icon, Input } from '../../shared/ui'

// Ширина полей ввода/просмотра — под ~20 символов, не на всю ширину блока.
export const FIELD_W = 'min(100%, 220px)'

export const fieldError = (e) =>
  e.errors ? Object.values(e.errors).flat().join(' ') : e.detail || 'Не удалось сохранить.'

const ICON_BY_KIND = { edit: 'square-pen', delete: 'trash-2', apply: 'check', cancel: 'x' }

// Иконочная кнопка действия. Плоская (в режиме просмотра — рядом с полем) или
// outlined — полноценная кнопка в высоту инпута с контуром (как «…» в списках),
// для действий Применить/Отменить при редактировании/добавлении.
export function IconBtn({ kind, title, onClick, disabled, outlined, size }) {
  const color = kind === 'delete' ? 'var(--color-error)' : kind === 'apply' ? 'var(--color-success)' : 'var(--color-text-muted)'
  const base = { border: 'none', cursor: disabled ? 'default' : 'pointer', color, opacity: disabled ? 0.4 : 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }
  const dim = size ? (typeof size === 'number' ? `${size}px` : size) : 'var(--control-height)'
  const style = outlined
    ? { ...base, width: dim, height: dim, borderRadius: 'var(--radius-control)', background: 'var(--color-surface)', boxShadow: 'inset 0 0 0 1px var(--color-border)' }
    : { ...base, background: 'none', padding: 6 }
  return (
    <button type="button" title={title} aria-label={title} onClick={onClick} disabled={disabled} style={style}>
      <Icon name={ICON_BY_KIND[kind] || 'x'} size={18} />
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
        <IconBtn outlined size={36} kind="edit" title="Редактировать" onClick={() => { setDraft(value || ''); setError(null); setEditing(true) }} disabled={busy} />
        {onClear ? <IconBtn outlined size={36} kind="delete" title="Очистить" onClick={clear} disabled={busy || !value} /> : null}
      </div>
      {error ? <div style={{ fontSize: 12, color: 'var(--color-error)', marginTop: 4 }}>{error}</div> : null}
    </div>
  )
}

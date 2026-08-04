import { useState } from 'react'
import { FilePreviewModal } from './eav/FilePreviewModal.jsx'
import { Icon } from './ui/Icon/Icon.jsx'

// B67. Мультивыбор общих файлов Вида на форме создания/редактирования имущества.
// available — библиотека файлов выбранного Вида ([{id, file}]); selectedIds —
// массив выбранных id; onChange(nextIds). Отмеченные файлы попадут в раздел
// «Файлы» карточки экземпляра. Имя файла открывает встроенный просмотрщик.
export function TypeFilesPicker({ available, selectedIds, onChange }) {
  const [previewIndex, setPreviewIndex] = useState(null)
  if (!available || available.length === 0) {
    return (
      <div style={{ fontSize: 13.5, color: 'var(--color-text-muted)' }}>
        У этого Вида пока нет общих файлов.
      </div>
    )
  }
  const toggle = (id) => {
    const set = new Set(selectedIds)
    if (set.has(id)) set.delete(id)
    else set.add(id)
    onChange(available.filter((f) => set.has(f.id)).map((f) => f.id))
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {available.map((f, i) => {
        const checked = selectedIds.includes(f.id)
        return (
          <label
            key={f.id}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
              background: 'var(--color-surface)', boxShadow: 'inset 0 0 0 1px var(--color-border)',
              borderRadius: 10, padding: '10px 12px',
            }}
          >
            <input type="checkbox" checked={checked} onChange={() => toggle(f.id)} style={{ flex: 'none' }} />
            <Icon name="file-text" size={15} style={{ flex: 'none', color: 'var(--color-text-muted)' }} />
            <span style={{ flex: 1, minWidth: 0, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {f.file.original_filename}
            </span>
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); setPreviewIndex(i) }}
              title="Просмотреть"
              aria-label="Просмотреть файл"
              style={{ flex: 'none', border: 'none', background: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', padding: 2, display: 'flex' }}
            >
              <Icon name="eye" size={16} />
            </button>
          </label>
        )
      })}
      {previewIndex != null ? (
        <FilePreviewModal files={available.map((f) => f.file)} startIndex={previewIndex} onClose={() => setPreviewIndex(null)} />
      ) : null}
    </div>
  )
}

import { useState } from 'react'
import { FilePreviewModal } from './FilePreviewModal.jsx'

// Read-only отображение значения реквизита в блоке «Параметры оборудования»/
// «Параметры лицензии» карточки . fv — элемент field_values
// (name, value_type, value, value_file, value_files).
export function FieldValueDisplay({ fv }) {
  const [preview, setPreview] = useState(null) // просматриваемый файл | null
  let display
  if (fv.value_type === 'file') {
    // Одиночный файл — в value_file; несколько (allow_multiple) — в value_files.
    const files = []
    if (fv.value_file) files.push({ key: 'single', file: fv.value_file })
    for (const f of fv.value_files || []) files.push({ key: f.id, file: f.file })

    display = files.length ? (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' }}>
        {files.map(({ key, file }) => (
          <button
            key={key}
            type="button"
            onClick={() => setPreview(file)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              maxWidth: '100%',
              padding: 0,
              border: 'none',
              background: 'none',
              color: 'var(--color-primary)',
              fontWeight: 500,
              fontSize: 14,
              fontFamily: 'inherit',
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <svg style={{ flex: 'none' }} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
              <path d="M14 3v5h5" />
            </svg>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.original_filename}</span>
          </button>
        ))}
      </div>
    ) : (
      <span style={{ color: 'var(--color-text-placeholder)' }}>Файл не загружен</span>
    )
  } else if (fv.value_type === 'bool') {
    // null/undefined = реквизит не заполнен (после перехода на явный выбор
    // Да/Нет), а не «Ложь».
    display = fv.value === null || fv.value === undefined ? <span style={{ color: 'var(--color-text-placeholder)' }}>—</span> : fv.value ? 'Да' : 'Нет'
  } else if (fv.value === null || fv.value === undefined || fv.value === '') {
    display = <span style={{ color: 'var(--color-text-placeholder)' }}>—</span>
  } else {
    display = String(fv.value)
  }

  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 12, color: 'var(--color-text-placeholder)', marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{fv.name}</div>
      <div style={{ fontSize: 14, fontWeight: 500, overflowWrap: 'break-word', minWidth: 0 }}>{display}</div>
      {preview ? <FilePreviewModal file={preview} onClose={() => setPreview(null)} /> : null}
    </div>
  )
}

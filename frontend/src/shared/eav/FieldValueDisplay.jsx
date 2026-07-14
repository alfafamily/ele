import { useState } from 'react'
import { FilePreviewModal } from './FilePreviewModal.jsx'

// Read-only отображение значения реквизита в блоке «Параметры оборудования»/
// «Параметры лицензии» карточки . fv — элемент field_values
// (name, value_type, value, value_file).
export function FieldValueDisplay({ fv }) {
  const [preview, setPreview] = useState(false)
  let display
  if (fv.value_type === 'file') {
    display = fv.value_file ? (
      // Клик открывает встроенный просмотрщик (изображение/PDF/текст), а не
      // переход/скачивание; несовместимые типы просмотрщик предложит скачать.
      <button
        type="button"
        onClick={() => setPreview(true)}
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
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fv.value_file.original_filename}</span>
      </button>
    ) : (
      <span style={{ color: 'var(--color-text-placeholder)' }}>Файл не загружен</span>
    )
  } else if (fv.value_type === 'bool') {
    display = fv.value ? 'Да' : 'Нет'
  } else if (fv.value === null || fv.value === undefined || fv.value === '') {
    display = <span style={{ color: 'var(--color-text-placeholder)' }}>—</span>
  } else {
    display = String(fv.value)
  }

  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 12, color: 'var(--color-text-placeholder)', marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{fv.name}</div>
      <div style={{ fontSize: 14, fontWeight: 500, overflowWrap: 'break-word', minWidth: 0 }}>{display}</div>
      {preview && fv.value_file ? <FilePreviewModal file={fv.value_file} onClose={() => setPreview(false)} /> : null}
    </div>
  )
}

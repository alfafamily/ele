import { useState } from 'react'
import { FilePreviewModal } from './FilePreviewModal.jsx'
import { Icon } from '../ui/Icon/Icon.jsx'

// Read-only отображение значения реквизита в блоке «Параметры оборудования»/
// «Параметры лицензии» карточки . fv — элемент field_values
// (name, value_type, value, value_file, value_files).
export function FieldValueDisplay({ fv }) {
  const [previewIndex, setPreviewIndex] = useState(null) // индекс просматриваемого файла | null
  let display
  let previewFiles = [] // плоский список файлов реквизита для перелистывания в просмотрщике
  if (fv.value_type === 'file') {
    // Одиночный файл — в value_file; несколько (allow_multiple) — в value_files.
    const files = []
    if (fv.value_file) files.push({ key: 'single', file: fv.value_file })
    for (const f of fv.value_files || []) files.push({ key: f.id, file: f.file })
    previewFiles = files.map(({ file }) => file)

    display = files.length ? (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' }}>
        {files.map(({ key, file }, i) => (
          <button
            key={key}
            type="button"
            onClick={() => setPreviewIndex(i)}
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
            <Icon name="file-text" size={15} style={{ flex: 'none' }} />
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
      {previewIndex != null ? (
        <FilePreviewModal files={previewFiles} startIndex={previewIndex} onClose={() => setPreviewIndex(null)} />
      ) : null}
    </div>
  )
}

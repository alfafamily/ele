import { useState } from 'react'
import { FilePreviewModal } from './eav/FilePreviewModal.jsx'
import { Icon } from './ui/Icon/Icon.jsx'

// B67. Read-only список выбранных для экземпляра общих файлов Вида — на карточке
// имущества, в разделе «Файлы» после файловых реквизитов, под подзаголовком
// «Общие файлы вида». files — [{id, file}] (file = StoredFile), клик открывает
// встроенный просмотрщик с перелистыванием (как у файловых реквизитов).
export function TypeFilesView({ files }) {
  const [previewIndex, setPreviewIndex] = useState(null)
  if (!files || files.length === 0) return null
  const previewFiles = files.map((f) => f.file)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' }}>
      {files.map((f, i) => (
        <button
          key={f.id}
          type="button"
          onClick={() => setPreviewIndex(i)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, maxWidth: '100%', padding: 0,
            border: 'none', background: 'none', color: 'var(--color-primary)', fontWeight: 500,
            fontSize: 14, fontFamily: 'inherit', cursor: 'pointer', textAlign: 'left',
          }}
        >
          <Icon name="file-text" size={15} style={{ flex: 'none' }} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {f.file.original_filename}
          </span>
        </button>
      ))}
      {previewIndex != null ? (
        <FilePreviewModal files={previewFiles} startIndex={previewIndex} onClose={() => setPreviewIndex(null)} />
      ) : null}
    </div>
  )
}

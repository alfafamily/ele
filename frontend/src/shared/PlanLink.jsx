import { useState } from 'react'
import { FilePreviewModal } from './eav/FilePreviewModal.jsx'
import { Icon } from './ui/Icon/Icon.jsx'

// Текстовая ссылка «План парковки» — открывает план (PDF/изображение) во
// встроенном просмотрщике файлов, как файлы-реквизиты оборудования и др.
// stopPropagation — чтобы клик не срабатывал по строке-контейнеру (раскрытие).
export function PlanLink({ file, style }) {
  const [open, setOpen] = useState(false)
  if (!file?.url) return null
  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setOpen(true)
        }}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
          fontSize: 12.5,
          fontWeight: 600,
          background: 'none',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          fontFamily: 'inherit',
          color: 'var(--color-primary)',
          ...style,
        }}
      >
        <Icon name="file-text" size={13} strokeWidth={2} />
        План парковки
      </button>
      {open ? <FilePreviewModal file={file} onClose={() => setOpen(false)} /> : null}
    </>
  )
}

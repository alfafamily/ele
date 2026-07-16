import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '../ui/Icon/Icon.jsx'
import './FilePreviewModal.css'

// Определяем, можно ли показать файл во встроенном просмотрщике, по MIME-типу
// и расширению (StoredFile: content_type + original_filename).
function detectKind(file) {
  const ct = (file.content_type || '').toLowerCase()
  const name = (file.original_filename || '').toLowerCase()
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1) : ''
  if (ct.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'avif', 'svg'].includes(ext)) return 'image'
  if (ct === 'application/pdf' || ext === 'pdf') return 'pdf'
  if (ct.startsWith('text/') || ['txt', 'md', 'csv', 'log', 'json', 'xml', 'yml', 'yaml'].includes(ext)) return 'text'
  return 'other'
}

function formatSize(bytes) {
  if (bytes == null) return ''
  if (bytes < 1024) return `${bytes} Б`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1).replace('.', ',')} КБ`
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} МБ`
}

// Встроенный просмотрщик файлов реквизитов. Изображения/PDF/текст показываются
// прямо в модалке; для остальных типов (или при ошибке рендера) — сообщение и
// кнопка скачивания.
export function FilePreviewModal({ file, onClose }) {
  const [renderError, setRenderError] = useState(false)

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const kind = renderError ? 'other' : detectKind(file)

  return createPortal(
    <div className="ele-filepreview-overlay" onClick={onClose}>
      <div className="ele-filepreview" onClick={(e) => e.stopPropagation()}>
        <div className="ele-filepreview__head">
          <div className="ele-filepreview__title">
            <div className="ele-filepreview__name">{file.original_filename}</div>
            {file.size != null ? <div className="ele-filepreview__meta">{formatSize(file.size)}</div> : null}
          </div>
          <div className="ele-filepreview__actions">
            <a className="ele-filepreview__download" href={file.url} download={file.original_filename}>
              Скачать
            </a>
            <button type="button" className="ele-filepreview__close" onClick={onClose} aria-label="Закрыть">
              <Icon name="x" size={17} strokeWidth={2} />
            </button>
          </div>
        </div>

        <div className="ele-filepreview__body">
          {kind === 'image' ? (
            <img src={file.url} alt={file.original_filename} onError={() => setRenderError(true)} />
          ) : kind === 'pdf' || kind === 'text' ? (
            // sandbox="" — содержимое в изолированном (opaque) origin без
            // разрешения скриптов: даже если файл реально text/html, скрипты не
            // исполняются (защита от stored XSS через загруженный файл).
            <iframe src={file.url} title={file.original_filename} sandbox="" onError={() => setRenderError(true)} />
          ) : (
            <div className="ele-filepreview__fallback">
              <div className="ele-filepreview__fallback-icon">
                <Icon name="file-text" size={30} strokeWidth={1.7} />
              </div>
              <div className="ele-filepreview__fallback-title">Предпросмотр недоступен</div>
              <div className="ele-filepreview__fallback-text">
                Этот тип файла нельзя показать в браузере. Скачайте файл, чтобы открыть его в подходящей программе.
              </div>
              <a className="ele-filepreview__fallback-btn" href={file.url} download={file.original_filename}>
                Скачать файл
              </a>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}

import { useCallback, useEffect, useState } from 'react'
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
// кнопка скачивания. Если у реквизита несколько файлов (files + startIndex) —
// между ними можно переключаться стрелками ‹ › и клавишами ←/→.
export function FilePreviewModal({ files, file, startIndex = 0, onClose }) {
  // Поддерживаем и одиночный file (обратная совместимость), и массив files.
  const list = files && files.length ? files : file ? [file] : []
  const [idx, setIdx] = useState(startIndex)
  const [renderError, setRenderError] = useState(false)

  const clampedIdx = Math.min(list.length - 1, Math.max(0, idx))
  const current = list[clampedIdx]
  const hasNav = list.length > 1

  const go = useCallback(
    (delta) => setIdx((i) => Math.min(list.length - 1, Math.max(0, i + delta))),
    [list.length]
  )

  // При переключении файла сбрасываем ошибку рендера предыдущего.
  useEffect(() => {
    setRenderError(false)
  }, [clampedIdx])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft') go(-1)
      else if (e.key === 'ArrowRight') go(1)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, go])

  if (!current) return null

  const kind = renderError ? 'other' : detectKind(current)

  return createPortal(
    <div className="ele-filepreview-overlay" onClick={onClose}>
      <div className="ele-filepreview" onClick={(e) => e.stopPropagation()}>
        <div className="ele-filepreview__head">
          <div className="ele-filepreview__title">
            <div className="ele-filepreview__name">{current.original_filename}</div>
            <div className="ele-filepreview__meta">
              {hasNav ? `${clampedIdx + 1} из ${list.length}` : null}
              {hasNav && current.size != null ? ' · ' : null}
              {current.size != null ? formatSize(current.size) : null}
            </div>
          </div>
          <div className="ele-filepreview__actions">
            <a
              className="ele-filepreview__download"
              href={current.url}
              download={current.original_filename}
              target="_blank"
              rel="noopener noreferrer"
            >
              Скачать
            </a>
            <button type="button" className="ele-filepreview__close" onClick={onClose} aria-label="Закрыть">
              <Icon name="x" size={17} strokeWidth={2} />
            </button>
          </div>
        </div>

        <div className="ele-filepreview__body">
          {kind === 'image' ? (
            <img src={current.url} alt={current.original_filename} onError={() => setRenderError(true)} />
          ) : kind === 'pdf' ? (
            // PDF отдаётся с Content-Type: application/pdf (+X-Content-Type-Options:
            // nosniff в проде, infra/Caddyfile), поэтому исполняемого html/js тут
            // быть не может — stored XSS невозможен. sandbox="" НЕ ставим: он
            // ломает встроенный PDF-просмотрщик Chrome («Эта страница была
            // заблокирована браузером Chrome»).
            <iframe src={current.url} title={current.original_filename} onError={() => setRenderError(true)} />
          ) : kind === 'text' ? (
            // Текстовый файл может реально оказаться text/html — sandbox=""
            // (изолированный opaque origin без разрешения скриптов) нейтрализует
            // stored XSS через загруженный файл.
            <iframe src={current.url} title={current.original_filename} sandbox="" onError={() => setRenderError(true)} />
          ) : (
            <div className="ele-filepreview__fallback">
              <div className="ele-filepreview__fallback-icon">
                <Icon name="file-text" size={30} strokeWidth={1.7} />
              </div>
              <div className="ele-filepreview__fallback-title">Предпросмотр недоступен</div>
              <div className="ele-filepreview__fallback-text">
                Этот тип файла нельзя показать в браузере. Скачайте файл, чтобы открыть его в подходящей программе.
              </div>
              <a
                className="ele-filepreview__fallback-btn"
                href={current.url}
                download={current.original_filename}
                target="_blank"
                rel="noopener noreferrer"
              >
                Скачать файл
              </a>
            </div>
          )}
        </div>

        {hasNav ? (
          <>
            <button
              type="button"
              className="ele-filepreview__nav ele-filepreview__nav--prev"
              onClick={() => go(-1)}
              disabled={clampedIdx === 0}
              aria-label="Предыдущий файл"
            >
              <Icon name="chevron-left" size={22} strokeWidth={2} />
            </button>
            <button
              type="button"
              className="ele-filepreview__nav ele-filepreview__nav--next"
              onClick={() => go(1)}
              disabled={clampedIdx === list.length - 1}
              aria-label="Следующий файл"
            >
              <Icon name="chevron-right" size={22} strokeWidth={2} />
            </button>
          </>
        ) : null}
      </div>
    </div>,
    document.body
  )
}

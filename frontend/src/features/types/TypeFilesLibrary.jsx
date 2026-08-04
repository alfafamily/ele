import { useState } from 'react'
import { useCompany } from '../../app/CompanyContext'
import { useDragSort, reorder } from '../../shared/hooks/useDragSort.js'
import { FilePreviewModal } from '../../shared/eav/FilePreviewModal.jsx'
import { Icon } from '../../shared/ui'
import '../../shared/eav/FileFieldSlot.css'

// B67. Управление библиотекой общих файлов Вида в редакторе Вида: загрузка
// (несколько файлов за раз), список с просмотром, удалением и перетаскиванием
// для смены очерёдности (как у реквизитов вида). Порядок задаёт вывод файлов
// на форме объекта и на карточке объекта. api — makeTypesApi (домен зашит),
// typeId — выбранный Вид, files — текущий список [{id, file}], onChanged(list) —
// обновлённый список после загрузки/удаления/перестановки.
export function TypeFilesLibrary({ api, typeId, files, onChanged }) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState(null)
  const [previewIndex, setPreviewIndex] = useState(null)
  const maxMb = useCompany()?.max_upload_mb ?? 20

  const handleFile = async (e) => {
    const selected = Array.from(e.target.files || [])
    if (!selected.length) return
    const tooBig = selected.find((f) => f.size > maxMb * 1024 * 1024)
    if (tooBig) {
      setError(`Файл «${tooBig.name}» больше ${maxMb} МБ.`)
      e.target.value = ''
      return
    }
    setUploading(true)
    setError(null)
    const formData = new FormData()
    for (const f of selected) formData.append('file', f)
    try {
      const list = await api.uploadTypeFile(typeId, formData)
      onChanged(list)
    } catch (err) {
      setError(err.detail || 'Не удалось загрузить файл.')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const handleDelete = async (fileId) => {
    setUploading(true)
    setError(null)
    try {
      const list = await api.deleteTypeFile(typeId, fileId)
      onChanged(list)
    } catch (err) {
      setError(err.detail || 'Не удалось удалить файл.')
    } finally {
      setUploading(false)
    }
  }

  // Перестановка файлов перетаскиванием: оптимистично применяем порядок, затем
  // сохраняем на бэк (order = индекс). Ошибка — откат к прежнему списку.
  const handleReorder = async (from, to) => {
    const next = reorder(files, from, to)
    onChanged(next)
    try {
      const list = await api.reorderTypeFiles(typeId, next.map((f) => f.id))
      onChanged(list)
    } catch (err) {
      onChanged(files)
      setError(err.detail || 'Не удалось изменить порядок.')
    }
  }
  const drag = useDragSort(handleReorder)

  return (
    <div>
      {files.length ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
          {files.map((f, i) => (
            <div
              key={f.id}
              {...drag.rowProps(i)}
              className="ele-file-slot__current"
              style={{
                opacity: drag.dragIndex === i ? 0.4 : 1,
                outline:
                  drag.overIndex === i && drag.dragIndex !== null && drag.dragIndex !== i
                    ? '2px solid var(--color-text-placeholder)'
                    : 'none',
                outlineOffset: '-1px',
              }}
            >
              {files.length > 1 ? (
                <span
                  data-drag-handle
                  aria-label="Перетащить для изменения порядка"
                  style={{ flex: 'none', display: 'flex', color: 'var(--color-text-placeholder)', cursor: 'grab', touchAction: 'none' }}
                >
                  <Icon name="grip-vertical" size={18} strokeWidth={2} />
                </span>
              ) : null}
              <button
                type="button"
                onClick={() => setPreviewIndex(i)}
                className="ele-file-slot__name"
                title={f.file.original_filename}
                style={{ flex: 1, minWidth: 0, border: 'none', background: 'none', color: 'var(--color-primary)', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', padding: 0 }}
              >
                {f.file.original_filename}
              </button>
              <span className="ele-file-slot__size">{Math.round(f.file.size / 1024)} КБ</span>
              <button
                type="button"
                onClick={() => handleDelete(f.id)}
                disabled={uploading}
                style={{ border: 'none', background: 'none', color: 'var(--color-error)', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', cursor: uploading ? 'default' : 'pointer', padding: 4 }}
              >
                Удалить
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <div className="ele-file-slot__dropzone">
        <input type="file" multiple onChange={handleFile} disabled={uploading} />
        <div style={{ fontSize: 14 }}>
          <b>{uploading ? 'Загрузка…' : 'Добавить файл'}</b>
          {!uploading ? ' или перетяните в эту область' : ''}
        </div>
        <div className="ele-file-slot__hint">максимальный размер {maxMb} МБ</div>
      </div>

      {error ? <div className="ele-field__error-text">{error}</div> : null}

      {previewIndex != null ? (
        <FilePreviewModal files={files.map((f) => f.file)} startIndex={previewIndex} onClose={() => setPreviewIndex(null)} />
      ) : null}
    </div>
  )
}

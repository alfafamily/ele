import { useState } from 'react'
import { useCompany } from '../../app/CompanyContext'
import { FilePreviewModal } from '../../shared/eav/FilePreviewModal.jsx'
import '../../shared/eav/FileFieldSlot.css'

// B67. Управление библиотекой общих файлов Вида в редакторе Вида: загрузка
// (несколько файлов за раз), список с просмотром и удалением. api — makeTypesApi
// (домен уже зашит), typeId — выбранный Вид, files — текущий список [{id, file}]
// (из type_files Вида), onChanged(list) — обновлённый список после загрузки/удаления.
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

  return (
    <div>
      {files.length ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8, marginBottom: 10 }}>
          {files.map((f, i) => (
            <div key={f.id} className="ele-file-slot__current">
              <button
                type="button"
                onClick={() => setPreviewIndex(i)}
                className="ele-file-slot__name"
                title={f.file.original_filename}
                style={{ border: 'none', background: 'none', color: 'var(--color-primary)', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', padding: 0 }}
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

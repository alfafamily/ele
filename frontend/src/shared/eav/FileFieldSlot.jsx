import { useState } from 'react'
import { apiDelete, apiPost } from '../api/client'
import './FileFieldSlot.css'

// Файловый реквизит в форме (§3.5, §3.7) — грузится сразу по выбору файла
// через отдельный action-эндпоинт, не часть основного submit формы. Объект
// должен уже существовать (uploadPath строится из его id), поэтому на форме
// создания слот заблокирован до первого сохранения.
export function FileFieldSlot({ field, currentValueFile, uploadPath, onUploaded, disabled }) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState(null)

  const handleDelete = async () => {
    setUploading(true)
    setError(null)
    try {
      await apiDelete(uploadPath)
      onUploaded(null) // очищаем значение в форме (файл удалён на сервере)
    } catch (err) {
      setError(err.detail || 'Не удалось удалить файл.')
    } finally {
      setUploading(false)
    }
  }

  const handleFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 20 * 1024 * 1024) {
      setError('Файл больше 20 МБ.')
      e.target.value = ''
      return
    }
    setUploading(true)
    setError(null)
    const formData = new FormData()
    formData.append('file', file)
    try {
      const data = await apiPost(uploadPath, formData)
      onUploaded(data)
    } catch (err) {
      setError(err.detail || 'Не удалось загрузить файл.')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  return (
    <div>
      <div className="ele-file-slot__label">
        {field.name}
        {field.is_required ? <span style={{ color: 'var(--color-error)' }}> *</span> : null}
      </div>
      {currentValueFile ? (
        <div className="ele-file-slot__current">
          <a href={currentValueFile.url} target="_blank" rel="noreferrer" style={{ fontWeight: 500, fontSize: 13.5 }}>
            {currentValueFile.original_filename}
          </a>
          <span style={{ fontSize: 12, color: 'var(--color-text-placeholder)' }}>
            {Math.round(currentValueFile.size / 1024)} КБ
          </span>
          {!disabled ? (
            <button
              type="button"
              onClick={handleDelete}
              disabled={uploading}
              style={{
                border: 'none',
                background: 'none',
                color: 'var(--color-error)',
                fontSize: 13,
                fontWeight: 600,
                fontFamily: 'inherit',
                cursor: uploading ? 'default' : 'pointer',
                padding: 4,
              }}
            >
              {uploading ? 'Удаление…' : 'Удалить'}
            </button>
          ) : null}
        </div>
      ) : disabled ? (
        <div className="ele-file-slot__disabled">Сохраните объект, чтобы прикрепить файл</div>
      ) : null}
      {!disabled && !currentValueFile ? (
        // Зона загрузки показывается только когда файла нет. Чтобы заменить —
        // сначала явное «Удалить», затем загрузка нового (по просьбе).
        <div className="ele-file-slot__dropzone">
          <input type="file" onChange={handleFile} disabled={uploading} />
          <div style={{ fontSize: 14 }}>
            <b>{uploading ? 'Загрузка…' : 'Выберите файл'}</b>
            {!uploading ? ' или перетяните в эту область' : ''}
          </div>
          <div className="ele-file-slot__hint">максимальный размер 20 МБ</div>
        </div>
      ) : null}
      {error ? <div className="ele-field__error-text">{error}</div> : null}
    </div>
  )
}

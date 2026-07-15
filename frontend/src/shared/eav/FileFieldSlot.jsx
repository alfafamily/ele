import { useState } from 'react'
import { apiDelete, apiPost } from '../api/client'
import './FileFieldSlot.css'

// Файловый реквизит в форме — грузится сразу по выбору файла
// через отдельный action-эндпоинт, не часть основного submit формы. Объект
// должен уже существовать (uploadPath строится из его id), поэтому на форме
// создания слот заблокирован до первого сохранения.
//
// multiple (allow_multiple) — можно прикрепить несколько файлов: они приходят в
// fv.value_files ([{id, file}]) и удаляются по одному через makeDeleteFilePath.
// Одиночный режим работает с fv.value_file и DELETE на uploadPath (как раньше).
export function FileFieldSlot({ field, fv, multiple, uploadPath, makeDeleteFilePath, onChange, disabled }) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState(null)

  const currentValueFile = fv?.value_file || null
  // В множественном режиме показываем и legacy-одиночный value_file (если
  // реквизит раньше был одиночным, а флаг «несколько файлов» включили позже —
  // он ещё не перенесён в дочернюю таблицу и появится там при следующей
  // загрузке). single: true — удаляется field-level эндпоинтом, не по id.
  const displayFiles = [
    ...(fv?.value_file ? [{ key: 'single', file: fv.value_file, single: true }] : []),
    ...(fv?.value_files || []).map((f) => ({ key: f.id, id: f.id, file: f.file, single: false })),
  ]

  const handleDeleteSingle = async () => {
    setUploading(true)
    setError(null)
    try {
      await apiDelete(uploadPath)
      // Сохраняем остальные (value_files) — обнуляем только legacy value_file.
      onChange(fv ? { ...fv, value_file: null } : null)
    } catch (err) {
      setError(err.detail || 'Не удалось удалить файл.')
    } finally {
      setUploading(false)
    }
  }

  const handleDeleteOne = async (fileId) => {
    setUploading(true)
    setError(null)
    try {
      await apiDelete(makeDeleteFilePath(fileId))
      // Фильтруем оригинальный value_files (не объединённый displayFiles),
      // иначе legacy value_file попал бы в value_files и задвоился.
      onChange({ ...fv, value_files: (fv.value_files || []).filter((f) => f.id !== fileId) })
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
      onChange(data) // POST возвращает полный FieldValueOut (value_file/value_files)
    } catch (err) {
      setError(err.detail || 'Не удалось загрузить файл.')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const dropzone = (
    <div className="ele-file-slot__dropzone">
      <input type="file" onChange={handleFile} disabled={uploading} />
      <div style={{ fontSize: 14 }}>
        <b>{uploading ? 'Загрузка…' : multiple ? 'Добавить файл' : 'Выберите файл'}</b>
        {!uploading ? ' или перетяните в эту область' : ''}
      </div>
      <div className="ele-file-slot__hint">максимальный размер 20 МБ</div>
    </div>
  )

  return (
    <div>
      <div className="ele-file-slot__label">
        {field.name}
        {field.is_required ? <span style={{ color: 'var(--color-error)' }}> *</span> : null}
      </div>

      {multiple ? (
        <>
          {displayFiles.length ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8, marginBottom: disabled ? 0 : 10 }}>
              {displayFiles.map((f) => (
                <div key={f.key} className="ele-file-slot__current">
                  <a href={f.file.url} target="_blank" rel="noreferrer" style={{ fontWeight: 500, fontSize: 13.5 }}>
                    {f.file.original_filename}
                  </a>
                  <span style={{ fontSize: 12, color: 'var(--color-text-placeholder)' }}>{Math.round(f.file.size / 1024)} КБ</span>
                  {!disabled ? (
                    <button
                      type="button"
                      onClick={() => (f.single ? handleDeleteSingle() : handleDeleteOne(f.id))}
                      disabled={uploading}
                      style={{ border: 'none', background: 'none', color: 'var(--color-error)', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', cursor: uploading ? 'default' : 'pointer', padding: 4 }}
                    >
                      Удалить
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
          {disabled ? (
            displayFiles.length === 0 ? <div className="ele-file-slot__disabled">Сохраните объект, чтобы прикрепить файлы</div> : null
          ) : (
            dropzone
          )}
        </>
      ) : (
        <>
          {currentValueFile ? (
            <div className="ele-file-slot__current">
              <a href={currentValueFile.url} target="_blank" rel="noreferrer" style={{ fontWeight: 500, fontSize: 13.5 }}>
                {currentValueFile.original_filename}
              </a>
              <span style={{ fontSize: 12, color: 'var(--color-text-placeholder)' }}>{Math.round(currentValueFile.size / 1024)} КБ</span>
              {!disabled ? (
                <button
                  type="button"
                  onClick={handleDeleteSingle}
                  disabled={uploading}
                  style={{ border: 'none', background: 'none', color: 'var(--color-error)', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', cursor: uploading ? 'default' : 'pointer', padding: 4 }}
                >
                  {uploading ? 'Удаление…' : 'Удалить'}
                </button>
              ) : null}
            </div>
          ) : disabled ? (
            <div className="ele-file-slot__disabled">Сохраните объект, чтобы прикрепить файл</div>
          ) : null}
          {/* Зона загрузки показывается только когда файла нет. Чтобы заменить —
              сначала явное «Удалить», затем загрузка нового (по просьбе). */}
          {!disabled && !currentValueFile ? dropzone : null}
        </>
      )}

      {error ? <div className="ele-field__error-text">{error}</div> : null}
    </div>
  )
}

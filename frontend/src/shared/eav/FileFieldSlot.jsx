import { useState } from 'react'
import { apiDelete, apiPost } from '../api/client'
import './FileFieldSlot.css'

// Файловый реквизит в форме — грузится сразу по выбору файла
// через отдельный action-эндпоинт, не часть основного submit формы. Объект
// должен уже существовать (uploadPath строится из его id), поэтому на форме
// создания слот заблокирован до первого сохранения.
//
// Отображение файлов единое для обоих режимов: показываем и одиночный
// value_file, и дочерние value_files ([{id, file}]). Это важно, чтобы при
// переключении реквизита между «один файл» и «несколько» уже загруженные файлы
// не пропадали из вида. Отличается только логика загрузки:
//   multiple  — зона загрузки видна всегда, файлы добавляются;
//   одиночный — зона видна только когда файлов нет (замена через «Удалить»).
// Удаление: legacy value_file (single: true) — field-level эндпоинтом, дочерние
// — по id через makeDeleteFilePath.
export function FileFieldSlot({ field, fv, multiple, uploadPath, makeDeleteFilePath, onChange, disabled }) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState(null)

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
    const selected = Array.from(e.target.files || [])
    if (!selected.length) return
    const tooBig = selected.find((f) => f.size > 20 * 1024 * 1024)
    if (tooBig) {
      setError(`Файл «${tooBig.name}» больше 20 МБ.`)
      e.target.value = ''
      return
    }
    setUploading(true)
    setError(null)
    // Множественный реквизит грузит все выбранные файлы одним запросом
    // (несколько полей "file"); одиночный — один.
    const formData = new FormData()
    for (const f of selected) formData.append('file', f)
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

  // Одиночный реквизит показывает зону загрузки только когда файлов нет;
  // множественный — всегда (пока не заблокирован до первого сохранения).
  const showDropzone = !disabled && (multiple || displayFiles.length === 0)

  return (
    <div>
      <div className="ele-file-slot__label">
        {field.name}
        {field.is_required ? <span style={{ color: 'var(--color-error)' }}> *</span> : null}
      </div>

      {displayFiles.length ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8, marginBottom: showDropzone ? 10 : 0 }}>
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

      {disabled && displayFiles.length === 0 ? (
        <div className="ele-file-slot__disabled">Сохраните объект, чтобы прикрепить {multiple ? 'файлы' : 'файл'}</div>
      ) : null}

      {showDropzone ? (
        <div className="ele-file-slot__dropzone">
          <input type="file" multiple={multiple} onChange={handleFile} disabled={uploading} />
          <div style={{ fontSize: 14 }}>
            <b>{uploading ? 'Загрузка…' : multiple ? 'Добавить файл' : 'Выберите файл'}</b>
            {!uploading ? ' или перетяните в эту область' : ''}
          </div>
          <div className="ele-file-slot__hint">максимальный размер 20 МБ</div>
        </div>
      ) : null}

      {error ? <div className="ele-field__error-text">{error}</div> : null}
    </div>
  )
}

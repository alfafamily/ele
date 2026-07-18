import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { apiPost } from '../../shared/api/client'
import { CustomFieldsEditor } from '../../shared/CustomFieldsEditor.jsx'
import { FieldValueInput, FileFieldSlot } from '../../shared/eav'
import { Banner, Button, Card, Icon, Input, Select, Spinner } from '../../shared/ui'
import {
  assignEmployee,
  createEquipment,
  deleteEquipmentFieldFilePath,
  getEquipment,
  getEquipmentTypes,
  updateEquipment,
  uploadEquipmentFieldFile,
} from './equipmentApi.js'
import { generateNextNumber } from '../settings/settingsApi.js'

function buildValueMap(fieldValues) {
  const map = {}
  for (const fv of fieldValues || []) {
    if (fv.value_type !== 'file') map[fv.field] = fv.value
  }
  return map
}

export function EquipmentFormPage() {
  const { id } = useParams()
  const isEdit = Boolean(id)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  // Создание из карточки сотрудника — сразу закрепляем за ним и возвращаемся туда.
  const employeeId = searchParams.get('employee')

  const [types, setTypes] = useState(null)
  const [equipment, setEquipment] = useState(null)
  const [typeId, setTypeId] = useState('')
  const [inventoryNumber, setInventoryNumber] = useState('')
  const [values, setValues] = useState({})
  const [fileValues, setFileValues] = useState({}) // fieldId -> {field values entry}
  const [customFields, setCustomFields] = useState([])
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [genLoading, setGenLoading] = useState(false)

  useEffect(() => {
    getEquipmentTypes().then(setTypes)
  }, [])

  // Автонумератор: подставить следующий учётный номер (счётчик на сервере
  // сгорает сразу). Только при создании; введённый вручную номер не трогаем.
  const generateNumber = async () => {
    setGenLoading(true)
    setError(null)
    try {
      const { number } = await generateNextNumber('equipment')
      setInventoryNumber(number)
    } catch (err) {
      setError(err?.detail || 'Не удалось сгенерировать номер.')
    } finally {
      setGenLoading(false)
    }
  }

  useEffect(() => {
    if (!isEdit) return
    getEquipment(id).then((data) => {
      setEquipment(data)
      setTypeId(String(data.equipment_type))
      setInventoryNumber(data.inventory_number)
      setValues(buildValueMap(data.field_values))
      const fMap = {}
      for (const fv of data.field_values) if (fv.value_type === 'file') fMap[fv.field] = fv
      setFileValues(fMap)
      setCustomFields(data.custom_fields)
    })
  }, [id, isEdit])

  if (types === null || (isEdit && !equipment)) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
        <Spinner />
      </div>
    )
  }

  const selectedType = types.find((t) => String(t.id) === String(typeId))
  const typeFields = selectedType?.fields || []

  const handleTypeChange = (newTypeId) => {
    setTypeId(newTypeId)
    setValues({})
    setFileValues({})
  }

  const submit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    const payload = {
      inventory_number: inventoryNumber,
      equipment_type: Number(typeId),
      field_values_input: typeFields.filter((f) => f.value_type !== 'file').map((f) => ({ field: f.id, value: values[f.id] ?? null })),
      custom_fields: customFields.filter((f) => f.name.trim()),
    }
    if (!isEdit && comment.trim()) payload.comment = comment.trim()
    try {
      if (isEdit) {
        await updateEquipment(id, payload)
        // Возврат к карточке, откуда пришли в редактирование (не push новой
        // записи в историю) — тогда «Назад» с карточки ведёт в список, а не
        // снова в форму редактирования.
        navigate(-1)
      } else {
        const created = await createEquipment(payload)
        // Файловые реквизиты нельзя приложить в основном payload (нужен id
        // объекта) — грузим прикреплённые на форме файлы сразу после создания.
        // Если загрузка какого-то файла упала — ведём на форму редактирования,
        // где слоты активны и файл можно приложить повторно.
        const fileFields = typeFields.filter((f) => f.value_type === 'file')
        let uploadFailed = false
        for (const f of fileFields) {
          const pending = fileValues[f.id]?.pendingFiles
          if (!pending?.length) continue
          const formData = new FormData()
          for (const file of pending) formData.append('file', file)
          try {
            await apiPost(uploadEquipmentFieldFile(created.id, f.id), formData)
          } catch {
            uploadFailed = true
          }
        }
        // Закрепление за сотрудником (если создаём из его карточки) — отдельным
        // вызовом, т.к. форма оборудования не задаёт employee в payload.
        if (employeeId) {
          try {
            await assignEmployee(created.id, Number(employeeId))
          } catch {
            // Не удалось закрепить — оставим объект свободным; пользователь
            // сможет закрепить его с карточки оборудования.
          }
        }
        // replace — чтобы форма создания не оставалась в истории. При загрузке
        // файлов с ошибкой ведём на форму редактирования (слоты активны); иначе
        // при создании из карточки сотрудника — обратно к нему, а из раздела —
        // на карточку нового объекта.
        const target = uploadFailed
          ? `/equipment/${created.id}/edit`
          : employeeId
            ? `/employees/${employeeId}`
            : `/equipment/${created.id}`
        navigate(target, { replace: true })
      }
    } catch (err) {
      if (err.errors) {
        const messages = Object.values(err.errors).flat()
        setError(messages.join(' '))
      } else {
        setError(err.detail || 'Не удалось сохранить оборудование.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ width: '100%', maxWidth: 660 }}>
        <div className="ele-form-head">
          <h1 className="ele-form-head__title">
            {isEdit ? 'Редактирование оборудования' : 'Новое оборудование'}
          </h1>
          <div style={{ display: 'flex', gap: 10, flex: 'none' }}>
            <Button variant="secondary" onClick={() => navigate(-1)} aria-label="Отмена">
              <span className="ele-only-desktop">Отмена</span>
              <Icon className="ele-only-mobile" name="x" size={18} strokeWidth={2} />
            </Button>
            <Button loading={submitting} onClick={submit} aria-label="Сохранить">
              <span className="ele-only-desktop">Сохранить</span>
              <Icon className="ele-only-mobile" name="check" size={18} strokeWidth={2.2} />
            </Button>
          </div>
        </div>

        {error ? <Banner variant="error">{error}</Banner> : null}

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: error ? 16 : 0 }}>
          <Card>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Основная информация</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Select label="Тип оборудования" required placeholder="Выберите тип" value={typeId} onChange={handleTypeChange}>
                {types
                  .filter((t) => !t.is_archived || String(t.id) === String(typeId))
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
              </Select>
              {/* Закрепление сотрудника здесь не задаётся — оно выполняется на
                  карточке оборудования (кнопка «Закрепить сотрудника»). */}
              <Input
                label="Учётный номер"
                required
                value={inventoryNumber}
                onChange={(e) => setInventoryNumber(e.target.value)}
                style={{ fontFamily: 'var(--font-mono)' }}
                trailing={!isEdit ? (
                  <button
                    type="button"
                    className="ele-field__icon-btn"
                    onClick={generateNumber}
                    disabled={genLoading}
                    title="Сгенерировать номер"
                    aria-label="Сгенерировать учётный номер"
                  >
                    <Icon name="pencil-sparkles" size={18} />
                  </button>
                ) : null}
              />
            </div>
          </Card>

          {selectedType && typeFields.some((f) => f.value_type !== 'file') ? (
            <Card>
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Параметры оборудования</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {typeFields
                  .filter((f) => f.value_type !== 'file')
                  .map((f) => (
                    <FieldValueInput
                      key={f.id}
                      field={f}
                      value={values[f.id]}
                      onChange={(v) => setValues((prev) => ({ ...prev, [f.id]: v }))}
                    />
                  ))}
              </div>
            </Card>
          ) : null}

          {selectedType && typeFields.some((f) => f.value_type === 'file') ? (
            <Card>
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Файлы</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {typeFields
                  .filter((f) => f.value_type === 'file')
                  .map((f) => (
                    <FileFieldSlot
                      key={f.id}
                      field={f}
                      fv={fileValues[f.id]}
                      multiple={f.allow_multiple}
                      deferred={!isEdit}
                      uploadPath={isEdit ? uploadEquipmentFieldFile(id, f.id) : undefined}
                      makeDeleteFilePath={isEdit ? (fileId) => deleteEquipmentFieldFilePath(id, f.id, fileId) : undefined}
                      onChange={(data) => setFileValues((prev) => ({ ...prev, [f.id]: data }))}
                    />
                  ))}
              </div>
            </Card>
          ) : null}

          <Card>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>Дополнительные поля</div>
            <div style={{ fontSize: 13, color: 'var(--color-text-placeholder)', marginBottom: 14 }}>
              Произвольные текстовые поля для этого объекта.
            </div>
            <CustomFieldsEditor items={customFields} onChange={setCustomFields} />
          </Card>

          {!isEdit ? (
            <Card>
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>Комментарий</div>
              <div style={{ fontSize: 13, color: 'var(--color-text-placeholder)', marginBottom: 14 }}>
                Необязательный. Отобразится в истории движений в записи создания.
              </div>
              <Input multiline value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Например: получено от поставщика по накладной №…" />
            </Card>
          ) : null}
        </form>
      </div>
    </div>
  )
}

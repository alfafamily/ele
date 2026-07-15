import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { CustomFieldsEditor } from '../../shared/CustomFieldsEditor.jsx'
import { FieldValueInput, FileFieldSlot } from '../../shared/eav'
import { EmployeePicker } from '../../shared/EmployeePicker.jsx'
import { Banner, Button, Card, Input, Select, Spinner } from '../../shared/ui'
import {
  createEquipment,
  deleteEquipmentFieldFilePath,
  getEquipment,
  getEquipmentTypes,
  updateEquipment,
  uploadEquipmentFieldFile,
} from './equipmentApi.js'

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

  const [types, setTypes] = useState(null)
  const [equipment, setEquipment] = useState(null)
  const [typeId, setTypeId] = useState('')
  const [inventoryNumber, setInventoryNumber] = useState('')
  const [employee, setEmployee] = useState(null)
  const [showEmployeePicker, setShowEmployeePicker] = useState(false)
  const [values, setValues] = useState({})
  const [fileValues, setFileValues] = useState({}) // fieldId -> {field values entry}
  const [customFields, setCustomFields] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    getEquipmentTypes().then(setTypes)
  }, [])

  useEffect(() => {
    if (!isEdit) return
    getEquipment(id).then((data) => {
      setEquipment(data)
      setTypeId(String(data.equipment_type))
      setInventoryNumber(data.inventory_number)
      setEmployee(data.employee ? { id: data.employee, full_name: data.employee_name } : null)
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
      employee: employee?.id ?? null,
      field_values_input: typeFields.filter((f) => f.value_type !== 'file').map((f) => ({ field: f.id, value: values[f.id] ?? null })),
      custom_fields: customFields.filter((f) => f.name.trim()),
    }
    try {
      if (isEdit) {
        await updateEquipment(id, payload)
        navigate(`/equipment/${id}`)
      } else {
        const created = await createEquipment(payload)
        // Файловые реквизиты можно приложить только после создания объекта —
        // ведём на форму редактирования, где слоты активны (иначе обязательный
        // файл прикрепить негде).
        const hasFileFields = typeFields.some((f) => f.value_type === 'file')
        navigate(hasFileFields ? `/equipment/${created.id}/edit` : `/equipment/${created.id}`)
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 20 }}>
          <h1 style={{ fontSize: 26, fontWeight: 600, letterSpacing: '-0.4px', minWidth: 0, overflowWrap: 'break-word' }}>
            {isEdit ? 'Редактирование оборудования' : 'Новое оборудование'}
          </h1>
          <div style={{ display: 'flex', gap: 10, flex: 'none' }}>
            <Button variant="secondary" onClick={() => navigate(-1)} aria-label="Отмена">
              <span className="ele-only-desktop">Отмена</span>
              <svg className="ele-only-mobile" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </Button>
            <Button loading={submitting} onClick={submit} aria-label="Сохранить">
              <span className="ele-only-desktop">Сохранить</span>
              <svg className="ele-only-mobile" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12l5 5L20 6" />
              </svg>
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
              <div className="ele-form-2col">
                <Input
                  label="Учётный номер"
                  required
                  value={inventoryNumber}
                  onChange={(e) => setInventoryNumber(e.target.value)}
                  style={{ fontFamily: 'var(--font-mono)' }}
                />
                {/* Тот же паттерн поля, что и Input (label внутри box), но
                    комбобокс подбора Сотрудника. Значение — в одну строку с «…»
                    (иначе на мобильных длинное ФИО переносилось на вторую). */}
                <div className="ele-field">
                  {showEmployeePicker ? (
                    <EmployeePicker
                      autoFocus
                      onSelect={(emp) => {
                        setEmployee(emp)
                        setShowEmployeePicker(false)
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      className="ele-field__box"
                      onClick={() => setShowEmployeePicker(true)}
                      style={{ width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
                    >
                      <div className="ele-field__inner">
                        <span className="ele-field__label">Сотрудник</span>
                        <div
                          className="ele-field__input"
                          style={{
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            color: employee ? 'var(--color-text-primary)' : 'var(--color-text-placeholder)',
                          }}
                        >
                          {employee?.full_name || 'Не закреплено'}
                        </div>
                      </div>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </Card>

          {selectedType ? (
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
                {typeFields
                  .filter((f) => f.value_type === 'file')
                  .map((f) => (
                    <FileFieldSlot
                      key={f.id}
                      field={f}
                      fv={fileValues[f.id]}
                      multiple={f.allow_multiple}
                      disabled={!isEdit}
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
        </form>
      </div>
    </div>
  )
}

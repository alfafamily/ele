import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { apiGet, apiPost } from '../../shared/api/client'
import { CustomFieldsEditor } from '../../shared/CustomFieldsEditor.jsx'
import { FieldValueInput, FileFieldSlot } from '../../shared/eav'
import { EmployeePicker } from '../../shared/EmployeePicker.jsx'
import { SelectedEmployee } from '../../shared/SelectedEmployee.jsx'
import { ModeToggle } from '../../shared/ModeToggle.jsx'
import { PLACEMENT } from '../../shared/placement.js'
import { TypeFilesPicker } from '../../shared/TypeFilesPicker.jsx'
import { BackButton, Banner, Card, FormActions, Icon, Input, Spinner, TypeSelect } from '../../shared/ui'
import { splitApiError } from '../../shared/formErrors.js'
import { requiredValueErrors } from '../../shared/eav'
import {
  createTransport,
  deleteTransportFieldFilePath,
  getTransport,
  getTransportTypes,
  updateTransport,
  uploadTransportFieldFile,
} from './transportApi.js'
import { generateNextNumber } from '../settings/settingsApi.js'

function buildValueMap(fieldValues) {
  const map = {}
  for (const fv of fieldValues || []) {
    if (fv.value_type !== 'file') map[fv.field] = fv.value
  }
  return map
}

export function TransportFormPage() {
  const { id } = useParams()
  const isEdit = Boolean(id)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const employeeId = searchParams.get('employee')

  const [types, setTypes] = useState(null)
  const [transport, setTransport] = useState(null)
  const [typeId, setTypeId] = useState('')
  const [inventoryNumber, setInventoryNumber] = useState('')
  const [values, setValues] = useState({})
  const [fileValues, setFileValues] = useState({})
  const [typeFileIds, setTypeFileIds] = useState([]) // B67: выбранные файлы Вида (id)
  const [customFields, setCustomFields] = useState([])
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  // Ошибки под конкретными полями (см. форму Оборудования).
  const [fieldErrors, setFieldErrors] = useState({})
  const [valueErrors, setValueErrors] = useState({})
  const [placeError, setPlaceError] = useState(null)
  const [genLoading, setGenLoading] = useState(false)
  // Размещение при создании (B3): за сотрудником (mobile) или свободный (free).
  const [placementMode, setPlacementMode] = useState(employeeId ? 'mobile' : 'free')
  const [placementEmployee, setPlacementEmployee] = useState(null)

  useEffect(() => {
    getTransportTypes().then(setTypes)
  }, [])

  useEffect(() => {
    if (employeeId) {
      apiGet(`/api/employees/${employeeId}/`)
        .then((e) => setPlacementEmployee({ id: e.id, full_name: e.full_name }))
        .catch(() => {})
    }
  }, [employeeId])

  const generateNumber = async () => {
    setGenLoading(true)
    setError(null)
    try {
      const { number } = await generateNextNumber('transport')
      setInventoryNumber(number)
    } catch (err) {
      setError(err?.detail || 'Не удалось сгенерировать номер.')
    } finally {
      setGenLoading(false)
    }
  }

  useEffect(() => {
    if (!isEdit) return
    getTransport(id).then((data) => {
      setTransport(data)
      setTypeId(String(data.transport_type))
      setInventoryNumber(data.inventory_number)
      setValues(buildValueMap(data.field_values))
      const fMap = {}
      for (const fv of data.field_values) if (fv.value_type === 'file') fMap[fv.field] = fv
      setFileValues(fMap)
      setTypeFileIds((data.type_files || []).map((f) => f.id))
      setCustomFields(data.custom_fields)
    })
  }, [id, isEdit])

  if (types === null || (isEdit && !transport)) {
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
    setTypeFileIds([]) // B67: другой Вид — своя библиотека файлов
    setFieldErrors((prev) => ({ ...prev, transport_type: undefined }))
    setValueErrors({})
  }

  const submit = async (e) => {
    e.preventDefault()
    // Клиентская валидация обязательных полей — понятная ошибка сразу под полем.
    const fe = {}
    if (!typeId) fe.transport_type = 'Выберите вид транспорта.'
    if (!inventoryNumber.trim()) fe.inventory_number = 'Укажите учётный номер.'
    const ve = requiredValueErrors(typeFields, values)
    let placeErr = null
    if (!isEdit && placementMode === 'mobile' && !placementEmployee) {
      placeErr = 'Выберите сотрудника для закрепления.'
    }
    setFieldErrors(fe)
    setValueErrors(ve)
    setPlaceError(placeErr)
    if (Object.keys(fe).length || Object.keys(ve).length || placeErr) {
      setError(null)
      return
    }

    setSubmitting(true)
    setError(null)
    const payload = {
      inventory_number: inventoryNumber,
      transport_type: Number(typeId),
      field_values_input: typeFields.filter((f) => f.value_type !== 'file').map((f) => ({ field: f.id, value: values[f.id] ?? null })),
      custom_fields: customFields.filter((f) => f.name.trim()),
      type_file_ids: typeFileIds,
    }
    if (!isEdit && comment.trim()) payload.comment = comment.trim()
    if (!isEdit && placementMode === 'mobile') {
      payload.employee = placementEmployee.id
      // free — сотрудник не задаётся (транспорт свободен).
    }
    try {
      if (isEdit) {
        await updateTransport(id, payload)
        navigate(-1)
      } else {
        const created = await createTransport(payload)
        const fileFields = typeFields.filter((f) => f.value_type === 'file')
        let uploadFailed = false
        for (const f of fileFields) {
          const pending = fileValues[f.id]?.pendingFiles
          if (!pending?.length) continue
          const formData = new FormData()
          for (const file of pending) formData.append('file', file)
          try {
            await apiPost(uploadTransportFieldFile(created.id, f.id), formData)
          } catch {
            uploadFailed = true
          }
        }
        const target = uploadFailed
          ? `/transport/${created.id}/edit`
          : employeeId
            ? `/employees/${employeeId}`
            : `/transport/${created.id}`
        navigate(target, { replace: true })
      }
    } catch (err) {
      const { fieldErrors: fe, formError } = splitApiError(err, { bannerKeys: ['field_values'] })
      setFieldErrors(fe)
      setError(formError || 'Не удалось сохранить транспорт.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ width: '100%', maxWidth: 660 }}>
        <div className="ele-form-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            <BackButton />
            <h1 className="ele-form-head__title">
              {isEdit ? 'Редактирование транспорта' : 'Новый транспорт'}
            </h1>
          </div>
        </div>

        {error ? <Banner variant="error">{error}</Banner> : null}

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: error ? 16 : 0 }}>
          <Card>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Основная информация</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <TypeSelect
                label="Вид транспорта"
                required
                icon="car"
                options={types.filter((t) => !t.is_archived || String(t.id) === String(typeId))}
                value={typeId}
                onChange={handleTypeChange}
                error={fieldErrors.transport_type}
              />
              <Input
                label="Учётный номер"
                required
                value={inventoryNumber}
                onChange={(e) => setInventoryNumber(e.target.value)}
                error={fieldErrors.inventory_number}
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
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Параметры транспорта</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {typeFields
                  .filter((f) => f.value_type !== 'file')
                  .map((f) => (
                    <FieldValueInput
                      key={f.id}
                      field={f}
                      value={values[f.id]}
                      error={valueErrors[f.id]}
                      onChange={(v) => {
                        setValues((prev) => ({ ...prev, [f.id]: v }))
                        setValueErrors((prev) => (prev[f.id] ? { ...prev, [f.id]: undefined } : prev))
                      }}
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
                      uploadPath={isEdit ? uploadTransportFieldFile(id, f.id) : undefined}
                      makeDeleteFilePath={isEdit ? (fileId) => deleteTransportFieldFilePath(id, f.id, fileId) : undefined}
                      onChange={(data) => setFileValues((prev) => ({ ...prev, [f.id]: data }))}
                    />
                  ))}
              </div>
            </Card>
          ) : null}

          {selectedType && (selectedType.type_files?.length ?? 0) > 0 ? (
            <Card>
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>Общие файлы вида</div>
              <div style={{ fontSize: 13, color: 'var(--color-text-placeholder)', marginBottom: 14 }}>
                Отметьте файлы вида, которые нужно показать на карточке этого объекта.
              </div>
              <TypeFilesPicker
                available={selectedType.type_files}
                selectedIds={typeFileIds}
                onChange={setTypeFileIds}
              />
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
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>Закрепление</div>
              <div style={{ fontSize: 13, color: 'var(--color-text-placeholder)', marginBottom: 14 }}>
                {employeeId
                  ? 'Транспорт будет закреплён за сотрудником.'
                  : 'Закрепить транспорт за сотрудником или оставить свободным.'}
              </div>
              {!employeeId ? (
                <ModeToggle
                  mode={placementMode}
                  options={[
                    { value: 'mobile', ...PLACEMENT.employee },
                    { value: 'free', label: 'Свободный' },
                  ]}
                  onChange={(v) => { setPlacementMode(v); setPlaceError(null) }}
                />
              ) : null}
              {placementMode === 'mobile' ? (
                placementEmployee ? (
                  <SelectedEmployee employee={placementEmployee} onClear={employeeId ? undefined : () => setPlacementEmployee(null)} />
                ) : (
                  <EmployeePicker error={placeError} onSelect={(emp) => { setPlacementEmployee(emp); setPlaceError(null) }} />
                )
              ) : null}
            </Card>
          ) : null}

          {!isEdit ? (
            <Card>
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>Комментарий</div>
              <div style={{ fontSize: 13, color: 'var(--color-text-placeholder)', marginBottom: 14 }}>
                Необязательный. Отобразится в истории движений в записи создания.
              </div>
              <Input multiline value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Например: получен от поставщика по накладной №…" />
            </Card>
          ) : null}
        </form>

        <FormActions
          onCancel={() => navigate(-1)}
          onSubmit={submit}
          submitting={submitting}
          submitLabel={isEdit ? 'Сохранить' : 'Создать'}
        />
      </div>
    </div>
  )
}

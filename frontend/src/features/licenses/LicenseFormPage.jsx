import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { apiPost } from '../../shared/api/client'
import { CustomFieldsEditor } from '../../shared/CustomFieldsEditor.jsx'
import { EquipmentPicker } from '../../shared/EquipmentPicker.jsx'
import { ModeToggle } from '../../shared/ModeToggle.jsx'
import { FieldValueInput, FileFieldSlot } from '../../shared/eav'
import { BackButton, Banner, Card, FormActions, Icon, Input, PlaceSelect, Select, Spinner } from '../../shared/ui'
import {
  createLicense,
  deleteLicenseFieldFilePath,
  getLicense,
  getLicenseTypes,
  updateLicense,
  uploadLicenseFieldFile,
} from './licensesApi.js'

function buildValueMap(fieldValues) {
  const map = {}
  for (const fv of fieldValues || []) {
    if (fv.value_type !== 'file') map[fv.field] = fv.value
  }
  return map
}

export function LicenseFormPage() {
  const { id } = useParams()
  const isEdit = Boolean(id)
  const navigate = useNavigate()

  const [types, setTypes] = useState(null)
  const [license, setLicense] = useState(null)
  const [typeId, setTypeId] = useState('')
  const [values, setValues] = useState({})
  const [fileValues, setFileValues] = useState({})
  const [customFields, setCustomFields] = useState([])
  const [comment, setComment] = useState('')
  const [placementMode, setPlacementMode] = useState('free') // 'free' | 'equipment'
  const [placementEquipment, setPlacementEquipment] = useState(null)
  const [storagePlaceId, setStoragePlaceId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    getLicenseTypes().then(setTypes)
  }, [])

  useEffect(() => {
    if (!isEdit) return
    getLicense(id).then((data) => {
      setLicense(data)
      setTypeId(String(data.license_type))
      setValues(buildValueMap(data.field_values))
      const fMap = {}
      for (const fv of data.field_values) if (fv.value_type === 'file') fMap[fv.field] = fv
      setFileValues(fMap)
      setCustomFields(data.custom_fields)
    })
  }, [id, isEdit])

  if (types === null || (isEdit && !license)) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
        <Spinner />
      </div>
    )
  }

  const selectedType = types.find((t) => String(t.id) === String(typeId))
  const typeFields = selectedType?.fields || []
  // B18: при редактировании тип можно сменить только на тип того же вида
  // (программный↔программный, аппаратный↔аппаратный).
  const lockedKind = isEdit ? license?.license_type_kind : null

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
      license_type: Number(typeId),
      field_values_input: typeFields.filter((f) => f.value_type !== 'file').map((f) => ({ field: f.id, value: values[f.id] ?? null })),
      custom_fields: customFields.filter((f) => f.name.trim()),
    }
    // Размещение при создании: в оборудовании или свободна (аппаратная — по
    // желанию на складе). При редактировании размещение меняется из карточки.
    if (!isEdit) {
      if (placementMode === 'equipment') {
        if (!placementEquipment) {
          setError('Выберите оборудование.')
          setSubmitting(false)
          return
        }
        payload.equipment = placementEquipment.id
      } else if (selectedType?.kind === 'hardware' && storagePlaceId) {
        payload.storage_place = Number(storagePlaceId)
      }
    }
    if (!isEdit && comment.trim()) payload.comment = comment.trim()
    try {
      if (isEdit) {
        await updateLicense(id, payload)
        // Возврат к карточке, откуда пришли в редактирование (не push новой
        // записи в историю) — тогда «Назад» с карточки ведёт в список, а не
        // снова в форму редактирования.
        navigate(-1)
      } else {
        const created = await createLicense(payload)
        // Файловые реквизиты нельзя приложить в основном payload (нужен id
        // объекта) — грузим прикреплённые на форме файлы сразу после создания.
        // Если загрузка какого-то файла упала — ведём на форму редактирования.
        const fileFields = typeFields.filter((f) => f.value_type === 'file')
        let uploadFailed = false
        for (const f of fileFields) {
          const pending = fileValues[f.id]?.pendingFiles
          if (!pending?.length) continue
          const formData = new FormData()
          for (const file of pending) formData.append('file', file)
          try {
            await apiPost(uploadLicenseFieldFile(created.id, f.id), formData)
          } catch {
            uploadFailed = true
          }
        }
        // replace — чтобы форма создания не оставалась в истории: с карточки
        // нового объекта «Назад» ведёт в список, а не обратно в форму.
        navigate(uploadFailed ? `/licenses/${created.id}/edit` : `/licenses/${created.id}`, { replace: true })
      }
    } catch (err) {
      if (err.errors) {
        setError(Object.values(err.errors).flat().join(' '))
      } else {
        setError(err.detail || 'Не удалось сохранить лицензию.')
      }
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
            <h1 className="ele-form-head__title">{isEdit ? 'Редактирование лицензии' : 'Новая лицензия'}</h1>
          </div>
        </div>

        {error ? <Banner variant="error">{error}</Banner> : null}

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: error ? 16 : 0 }}>
          <Card>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Основная информация</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Select label="Тип лицензии" required placeholder="Выберите тип" value={typeId} onChange={handleTypeChange}>
                {types
                  .filter((t) => !t.is_archived || String(t.id) === String(typeId))
                  // При редактировании — только типы того же вида.
                  .filter((t) => !lockedKind || t.kind === lockedKind)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
              </Select>
              {lockedKind ? (
                <div style={{ fontSize: 12.5, color: 'var(--color-text-placeholder)' }}>
                  Сменить тип можно только на тип того же вида ({lockedKind === 'hardware' ? 'аппаратный' : 'программный'}).
                </div>
              ) : null}
            </div>
          </Card>

          {selectedType && typeFields.some((f) => f.value_type !== 'file') ? (
            <Card>
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Параметры лицензии</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {typeFields
                  .filter((f) => f.value_type !== 'file')
                  .map((f) => (
                    <FieldValueInput key={f.id} field={f} value={values[f.id]} onChange={(v) => setValues((prev) => ({ ...prev, [f.id]: v }))} />
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
                      uploadPath={isEdit ? uploadLicenseFieldFile(id, f.id) : undefined}
                      makeDeleteFilePath={isEdit ? (fileId) => deleteLicenseFieldFilePath(id, f.id, fileId) : undefined}
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

          {!isEdit && selectedType ? (
            <Card>
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>Размещение</div>
              <div style={{ fontSize: 13, color: 'var(--color-text-placeholder)', marginBottom: 14 }}>
                {placementMode === 'equipment'
                  ? 'Лицензия будет привязана к выбранному оборудованию.'
                  : selectedType.kind === 'hardware'
                    ? 'Свободна. Физический ключ аппаратной лицензии можно положить на склад.'
                    : 'Свободна — не привязана к оборудованию.'}
              </div>
              <ModeToggle
                mode={placementMode}
                onChange={(m) => { setPlacementMode(m); setPlacementEquipment(null); setStoragePlaceId('') }}
                options={[
                  { value: 'free', label: 'Свободна' },
                  { value: 'equipment', label: 'В оборудовании' },
                ]}
              />
              {placementMode === 'equipment' ? (
                placementEquipment ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', background: 'var(--color-fill-input)', borderRadius: 10 }}>
                    <Icon name="tag" size={16} strokeWidth={2} style={{ color: 'var(--color-text-muted)', flex: 'none' }} />
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{placementEquipment.type_and_model}</span>
                      <span style={{ display: 'block', fontSize: 11.5, color: 'var(--color-text-placeholder)', fontFamily: 'var(--font-mono)' }}>{placementEquipment.inventory_number}</span>
                    </span>
                    <button type="button" onClick={() => setPlacementEquipment(null)} title="Изменить" aria-label="Изменить" style={{ width: 28, height: 28, flex: 'none', borderRadius: 8, background: 'var(--color-surface)', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'inset 0 0 0 1px var(--color-border)' }}>
                      <Icon name="x" size={15} strokeWidth={2} />
                    </button>
                  </div>
                ) : (
                  <EquipmentPicker licenseOnly onSelect={setPlacementEquipment} />
                )
              ) : selectedType.kind === 'hardware' ? (
                <PlaceSelect placeType="storage" label={null} value={storagePlaceId} onChange={setStoragePlaceId} />
              ) : null}
            </Card>
          ) : null}

          {!isEdit ? (
            <Card>
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>Комментарий</div>
              <div style={{ fontSize: 13, color: 'var(--color-text-placeholder)', marginBottom: 14 }}>
                Необязательный. Отобразится в истории движений в записи создания.
              </div>
              <Input multiline value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Например: приобретено по договору №…" />
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

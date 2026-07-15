import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { CustomFieldsEditor } from '../../shared/CustomFieldsEditor.jsx'
import { FieldValueInput, FileFieldSlot } from '../../shared/eav'
import { Banner, Button, Card, Input, Select, Spinner } from '../../shared/ui'
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
  const [name, setName] = useState('')
  const [typeId, setTypeId] = useState('')
  const [values, setValues] = useState({})
  const [fileValues, setFileValues] = useState({})
  const [customFields, setCustomFields] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    getLicenseTypes().then(setTypes)
  }, [])

  useEffect(() => {
    if (!isEdit) return
    getLicense(id).then((data) => {
      setLicense(data)
      setName(data.name)
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
      name,
      license_type: Number(typeId),
      field_values_input: typeFields.filter((f) => f.value_type !== 'file').map((f) => ({ field: f.id, value: values[f.id] ?? null })),
      custom_fields: customFields.filter((f) => f.name.trim()),
    }
    try {
      if (isEdit) {
        await updateLicense(id, payload)
        navigate(`/licenses/${id}`)
      } else {
        const created = await createLicense(payload)
        // Файловые реквизиты прикладываются только после создания — ведём на
        // форму редактирования, где слоты активны.
        const hasFileFields = typeFields.some((f) => f.value_type === 'file')
        navigate(hasFileFields ? `/licenses/${created.id}/edit` : `/licenses/${created.id}`)
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 20 }}>
          <h1 style={{ fontSize: 26, fontWeight: 600, letterSpacing: '-0.4px', minWidth: 0, overflowWrap: 'break-word' }}>{isEdit ? 'Редактирование лицензии' : 'Новая лицензия'}</h1>
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
              <Input label="Наименование" required value={name} onChange={(e) => setName(e.target.value)} />
              <Select label="Тип лицензии" required placeholder="Выберите тип" value={typeId} onChange={handleTypeChange}>
                {types
                  .filter((t) => !t.is_archived || String(t.id) === String(typeId))
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
              </Select>
              <div style={{ fontSize: 13, color: 'var(--color-text-placeholder)' }}>
                Привязать к оборудованию можно после сохранения — из карточки лицензии.
              </div>
            </div>
          </Card>

          {selectedType ? (
            <Card>
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Параметры лицензии</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {typeFields
                  .filter((f) => f.value_type !== 'file')
                  .map((f) => (
                    <FieldValueInput key={f.id} field={f} value={values[f.id]} onChange={(v) => setValues((prev) => ({ ...prev, [f.id]: v }))} />
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
        </form>
      </div>
    </div>
  )
}

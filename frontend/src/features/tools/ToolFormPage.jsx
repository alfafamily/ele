import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { CustomFieldsEditor } from '../../shared/CustomFieldsEditor.jsx'
import { Banner, Button, Card, Icon, Input, Spinner } from '../../shared/ui'
import { createTool, getTool, updateTool } from './toolsApi.js'

export function ToolFormPage() {
  const { id } = useParams()
  const isEdit = Boolean(id)
  const navigate = useNavigate()

  const [tool, setTool] = useState(null)
  const [name, setName] = useState('')
  const [initialQuantity, setInitialQuantity] = useState('0')
  const [customFields, setCustomFields] = useState([])
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!isEdit) return
    getTool(id).then((data) => {
      setTool(data)
      setName(data.name)
      setCustomFields(data.custom_fields)
    })
  }, [id, isEdit])

  if (isEdit && !tool) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
        <Spinner />
      </div>
    )
  }

  const submit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    const payload = {
      name,
      custom_fields: customFields.filter((f) => f.name.trim()),
    }
    if (!isEdit) {
      payload.quantity = Math.max(0, Number(initialQuantity) || 0)
      if (comment.trim()) payload.comment = comment.trim()
    }
    try {
      if (isEdit) {
        await updateTool(id, payload)
        navigate(-1)
      } else {
        const created = await createTool(payload)
        navigate(`/tools/${created.id}`, { replace: true })
      }
    } catch (err) {
      if (err.errors) {
        setError(Object.values(err.errors).flat().join(' '))
      } else {
        setError(err.detail || 'Не удалось сохранить инструмент.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ width: '100%', maxWidth: 660 }}>
        <div className="ele-form-head">
          <h1 className="ele-form-head__title">{isEdit ? 'Редактирование инструмента' : 'Новый инструмент'}</h1>
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
              <Input label="Наименование" required autoFocus value={name} onChange={(e) => setName(e.target.value)} />
              {!isEdit ? (
                <Input
                  label="Начальный остаток"
                  required
                  type="number"
                  min="0"
                  value={initialQuantity}
                  onChange={(e) => setInitialQuantity(e.target.value)}
                />
              ) : null}
            </div>
          </Card>

          <Card>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>Дополнительные поля</div>
            <div style={{ fontSize: 13, color: 'var(--color-text-placeholder)', marginBottom: 14 }}>
              Произвольные текстовые поля для этого инструмента.
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

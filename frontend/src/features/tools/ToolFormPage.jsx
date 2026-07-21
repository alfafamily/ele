import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { apiGet } from '../../shared/api/client'
import { CustomFieldsEditor } from '../../shared/CustomFieldsEditor.jsx'
import { EmployeePicker } from '../../shared/EmployeePicker.jsx'
import { SelectedEmployee } from '../../shared/SelectedEmployee.jsx'
import { Banner, Card, FormActions, Input, PlaceSelect, Spinner } from '../../shared/ui'
import { createTool, getTool, updateTool } from './toolsApi.js'

export function ToolFormPage() {
  const { id } = useParams()
  const isEdit = Boolean(id)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  // Создание из карточки сотрудника — часть остатка сразу выдаётся ему.
  const employeeId = searchParams.get('employee')

  const [tool, setTool] = useState(null)
  const [name, setName] = useState('')
  const [initialQuantity, setInitialQuantity] = useState('0')
  const [initialPlace, setInitialPlace] = useState('')
  const [employee, setEmployee] = useState(null) // { id, full_name, ... }
  const [employeeQty, setEmployeeQty] = useState('1')
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

  useEffect(() => {
    if (employeeId) apiGet(`/api/employees/${employeeId}/`).then(setEmployee).catch(() => {})
  }, [employeeId])

  if (isEdit && !tool) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
        <Spinner />
      </div>
    )
  }

  const qty = Math.max(0, Number(initialQuantity) || 0)

  const submit = async (e) => {
    e.preventDefault()
    setError(null)
    const payload = {
      name,
      custom_fields: customFields.filter((f) => f.name.trim()),
    }
    if (!isEdit) {
      payload.quantity = qty
      if (qty > 0) {
        if (!initialPlace) {
          setError('Укажите место хранения для начального остатка.')
          return
        }
        payload.place = Number(initialPlace)
        if (employee) {
          const eq = Number(employeeQty)
          if (!Number.isInteger(eq) || eq <= 0) {
            setError('Укажите количество для сотрудника.')
            return
          }
          if (eq > qty) {
            setError('Нельзя выдать сотруднику больше начального остатка.')
            return
          }
          payload.employee = employee.id
          payload.employee_quantity = eq
        }
      }
      if (comment.trim()) payload.comment = comment.trim()
    }
    setSubmitting(true)
    try {
      if (isEdit) {
        await updateTool(id, payload)
        navigate(-1)
      } else {
        const created = await createTool(payload)
        navigate(employeeId ? `/employees/${employeeId}` : `/tools/${created.id}`, { replace: true })
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
        </div>

        {error ? <Banner variant="error">{error}</Banner> : null}

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: error ? 16 : 0 }}>
          <Card>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Основная информация</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Input label="Наименование" required autoFocus value={name} onChange={(e) => setName(e.target.value)} />
              {!isEdit ? (
                <>
                  <Input
                    label="Начальный остаток"
                    required
                    type="number"
                    min="0"
                    value={initialQuantity}
                    onChange={(e) => setInitialQuantity(e.target.value)}
                  />
                  {qty > 0 ? (
                    <PlaceSelect placeType="storage" label="Место хранения (склад)" required value={initialPlace} onChange={setInitialPlace} />
                  ) : null}
                </>
              ) : null}
            </div>
          </Card>

          {!isEdit && qty > 0 ? (
            <Card>
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>Выдать сотруднику</div>
              <div style={{ fontSize: 13, color: 'var(--color-text-placeholder)', marginBottom: 14 }}>
                Необязательно. Часть остатка можно сразу закрепить за сотрудником — остальное останется на складе.
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {employee ? (
                  <>
                    <SelectedEmployee employee={employee} onClear={employeeId ? undefined : () => setEmployee(null)} />
                    <Input
                      label="Сколько выдать"
                      required
                      type="number"
                      min="1"
                      max={String(qty)}
                      value={employeeQty}
                      onChange={(e) => setEmployeeQty(e.target.value)}
                    />
                  </>
                ) : (
                  <EmployeePicker onSelect={setEmployee} />
                )}
              </div>
            </Card>
          ) : null}

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

import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { BackButton, Banner, Card, FormActions, Input, Spinner } from '../../shared/ui'
import { createEmployee, getDepartments, getEmployee, updateEmployee } from './employeesApi.js'

export function EmployeeFormPage() {
  const { id } = useParams()
  const isEdit = Boolean(id)
  const navigate = useNavigate()

  const [loaded, setLoaded] = useState(!isEdit)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [position, setPosition] = useState('')
  const [department, setDepartment] = useState('')
  const [departments, setDepartments] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [fieldErrors, setFieldErrors] = useState({})

  useEffect(() => {
    getDepartments().then(setDepartments)
  }, [])

  useEffect(() => {
    if (!isEdit) return
    getEmployee(id).then((data) => {
      setFirstName(data.first_name)
      setLastName(data.last_name)
      setPosition(data.position)
      setDepartment(data.department)
      setLoaded(true)
    })
  }, [id, isEdit])

  if (!loaded) {
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
    setFieldErrors({})
    const payload = { first_name: firstName, last_name: lastName, position, department }
    try {
      if (isEdit) {
        await updateEmployee(id, payload)
        // Возврат к карточке, откуда пришли в редактирование (не push новой
        // записи в историю) — тогда «Назад» с карточки ведёт в список, а не
        // снова в форму редактирования.
        navigate(-1)
      } else {
        const created = await createEmployee(payload)
        // replace — чтобы форма создания не оставалась в истории: с карточки
        // нового объекта «Назад» ведёт в список, а не обратно в форму.
        navigate(`/employees/${created.id}`, { replace: true })
      }
    } catch (err) {
      if (err.errors) {
        setFieldErrors(err.errors)
      } else {
        setError(err.detail || 'Не удалось сохранить сотрудника.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ width: '100%', maxWidth: 600 }}>
        <div className="ele-form-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            <BackButton />
            <h1 className="ele-form-head__title">{isEdit ? 'Редактирование сотрудника' : 'Новый сотрудник'}</h1>
          </div>
        </div>

        {error ? <Banner variant="error">{error}</Banner> : null}

        <form onSubmit={submit} style={{ marginTop: error ? 16 : 0 }}>
          <Card>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Input label="Фамилия" required value={lastName} onChange={(e) => setLastName(e.target.value)} error={fieldErrors.last_name} />
                <Input label="Имя" required value={firstName} onChange={(e) => setFirstName(e.target.value)} error={fieldErrors.first_name} />
              </div>
              <Input label="Должность" value={position} onChange={(e) => setPosition(e.target.value)} error={fieldErrors.position} />
              <div>
                <Input
                  label="Отдел"
                  list="department-options"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  error={fieldErrors.department}
                />
                <datalist id="department-options">
                  {departments.map((d) => (
                    <option key={d} value={d} />
                  ))}
                </datalist>
              </div>
            </div>
          </Card>
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

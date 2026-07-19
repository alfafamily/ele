import { useState } from 'react'
import { Banner, Button, Input, Modal, Select } from '../../shared/ui'

export function NewTypeModal({ onClose, onCreate, withAccounting = false }) {
  const [name, setName] = useState('')
  // Вид учёта — только для Типов оборудования. По умолчанию поэкземплярный.
  const [accountingType, setAccountingType] = useState('instance')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const submit = async () => {
    setSubmitting(true)
    setError(null)
    try {
      await onCreate(name, withAccounting ? accountingType : undefined)
    } catch (err) {
      setError(err.errors ? Object.values(err.errors).flat().join(' ') : err.detail || 'Не удалось создать тип.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open onClose={onClose} title="Новый тип">
      {error ? <Banner variant="error">{error}</Banner> : null}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Input label="Наименование" required autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        {withAccounting ? (
          <Select label="Вид учёта" value={accountingType} onChange={setAccountingType}>
            <option value="instance">Поэкземплярный</option>
            <option value="quantity">Количественный</option>
          </Select>
        ) : null}
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
        <Button variant="secondary" fullWidth onClick={onClose}>
          Отмена
        </Button>
        <Button fullWidth loading={submitting} disabled={!name.trim()} onClick={submit}>
          Создать
        </Button>
      </div>
    </Modal>
  )
}

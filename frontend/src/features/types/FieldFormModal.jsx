import { useState } from 'react'
import { VALUE_TYPE_OPTIONS } from '../../shared/eav'
import { Banner, Button, Checkbox, Input, Modal, Select } from '../../shared/ui'

// Добавление/редактирование реквизита Типа . Смена value_type
// у существующего реквизита не предусмотрена спекой — при редактировании
// поле типа значения скрыто (только имя/обязательность/доп. настройки типа).
//
// T3: перевод существующего реквизита в обязательный задним числом требует
// подтверждения с реальным счётчиком затронутых объектов (checkImpact).
export function FieldFormModal({ field, checkImpact, onClose, onSave }) {
  const isEdit = Boolean(field)
  const [name, setName] = useState(field?.name || '')
  const [valueType, setValueType] = useState(field?.value_type || 'text')
  const [isRequired, setIsRequired] = useState(field?.is_required || false)
  const [allowMultiple, setAllowMultiple] = useState(field?.allow_multiple || false)
  // Элементы списка (value_type=list) — редактируемый набор строк.
  const [options, setOptions] = useState((field?.options || []).map((o) => o.value))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [impactCount, setImpactCount] = useState(null) // null = не проверяли/не нужно

  const becameRequired = isEdit && !field.is_required && isRequired

  const buildPayload = () => {
    const payload = { name, is_required: isRequired }
    if (!isEdit) payload.value_type = valueType
    if (valueType === 'file') payload.allow_multiple = allowMultiple
    if (valueType === 'list') {
      payload.options = options
        .map((v) => (v || '').trim())
        .filter(Boolean)
        .map((value, order) => ({ value, order }))
    }
    return payload
  }

  const doSave = async () => {
    setSubmitting(true)
    setError(null)
    try {
      await onSave(buildPayload())
    } catch (err) {
      setError(err.errors ? Object.values(err.errors).flat().join(' ') : err.detail || 'Не удалось сохранить реквизит.')
      setImpactCount(null)
    } finally {
      setSubmitting(false)
    }
  }

  const submit = async () => {
    if (becameRequired && impactCount === null) {
      setSubmitting(true)
      setError(null)
      try {
        const { affected_count } = await checkImpact()
        setImpactCount(affected_count)
      } catch {
        setError('Не удалось проверить количество затронутых объектов.')
      } finally {
        setSubmitting(false)
      }
      return
    }
    doSave()
  }

  if (impactCount !== null) {
    return (
      <Modal open onClose={onClose}>
        <div style={{ width: 48, height: 48, borderRadius: 13, background: 'var(--color-warning-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--color-warning)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 9v4M12 17h.01M10.3 3.9L2 18a2 2 0 0 0 1.7 3h16.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
          </svg>
        </div>
        <div style={{ fontSize: 19, fontWeight: 600, marginBottom: 8 }}>Сделать реквизит обязательным?</div>
        <p style={{ fontSize: 14, color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
          {impactCount > 0 ? (
            <>
              По этому Типу уже есть <b style={{ color: 'var(--color-text-primary)' }}>{impactCount} {impactCount === 1 ? 'объект' : 'объектов'}</b> без
              значения «{name}». Обязательность будет применена при следующем редактировании таких объектов (кроме списания/утилизации).
            </>
          ) : (
            'У всех существующих объектов этого Типа значение уже заполнено.'
          )}
        </p>
        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <Button variant="secondary" fullWidth onClick={onClose}>
            Отмена
          </Button>
          <Button fullWidth loading={submitting} onClick={doSave}>
            Сделать обязательным
          </Button>
        </div>
      </Modal>
    )
  }

  return (
    <Modal open onClose={onClose} title={isEdit ? 'Редактировать реквизит' : 'Новый реквизит'}>
      {error ? <Banner variant="error">{error}</Banner> : null}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Input label="Наименование" required value={name} onChange={(e) => setName(e.target.value)} />
        {!isEdit ? (
          <Select label="Тип значения" value={valueType} onChange={setValueType}>
            {VALUE_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        ) : null}

        {valueType === 'file' ? (
          <Checkbox label="Несколько файлов" checked={allowMultiple} onChange={setAllowMultiple} />
        ) : null}

        {valueType === 'list' ? (
          <div>
            <div style={{ fontSize: 12, color: 'var(--color-text-placeholder)', marginBottom: 8 }}>Элементы списка</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {options.map((opt, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Input
                      value={opt}
                      placeholder={`Элемент ${i + 1}`}
                      onChange={(e) => setOptions((prev) => prev.map((v, j) => (j === i ? e.target.value : v)))}
                    />
                  </div>
                  <button
                    type="button"
                    title="Удалить элемент"
                    aria-label="Удалить элемент"
                    onClick={() => setOptions((prev) => prev.filter((_, j) => j !== i))}
                    style={{ flex: 'none', width: 34, height: 34, borderRadius: 8, background: 'var(--color-fill-input)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
            <Button variant="secondary" fullWidth style={{ marginTop: 8 }} onClick={() => setOptions((prev) => [...prev, ''])}>
              + Добавить элемент
            </Button>
          </div>
        ) : null}

        <Checkbox label="Обязательное поле" checked={isRequired} onChange={setIsRequired} />
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
        <Button variant="secondary" fullWidth onClick={onClose}>
          Отмена
        </Button>
        <Button fullWidth loading={submitting} disabled={!name.trim()} onClick={submit}>
          Сохранить
        </Button>
      </div>
    </Modal>
  )
}

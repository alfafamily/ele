import { Input, Select } from '../ui'

// Поле формы для одного реквизита Типа (field_values_input,/).
// Файловые реквизиты сюда не входят — грузятся отдельным action-эндпоинтом
// после того, как объект уже существует (см. FileFieldSlot).
export function FieldValueInput({ field, value, onChange, error }) {
  if (field.value_type === 'bool') {
    // Явный выбор Да/Нет, не галочка: обязательный булев реквизит нельзя
    // удовлетворить «Ложью» галочкой (не отличить от «не заполнено»).
    return (
      <Select
        label={field.name}
        required={field.is_required}
        placeholder="Не выбрано"
        value={value === true ? 'true' : value === false ? 'false' : ''}
        onChange={(v) => onChange(v === '' ? null : v === 'true')}
        error={error}
      >
        <option value="true">Да</option>
        <option value="false">Нет</option>
      </Select>
    )
  }
  if (field.value_type === 'list') {
    return (
      <Select
        label={field.name}
        required={field.is_required}
        placeholder="Не выбрано"
        value={value ?? ''}
        onChange={(v) => onChange(v === '' ? null : v)}
        error={error}
      >
        {(field.options || []).map((o) => (
          <option key={o.id} value={o.value}>
            {o.value}
          </option>
        ))}
      </Select>
    )
  }
  if (field.value_type === 'int') {
    return (
      <Input
        label={field.name}
        required={field.is_required}
        type="number"
        step="1"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? null : parseInt(e.target.value, 10))}
        error={error}
      />
    )
  }
  if (field.value_type === 'float') {
    return (
      <Input
        label={field.name}
        required={field.is_required}
        type="number"
        step="any"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? null : parseFloat(e.target.value))}
        error={error}
      />
    )
  }
  return (
    <Input
      label={field.name}
      required={field.is_required}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      error={error}
    />
  )
}

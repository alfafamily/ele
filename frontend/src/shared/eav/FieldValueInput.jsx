import { Checkbox, Input } from '../ui'

// Поле формы для одного реквизита Типа (field_values_input,/).
// Файловые реквизиты сюда не входят — грузятся отдельным action-эндпоинтом
// после того, как объект уже существует (см. FileFieldSlot).
export function FieldValueInput({ field, value, onChange, error }) {
  if (field.value_type === 'bool') {
    return <Checkbox label={field.name + (field.is_required ? ' *' : '')} checked={!!value} onChange={onChange} />
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

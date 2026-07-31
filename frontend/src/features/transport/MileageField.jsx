import { useEffect, useState } from 'react'
import { Input } from '../../shared/ui'
import { mileageUnitLabel } from './transportApi.js'

function formatNumber(value) {
  if (value == null) return '—'
  const s = String(value)
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s
}

// B22. Доп. поле проведения ТО транспорта: текущий пробег/моточасы
// (необязательно; фиксируется в истории, на расчёт регламентов не влияет).
// Если указан, должен быть строго больше последнего зафиксированного (одометр
// только растёт). Сообщает наверх { valid, payload } через onChange.
export function MileageField({ entity, onChange }) {
  const [mileage, setMileage] = useState('')

  const unitLabel = mileageUnitLabel(entity.type_mileage_unit)
  const lastMileage = entity?.last_mileage ? Number(entity.last_mileage.value) : null
  const mileageNum = mileage.trim() === '' ? null : Number(mileage)
  const mileageOk = mileageNum == null || lastMileage == null || mileageNum > lastMileage

  useEffect(() => {
    onChange({ valid: mileageOk, payload: { mileage: mileage.trim() || undefined } })
  }, [mileage, mileageOk, onChange])

  return (
    <div style={{ maxWidth: 320, marginTop: 24 }}>
      <Input
        label={`Текущий пробег, ${unitLabel} (необязательно)`}
        type="number"
        min={lastMileage != null ? String(lastMileage) : '0'}
        step="any"
        value={mileage}
        onChange={(e) => setMileage(e.target.value)}
        placeholder={entity.type_mileage_unit === 'motohours' ? 'Например: 1250' : 'Например: 45000'}
      />
      {!mileageOk ? (
        <div style={{ fontSize: 12, color: 'var(--color-error)', marginTop: 6 }}>
          Пробег должен быть больше последнего зафиксированного ({formatNumber(lastMileage)} {unitLabel}).
        </div>
      ) : lastMileage != null ? (
        <div style={{ fontSize: 12, color: 'var(--color-text-placeholder)', marginTop: 6 }}>
          Последний зафиксированный: {formatNumber(lastMileage)} {unitLabel}.
        </div>
      ) : null}
    </div>
  )
}

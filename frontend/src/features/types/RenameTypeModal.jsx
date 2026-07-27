import { useState } from 'react'
import { Banner, Button, Input, Modal } from '../../shared/ui'

// Редактирование Типа. Для лицензий меняется только наименование
// (заголовок «Переименовать тип»). Для оборудования дополнительно
// переключаются флаги «Установка SIM/E-SIM» (B17) и «Проведение ТО» (B13) —
// заголовок «Редактирование типа оборудования». Реквизиты и привязанные
// объекты не затрагиваются.
export function RenameTypeModal({ type, domain, onClose, onSave }) {
  const isEquipment = domain === 'equipment'
  const isTransport = domain === 'transport'
  const [name, setName] = useState(type.name)
  const [allowsSim, setAllowsSim] = useState(!!type.allows_sim)
  const [allowsLicense, setAllowsLicense] = useState(!!type.allows_license)
  const [maintenanceEnabled, setMaintenanceEnabled] = useState(!!type.maintenance_enabled)
  const [mileageUnit, setMileageUnit] = useState(type.mileage_unit || 'km')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const trimmed = name.trim()
  const dirty =
    trimmed !== type.name ||
    (isEquipment &&
      (allowsSim !== !!type.allows_sim ||
        allowsLicense !== !!type.allows_license ||
        maintenanceEnabled !== !!type.maintenance_enabled)) ||
    (isTransport && mileageUnit !== (type.mileage_unit || 'km'))

  const submit = async () => {
    setSubmitting(true)
    setError(null)
    try {
      const payload = { name: trimmed }
      if (isEquipment) {
        payload.allows_sim = allowsSim
        payload.allows_license = allowsLicense
        payload.maintenance_enabled = maintenanceEnabled
      }
      if (isTransport) {
        payload.mileage_unit = mileageUnit
      }
      await onSave(payload)
    } catch (err) {
      setError(err.errors ? Object.values(err.errors).flat().join(' ') : err.detail || 'Не удалось сохранить тип.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={isEquipment || isTransport ? `Редактирование типа ${isTransport ? 'транспорта' : 'оборудования'}` : 'Переименовать тип'}>
      {error ? <Banner variant="error">{error}</Banner> : null}
      <Input label="Наименование" required autoFocus value={name} onChange={(e) => setName(e.target.value)} />

      {isTransport ? (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Учёт пробега</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {[
              { value: 'km', label: 'По километрам' },
              { value: 'motohours', label: 'По моточасам' },
            ].map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => setMileageUnit(o.value)}
                style={{
                  flex: 1, padding: '9px 6px', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
                  borderRadius: 8, border: 'none',
                  color: mileageUnit === o.value ? 'var(--color-primary-text)' : 'var(--color-text-secondary)',
                  background: mileageUnit === o.value ? 'var(--color-primary)' : 'var(--color-fill-input)',
                }}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {isEquipment ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
            <input type="checkbox" checked={allowsSim} onChange={(e) => setAllowsSim(e.target.checked)} style={{ marginTop: 2, flex: 'none' }} />
            <span style={{ minWidth: 0 }}>
              <span style={{ fontSize: 14, fontWeight: 500 }}>В оборудование можно устанавливать SIM/E-SIM</span>
              <span style={{ display: 'block', fontSize: 11.5, color: 'var(--color-text-placeholder)', marginTop: 2 }}>
                Разрешает установку SIM/E-SIM в оборудование этого типа.
              </span>
            </span>
          </label>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
            <input type="checkbox" checked={allowsLicense} onChange={(e) => setAllowsLicense(e.target.checked)} style={{ marginTop: 2, flex: 'none' }} />
            <span style={{ minWidth: 0 }}>
              <span style={{ fontSize: 14, fontWeight: 500 }}>К оборудованию можно привязывать лицензии</span>
              <span style={{ display: 'block', fontSize: 11.5, color: 'var(--color-text-placeholder)', marginTop: 2 }}>
                Разрешает привязку лицензий к оборудованию этого типа (блок «Установленные лицензии»).
              </span>
            </span>
          </label>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
            <input type="checkbox" checked={maintenanceEnabled} onChange={(e) => setMaintenanceEnabled(e.target.checked)} style={{ marginTop: 2, flex: 'none' }} />
            <span style={{ minWidth: 0 }}>
              <span style={{ fontSize: 14, fontWeight: 500 }}>Для оборудования можно проводить ТО</span>
              <span style={{ display: 'block', fontSize: 11.5, color: 'var(--color-text-placeholder)', marginTop: 2 }}>
                Включает учёт техобслуживания: кнопку «Провести ТО», статусы и индикаторы в списке.
              </span>
            </span>
          </label>
        </div>
      ) : null}

      <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
        <Button variant="secondary" fullWidth onClick={onClose}>
          Отмена
        </Button>
        <Button fullWidth loading={submitting} disabled={!trimmed || !dirty} onClick={submit}>
          Сохранить
        </Button>
      </div>
    </Modal>
  )
}

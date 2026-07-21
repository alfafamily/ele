import { useState } from 'react'
import { Banner, Button, Input, Modal } from '../../shared/ui'

// Редактирование Типа. Для лицензий меняется только наименование
// (заголовок «Переименовать тип»). Для оборудования дополнительно
// переключаются флаги «Установка SIM/E-SIM» (B17) и «Проведение ТО» (B13) —
// заголовок «Редактирование типа оборудования». Реквизиты и привязанные
// объекты не затрагиваются.
export function RenameTypeModal({ type, domain, onClose, onSave }) {
  const isEquipment = domain === 'equipment'
  const [name, setName] = useState(type.name)
  const [allowsSim, setAllowsSim] = useState(!!type.allows_sim)
  const [maintenanceEnabled, setMaintenanceEnabled] = useState(!!type.maintenance_enabled)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const trimmed = name.trim()
  const dirty =
    trimmed !== type.name ||
    (isEquipment && (allowsSim !== !!type.allows_sim || maintenanceEnabled !== !!type.maintenance_enabled))

  const submit = async () => {
    setSubmitting(true)
    setError(null)
    try {
      const payload = { name: trimmed }
      if (isEquipment) {
        payload.allows_sim = allowsSim
        payload.maintenance_enabled = maintenanceEnabled
      }
      await onSave(payload)
    } catch (err) {
      setError(err.errors ? Object.values(err.errors).flat().join(' ') : err.detail || 'Не удалось сохранить тип.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={isEquipment ? 'Редактирование типа оборудования' : 'Переименовать тип'}>
      {error ? <Banner variant="error">{error}</Banner> : null}
      <Input label="Наименование" required autoFocus value={name} onChange={(e) => setName(e.target.value)} />

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

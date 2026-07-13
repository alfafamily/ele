import { useState } from 'react'
import { Banner, Button, Modal } from '../../shared/ui'
import { writeOffEquipment } from './equipmentApi.js'

// D3 — списание (§5.1): блокируется при непогашенных лицензиях, система
// предлагает «Отвязать и списать» вместо жёсткого отказа.
export function WriteOffModal({ equipment, onClose, onDone }) {
  const [conflictLicenses, setConflictLicenses] = useState(null) // null=ещё не проверяли, []=нет конфликта
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const attempt = async (detach) => {
    setSubmitting(true)
    setError(null)
    try {
      const updated = await writeOffEquipment(equipment.id, detach)
      onDone(updated)
    } catch (err) {
      if (err.status === 409 && err.data.licenses) {
        setConflictLicenses(err.data.licenses)
      } else {
        setError(err.detail || 'Не удалось списать оборудование.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open onClose={onClose} title="Списать оборудование?">
      {error ? <Banner variant="error">{error}</Banner> : null}
      {conflictLicenses && conflictLicenses.length > 0 ? (
        <>
          <p style={{ fontSize: 14, color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
            К объекту <b style={{ color: 'var(--color-text-primary)' }}>{equipment.type_and_model}</b> привязаны{' '}
            <b style={{ color: 'var(--color-text-primary)' }}>{conflictLicenses.length} непогашенные лицензии</b> —
            списание невозможно, пока они привязаны.
          </p>
          <div style={{ background: 'var(--color-fill-input)', borderRadius: 10, padding: '10px 14px', margin: '14px 0', fontSize: 13.5 }}>
            {conflictLicenses.map((lic) => (
              <div key={lic.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                <span>{lic.name}</span>
                <span style={{ color: 'var(--color-text-placeholder)' }}>{lic.license_type_name}</span>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 18 }}>
            Отвязать все лицензии и продолжить списание? Лицензии станут «свободными».
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Button fullWidth loading={submitting} onClick={() => attempt(true)}>
              Отвязать и списать
            </Button>
            <Button variant="secondary" fullWidth onClick={onClose}>
              Отмена
            </Button>
          </div>
        </>
      ) : (
        <>
          <p style={{ fontSize: 14, color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
            Объект <b style={{ color: 'var(--color-text-primary)' }}>{equipment.type_and_model}</b> будет перемещён в
            архив. Восстановление из архива через интерфейс не предусмотрено.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 18 }}>
            <Button variant="danger-solid" fullWidth loading={submitting} onClick={() => attempt(false)}>
              Списать
            </Button>
            <Button variant="secondary" fullWidth onClick={onClose}>
              Отмена
            </Button>
          </div>
        </>
      )}
    </Modal>
  )
}

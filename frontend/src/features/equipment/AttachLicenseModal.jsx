import { Link } from 'react-router-dom'
import { apiPatch } from '../../shared/api/client'
import { AttachSelectModal } from '../../shared/AttachSelectModal.jsx'
import { Button, Icon } from '../../shared/ui'
import { InlineMaskedKey } from '../licenses/MaskedKeyField.jsx'

const KIND_LABEL = { software: 'Программная', hardware: 'Аппаратная' }

// D4 — привязка лицензии к оборудованию. При заявленном масштабе дешевле один
// раз забрать все свободные лицензии и искать на клиенте (по Наименованию и
// Номеру/ключу), чем заводить отдельный search-эндпоинт ради этой модалки.
// include_key=1 — раздел доступен только Admin/Accountant, «Номер/ключ» на
// фронте всё равно маскируется за «глазиком».
export function AttachLicenseModal({ equipment, onClose, onAttached }) {
  return (
    <AttachSelectModal
      title="Привязать лицензию"
      subtitle={equipment.type_and_model}
      fetchPath="/api/licenses/?status=free&tab=active&include_key=1"
      match={(lic, q) =>
        (lic.license_type_name || '').toLowerCase().includes(q) || (lic.key || '').toLowerCase().includes(q)
      }
      renderRow={(lic) => (
        <>
          <div style={{ fontSize: 13.5, fontWeight: 600 }}>{lic.license_type_name}</div>
          <div style={{ fontSize: 11.5, color: 'var(--color-text-placeholder)' }}>{[KIND_LABEL[lic.license_type_kind], 'свободна'].filter(Boolean).join(' · ')}</div>
          {lic.key ? <div style={{ marginTop: 4 }}><InlineMaskedKey value={lic.key} /></div> : null}
        </>
      )}
      attach={(licenseId) => apiPatch(`/api/licenses/${licenseId}/`, { equipment: equipment.id })}
      onAttached={onAttached}
      onClose={onClose}
      empty={{
        title: 'Нет свободных лицензий',
        description: 'Все лицензии уже привязаны к оборудованию. Добавьте новую лицензию в разделе «Лицензии».',
        action: (
          <Link to="/licenses/new">
            <Button><Icon name="plus" size={18} strokeWidth={2.2} />Создать лицензию</Button>
          </Link>
        ),
      }}
      submitLabel="Привязать"
    />
  )
}

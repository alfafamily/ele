import { AttachSelectModal } from '../../shared/AttachSelectModal.jsx'
import { Button, Icon } from '../../shared/ui'
import { attachPassToTransport } from '../employees/employeesApi.js'

// B34. Закрепление транспортного пропуска за единицей транспорта — множественный
// выбор свободных транспортных пропусков либо создание нового (форма открывается
// с предзаполненным транспортом). За транспортом может числиться несколько пропусков.
export function TransportPassAttachModal({ transportId, onClose, onAttached, onCreateNew }) {
  return (
    <AttachSelectModal
      title="Закрепить пропуск"
      fetchPath="/api/access-passes/?tab=deactivated&pass_kind=transport"
      match={(o, q) =>
        [o.account_number, ...(o.buildings || []).map((b) => b.name)].some((v) => (v || '').toLowerCase().includes(q))
      }
      renderRow={(item) => {
        const buildings = (item.buildings || []).map((b) => b.name).join(', ')
        return (
          <>
            <div style={{ fontSize: 13.5, fontWeight: 600 }}>Пропуск</div>
            <div style={{ fontSize: 11.5, color: 'var(--color-text-placeholder)', marginTop: 2 }}>
              № {item.account_number && item.account_number.trim() ? item.account_number : 'б/н'}
              {buildings ? ` · ${buildings}` : ''}
            </div>
          </>
        )
      }}
      attach={(id) => attachPassToTransport(id, transportId)}
      onAttached={onAttached}
      onClose={onClose}
      empty={{
        title: 'Нет свободных транспортных пропусков',
        description: 'Все транспортные пропуска закреплены за транспортом. Создайте новый.',
        action: <Button variant="secondary" onClick={onCreateNew}><Icon name="plus" size={18} strokeWidth={2.2} />Создать пропуск</Button>,
      }}
      submitLabel="Закрепить"
      footerExtra={
        <Button variant="secondary" fullWidth style={{ marginTop: 10 }} onClick={onCreateNew}>
          <Icon name="plus" size={18} strokeWidth={2.2} />Создать пропуск
        </Button>
      }
    />
  )
}

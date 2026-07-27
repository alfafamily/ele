import { useEffect, useState } from 'react'
import { fetchAllPages } from '../../shared/api/fetchAll'
import { Button, EmptyState, Icon, Modal } from '../../shared/ui'
import { attachPassToTransport } from '../employees/employeesApi.js'

// B34. Закрепление транспортного пропуска за единицей транспорта — по образцу
// AttachOrCreateModal сотрудника: множественный выбор свободных транспортных
// пропусков либо создание нового (форма открывается с предзаполненным
// транспортом). За транспортом может числиться несколько пропусков.
export function TransportPassAttachModal({ transportId, onClose, onAttached, onCreateNew }) {
  const [all, setAll] = useState(null)
  const [query, setQuery] = useState('')
  const [selectedIds, setSelectedIds] = useState([])
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    fetchAllPages('/api/access-passes/?tab=deactivated&pass_kind=transport').then(setAll)
  }, [])

  const q = query.trim().toLowerCase()
  const filtered = (all || []).filter((o) =>
    [o.account_number, ...(o.buildings || []).map((b) => b.name)].some((v) => (v || '').toLowerCase().includes(q))
  )

  const toggle = (id) =>
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

  const attach = async () => {
    setSubmitting(true)
    try {
      for (const id of selectedIds) {
        await attachPassToTransport(id, transportId)
      }
      onAttached()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open onClose={onClose} title="Закрепить пропуск">
      {all === null ? (
        <div style={{ padding: 20, textAlign: 'center', color: 'var(--color-text-placeholder)' }}>Загрузка…</div>
      ) : all.length === 0 ? (
        <EmptyState
          title="Нет свободных транспортных пропусков"
          description="Все транспортные пропуска закреплены за транспортом. Создайте новый."
          action={<Button variant="secondary" onClick={onCreateNew}><Icon name="plus" size={18} strokeWidth={2.2} />Создать пропуск</Button>}
        />
      ) : (
        <>
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск"
            style={{ width: '100%', height: 42, boxShadow: 'inset 0 0 0 1px var(--color-border)', borderRadius: 10, border: 'none', padding: '0 13px', fontSize: 13.5, fontFamily: 'inherit', marginBottom: 12 }}
          />
          {filtered.length === 0 ? (
            <div style={{ padding: 14, fontSize: 13, textAlign: 'center', color: 'var(--color-text-placeholder)', marginBottom: 16 }}>Ничего не найдено</div>
          ) : (
            <div style={{ border: '1px solid var(--color-border)', borderRadius: 12, overflow: 'hidden', maxHeight: 216, overflowY: 'auto', marginBottom: 16 }}>
              {filtered.map((item, i) => {
                const checked = selectedIds.includes(item.id)
                const buildings = (item.buildings || []).map((b) => b.name).join(', ')
                return (
                  <div
                    key={item.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => toggle(item.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        toggle(item.id)
                      }
                    }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 11, width: '100%', padding: '11px 13px',
                      borderTop: i === 0 ? 'none' : '1px solid var(--color-border-hairline)',
                      background: checked ? 'var(--color-info-bg)' : 'transparent',
                      cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                    }}
                  >
                    <span
                      style={{
                        width: 20, height: 20, flex: 'none', borderRadius: 6,
                        background: checked ? 'var(--color-primary)' : 'transparent',
                        boxShadow: checked ? 'none' : 'inset 0 0 0 1.5px var(--color-border-strong)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      {checked ? <Icon name="check" size={12} strokeWidth={3} style={{ color: '#fff' }} /> : null}
                    </span>
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600 }}>Пропуск</div>
                      <div style={{ fontSize: 11.5, color: 'var(--color-text-placeholder)', marginTop: 2 }}>
                        № {item.account_number && item.account_number.trim() ? item.account_number : 'б/н'}
                        {buildings ? ` · ${buildings}` : ''}
                      </div>
                    </span>
                  </div>
                )
              })}
            </div>
          )}
          <div style={{ display: 'flex', gap: 10 }}>
            <Button variant="secondary" fullWidth onClick={onClose}>Отмена</Button>
            <Button fullWidth disabled={selectedIds.length === 0} loading={submitting} onClick={attach}>
              Закрепить{selectedIds.length > 1 ? ` (${selectedIds.length})` : ''}
            </Button>
          </div>
          <Button variant="secondary" fullWidth style={{ marginTop: 10 }} onClick={onCreateNew}><Icon name="plus" size={18} strokeWidth={2.2} />Создать пропуск</Button>
        </>
      )}
    </Modal>
  )
}

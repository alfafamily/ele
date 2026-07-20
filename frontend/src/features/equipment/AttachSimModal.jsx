import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchAllPages } from '../../shared/api/fetchAll'
import { Button, EmptyState, Icon, Modal } from '../../shared/ui'
import { attachSimToEquipment } from '../employees/employeesApi.js'

// Установка SIM-карт в оборудование (симка в модеме и т.п.). Показываем свободные
// SIM (не за сотрудником и не в оборудовании, не утилизированные) для
// множественного выбора — по образцу привязки лицензий.
export function AttachSimModal({ equipment, onClose, onAttached }) {
  const [all, setAll] = useState(null)
  const [query, setQuery] = useState('')
  const [selectedIds, setSelectedIds] = useState([])
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    fetchAllPages('/api/sim-cards/?tab=deactivated').then(setAll)
  }, [])

  const q = query.trim().toLowerCase()
  const filtered = (all || []).filter((s) =>
    [s.phone_number, s.network_operator, s.provider].some((v) => (v || '').toLowerCase().includes(q)),
  )

  const toggle = (id) =>
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

  const attach = async () => {
    setSubmitting(true)
    try {
      for (const simId of selectedIds) {
        await attachSimToEquipment(simId, equipment.id)
      }
      onAttached()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open onClose={onClose} title="Установить SIM-карту">
      <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 14 }}>{equipment.type_and_model}</div>

      {all === null ? (
        <div style={{ padding: 20, textAlign: 'center', color: 'var(--color-text-placeholder)' }}>Загрузка…</div>
      ) : all.length === 0 ? (
        <EmptyState
          title="Нет свободных SIM-карт"
          description="Все SIM-карты закреплены за сотрудниками или оборудованием. Добавьте новую в разделе «Корпоративная связь»."
          action={
            <Link to="/sim-cards/new">
              <Button><Icon name="plus" size={18} strokeWidth={2.2} />Создать SIM-карту</Button>
            </Link>
          }
        />
      ) : (
        <>
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск"
            style={{
              width: '100%',
              height: 42,
              boxShadow: 'inset 0 0 0 1px var(--color-border)',
              borderRadius: 10,
              border: 'none',
              padding: '0 13px',
              fontSize: 13.5,
              fontFamily: 'inherit',
              marginBottom: 12,
            }}
          />
          {filtered.length === 0 ? (
            <div style={{ padding: 14, fontSize: 13, textAlign: 'center', color: 'var(--color-text-placeholder)', marginBottom: 16 }}>Ничего не найдено</div>
          ) : (
            <div style={{ border: '1px solid var(--color-border)', borderRadius: 12, overflow: 'hidden', maxHeight: 216, overflowY: 'auto', marginBottom: 16 }}>
              {filtered.map((sim, i) => {
                const checked = selectedIds.includes(sim.id)
                const details = [sim.network_operator, sim.provider].filter(Boolean).join(' / ') || 'без поставщика и оператора'
                return (
                  <div
                    key={sim.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => toggle(sim.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        toggle(sim.id)
                      }
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 11,
                      width: '100%',
                      padding: '11px 13px',
                      borderTop: i === 0 ? 'none' : '1px solid var(--color-border-hairline)',
                      background: checked ? 'var(--color-info-bg)' : 'transparent',
                      cursor: 'pointer',
                      textAlign: 'left',
                      fontFamily: 'inherit',
                    }}
                  >
                    <span
                      style={{
                        width: 20,
                        height: 20,
                        flex: 'none',
                        borderRadius: 6,
                        background: checked ? 'var(--color-primary)' : 'transparent',
                        boxShadow: checked ? 'none' : 'inset 0 0 0 1.5px var(--color-border-strong)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {checked ? <Icon name="check" size={12} strokeWidth={3} style={{ color: '#fff' }} /> : null}
                    </span>
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span style={{ font: '600 13.5px var(--font-mono)', display: 'block' }}>{sim.phone_number}</span>
                      <div style={{ fontSize: 11.5, color: 'var(--color-text-placeholder)' }}>{`${sim.sim_type_display} · ${details}`}</div>
                    </span>
                  </div>
                )
              })}
            </div>
          )}
          <div style={{ display: 'flex', gap: 10 }}>
            <Button variant="secondary" fullWidth onClick={onClose}>
              Отмена
            </Button>
            <Button fullWidth disabled={selectedIds.length === 0} loading={submitting} onClick={attach}>
              Установить{selectedIds.length > 1 ? ` (${selectedIds.length})` : ''}
            </Button>
          </div>
        </>
      )}
    </Modal>
  )
}

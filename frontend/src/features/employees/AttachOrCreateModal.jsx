import { useEffect, useState } from 'react'
import { fetchAllPages } from '../../shared/api/fetchAll'
import { Button, EmptyState, Icon, Modal } from '../../shared/ui'
import { attachPass, attachSimCard } from './employeesApi.js'

// Привязка к сотруднику переиспользуемого объекта (SIM/пропуск): показываем
// свободные (деактивированные) объекты для выбора, либо предлагаем создать
// новый — сразу привязанным. Аналог AttachLicenseModal, но привязка одиночная.
const CONFIG = {
  sim: {
    title: 'Привязать SIM-карту',
    path: '/api/sim-cards/?tab=deactivated',
    placeholder: 'Поиск по номеру, оператору или поставщику',
    empty: 'Нет свободных SIM-карт',
    emptyHint: 'Все SIM-карты закреплены за сотрудниками. Создайте новую.',
    createLabel: '+ Создать SIM-карту',
    attach: attachSimCard,
    match: (o, q) =>
      [o.phone_number, o.network_operator, o.provider].some((v) => (v || '').toLowerCase().includes(q)),
  },
  pass: {
    title: 'Привязать пропуск',
    path: '/api/access-passes/?tab=deactivated',
    placeholder: 'Поиск по названию или учётному номеру',
    empty: 'Нет свободных пропусков',
    emptyHint: 'Все пропуска закреплены за сотрудниками. Создайте новый.',
    createLabel: '+ Создать пропуск',
    attach: attachPass,
    match: (o, q) => [o.name, o.account_number].some((v) => (v || '').toLowerCase().includes(q)),
  },
}

function SimRow({ item }) {
  return (
    <span style={{ minWidth: 0, flex: 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <span style={{ fontSize: 10.5, fontWeight: 700, color: '#fff', background: 'var(--color-text-primary)', padding: '1px 6px', borderRadius: 5 }}>{item.sim_type_display}</span>
        <span style={{ font: '600 13.5px var(--font-mono)' }}>{item.phone_number}</span>
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--color-text-placeholder)', marginTop: 2 }}>
        {[item.network_operator, item.provider].filter(Boolean).join(' / ') || 'без оператора'}
      </div>
    </span>
  )
}

function PassRow({ item }) {
  const types = [item.type_vehicle && 'Авто', item.type_pedestrian && 'Пеший'].filter(Boolean).join(', ')
  return (
    <span style={{ minWidth: 0, flex: 1 }}>
      <div style={{ fontSize: 13.5, fontWeight: 600 }}>{item.name || 'Без названия'}</div>
      <div style={{ fontSize: 11.5, color: 'var(--color-text-placeholder)', marginTop: 2 }}>
        № {item.account_number && item.account_number.trim() ? item.account_number : 'б/н'}{types ? ` · ${types}` : ''}
      </div>
    </span>
  )
}

export function AttachOrCreateModal({ kind, employeeId, onClose, onAttached, onCreateNew }) {
  const cfg = CONFIG[kind]
  const [all, setAll] = useState(null)
  const [query, setQuery] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    fetchAllPages(cfg.path).then(setAll)
  }, [cfg.path])

  const q = query.trim().toLowerCase()
  const filtered = (all || []).filter((o) => cfg.match(o, q))

  const attach = async (id) => {
    setSubmitting(true)
    try {
      await cfg.attach(id, employeeId)
      onAttached()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={cfg.title}>
      {all === null ? (
        <div style={{ padding: 20, textAlign: 'center', color: 'var(--color-text-placeholder)' }}>Загрузка…</div>
      ) : all.length === 0 ? (
        <EmptyState
          title={cfg.empty}
          description={cfg.emptyHint}
          action={<Button onClick={onCreateNew}>{cfg.createLabel}</Button>}
        />
      ) : (
        <>
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={cfg.placeholder}
            style={{ width: '100%', height: 42, boxShadow: 'inset 0 0 0 1px var(--color-border)', borderRadius: 10, border: 'none', padding: '0 13px', fontSize: 13.5, fontFamily: 'inherit', marginBottom: 12 }}
          />
          {filtered.length === 0 ? (
            <div style={{ padding: 14, fontSize: 13, textAlign: 'center', color: 'var(--color-text-placeholder)', marginBottom: 16 }}>Ничего не найдено</div>
          ) : (
            <div style={{ border: '1px solid var(--color-border)', borderRadius: 12, overflow: 'hidden', maxHeight: 300, overflowY: 'auto', marginBottom: 16 }}>
              {filtered.map((item, i) => (
                <button
                  key={item.id}
                  type="button"
                  disabled={submitting}
                  onClick={() => attach(item.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 11, width: '100%', padding: '11px 13px', borderTop: i === 0 ? 'none' : '1px solid var(--color-border-hairline)', background: 'transparent', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}
                >
                  {kind === 'sim' ? <SimRow item={item} /> : <PassRow item={item} />}
                  <Icon name="chevron-right" size={16} strokeWidth={2} style={{ color: 'var(--color-border-strong)', flex: 'none' }} />
                </button>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 10 }}>
            <Button variant="secondary" fullWidth onClick={onCreateNew}>{cfg.createLabel}</Button>
            <Button variant="secondary" fullWidth onClick={onClose}>Отмена</Button>
          </div>
        </>
      )}
    </Modal>
  )
}

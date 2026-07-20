import { useEffect, useState } from 'react'
import { fetchAllPages } from '../../shared/api/fetchAll'
import { Button, EmptyState, Icon, Modal } from '../../shared/ui'
import { KeyTarget } from '../../shared/keyTarget.jsx'
import { assignEquipment } from '../equipment/equipmentApi.js'
import { attachPass, attachSimCard } from './employeesApi.js'

// Привязка к сотруднику переиспользуемых объектов (SIM/пропуск): показываем
// свободные (деактивированные) объекты для множественного выбора (за одним
// сотрудником может быть несколько SIM/пропусков) либо предлагаем создать
// новый. По образцу AttachLicenseModal (чекбоксы, подсветка выбранного).
const CONFIG = {
  sim: {
    title: 'Привязать SIM-карту',
    path: '/api/sim-cards/?tab=deactivated',
    placeholder: 'Поиск',
    empty: 'Нет свободных SIM-карт',
    emptyHint: 'Все SIM-карты закреплены за сотрудниками. Создайте новую.',
    createLabel: 'Создать SIM-карту',
    attach: attachSimCard,
    match: (o, q) =>
      [o.phone_number, o.network_operator, o.provider].some((v) => (v || '').toLowerCase().includes(q)),
  },
  pass: {
    title: 'Привязать средство доступа',
    path: '/api/access-passes/?tab=deactivated',
    placeholder: 'Поиск',
    empty: 'Нет свободных средств доступа',
    emptyHint: 'Все пропуска и ключи закреплены за сотрудниками. Создайте новое.',
    createLabel: 'Создать средство доступа',
    attach: attachPass,
    // Поиск по типу (Ключ/Пропуск, Авто/Пеший), учётному номеру и названиям
    // зданий/помещений/мест объекта доступа.
    match: (o, q) =>
      [
        o.object_type === 'key' ? 'ключ' : 'пропуск',
        o.type_vehicle && 'авто',
        o.type_pedestrian && 'пеший',
        o.account_number,
        ...(o.buildings || []).map((b) => b.name),
        ...(o.rooms || []).map((r) => r.name),
        ...(o.places || []).flatMap((p) => [p.name, p.room_name]),
      ].some((v) => (v || '').toLowerCase().includes(q)),
  },
  equipment: {
    title: 'Закрепить оборудование',
    // Свободное (не закреплённое, не списанное) оборудование.
    path: '/api/equipment/?tab=active&status=free',
    placeholder: 'Поиск',
    empty: 'Нет свободного оборудования',
    emptyHint: 'Всё оборудование закреплено за сотрудниками или списано. Создайте новое.',
    createLabel: 'Создать оборудование',
    attach: (id, employeeId) => assignEquipment(id, { mode: 'mobile', employeeId }),
    match: (o, q) => [o.inventory_number, o.type_and_model].some((v) => (v || '').toLowerCase().includes(q)),
  },
}

function SimRow({ item }) {
  // Номер — в первой строке; тип (SIM/E-SIM) и оператор/поставщик — текстом во второй.
  const details = [item.network_operator, item.provider].filter(Boolean).join(' / ') || 'без поставщика и оператора'
  return (
    <span style={{ minWidth: 0, flex: 1 }}>
      <span style={{ font: '600 13.5px var(--font-mono)', display: 'block' }}>{item.phone_number}</span>
      <div style={{ fontSize: 11.5, color: 'var(--color-text-placeholder)', marginTop: 2 }}>
        {`${item.sim_type_display} · ${details}`}
      </div>
    </span>
  )
}

function EquipmentRow({ item }) {
  return (
    <span style={{ minWidth: 0, flex: 1 }}>
      <div style={{ fontSize: 13.5, fontWeight: 600 }}>{item.type_and_model}</div>
      <div style={{ font: '500 11.5px var(--font-mono)', color: 'var(--color-text-placeholder)', marginTop: 2 }}>{item.inventory_number}</div>
    </span>
  )
}

function PassRow({ item }) {
  const isKey = item.object_type === 'key'
  const types = isKey ? 'Ключ' : [item.type_vehicle && 'Авто', item.type_pedestrian && 'Пеший'].filter(Boolean).join(', ')
  return (
    <span style={{ minWidth: 0, flex: 1 }}>
      <div style={{ fontSize: 13.5, fontWeight: 600 }}>
        {isKey ? <>Ключ · <KeyTarget pass={item} /></> : 'Пропуск'}
      </div>
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
  const [selectedIds, setSelectedIds] = useState([])
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    fetchAllPages(cfg.path).then(setAll)
  }, [cfg.path])

  const q = query.trim().toLowerCase()
  const filtered = (all || []).filter((o) => cfg.match(o, q))

  const toggle = (id) =>
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

  const attach = async () => {
    setSubmitting(true)
    try {
      // За одним сотрудником можно закрепить несколько — привязываем по очереди.
      for (const id of selectedIds) {
        await cfg.attach(id, employeeId)
      }
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
          action={<Button onClick={onCreateNew}><Icon name="plus" size={18} strokeWidth={2.2} />{cfg.createLabel}</Button>}
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
              {filtered.map((item, i) => {
                const checked = selectedIds.includes(item.id)
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
                    {kind === 'sim' ? <SimRow item={item} /> : kind === 'pass' ? <PassRow item={item} /> : <EquipmentRow item={item} />}
                  </div>
                )
              })}
            </div>
          )}
          <div style={{ display: 'flex', gap: 10 }}>
            <Button variant="secondary" fullWidth onClick={onClose}>Отмена</Button>
            <Button fullWidth disabled={selectedIds.length === 0} loading={submitting} onClick={attach}>
              Привязать{selectedIds.length > 1 ? ` (${selectedIds.length})` : ''}
            </Button>
          </div>
          <Button fullWidth style={{ marginTop: 10 }} onClick={onCreateNew}><Icon name="plus" size={18} strokeWidth={2.2} />{cfg.createLabel}</Button>
        </>
      )}
    </Modal>
  )
}

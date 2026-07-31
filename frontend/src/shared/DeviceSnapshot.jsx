import { useState } from 'react'
import { usePermissions } from '../app/usePermissions.js'
import { Icon, Modal } from './ui'

// B32. Слепок устройства пользователя (снимается при подтверждении/отказе, если
// включён флаг компании). Показывается компактной плашкой «Слепок устройства»
// (чтобы не удлинять историю); по клику — модалка с полями слепка.

// Человекочитаемые подписи полей слепка (порядок вывода — по этому списку).
const FIELDS = [
  ['ip', 'IP-адрес'],
  ['browser', 'Браузер'],
  ['os', 'Операционная система'],
  ['device_type', 'Тип устройства'],
  ['platform', 'Платформа'],
  ['model', 'Модель устройства'],
  ['timezone', 'Часовой пояс'],
  ['screen', 'Экран'],
  ['language', 'Язык'],
  ['user_agent', 'User-Agent'],
]

function snapshotRows(snap) {
  const browser = [snap.browser, snap.browser_version].filter(Boolean).join(' ')
  const os = [snap.os, snap.os_version].filter(Boolean).join(' ')
  const merged = { ...snap, browser: browser || snap.browser, os: os || snap.os }
  return FIELDS.map(([key, label]) => [label, merged[key]]).filter(([, v]) => v)
}

// Плашка-триггер: иконка form + «Слепок устройства».
export function DeviceSnapshotChip({ snapshot }) {
  const [open, setOpen] = useState(false)
  const { isStaff } = usePermissions()
  // Слепок — ПДн; плашку видят только Администратор и Ответственный за учёт.
  if (!isStaff || !snapshot || typeof snapshot !== 'object') return null
  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          e.preventDefault()
          setOpen(true)
        }}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px',
          borderRadius: 20, border: '1px solid var(--color-border)', background: 'var(--color-surface)',
          color: 'var(--color-text-secondary)', fontSize: 12, fontWeight: 500, cursor: 'pointer',
          fontFamily: 'inherit', maxWidth: 'max-content',
        }}
      >
        <Icon name="form" size={14} strokeWidth={2} style={{ flex: 'none', color: 'var(--color-text-muted)' }} />
        Слепок устройства
      </button>
      {open ? <DeviceSnapshotModal snapshot={snapshot} onClose={() => setOpen(false)} /> : null}
    </>
  )
}

function DeviceSnapshotModal({ snapshot, onClose }) {
  const rows = snapshotRows(snapshot)
  return (
    <Modal open onClose={onClose} title="Слепок устройства">
      {rows.length === 0 ? (
        <div style={{ fontSize: 14, color: 'var(--color-text-muted)', padding: '4px 0' }}>Нет данных слепка.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, margin: '4px 0 4px' }}>
          {rows.map(([label, value]) => (
            <div key={label} style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, color: 'var(--color-text-placeholder)', marginBottom: 2 }}>{label}</div>
              <div style={{ fontSize: 13.5, color: 'var(--color-text-primary)', overflowWrap: 'anywhere' }}>{value}</div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiPatch } from '../../shared/api/client'
import { fetchAllPages } from '../../shared/api/fetchAll'
import { Button, EmptyState, Modal } from '../../shared/ui'

// D4 — привязка лицензии к оборудованию. Поиск по Наименованию у бэкенда
// есть только для Оборудования (по учётному №), не для Лицензии — при
// заявленном масштабе дешевле один раз забрать все свободные
// лицензии и искать по имени на клиенте, чем заводить отдельный
// search-параметр на бэкенде ради одной этой модалки.
export function AttachLicenseModal({ equipment, onClose, onAttached }) {
  const [all, setAll] = useState(null)
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    fetchAllPages('/api/licenses/?status=free&tab=active').then(setAll)
  }, [])

  const filtered = (all || []).filter((lic) => lic.name.toLowerCase().includes(query.toLowerCase()))

  const attach = async () => {
    setSubmitting(true)
    try {
      await apiPatch(`/api/licenses/${selectedId}/`, { equipment: equipment.id })
      onAttached()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open onClose={onClose} title="Привязать лицензию">
      <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 14 }}>{equipment.type_and_model}</div>

      {all === null ? (
        <div style={{ padding: 20, textAlign: 'center', color: 'var(--color-text-placeholder)' }}>Загрузка…</div>
      ) : all.length === 0 ? (
        <EmptyState
          title="Нет свободных лицензий"
          description="Все лицензии уже привязаны к оборудованию. Добавьте новую лицензию в разделе «Лицензии»."
          action={
            <Link to="/licenses/new">
              <Button>+ Создать лицензию</Button>
            </Link>
          }
        />
      ) : (
        <>
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск по наименованию лицензии"
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
          <div style={{ border: '1px solid var(--color-border)', borderRadius: 12, overflow: 'hidden', maxHeight: 260, overflowY: 'auto', marginBottom: 16 }}>
            {filtered.map((lic, i) => (
              <button
                key={lic.id}
                type="button"
                onClick={() => setSelectedId(lic.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 11,
                  width: '100%',
                  padding: '11px 13px',
                  border: 'none',
                  borderTop: i === 0 ? 'none' : '1px solid var(--color-border-hairline)',
                  background: selectedId === lic.id ? 'var(--color-info-bg)' : 'transparent',
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
                    background: selectedId === lic.id ? 'var(--color-primary)' : 'transparent',
                    boxShadow: selectedId === lic.id ? 'none' : 'inset 0 0 0 1.5px var(--color-border-strong)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {selectedId === lic.id ? (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12l5 5L20 6" />
                    </svg>
                  ) : null}
                </span>
                <span style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600 }}>{lic.name}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--color-text-placeholder)' }}>{lic.license_type_name} · свободна</div>
                </span>
              </button>
            ))}
            {filtered.length === 0 ? (
              <div style={{ padding: 14, fontSize: 13, color: 'var(--color-text-placeholder)' }}>Ничего не найдено</div>
            ) : null}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <Button variant="secondary" fullWidth onClick={onClose}>
              Отмена
            </Button>
            <Button fullWidth disabled={!selectedId} loading={submitting} onClick={attach}>
              Привязать
            </Button>
          </div>
        </>
      )}
    </Modal>
  )
}

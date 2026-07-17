import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiPatch } from '../../shared/api/client'
import { fetchAllPages } from '../../shared/api/fetchAll'
import { Button, EmptyState, Icon, Modal } from '../../shared/ui'
import { InlineMaskedKey } from '../licenses/MaskedKeyField.jsx'

// D4 — привязка лицензии к оборудованию. При заявленном масштабе дешевле один
// раз забрать все свободные лицензии и искать на клиенте (по Наименованию и
// Номеру/ключу), чем заводить отдельный search-эндпоинт ради этой модалки.
// include_key=1 — раздел доступен только Admin/Accountant, «Номер/ключ» на
// фронте всё равно маскируется за «глазиком».
export function AttachLicenseModal({ equipment, onClose, onAttached }) {
  const [all, setAll] = useState(null)
  const [query, setQuery] = useState('')
  const [selectedIds, setSelectedIds] = useState([])
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    fetchAllPages('/api/licenses/?status=free&tab=active&include_key=1').then(setAll)
  }, [])

  const q = query.trim().toLowerCase()
  const filtered = (all || []).filter(
    (lic) => lic.name.toLowerCase().includes(q) || (lic.key || '').toLowerCase().includes(q),
  )

  const toggle = (id) =>
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

  const attach = async () => {
    setSubmitting(true)
    try {
      // К одному оборудованию можно привязать несколько лицензий за раз —
      // патчим каждую выбранную по очереди.
      for (const licenseId of selectedIds) {
        await apiPatch(`/api/licenses/${licenseId}/`, { equipment: equipment.id })
      }
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
              <Button><Icon name="plus" size={18} strokeWidth={2.2} />Создать лицензию</Button>
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
            <div style={{ border: '1px solid var(--color-border)', borderRadius: 12, overflow: 'hidden', maxHeight: 260, overflowY: 'auto', marginBottom: 16 }}>
              {/* Строка — div, а не button: внутри «глазик» «Номера/ключа» —
                  вложенные button недопустимы. Клик по строке переключает выбор
                  (можно выбрать несколько лицензий за раз). */}
              {filtered.map((lic, i) => {
                const checked = selectedIds.includes(lic.id)
                return (
                  <div
                    key={lic.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => toggle(lic.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        toggle(lic.id)
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
                      <div style={{ fontSize: 13.5, fontWeight: 600 }}>{lic.name}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--color-text-placeholder)' }}>{lic.license_type_name} · свободна</div>
                      {lic.key ? <div style={{ marginTop: 4 }}><InlineMaskedKey value={lic.key} /></div> : null}
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
              Привязать{selectedIds.length > 1 ? ` (${selectedIds.length})` : ''}
            </Button>
          </div>
        </>
      )}
    </Modal>
  )
}

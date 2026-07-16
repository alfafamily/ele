import { useEffect, useState } from 'react'
import { apiGet } from '../../shared/api/client'
import { useDebouncedValue } from '../../shared/hooks/useDebouncedValue'
import { Button, Modal } from '../../shared/ui'
import { attachLicenseToEquipment } from './licensesApi.js'

// L2c «Привязать к оборудованию» — со стороны Лицензии подбирается
// Оборудование (любое активное, не списанное; понятие «занято/свободно» тут
// не про лицензии — к одному Оборудованию может быть привязано несколько).
export function AttachEquipmentModal({ license, onClose, onAttached }) {
  const [query, setQuery] = useState('')
  const debouncedQuery = useDebouncedValue(query, 250)
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [selectedId, setSelectedId] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const qs = new URLSearchParams({ tab: 'active' })
    if (debouncedQuery) qs.set('search', debouncedQuery)
    apiGet(`/api/equipment/?${qs}`)
      .then((data) => {
        if (!cancelled) setResults(data.results)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [debouncedQuery])

  const attach = async () => {
    setSubmitting(true)
    try {
      await attachLicenseToEquipment(license.id, selectedId)
      onAttached()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open onClose={onClose} title="Привязать к оборудованию">
      <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 14 }}>{license.name}</div>
      <input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Поиск по номеру, сотруднику или модели"
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
      {loading && results.length === 0 ? (
        <div style={{ padding: 14, fontSize: 13, textAlign: 'center', color: 'var(--color-text-placeholder)', marginBottom: 16 }}>Загрузка…</div>
      ) : results.length === 0 ? (
        <div style={{ padding: 14, fontSize: 13, textAlign: 'center', color: 'var(--color-text-placeholder)', marginBottom: 16 }}>Ничего не найдено</div>
      ) : (
        <div style={{ border: '1px solid var(--color-border)', borderRadius: 12, overflow: 'hidden', maxHeight: 260, overflowY: 'auto', marginBottom: 16 }}>
          {results.map((eq, i) => (
            <button
              key={eq.id}
              type="button"
              onClick={() => setSelectedId(eq.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 11,
                width: '100%',
                padding: '11px 13px',
                border: 'none',
                borderTop: i === 0 ? 'none' : '1px solid var(--color-border-hairline)',
                background: selectedId === eq.id ? 'var(--color-info-bg)' : 'transparent',
                cursor: 'pointer',
                textAlign: 'left',
                fontFamily: 'inherit',
              }}
            >
              <span style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>{eq.type_and_model}</div>
                <div style={{ fontSize: 11.5, color: 'var(--color-text-placeholder)', fontFamily: 'var(--font-mono)' }}>{eq.inventory_number}</div>
              </span>
            </button>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 10 }}>
        <Button variant="secondary" fullWidth onClick={onClose}>
          Отмена
        </Button>
        <Button fullWidth disabled={!selectedId} loading={submitting} onClick={attach}>
          Привязать
        </Button>
      </div>
    </Modal>
  )
}

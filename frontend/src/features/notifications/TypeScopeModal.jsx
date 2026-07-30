import { useEffect, useState } from 'react'
import { Button, Checkbox, Modal, RadioPills } from '../../shared/ui'

// B44. Модалка «Получать уведомления по типам» для одного вида ТО-уведомления.
// Два независимых блока — «Оборудование» и «Транспорт» (показываются по
// item.domains), в каждом свой выбор «Все / Только некоторые». «Все» = включая
// типы, созданные в будущем; «Только некоторые» = только отмеченные.
const SCOPE_OPTIONS = [
  { value: 'all', label: 'Все' },
  { value: 'some', label: 'Только некоторые' },
]

function ScopeBlock({ title, all, onAll, types, selected, onToggle }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 15, fontWeight: 600 }}>{title}</div>
      <RadioPills
        options={SCOPE_OPTIONS}
        value={all ? 'all' : 'some'}
        onChange={(v) => onAll(v === 'all')}
      />
      {!all ? (
        types.length === 0 ? (
          <div style={{ fontSize: 13.5, color: 'var(--color-text-placeholder)' }}>
            Виды пока не созданы.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {types.map((t) => (
              <Checkbox
                key={t.id}
                label={t.name}
                checked={selected.has(t.id)}
                onChange={() => onToggle(t.id)}
              />
            ))}
          </div>
        )
      ) : null}
    </div>
  )
}

export function TypeScopeModal({ open, item, equipmentTypes, transportTypes, onClose, onSave }) {
  const [eqAll, setEqAll] = useState(true)
  const [eqIds, setEqIds] = useState(() => new Set())
  const [trAll, setTrAll] = useState(true)
  const [trIds, setTrIds] = useState(() => new Set())
  const [saving, setSaving] = useState(false)

  // Инициализируем состояние из текущей настройки при открытии.
  useEffect(() => {
    if (!open || !item) return
    setEqAll(item.equipment_all_types ?? true)
    setEqIds(new Set(item.equipment_type_ids || []))
    setTrAll(item.transport_all_types ?? true)
    setTrIds(new Set(item.transport_type_ids || []))
  }, [open, item])

  if (!item) return null
  const domains = item.domains || []

  const toggle = (setter) => (id) =>
    setter((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const save = async () => {
    const body = { kind: item.kind }
    if (domains.includes('equipment')) {
      body.equipment_all_types = eqAll
      body.equipment_type_ids = eqAll ? [] : [...eqIds]
    }
    if (domains.includes('transport')) {
      body.transport_all_types = trAll
      body.transport_type_ids = trAll ? [] : [...trIds]
    }
    setSaving(true)
    try {
      await onSave(body)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Получать уведомления по видам">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {domains.includes('equipment') ? (
          <ScopeBlock
            title="Оборудование"
            all={eqAll}
            onAll={setEqAll}
            types={equipmentTypes}
            selected={eqIds}
            onToggle={toggle(setEqIds)}
          />
        ) : null}
        {domains.includes('transport') ? (
          <ScopeBlock
            title="Транспорт"
            all={trAll}
            onAll={setTrAll}
            types={transportTypes}
            selected={trIds}
            onToggle={toggle(setTrIds)}
          />
        ) : null}
        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Отмена
          </Button>
          <Button onClick={save} disabled={saving}>
            Сохранить
          </Button>
        </div>
      </div>
    </Modal>
  )
}

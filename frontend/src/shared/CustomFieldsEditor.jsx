import { Button, Input } from './ui'

// «Дополнительные поля» (§3.4, §3.6) — произвольные текстовые пары
// имя/значение, создаются пользователем для конкретного объекта, не через
// Тип. Общий для форм Оборудования и Лицензии.
export function CustomFieldsEditor({ items, onChange }) {
  const addField = () => onChange([...items, { name: '', value: '' }])
  const updateField = (i, patch) => onChange(items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)))
  const removeField = (i) => onChange(items.filter((_, idx) => idx !== i))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {items.map((item, i) => (
        <div key={item.id ?? `new-${i}`} style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
          {item.id ? (
            // Сохранённое поле — один инпут: лейбл = имя реквизита, значение редактируемо.
            <Input label={item.name} placeholder="—" value={item.value} onChange={(e) => updateField(i, { value: e.target.value })} />
          ) : (
            // Новое поле в этой сессии — два инпута: имя и значение.
            <>
              <Input label="Название поля" placeholder="Например, «Кабинет»" value={item.name} onChange={(e) => updateField(i, { name: e.target.value })} />
              <Input label="Значение" placeholder="—" value={item.value} onChange={(e) => updateField(i, { value: e.target.value })} />
            </>
          )}
          <button
            type="button"
            onClick={() => removeField(i)}
            style={{
              flex: 'none',
              width: 52,
              borderRadius: 10,
              border: 'none',
              background: 'var(--color-fill-input)',
              color: 'var(--color-text-muted)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            aria-label="Удалить поле"
          >
            ✕
          </button>
        </div>
      ))}
      <Button variant="secondary" type="button" onClick={addField}>
        + Добавить поле
      </Button>
    </div>
  )
}

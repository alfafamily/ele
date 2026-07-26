import { Button, Input } from './ui'
import { Icon } from './ui/Icon/Icon.jsx'
import { useDragSort, reorder } from './hooks/useDragSort.js'

// «Дополнительные поля» — произвольные текстовые пары
// имя/значение, создаются пользователем для конкретного объекта, не через
// Тип. Общий для форм Оборудования, Лицензии и Инструментов.
// B30: порядок полей задаётся перетаскиванием за ручку (grip) и сохраняется —
// объект показывает доп.поля именно в этом порядке.
export function CustomFieldsEditor({ items, onChange }) {
  const addField = () => onChange([...items, { name: '', value: '' }])
  const updateField = (i, patch) => onChange(items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)))
  const removeField = (i) => onChange(items.filter((_, idx) => idx !== i))
  const drag = useDragSort((from, to) => onChange(reorder(items, from, to)))

  // Ручку показываем только когда есть что переставлять.
  const sortable = items.length > 1

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {items.map((item, i) => (
        <div
          key={item.id ?? `new-${i}`}
          {...(sortable ? drag.rowProps(i) : {})}
          style={{
            display: 'flex',
            gap: 8,
            alignItems: 'stretch',
            opacity: drag.dragIndex === i ? 0.4 : 1,
            outline:
              drag.overIndex === i && drag.dragIndex !== null && drag.dragIndex !== i
                ? '2px solid var(--color-text-placeholder)'
                : 'none',
            outlineOffset: 2,
            borderRadius: 10,
          }}
        >
          {sortable ? (
            <span
              data-drag-handle
              aria-label="Перетащить для изменения порядка"
              style={{
                flex: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--color-text-placeholder)',
                cursor: 'grab',
                touchAction: 'none',
              }}
            >
              <Icon name="grip-vertical" size={18} strokeWidth={2} />
            </span>
          ) : null}
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
            <Icon name="x" size={16} strokeWidth={2} />
          </button>
        </div>
      ))}
      <Button variant="secondary" type="button" onClick={addField}>
        <Icon name="plus" size={18} strokeWidth={2.2} />
        Добавить поле
      </Button>
    </div>
  )
}

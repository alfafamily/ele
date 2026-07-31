import { useEffect, useState } from 'react'
import { fetchAllPages } from './api/fetchAll'
import { Button, EmptyState, Icon, Modal, SearchInput } from './ui'

// Общий каркас модалки «привязать/установить/закрепить свободный объект»:
// один раз забираем все свободные записи, ищем на клиенте, множественный выбор
// чекбоксами, затем привязываем каждый выбранный (attach вызывается по id).
// Богатые строки списка задаёт renderRow — под {value,label,sub} MultiSelectList
// они не подходят, поэтому список рисуем здесь.
//
// props:
//   title — заголовок модалки; subtitle — необязательная строка под заголовком;
//   fetchPath — URL списка свободных; match(item, q) — фильтр по нормализованному запросу;
//   renderRow(item) — содержимое строки (после чекбокса);
//   attach(id) — привязка одного объекта; onAttached/onClose — колбэки;
//   empty — { title, description, action } для пустого списка;
//   submitLabel — подпись кнопки действия; footerExtra — доп. блок под кнопками.
export function AttachSelectModal({
  title,
  subtitle,
  fetchPath,
  match,
  renderRow,
  attach,
  onAttached,
  onClose,
  empty,
  submitLabel,
  footerExtra = null,
  searchPlaceholder = 'Поиск',
}) {
  const [all, setAll] = useState(null)
  const [query, setQuery] = useState('')
  const [selectedIds, setSelectedIds] = useState([])
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    fetchAllPages(fetchPath).then(setAll)
  }, [fetchPath])

  const q = query.trim().toLowerCase()
  const filtered = (all || []).filter((item) => match(item, q))

  const toggle = (id) =>
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

  const submit = async () => {
    setSubmitting(true)
    try {
      // Несколько объектов за раз — привязываем каждый выбранный по очереди.
      for (const id of selectedIds) {
        await attach(id)
      }
      onAttached()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={title}>
      {subtitle ? <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 14 }}>{subtitle}</div> : null}

      {all === null ? (
        <div style={{ padding: 20, textAlign: 'center', color: 'var(--color-text-placeholder)' }}>Загрузка…</div>
      ) : all.length === 0 ? (
        <EmptyState title={empty.title} description={empty.description} action={empty.action} />
      ) : (
        <>
          <div style={{ marginBottom: 12 }}>
            <SearchInput value={query} onChange={setQuery} placeholder={searchPlaceholder} />
          </div>
          {filtered.length === 0 ? (
            <div style={{ padding: 14, fontSize: 13, textAlign: 'center', color: 'var(--color-text-placeholder)', marginBottom: 16 }}>Ничего не найдено</div>
          ) : (
            <div style={{ border: '1px solid var(--color-border)', borderRadius: 12, overflow: 'hidden', maxHeight: 216, overflowY: 'auto', marginBottom: 16 }}>
              {/* Строка — div, а не button: внутри могут быть вложенные интерактивные
                  элементы (например «глазик» «Номера/ключа»). Клик по строке
                  переключает выбор (можно выбрать несколько объектов за раз). */}
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
                    <span style={{ minWidth: 0, flex: 1 }}>{renderRow(item)}</span>
                  </div>
                )
              })}
            </div>
          )}
          <div style={{ display: 'flex', gap: 10 }}>
            <Button variant="secondary" fullWidth onClick={onClose}>
              Отмена
            </Button>
            <Button fullWidth disabled={selectedIds.length === 0} loading={submitting} onClick={submit}>
              {submitLabel}{selectedIds.length > 1 ? ` (${selectedIds.length})` : ''}
            </Button>
          </div>
          {footerExtra}
        </>
      )}
    </Modal>
  )
}

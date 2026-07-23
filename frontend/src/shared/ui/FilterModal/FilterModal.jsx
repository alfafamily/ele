import { useState } from 'react'
import { Button } from '../Button/Button.jsx'
import { Modal } from '../Modal/Modal.jsx'
import { Icon } from '../Icon/Icon.jsx'
import '../FilterButton/FilterButton.css'
import './FilterModal.css'

// B27. Кнопка «Фильтры» + отдельная модалка с полями фильтров. Пришла на смену
// выпадающему меню FilterButton: удобнее работать с богатыми наборами фильтров.
//
// Контролируемая оболочка. Родитель хранит применённые фильтры (value) и число
// активных (count → бейдж). Модалка ведёт черновик (draft), инициализируемый из
// value при открытии; поля рисует render-prop children(draft, setDraft).
//   onApply(draft) — «Показать»: применить черновик;
//   onClear()      — «Сбросить фильтры»: очистить все применённые фильтры;
//   isDraftActive(draft) — есть ли что сбрасывать (иначе вторая кнопка — «Отмена»).
export function FilterModal({ value, count = 0, onApply, onClear, isDraftActive, title = 'Фильтры', children }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(value)

  const openModal = () => {
    setDraft(value)
    setOpen(true)
  }
  const close = () => setOpen(false)
  const apply = () => {
    onApply(draft)
    close()
  }
  const active = isDraftActive ? isDraftActive(draft) : false
  const secondary = () => {
    if (active) onClear()
    close()
  }

  return (
    <div className="ele-filter-btn">
      <button
        type="button"
        className="ele-filter-btn__trigger"
        onClick={openModal}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={title}
      >
        <Icon name="sliders-horizontal" size={18} strokeWidth={1.9} />
        <span className="ele-only-desktop">{title}</span>
        {count > 0 ? <span className="ele-filter-btn__badge">{count}</span> : null}
      </button>
      {open ? (
        <Modal open onClose={close} title={title}>
          <div className="ele-filter-modal__body">
            {typeof children === 'function' ? children(draft, setDraft) : children}
          </div>
          <div className="ele-form-actions">
            <Button variant="secondary" onClick={secondary}>
              {active ? 'Сбросить фильтры' : 'Отмена'}
            </Button>
            <Button onClick={apply}>Показать</Button>
          </div>
        </Modal>
      ) : null}
    </div>
  )
}

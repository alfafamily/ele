import { useState } from 'react'
import { TerminalActionModal } from '../../shared/ui'
import { utilizePass } from './employeesApi.js'

// Утилизация средства доступа (пропуск или ключ) — терминальное действие: либо
// выбросить (утилизировать), либо передать арендодателю. Открепление
// размещённого средства вынесено отдельной операцией в блок «Размещение».
// Комментарий (необязательный, многострочный) попадает в историю движений.
const OPTIONS = [
  { value: 'utilized', label: 'Утилизировать', hint: 'Выбросить. Необратимо, уйдёт во вкладку «Утилизировано».' },
  { value: 'handed', label: 'Передать арендодателю', hint: 'Отдан арендодателю. Необратимо, уйдёт во вкладку «Утилизировано».' },
]

export function PassDisposeModal({ pass, onClose, onDone }) {
  const kind = pass.object_type === 'key' ? 'ключ' : 'пропуск'
  const [choice, setChoice] = useState(OPTIONS[0].value)

  return (
    <TerminalActionModal
      title={`Утилизировать ${kind}?`}
      submitLabel="Утилизировать"
      onConfirm={(comment) => utilizePass(pass.id, choice, comment)}
      onClose={onClose}
      onDone={onDone}
      commentStyle={{ marginBottom: 18 }}
      actionsStyle={{}}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, margin: '4px 0 16px' }}>
        {OPTIONS.map((opt) => (
          <label
            key={opt.value}
            className={'ele-option' + (choice === opt.value ? ' ele-option--selected' : '')}
          >
            <input type="radio" name="dispose" checked={choice === opt.value} onChange={() => setChoice(opt.value)} style={{ marginTop: 2 }} />
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 14, fontWeight: 600 }}>{opt.label}</span>
              <span style={{ display: 'block', fontSize: 12.5, color: 'var(--color-text-muted)', marginTop: 2 }}>{opt.hint}</span>
            </span>
          </label>
        ))}
      </div>
    </TerminalActionModal>
  )
}

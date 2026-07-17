import { useState } from 'react'
import { Icon } from '../../shared/ui'

// «Номер/ключ» — маскирован по умолчанию, раскрывается по кнопке-
// «глаз», копирование доступно только в раскрытом виде. fv.name === 'Номер/ключ'
// однозначно определяет реквизит: он зафиксирован и никогда не переименовывается.
export function MaskedKeyField({ fv, canReveal = true }) {
  const [revealed, setRevealed] = useState(false)
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    await navigator.clipboard.writeText(fv.value || '')
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  // Наблюдателю (canReveal=false) секрет не показываем: маска без кнопок,
  // значение бэкенд и не присылает.
  if (!canReveal) {
    return (
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, color: 'var(--color-text-placeholder)', marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{fv.name}</div>
        <div style={{ font: '500 14px var(--font-mono)', letterSpacing: 2 }}>•••• •••• •••• ••••</div>
      </div>
    )
  }

  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 12, color: 'var(--color-text-placeholder)', marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{fv.name}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ font: '500 14px var(--font-mono)', letterSpacing: revealed ? 'normal' : 2, minWidth: 0, overflowWrap: 'break-word', wordBreak: 'break-all' }}>
          {revealed ? fv.value || '—' : '•••• •••• •••• ••••'}
        </div>
        <button
          type="button"
          title={revealed ? 'Скрыть' : 'Показать'}
          onClick={() => setRevealed((r) => !r)}
          style={iconBtnStyle}
        >
          <Icon name={revealed ? 'eye-off' : 'eye'} size={16} style={{ color: '#757784' }} />
        </button>
        {revealed ? (
          <button type="button" title="Копировать" onClick={copy} style={iconBtnStyle}>
            <Icon name="copy" size={15} style={{ color: '#757784' }} />
          </button>
        ) : null}
      </div>
      {copied ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: 'var(--color-success)', marginTop: 7 }}>
          <Icon name="check" size={13} strokeWidth={2.4} />
          Скопировано
        </div>
      ) : null}
    </div>
  )
}

// Компактный «Номер/ключ» для списков (блок «Установленные лицензии» на
// карточке Оборудования, форма подбора лицензии) — маскирован по умолчанию,
// раскрывается «глазиком». Без подписи и копирования — только показ.
export function InlineMaskedKey({ value }) {
  const [revealed, setRevealed] = useState(false)

  const toggle = (e) => {
    // В списках компонент лежит внутри кликабельной строки/ссылки — не даём
    // всплыть, чтобы «глазик» не выбирал строку и не переходил по ссылке.
    e.preventDefault()
    e.stopPropagation()
    setRevealed((r) => !r)
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
      <span style={{ font: '500 12px var(--font-mono)', letterSpacing: revealed ? 'normal' : 1.5, color: 'var(--color-text-placeholder)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: revealed ? 'normal' : 'nowrap', wordBreak: revealed ? 'break-all' : 'normal' }}>
        {revealed ? value || '—' : '•••• •••• ••••'}
      </span>
      <button
        type="button"
        title={revealed ? 'Скрыть' : 'Показать'}
        onClick={toggle}
        style={{ width: 22, height: 22, flex: 'none', borderRadius: 6, background: 'transparent', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0 }}
      >
        <Icon name={revealed ? 'eye-off' : 'eye'} size={14} style={{ color: '#757784' }} />
      </button>
    </div>
  )
}

const iconBtnStyle = {
  width: 30,
  height: 30,
  flex: 'none',
  borderRadius: 8,
  background: 'var(--color-fill-input)',
  border: 'none',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
}

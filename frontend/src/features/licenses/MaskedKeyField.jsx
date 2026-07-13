import { useState } from 'react'

// «Номер/ключ» (§3.7) — маскирован по умолчанию, раскрывается по кнопке-
// «глаз», копирование доступно только в раскрытом виде. fv.name === 'Номер/ключ'
// однозначно определяет реквизит: он зафиксирован и никогда не переименовывается.
export function MaskedKeyField({ fv }) {
  const [revealed, setRevealed] = useState(false)
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    await navigator.clipboard.writeText(fv.value || '')
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
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
          {revealed ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#757784" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
              <path d="M4 4l16 16" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#757784" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          )}
        </button>
        {revealed ? (
          <button type="button" title="Копировать" onClick={copy} style={iconBtnStyle}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#757784" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="9" width="11" height="11" rx="2" />
              <path d="M5 15V5a2 2 0 0 1 2-2h10" />
            </svg>
          </button>
        ) : null}
      </div>
      {copied ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: 'var(--color-success)', marginTop: 7 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12l5 5L20 6" />
          </svg>
          Скопировано
        </div>
      ) : null}
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

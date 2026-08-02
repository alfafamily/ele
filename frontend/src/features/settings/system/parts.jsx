import { Button, Icon, Modal } from '../../../shared/ui'
import { spaceText } from './helpers.js'

// Индикатор результата проверки рядом с кнопкой: зелёная галочка-в-круге при
// успехе; красный крестик-в-круге и текст ошибки при неудаче.
export function StatusDot({ ok }) {
  return (
    <Icon
      name={ok ? 'circle-check' : 'circle-x'}
      size={20}
      strokeWidth={2}
      style={{ flex: 'none', color: ok ? 'var(--color-success)' : 'var(--color-error)' }}
    />
  )
}

export function CheckResult({ result }) {
  if (!result) return null
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
      <StatusDot ok={result.ok} />
      {!result.ok && result.msg ? <span style={{ color: 'var(--color-error)', fontSize: 13 }}>{result.msg}</span> : null}
    </span>
  )
}

// Единый индикатор успешной проверки для всех блоков: при успехе кнопки/поля
// проверки скрываются, вместо них — зелёная галочка и подпись.
export function CheckSuccess() {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <StatusDot ok />
      <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Проверка выполнена успешно</span>
    </span>
  )
}

// Кнопка «Письма нет» / «Push'a нет» — открывает список рекомендаций. Показывается
// только после запуска проверки (не в исходном состоянии блока).
export function HelpButton({ label, onClick }) {
  return (
    <Button type="button" variant="secondary" onClick={onClick}>
      {label}
    </Button>
  )
}

// B33: блок свободного места. Норма — серым; при нехватке — жёлтым (как
// треугольник) с подписью «Место заканчивается».
export function SpaceInfo({ info }) {
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: 12.5, color: info.low ? 'var(--color-warning)' : 'var(--color-text-muted)' }}>{spaceText(info)}</div>
      {info.low ? (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--color-warning)', marginTop: 2 }}>
          <Icon name="triangle-alert" size={14} strokeWidth={2.2} />
          Место заканчивается
        </div>
      ) : null}
    </div>
  )
}

// Модалка рекомендаций «Письмо/Push с кодом не пришёл». help — { title, items }
// либо null (закрыта).
export function HelpModal({ help, onClose }) {
  return (
    <Modal open={!!help} onClose={onClose} title={help?.title}>
      <div style={{ padding: '4px 20px 20px' }}>
        <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 12 }}>
          Проверьте следующее:
        </div>
        <ul style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {(help?.items || []).map((line, i) => (
            <li key={i} style={{ fontSize: 13.5, lineHeight: 1.45 }}>{line}</li>
          ))}
        </ul>
      </div>
    </Modal>
  )
}

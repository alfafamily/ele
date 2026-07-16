import { useState } from 'react'
import { Button } from '../Button/Button.jsx'
import { Modal } from '../Modal/Modal.jsx'

// Подтверждение обратимого действия (открепление/отвязка объектов друг от
// друга). Кнопка подтверждения — «опасная» по умолчанию; onConfirm может быть
// async — на время выполнения показываем загрузку и блокируем повтор.
export function ConfirmModal({ title, message, confirmLabel = 'Открепить', danger = true, onConfirm, onClose }) {
  const [loading, setLoading] = useState(false)

  const confirm = async () => {
    setLoading(true)
    try {
      await onConfirm()
    } catch {
      // Действие не выполнилось — оставляем модалку открытой для повтора/отмены.
      setLoading(false)
      return
    }
    // Успех: закрываем (родитель размонтирует модалку) — setLoading не трогаем.
    onClose()
  }

  return (
    <Modal open onClose={onClose} title={title}>
      {message ? (
        <div style={{ fontSize: 14, color: 'var(--color-text-secondary)', lineHeight: 1.5, margin: '4px 0 20px' }}>
          {message}
        </div>
      ) : null}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Button variant={danger ? 'danger' : 'primary'} fullWidth loading={loading} onClick={confirm}>
          {confirmLabel}
        </Button>
        <Button variant="secondary" fullWidth onClick={onClose}>
          Отмена
        </Button>
      </div>
    </Modal>
  )
}

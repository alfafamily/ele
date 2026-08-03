import { useState } from 'react'
import { useAuth } from '../../app/AuthContext.jsx'
import { apiPost } from '../../shared/api/client'
import { collectDeviceHints } from '../../shared/consent/deviceHints.js'
import { ConsentCheckboxes } from '../../shared/consent/ConsentCheckboxes.jsx'
import { Button, Icon, Modal } from '../../shared/ui'

// B51-R2. Дособирание согласия субъектом: если у связанного с учёткой сотрудника
// нет self-подтверждения (старая запись или отметил только оператор), ненавязчиво
// просим подтвердить. По кнопке — модалка с теми же двумя чекбоксами; слепок
// устройства снимается на сервере.

function ConsentReminderModal({ onClose }) {
  const { bootstrap, refreshUser } = useAuth()
  const [acknowledged, setAcknowledged] = useState(false)
  const [agreed, setAgreed] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const confirm = async () => {
    setSubmitting(true)
    setError(null)
    try {
      await apiPost('/api/auth/me/consent/', {
        consent_acknowledged: acknowledged,
        consent_agreed: agreed,
        device: collectDeviceHints(),
      })
      await refreshUser()
      onClose()
    } catch (err) {
      setError(err.detail || 'Не удалось зафиксировать согласие.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open onClose={onClose} title="Согласие на обработку персональных данных">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <ConsentCheckboxes
          pdn={bootstrap?.pdn_consent}
          acknowledged={acknowledged}
          agreed={agreed}
          onAcknowledged={setAcknowledged}
          onAgreed={setAgreed}
        />
        {error ? <div style={{ fontSize: 13, color: 'var(--color-error)' }}>{error}</div> : null}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Позже
          </Button>
          <Button onClick={confirm} loading={submitting} disabled={!acknowledged || !agreed}>
            Подтвердить согласие
          </Button>
        </div>
      </div>
    </Modal>
  )
}

export function ConsentReminderBanner() {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  if (!user?.needs_consent) return null
  return (
    <>
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
          padding: '13px 16px', borderRadius: 12,
          border: '1px solid var(--color-warning)', background: 'var(--color-warning-bg)',
          marginBottom: 16,
        }}
      >
        <Icon name="lock" size={20} strokeWidth={2} style={{ color: 'var(--color-warning)', flex: 'none' }} />
        <span style={{ fontSize: 13.5, color: 'var(--color-text-primary)', flex: 1, minWidth: 200 }}>
          <b>Подтвердите согласие на обработку персональных данных.</b> Ознакомьтесь с документами компании и
          подтвердите согласие — это займёт несколько секунд.
        </span>
        <Button onClick={() => setOpen(true)}>Подтвердить</Button>
      </div>
      {open ? <ConsentReminderModal onClose={() => setOpen(false)} /> : null}
    </>
  )
}

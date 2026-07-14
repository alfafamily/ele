import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../app/AuthContext.jsx'
import { roleLabel } from '../../shared/roles.js'
import { Button, Card, Spinner, StatusPill } from '../../shared/ui'
import { uploadEmployeeAvatar } from '../employees/employeesApi.js'
import { ChangeEmailModal } from './ChangeEmailModal.jsx'
import { ChangePasswordModal } from './ChangePasswordModal.jsx'
import { getMySimCards } from './profileApi.js'

function initials(name) {
  return (name || '?').slice(0, 2).toUpperCase()
}
function formatDate(iso) {
  if (!iso) return 'ещё не менялся'
  return new Date(iso).toLocaleDateString('ru-RU')
}

export function ProfilePage() {
  const { user, logout, refreshUser } = useAuth()
  const [showChangePassword, setShowChangePassword] = useState(false)
  const [showChangeEmail, setShowChangeEmail] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [simCards, setSimCards] = useState([])
  const fileInputRef = useRef(null)

  // При открытии профиля перечитываем пользователя — ФИО/аватар связанного
  // Сотрудника могли измениться в разделе «Сотрудники» после логина.
  useEffect(() => {
    refreshUser()
  }, [refreshUser])

  const employee = user.employee

  useEffect(() => {
    if (employee?.id) getMySimCards(employee.id).then(setSimCards)
  }, [employee?.id])
  const displayName = employee?.full_name || user.email

  const onAvatarSelected = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !employee) return
    setUploadingAvatar(true)
    try {
      await uploadEmployeeAvatar(employee.id, file)
      await refreshUser()
    } finally {
      setUploadingAvatar(false)
      e.target.value = ''
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ width: '100%', maxWidth: 640, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Card style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <span
            style={{
              width: 66,
              height: 66,
              flex: 'none',
              borderRadius: '50%',
              background: 'var(--color-fill-active-tint)',
              color: 'var(--color-text-muted)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 22,
              fontWeight: 600,
              overflow: 'hidden',
              cursor: employee ? 'pointer' : 'default',
              position: 'relative',
            }}
            onClick={() => employee && fileInputRef.current?.click()}
            title={employee ? 'Изменить фото' : undefined}
          >
            {employee?.avatar ? <img src={employee.avatar.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials(displayName)}
            {uploadingAvatar ? <Spinner size={20} /> : null}
          </span>
          {employee ? <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onAvatarSelected} /> : null}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 20, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{displayName}</div>
            <div style={{ fontSize: 13.5, color: 'var(--color-text-placeholder)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.email}</div>
            <button
              type="button"
              onClick={logout}
              style={{
                marginTop: 8,
                padding: 0,
                border: 'none',
                background: 'none',
                color: 'var(--color-error)',
                fontSize: 13.5,
                fontWeight: 600,
                fontFamily: 'inherit',
                textDecoration: 'underline',
                cursor: 'pointer',
              }}
            >
              Выйти из системы
            </button>
          </div>
        </Card>

        <Card>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Данные учётной записи</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 28px' }}>
            <Field label="Email" value={user.email} />
            <Field label="Роль" value={roleLabel(user.role)} />
            {employee ? (
              <div>
                <div style={{ fontSize: 12, color: 'var(--color-text-placeholder)', marginBottom: 4 }}>Связанный сотрудник</div>
                <Link to={`/employees/${employee.id}`} style={{ fontSize: 14, fontWeight: 600 }}>
                  {employee.full_name}
                </Link>
              </div>
            ) : null}
          </div>
          <Button variant="secondary" style={{ marginTop: 16 }} onClick={() => setShowChangeEmail(true)}>
            Сменить email
          </Button>
        </Card>

        {employee ? (
          <Card>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Информация о сотруднике</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 28px' }}>
              <Field label="Имя" value={employee.first_name} />
              <Field label="Фамилия" value={employee.last_name} />
              <Field label="Отдел" value={employee.department} />
              <Field label="Должность" value={employee.position} />
            </div>
          </Card>
        ) : null}

        {employee ? (
          <Card>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Корпоративная связь</div>
            {simCards.length === 0 ? (
              <div style={{ fontSize: 13.5, color: 'var(--color-text-muted)' }}>За вами не закреплено SIM-карт.</div>
            ) : (
              simCards.map((sim) => {
                const meta = [sim.network_operator, sim.provider].filter(Boolean).join(' · ')
                return (
                  <div key={sim.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 13px', background: 'var(--color-fill-input)', borderRadius: 10, marginBottom: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', background: 'var(--color-fill-active-tint)', padding: '1px 7px', borderRadius: 5 }}>
                          {sim.sim_type_display}
                        </span>
                        <span style={{ font: '600 13.5px var(--font-mono)', color: 'var(--color-text-primary)' }}>{sim.phone_number}</span>
                        <StatusPill variant={sim.is_deactivated ? 'archived' : 'assigned'}>
                          {sim.is_deactivated ? 'Деактивирована' : 'Активна'}
                        </StatusPill>
                      </div>
                      {meta ? <div style={{ fontSize: 12, color: 'var(--color-text-placeholder)', marginTop: 3 }}>{meta}</div> : null}
                    </div>
                  </div>
                )
              })
            )}
          </Card>
        ) : null}

        <Card style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>Пароль</div>
            <div style={{ fontSize: 13, color: 'var(--color-text-placeholder)', marginTop: 3 }}>
              Последнее изменение — {formatDate(user.password_changed_at)}
            </div>
          </div>
          <Button variant="secondary" onClick={() => setShowChangePassword(true)}>
            Сменить пароль
          </Button>
        </Card>
      </div>

      {showChangePassword ? <ChangePasswordModal onClose={() => setShowChangePassword(false)} onDone={() => setShowChangePassword(false)} /> : null}
      {showChangeEmail ? <ChangeEmailModal onClose={() => setShowChangeEmail(false)} /> : null}
    </div>
  )
}

function Field({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: 'var(--color-text-placeholder)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 500 }}>{value || '—'}</div>
    </div>
  )
}

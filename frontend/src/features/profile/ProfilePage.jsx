import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../../app/AuthContext.jsx'
import { roleLabel } from '../../shared/roles.js'
import { nameInitials } from '../../shared/employeeName.js'
import { Button, Card, Spinner } from '../../shared/ui'
import { deleteEmployeeAvatar, uploadEmployeeAvatar } from '../employees/employeesApi.js'
import { PassInfo } from '../employees/PassInfo.jsx'
import { SimCardInfo } from '../employees/SimCardInfo.jsx'
import { ChangeEmailModal } from './ChangeEmailModal.jsx'
import { ChangePasswordModal } from './ChangePasswordModal.jsx'
import { getMyEquipment, getMyPasses, getMySimCards } from './profileApi.js'

const avatarMenuItem = {
  border: 'none',
  background: 'none',
  textAlign: 'left',
  padding: '10px 12px',
  borderRadius: 8,
  fontSize: 14,
  fontWeight: 500,
  cursor: 'pointer',
  fontFamily: 'inherit',
  color: 'var(--color-text-primary)',
  whiteSpace: 'nowrap',
}

export function ProfilePage() {
  const { user, logout, refreshUser } = useAuth()
  const [showChangePassword, setShowChangePassword] = useState(false)
  const [showChangeEmail, setShowChangeEmail] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [avatarMenu, setAvatarMenu] = useState(false)
  const [simCards, setSimCards] = useState([])
  const [passes, setPasses] = useState([])
  const [equipment, setEquipment] = useState([])
  const fileInputRef = useRef(null)

  // При открытии профиля перечитываем пользователя — ФИО/аватар связанного
  // Сотрудника могли измениться в разделе «Сотрудники» после логина.
  useEffect(() => {
    refreshUser()
  }, [refreshUser])

  const employee = user.employee

  useEffect(() => {
    if (employee?.id) {
      getMySimCards(employee.id).then(setSimCards)
      getMyPasses(employee.id).then(setPasses)
      getMyEquipment(employee.id).then(setEquipment)
    }
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

  const onRemoveAvatar = async () => {
    if (!employee) return
    setUploadingAvatar(true)
    try {
      await deleteEmployeeAvatar(employee.id)
      await refreshUser()
    } finally {
      setUploadingAvatar(false)
    }
  }

  // Клик по аватару: если фото есть — меню Загрузить/Удалить (как логотип
  // компании), иначе сразу выбор файла.
  const onAvatarClick = () => {
    if (!employee) return
    if (employee.avatar) setAvatarMenu((v) => !v)
    else fileInputRef.current?.click()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ width: '100%', maxWidth: 640, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Card style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <div style={{ flex: 'none', position: 'relative' }}>
            <span
              style={{
                width: 66,
                height: 66,
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
              onClick={onAvatarClick}
              title={employee ? (employee.avatar ? 'Действия с фото' : 'Загрузить фото') : undefined}
              aria-haspopup={employee?.avatar ? 'menu' : undefined}
              aria-expanded={employee?.avatar ? avatarMenu : undefined}
            >
              {employee?.avatar ? <img src={employee.avatar.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : nameInitials(displayName)}
              {uploadingAvatar ? <Spinner size={20} /> : null}
            </span>
            {avatarMenu && employee?.avatar ? (
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 45 }} onClick={() => setAvatarMenu(false)} />
                <div
                  role="menu"
                  style={{ position: 'absolute', top: 72, left: 0, zIndex: 46, minWidth: 168, padding: 6, display: 'flex', flexDirection: 'column', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 12, boxShadow: 'var(--shadow-block)' }}
                >
                  <button type="button" style={avatarMenuItem} onClick={() => { setAvatarMenu(false); fileInputRef.current?.click() }}>
                    Загрузить новый
                  </button>
                  <button type="button" style={{ ...avatarMenuItem, color: 'var(--color-error)' }} onClick={() => { setAvatarMenu(false); onRemoveAvatar() }}>
                    Удалить
                  </button>
                </div>
              </>
            ) : null}
          </div>
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
            <div>
              <Field label="Email" value={user.email} />
              <Button variant="secondary" style={{ marginTop: 16 }} onClick={() => setShowChangeEmail(true)}>
                Сменить email
              </Button>
            </div>
            <div>
              <Field label="Роль" value={roleLabel(user.role)} />
              <Button variant="secondary" style={{ marginTop: 16 }} onClick={() => setShowChangePassword(true)}>
                Сменить пароль
              </Button>
            </div>
          </div>
        </Card>

        {employee ? (
          <Card>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Обо мне</div>
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
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Закреплённое оборудование</div>
            {equipment.length === 0 ? (
              <div style={{ fontSize: 13.5, color: 'var(--color-text-muted)' }}>За вами не закреплено оборудования.</div>
            ) : (
              equipment.map((eq) => (
                <div key={eq.id} style={{ padding: '11px 13px', background: 'var(--color-fill-input)', borderRadius: 10, marginBottom: 8 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--color-text-primary)' }}>{eq.type_and_model}</div>
                  <div style={{ font: '500 12px var(--font-mono)', color: 'var(--color-text-placeholder)', marginTop: 2 }}>{eq.inventory_number}</div>
                </div>
              ))
            )}
          </Card>
        ) : null}

        {employee ? (
          <Card>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Корпоративная связь</div>
            {simCards.length === 0 ? (
              <div style={{ fontSize: 13.5, color: 'var(--color-text-muted)' }}>За вами не закреплено SIM-карт.</div>
            ) : (
              simCards.map((sim) => (
                <div key={sim.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 13px', background: 'var(--color-fill-input)', borderRadius: 10, marginBottom: 8 }}>
                  <SimCardInfo sim={sim} />
                </div>
              ))
            )}
          </Card>
        ) : null}

        {employee ? (
          <Card>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Средства доступа</div>
            {passes.length === 0 ? (
              <div style={{ fontSize: 13.5, color: 'var(--color-text-muted)' }}>За вами не закреплено средств доступа.</div>
            ) : (
              passes.map((pass) => (
                <div key={pass.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 13px', background: 'var(--color-fill-input)', borderRadius: 10, marginBottom: 8 }}>
                  <PassInfo pass={pass} />
                </div>
              ))
            )}
          </Card>
        ) : null}

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

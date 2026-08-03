import { useEffect, useState } from 'react'
import { Banner, Button, Checkbox, Modal, Select } from '../../shared/ui'
import { EmployeeChoice } from './EmployeeChoice.jsx'
import { MaintenanceTypeScope } from './MaintenanceTypeScope.jsx'
import { deactivateUser, getCompanySettings, updateUser } from './settingsApi.js'

const ROLE_OPTIONS = [
  { value: 'admin', label: 'Администратор' },
  { value: 'accountant', label: 'Ответственный за учёт' },
  { value: 'maintenance', label: 'Механик по оборудованию' },
  { value: 'automechanic', label: 'Автомеханик' },
  { value: 'employee', label: 'Сотрудник' },
]

// Карточка Пользователя — смена Роли, привязка/отвязка
// Сотрудника, признак «Наблюдатель». Флаг «Наблюдатель» показывается только
// для роли «Сотрудник»; при иной роли значение в БД сохраняется, но в форме
// скрыто — поэтому при сохранении не роли «Сотрудник» отправляем false.
export function EditUserModal({ user, onClose, onSaved }) {
  const [role, setRole] = useState(user.role)
  // { id, full_name, avatar } | null. Инициализируем из связанного Сотрудника, если есть.
  const [employee, setEmployee] = useState(
    user.employee ? { id: user.employee, full_name: user.employee_name, avatar: user.employee_avatar } : null,
  )
  // Режим сотрудника (как размещение при создании Оборудования): при
  // редактировании доступны только 'none' и 'existing' (создание — при приглашении).
  const [employeeMode, setEmployeeMode] = useState(user.employee ? 'existing' : 'none')
  const [isObserver, setIsObserver] = useState(user.is_observer)
  // B23: «Ответственный за ТО» (проведение) и «Может управлять регламентами ТО» —
  // независимые флаги учётчика; область типов — общая для проведения ТО.
  const [canMaintain, setCanMaintain] = useState(!!user.can_maintain)
  const [canManageRegulations, setCanManageRegulations] = useState(!!user.can_manage_regulations)
  const [maintenanceAllTypes, setMaintenanceAllTypes] = useState(user.maintenance_all_types !== false)
  const [maintenanceTypeIds, setMaintenanceTypeIds] = useState(user.maintenance_types || [])
  // B22: флаги и область типов ТО транспорта.
  const [canMaintainTransport, setCanMaintainTransport] = useState(!!user.can_maintain_transport)
  const [canManageTransportRegulations, setCanManageTransportRegulations] = useState(!!user.can_manage_transport_regulations)
  const [maintenanceAllTransportTypes, setMaintenanceAllTransportTypes] = useState(user.maintenance_all_transport_types !== false)
  const [maintenanceTransportTypeIds, setMaintenanceTransportTypeIds] = useState(user.maintenance_transport_types || [])
  // B9: право редактировать в служебной Django-админке (= is_superuser). Галка
  // доступна только роли «Администратор» и лишь при включённом глобальном
  // доступе к админ-панели (Настройки → Системные).
  const [adminEditEnabled, setAdminEditEnabled] = useState(!!user.admin_edit_enabled)
  const [adminAccessEnabled, setAdminAccessEnabled] = useState(null)
  // Статус доступа: приглашённый пользователь тоже активен (is_active=True).
  const currentlyActive = user.status !== 'deactivated'
  const [status, setStatus] = useState(currentlyActive ? 'active' : 'deactivated')
  const [terminateEmployee, setTerminateEmployee] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  // Глобальный флаг доступа к админ-панели — гейтит галку редактирования.
  useEffect(() => {
    let alive = true
    getCompanySettings()
      .then((c) => alive && setAdminAccessEnabled(!!c.admin_access_enabled))
      .catch(() => alive && setAdminAccessEnabled(false))
    return () => {
      alive = false
    }
  }, [])

  const submit = async () => {
    setSubmitting(true)
    setError(null)
    try {
      if (status === 'deactivated' && currentlyActive) {
        // Деактивация (с опциональным увольнением связанного сотрудника) —
        // остальные правки при этом не применяем, связь снимается на бэкенде.
        await deactivateUser(user.id, employee ? terminateEmployee : false)
      } else {
        const maintainer = role === 'maintenance' || (role === 'accountant' && canMaintain)
        const transportMaintainer = role === 'automechanic' || (role === 'accountant' && canMaintainTransport)
        await updateUser(user.id, {
          role,
          employee: employeeMode === 'existing' ? (employee?.id ?? null) : null,
          is_observer: role === 'employee' ? isObserver : false,
          can_maintain: role === 'accountant' ? canMaintain : false,
          can_manage_regulations: role === 'accountant' ? canManageRegulations : false,
          maintenance_all_types: maintainer ? maintenanceAllTypes : true,
          maintenance_types: maintainer && !maintenanceAllTypes ? maintenanceTypeIds : [],
          can_maintain_transport: role === 'accountant' ? canMaintainTransport : false,
          can_manage_transport_regulations: role === 'accountant' ? canManageTransportRegulations : false,
          maintenance_all_transport_types: transportMaintainer ? maintenanceAllTransportTypes : true,
          maintenance_transport_types: transportMaintainer && !maintenanceAllTransportTypes ? maintenanceTransportTypeIds : [],
          admin_edit_enabled: role === 'admin' ? adminEditEnabled : false,
        })
      }
      onSaved()
    } catch (err) {
      setError(err.errors ? Object.values(err.errors).flat().join(' ') : err.detail || 'Не удалось сохранить изменения.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open onClose={onClose} title="Пользователь">
      <p style={{ fontSize: 13.5, color: 'var(--color-text-muted)', marginBottom: 18, marginTop: -6 }}>{user.email}</p>
      {error ? <Banner variant="error">{error}</Banner> : null}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {currentlyActive ? (
          <Select label="Статус доступа" value={status} onChange={setStatus}>
            <option value="active">Активен</option>
            <option value="deactivated">Деактивирован</option>
          </Select>
        ) : (
          <div>
            <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 6 }}>Статус доступа</div>
            <div style={{ fontWeight: 500, color: 'var(--color-error)' }}>Деактивирован</div>
          </div>
        )}

        {status === 'active' ? (
          <>
        <Select label="Роль" required value={role} onChange={setRole}>
          {ROLE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>

        {role === 'employee' ? (
          <Checkbox label="Признак «Наблюдатель» (только для роли «Сотрудник»)" checked={isObserver} onChange={setIsObserver} />
        ) : null}
        {role === 'admin' ? (
          <div>
            <Checkbox
              label="Разрешать редактировать данные в админ-панели приложения (Django)"
              checked={adminEditEnabled}
              disabled={adminAccessEnabled !== true}
              onChange={setAdminEditEnabled}
            />
            <div style={{ fontSize: 12, color: 'var(--color-text-placeholder)', marginTop: 4, marginLeft: 30 }}>
              {adminAccessEnabled === false
                ? 'Чтобы выдать это право, сначала включите доступ к админ-панели приложения (Django) в Настройках → Системные.'
                : 'Крайне не рекомендуется выполнять какие-либо действия в админ-панели приложения (Django): изменения проходят в обход бизнес-логики и могут необратимо повредить учётные данные.'}
            </div>
          </div>
        ) : null}
        {role === 'accountant' ? (
          <>
            <Checkbox label="Может управлять регламентами ТО Оборудования" checked={canManageRegulations} onChange={setCanManageRegulations} />
            <Checkbox label="Ответственный за ТО Оборудования" checked={canMaintain} onChange={setCanMaintain} />
            <Checkbox label="Может управлять регламентами ТО Транспорта" checked={canManageTransportRegulations} onChange={setCanManageTransportRegulations} />
            <Checkbox label="Ответственный за ТО Транспорта" checked={canMaintainTransport} onChange={setCanMaintainTransport} />
          </>
        ) : null}
        {role === 'maintenance' || (role === 'accountant' && canMaintain) ? (
          <MaintenanceTypeScope
            allTypes={maintenanceAllTypes}
            typeIds={maintenanceTypeIds}
            onChange={({ allTypes, typeIds }) => {
              setMaintenanceAllTypes(allTypes)
              setMaintenanceTypeIds(typeIds)
            }}
          />
        ) : null}
        {role === 'automechanic' || (role === 'accountant' && canMaintainTransport) ? (
          <MaintenanceTypeScope
            domain="transport"
            allTypes={maintenanceAllTransportTypes}
            typeIds={maintenanceTransportTypeIds}
            onChange={({ allTypes, typeIds }) => {
              setMaintenanceAllTransportTypes(allTypes)
              setMaintenanceTransportTypeIds(typeIds)
            }}
          />
        ) : null}

        <EmployeeChoice
          mode={employeeMode}
          onModeChange={(m) => {
            setEmployeeMode(m)
            setEmployee(null)
          }}
          employee={employee}
          onSelectEmployee={setEmployee}
        />
          </>
        ) : currentlyActive && employee ? (
          <Checkbox
            label="Также уволить связанного сотрудника (снять оборудование, статус «Уволен»)"
            checked={terminateEmployee}
            onChange={setTerminateEmployee}
          />
        ) : null}
      </div>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 22 }}>
        {currentlyActive ? (
          <>
            <Button variant="secondary" onClick={onClose}>
              Отмена
            </Button>
            <Button loading={submitting} onClick={submit}>
              Сохранить
            </Button>
          </>
        ) : (
          <Button variant="secondary" onClick={onClose}>
            Закрыть
          </Button>
        )}
      </div>
    </Modal>
  )
}

import { useCallback, useEffect, useState } from 'react'
import { Button, Card, Checkbox, Spinner } from '../../shared/ui'
import { getPreferences, getVapidKey, patchPreference } from './notificationsApi.js'
import { currentSubscription, disablePush, enablePush, permissionDenied, pushUnavailableReason } from './push.js'
import { TypeScopeModal } from './TypeScopeModal.jsx'

// Подпись кнопки области типов: «Получать по всем типам», если по всем доступным
// доменам выбрано «Все»; иначе — число покрытых типов.
function scopeLabel(item, eqTypes, trTypes) {
  let n = 0
  let all = true
  if (item.domains.includes('equipment')) {
    if (item.equipment_all_types) n += eqTypes.length
    else {
      n += (item.equipment_type_ids || []).length
      all = false
    }
  }
  if (item.domains.includes('transport')) {
    if (item.transport_all_types) n += trTypes.length
    else {
      n += (item.transport_type_ids || []).length
      all = false
    }
  }
  return all ? 'Получать по всем типам' : `Получать по ${n} типам`
}

const rowStyle = {
  display: 'grid',
  gridTemplateColumns: '1fr 76px 76px',
  alignItems: 'center',
  padding: '14px 0',
}
const colHead = {
  textAlign: 'center',
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--color-text-secondary)',
}
const cellCenter = { display: 'flex', justifyContent: 'center' }
const scopeBtnStyle = {
  alignSelf: 'flex-start',
  padding: 0,
  border: 'none',
  background: 'none',
  color: 'var(--color-brand-accent)',
  fontSize: 13,
  fontWeight: 600,
  fontFamily: 'inherit',
  cursor: 'pointer',
  textAlign: 'left',
}

export function NotificationsPage() {
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState([])
  const [eqTypes, setEqTypes] = useState([])
  const [trTypes, setTrTypes] = useState([])
  const [vapid, setVapid] = useState({ public_key: '', configured: false })
  const [deviceOn, setDeviceOn] = useState(false)
  const [pushBusy, setPushBusy] = useState(false)
  const [pushError, setPushError] = useState('')
  const [modalItem, setModalItem] = useState(null)

  const load = useCallback(async () => {
    const [prefs, key] = await Promise.all([getPreferences(), getVapidKey()])
    setItems(prefs.items)
    setEqTypes(prefs.equipment_types)
    setTrTypes(prefs.transport_types)
    setVapid(key)
    try {
      setDeviceOn(!!(await currentSubscription()))
    } catch {
      setDeviceOn(false)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const toggleChannel = async (item, field, value) => {
    setItems((prev) => prev.map((it) => (it.kind === item.kind ? { ...it, [field]: value } : it)))
    try {
      const updated = await patchPreference({ kind: item.kind, [field]: value })
      setItems((prev) => prev.map((it) => (it.kind === updated.kind ? updated : it)))
    } catch {
      setItems((prev) => prev.map((it) => (it.kind === item.kind ? { ...it, [field]: !value } : it)))
    }
  }

  const saveScope = async (body) => {
    const updated = await patchPreference(body)
    setItems((prev) => prev.map((it) => (it.kind === updated.kind ? updated : it)))
  }

  const togglePush = async () => {
    setPushBusy(true)
    setPushError('')
    try {
      if (deviceOn) {
        await disablePush()
        setDeviceOn(false)
      } else {
        await enablePush(vapid.public_key)
        setDeviceOn(true)
      }
    } catch (e) {
      setPushError(e?.message || 'Не удалось изменить настройку push.')
    } finally {
      setPushBusy(false)
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
        <Spinner />
      </div>
    )
  }

  const reason = pushUnavailableReason()
  const pushBlocked = reason !== '' || !vapid.configured
  let pushHint = ''
  if (reason === 'insecure') pushHint = 'Сервис ELE в вашей компании работает по http-протоколу. Push-уведомления недоступны.'
  else if (reason === 'unsupported') pushHint = 'Этот браузер не поддерживает push-уведомления.'
  else if (!vapid.configured) pushHint = 'Push-уведомления недоступны на сервере.'
  else if (permissionDenied()) pushHint = 'Уведомления запрещены в настройках браузера — разрешите их для этого сайта.'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ width: '100%', maxWidth: 640, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Уведомления</h1>

        {/* Push включается отдельно на каждом устройстве; настройки почты/push
            по видам сохраняются на аккаунте и не зависят от устройства. */}
        <Card style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Button onClick={togglePush} disabled={pushBusy || pushBlocked}>
            {deviceOn ? 'Отключить push-уведомления на устройстве' : 'Включить push-уведомления на устройстве'}
          </Button>
          {pushHint ? (
            <div style={{ fontSize: 13, color: 'var(--color-text-placeholder)' }}>{pushHint}</div>
          ) : (
            <div style={{ fontSize: 13, color: 'var(--color-text-placeholder)' }}>
              Push нужно включать на каждом устройстве отдельно. Настройки почты и push по видам
              уведомлений сохраняются на аккаунте.
            </div>
          )}
          {pushError ? (
            <div style={{ fontSize: 13, color: 'var(--color-error)' }}>{pushError}</div>
          ) : null}
        </Card>

        <Card>
          <div style={rowStyle}>
            <div />
            <div style={colHead}>Почта</div>
            <div style={colHead}>Push</div>
          </div>
          {items.map((item) => (
            <div key={item.kind} style={{ ...rowStyle, borderTop: '1px solid var(--color-border)' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingRight: 12 }}>
                <span style={{ fontSize: 14 }}>{item.label}</span>
                {item.configurable_types ? (
                  <button type="button" style={scopeBtnStyle} onClick={() => setModalItem(item)}>
                    {scopeLabel(item, eqTypes, trTypes)}
                  </button>
                ) : null}
              </div>
              <div style={cellCenter}>
                <Checkbox checked={item.email_enabled} onChange={(v) => toggleChannel(item, 'email_enabled', v)} />
              </div>
              <div style={cellCenter}>
                <Checkbox checked={item.push_enabled} onChange={(v) => toggleChannel(item, 'push_enabled', v)} />
              </div>
            </div>
          ))}
        </Card>
      </div>

      <TypeScopeModal
        open={!!modalItem}
        item={modalItem}
        equipmentTypes={eqTypes}
        transportTypes={trTypes}
        onClose={() => setModalItem(null)}
        onSave={saveScope}
      />
    </div>
  )
}

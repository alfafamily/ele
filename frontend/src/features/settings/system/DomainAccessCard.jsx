import { useState } from 'react'
import { Banner, Button, Checkbox, Card, Icon, Input } from '../../../shared/ui'
import { FieldView, FIELD_W, IconBtn, InlineField } from '../inlineFields.jsx'
import { fieldError } from '../fieldError.js'
import { updateCompanySettings } from '../settingsApi.js'
import { sectionTitle, normalizeIps } from './helpers.js'

// Домен аккаунтов, открытая регистрация (B14) и разрешённые IP-адреса входа.
// Все действия пишутся сразу (inline-редактирование, без общей кнопки «Сохранить»).
export function DomainAccessCard({ isMobile, initialDomain, initialOpenRegistration, initialIpList }) {
  const [domain, setDomain] = useState(initialDomain)
  const [openRegistration, setOpenRegistration] = useState(initialOpenRegistration)
  const [openRegSaving, setOpenRegSaving] = useState(false)
  const [ipList, setIpList] = useState(initialIpList) // сохранённые [{ ip, note }]
  const [addingIp, setAddingIp] = useState(false)
  const [ipDraft, setIpDraft] = useState({ ip: '', note: '' })
  const [editingIp, setEditingIp] = useState(null) // индекс редактируемой строки или null
  const [editDraft, setEditDraft] = useState({ ip: '', note: '' })
  const [ipBusy, setIpBusy] = useState(false)
  const [ipError, setIpError] = useState(null)

  const saveDomain = async (val) => {
    try {
      const u = await updateCompanySettings({ domain: val })
      setDomain(u.domain || '')
    } catch (err) {
      return fieldError(err)
    }
  }

  const toggleOpenRegistration = async (val) => {
    setOpenRegSaving(true)
    // Оптимистично — checkbox сразу отражает выбор, при ошибке откатываем.
    setOpenRegistration(val)
    try {
      const u = await updateCompanySettings({ open_registration: val })
      setOpenRegistration(u.open_registration !== false)
    } catch {
      setOpenRegistration(!val)
    } finally {
      setOpenRegSaving(false)
    }
  }

  const applyAddIp = async () => {
    const entry = { ip: ipDraft.ip.trim(), note: ipDraft.note.trim() }
    if (!entry.ip) {
      setIpError('Укажите IP-адрес.')
      return
    }
    setIpBusy(true)
    setIpError(null)
    try {
      const u = await updateCompanySettings({ ip_allowlist: [...ipList, entry] })
      setIpList(normalizeIps(u.ip_allowlist))
      setAddingIp(false)
    } catch (err) {
      setIpError(fieldError(err))
    } finally {
      setIpBusy(false)
    }
  }

  const startEditIp = (i) => {
    setIpError(null)
    setAddingIp(false)
    setEditDraft({ ...ipList[i] })
    setEditingIp(i)
  }

  const applyEditIp = async () => {
    const entry = { ip: editDraft.ip.trim(), note: editDraft.note.trim() }
    if (!entry.ip) {
      setIpError('Укажите IP-адрес.')
      return
    }
    setIpBusy(true)
    setIpError(null)
    try {
      const next = ipList.map((row, idx) => (idx === editingIp ? entry : row))
      const u = await updateCompanySettings({ ip_allowlist: next })
      setIpList(normalizeIps(u.ip_allowlist))
      setEditingIp(null)
    } catch (err) {
      setIpError(fieldError(err))
    } finally {
      setIpBusy(false)
    }
  }

  const deleteIp = async (i) => {
    setIpBusy(true)
    setIpError(null)
    try {
      const u = await updateCompanySettings({ ip_allowlist: ipList.filter((_, idx) => idx !== i) })
      setIpList(normalizeIps(u.ip_allowlist))
    } catch (err) {
      setIpError(fieldError(err))
    } finally {
      setIpBusy(false)
    }
  }

  return (
    <Card style={{ flex: 1, minWidth: 0 }}>
      <div style={{ ...sectionTitle, marginBottom: 14 }}>Домен и ограничения входа</div>

      <InlineField label="Домен аккаунтов в системе" value={domain} onSave={saveDomain} onClear={() => saveDomain('')} />

      {/* B14: открытая регистрация */}
      <div style={{ marginTop: 20 }}>
        <Checkbox
          label="Открытая регистрация"
          checked={openRegistration}
          disabled={openRegSaving}
          onChange={toggleOpenRegistration}
        />
        <div style={{ fontSize: 12, color: 'var(--color-text-placeholder)', marginTop: 2, marginLeft: 30 }}>
          Если функция включена — пользователи могут регистрироваться в системе самостоятельно, с учётом настройки по домену аккаунтов.
        </div>
      </div>

      <div style={{ ...sectionTitle, marginTop: 20, marginBottom: 6, fontSize: 13 }}>Разрешённые IP-адреса</div>
      <div style={{ fontSize: 12, color: 'var(--color-text-placeholder)', marginBottom: 12 }}>
        Пока список пуст — вход по IP не ограничивается.
      </div>
      {ipError ? (
        <div style={{ marginBottom: 12 }}>
          <Banner variant="error">{ipError}</Banner>
        </div>
      ) : null}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {ipList.map((row, i) =>
          editingIp === i ? (
            <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'flex-end', flexDirection: isMobile ? 'column' : 'row' }}>
              <div style={{ width: FIELD_W }}>
                <Input label="IP или подсеть" placeholder="203.0.113.0/24" value={editDraft.ip} onChange={(e) => setEditDraft({ ...editDraft, ip: e.target.value })} autoFocus style={{ fontFamily: 'var(--font-mono)' }} />
              </div>
              <div style={{ width: FIELD_W }}>
                <Input label="Примечание" placeholder="Офис, VPN…" value={editDraft.note} onChange={(e) => setEditDraft({ ...editDraft, note: e.target.value })} />
              </div>
              <div style={{ display: 'flex', gap: 6, flex: 'none', alignSelf: isMobile ? 'flex-end' : 'auto' }}>
                <IconBtn outlined kind="apply" title="Применить" onClick={applyEditIp} disabled={ipBusy} />
                <IconBtn outlined kind="cancel" title="Отменить" onClick={() => { setEditingIp(null); setIpError(null) }} disabled={ipBusy} />
              </div>
            </div>
          ) : (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
              <div style={{ maxWidth: FIELD_W, minWidth: 0 }}>
                <FieldView label={row.note || 'IP-адрес'} value={row.ip} mono />
              </div>
              <IconBtn outlined size={36} kind="edit" title="Редактировать" onClick={() => startEditIp(i)} disabled={ipBusy} />
              <IconBtn outlined size={36} kind="delete" title="Удалить" onClick={() => deleteIp(i)} disabled={ipBusy} />
            </div>
          ),
        )}

        {addingIp ? (
          <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', flexDirection: isMobile ? 'column' : 'row' }}>
            <div style={{ width: FIELD_W }}>
              <Input label="IP или подсеть" placeholder="203.0.113.0/24" value={ipDraft.ip} onChange={(e) => setIpDraft({ ...ipDraft, ip: e.target.value })} autoFocus style={{ fontFamily: 'var(--font-mono)' }} />
            </div>
            <div style={{ width: FIELD_W }}>
              <Input label="Примечание" placeholder="Офис, VPN…" value={ipDraft.note} onChange={(e) => setIpDraft({ ...ipDraft, note: e.target.value })} />
            </div>
            <div style={{ display: 'flex', gap: 6, flex: 'none', alignSelf: isMobile ? 'flex-end' : 'auto' }}>
              <IconBtn outlined kind="apply" title="Применить" onClick={applyAddIp} disabled={ipBusy} />
              <IconBtn outlined kind="cancel" title="Отменить" onClick={() => { setAddingIp(false); setIpError(null) }} disabled={ipBusy} />
            </div>
          </div>
        ) : (
          <div>
            <Button type="button" variant="secondary" onClick={() => { setIpDraft({ ip: '', note: '' }); setIpError(null); setEditingIp(null); setAddingIp(true) }}>
              <Icon name="plus" size={18} strokeWidth={2.2} />
              Добавить IP
            </Button>
          </div>
        )}
      </div>
    </Card>
  )
}

import { useState } from 'react'
import { Banner, Button, Icon, Input } from '../../shared/ui'
import { FieldView, fieldError, FIELD_W, IconBtn } from './inlineFields.jsx'

const normalizeIps = (list) => (list || []).map((e) => ({ ip: e.ip || '', note: e.note || '' }))

// B9. Переиспользуемый inline-редактор списка IP/подсетей ({ip, note}) —
// добавление/правка/удаление, каждое действие сразу сохраняется через onSave.
// Используется для отдельного admin-allowlist (Настройки → Системные, доступ к
// админ-панели). Логика/вид повторяют редактор allowlist входа в SystemTab.
export function IpAllowlistEditor({ entries, onSave, isMobile, disabled, addLabel = 'Добавить IP' }) {
  const list = normalizeIps(entries)
  const [addingIp, setAddingIp] = useState(false)
  const [ipDraft, setIpDraft] = useState({ ip: '', note: '' })
  const [editingIp, setEditingIp] = useState(null)
  const [editDraft, setEditDraft] = useState({ ip: '', note: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const persist = async (next) => {
    setBusy(true)
    setError(null)
    try {
      await onSave(next)
      setAddingIp(false)
      setEditingIp(null)
    } catch (err) {
      setError(fieldError(err))
    } finally {
      setBusy(false)
    }
  }

  const applyAdd = () => {
    const entry = { ip: ipDraft.ip.trim(), note: ipDraft.note.trim() }
    if (!entry.ip) return setError('Укажите IP-адрес.')
    persist([...list, entry])
  }
  const applyEdit = () => {
    const entry = { ip: editDraft.ip.trim(), note: editDraft.note.trim() }
    if (!entry.ip) return setError('Укажите IP-адрес.')
    persist(list.map((row, idx) => (idx === editingIp ? entry : row)))
  }
  const remove = (i) => persist(list.filter((_, idx) => idx !== i))

  return (
    <div>
      {error ? (
        <div style={{ marginBottom: 12 }}>
          <Banner variant="error">{error}</Banner>
        </div>
      ) : null}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {list.map((row, i) =>
          editingIp === i ? (
            <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'flex-end', flexDirection: isMobile ? 'column' : 'row' }}>
              <div style={{ width: FIELD_W }}>
                <Input label="IP или подсеть" placeholder="203.0.113.0/24" value={editDraft.ip} onChange={(e) => setEditDraft({ ...editDraft, ip: e.target.value })} autoFocus style={{ fontFamily: 'var(--font-mono)' }} />
              </div>
              <div style={{ width: FIELD_W }}>
                <Input label="Примечание" placeholder="Офис, VPN…" value={editDraft.note} onChange={(e) => setEditDraft({ ...editDraft, note: e.target.value })} />
              </div>
              <div style={{ display: 'flex', gap: 6, flex: 'none', alignSelf: isMobile ? 'flex-end' : 'auto' }}>
                <IconBtn outlined kind="apply" title="Применить" onClick={applyEdit} disabled={busy} />
                <IconBtn outlined kind="cancel" title="Отменить" onClick={() => { setEditingIp(null); setError(null) }} disabled={busy} />
              </div>
            </div>
          ) : (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
              <div style={{ maxWidth: FIELD_W, minWidth: 0 }}>
                <FieldView label={row.note || 'IP-адрес'} value={row.ip} mono />
              </div>
              <IconBtn outlined size={36} kind="edit" title="Редактировать" onClick={() => { setError(null); setAddingIp(false); setEditDraft({ ...list[i] }); setEditingIp(i) }} disabled={busy || disabled} />
              <IconBtn outlined size={36} kind="delete" title="Удалить" onClick={() => remove(i)} disabled={busy || disabled} />
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
              <IconBtn outlined kind="apply" title="Применить" onClick={applyAdd} disabled={busy} />
              <IconBtn outlined kind="cancel" title="Отменить" onClick={() => { setAddingIp(false); setError(null) }} disabled={busy} />
            </div>
          </div>
        ) : (
          <div>
            <Button type="button" variant="secondary" disabled={disabled} onClick={() => { setIpDraft({ ip: '', note: '' }); setError(null); setEditingIp(null); setAddingIp(true) }}>
              <Icon name="plus" size={18} strokeWidth={2.2} />
              {addLabel}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

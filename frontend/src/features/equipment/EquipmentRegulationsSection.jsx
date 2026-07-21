import { useState } from 'react'
import { ActionMenu, Badge, Button, ConfirmModal, Icon, InlineCalendar, Modal } from '../../shared/ui'
import { regulationPeriodLabel } from '../types/TypesEditorPage.jsx'
import {
  archiveEquipmentRegulation,
  createEquipmentRegulation,
  restoreEquipmentRegulation,
  setRegulationCancelled,
  setRegulationDate,
  updateEquipmentRegulation,
} from './equipmentApi.js'
import { RegulationFormModal } from './RegulationFormModal.jsx'
import { planStatusIcon } from './statusLabels.js'

function todayISO() {
  const t = new Date()
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
}
function formatShortDate(iso) {
  return iso ? new Date(iso).toLocaleDateString('ru-RU') : '—'
}

// B13+. Сворачиваемый раздел «Регламенты ТО» на карточке оборудования (перед
// историей). Показывает регламенты типа + индивидуальные с их планом; для
// управляющих ТО — действия: задать дату первого ТО, отменить/вернуть регламент
// для этого оборудования, добавить/изменить/архивировать индивидуальный.
export function EquipmentRegulationsSection({ equipment, regulations, canManage, onChanged }) {
  const [open, setOpen] = useState(false)
  const [dateTarget, setDateTarget] = useState(null) // регламент, которому задаём дату
  const [dateValue, setDateValue] = useState('')
  const [regModal, setRegModal] = useState(null) // null | 'new' | individual regulation
  const [confirm, setConfirm] = useState(null)
  const [busy, setBusy] = useState(false)

  const reload = () => onChanged?.()
  const eqId = equipment.id
  const writtenOff = equipment.is_written_off

  const openDate = (reg) => {
    setDateTarget(reg)
    setDateValue('')
  }
  const saveDate = async () => {
    setBusy(true)
    try {
      await setRegulationDate(eqId, dateTarget.id, dateValue)
      setDateTarget(null)
      reload()
    } finally {
      setBusy(false)
    }
  }

  const rowActions = (reg) => {
    if (!canManage || writtenOff) return null
    const cancelled = reg.plan?.is_cancelled
    // Отменённый/архивный — только возврат (кнопка 44×44, без меню «…»).
    if (reg.is_archived || cancelled) {
      return (
        <button type="button" title="Вернуть из архива" onClick={() => restore(reg)} style={returnBtn}>
          <Icon name="undo-2" size={18} strokeWidth={2} />
        </button>
      )
    }
    const items = []
    if (!reg.on_demand && !reg.plan?.next_planned_date) {
      items.push({ label: 'Задать дату ТО', onClick: () => openDate(reg) })
    }
    if (reg.scope === 'individual') {
      items.push({ label: 'Изменить', onClick: () => setRegModal(reg) })
      items.push({ label: 'Отменить', danger: true, onClick: () => askCancel(reg, true) })
    } else {
      items.push({ label: 'Отменить для оборудования', danger: true, onClick: () => askCancel(reg, false) })
    }
    return <ActionMenu items={items} />
  }

  const restore = async (reg) => {
    if (reg.scope === 'individual' && reg.is_archived) {
      await restoreEquipmentRegulation(eqId, reg.id)
    } else {
      await setRegulationCancelled(eqId, reg.id, false)
    }
    reload()
  }

  const askCancel = (reg, isIndividualArchive) => {
    setConfirm({
      title: isIndividualArchive ? 'Отменить регламент?' : 'Отменить регламент для оборудования?',
      message: isIndividualArchive
        ? `Индивидуальный регламент «${reg.name}» будет отменён (в архив). Контроль и проведение ТО по нему станут недоступны; вернуть можно позже.`
        : `Регламент «${reg.name}» перестанет контролироваться для этого оборудования, плановая дата обнулится. Вернуть можно позже.`,
      confirmLabel: 'Отменить',
      onConfirm: async () => {
        if (isIndividualArchive) {
          await archiveEquipmentRegulation(eqId, reg.id)
        } else {
          await setRegulationCancelled(eqId, reg.id, true)
        }
        setConfirm(null)
        reload()
      },
    })
  }

  const count = regulations?.length ?? 0

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: 12, padding: 0, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', color: 'inherit' }}
      >
        <span style={{ fontSize: 16, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
          Регламенты ТО
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', background: 'var(--color-fill-active-tint)', padding: '2px 9px', borderRadius: 20 }}>{count}</span>
        </span>
        <Icon name="chevron-right" size={18} strokeWidth={2} style={{ color: 'var(--color-text-muted)', transition: 'transform .15s ease', transform: open ? 'rotate(90deg)' : 'none' }} />
      </button>

      {open ? (
        regulations === null ? (
          <div style={{ fontSize: 13.5, color: 'var(--color-text-muted)', marginTop: 12 }}>Загрузка…</div>
        ) : (
          <div style={{ marginTop: 12 }}>
            {/* Кнопка добавления — над списком. */}
            {canManage && !writtenOff ? (
              <Button variant="secondary" fullWidth style={{ marginBottom: count === 0 ? 0 : 12 }} onClick={() => setRegModal('new')}>
                <Icon name="plus" size={18} strokeWidth={2.2} />
                Индивидуальный регламент
              </Button>
            ) : null}
            {count === 0 ? (
              <div style={{ fontSize: 13.5, color: 'var(--color-text-muted)', marginTop: 12 }}>
                Для этого оборудования нет регламентов ТО.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {/* Сортировка: сначала индивидуальные, затем типовые («общие»). */}
                {[...regulations]
                  .sort((a, b) => (a.scope === 'individual' ? 0 : 1) - (b.scope === 'individual' ? 0 : 1))
                  .map((reg) => {
                    const inactive = reg.is_archived || reg.plan?.is_cancelled
                    const ic = inactive
                      ? { icon: 'wrench', color: 'var(--color-text-placeholder)', title: '' }
                      : reg.on_demand
                        ? { icon: 'wrench', color: 'var(--color-text-muted)', title: 'По потребности' }
                        : planStatusIcon(reg.status)
                    return (
                      <div key={reg.id} style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--color-fill-input)', borderRadius: 10, padding: '10px 12px' }}>
                        {/* Содержимое приглушается у отменённых; кнопка действия — нет. */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0, opacity: inactive ? 0.55 : 1 }}>
                          <span style={{ flex: 'none', width: 20, display: 'flex', justifyContent: 'center', color: ic.color }} title={ic.title || ''}>
                            <Icon name={ic.icon} size={17} strokeWidth={2} />
                          </span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            {/* Плашки — перед названием; название обрезается до 2 строк. */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 3 }}>
                              <Badge>{reg.scope === 'individual' ? 'Индивидуальный' : 'Общий'}</Badge>
                              {reg.is_archived ? <Badge>В архиве</Badge> : reg.plan?.is_cancelled ? <Badge>Отменён</Badge> : null}
                            </div>
                            <div className="ele-clamp-2" style={{ fontSize: 13.5, fontWeight: 600 }}>{reg.name}</div>
                            <div style={{ fontSize: 12, color: 'var(--color-text-placeholder)', marginTop: 1 }}>
                              {regulationPeriodLabel(reg)}
                              {!reg.on_demand ? ` · ${reg.plan?.next_planned_date ? `план: ${formatShortDate(reg.plan.next_planned_date)}` : 'дата не задана'}` : ''}
                            </div>
                          </div>
                        </div>
                        {rowActions(reg)}
                      </div>
                    )
                  })}
              </div>
            )}
          </div>
        )
      ) : null}

      {dateTarget ? (
        <Modal open onClose={() => setDateTarget(null)} title="Дата ближайшего ТО">
          <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 14 }}>{dateTarget.name}</div>
          <InlineCalendar value={dateValue} onChange={setDateValue} minDate={todayISO()} />
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <Button variant="secondary" fullWidth onClick={() => setDateTarget(null)}>Отмена</Button>
            <Button fullWidth loading={busy} disabled={!dateValue} onClick={saveDate}>Сохранить</Button>
          </div>
        </Modal>
      ) : null}

      {regModal ? (
        <RegulationFormModal
          regulation={regModal === 'new' ? null : regModal}
          showFirstDate={regModal === 'new'}
          title={regModal === 'new' ? 'Индивидуальный регламент' : 'Редактирование регламента'}
          onClose={() => setRegModal(null)}
          onSave={async (payload) => {
            if (regModal === 'new') {
              await createEquipmentRegulation(eqId, payload)
            } else {
              await updateEquipmentRegulation(eqId, regModal.id, payload)
            }
            setRegModal(null)
            reload()
          }}
        />
      ) : null}

      {confirm ? (
        <ConfirmModal
          title={confirm.title}
          message={confirm.message}
          confirmLabel={confirm.confirmLabel}
          onConfirm={confirm.onConfirm}
          onClose={() => setConfirm(null)}
        />
      ) : null}
    </div>
  )
}

const returnBtn = {
  width: 44, height: 44, flex: 'none', borderRadius: 10, background: 'var(--color-surface)', border: 'none',
  color: 'var(--color-text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
}

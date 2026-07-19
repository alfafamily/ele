import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { apiPatch } from '../../shared/api/client'
import { Can, usePermissions } from '../../app/usePermissions.js'
import { FieldValueDisplay } from '../../shared/eav'
import { EmployeePicker } from '../../shared/EmployeePicker.jsx'
import { nameInitials } from '../../shared/employeeName.js'
import { HistoryList } from '../../shared/HistoryList.jsx'
import { ActionMenu, BackButton, Button, Card, ConfirmModal, Icon, Spinner } from '../../shared/ui'
import { AttachLicenseModal } from './AttachLicenseModal.jsx'
import { InlineMaskedKey } from '../licenses/MaskedKeyField.jsx'
import {
  addUnits,
  assignEmployee,
  assignUnits,
  getEquipment,
  getEquipmentHistoryPath,
  unassignEmployee,
  unassignUnits,
  writeOffUnits,
} from './equipmentApi.js'
import { EQUIPMENT_STATUS_LABEL } from './statusLabels.js'
import { QuantityMoveModal } from './QuantityMoveModal.jsx'
import { WriteOffModal } from './WriteOffModal.jsx'

export function EquipmentCardPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const perms = usePermissions()
  const [equipment, setEquipment] = useState(null)
  const [loadError, setLoadError] = useState(false)
  const [showWriteOff, setShowWriteOff] = useState(false)
  const [showAssignPicker, setShowAssignPicker] = useState(false)
  const [showAttachLicense, setShowAttachLicense] = useState(false)
  // Движение количественной карточки: { kind, ...props для QuantityMoveModal }.
  const [moveModal, setMoveModal] = useState(null)
  // Счётчик перезагрузок — растёт при каждом load(), сигналит истории обновиться.
  const [historyKey, setHistoryKey] = useState(0)
  // Подтверждение открепления/отвязки: { title, message, confirmLabel, onConfirm }.
  const [confirm, setConfirm] = useState(null)

  const load = useCallback(() => {
    setLoadError(false)
    getEquipment(id)
      .then((data) => {
        setEquipment(data)
        setHistoryKey((k) => k + 1)
      })
      .catch(() => setLoadError(true))
  }, [id])

  useEffect(load, [load])

  if (loadError) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: 60, textAlign: 'center' }}>
        <div style={{ fontSize: 16, fontWeight: 600 }}>Не удалось открыть оборудование</div>
        <div style={{ fontSize: 14, color: 'var(--color-text-muted)' }}>Объект не найден или недоступен.</div>
        <Link to="/">
          <Button variant="secondary">К списку оборудования</Button>
        </Link>
      </div>
    )
  }

  if (!equipment) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
        <Spinner />
      </div>
    )
  }

  const isQuantity = equipment.accounting_type === 'quantity'

  const onAssign = async (employee) => {
    await assignEmployee(equipment.id, employee.id)
    setShowAssignPicker(false)
    load()
  }
  const onUnassign = async () => {
    await unassignEmployee(equipment.id)
    load()
  }
  const onDetachLicense = async (licenseId) => {
    await apiPatch(`/api/licenses/${licenseId}/`, { equipment: null })
    load()
  }

  const closeMove = () => {
    setMoveModal(null)
    load()
  }

  return (
    <div>
      {/* Хлебные крошки — только desktop: на мобильных вложенности глубже двух
          уровней нет, назад решает кнопка «Назад». */}
      <div className="ele-only-desktop" style={{ fontSize: 13, color: 'var(--color-text-placeholder)', marginBottom: 10 }}>
        <Link to="/" style={{ color: 'var(--color-text-muted)' }}>
          Оборудование
        </Link>{' '}
        / {equipment.type_and_model}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
          <BackButton />
          <h1 className="ele-card-title">{equipment.type_and_model}</h1>
        </div>
        {!equipment.is_written_off && perms.canManageEquipment ? (
          <>
            <div className="ele-card-actions-desktop">
              <Button variant="danger" onClick={() => setShowWriteOff(true)}>
                Списать
              </Button>
              <Link to={`/equipment/${equipment.id}/edit`}>
                <Button>Редактировать</Button>
              </Link>
            </div>
            <div className="ele-card-actions-mobile">
              <ActionMenu
                items={[
                  { label: 'Редактировать', onClick: () => navigate(`/equipment/${equipment.id}/edit`) },
                  { label: 'Списать', danger: true, onClick: () => setShowWriteOff(true) },
                ]}
              />
            </div>
          </>
        ) : null}
      </div>

      <div className={'ele-obj-layout' + (equipment.is_written_off ? ' ele-obj-layout--no-side' : '')}>
        <div className="ele-obj-layout__main">
          <Card>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Основная информация</div>
            <div className="ele-field-grid">
              {/* У количественных карточек учётного номера нет. */}
              {isQuantity ? null : <Field label="Учётный номер" value={equipment.inventory_number} mono />}
              <Field label="Тип оборудования" value={equipment.equipment_type_name} />
              {isQuantity ? (
                equipment.is_written_off ? <Field label="Статус" value="Списано" /> : null
              ) : (
                <Field label="Статус" value={equipment.is_written_off ? 'Списано' : EQUIPMENT_STATUS_LABEL[equipment.status]} />
              )}
            </div>
          </Card>

          {(() => {
            // Файловые реквизиты выносим в отдельный блок «Файлы» под параметрами.
            const paramValues = equipment.field_values.filter((fv) => fv.value_type !== 'file')
            const fileValues = equipment.field_values.filter((fv) => fv.value_type === 'file')
            return (
              <>
                <Card>
                  <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Параметры оборудования</div>
                  {paramValues.length === 0 ? (
                    <div style={{ fontSize: 13.5, color: 'var(--color-text-muted)' }}>У этого Типа нет реквизитов.</div>
                  ) : (
                    <div className="ele-field-grid">
                      {paramValues.map((fv) => (
                        <FieldValueDisplay key={fv.field} fv={fv} />
                      ))}
                    </div>
                  )}
                </Card>

                {fileValues.length > 0 ? (
                  <Card>
                    <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Файлы</div>
                    <div className="ele-field-grid">
                      {fileValues.map((fv) => (
                        <FieldValueDisplay key={fv.field} fv={fv} />
                      ))}
                    </div>
                  </Card>
                ) : null}
              </>
            )
          })()}

          <Card>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Дополнительные поля</div>
            {equipment.custom_fields.length === 0 ? (
              <div style={{ fontSize: 13.5, color: 'var(--color-text-muted)' }}>Дополнительных полей нет.</div>
            ) : (
              <div className="ele-field-grid">
                {equipment.custom_fields.map((cf) => (
                  <Field key={cf.id} label={cf.name} value={cf.value} />
                ))}
              </div>
            )}
          </Card>

        </div>

        {/* Боковой блок: «Закреплено за» + «Установленные лицензии». У списанного
            оборудования всегда пуст — не показываем (одна колонка). */}
        {!equipment.is_written_off && isQuantity ? (
          <div className="ele-obj-layout__side ele-card-sticky" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Card>
              <QuantityStock
                equipment={equipment}
                canManage={perms.canManageEquipment}
                setMoveModal={setMoveModal}
                closeMove={closeMove}
              />
            </Card>
            <Card>
              <QuantityAssignments
                equipment={equipment}
                canManage={perms.canManageEquipment}
                setMoveModal={setMoveModal}
                closeMove={closeMove}
              />
            </Card>
          </div>
        ) : null}
        {!equipment.is_written_off && !isQuantity ? (
        <Card className="ele-obj-layout__side ele-card-sticky">
          <>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Закреплено за</div>
          {equipment.employee ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ width: 46, height: 46, flex: 'none', borderRadius: '50%', background: 'var(--color-fill-active-tint)', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 600, overflow: 'hidden' }}>
                  {equipment.employee_avatar ? (
                    <img src={equipment.employee_avatar.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    nameInitials(equipment.employee_name)
                  )}
                </span>
                <div style={{ minWidth: 0 }}>
                  <Link className="ele-clamp-2" to={`/employees/${equipment.employee}`} style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)' }}>
                    {equipment.employee_name}
                  </Link>
                  <div style={{ fontSize: 13, color: 'var(--color-text-placeholder)' }}>{equipment.department || '—'}</div>
                </div>
              </div>
              {!equipment.is_written_off ? (
                <Can perm="canManageEquipment">
                  <Button
                    variant="secondary"
                    fullWidth
                    style={{ marginTop: 14 }}
                    onClick={() =>
                      setConfirm({
                        title: 'Открепить сотрудника?',
                        message: `«${equipment.type_and_model}» больше не будет закреплено за ${equipment.employee_name}.`,
                        confirmLabel: 'Открепить',
                        onConfirm: onUnassign,
                      })
                    }
                  >
                    Открепить
                  </Button>
                </Can>
              ) : null}
            </>
          ) : showAssignPicker && !equipment.is_written_off ? (
            <EmployeePicker autoFocus onSelect={onAssign} />
          ) : (
            <>
              <div style={{ fontSize: 15, color: 'var(--color-text-placeholder)' }}>Не закреплено</div>
              {!equipment.is_written_off ? (
                <Can perm="canManageEquipment">
                  <Button fullWidth style={{ marginTop: 14 }} onClick={() => setShowAssignPicker(true)}>
                    <Icon name="plus" size={18} strokeWidth={2.2} />
                    Закрепить сотрудника
                  </Button>
                </Can>
              ) : null}
            </>
          )}

          <div style={{ borderTop: '1px solid var(--color-border-hairline)', margin: '20px 0 16px' }} />

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontSize: 16, fontWeight: 600 }}>Установленные лицензии</div>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', background: 'var(--color-fill-active-tint)', padding: '2px 9px', borderRadius: 20 }}>
              {equipment.licenses?.length ?? 0}
            </span>
          </div>
          {(equipment.licenses || []).map((lic) => (
            <div key={lic.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: 'var(--color-fill-input)', borderRadius: 10, marginBottom: 8 }}>
              {perms.canManageLicenses ? (
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Link to={`/licenses/${lic.id}`}>
                    <div className="ele-clamp-2" style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--color-text-primary)' }}>{lic.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--color-text-placeholder)' }}>{lic.license_type_name}</div>
                  </Link>
                  {lic.key ? <div style={{ marginTop: 4 }}><InlineMaskedKey value={lic.key} /></div> : null}
                </div>
              ) : (
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="ele-clamp-2" style={{ fontSize: 13.5, fontWeight: 600 }}>{lic.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-placeholder)' }}>{lic.license_type_name}</div>
                </div>
              )}
              {!equipment.is_written_off ? (
                <Can perm="canManageLicenses">
                  <button
                    type="button"
                    title="Отвязать"
                    onClick={() =>
                      setConfirm({
                        title: 'Отвязать лицензию?',
                        message: `Лицензия «${lic.name}» будет отвязана от «${equipment.type_and_model}».`,
                        confirmLabel: 'Отвязать',
                        onConfirm: () => onDetachLicense(lic.id),
                      })
                    }
                    style={{ width: 30, height: 30, flex: 'none', borderRadius: 8, background: '#fff', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Icon name="x" size={16} strokeWidth={2} />
                  </button>
                </Can>
              ) : null}
            </div>
          ))}
          {!equipment.is_written_off ? (
            <Can perm="canManageLicenses">
              <Button variant="secondary" fullWidth onClick={() => setShowAttachLicense(true)}>
                <Icon name="plus" size={18} strokeWidth={2.2} />
                Привязать лицензию
              </Button>
            </Can>
          ) : null}
          </>
        </Card>
        ) : null}

        <Card className="ele-obj-layout__history">
          <HistoryList path={getEquipmentHistoryPath(equipment.id)} reloadKey={historyKey} />
        </Card>
      </div>

      {confirm ? (
        <ConfirmModal
          title={confirm.title}
          message={confirm.message}
          confirmLabel={confirm.confirmLabel}
          onConfirm={confirm.onConfirm}
          onClose={() => setConfirm(null)}
        />
      ) : null}

      {showWriteOff ? (
        <WriteOffModal
          equipment={equipment}
          onClose={() => setShowWriteOff(false)}
          onDone={() => {
            setShowWriteOff(false)
            load()
          }}
        />
      ) : null}
      {showAttachLicense ? (
        <AttachLicenseModal
          equipment={equipment}
          onClose={() => setShowAttachLicense(false)}
          onAttached={() => {
            setShowAttachLicense(false)
            load()
          }}
        />
      ) : null}

      {moveModal ? (
        <QuantityMoveModal
          title={moveModal.title}
          confirmLabel={moveModal.confirmLabel}
          mode={moveModal.mode}
          fixedEmployee={moveModal.fixedEmployee}
          max={moveModal.max}
          onSubmit={moveModal.onSubmit}
          onClose={() => setMoveModal(null)}
        />
      ) : null}
    </div>
  )
}

function Field({ label, value, mono, muted }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 12, color: 'var(--color-text-placeholder)', marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 500, fontFamily: mono ? 'var(--font-mono)' : 'inherit', color: muted ? 'var(--color-text-muted)' : 'inherit', overflowWrap: 'break-word' }}>
        {value || '—'}
      </div>
    </div>
  )
}

// Боковой блок «Остаток» для количественной карточки: метрики
// Остаток/Свободно/Закреплено и операции прихода/списания единиц.
function QuantityStock({ equipment, canManage, setMoveModal, closeMove }) {
  const openAdd = () =>
    setMoveModal({
      title: 'Оприходовать',
      confirmLabel: 'Оприходовать',
      onSubmit: (qty, comment) => addUnits(equipment.id, qty, comment).then(closeMove),
    })

  const openWriteOff = () =>
    setMoveModal({
      title: 'Списать единицы',
      confirmLabel: 'Списать',
      max: equipment.free,
      onSubmit: (qty, comment) => writeOffUnits(equipment.id, qty, comment).then(closeMove),
    })

  return (
    <>
      <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 14 }}>Остаток</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <Metric label="Остаток" value={equipment.quantity} />
        <Metric label="Свободно" value={equipment.free} />
        <Metric label="Закреплено" value={equipment.allocated} />
      </div>
      {canManage ? (
        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <Button fullWidth onClick={openAdd} aria-label="Оприходовать">
            <Icon name="plus" size={18} strokeWidth={2.2} />
            <span className="ele-only-desktop">Оприходовать</span>
          </Button>
          <Button variant="secondary" fullWidth onClick={openWriteOff} disabled={equipment.free <= 0} aria-label="Списать">
            <Icon name="minus" size={18} strokeWidth={2.2} />
            <span className="ele-only-desktop">Списать</span>
          </Button>
        </div>
      ) : null}
    </>
  )
}

function Metric({ label, value }) {
  return (
    <div style={{ flex: 1, minWidth: 0, background: 'var(--color-fill-input)', borderRadius: 10, padding: '10px 12px', textAlign: 'center' }}>
      <div style={{ fontSize: 20, fontWeight: 600, lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 11.5, color: 'var(--color-text-placeholder)', marginTop: 4 }}>{label}</div>
    </div>
  )
}

// Боковой блок «Закреплено за» для количественной карточки: список закреплений
// (сотрудник + количество + открепить) и кнопка «Закрепить».
function QuantityAssignments({ equipment, canManage, setMoveModal, closeMove }) {
  const allocations = equipment.allocations || []

  const openAssign = () =>
    setMoveModal({
      title: 'Закрепить',
      confirmLabel: 'Закрепить',
      mode: 'assign',
      max: equipment.free,
      onSubmit: (qty, comment, employeeId) => assignUnits(equipment.id, employeeId, qty, comment).then(closeMove),
    })

  const openUnassign = (alloc) =>
    setMoveModal({
      title: 'Открепить',
      confirmLabel: 'Открепить',
      mode: 'fixed-employee',
      fixedEmployee: { id: alloc.employee, name: alloc.employee_name },
      max: alloc.quantity,
      onSubmit: (qty, comment, employeeId) => unassignUnits(equipment.id, employeeId, qty, comment).then(closeMove),
    })

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ fontSize: 16, fontWeight: 600 }}>Закреплено за</div>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', background: 'var(--color-fill-active-tint)', padding: '2px 9px', borderRadius: 20 }}>
          {equipment.allocated} / {equipment.quantity}
        </span>
      </div>

      {allocations.length === 0 ? (
        <div style={{ fontSize: 15, color: 'var(--color-text-placeholder)' }}>Не закреплено</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {allocations.map((a) => (
            <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'var(--color-fill-input)', borderRadius: 10 }}>
              <span style={{ width: 36, height: 36, flex: 'none', borderRadius: '50%', background: 'var(--color-fill-active-tint)', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 600, overflow: 'hidden' }}>
                {a.employee_avatar ? (
                  <img src={a.employee_avatar.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  nameInitials(a.employee_name)
                )}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <Link className="ele-clamp-2" to={`/employees/${a.employee}`} style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--color-text-primary)' }}>
                  {a.employee_name}
                </Link>
                <div style={{ fontSize: 12, color: 'var(--color-text-placeholder)' }}>{a.department || '—'} · {a.quantity} шт.</div>
              </div>
              {canManage ? (
                <button
                  type="button"
                  title="Открепить"
                  onClick={() => openUnassign(a)}
                  style={{ width: 30, height: 30, flex: 'none', borderRadius: 8, background: '#fff', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <Icon name="x" size={16} strokeWidth={2} />
                </button>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {canManage ? (
        <Button fullWidth style={{ marginTop: 14 }} onClick={openAssign} disabled={equipment.free <= 0}>
          <Icon name="plus" size={18} strokeWidth={2.2} />
          Закрепить
        </Button>
      ) : null}
    </>
  )
}

import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { apiPatch } from '../../shared/api/client'
import { Can, usePermissions } from '../../app/usePermissions.js'
import { FieldValueDisplay } from '../../shared/eav'
import { nameInitials } from '../../shared/employeeName.js'
import { HistoryList } from '../../shared/HistoryList.jsx'
import { ActionMenu, BackButton, Button, Card, ConfirmModal, Icon, Spinner } from '../../shared/ui'
import { AttachLicenseModal } from './AttachLicenseModal.jsx'
import { AttachSimModal } from './AttachSimModal.jsx'
import { DetachToStorageModal } from '../employees/DetachToStorageModal.jsx'
import { detachSimCard } from '../employees/employeesApi.js'
import { EquipmentPlacementModal } from './EquipmentPlacementModal.jsx'
import { InlineMaskedKey } from '../licenses/MaskedKeyField.jsx'
import { getEquipment, getEquipmentHistoryPath } from './equipmentApi.js'
import { EQUIPMENT_STATUS_LABEL } from './statusLabels.js'
import { WriteOffModal } from './WriteOffModal.jsx'

export function EquipmentCardPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const perms = usePermissions()
  const [equipment, setEquipment] = useState(null)
  const [loadError, setLoadError] = useState(false)
  const [showWriteOff, setShowWriteOff] = useState(false)
  const [showPlacement, setShowPlacement] = useState(false)
  const [showAttachLicense, setShowAttachLicense] = useState(false)
  const [showAttachSim, setShowAttachSim] = useState(false)
  const [detachSim, setDetachSim] = useState(null)
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

  const onDetachLicense = async (licenseId) => {
    await apiPatch(`/api/licenses/${licenseId}/`, { equipment: null })
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
              <Field label="Учётный номер" value={equipment.inventory_number} mono />
              <Field label="Тип оборудования" value={equipment.equipment_type_name} />
              <Field label="Статус" value={equipment.is_written_off ? 'Списано' : EQUIPMENT_STATUS_LABEL[equipment.status]} />
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
        {!equipment.is_written_off ? (
        <Card className="ele-obj-layout__side ele-card-sticky">
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Размещение</div>
          {equipment.employee ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ width: 46, height: 46, flex: 'none', borderRadius: '50%', background: 'var(--color-fill-active-tint)', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 600, overflow: 'hidden' }}>
                {equipment.employee_avatar ? (
                  <img src={equipment.employee_avatar.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  nameInitials(equipment.employee_name)
                )}
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-placeholder)' }}>За сотрудником</div>
                <Link className="ele-clamp-2" to={`/employees/${equipment.employee}`} style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)' }}>
                  {equipment.employee_name}
                </Link>
                <div style={{ fontSize: 13, color: 'var(--color-text-placeholder)' }}>{equipment.department || '—'}</div>
              </div>
            </div>
          ) : equipment.place_detail ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Icon
                  name={equipment.place_detail.place_type === 'storage' ? 'warehouse' : 'briefcase'}
                  size={20}
                  strokeWidth={2}
                  style={{ color: 'var(--color-text-muted)' }}
                />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: 'var(--color-text-placeholder)' }}>
                    {equipment.place_detail.place_type === 'storage' ? 'На складе' : 'На рабочем месте'}
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>{equipment.place_detail.name}</div>
                  <div style={{ fontSize: 13, color: 'var(--color-text-placeholder)' }}>
                    {equipment.place_detail.building_name} — {equipment.place_detail.room_name}
                  </div>
                </div>
              </div>
              {equipment.place_detail.employees?.length ? (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 12, color: 'var(--color-text-placeholder)', marginBottom: 6 }}>Сотрудники рабочего места</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {equipment.place_detail.employees.map((e) => (
                      <Link key={e.id} to={`/employees/${e.id}`} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, color: 'var(--color-text-primary)' }}>
                        <span style={{ width: 28, height: 28, flex: 'none', borderRadius: '50%', background: 'var(--color-fill-active-tint)', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600 }}>
                          {nameInitials(e.name)}
                        </span>
                        {e.name}
                      </Link>
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <div style={{ fontSize: 15, color: 'var(--color-text-placeholder)' }}>Не размещено</div>
          )}
          {!equipment.is_written_off ? (
            <Can perm="canManageEquipment">
              <Button
                variant={equipment.employee || equipment.place_detail ? 'secondary' : 'primary'}
                fullWidth
                style={{ marginTop: 14 }}
                onClick={() => setShowPlacement(true)}
              >
                {equipment.employee || equipment.place_detail ? 'Переместить' : (
                  <>
                    <Icon name="plus" size={18} strokeWidth={2.2} />
                    Разместить
                  </>
                )}
              </Button>
            </Can>
          ) : null}

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

          <div style={{ borderTop: '1px solid var(--color-border-hairline)', margin: '20px 0 16px' }} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontSize: 16, fontWeight: 600 }}>SIM-карты</div>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', background: 'var(--color-fill-active-tint)', padding: '2px 9px', borderRadius: 20 }}>
              {equipment.sim_cards?.length ?? 0}
            </span>
          </div>
          {(equipment.sim_cards || []).map((sim) => (
            <div key={sim.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: 'var(--color-fill-input)', borderRadius: 10, marginBottom: 8 }}>
              <Icon name="radio-tower" size={16} strokeWidth={2} style={{ color: 'var(--color-text-muted)', flex: 'none' }} />
              <Link to={`/sim-cards/${sim.id}`} style={{ flex: 1, minWidth: 0 }}>
                <div style={{ font: '600 13.5px var(--font-mono)', color: 'var(--color-text-primary)' }}>{sim.phone_number}</div>
                <div style={{ fontSize: 12, color: 'var(--color-text-placeholder)' }}>{sim.sim_type_display}</div>
              </Link>
              {!equipment.is_written_off ? (
                <Can perm="canManageEmployees">
                  <button
                    type="button"
                    title="Открепить"
                    onClick={() => setDetachSim(sim)}
                    style={{ width: 30, height: 30, flex: 'none', borderRadius: 8, background: '#fff', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Icon name="x" size={16} strokeWidth={2} />
                  </button>
                </Can>
              ) : null}
            </div>
          ))}
          {!equipment.is_written_off ? (
            <Can perm="canManageEmployees">
              <Button variant="secondary" fullWidth onClick={() => setShowAttachSim(true)}>
                <Icon name="plus" size={18} strokeWidth={2.2} />
                Установить SIM
              </Button>
            </Can>
          ) : null}
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
      {showPlacement ? (
        <EquipmentPlacementModal
          equipment={equipment}
          onClose={() => setShowPlacement(false)}
          onDone={() => {
            setShowPlacement(false)
            load()
          }}
        />
      ) : null}
      {showAttachSim ? (
        <AttachSimModal
          equipment={equipment}
          onClose={() => setShowAttachSim(false)}
          onAttached={() => {
            setShowAttachSim(false)
            load()
          }}
        />
      ) : null}
      {detachSim && detachSim.sim_type === 'esim' ? (
        <ConfirmModal
          title="Открепить SIM-карту?"
          message={`E-SIM ${detachSim.phone_number} будет откреплена от «${equipment.type_and_model}».`}
          confirmLabel="Открепить"
          onConfirm={async () => {
            await detachSimCard(detachSim.id)
            setDetachSim(null)
            load()
          }}
          onClose={() => setDetachSim(null)}
        />
      ) : detachSim ? (
        <DetachToStorageModal
          title="Открепить SIM-карту на склад"
          description={`SIM ${detachSim.phone_number} будет снята с оборудования и положена на склад.`}
          onConfirm={async (storagePlaceId) => {
            await detachSimCard(detachSim.id, storagePlaceId)
            setDetachSim(null)
            load()
          }}
          onClose={() => setDetachSim(null)}
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

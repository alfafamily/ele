import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { apiPatch } from '../../shared/api/client'
import { Can, usePermissions } from '../../app/usePermissions.js'
import { canMaintainType, historyMode } from '../../shared/permissions.js'
import { FieldValueDisplay } from '../../shared/eav'
import { TypeFilesView } from '../../shared/TypeFilesView.jsx'
import { AvatarCircle } from '../../shared/AvatarCircle.jsx'
import { LeadIconCircle } from '../../shared/LeadIconCircle.jsx'
import { Tooltip } from '../../shared/Tooltip.jsx'
import { PlacementRow } from '../../shared/PlacementRow.jsx'
import { HistoryList } from '../../shared/HistoryList.jsx'
import { ActionMenu, BackButton, Button, Card, ConfirmModal, Icon, Spinner } from '../../shared/ui'
import { AttachLicenseModal } from './AttachLicenseModal.jsx'
import { AttachSimModal } from './AttachSimModal.jsx'
import { DetachToStorageModal } from '../employees/DetachToStorageModal.jsx'
import { detachSimCard } from '../employees/employeesApi.js'
import { EquipmentPlacementModal } from './EquipmentPlacementModal.jsx'
import { InlineMaskedKey } from '../licenses/MaskedKeyField.jsx'
import { EquipmentRegulationsSection } from './EquipmentRegulationsSection.jsx'
import { getEquipment, getEquipmentHistoryPath, getEquipmentRegulations } from './equipmentApi.js'
import { planStatusIcon } from './statusLabels.js'
import { placementFullTitle } from '../../shared/placement.js'

// B45. Иконка по типу места на карточке размещения.
const PLACE_ICON = { storage: 'warehouse', workplace: 'monitor', common: 'coffee' }
import { WriteOffModal } from './WriteOffModal.jsx'

function formatShortDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('ru-RU')
}

export function EquipmentCardPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const perms = usePermissions()
  const hMode = historyMode(perms, 'equipment')
  const [equipment, setEquipment] = useState(null)
  const [regulations, setRegulations] = useState(null)
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
        // B13+: регламенты ТО — только если у типа включено ТО и объект не списан.
        if (data.type_maintenance_enabled && !data.is_written_off) {
          getEquipmentRegulations(id).then(setRegulations).catch(() => setRegulations([]))
        } else {
          setRegulations(null)
        }
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
              <Field label="Вид оборудования" value={equipment.equipment_type_name} />
            </div>
          </Card>

          {(() => {
            // Файловые реквизиты выносим в отдельный блок «Файлы» под параметрами.
            // B30: реквизиты показываем в порядке, заданном у Типа (field_order).
            const byOrder = (a, b) => a.field_order - b.field_order
            const paramValues = equipment.field_values.filter((fv) => fv.value_type !== 'file').sort(byOrder)
            const fileValues = equipment.field_values.filter((fv) => fv.value_type === 'file').sort(byOrder)
            return (
              <>
                <Card>
                  <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Параметры оборудования</div>
                  {paramValues.length === 0 ? (
                    <div style={{ fontSize: 13.5, color: 'var(--color-text-muted)' }}>У этого Вида нет реквизитов.</div>
                  ) : (
                    <div className="ele-field-grid">
                      {paramValues.map((fv) => (
                        <FieldValueDisplay key={fv.field} fv={fv} />
                      ))}
                    </div>
                  )}
                </Card>

                {/* B67: раздел «Файлы» — файловые реквизиты экземпляра, затем
                    выбранные для него общие файлы Вида под отдельным подзаголовком. */}
                {fileValues.length > 0 || (equipment.type_files?.length ?? 0) > 0 ? (
                  <Card>
                    <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Файлы</div>
                    {fileValues.length > 0 ? (
                      <div className="ele-field-grid">
                        {fileValues.map((fv) => (
                          <FieldValueDisplay key={fv.field} fv={fv} />
                        ))}
                      </div>
                    ) : null}
                    {(equipment.type_files?.length ?? 0) > 0 ? (
                      <div style={{ marginTop: fileValues.length > 0 ? 18 : 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 8 }}>
                          Общие файлы вида
                        </div>
                        <TypeFilesView files={equipment.type_files} />
                      </div>
                    ) : null}
                  </Card>
                ) : null}
              </>
            )
          })()}

          {/* B67: блок доп. полей скрываем, если их нет (иначе он всегда пустой). */}
          {equipment.custom_fields.length > 0 ? (
            <Card>
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Дополнительные поля</div>
              <div className="ele-field-grid">
                {equipment.custom_fields.map((cf) => (
                  <Field key={cf.id} label={cf.name} value={cf.value} />
                ))}
              </div>
            </Card>
          ) : null}

          {/* B13+/B23. Регламенты ТО — сворачиваемый раздел перед историей. Виден
              только тем, кто может управлять регламентами (admin / учётчик с флагом
              «Может управлять регламентами ТО»). Роль «Ответственный за ТО» и
              учётчик без этого флага регламентами не управляют — блок скрыт. */}
          {equipment.type_maintenance_enabled && !equipment.is_written_off && perms.canManageMaintenance ? (
            <Card>
              <EquipmentRegulationsSection
                equipment={equipment}
                regulations={regulations}
                canManage={perms.canManageMaintenance}
                onChanged={load}
              />
            </Card>
          ) : null}

          {/* История — в основной колонке (следует сразу за блоками), чтобы не
              оставался большой отступ, когда боковой блок выше основного.
              B32: видна только staff (полная) и ролям ТО (только выполненные ТО). */}
          {hMode !== 'none' ? (
            <Card>
              <HistoryList path={getEquipmentHistoryPath(equipment.id)} reloadKey={historyKey} maintenanceOnly={hMode === 'maintenance'} />
            </Card>
          ) : null}
        </div>

        {/* Боковой блок: «Закреплено за» + «Установленные лицензии». У списанного
            оборудования всегда пуст — не показываем (одна колонка). */}
        {!equipment.is_written_off ? (
        <Card className="ele-obj-layout__side ele-card-sticky">
          {/* B13+/B23. Блок «Обслуживание» (проведение ТО) — только у тех, кто
              реально проводит ТО по этому типу (canMaintainType: право проведения +
              тип в области) и у Наблюдателя (сквозной read-only). «Управляющий
              регламентами» (учётчик с флагом регламентов, без проведения) этот блок
              НЕ видит — статусы планов ему доступны в блоке «Регламенты». */}
          {equipment.type_maintenance_enabled
            && (canMaintainType(perms, equipment.equipment_type) || (perms.isObserver && perms.canSeeMaintenance)) ? (
            <>
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Обслуживание</div>
              {(() => {
                const active = (regulations || []).filter(
                  (r) => !r.is_archived && !r.plan?.is_cancelled && !r.on_demand,
                )
                if (regulations === null) {
                  return <div style={{ fontSize: 13.5, color: 'var(--color-text-muted)', marginBottom: 12 }}>Загрузка…</div>
                }
                if (active.length === 0) {
                  return <div style={{ fontSize: 13.5, color: 'var(--color-text-muted)', marginBottom: 12 }}>Нет активных регламентов ТО.</div>
                }
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                    {active.map((r) => {
                      const ic = planStatusIcon(r.status)
                      return (
                        <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <Tooltip label={ic.title} style={{ flex: 'none' }}>
                            <LeadIconCircle name={ic.icon} color={ic.color} size={46} iconSize={20} />
                          </Tooltip>
                          <div style={{ minWidth: 0 }}>
                            <div className="ele-clamp-2" style={{ fontSize: 13.5, fontWeight: 600 }}>{r.name}</div>
                            <div style={{ fontSize: 12.5, color: 'var(--color-text-placeholder)' }}>
                              {r.plan?.next_planned_date ? `Плановая дата: ${formatShortDate(r.plan.next_planned_date)}` : 'Дата ТО не задана'}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              })()}
              <Can perm="canPerformMaintenance">
                <Button variant="secondary" fullWidth onClick={() => navigate(`/equipment/${equipment.id}/maintenance`)}>
                  <Icon name="wrench" size={17} strokeWidth={2} />
                  Провести ТО
                </Button>
              </Can>
              <div style={{ borderTop: '1px solid var(--color-border-hairline)', margin: '20px 0 16px' }} />
            </>
          ) : null}

          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Размещение</div>
          {equipment.employee ? (
            <PlacementRow
              circle={<AvatarCircle avatar={equipment.employee_avatar} name={equipment.employee_name} size={46} status={equipment.acceptance_status} overlaySize={18} />}
              label="За сотрудником"
              title={<Link to={`/employees/${equipment.employee}`} style={{ color: 'var(--color-text-primary)' }}>{equipment.employee_name}</Link>}
              sub={equipment.position || '—'}
            />
          ) : equipment.place_detail ? (
            <>
              <PlacementRow
                circle={<LeadIconCircle name={PLACE_ICON[equipment.place_detail.place_type] || 'monitor'} size={46} iconSize={20} />}
                label={placementFullTitle(equipment.place_detail.place_type)}
                title={equipment.place_detail.name}
                sub={`${equipment.place_detail.building_name} — ${equipment.place_detail.room_name}`}
              />
              {equipment.place_detail.employees?.length ? (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 12, color: 'var(--color-text-placeholder)', marginBottom: 6 }}>Сотрудники рабочего места</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {equipment.place_detail.employees.map((e) => (
                      <Link key={e.id} to={`/employees/${e.id}`} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, color: 'var(--color-text-primary)' }}>
                        <AvatarCircle name={e.name} size={28} />
                        {e.name}
                      </Link>
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <PlacementRow
              circle={<LeadIconCircle name="warehouse" size={46} iconSize={20} />}
              label="На складе"
              title="Без склада"
            />
          )}
          {!equipment.is_written_off ? (
            <Can perm="canManageEquipment">
              <Button
                variant={equipment.employee || equipment.place_detail ? 'secondary' : 'primary'}
                fullWidth
                style={{ marginTop: 14 }}
                onClick={() => setShowPlacement(true)}
              >
                {equipment.employee || equipment.place_detail ? 'Закрепить' : (
                  <>
                    <Icon name="plus" size={18} strokeWidth={2.2} />
                    Закрепить
                  </>
                )}
              </Button>
            </Can>
          ) : null}

          {/* Блок лицензий — только если тип разрешает установку лицензий либо
              лицензии уже привязаны (иначе — лишний блок). */}
          {equipment.type_allows_license || (equipment.licenses?.length ?? 0) > 0 ? (
            <>
          <div style={{ borderTop: '1px solid var(--color-border-hairline)', margin: '20px 0 16px' }} />

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontSize: 16, fontWeight: 600 }}>Установленные лицензии</div>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', background: 'var(--color-fill-active-tint)', padding: '2px 9px', borderRadius: 20 }}>
              {equipment.licenses?.length ?? 0}
            </span>
          </div>
          {(equipment.licenses || []).map((lic) => (
            <div key={lic.id} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <LeadIconCircle name={lic.license_type_kind === 'hardware' ? 'cpu' : 'scroll-text'} size={46} iconSize={20} />
              {perms.canManageLicenses ? (
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Link to={`/licenses/${lic.id}`}>
                    <div className="ele-clamp-2" style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--color-text-primary)' }}>{lic.license_type_name}</div>
                  </Link>
                  {lic.key ? <div style={{ marginTop: 4 }}><InlineMaskedKey value={lic.key} /></div> : null}
                </div>
              ) : (
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="ele-clamp-2" style={{ fontSize: 13.5, fontWeight: 600 }}>{lic.license_type_name}</div>
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
                        message: `Лицензия «${lic.license_type_name}» будет отвязана от «${equipment.type_and_model}».`,
                        confirmLabel: 'Отвязать',
                        onConfirm: () => onDetachLicense(lic.id),
                      })
                    }
                    style={{ width: 30, height: 30, flex: 'none', borderRadius: 8, background: 'var(--color-surface)', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'inset 0 0 0 1px var(--color-border)' }}
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
          ) : null}

          {/* B17: блок SIM показываем, если тип разрешает установку SIM либо
              если SIM уже установлены (иначе — лишний пустой блок). */}
          {(equipment.type_allows_sim || (equipment.sim_cards?.length ?? 0) > 0) ? (
          <>
          <div style={{ borderTop: '1px solid var(--color-border-hairline)', margin: '20px 0 16px' }} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontSize: 16, fontWeight: 600 }}>SIM-карты</div>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', background: 'var(--color-fill-active-tint)', padding: '2px 9px', borderRadius: 20 }}>
              {equipment.sim_cards?.length ?? 0}
            </span>
          </div>
          {(equipment.sim_cards || []).map((sim) => (
            <div key={sim.id} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <LeadIconCircle name="radio-tower" size={46} iconSize={20} />
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
                    style={{ width: 30, height: 30, flex: 'none', borderRadius: 8, background: 'var(--color-surface)', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'inset 0 0 0 1px var(--color-border)' }}
                  >
                    <Icon name="x" size={16} strokeWidth={2} />
                  </button>
                </Can>
              ) : null}
            </div>
          ))}
          {!equipment.is_written_off && equipment.type_allows_sim ? (
            <Can perm="canManageEmployees">
              <Button variant="secondary" fullWidth onClick={() => setShowAttachSim(true)}>
                <Icon name="plus" size={18} strokeWidth={2.2} />
                Установить SIM
              </Button>
            </Can>
          ) : null}
          </>
          ) : null}
        </Card>
        ) : null}
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

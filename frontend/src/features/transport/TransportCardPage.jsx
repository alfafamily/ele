import { useCallback, useEffect, useState } from 'react'
import { useDocumentTitle } from '../../app/useDocumentTitle.js'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Can, usePermissions } from '../../app/usePermissions.js'
import { canMaintainTransportType, historyMode } from '../../shared/permissions.js'
import { FieldValueDisplay } from '../../shared/eav'
import { TypeFilesView } from '../../shared/TypeFilesView.jsx'
import { AvatarCircle } from '../../shared/AvatarCircle.jsx'
import { LeadIconCircle } from '../../shared/LeadIconCircle.jsx'
import { Tooltip } from '../../shared/Tooltip.jsx'
import { PlacementRow } from '../../shared/PlacementRow.jsx'
import { HistoryList } from '../../shared/HistoryList.jsx'
import { PlanLink } from '../../shared/PlanLink.jsx'
import { ActionMenu, BackButton, Button, Card, ConfirmModal, EmptyHint, Icon, Spinner } from '../../shared/ui'
import { AssignEmployeeModal } from './AssignEmployeeModal.jsx'
import { ParkingAssignModal } from './ParkingAssignModal.jsx'
import { TransportPassAttachModal } from './TransportPassAttachModal.jsx'
import { PassDetachModal } from '../employees/PassDetachModal.jsx'
import { TransportRegulationsSection } from './TransportRegulationsSection.jsx'
import { getTransport, getTransportHistoryPath, getTransportRegulations, mileageUnitLabel, setTransportParking, unassignTransport } from './transportApi.js'
import { planStatusIcon } from './statusLabels.js'
import { WriteOffModal } from './WriteOffModal.jsx'

function formatShortDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('ru-RU')
}
function formatNumber(value) {
  if (value == null) return '—'
  // Срезаем незначащие нули только в дробной части: «45000.00» → «45000»,
  // «12.50» → «12.5», «45000» → «45000» (целое не трогаем).
  const s = String(value)
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s
}

export function TransportCardPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const perms = usePermissions()
  const hMode = historyMode(perms, 'transport')
  const [transport, setTransport] = useState(null)
  useDocumentTitle(transport?.type_and_model)
  const [regulations, setRegulations] = useState(null)
  const [loadError, setLoadError] = useState(false)
  const [showWriteOff, setShowWriteOff] = useState(false)
  const [showAssign, setShowAssign] = useState(false)
  const [showParking, setShowParking] = useState(false)
  const [showPassAttach, setShowPassAttach] = useState(false)
  const [detachPass, setDetachPass] = useState(null)
  const [historyKey, setHistoryKey] = useState(0)
  const [confirm, setConfirm] = useState(null)

  const load = useCallback(() => {
    setLoadError(false)
    getTransport(id)
      .then((data) => {
        setTransport(data)
        setHistoryKey((k) => k + 1)
        // ТО для транспорта включено всегда — регламенты грузим, пока не списан.
        if (!data.is_written_off) {
          getTransportRegulations(id).then(setRegulations).catch(() => setRegulations([]))
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
        <div style={{ fontSize: 16, fontWeight: 600 }}>Не удалось открыть транспорт</div>
        <div style={{ fontSize: 14, color: 'var(--color-text-muted)' }}>Объект не найден или недоступен.</div>
        <Link to="/transport">
          <Button variant="secondary">К списку транспорта</Button>
        </Link>
      </div>
    )
  }

  if (!transport) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
        <Spinner />
      </div>
    )
  }

  const unitLabel = mileageUnitLabel(transport.type_mileage_unit)
  const showMaintenanceBlock =
    !transport.is_written_off &&
    (canMaintainTransportType(perms, transport.transport_type) || (perms.isObserver && perms.canSeeTransportMaintenance))

  return (
    <div>
      <div className="ele-only-desktop" style={{ fontSize: 13, color: 'var(--color-text-placeholder)', marginBottom: 10 }}>
        <Link to="/transport" style={{ color: 'var(--color-text-muted)' }}>
          Транспорт
        </Link>{' '}
        / {transport.type_and_model}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
          <BackButton />
          <h1 className="ele-card-title">{transport.type_and_model}</h1>
        </div>
        {!transport.is_written_off && perms.canManageTransport ? (
          <>
            <div className="ele-card-actions-desktop">
              <Button variant="danger" onClick={() => setShowWriteOff(true)}>
                Списать
              </Button>
              <Link to={`/transport/${transport.id}/edit`}>
                <Button>Редактировать</Button>
              </Link>
            </div>
            <div className="ele-card-actions-mobile">
              <ActionMenu
                items={[
                  { label: 'Редактировать', onClick: () => navigate(`/transport/${transport.id}/edit`) },
                  { label: 'Списать', danger: true, onClick: () => setShowWriteOff(true) },
                ]}
              />
            </div>
          </>
        ) : null}
      </div>

      <div className={'ele-obj-layout' + (transport.is_written_off ? ' ele-obj-layout--no-side' : '')}>
        <div className="ele-obj-layout__main">
          <Card>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Основная информация</div>
            <div className="ele-field-grid">
              <Field label="Учётный номер" value={transport.inventory_number} mono />
              <Field label="Вид транспорта" value={transport.transport_type_name} />
              {transport.type_gibdd_registration ? <Field label="Гос.номер" value={transport.plate} mono /> : null}
              <Field
                label={`Последний пробег, ${unitLabel}`}
                value={
                  transport.last_mileage
                    ? `${formatNumber(transport.last_mileage.value)} (${formatShortDate(transport.last_mileage.performed_at)})`
                    : '—'
                }
                mono
              />
            </div>
          </Card>

          {(() => {
            const byOrder = (a, b) => a.field_order - b.field_order
            // Гос.номер — залоченный базовый реквизит, уже показан в «Основной
            // информации» через transport.plate; исключаем из «Параметров», чтобы
            // не дублировать. «Модель» оставляем (в «Основной информации» её нет).
            const paramValues = transport.field_values
              .filter((fv) => fv.value_type !== 'file' && fv.name !== 'Гос.номер')
              .sort(byOrder)
            const fileValues = transport.field_values.filter((fv) => fv.value_type === 'file').sort(byOrder)
            return (
              <>
                <Card>
                  <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Параметры транспорта</div>
                  {paramValues.length === 0 ? (
                    <EmptyHint>У этого Вида нет реквизитов.</EmptyHint>
                  ) : (
                    <div className="ele-field-grid">
                      {paramValues.map((fv) => (
                        <FieldValueDisplay key={fv.field} fv={fv} />
                      ))}
                    </div>
                  )}
                </Card>

                {/* B67: файловые реквизиты + выбранные общие файлы Вида. */}
                {fileValues.length > 0 || (transport.type_files?.length ?? 0) > 0 ? (
                  <Card>
                    <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Файлы</div>
                    {fileValues.length > 0 ? (
                      <div className="ele-field-grid">
                        {fileValues.map((fv) => (
                          <FieldValueDisplay key={fv.field} fv={fv} />
                        ))}
                      </div>
                    ) : null}
                    {(transport.type_files?.length ?? 0) > 0 ? (
                      <div style={{ marginTop: fileValues.length > 0 ? 18 : 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 8 }}>
                          Общие файлы вида
                        </div>
                        <TypeFilesView files={transport.type_files} />
                      </div>
                    ) : null}
                  </Card>
                ) : null}
              </>
            )
          })()}

          {/* B67: блок доп. полей скрываем, если их нет. */}
          {transport.custom_fields.length > 0 ? (
            <Card>
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Дополнительные поля</div>
              <div className="ele-field-grid">
                {transport.custom_fields.map((cf) => (
                  <Field key={cf.id} label={cf.name} value={cf.value} />
                ))}
              </div>
            </Card>
          ) : null}

          {/* Регламенты ТО — сворачиваемый раздел; виден управляющим регламентами. */}
          {!transport.is_written_off && perms.canManageTransportMaintenance ? (
            <Card>
              <TransportRegulationsSection
                transport={transport}
                regulations={regulations}
                canManage={perms.canManageTransportMaintenance}
                onChanged={load}
              />
            </Card>
          ) : null}

          {hMode !== 'none' ? (
            <Card>
              <HistoryList path={getTransportHistoryPath(transport.id)} reloadKey={historyKey} maintenanceOnly={hMode === 'maintenance'} />
            </Card>
          ) : null}
        </div>

        {!transport.is_written_off ? (
          <Card className="ele-obj-layout__side ele-card-sticky">
            {/* Блок «Обслуживание» — для тех, кто проводит ТО по этому типу, и Наблюдателя. */}
            {showMaintenanceBlock ? (
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
                <Can perm="canPerformTransportMaintenance">
                  <Button variant="secondary" fullWidth onClick={() => navigate(`/transport/${transport.id}/maintenance`)}>
                    <Icon name="wrench" size={17} strokeWidth={2} />
                    Провести ТО
                  </Button>
                </Can>
                <div style={{ borderTop: '1px solid var(--color-border-hairline)', margin: '20px 0 16px' }} />
              </>
            ) : null}

            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Закрепление</div>
            {transport.employee ? (
              <PlacementRow
                circle={<AvatarCircle avatar={transport.employee_avatar} name={transport.employee_name} size={46} status={transport.acceptance_status} overlaySize={18} />}
                label="За сотрудником"
                title={<Link to={`/employees/${transport.employee}`} style={{ color: 'var(--color-text-primary)' }}>{transport.employee_name}</Link>}
                sub={transport.position || '—'}
              />
            ) : (
              <div style={{ fontSize: 15, color: 'var(--color-text-placeholder)' }}>Свободный</div>
            )}
            <Can perm="canManageTransport">
              {transport.employee ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
                  <Button variant="secondary" fullWidth onClick={() => setShowAssign(true)}>
                    Перезакрепить
                  </Button>
                  <Button
                    variant="secondary"
                    fullWidth
                    onClick={() =>
                      setConfirm({
                        title: 'Открепить транспорт?',
                        message: `«${transport.type_and_model}» будет откреплён от сотрудника и станет свободным.`,
                        confirmLabel: 'Открепить',
                        onConfirm: async () => {
                          await unassignTransport(transport.id)
                          setConfirm(null)
                          load()
                        },
                      })
                    }
                  >
                    Открепить
                  </Button>
                </div>
              ) : (
                <Button fullWidth style={{ marginTop: 14 }} onClick={() => setShowAssign(true)}>
                  <Icon name="plus" size={18} strokeWidth={2.2} />
                  Закрепить за сотрудником
                </Button>
              )}
            </Can>

            <div style={{ borderTop: '1px solid var(--color-border-hairline)', margin: '20px 0 16px' }} />
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Парковка</div>
            <ParkingBlock
              parking={transport.parking}
              canManage={perms.canManageTransport}
              onSet={() => setShowParking(true)}
              onClear={() =>
                setConfirm({
                  title: 'Снять парковку?',
                  message: `«${transport.type_and_model}» перестанет быть закреплён за парковкой.`,
                  confirmLabel: 'Снять',
                  onConfirm: async () => {
                    await setTransportParking(transport.id, { mode: 'none' })
                    setConfirm(null)
                    load()
                  },
                })
              }
            />

            <div style={{ borderTop: '1px solid var(--color-border-hairline)', margin: '20px 0 16px' }} />
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Пропуска</div>
            <PassesBlock
              passes={transport.passes || []}
              canManage={perms.canManageTransport}
              onAttach={() => setShowPassAttach(true)}
              onDetach={(p) => setDetachPass(p)}
            />
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
          transport={transport}
          onClose={() => setShowWriteOff(false)}
          onDone={() => {
            setShowWriteOff(false)
            load()
          }}
        />
      ) : null}
      {showAssign ? (
        <AssignEmployeeModal
          transport={transport}
          onClose={() => setShowAssign(false)}
          onDone={() => {
            setShowAssign(false)
            load()
          }}
        />
      ) : null}
      {showParking ? (
        <ParkingAssignModal
          transport={transport}
          onClose={() => setShowParking(false)}
          onDone={() => {
            setShowParking(false)
            load()
          }}
        />
      ) : null}
      {showPassAttach ? (
        <TransportPassAttachModal
          transportId={transport.id}
          onClose={() => setShowPassAttach(false)}
          onAttached={() => {
            setShowPassAttach(false)
            load()
          }}
          onCreateNew={() => navigate(`/passes/new?transport=${transport.id}`)}
        />
      ) : null}
      {detachPass ? (
        <PassDetachModal
          pass={detachPass}
          onClose={() => setDetachPass(null)}
          onDone={() => {
            setDetachPass(null)
            load()
          }}
        />
      ) : null}
    </div>
  )
}

// Блок «Пропуска» на карточке транспорта (B34): транспортные пропуска,
// закреплённые за этой единицей. Открепление — на склад через PassDetachModal.
// Кнопка «Закрепить пропуск» открывает подбор/создание.
function PassesBlock({ passes, canManage, onAttach, onDetach }) {
  return (
    <div>
      {passes.length === 0 ? (
        <div style={{ fontSize: 15, color: 'var(--color-text-placeholder)' }}>Нет пропусков</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {passes.map((p) => {
            const buildings = (p.buildings || []).map((b) => b.name).join(', ')
            return (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <LeadIconCircle name="key-square" size={46} iconSize={20} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <Link to={`/passes/${p.id}`} style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)' }}>
                    Пропуск № {p.account_number && p.account_number.trim() ? p.account_number : 'б/н'}
                  </Link>
                  {buildings ? (
                    <div className="ele-clamp-2" style={{ fontSize: 12.5, color: 'var(--color-text-placeholder)' }}>{buildings}</div>
                  ) : null}
                </div>
                {canManage ? (
                  <button
                    type="button"
                    title="Открепить"
                    aria-label="Открепить"
                    onClick={() => onDetach(p)}
                    style={{ width: 30, height: 30, flex: 'none', borderRadius: 8, background: 'var(--color-surface)', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'inset 0 0 0 1px var(--color-border)' }}
                  >
                    <Icon name="x" size={16} strokeWidth={2} />
                  </button>
                ) : null}
              </div>
            )
          })}
        </div>
      )}
      {canManage ? (
        <Button fullWidth style={{ marginTop: 14 }} onClick={onAttach}>
          <Icon name="plus" size={18} strokeWidth={2.2} />
          Закрепить пропуск
        </Button>
      ) : null}
    </div>
  )
}

// Блок «Парковка» на карточке транспорта: закреплённое место (со ссылкой на
// «План парковки»), «на адресе водителя», либо кнопка выбора.
function ParkingBlock({ parking, canManage, onSet, onClear }) {
  if (parking?.kind === 'spot') {
    return (
      <div>
        <PlacementRow
          circle={<LeadIconCircle name="square-parking" size={46} iconSize={20} />}
          title={parking.place_name}
          sub={[parking.building_name, parking.room_name].filter(Boolean).join(' — ') || undefined}
        />
        {parking.plan_file?.url ? <PlanLink file={parking.plan_file} style={{ marginTop: 10 }} /> : null}
        {canManage ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
            <Button variant="secondary" fullWidth onClick={onSet}>Изменить</Button>
            <Button variant="secondary" fullWidth onClick={onClear}>Снять парковку</Button>
          </div>
        ) : null}
      </div>
    )
  }
  if (parking?.kind === 'driver_address') {
    return (
      <div>
        <PlacementRow
          circle={<LeadIconCircle name="map-pin" size={46} iconSize={20} />}
          title="На адресе сотрудника"
        />
        {canManage ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
            <Button variant="secondary" fullWidth onClick={onSet}>Изменить</Button>
            <Button variant="secondary" fullWidth onClick={onClear}>Снять парковку</Button>
          </div>
        ) : null}
      </div>
    )
  }
  return (
    <div>
      <div style={{ fontSize: 15, color: 'var(--color-text-placeholder)' }}>Не указана</div>
      {canManage ? (
        <Button fullWidth style={{ marginTop: 14 }} onClick={onSet}>
          <Icon name="plus" size={18} strokeWidth={2.2} />
          Указать парковочное место
        </Button>
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

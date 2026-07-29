import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useNavigationType, useParams } from 'react-router-dom'
import { unassignEquipment } from '../equipment/equipmentApi.js'
import { unassignTransport } from '../transport/transportApi.js'
import { unassignUnits as unassignToolUnits } from '../tools/toolsApi.js'
import { AssignToolModal } from '../tools/AssignToolModal.jsx'
import { DetachToStorageModal } from './DetachToStorageModal.jsx'
import { Can, usePermissions } from '../../app/usePermissions.js'
import { PlanLink } from '../../shared/PlanLink.jsx'
import { TransportParkingLine } from '../../shared/TransportParkingLine.jsx'
import { ActionMenu, BackButton, Button, Card, ConfirmModal, Icon, Spinner, StatusPill, Table, TabBar, TableRow } from '../../shared/ui'
import { useMediaQuery } from '../../shared/hooks/useMediaQuery.js'
import { useScrollRestoration } from '../../shared/hooks/useScrollRestoration.js'
import { readListCache, writeListCache } from '../../shared/listCache.js'
import { nameInitials } from '../../shared/employeeName.js'
import { LeadIconCircle } from '../../shared/LeadIconCircle.jsx'
import { getEmployee, getEmployeeAssignments, getEmployeeIssuedArchive, restoreEmployee, uploadEmployeeAvatar } from './employeesApi.js'
import { AttachOrCreateModal } from './AttachOrCreateModal.jsx'
import { PassInfo } from './PassInfo.jsx'
import { PassDisposeModal } from './PassDisposeModal.jsx'
import { SimCardInfo } from './SimCardInfo.jsx'
import { SimDisposeModal } from './SimDisposeModal.jsx'
import { TerminateModal } from './TerminateModal.jsx'

// Стили строк/счётчика/квадратной кнопки в блоках карточки.
const CNT = { fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', background: 'var(--color-fill-active-tint)', padding: '2px 9px', borderRadius: 20 }
const ROW = { display: 'flex', alignItems: 'center', gap: 8, padding: '11px 13px', background: 'var(--color-surface)', boxShadow: 'inset 0 0 0 1px var(--color-border)', borderRadius: 10, marginBottom: 8 }
const SQ = { width: 30, height: 30, flex: 'none', borderRadius: 8, background: '#fff', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }
const PEND_ICON = { equipment: 'tag', sim: 'radio-tower', pass: 'key-square', tool: 'hammer', transport: 'car' }

export function EmployeeCardPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const perms = usePermissions()
  const isMobile = useMediaQuery('(max-width: 768px)')
  // При возврате «назад» (POP) с карточки объекта — восстанавливаем активную
  // вкладку и позицию прокрутки (например, из «Архива» к нужной строке).
  const isPop = useNavigationType() === 'POP'
  const cacheKey = `employee-card-${id}`
  const savedUi = isPop ? readListCache(cacheKey)?.ui : undefined
  const [employee, setEmployee] = useState(null)
  const [assignments, setAssignments] = useState([]) // B32: открытые эпизоды акцепта
  // Вкладки карточки: «Выдано» (текущие блоки) / «Архив» (завершённые эпизоды).
  const [tab, setTab] = useState(() => savedUi?.tab ?? 'issued')
  const [archive, setArchive] = useState(null)
  const [showTerminate, setShowTerminate] = useState(false)
  // Создание/редактирование SIM и пропусков — отдельные страницы-формы
  // (/sim-cards/new|:id/edit, /passes/new|:id/edit). Здесь остаётся только
  // модалка выбора свободного объекта для привязки.
  const [simAttach, setSimAttach] = useState(false)
  const [passAttach, setPassAttach] = useState(false)
  const [equipmentAttach, setEquipmentAttach] = useState(false)
  const [transportAttach, setTransportAttach] = useState(false)
  const [toolAssign, setToolAssign] = useState(false)
  // Открепление/утилизация — выбор действия (SimDisposeModal/PassDisposeModal).
  const [disposeSim, setDisposeSim] = useState(null)
  const [disposePass, setDisposePass] = useState(null)
  // Подтверждение открепления: { title, message, onConfirm }.
  const [confirm, setConfirm] = useState(null)
  // Открепление на склад: { kind: 'equipment'|'tool', obj }.
  const [detach, setDetach] = useState(null)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const fileInputRef = useRef(null)

  const load = useCallback(() => {
    getEmployee(id).then(setEmployee)
    getEmployeeAssignments(id).then(setAssignments).catch(() => setAssignments([]))
    // Инвалидируем архив: после привязки/открепления состав эпизодов меняется.
    setArchive(null)
  }, [id])

  useEffect(load, [load])

  // Архив грузим лениво — при первом открытии вкладки (и после инвалидации).
  useEffect(() => {
    if (tab === 'archive' && archive === null) {
      getEmployeeIssuedArchive(id).then(setArchive)
    }
  }, [tab, archive, id])

  // Пишем активную вкладку в кэш — чтобы «назад» с карточки объекта вернул на неё.
  useEffect(() => {
    writeListCache(cacheKey, { ui: { tab } })
  }, [cacheKey, tab])

  // Восстанавливаем прокрутку при POP, как только содержимое активной вкладки
  // готово (для «Архива» — после загрузки таблицы).
  const contentReady = employee != null && (tab === 'archive' ? archive !== null : true)
  useScrollRestoration(cacheKey, isPop && contentReady)

  if (!employee) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
        <Spinner />
      </div>
    )
  }

  // B32: карта статусов акцепта по объекту (kind:id → status) и список
  // ожидающих решения сотрудника (pending).
  const acceptanceOf = (kind, objId) =>
    assignments.find((a) => a.object_kind === kind && a.object_id === objId)?.status || null
  const pendingAssignments = assignments.filter((a) => a.status === 'pending')
  const isPending = (kind, objId) => acceptanceOf(kind, objId) === 'pending'
  // Ожидающие решения объекты показываем ТОЛЬКО в блоке «Ожидает решения
  // сотрудника» — из обычных блоков раздела их исключаем.
  const heldEquipment = employee.equipment.filter((e) => !isPending('equipment', e.id))
  const heldTools = employee.tools.filter((t) => !isPending('tool', t.id))
  const heldSims = employee.sim_cards.filter((s) => !isPending('sim', s.id))
  const heldPasses = employee.passes.filter((p) => !isPending('pass', p.id))
  const heldTransport = employee.transport.filter((t) => !isPending('transport', t.id))
  // Маршрут детальной страницы объекта по виду (для клика в блоке ожидания).
  const OBJ_ROUTE = { equipment: 'equipment', tool: 'tools', sim: 'sim-cards', pass: 'passes', transport: 'transport' }

  const onAvatarSelected = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingAvatar(true)
    try {
      await uploadEmployeeAvatar(employee.id, file)
      load()
    } finally {
      setUploadingAvatar(false)
      e.target.value = ''
    }
  }

  // Открепление оборудования на склад (место хранения обязательно, B8).
  const onDetachEquipment = async (equipmentId, storagePlaceId) => {
    await unassignEquipment(equipmentId, storagePlaceId)
    load()
  }

  // Открепление инструмента на склад — возвращает все закреплённые за сотрудником
  // единицы на выбранный склад (частичное — на карточке инструмента).
  const onDetachTool = async (tool, storagePlaceId) => {
    await unassignToolUnits(tool.id, {
      quantity: tool.quantity,
      mode: 'mobile',
      employeeId: employee.id,
      toPlace: storagePlaceId,
    })
    load()
  }

  const onRestore = async () => {
    await restoreEmployee(employee.id)
    load()
  }

  // Открепление из карточки сотрудника — через выбор действия (открепить /
  // утилизировать / передать арендодателю), как и на карточке объекта.
  const askDetachSim = (sim) => setDisposeSim(sim)
  const askDetachPass = (pass) => setDisposePass(pass)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ width: '100%', maxWidth: 660, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flex: 1, minWidth: 0 }}>
            <BackButton />
            <span
              style={{
                width: 54,
                height: 54,
                flex: 'none',
                borderRadius: '50%',
                background: 'var(--color-fill-active-tint)',
                color: 'var(--color-text-secondary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 18,
                fontWeight: 600,
                overflow: 'hidden',
                position: 'relative',
                cursor: perms.canManageEmployees ? 'pointer' : 'default',
              }}
              onClick={() => perms.canManageEmployees && fileInputRef.current?.click()}
              title={perms.canManageEmployees ? 'Изменить фото' : undefined}
            >
              {employee.avatar ? <img src={employee.avatar.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : nameInitials(employee.full_name)}
              {uploadingAvatar ? <Spinner size={20} /> : null}
            </span>
            {perms.canManageEmployees ? (
              <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onAvatarSelected} />
            ) : null}
            <div style={{ minWidth: 0 }}>
              {/* Должность/отдел в заголовке не дублируем — они в «Данных сотрудника».
                  На мобилке фамилия и имя — на отдельных строках, каждая обрезается
                  многоточием по ширине (как в списке Пользователей). */}
              {isMobile ? (
                <div style={{ fontSize: 20, fontWeight: 600, minWidth: 0 }}>
                  <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{employee.last_name}</div>
                  <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{employee.first_name}</div>
                </div>
              ) : (
                <div className="ele-clamp-2" style={{ fontSize: 20, fontWeight: 600 }}>{employee.full_name}</div>
              )}
            </div>
          </div>
          {employee.is_employed ? (
            <Can perm="canManageEmployees">
              <div className="ele-card-actions-desktop">
                <Link to={`/employees/${employee.id}/edit`}>
                  <Button variant="secondary">Редактировать</Button>
                </Link>
                <Button variant="danger" onClick={() => setShowTerminate(true)}>
                  Уволить
                </Button>
              </div>
              <div className="ele-card-actions-mobile">
                <ActionMenu
                  items={[
                    { label: 'Редактировать', onClick: () => navigate(`/employees/${employee.id}/edit`) },
                    { label: 'Уволить', danger: true, onClick: () => setShowTerminate(true) },
                  ]}
                />
              </div>
            </Can>
          ) : (
            <Can perm="canManageEmployees">
              <Button variant="secondary" onClick={onRestore}>Восстановить</Button>
            </Can>
          )}
        </div>

        <Card>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Данные сотрудника</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 28px' }}>
            <Field label="Должность" value={employee.position} />
            <Field label="Отдел" value={employee.department} />
            <div>
              <div style={{ fontSize: 12, color: 'var(--color-text-placeholder)', marginBottom: 4 }}>Статус</div>
              <StatusPill variant={employee.is_employed ? 'assigned' : 'archived'}>{employee.is_employed ? 'Работает' : 'Уволен'}</StatusPill>
            </div>
            <div>
              <div style={{ fontSize: 12, color: 'var(--color-text-placeholder)', marginBottom: 4 }}>Учётная запись</div>
              <div style={{ fontSize: 14, fontWeight: 500 }}>{employee.user_email || <span style={{ color: 'var(--color-text-placeholder)' }}>Не связана</span>}</div>
            </div>
          </div>
        </Card>

        <div>
          <TabBar options={ISSUED_ARCHIVE_TABS} value={tab} onChange={setTab} />
        </div>

        {tab === 'issued' ? (
        <>
        {pendingAssignments.length ? (
          <Card>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <div style={{ fontSize: 16, fontWeight: 600 }}>Ожидает решения сотрудника</div>
              <span style={CNT}>{pendingAssignments.length}</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--color-text-placeholder)', marginBottom: 12 }}>
              Сотрудник ещё не подтвердил и не отклонил получение этих объектов
            </div>
            {pendingAssignments.map((a) => (
              <Link key={a.id} to={`/${OBJ_ROUTE[a.object_kind]}/${a.object_id}`} style={{ ...ROW, textDecoration: 'none', color: 'inherit' }}>
                <LeadIconCircle name={PEND_ICON[a.object_kind] || 'tag'} />
                {(() => {
                  // SIM и пропуска/ключи — те же поля, что и в списках закреплённого
                  // (полные объекты уже загружены), иначе номер дублировался бы.
                  if (a.object_kind === 'sim') {
                    const sim = employee.sim_cards.find((s) => s.id === a.object_id)
                    if (sim) return <SimCardInfo sim={sim} />
                  }
                  if (a.object_kind === 'pass') {
                    const pass = employee.passes.find((p) => p.id === a.object_id)
                    if (pass) return <PassInfo pass={pass} />
                  }
                  return (
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {a.object_label || a.object_kind_display}
                        {a.object_kind === 'tool' && a.return_quantity ? ` · ${a.return_quantity} шт.` : ''}
                      </div>
                      {a.object_number ? (
                        <div style={{ font: '500 11.5px var(--font-mono)', color: 'var(--color-text-placeholder)' }}>{a.object_number}</div>
                      ) : null}
                    </div>
                  )
                })()}
                <Icon name="chevron-right" size={16} strokeWidth={2} style={{ color: '#C7C9D4', flex: 'none' }} />
              </Link>
            ))}
          </Card>
        ) : null}

        {employee.workplaces?.length ? (
          <Card>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div style={{ fontSize: 16, fontWeight: 600 }}>Рабочие места</div>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', background: 'var(--color-fill-active-tint)', padding: '2px 9px', borderRadius: 20 }}>
                {employee.workplaces.length}
              </span>
            </div>
            {employee.workplaces.map((wp) => (
              <div key={wp.id} style={{ padding: '11px 13px', background: 'var(--color-surface)', boxShadow: 'inset 0 0 0 1px var(--color-border)', borderRadius: 10, marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <LeadIconCircle name="briefcase" />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600 }}>{wp.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--color-text-placeholder)' }}>{wp.location}</div>
                  </div>
                </div>
                {wp.equipment?.length || wp.tools?.length ? (
                  <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <div style={{ fontSize: 11.5, color: 'var(--color-text-placeholder)' }}>На этом рабочем месте</div>
                    {(wp.equipment || []).map((eq) => (
                      <Link key={`e${eq.id}`} to={`/equipment/${eq.id}`} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--color-text-primary)' }}>
                        <Icon name="tag" size={13} strokeWidth={2} style={{ color: 'var(--color-text-muted)', flex: 'none' }} />
                        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {eq.type_and_model} · <span style={{ font: '500 12px var(--font-mono)', color: 'var(--color-text-placeholder)' }}>{eq.inventory_number}</span>
                        </span>
                      </Link>
                    ))}
                    {(wp.tools || []).map((t) => (
                      <Link key={`t${t.id}`} to={`/tools/${t.id}`} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--color-text-primary)' }}>
                        <Icon name="hammer" size={13} strokeWidth={2} style={{ color: 'var(--color-text-muted)', flex: 'none' }} />
                        <span>{t.name} · {t.quantity} шт.</span>
                      </Link>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </Card>
        ) : null}

        {employee.parking_spots?.length ? (
          <Card>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div style={{ fontSize: 16, fontWeight: 600 }}>Парковочные места</div>
              <span style={CNT}>{employee.parking_spots.length}</span>
            </div>
            {employee.parking_spots.map((sp) => (
              <ParkingSpotRow key={sp.id} spot={sp} />
            ))}
          </Card>
        ) : null}

        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{ fontSize: 16, fontWeight: 600 }}>Оборудование</div>
            <span style={CNT}>{heldEquipment.length}</span>
          </div>
          {employee.is_employed ? (
            <Can perm="canManageEquipment">
              <Button variant="secondary" fullWidth style={{ marginBottom: heldEquipment.length ? 8 : 0 }} onClick={() => setEquipmentAttach(true)}>
                <Icon name="plus" size={18} strokeWidth={2.2} />Закрепить оборудование
              </Button>
            </Can>
          ) : heldEquipment.length === 0 ? (
            <div style={{ fontSize: 13.5, color: 'var(--color-text-muted)' }}>За сотрудником не закреплено оборудование.</div>
          ) : null}
          {heldEquipment.map((eq) => (
            <div key={eq.id} style={ROW}>
              <LeadIconCircle name="tag" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <Link to={`/equipment/${eq.id}`} style={{ display: 'block' }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--color-text-primary)' }}>{eq.type_and_model}</div>
                  <div style={{ font: '500 12px var(--font-mono)', color: 'var(--color-text-placeholder)' }}>{eq.inventory_number}</div>
                </Link>
              </div>
              <Can perm="canManageEquipment">
                <button type="button" title="Открепить" aria-label="Открепить" onClick={() => setDetach({ kind: 'equipment', obj: eq })} style={SQ}>
                  <Icon name="unlink" size={16} strokeWidth={2} />
                </button>
              </Can>
              <Link to={`/equipment/${eq.id}`} style={{ width: 28, height: 28, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="chevron-right" size={16} strokeWidth={2} style={{ color: '#C7C9D4' }} />
              </Link>
            </div>
          ))}
        </Card>

        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{ fontSize: 16, fontWeight: 600 }}>Транспорт</div>
            <span style={CNT}>{heldTransport.length}</span>
          </div>
          {employee.is_employed ? (
            <Can perm="canManageTransport">
              <Button variant="secondary" fullWidth style={{ marginBottom: heldTransport.length ? 8 : 0 }} onClick={() => setTransportAttach(true)}>
                <Icon name="plus" size={18} strokeWidth={2.2} />Закрепить транспорт
              </Button>
            </Can>
          ) : heldTransport.length === 0 ? (
            <div style={{ fontSize: 13.5, color: 'var(--color-text-muted)' }}>За сотрудником не закреплён транспорт.</div>
          ) : null}
          {heldTransport.map((t) => (
            <div key={t.id} style={{ background: 'var(--color-surface)', boxShadow: 'inset 0 0 0 1px var(--color-border)', borderRadius: 10, marginBottom: 8, padding: '11px 13px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <LeadIconCircle name="car" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Link to={`/transport/${t.id}`} style={{ display: 'block' }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--color-text-primary)' }}>{t.type_and_model}</div>
                    <div style={{ font: '500 12px var(--font-mono)', color: 'var(--color-text-placeholder)' }}>
                      {[t.plate, t.inventory_number].filter(Boolean).join(' · ')}
                    </div>
                  </Link>
                </div>
                {employee.is_employed ? (
                  <Can perm="canManageTransport">
                    <button
                      type="button"
                      title="Открепить"
                      aria-label="Открепить"
                      onClick={() => setConfirm({
                        title: 'Открепить транспорт?',
                        message: `«${t.type_and_model}» будет откреплён от сотрудника и станет свободным.`,
                        onConfirm: async () => { await unassignTransport(t.id); setConfirm(null); load() },
                      })}
                      style={SQ}
                    >
                      <Icon name="unlink" size={16} strokeWidth={2} />
                    </button>
                  </Can>
                ) : null}
                <Link to={`/transport/${t.id}`} style={{ width: 28, height: 28, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="chevron-right" size={16} strokeWidth={2} style={{ color: '#C7C9D4' }} />
                </Link>
              </div>
              <TransportParkingLine parking={t.parking} />
            </div>
          ))}
        </Card>

        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{ fontSize: 16, fontWeight: 600 }}>Инструменты</div>
            <span style={CNT}>{heldTools.length}</span>
          </div>
          {employee.is_employed ? (
            <Can perm="canManageEquipment">
              <Button variant="secondary" fullWidth style={{ marginBottom: heldTools.length ? 8 : 0 }} onClick={() => setToolAssign(true)}>
                <Icon name="plus" size={18} strokeWidth={2.2} />Закрепить инструмент
              </Button>
            </Can>
          ) : heldTools.length === 0 ? (
            <div style={{ fontSize: 13.5, color: 'var(--color-text-muted)' }}>За сотрудником не закреплены инструменты.</div>
          ) : null}
          {heldTools.map((tool) => (
            <div key={tool.id} style={ROW}>
              <LeadIconCircle name="hammer" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <Link to={`/tools/${tool.id}`} style={{ display: 'block' }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--color-text-primary)' }}>{tool.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-placeholder)' }}>{tool.quantity} шт.</div>
                </Link>
              </div>
              {employee.is_employed ? (
                <Can perm="canManageEquipment">
                  <button type="button" title="Открепить" aria-label="Открепить" onClick={() => setDetach({ kind: 'tool', obj: tool })} style={SQ}>
                    <Icon name="unlink" size={16} strokeWidth={2} />
                  </button>
                </Can>
              ) : null}
              <Link to={`/tools/${tool.id}`} style={{ width: 28, height: 28, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="chevron-right" size={16} strokeWidth={2} style={{ color: '#C7C9D4' }} />
              </Link>
            </div>
          ))}
        </Card>

        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{ fontSize: 16, fontWeight: 600 }}>Корпоративная связь</div>
            <span style={CNT}>{heldSims.length}</span>
          </div>
          {employee.is_employed ? (
            <Can perm="canManageEmployees">
              <Button variant="secondary" fullWidth style={{ marginBottom: heldSims.length ? 8 : 0 }} onClick={() => setSimAttach(true)}>
                <Icon name="plus" size={18} strokeWidth={2.2} />Закрепить SIM-карту
              </Button>
            </Can>
          ) : heldSims.length === 0 ? (
            <div style={{ fontSize: 13.5, color: 'var(--color-text-muted)' }}>За сотрудником не закреплено SIM-карт.</div>
          ) : null}
          {heldSims.map((sim) => (
            <div key={sim.id} style={ROW}>
              <LeadIconCircle name="radio-tower" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <SimCardInfo sim={sim} />
              </div>
              {employee.is_employed ? (
                <Can perm="canManageEmployees">
                  <button type="button" title="Открепить" aria-label="Открепить" onClick={() => askDetachSim(sim)} style={SQ}>
                    <Icon name="unlink" size={16} strokeWidth={2} />
                  </button>
                </Can>
              ) : null}
            </div>
          ))}
        </Card>

        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{ fontSize: 16, fontWeight: 600 }}>Средства доступа</div>
            <span style={CNT}>{heldPasses.length}</span>
          </div>
          {employee.is_employed ? (
            <Can perm="canManageEmployees">
              <Button variant="secondary" fullWidth style={{ marginBottom: heldPasses.length ? 8 : 0 }} onClick={() => setPassAttach(true)}>
                <Icon name="plus" size={18} strokeWidth={2.2} />Закрепить средство доступа
              </Button>
            </Can>
          ) : heldPasses.length === 0 ? (
            <div style={{ fontSize: 13.5, color: 'var(--color-text-muted)' }}>За сотрудником не закреплено средств доступа.</div>
          ) : null}
          {heldPasses.map((pass) => (
            <div key={pass.id} style={ROW}>
              <LeadIconCircle name="key-square" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <PassInfo pass={pass} />
              </div>
              {employee.is_employed ? (
                <Can perm="canManageEmployees">
                  <button type="button" title="Открепить" aria-label="Открепить" onClick={() => askDetachPass(pass)} style={SQ}>
                    <Icon name="unlink" size={16} strokeWidth={2} />
                  </button>
                </Can>
              ) : null}
            </div>
          ))}
        </Card>
        </>
        ) : (
          <ArchiveTab archive={archive} />
        )}
      </div>

      {simAttach ? (
        <AttachOrCreateModal
          kind="sim"
          employeeId={employee.id}
          onClose={() => setSimAttach(false)}
          onAttached={() => {
            setSimAttach(false)
            load()
          }}
          onCreateNew={() => {
            setSimAttach(false)
            navigate(`/sim-cards/new?employee=${employee.id}`)
          }}
        />
      ) : null}

      {passAttach ? (
        <AttachOrCreateModal
          kind="pass"
          employeeId={employee.id}
          onClose={() => setPassAttach(false)}
          onAttached={() => {
            setPassAttach(false)
            load()
          }}
          onCreateNew={() => {
            setPassAttach(false)
            navigate(`/passes/new?employee=${employee.id}`)
          }}
        />
      ) : null}

      {equipmentAttach ? (
        <AttachOrCreateModal
          kind="equipment"
          employeeId={employee.id}
          onClose={() => setEquipmentAttach(false)}
          onAttached={() => {
            setEquipmentAttach(false)
            load()
          }}
          onCreateNew={() => {
            setEquipmentAttach(false)
            navigate(`/equipment/new?employee=${employee.id}`)
          }}
        />
      ) : null}

      {transportAttach ? (
        <AttachOrCreateModal
          kind="transport"
          employeeId={employee.id}
          onClose={() => setTransportAttach(false)}
          onAttached={() => {
            setTransportAttach(false)
            load()
          }}
          onCreateNew={() => {
            setTransportAttach(false)
            navigate(`/transport/new?employee=${employee.id}`)
          }}
        />
      ) : null}

      {toolAssign ? (
        <AssignToolModal
          employeeId={employee.id}
          onClose={() => setToolAssign(false)}
          onDone={() => {
            setToolAssign(false)
            load()
          }}
        />
      ) : null}

      {disposeSim ? (
        <SimDisposeModal
          sim={disposeSim}
          onClose={() => setDisposeSim(null)}
          onDone={() => {
            setDisposeSim(null)
            load()
          }}
        />
      ) : null}

      {disposePass ? (
        <PassDisposeModal
          pass={disposePass}
          onClose={() => setDisposePass(null)}
          onDone={() => {
            setDisposePass(null)
            load()
          }}
        />
      ) : null}

      {confirm ? (
        <ConfirmModal
          title={confirm.title}
          message={confirm.message}
          onConfirm={confirm.onConfirm}
          onClose={() => setConfirm(null)}
        />
      ) : null}

      {detach ? (
        <DetachToStorageModal
          title={detach.kind === 'tool' ? 'Открепить инструмент' : 'Открепить оборудование на склад'}
          optional={detach.kind === 'tool'}
          description={
            detach.kind === 'tool'
              ? `Все ${detach.obj.quantity} шт. «${detach.obj.name}» вернутся в свободный остаток (по желанию — на конкретный склад).`
              : `«${detach.obj.type_and_model}» будет снято с сотрудника и положено на склад.`
          }
          onConfirm={async (storagePlaceId) => {
            if (detach.kind === 'tool') await onDetachTool(detach.obj, storagePlaceId)
            else await onDetachEquipment(detach.obj.id, storagePlaceId)
            setDetach(null)
          }}
          onClose={() => setDetach(null)}
        />
      ) : null}

      {showTerminate ? (
        <TerminateModal
          employee={employee}
          onClose={() => setShowTerminate(false)}
          onDone={() => {
            setShowTerminate(false)
            load()
          }}
        />
      ) : null}
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

// Строка парковочного места личного авто сотрудника — со ссылкой «План парковки».
function ParkingSpotRow({ spot }) {
  return (
    <div style={{ padding: '11px 13px', background: 'var(--color-surface)', boxShadow: 'inset 0 0 0 1px var(--color-border)', borderRadius: 10, marginBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <LeadIconCircle name="square-parking" />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600 }}>{spot.name}</div>
          <div style={{ fontSize: 12, color: 'var(--color-text-placeholder)' }}>{spot.location}</div>
          {spot.plan_file?.url ? <PlanLink file={spot.plan_file} style={{ marginTop: 5 }} /> : null}
        </div>
      </div>
    </div>
  )
}

const ISSUED_ARCHIVE_TABS = [
  { value: 'issued', label: 'Выдано' },
  { value: 'archive', label: 'Архив' },
]

// Таблица «Архив»: две колонки — объект (как в списке своего раздела) и период
// «прикрепление → открепление».
const ARCHIVE_COLUMNS = [
  { key: 'object', label: 'Объект', width: 'minmax(0, 1fr)' },
  { key: 'period', label: 'Дата прикрепления / открепления', width: '160px' },
]

const ARCHIVE_OBJECT_PATH = { equipment: 'equipment', tool: 'tools', sim: 'sim-cards', pass: 'passes' }

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('ru-RU')
}

// Контент первой колонки — тот же, что в списке соответствующего раздела.
function ArchiveObject({ row }) {
  if (row.kind === 'sim') return <SimCardInfo sim={row.object} />
  if (row.kind === 'pass') return <PassInfo pass={row.object} />
  if (row.kind === 'tool') {
    return (
      <div style={{ minWidth: 0 }}>
        <div className="ele-clamp-2" style={{ fontSize: 13.5, fontWeight: 600 }}>{row.object.name}</div>
        <div style={{ fontSize: 12, color: 'var(--color-text-placeholder)', marginTop: 2 }}>{row.object.quantity} шт.</div>
      </div>
    )
  }
  return (
    <div style={{ minWidth: 0 }}>
      <div className="ele-clamp-2" style={{ fontSize: 13.5, fontWeight: 600 }}>{row.object.type_and_model}</div>
      <div style={{ font: '500 12px var(--font-mono)', color: 'var(--color-text-placeholder)', marginTop: 2 }}>{row.object.inventory_number}</div>
    </div>
  )
}

function ArchiveTab({ archive }) {
  if (archive === null) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
        <Spinner />
      </div>
    )
  }
  if (archive.length === 0) {
    return (
      <Card>
        <div style={{ fontSize: 13.5, color: 'var(--color-text-muted)' }}>Ранее выданных объектов нет.</div>
      </Card>
    )
  }
  return (
    <Table fit columns={ARCHIVE_COLUMNS}>
      {archive.map((row) => {
        const key = `${row.kind}-${row.object.id}-${row.detached_at}`
        const inner = (
          <TableRow columns={ARCHIVE_COLUMNS}>
            <div style={{ minWidth: 0 }}>
              <ArchiveObject row={row} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ font: '500 12.5px var(--font-mono)' }}>{formatDate(row.attached_at)}</div>
              <div style={{ font: '500 12.5px var(--font-mono)', color: 'var(--color-text-placeholder)', marginTop: 2 }}>
                → {formatDate(row.detached_at)}
              </div>
            </div>
          </TableRow>
        )
        return row.exists ? (
          <Link key={key} to={`/${ARCHIVE_OBJECT_PATH[row.kind]}/${row.object.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
            {inner}
          </Link>
        ) : (
          <div key={key}>{inner}</div>
        )
      })}
    </Table>
  )
}

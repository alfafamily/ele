import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useNavigationType, useParams } from 'react-router-dom'
import { unassignEquipment } from '../equipment/equipmentApi.js'
import { unassignUnits as unassignToolUnits } from '../tools/toolsApi.js'
import { AssignToolModal } from '../tools/AssignToolModal.jsx'
import { DetachToStorageModal } from './DetachToStorageModal.jsx'
import { Can, usePermissions } from '../../app/usePermissions.js'
import { ActionMenu, BackButton, Button, Card, ConfirmModal, Icon, Spinner, StatusPill, Table, TabBar, TableRow } from '../../shared/ui'
import { useMediaQuery } from '../../shared/hooks/useMediaQuery.js'
import { useScrollRestoration } from '../../shared/hooks/useScrollRestoration.js'
import { readListCache, writeListCache } from '../../shared/listCache.js'
import { nameInitials } from '../../shared/employeeName.js'
import { getEmployee, getEmployeeIssuedArchive, restoreEmployee, uploadEmployeeAvatar } from './employeesApi.js'
import { AttachOrCreateModal } from './AttachOrCreateModal.jsx'
import { PassInfo } from './PassInfo.jsx'
import { PassDisposeModal } from './PassDisposeModal.jsx'
import { SimCardInfo } from './SimCardInfo.jsx'
import { SimDisposeModal } from './SimDisposeModal.jsx'
import { TerminateModal } from './TerminateModal.jsx'

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
                color: 'var(--color-text-muted)',
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
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{ fontSize: 16, fontWeight: 600 }}>Закреплённое оборудование</div>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', background: 'var(--color-fill-active-tint)', padding: '2px 9px', borderRadius: 20 }}>
              {employee.equipment.length}
            </span>
            {employee.is_employed ? (
              <Can perm="canManageEquipment">
                <AddButton isMobile={isMobile} onClick={() => setEquipmentAttach(true)} label="Закрепить оборудование" />
              </Can>
            ) : null}
          </div>
          {employee.equipment.length === 0 ? (
            <div style={{ fontSize: 13.5, color: 'var(--color-text-muted)' }}>За сотрудником не закреплено оборудование.</div>
          ) : (
            employee.equipment.map((eq) => (
              <div key={eq.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 13px', background: 'var(--color-fill-input)', borderRadius: 10, marginBottom: 8 }}>
                <Link to={`/equipment/${eq.id}`} style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--color-text-primary)' }}>{eq.type_and_model}</div>
                  <div style={{ font: '500 12px var(--font-mono)', color: 'var(--color-text-placeholder)' }}>{eq.inventory_number}</div>
                </Link>
                <Can perm="canManageEquipment">
                  <Button variant="secondary" onClick={() => setDetach({ kind: 'equipment', obj: eq })}>
                    Открепить
                  </Button>
                </Can>
                <Link to={`/equipment/${eq.id}`} style={{ width: 28, height: 28, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="chevron-right" size={16} strokeWidth={2} style={{ color: '#C7C9D4' }} />
                </Link>
              </div>
            ))
          )}
        </Card>

        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{ fontSize: 16, fontWeight: 600 }}>Инструменты</div>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', background: 'var(--color-fill-active-tint)', padding: '2px 9px', borderRadius: 20 }}>
              {employee.tools.length}
            </span>
            {employee.is_employed ? (
              <Can perm="canManageEquipment">
                <AddButton isMobile={isMobile} onClick={() => setToolAssign(true)} label="Закрепить инструмент" />
              </Can>
            ) : null}
          </div>
          {employee.tools.length === 0 ? (
            <div style={{ fontSize: 13.5, color: 'var(--color-text-muted)' }}>За сотрудником не закреплены инструменты.</div>
          ) : (
            employee.tools.map((tool) => (
              <div key={tool.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 13px', background: 'var(--color-fill-input)', borderRadius: 10, marginBottom: 8 }}>
                <Link to={`/tools/${tool.id}`} style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--color-text-primary)' }}>{tool.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-placeholder)' }}>{tool.quantity} шт.</div>
                </Link>
                {employee.is_employed ? (
                  <Can perm="canManageEquipment">
                    <Button variant="secondary" onClick={() => setDetach({ kind: 'tool', obj: tool })}>
                      Открепить
                    </Button>
                  </Can>
                ) : null}
                <Link to={`/tools/${tool.id}`} style={{ width: 28, height: 28, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="chevron-right" size={16} strokeWidth={2} style={{ color: '#C7C9D4' }} />
                </Link>
              </div>
            ))
          )}
        </Card>

        {employee.workplaces?.length ? (
          <Card>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div style={{ fontSize: 16, fontWeight: 600 }}>Рабочие места</div>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', background: 'var(--color-fill-active-tint)', padding: '2px 9px', borderRadius: 20 }}>
                {employee.workplaces.length}
              </span>
            </div>
            {employee.workplaces.map((wp) => (
              <div key={wp.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 13px', background: 'var(--color-fill-input)', borderRadius: 10, marginBottom: 8 }}>
                <Icon name="briefcase" size={18} strokeWidth={2} style={{ color: 'var(--color-text-muted)', flex: 'none' }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600 }}>{wp.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-placeholder)' }}>{wp.location}</div>
                </div>
              </div>
            ))}
          </Card>
        ) : null}

        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{ fontSize: 16, fontWeight: 600 }}>Корпоративная связь</div>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', background: 'var(--color-fill-active-tint)', padding: '2px 9px', borderRadius: 20 }}>
              {employee.sim_cards.length}
            </span>
            {employee.is_employed ? (
              <Can perm="canManageEmployees">
                <AddButton isMobile={isMobile} onClick={() => setSimAttach(true)} label="Добавить SIM-карту" />
              </Can>
            ) : null}
          </div>
          {employee.sim_cards.length === 0 ? (
            <div style={{ fontSize: 13.5, color: 'var(--color-text-muted)' }}>За сотрудником не закреплено SIM-карт.</div>
          ) : (
            employee.sim_cards.map((sim) => (
              <div key={sim.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 13px', background: 'var(--color-fill-input)', borderRadius: 10, marginBottom: 8 }}>
                <SimCardInfo sim={sim} />
                {employee.is_employed ? (
                  <Can perm="canManageEmployees">
                    <div className="ele-card-actions-desktop">
                      <Button variant="secondary" onClick={() => navigate(`/sim-cards/${sim.id}/edit`)}>
                        Изменить
                      </Button>
                      <Button variant="secondary" onClick={() => askDetachSim(sim)}>
                        Открепить
                      </Button>
                    </div>
                    <div className="ele-card-actions-mobile">
                      <ActionMenu
                        items={[
                          { label: 'Изменить', onClick: () => navigate(`/sim-cards/${sim.id}/edit`) },
                          { label: 'Открепить', onClick: () => askDetachSim(sim) },
                        ]}
                      />
                    </div>
                  </Can>
                ) : null}
              </div>
            ))
          )}
        </Card>

        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{ fontSize: 16, fontWeight: 600 }}>Средства доступа</div>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', background: 'var(--color-fill-active-tint)', padding: '2px 9px', borderRadius: 20 }}>
              {employee.passes.length}
            </span>
            {employee.is_employed ? (
              <Can perm="canManageEmployees">
                <AddButton isMobile={isMobile} onClick={() => setPassAttach(true)} label="Добавить средство доступа" />
              </Can>
            ) : null}
          </div>
          {employee.passes.length === 0 ? (
            <div style={{ fontSize: 13.5, color: 'var(--color-text-muted)' }}>За сотрудником не закреплено средств доступа.</div>
          ) : (
            employee.passes.map((pass) => (
              <div key={pass.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 13px', background: 'var(--color-fill-input)', borderRadius: 10, marginBottom: 8 }}>
                <PassInfo pass={pass} />
                {employee.is_employed ? (
                  <Can perm="canManageEmployees">
                    <div className="ele-card-actions-desktop">
                      <Button variant="secondary" onClick={() => navigate(`/passes/${pass.id}/edit`)}>
                        Изменить
                      </Button>
                      <Button variant="secondary" onClick={() => askDetachPass(pass)}>
                        Открепить
                      </Button>
                    </div>
                    <div className="ele-card-actions-mobile">
                      <ActionMenu
                        items={[
                          { label: 'Изменить', onClick: () => navigate(`/passes/${pass.id}/edit`) },
                          { label: 'Открепить', onClick: () => askDetachPass(pass) },
                        ]}
                      />
                    </div>
                  </Can>
                ) : null}
              </div>
            ))
          )}
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
          title={detach.kind === 'tool' ? 'Открепить инструмент на склад' : 'Открепить оборудование на склад'}
          description={
            detach.kind === 'tool'
              ? `Все ${detach.obj.quantity} шт. «${detach.obj.name}» вернутся на выбранный склад.`
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

// Кнопка добавления в заголовке блока: на десктопе «+ Добавить»; на мобилке —
// квадратная кнопка-иконка «+» того же размера, что и кнопки-меню «…».
function AddButton({ isMobile, onClick, label }) {
  return (
    <Button
      variant="secondary"
      onClick={onClick}
      aria-label={label}
      title={isMobile ? label : undefined}
      style={
        isMobile
          ? { marginLeft: 'auto', flex: 'none', width: 'var(--control-height)', minWidth: 'var(--control-height)', padding: 0 }
          : { marginLeft: 'auto', flex: 'none' }
      }
    >
      <Icon name="plus" size={isMobile ? 20 : 18} strokeWidth={2.2} />
      {isMobile ? null : 'Добавить'}
    </Button>
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

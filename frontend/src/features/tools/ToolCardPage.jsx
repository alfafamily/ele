import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { usePermissions } from '../../app/usePermissions.js'
import { nameInitials } from '../../shared/employeeName.js'
import { HistoryList } from '../../shared/HistoryList.jsx'
import { ActionMenu, BackButton, Button, Card, Icon, Spinner } from '../../shared/ui'
import { QuantityMoveModal } from './QuantityMoveModal.jsx'
import { ToolWriteOffModal } from './ToolWriteOffModal.jsx'
import {
  addUnits,
  assignUnits,
  getTool,
  getToolHistoryPath,
  unassignUnits,
  writeOffUnits,
} from './toolsApi.js'

export function ToolCardPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const perms = usePermissions()
  const [tool, setTool] = useState(null)
  const [loadError, setLoadError] = useState(false)
  const [showWriteOff, setShowWriteOff] = useState(false)
  const [moveModal, setMoveModal] = useState(null)
  const [historyKey, setHistoryKey] = useState(0)

  const load = useCallback(() => {
    setLoadError(false)
    getTool(id)
      .then((data) => {
        setTool(data)
        setHistoryKey((k) => k + 1)
      })
      .catch(() => setLoadError(true))
  }, [id])

  useEffect(load, [load])

  if (loadError) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: 60, textAlign: 'center' }}>
        <div style={{ fontSize: 16, fontWeight: 600 }}>Не удалось открыть инструмент</div>
        <Link to="/tools">
          <Button variant="secondary">К списку инструментов</Button>
        </Link>
      </div>
    )
  }

  if (!tool) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
        <Spinner />
      </div>
    )
  }

  const closeMove = () => {
    setMoveModal(null)
    load()
  }

  return (
    <div>
      <div className="ele-only-desktop" style={{ fontSize: 13, color: 'var(--color-text-placeholder)', marginBottom: 10 }}>
        <Link to="/tools" style={{ color: 'var(--color-text-muted)' }}>
          Инструменты
        </Link>{' '}
        / {tool.name}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
          <BackButton />
          <h1 className="ele-card-title">{tool.name}</h1>
        </div>
        {!tool.is_written_off && perms.canManageEquipment ? (
          <>
            <div className="ele-card-actions-desktop">
              <Button variant="danger" onClick={() => setShowWriteOff(true)}>
                Списать
              </Button>
              <Link to={`/tools/${tool.id}/edit`}>
                <Button>Редактировать</Button>
              </Link>
            </div>
            <div className="ele-card-actions-mobile">
              <ActionMenu
                items={[
                  { label: 'Редактировать', onClick: () => navigate(`/tools/${tool.id}/edit`) },
                  { label: 'Списать', danger: true, onClick: () => setShowWriteOff(true) },
                ]}
              />
            </div>
          </>
        ) : null}
      </div>

      {/* Двухколоночная раскладка: слева — основные блоки и История (в общем
          потоке, чтобы отступ до Истории не зависел от высоты боковой колонки),
          справа — липкие блоки остатка/закреплений. На мобильных (ele-card-grid
          ≤900px) схлопывается в одну колонку. */}
      <div className="ele-card-grid" style={{ gridTemplateColumns: tool.is_written_off ? 'minmax(0, 1fr)' : undefined }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          <Card>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Основная информация</div>
            <div className="ele-field-grid">
              <Field label="Наименование" value={tool.name} />
              {tool.is_written_off ? <Field label="Статус" value="Списано" /> : null}
            </div>
          </Card>

          <Card>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Дополнительные поля</div>
            {tool.custom_fields.length === 0 ? (
              <div style={{ fontSize: 13.5, color: 'var(--color-text-muted)' }}>Дополнительных полей нет.</div>
            ) : (
              <div className="ele-field-grid">
                {tool.custom_fields.map((cf) => (
                  <Field key={cf.id} label={cf.name} value={cf.value} />
                ))}
              </div>
            )}
          </Card>

          <Card>
            <HistoryList path={getToolHistoryPath(tool.id)} reloadKey={historyKey} />
          </Card>
        </div>

        {!tool.is_written_off ? (
          <div className="ele-card-sticky" style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
            <Card>
              <QuantityStock tool={tool} canManage={perms.canManageEquipment} setMoveModal={setMoveModal} closeMove={closeMove} />
            </Card>
            <Card>
              <QuantityAssignments tool={tool} canManage={perms.canManageEquipment} setMoveModal={setMoveModal} closeMove={closeMove} />
            </Card>
          </div>
        ) : null}
      </div>

      {showWriteOff ? (
        <ToolWriteOffModal
          tool={tool}
          onClose={() => setShowWriteOff(false)}
          onDone={() => {
            setShowWriteOff(false)
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

function QuantityStock({ tool, canManage, setMoveModal, closeMove }) {
  const openAdd = () =>
    setMoveModal({
      title: 'Оприходовать',
      confirmLabel: 'Оприходовать',
      onSubmit: (qty, comment) => addUnits(tool.id, qty, comment).then(closeMove),
    })
  const openWriteOff = () =>
    setMoveModal({
      title: 'Списать единицы',
      confirmLabel: 'Списать',
      max: tool.free,
      onSubmit: (qty, comment) => writeOffUnits(tool.id, qty, comment).then(closeMove),
    })

  return (
    <>
      <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 14 }}>Остаток</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <Metric label="Остаток" value={tool.quantity} />
        <Metric label="Свободно" value={tool.free} />
        <Metric label="Закреплено" value={tool.allocated} />
      </div>
      {canManage ? (
        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <Button variant="secondary" fullWidth onClick={openAdd} aria-label="Оприходовать">
            <Icon name="plus" size={18} strokeWidth={2.2} />
            <span className="ele-only-desktop">Оприходовать</span>
          </Button>
          <Button variant="secondary" fullWidth onClick={openWriteOff} disabled={tool.free <= 0} aria-label="Списать">
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

function QuantityAssignments({ tool, canManage, setMoveModal, closeMove }) {
  const allocations = tool.allocations || []

  const openAssign = () =>
    setMoveModal({
      title: 'Закрепить',
      confirmLabel: 'Закрепить',
      mode: 'assign',
      max: tool.free,
      onSubmit: (qty, comment, employeeId) => assignUnits(tool.id, employeeId, qty, comment).then(closeMove),
    })
  const openUnassign = (alloc) =>
    setMoveModal({
      title: 'Открепить',
      confirmLabel: 'Открепить',
      mode: 'fixed-employee',
      fixedEmployee: { id: alloc.employee, name: alloc.employee_name },
      max: alloc.quantity,
      onSubmit: (qty, comment, employeeId) => unassignUnits(tool.id, employeeId, qty, comment).then(closeMove),
    })

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ fontSize: 16, fontWeight: 600 }}>Закреплено за</div>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', background: 'var(--color-fill-active-tint)', padding: '2px 9px', borderRadius: 20 }}>
          {tool.allocated} / {tool.quantity}
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
                <button type="button" title="Открепить" onClick={() => openUnassign(a)} style={{ width: 30, height: 30, flex: 'none', borderRadius: 8, background: '#fff', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="x" size={16} strokeWidth={2} />
                </button>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {canManage ? (
        <Button fullWidth style={{ marginTop: 14 }} onClick={openAssign} disabled={tool.free <= 0}>
          <Icon name="plus" size={18} strokeWidth={2.2} />
          Закрепить
        </Button>
      ) : null}
    </>
  )
}

function Field({ label, value }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 12, color: 'var(--color-text-placeholder)', marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 500, overflowWrap: 'break-word' }}>{value || '—'}</div>
    </div>
  )
}

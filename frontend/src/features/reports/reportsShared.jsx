import { useState } from 'react'
import { BackButton, Icon } from '../../shared/ui'
import './reports.css'

// Общие презентационные части отчётов B45.

export function ReportShell({ title, filters, children }) {
  return (
    <div>
      <div className="ele-page-head" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <BackButton />
          <h1 style={{ fontSize: 'var(--font-size-h1)', fontWeight: 600, letterSpacing: 'var(--font-h1-letter-spacing)', margin: 0 }}>
            {title}
          </h1>
        </div>
      </div>
      {filters ? <div style={{ marginBottom: 16 }}>{filters}</div> : null}
      {children}
    </div>
  )
}

// Строка фильтров отчёта: несколько селектов в ряд, переносятся на мобильном.
export function FilterRow({ children }) {
  return <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>{children}</div>
}

const CARD = {
  background: 'var(--color-surface)', borderRadius: 14, boxShadow: 'inset 0 0 0 1px var(--color-border)',
}
const MUTED = { color: 'var(--color-text-placeholder)' }
const GROUP_LABEL = {
  fontSize: 11, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase',
  color: 'var(--color-text-placeholder)', margin: '10px 0 6px',
}

// --- Заголовок раскрывающейся карточки --------------------------------------

export function ExpandCard({ icon, iconTitle, title, subtitle, summary, empty, children }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ ...CARD, marginBottom: 8 }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 11, width: '100%', padding: '12px 14px',
          background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
        }}
      >
        <Icon name={open ? 'chevron-right' : 'chevron-right'} size={16} strokeWidth={2.4}
          style={{ color: 'var(--color-text-placeholder)', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s', flex: 'none' }} />
        {icon ? <Icon name={icon} size={16} strokeWidth={2} title={iconTitle} style={{ color: 'var(--color-text-muted)', flex: 'none' }} /> : null}
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 14.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
          {subtitle ? <span style={{ display: 'block', fontSize: 12, ...MUTED, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{subtitle}</span> : null}
        </span>
        <span style={{ fontSize: 12.5, ...MUTED, flex: 'none' }}>{empty ? 'пусто' : summary}</span>
      </button>
      {open ? <div style={{ padding: '0 14px 14px 41px' }}>{children}</div> : null}
    </div>
  )
}

// --- Списки объектов --------------------------------------------------------

function Line({ icon, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 13.5 }}>
      <Icon name={icon} size={14} strokeWidth={2} style={{ color: 'var(--color-text-muted)', flex: 'none' }} />
      <span style={{ minWidth: 0 }}>{children}</span>
    </div>
  )
}

function EquipmentLine({ eq }) {
  return (
    <div style={{ padding: '4px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5 }}>
        <Icon name="cpu" size={14} strokeWidth={2} style={{ color: 'var(--color-text-muted)', flex: 'none' }} />
        <span style={{ minWidth: 0 }}>
          <b style={{ fontWeight: 600 }}>{eq.type_and_model}</b> <span style={MUTED}>№ {eq.inventory_number}</span>
        </span>
      </div>
      {eq.sim?.length || eq.licenses?.length ? (
        <div style={{ paddingLeft: 22 }}>
          {eq.sim.map((s) => (
            <Line key={`s${s.id}`} icon="radio-tower">
              {s.phone_number} <span style={MUTED}>· {s.sim_type}{s.operator ? ` · ${s.operator}` : ''}</span>
            </Line>
          ))}
          {eq.licenses.map((l) => (
            <Line key={`l${l.id}`} icon="scroll-text">
              {l.license_type_name}
            </Line>
          ))}
        </div>
      ) : null}
    </div>
  )
}

// Блок «Имущество» места: оборудование (с вложенными SIM/лицензиями) + инструменты.
export function PropertyBlock({ equipment, tools }) {
  const empty = !equipment.length && !tools.length
  if (empty) return <div style={{ fontSize: 13, ...MUTED, padding: '4px 0' }}>Имущество не закреплено.</div>
  return (
    <div>
      {equipment.length ? (
        <>
          <div style={GROUP_LABEL}>Оборудование</div>
          {equipment.map((eq) => <EquipmentLine key={eq.id} eq={eq} />)}
        </>
      ) : null}
      {tools.length ? (
        <>
          <div style={GROUP_LABEL}>Инструменты</div>
          {tools.map((t) => (
            <Line key={t.id} icon="hammer">{t.name} <span style={MUTED}>× {t.quantity}</span></Line>
          ))}
        </>
      ) : null}
    </div>
  )
}

// Блок имущества, закреплённого напрямую за сотрудником: оборудование (с
// вложенными SIM/лицензиями), инструменты, SIM за сотрудником, пропуска/ключи,
// транспорт.
export function EmployeePropertyBlock({ emp }) {
  const empty = !emp.equipment.length && !emp.tools.length && !emp.sim.length && !emp.passes.length && !emp.transport.length
  if (empty) return <div style={{ fontSize: 13, ...MUTED, padding: '4px 0' }}>Имущество не закреплено.</div>
  return (
    <div>
      {emp.equipment.length ? (
        <>
          <div style={GROUP_LABEL}>Оборудование</div>
          {emp.equipment.map((eq) => <EquipmentLine key={eq.id} eq={eq} />)}
        </>
      ) : null}
      {emp.tools.length ? (
        <>
          <div style={GROUP_LABEL}>Инструменты</div>
          {emp.tools.map((t) => <Line key={t.id} icon="hammer">{t.name} <span style={MUTED}>× {t.quantity}</span></Line>)}
        </>
      ) : null}
      {emp.sim.length ? (
        <>
          <div style={GROUP_LABEL}>SIM</div>
          {emp.sim.map((s) => <Line key={s.id} icon="radio-tower">{s.phone_number} <span style={MUTED}>· {s.sim_type}{s.operator ? ` · ${s.operator}` : ''}</span></Line>)}
        </>
      ) : null}
      {emp.passes.length ? (
        <>
          <div style={GROUP_LABEL}>Пропуска и ключи</div>
          {emp.passes.map((p) => <Line key={p.id} icon="key-round">{p.kind_display}{p.account_number ? <span style={MUTED}> · {p.account_number}</span> : null}</Line>)}
        </>
      ) : null}
      {emp.transport.length ? (
        <>
          <div style={GROUP_LABEL}>Транспорт</div>
          {emp.transport.map((t) => <Line key={t.id} icon="car"><b style={{ fontWeight: 600 }}>{t.type_and_model}</b> <span style={MUTED}>{[t.plate, `№ ${t.inventory_number}`].filter(Boolean).join(' · ')}</span></Line>)}
        </>
      ) : null}
    </div>
  )
}

// Чипы сотрудников (за рабочим местом).
export function EmployeeChips({ employees }) {
  if (!employees.length) return null
  return (
    <>
      <div style={GROUP_LABEL}>Сотрудники</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 4 }}>
        {employees.map((e) => (
          <span key={e.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, padding: '4px 10px', borderRadius: 999, background: 'var(--color-fill-input)' }}>
            <Icon name="user" size={13} strokeWidth={2} style={{ color: 'var(--color-text-muted)' }} />
            {e.name}{e.position ? <span style={MUTED}>· {e.position}</span> : null}
          </span>
        ))}
      </div>
    </>
  )
}

// Заголовки здание/помещение в дереве отчёта.
export function BuildingHead({ name }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '18px 0 8px' }}>
      <Icon name="building-2" size={17} strokeWidth={2} style={{ color: 'var(--color-text-muted)' }} />
      <span style={{ fontSize: 16, fontWeight: 700 }}>{name}</span>
    </div>
  )
}

export function RoomHead({ name, floor }) {
  return (
    <div style={{ fontSize: 12.5, fontWeight: 600, ...MUTED, margin: '10px 0 6px', paddingLeft: 2 }}>
      {name}{floor ? ` · этаж ${floor}` : ''}
    </div>
  )
}

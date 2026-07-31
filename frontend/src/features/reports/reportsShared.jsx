import { useState } from 'react'
import { AcceptanceIcon } from '../../shared/AcceptanceIcon.jsx'
import { BackButton, Button, Card, Icon, MultiSelectList } from '../../shared/ui'
import { Tooltip } from '../../shared/Tooltip.jsx'
import './reports.css'

// Общие презентационные части отчётов B45.
// Хук каскадного мультивыбора здание/помещение/место — в useLocationFilter.js.

// Три мультивыбора здание/помещение/место в ряд (на мобилке — друг под другом).
export function LocationFilters({ buildings, state }) {
  const { buildingIds, roomIds, placeIds, toggleBuilding, toggleRoom, togglePlace, roomOptions, placeOptions } = state
  const label = { fontSize: 12, color: 'var(--color-text-placeholder)', marginBottom: 6 }
  return (
    <div className="ele-report-place-filters">
      <div>
        <div style={label}>Здания</div>
        <MultiSelectList options={buildings.map((b) => ({ value: String(b.id), label: b.name }))} selected={buildingIds} onToggle={toggleBuilding} search chips emptyText="Зданий нет" />
      </div>
      <div>
        <div style={label}>Помещения</div>
        <MultiSelectList options={roomOptions} selected={roomIds} onToggle={toggleRoom} search chips emptyText="Помещений нет" />
      </div>
      <div>
        <div style={label}>Места</div>
        <MultiSelectList options={placeOptions} selected={placeIds} onToggle={togglePlace} search chips emptyText="Мест нет" />
      </div>
    </div>
  )
}

function ReportHead({ title, onBack }) {
  return (
    <div className="ele-page-head" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <BackButton onClick={onBack} />
        <h1 style={{ fontSize: 'var(--font-size-h1)', fontWeight: 600, letterSpacing: 'var(--font-h1-letter-spacing)', margin: 0 }}>
          {title}
        </h1>
      </div>
    </div>
  )
}

// Двухэтапный отчёт: сначала экран подбора фильтров на белой подложке-карточке
// (как блок «Размещение» в формах), по кнопке «Показать отчёт» — экран самого
// отчёта с возвратом к фильтрам («Изменить фильтры» и стрелка «Назад»).
export function ReportTwoStage({ title, filterTitle, filterHint, filters, children }) {
  const [shown, setShown] = useState(false)
  if (!shown) {
    return (
      <div>
        <ReportHead title={title} />
        <Card>
          {filterTitle ? (
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: filterHint ? 6 : 16 }}>{filterTitle}</div>
          ) : null}
          {filterHint ? (
            <div style={{ fontSize: 13, color: 'var(--color-text-placeholder)', marginBottom: 14 }}>{filterHint}</div>
          ) : null}
          {filters}
          <div style={{ marginTop: 18 }}>
            <Button fullWidth onClick={() => setShown(true)}>Показать отчёт</Button>
          </div>
        </Card>
      </div>
    )
  }
  // На экране отчёта стрелка «Назад» возвращает к подбору фильтров.
  return (
    <div>
      <ReportHead title={title} onBack={() => setShown(false)} />
      {children}
    </div>
  )
}

const CARD = {
  background: 'var(--color-surface)', borderRadius: 14, boxShadow: 'inset 0 0 0 1px var(--color-border)',
}
const MUTED = { color: 'var(--color-text-placeholder)' }

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
        {icon ? <Tooltip label={iconTitle} style={{ flex: 'none' }}><Icon name={icon} size={16} strokeWidth={2} style={{ color: 'var(--color-text-muted)', flex: 'none' }} /></Tooltip> : null}
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

// Категория имущества: подпись слева, объекты справа (двухколоночно; на узком
// экране подпись встаёт над списком — см. reports.css).
function CategoryRow({ label, children }) {
  return (
    <div className="ele-report-cat">
      <div className="ele-report-cat__label">{label}</div>
      <div className="ele-report-cat__items">{children}</div>
    </div>
  )
}

// Ведущий слот статуса акцепта (B32): иконка ПЕРЕД иконкой объекта. Слот
// резервируется, только если проп статуса передан (даже null — контекст акцепта),
// чтобы иконки объектов выравнивались; в отчётах по местам статуса нет — слота нет.
function StatusSlot({ status }) {
  if (status === undefined) return null
  return (
    <span style={{ width: 15, flex: 'none', display: 'inline-flex', justifyContent: 'center' }}>
      {status ? <AcceptanceIcon status={status} size={14} /> : null}
    </span>
  )
}

function Line({ icon, status, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13.5 }}>
      <StatusSlot status={status} />
      <Icon name={icon} size={14} strokeWidth={2} style={{ color: 'var(--color-text-muted)', flex: 'none' }} />
      <span style={{ minWidth: 0 }}>{children}</span>
    </div>
  )
}

function EquipmentLine({ eq, acceptance }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13.5 }}>
        <StatusSlot status={acceptance} />
        <Icon name="cpu" size={14} strokeWidth={2} style={{ color: 'var(--color-text-muted)', flex: 'none' }} />
        <span style={{ minWidth: 0 }}>
          {eq.type_and_model} <span style={MUTED}>№ {eq.inventory_number}</span>
        </span>
      </div>
      {eq.sim?.length || eq.licenses?.length ? (
        <div style={{ paddingLeft: 22, marginTop: 2 }}>
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

// Блок имущества, закреплённого напрямую за сотрудником: оборудование (с
// вложенными SIM/лицензиями), инструменты, SIM за сотрудником, пропуска/ключи,
// транспорт. У каждого объекта — иконка статуса акцепта (B32).
export function EmployeePropertyBlock({ emp }) {
  const empty = !emp.equipment.length && !emp.tools.length && !emp.sim.length && !emp.passes.length && !emp.transport.length
  if (empty) return <div style={{ fontSize: 13, ...MUTED, padding: '4px 0' }}>Имущество не закреплено.</div>
  return (
    <div>
      {emp.equipment.length ? (
        <CategoryRow label="Оборудование">
          {emp.equipment.map((eq) => <EquipmentLine key={eq.id} eq={eq} acceptance={eq.acceptance_status} />)}
        </CategoryRow>
      ) : null}
      {emp.tools.length ? (
        <CategoryRow label="Инструменты">
          {emp.tools.map((t) => <Line key={t.id} icon="hammer" status={t.acceptance_status}>{t.name} <span style={MUTED}>× {t.quantity}</span></Line>)}
        </CategoryRow>
      ) : null}
      {emp.sim.length ? (
        <CategoryRow label="SIM">
          {emp.sim.map((s) => <Line key={s.id} icon="radio-tower" status={s.acceptance_status}>{s.phone_number} <span style={MUTED}>· {s.sim_type}{s.operator ? ` · ${s.operator}` : ''}</span></Line>)}
        </CategoryRow>
      ) : null}
      {emp.passes.length ? (
        <CategoryRow label="Пропуска и ключи">
          {emp.passes.map((p) => <Line key={p.id} icon="key-round" status={p.acceptance_status}>{p.kind_display}{p.account_number ? <span style={MUTED}> · {p.account_number}</span> : null}</Line>)}
        </CategoryRow>
      ) : null}
      {emp.transport.length ? (
        <CategoryRow label="Транспорт">
          {emp.transport.map((t) => <Line key={t.id} icon="car" status={t.acceptance_status}>{t.type_and_model} <span style={MUTED}>{[t.plate, `№ ${t.inventory_number}`].filter(Boolean).join(' · ')}</span></Line>)}
        </CategoryRow>
      ) : null}
    </div>
  )
}

// Тело места в отчётах по местам: единый стиль CategoryRow — сотрудники (только
// для рабочих мест) + оборудование (с вложенными SIM/лицензиями) + инструменты.
export function PlaceBody({ employees = [], equipment, tools, withEmployees }) {
  const hasEmployees = withEmployees && employees.length > 0
  if (!hasEmployees && !equipment.length && !tools.length) {
    return <div style={{ fontSize: 13, ...MUTED, padding: '4px 0' }}>Ничего не закреплено.</div>
  }
  return (
    <div>
      {hasEmployees ? (
        <CategoryRow label="Сотрудники">
          {employees.map((e) => (
            <Line key={e.id} icon="user">{e.name}{e.position ? <span style={MUTED}> · {e.position}</span> : null}</Line>
          ))}
        </CategoryRow>
      ) : null}
      {equipment.length ? (
        <CategoryRow label="Оборудование">
          {equipment.map((eq) => <EquipmentLine key={eq.id} eq={eq} />)}
        </CategoryRow>
      ) : null}
      {tools.length ? (
        <CategoryRow label="Инструменты">
          {tools.map((t) => <Line key={t.id} icon="hammer">{t.name} <span style={MUTED}>× {t.quantity}</span></Line>)}
        </CategoryRow>
      ) : null}
    </div>
  )
}

// Рабочие места сотрудника (в отчёте по сотрудникам) — тем же CategoryRow: слева
// название места + адрес, справа его имущество. Единый стиль с «Закреплённым
// имуществом», без отдельных подложек.
export function WorkplaceBlock({ workplaces }) {
  return (
    <div>
      {workplaces.map((w) => {
        const label = (
          <>
            <span style={{ display: 'block', color: 'var(--color-text-primary)', fontWeight: 600 }}>{w.name}</span>
            <span style={{ display: 'block' }}>{w.building_name} — {w.room_name}</span>
          </>
        )
        const empty = !w.equipment.length && !w.tools.length
        return (
          <CategoryRow key={w.id} label={label}>
            {empty ? <div style={{ fontSize: 13, ...MUTED }}>Имущество не размещено.</div> : null}
            {w.equipment.map((eq) => <EquipmentLine key={eq.id} eq={eq} />)}
            {w.tools.map((t) => <Line key={`t${t.id}`} icon="hammer">{t.name} <span style={MUTED}>× {t.quantity}</span></Line>)}
          </CategoryRow>
        )
      })}
    </div>
  )
}

// Заголовок секции внутри раскрытой карточки сотрудника («Закреплённое
// имущество» / «Рабочие места»).
export function SectionHead({ children, first }) {
  return (
    <div style={{ fontSize: 13, fontWeight: 700, margin: first ? '2px 0 6px' : '16px 0 6px' }}>
      {children}
    </div>
  )
}

// Легенда статусов акцепта (B32) — над отчётом по сотрудникам.
export function AcceptanceLegend() {
  const items = [
    { status: 'accepted', label: 'Подтверждено' },
    { status: 'pending', label: 'Ожидает подтверждения' },
    { status: 'in_absentia', label: 'Заочно' },
  ]
  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center',
      background: 'var(--color-surface)', borderRadius: 12,
      boxShadow: 'inset 0 0 0 1px var(--color-border)', padding: '10px 14px',
    }}>
      {items.map((it) => (
        <span key={it.status} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, ...MUTED }}>
          <AcceptanceIcon status={it.status} size={14} />
          {it.label}
        </span>
      ))}
    </div>
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
    <div style={{
      display: 'flex', alignItems: 'center', gap: 7, margin: '12px 0 8px', paddingBottom: 6,
      borderBottom: '1px solid var(--color-border)',
    }}>
      <Icon name="map-pin" size={14} strokeWidth={2} style={{ color: 'var(--color-text-muted)', flex: 'none' }} />
      <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--color-text-secondary)' }}>{name}</span>
      {floor ? <span style={{ fontSize: 12, color: 'var(--color-text-placeholder)' }}>· этаж {floor}</span> : null}
    </div>
  )
}

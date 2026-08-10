import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { csvParam, reqParams } from '../../shared/filterParams.js'
import { apiGet } from '../../shared/api/client'
import { ListPage } from '../../shared/ListPage.jsx'
import { Button, Icon, RadioPills } from '../../shared/ui'
import { EquipmentMultiPicker } from '../../shared/EquipmentMultiPicker.jsx'
import { TruncatedText } from '../../shared/TruncatedText.jsx'
import { PlacementIcon } from '../../shared/PlacementIcon.jsx'
import { RemoteMultiSelect } from '../../shared/RemoteMultiSelect.jsx'
import { TypeRequisiteFilter } from '../../shared/TypeRequisiteFilter.jsx'

const CACHE_KEY = 'license-list'

const TABS = [
  { value: 'active', label: 'Активные' },
  { value: 'archive', label: 'Утилизированные' },
]
const KIND_FILTERS = [
  { value: 'all', label: 'Все' },
  { value: 'software', label: 'Программная' },
  { value: 'hardware', label: 'Аппаратная' },
]
// B27. «Размещение» — оборудование / место хранения (заменяет прежний «Статус»).
// Непривязанные лицензии (без оборудования и склада) ищутся спец-пунктом
// «Виртуальное хранение» в списке мест (см. UNATTACHED).
const ASSIGNED_OPTIONS = [
  { value: 'none', label: 'Не важно' },
  { value: 'equipment', label: 'Оборудование' },
  { value: 'storage', label: 'Место хранения' },
]
const UNATTACHED = '__unattached__'

const KIND_LABEL = { software: 'Программная', hardware: 'Аппаратная' }

const placeOption = (p) => ({ value: String(p.id), label: p.name, sub: `${p.building_name} — ${p.room_name}` })

const EMPTY_FILTERS = {
  types: [],
  req: {},
  kind: 'all',
  assignedMode: 'none',
  storagePlaces: [],
  equipment: [],
}

function countActive(f) {
  return (
    (f.types.length ? 1 : 0) +
    Object.keys(f.req).length +
    (f.kind !== 'all' ? 1 : 0) +
    (f.assignedMode !== 'none' ? 1 : 0)
  )
}

const ACTIVE_COLUMNS = [
  { key: 'license_type__name', label: 'Наименование', sortable: true, width: 'minmax(0, 1.4fr)' },
  { key: 'equipment__inventory_number', label: 'Оборудование/Место', sortable: true, width: 'minmax(0, 1fr)' },
  { key: 'chevron', label: '', width: '30px' },
]
const ARCHIVE_COLUMNS = [
  { key: 'license_type__name', label: 'Наименование', width: 'minmax(0, 1.4fr)' },
  { key: 'retired_at', label: 'Дата утилизации', width: '170px' },
  { key: 'chevron', label: '', width: '30px' },
]

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('ru-RU')
}

// virtualStorage — есть ли непривязанные лицензии (тогда в «Место хранения»
// показываем «Виртуальное хранение»); приходит из вызывающего компонента.
function licenseFilter(draft, setDraft, virtualStorage) {
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }))
  return {
    main: (
      <>
        <div>
          <div className="ele-filter-section__title">Тип</div>
          <RadioPills options={KIND_FILTERS} value={draft.kind} onChange={(v) => set({ kind: v })} />
        </div>
        <TypeRequisiteFilter
          endpoint="/api/license-types/"
          valuesBase="/api/licenses/field-values/"
          label="Вид лицензии"
          types={draft.types}
          onTypesChange={(t) => set({ types: t })}
          req={draft.req}
          onReqChange={(r) => set({ req: r })}
          excludeLockedFields
          filterKind={draft.kind}
        />
      </>
    ),
    aside: (
      <div>
        <div className="ele-filter-section__title">Размещение</div>
        <RadioPills options={ASSIGNED_OPTIONS} value={draft.assignedMode} onChange={(v) => set({ assignedMode: v })} />
        {draft.assignedMode === 'storage' ? (
          <div style={{ marginTop: 10 }}>
            <RemoteMultiSelect
              endpoint={`/api/places/?place_type=storage&active=1${draft.types.length ? `&has_license_type=${draft.types.join(',')}` : ''}`}
              mapOption={placeOption}
              selected={draft.storagePlaces}
              onChange={(p) => set({ storagePlaces: p })}
              extraOptions={virtualStorage ? [{ value: UNATTACHED, label: 'Виртуальное хранение' }] : undefined}
            />
          </div>
        ) : null}
        {draft.assignedMode === 'equipment' ? (
          <div style={{ marginTop: 10 }}>
            <EquipmentMultiPicker value={draft.equipment} onChange={(e) => set({ equipment: e })} licenseTypeIds={draft.types} />
          </div>
        ) : null}
      </div>
    ),
  }
}

function licenseRow(row, { tab }) {
  return (
    <>
      {/* B18: наименование = Вид лицензии; ниже — тип (программная/аппаратная) */}
      <div style={{ minWidth: 0 }}>
        <TruncatedText singleLine={false} className="ele-clamp-2" style={{ fontWeight: 600 }}>{row.license_type_name}</TruncatedText>
        <div style={{ color: 'var(--color-text-placeholder)', fontSize: 12.5, marginTop: 2 }}>{KIND_LABEL[row.license_type_kind] || ''}</div>
      </div>
      {tab === 'active' ? (
        // Размещение: за оборудованием (тип+модель+учётный номер) либо
        // свободная — на складе (место хранения с зданием/помещением).
        <div style={{ minWidth: 0 }}>
          {row.equipment_detail ? (
            <>
              <TruncatedText singleLine={false} className="ele-clamp-2">{row.equipment_detail.type_and_model}</TruncatedText>
              <div style={{ font: '500 12px var(--font-mono)', color: 'var(--color-text-placeholder)', marginTop: 2 }}>{row.equipment_detail.inventory_number}</div>
            </>
          ) : row.storage_place_detail ? (
            <>
              <TruncatedText singleLine={false} className="ele-clamp-2"><PlacementIcon placeType="storage" />{row.storage_place_detail.name}</TruncatedText>
              <div style={{ color: 'var(--color-text-placeholder)', fontSize: 12.5, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {row.storage_place_detail.building_name} — {row.storage_place_detail.room_name}
              </div>
            </>
          ) : row.license_type_kind === 'hardware' ? (
            <div className="ele-clamp-2"><PlacementIcon placeType="storage" />Без склада</div>
          ) : (
            <span style={{ color: 'var(--color-text-placeholder)' }}>Не хранится физически</span>
          )}
        </div>
      ) : (
        <div style={{ color: 'var(--color-text-placeholder)', font: '500 13px var(--font-mono)' }}>{formatDate(row.retired_at)}</div>
      )}
    </>
  )
}

export function LicenseListPage() {
  // Есть ли непривязанные лицензии — тогда в «Место хранения» показываем
  // «Виртуальное хранение».
  const [virtualStorage, setVirtualStorage] = useState(false)
  useEffect(() => {
    apiGet('/api/licenses/unattached-exists/')
      .then((d) => setVirtualStorage(!!d?.exists))
      .catch(() => {})
  }, [])

  return (
    <ListPage
      title="Лицензии"
      headerPerm="canManageLicenses"
      headerActions={
        <>
          <Link to="/license-types">
            <Button variant="secondary" title="Настроить виды" aria-label="Настроить виды">
              <span className="ele-only-desktop">Настроить виды</span>
              <Icon className="ele-only-mobile" name="columns-3-cog" size={20} strokeWidth={1.9} />
            </Button>
          </Link>
          <Link to="/licenses/new">
            <Button title="Добавить лицензию" aria-label="Добавить лицензию">
              <Icon className="ele-only-desktop" name="plus" size={18} strokeWidth={2.2} />
              <span className="ele-only-desktop">Добавить лицензию</span>
              <Icon className="ele-only-mobile" name="plus" size={22} strokeWidth={2.4} />
            </Button>
          </Link>
        </>
      }
      cacheKey={CACHE_KEY}
      endpoint="/api/licenses/"
      tabs={TABS}
      emptyFilters={EMPTY_FILTERS}
      filterCount={countActive}
      renderFilter={({ draft, setDraft }) => licenseFilter(draft, setDraft, virtualStorage)}
      buildParams={({ tab, isActive, filters, search, ordering }) => ({
        tab,
        type: isActive ? csvParam(filters.types) : undefined,
        ...(isActive ? reqParams(filters.req) : {}),
        kind: isActive && filters.kind !== 'all' ? filters.kind : undefined,
        assigned: isActive && filters.assignedMode !== 'none' ? filters.assignedMode : undefined,
        storage_place: isActive && filters.assignedMode === 'storage' ? csvParam(filters.storagePlaces.filter((v) => v !== UNATTACHED)) : undefined,
        storage_unattached: isActive && filters.assignedMode === 'storage' && filters.storagePlaces.includes(UNATTACHED) ? '1' : undefined,
        equipment: isActive && filters.assignedMode === 'equipment' ? csvParam(filters.equipment.map((e) => e.id)) : undefined,
        search: search || undefined,
        ordering,
      })}
      activeColumns={ACTIVE_COLUMNS}
      archiveColumns={ARCHIVE_COLUMNS}
      renderRow={licenseRow}
      rowLink={(row) => `/licenses/${row.id}`}
      emptyText={({ search, tab }) => ({
        title: search ? 'Ничего не найдено' : tab === 'archive' ? 'Утилизированных нет' : 'Пока пусто',
        description: search
          ? `По запросу «${search}» лицензии не найдены. Попробуйте изменить запрос или сбросить фильтры.`
          : tab === 'archive'
            ? 'Утилизированные лицензии будут отображаться здесь.'
            : 'Когда вы добавите лицензию, она будет отображаться здесь.',
        resetLabel: 'Сбросить фильтры',
      })}
    />
  )
}

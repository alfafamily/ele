import { useEffect, useState } from 'react'
import { apiGet } from './api/client'
import { MultiSelectList } from './ui/MultiSelectList/MultiSelectList.jsx'
import './ui/FilterModal/FilterModal.css'

// B27. Фильтр «Доступ в помещения» для Средств доступа: здания → помещения →
// места, иерархически. Дерево тянем одним запросом /api/buildings/.
//   - помещения фильтруются по выбранным зданиям, места — по выбранным помещениям;
//   - помещения показываются только после выбора здания, места — после помещения;
//   - список вариантов раскрывается только по вводу в поиск (hideUntilSearch);
//   - при выбранном Типе средства варианты ограничены реально используемыми
//     локациями этого типа (refIds).
// onChange(patch) — частичное обновление ({ buildings } | { rooms } | { places }).
const toggle = (arr, v) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v])

// Добавить к отфильтрованному списку опций полные записи уже выбранных значений,
// которых в нём нет (напр. отсеянных ограничением по типу средства) — чтобы их
// чипсы отображались с названием, а не с id. В сам список (для добавления) они не
// попадают: chips-режим убирает выбранные из списка.
function withSelected(filtered, selected, allMap) {
  const seen = new Set(filtered.map((o) => o.value))
  const extra = selected.map(String).filter((v) => !seen.has(v) && allMap[v]).map((v) => allMap[v])
  return [...filtered, ...extra]
}

export function PassAccessFilter({ buildings, rooms, places, onChange, objectType }) {
  const [tree, setTree] = useState(null)
  const [refIds, setRefIds] = useState(null)
  const kindActive = objectType && objectType !== 'all'

  useEffect(() => {
    let alive = true
    apiGet('/api/buildings/')
      .then((d) => alive && setTree(Array.isArray(d) ? d : d.results || []))
      .catch(() => alive && setTree([]))
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    if (!kindActive) {
      setRefIds(null)
      return
    }
    let alive = true
    apiGet(`/api/access-passes/referenced-locations/?object_type=${objectType}`)
      .then((d) => {
        if (!alive) return
        setRefIds({
          buildings: new Set((d.buildings || []).map(String)),
          rooms: new Set((d.rooms || []).map(String)),
          places: new Set((d.places || []).map(String)),
        })
      })
      .catch(() => alive && setRefIds({ buildings: new Set(), rooms: new Set(), places: new Set() }))
    return () => {
      alive = false
    }
  }, [objectType, kindActive])

  const loading = tree === null || (kindActive && refIds === null)
  const t = tree || []
  const inRef = (kind, id) => !refIds || refIds[kind].has(String(id))

  // Плоские карты дерева: связи и полные опции (с названиями) для чипсов.
  const roomBuilding = {}
  const placeRoom = {}
  const allBuildingOpt = {}
  const allRoomOpt = {}
  const allPlaceOpt = {}
  t.forEach((b) => {
    allBuildingOpt[String(b.id)] = { value: String(b.id), label: b.name }
    ;(b.rooms || []).forEach((r) => {
      roomBuilding[String(r.id)] = String(b.id)
      allRoomOpt[String(r.id)] = { value: String(r.id), label: r.name, sub: b.name }
      ;(r.places || []).forEach((p) => {
        placeRoom[String(p.id)] = String(r.id)
        allPlaceOpt[String(p.id)] = { value: String(p.id), label: p.name, sub: `${b.name} — ${r.name}` }
      })
    })
  })

  const buildingSel = new Set(buildings.map(String))
  const roomSel = new Set(rooms.map(String))

  const buildingOpts = withSelected(
    t.filter((b) => inRef('buildings', b.id)).map((b) => allBuildingOpt[String(b.id)]),
    buildings,
    allBuildingOpt,
  )
  const roomOpts = withSelected(
    Object.values(allRoomOpt).filter((o) => buildingSel.has(roomBuilding[o.value]) && inRef('rooms', o.value)),
    rooms,
    allRoomOpt,
  )
  const placeOpts = withSelected(
    Object.values(allPlaceOpt).filter((o) => roomSel.has(placeRoom[o.value]) && inRef('places', o.value)),
    places,
    allPlaceOpt,
  )

  // Каскад: снятие/смена здания подрезает помещения вне выбранных зданий, а те —
  // места вне выбранных помещений (иерархия «здание → помещение → место»).
  const toggleBuilding = (v) => {
    const nb = toggle(buildings, v)
    const nbSet = new Set(nb.map(String))
    const nr = rooms.filter((r) => nbSet.has(roomBuilding[String(r)]))
    const nrSet = new Set(nr.map(String))
    const np = places.filter((p) => nrSet.has(placeRoom[String(p)]))
    onChange({ buildings: nb, rooms: nr, places: np })
  }
  const toggleRoom = (v) => {
    const nr = toggle(rooms, v)
    const nrSet = new Set(nr.map(String))
    const np = places.filter((p) => nrSet.has(placeRoom[String(p)]))
    onChange({ rooms: nr, places: np })
  }
  const togglePlace = (v) => onChange({ places: toggle(places, v) })

  return (
    <>
      <div>
        <div className="ele-filter-section__title">Здания</div>
        <MultiSelectList options={buildingOpts} selected={buildings} onToggle={toggleBuilding} search hideUntilSearch loading={loading} chips emptyText="Ничего не найдено" />
      </div>
      {buildings.length > 0 ? (
        <div>
          <div className="ele-filter-section__title">Помещения</div>
          <MultiSelectList options={roomOpts} selected={rooms} onToggle={toggleRoom} search hideUntilSearch loading={loading} chips emptyText="Ничего не найдено" />
        </div>
      ) : null}
      {rooms.length > 0 ? (
        <div>
          <div className="ele-filter-section__title">Места</div>
          <MultiSelectList options={placeOpts} selected={places} onToggle={togglePlace} search hideUntilSearch loading={loading} chips emptyText="Ничего не найдено" />
        </div>
      ) : null}
    </>
  )
}

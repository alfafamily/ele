import { useEffect, useState } from 'react'
import { apiGet } from './api/client'
import { MultiSelectList } from './ui/MultiSelectList/MultiSelectList.jsx'
import './ui/FilterModal/FilterModal.css'

// B27. Фильтр «Доступ в помещения» для Средств доступа: отдельно здания /
// помещения / места (мультивыбор каждого). Дерево тянем одним запросом
// /api/buildings/ (здания→помещения→места с именами). onChange(patch) — частичное
// обновление ({ buildings } | { rooms } | { places }).
const toggle = (arr, v) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v])

export function PassAccessFilter({ buildings, rooms, places, onChange, objectType }) {
  const [tree, setTree] = useState(null)
  // B27. При выбранном Типе средства (Ключ/Пропуск) показываем только те
  // здания/помещения/места, что реально фигурируют в средствах доступа этого типа.
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
  const keep = (kind, id) => !refIds || refIds[kind].has(String(id))
  const buildingOpts = t.filter((b) => keep('buildings', b.id)).map((b) => ({ value: String(b.id), label: b.name }))
  const roomOpts = t.flatMap((b) =>
    (b.rooms || []).filter((r) => keep('rooms', r.id)).map((r) => ({ value: String(r.id), label: r.name, sub: b.name })),
  )
  const placeOpts = t.flatMap((b) =>
    (b.rooms || []).flatMap((r) =>
      (r.places || []).filter((p) => keep('places', p.id)).map((p) => ({ value: String(p.id), label: p.name, sub: `${b.name} — ${r.name}` })),
    ),
  )

  return (
    <>
      <div>
        <div className="ele-filter-section__title">Здания</div>
        <MultiSelectList options={buildingOpts} selected={buildings} onToggle={(v) => onChange({ buildings: toggle(buildings, v) })} search loading={loading} chips emptyText="Зданий пока нет" />
      </div>
      <div>
        <div className="ele-filter-section__title">Помещения</div>
        <MultiSelectList options={roomOpts} selected={rooms} onToggle={(v) => onChange({ rooms: toggle(rooms, v) })} search loading={loading} chips emptyText="Помещений пока нет" />
      </div>
      <div>
        <div className="ele-filter-section__title">Места</div>
        <MultiSelectList options={placeOpts} selected={places} onToggle={(v) => onChange({ places: toggle(places, v) })} search loading={loading} chips emptyText="Мест пока нет" />
      </div>
    </>
  )
}

import { useEffect, useState } from 'react'
import { apiGet } from './api/client'
import { MultiSelectList } from './ui/MultiSelectList/MultiSelectList.jsx'
import './ui/FilterModal/FilterModal.css'

// B27. Фильтр «Доступ в помещения» для Средств доступа: отдельно здания /
// помещения / места (мультивыбор каждого). Дерево тянем одним запросом
// /api/buildings/ (здания→помещения→места с именами). onChange(patch) — частичное
// обновление ({ buildings } | { rooms } | { places }).
const toggle = (arr, v) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v])

export function PassAccessFilter({ buildings, rooms, places, onChange }) {
  const [tree, setTree] = useState(null)

  useEffect(() => {
    let alive = true
    apiGet('/api/buildings/')
      .then((d) => alive && setTree(Array.isArray(d) ? d : d.results || []))
      .catch(() => alive && setTree([]))
    return () => {
      alive = false
    }
  }, [])

  const loading = tree === null
  const t = tree || []
  const buildingOpts = t.map((b) => ({ value: String(b.id), label: b.name }))
  const roomOpts = t.flatMap((b) => (b.rooms || []).map((r) => ({ value: String(r.id), label: r.name, sub: b.name })))
  const placeOpts = t.flatMap((b) =>
    (b.rooms || []).flatMap((r) => (r.places || []).map((p) => ({ value: String(p.id), label: p.name, sub: `${b.name} — ${r.name}` }))),
  )

  return (
    <>
      <div>
        <div className="ele-filter-section__title">Здания</div>
        <MultiSelectList options={buildingOpts} selected={buildings} onToggle={(v) => onChange({ buildings: toggle(buildings, v) })} search loading={loading} emptyText="Зданий пока нет" />
      </div>
      <div>
        <div className="ele-filter-section__title">Помещения</div>
        <MultiSelectList options={roomOpts} selected={rooms} onToggle={(v) => onChange({ rooms: toggle(rooms, v) })} search loading={loading} emptyText="Помещений пока нет" />
      </div>
      <div>
        <div className="ele-filter-section__title">Места</div>
        <MultiSelectList options={placeOpts} selected={places} onToggle={(v) => onChange({ places: toggle(places, v) })} search loading={loading} emptyText="Мест пока нет" />
      </div>
    </>
  )
}

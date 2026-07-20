import { useEffect, useState } from 'react'
import { apiGet } from '../../api/client'
import { Select } from '../Select/Select.jsx'

// Селект Места нужного типа (B8): сам подгружает активные места
// (?place_type=storage|workplace) и показывает их как «Здание — Помещение —
// Место». Используется в формах/модалках размещения по всем разделам.
const DEFAULT_LABEL = { storage: 'Место хранения', workplace: 'Рабочее место' }

export function PlaceSelect({ placeType, label, value, onChange, required = false, error, placeholder }) {
  const [places, setPlaces] = useState(null)

  useEffect(() => {
    let alive = true
    apiGet(`/api/places/?place_type=${placeType}&active=1`)
      .then((data) => {
        if (alive) setPlaces(Array.isArray(data) ? data : data.results || [])
      })
      .catch(() => alive && setPlaces([]))
    return () => {
      alive = false
    }
  }, [placeType])

  const empty = places && places.length === 0
  return (
    <Select
      label={label ?? DEFAULT_LABEL[placeType]}
      required={required}
      error={error}
      value={value}
      onChange={onChange}
      placeholder={placeholder ?? (empty ? 'Нет доступных мест' : 'Выберите место')}
      disabled={places === null}
    >
      {(places || []).map((p) => (
        <option key={p.id} value={p.id}>
          {p.building_name} — {p.room_name} — {p.name}
        </option>
      ))}
    </Select>
  )
}

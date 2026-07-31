import { useMemo, useState } from 'react'

// Каскадный мультивыбор здание→помещение→место для отчётов по местам/парковкам:
// можно выбрать несколько зданий, несколько помещений (в пределах выбранных
// зданий) и несколько мест (в пределах выбранных помещений). Пустой уровень —
// все. При снятии здания/помещения зависимые выборы очищаются.
// Вынесено из reportsShared.jsx отдельным модулем, чтобы тот экспортировал
// только компоненты (не ломает React Fast Refresh).
export function useLocationFilter(buildings) {
  const [buildingIds, setBuildingIds] = useState([])
  const [roomIds, setRoomIds] = useState([])
  const [placeIds, setPlaceIds] = useState([])

  const maps = useMemo(() => {
    const roomBuilding = {}
    const placeRoom = {}
    buildings.forEach((b) =>
      b.rooms.forEach((r) => {
        roomBuilding[r.id] = String(b.id)
        r.places.forEach((p) => { placeRoom[p.id] = String(r.id) })
      }),
    )
    return { roomBuilding, placeRoom }
  }, [buildings])

  const toggleBuilding = (v) => {
    const next = buildingIds.includes(v) ? buildingIds.filter((x) => x !== v) : [...buildingIds, v]
    setBuildingIds(next)
    if (next.length) {
      const bset = new Set(next)
      setRoomIds((prev) => prev.filter((rid) => bset.has(maps.roomBuilding[rid])))
      setPlaceIds((prev) => prev.filter((pid) => bset.has(maps.roomBuilding[maps.placeRoom[pid]])))
    }
  }
  const toggleRoom = (v) => {
    const next = roomIds.includes(v) ? roomIds.filter((x) => x !== v) : [...roomIds, v]
    setRoomIds(next)
    if (next.length) {
      const rset = new Set(next)
      setPlaceIds((prev) => prev.filter((pid) => rset.has(maps.placeRoom[pid])))
    }
  }
  const togglePlace = (v) => setPlaceIds((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]))

  const roomOptions = useMemo(() => {
    const bset = new Set(buildingIds)
    const src = buildingIds.length ? buildings.filter((b) => bset.has(String(b.id))) : buildings
    return src.flatMap((b) => b.rooms.map((r) => ({ value: String(r.id), label: r.name })))
  }, [buildings, buildingIds])
  const placeOptions = useMemo(() => {
    const rset = new Set(roomIds)
    const rooms = buildings.flatMap((b) => b.rooms)
    const src = roomIds.length ? rooms.filter((r) => rset.has(String(r.id))) : rooms
    return src.flatMap((r) => r.places.map((p) => ({ value: String(p.id), label: p.name })))
  }, [buildings, roomIds])

  const tree = useMemo(() => {
    const bset = new Set(buildingIds)
    const rset = new Set(roomIds)
    const pset = new Set(placeIds)
    return buildings
      .filter((b) => !buildingIds.length || bset.has(String(b.id)))
      .map((b) => ({
        ...b,
        rooms: b.rooms
          .filter((r) => !roomIds.length || rset.has(String(r.id)))
          .map((r) => ({ ...r, places: r.places.filter((p) => !placeIds.length || pset.has(String(p.id))) }))
          .filter((r) => r.places.length),
      }))
      .filter((b) => b.rooms.length)
  }, [buildings, buildingIds, roomIds, placeIds])

  return { buildingIds, roomIds, placeIds, toggleBuilding, toggleRoom, togglePlace, roomOptions, placeOptions, tree }
}

import { useCallback, useEffect, useRef, useState } from 'react'
import { Can, usePermissions } from '../../app/usePermissions.js'
import { ActionMenu, Badge, Banner, Button, Icon, Modal, SearchInput, Spinner } from '../../shared/ui'
import { BuildingModal } from './BuildingModal.jsx'
import { PlaceModal } from './PlaceModal.jsx'
import { RoomModal } from './RoomModal.jsx'
import {
  archiveBuilding,
  archivePlace,
  archiveRoom,
  getBuildings,
  unarchiveBuilding,
  unarchivePlace,
  unarchiveRoom,
} from './premisesApi.js'

// Раздел «Помещения» — единая страница-дерево: слева список Зданий (с меню
// действий), справа выбранное здание с раскрывающимися Помещениями/зонами и
// Местами. Удаления нет — только архивирование (каскадное вниз).
export function PremisesPage() {
  const perms = usePermissions()
  const [allBuildings, setAllBuildings] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [showArchived, setShowArchived] = useState(false)
  const [showArchivedRooms, setShowArchivedRooms] = useState(false)
  const [buildingSearch, setBuildingSearch] = useState('')
  const [roomSearch, setRoomSearch] = useState('')
  const [expanded, setExpanded] = useState(() => new Set())
  const [buildingModal, setBuildingModal] = useState(null) // null | 'new' | building
  const [roomModal, setRoomModal] = useState(null) // null | { room, buildingId }
  const [placeModal, setPlaceModal] = useState(null) // null | { place, roomId }
  const [confirm, setConfirm] = useState(null) // null | { title, message, onConfirm }
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    const data = await getBuildings(true)
    setAllBuildings(data)
    setSelectedId((prev) => {
      if (prev && data.some((b) => b.id === prev)) return prev
      const firstActive = data.find((b) => !b.is_archived)
      return (firstActive || data[0])?.id ?? null
    })
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // Переключатель «архивные помещения» и поиск по помещениям сбрасываем при
  // смене здания.
  useEffect(() => {
    setShowArchivedRooms(false)
    setRoomSearch('')
  }, [selectedId])

  if (allBuildings === null) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
        <Spinner />
      </div>
    )
  }

  const hasArchived = allBuildings.some((b) => b.is_archived)
  const bq = buildingSearch.trim().toLowerCase()
  const buildings = (showArchived ? allBuildings : allBuildings.filter((b) => !b.is_archived)).filter(
    (b) => !bq || b.name.toLowerCase().includes(bq) || (b.address || '').toLowerCase().includes(bq)
  )
  const selected = allBuildings.find((b) => b.id === selectedId) || null

  const toggleRoom = (roomId) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(roomId)) next.delete(roomId)
      else next.add(roomId)
      return next
    })
  }

  const runArchive = (title, message, fn) =>
    setConfirm({
      title,
      message,
      onConfirm: async () => {
        setConfirm(null)
        setError(null)
        try {
          await fn()
          load()
        } catch (err) {
          setError(err.detail || 'Не удалось выполнить действие.')
        }
      },
    })

  const doUnarchive = async (fn) => {
    setError(null)
    try {
      await fn()
      load()
    } catch (err) {
      setError(err.detail || 'Не удалось вернуть из архива.')
    }
  }

  const buildingMenu = (b) =>
    b.is_archived
      ? [{ label: 'Вернуть из архива', onClick: () => doUnarchive(() => unarchiveBuilding(b.id)) }]
      : [
          { label: 'Изменить', onClick: () => setBuildingModal(b) },
          {
            label: 'В архив',
            onClick: () =>
              runArchive(
                'Архивировать здание?',
                `Здание «${b.name}» и все его помещения и места будут перемещены в архив.`,
                () => archiveBuilding(b.id)
              ),
          },
        ]

  // Порядок отображения помещений и счётчик зависят от того, архивное ли здание.
  let visibleRooms = []
  let roomCounter = 0
  let hasArchivedRooms = false
  if (selected) {
    hasArchivedRooms = selected.rooms.some((r) => r.is_archived)
    if (selected.is_archived) {
      // Для архивного здания показываем все помещения, счётчик — общий.
      visibleRooms = selected.rooms
      roomCounter = selected.rooms.length
    } else {
      visibleRooms = showArchivedRooms ? selected.rooms : selected.rooms.filter((r) => !r.is_archived)
      roomCounter = selected.rooms.filter((r) => !r.is_archived).length
    }
    const rq = roomSearch.trim().toLowerCase()
    if (rq) visibleRooms = visibleRooms.filter((r) => r.name.toLowerCase().includes(rq))
  }

  return (
    <div>
      <div className="ele-page-head" style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 'var(--font-size-h1)', fontWeight: 600, letterSpacing: 'var(--font-h1-letter-spacing)', margin: 0 }}>
          Помещения
        </h1>
        <Can perm="canManagePremises">
          <div className="ele-page-head__actions">
            <Button onClick={() => setBuildingModal('new')} title="Новое здание" aria-label="Новое здание">
              <Icon className="ele-only-desktop" name="plus" size={18} strokeWidth={2.2} />
              <span className="ele-only-desktop">Новое здание</span>
              <Icon className="ele-only-mobile" name="plus" size={22} strokeWidth={2.4} />
            </Button>
          </div>
        </Can>
      </div>

      {error ? (
        <div style={{ marginBottom: 14 }}>
          <Banner variant="error">{error}</Banner>
        </div>
      ) : null}

      <div className="ele-sidebar-layout" style={{ gridTemplateColumns: selected ? '344px 1fr' : '344px' }}>
        {/* ЛЕВАЯ КОЛОНКА — здания */}
        <div style={{ background: 'var(--color-surface)', borderRadius: 16, padding: 10, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '6px 8px 8px' }}>
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--color-text-placeholder)' }}>
              Здания
            </span>
            {hasArchived ? (
              <button type="button" onClick={() => setShowArchived((v) => !v)} style={toggleBtnStyle}>
                {showArchived ? 'Скрыть архив' : 'Показать архив'}
              </button>
            ) : null}
          </div>

          {allBuildings.length > 0 ? (
            <div style={{ padding: '0 4px 8px' }}>
              <SearchInput value={buildingSearch} onChange={setBuildingSearch} placeholder="Поиск" />
            </div>
          ) : null}

          {buildings.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--color-text-muted)', padding: '8px 10px' }}>
              {bq ? 'Ничего не найдено' : 'Здания пока не созданы'}
            </div>
          ) : (
            buildings.map((b) => (
              <div
                key={b.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, paddingRight: 6, borderRadius: 11,
                  background: b.id === selectedId ? 'var(--color-fill-active-tint)' : 'transparent',
                }}
              >
                <button
                  type="button"
                  onClick={() => setSelectedId(b.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 12px', border: 'none', flex: 1, minWidth: 0, textAlign: 'left', fontFamily: 'inherit', cursor: 'pointer', color: 'var(--color-text-primary)', background: 'transparent' }}
                >
                  <span style={{ width: 34, height: 34, flex: 'none', borderRadius: 9, background: b.id === selectedId ? 'var(--color-surface)' : 'var(--color-fill-input)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)', opacity: b.is_archived ? 0.6 : 1 }}>
                    <BuildingGlyph />
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                      {b.is_archived ? <Badge>Архив</Badge> : null}
                      <span style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: b.is_archived ? 0.6 : 1 }}>{b.name}</span>
                      {b.requires_pass ? (
                        <Icon name="key-round" size={13} strokeWidth={2} title="Требуется ключ/пропуск" style={{ flex: 'none', color: 'var(--color-text-muted)' }} />
                      ) : null}
                    </span>
                    {b.address ? (
                      <span className="ele-clamp-2" style={{ fontSize: 11.5, color: 'var(--color-text-placeholder)', marginTop: 1 }}>{b.address}</span>
                    ) : null}
                  </span>
                </button>
                <Can perm="canManagePremises">
                  <ActionMenu items={buildingMenu(b)} />
                </Can>
              </div>
            ))
          )}
        </div>

        {/* ПРАВАЯ КОЛОНКА — детали здания. В пустом состоянии (зданий нет)
            не рендерим вовсе — остаётся только левый список. */}
        {selected ? (
          <div style={{ background: 'var(--color-surface)', borderRadius: 16, padding: 22, minWidth: 0 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 20, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 10 }}>
                {selected.is_archived ? <Badge>Архив</Badge> : null}
                <span style={{ opacity: selected.is_archived ? 0.6 : 1 }}>{selected.name}</span>
              </div>
              <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 5, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                {selected.address ? <span>{selected.address}</span> : null}
                {selected.floor_count != null ? <span>Этажность: {selected.floor_count}</span> : null}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, margin: '22px 0 12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--color-text-placeholder)' }}>
                  Помещения / зоны
                </span>
                <Badge>{roomCounter}</Badge>
              </div>
              {!selected.is_archived && hasArchivedRooms ? (
                <button type="button" onClick={() => setShowArchivedRooms((v) => !v)} style={toggleBtnStyle}>
                  {showArchivedRooms ? 'Скрыть архив' : 'Показать архив'}
                </button>
              ) : null}
            </div>

            {/* Кнопка добавления — над поиском (замечание по стенду). */}
            {!selected.is_archived ? (
              <Can perm="canManagePremises">
                <Button variant="secondary" fullWidth style={{ marginBottom: 12 }} onClick={() => setRoomModal({ room: null, buildingId: selected.id })}>
                  <Icon name="plus" size={18} strokeWidth={2.2} />
                  Добавить помещение / зону
                </Button>
              </Can>
            ) : null}

            {selected.rooms.length > 0 ? (
              <div style={{ marginBottom: 12 }}>
                <SearchInput value={roomSearch} onChange={setRoomSearch} placeholder="Поиск" />
              </div>
            ) : null}

            {visibleRooms.length === 0 ? (
              <div style={{ fontSize: 13.5, color: 'var(--color-text-muted)', padding: '2px 0 14px' }}>
                {roomSearch.trim() ? 'Ничего не найдено.' : 'В здании пока нет помещений.'}
              </div>
            ) : (
              visibleRooms.map((room) => (
                <RoomRow
                  key={room.id}
                  room={room}
                  buildingArchived={selected.is_archived}
                  open={expanded.has(room.id)}
                  onToggle={() => toggleRoom(room.id)}
                  canManage={perms.canManagePremises}
                  onEdit={() => setRoomModal({ room, buildingId: selected.id })}
                  onArchive={() =>
                    runArchive(
                      'Архивировать помещение?',
                      `Помещение «${room.name}» и все его места будут перемещены в архив.`,
                      () => archiveRoom(room.id)
                    )
                  }
                  onUnarchive={() => doUnarchive(() => unarchiveRoom(room.id))}
                  onAddPlace={() => setPlaceModal({ place: null, roomId: room.id })}
                  onEditPlace={(place) => setPlaceModal({ place, roomId: room.id })}
                  onArchivePlace={(place) =>
                    runArchive(
                      'Архивировать место?',
                      `Место «${place.name}» будет перемещено в архив.`,
                      () => archivePlace(place.id)
                    )
                  }
                  onUnarchivePlace={(place) => doUnarchive(() => unarchivePlace(place.id))}
                />
              ))
            )}
          </div>
        ) : null}
      </div>

      {buildingModal ? (
        <BuildingModal
          building={buildingModal === 'new' ? null : buildingModal}
          onClose={() => setBuildingModal(null)}
          onDone={(saved) => {
            setBuildingModal(null)
            if (saved) setSelectedId(saved.id)
            load()
          }}
        />
      ) : null}

      {roomModal ? (
        <RoomModal
          buildingId={roomModal.buildingId}
          room={roomModal.room}
          onClose={() => setRoomModal(null)}
          onDone={(saved) => {
            setRoomModal(null)
            if (saved && !roomModal.room) setExpanded((prev) => new Set(prev).add(saved.id))
            load()
          }}
        />
      ) : null}

      {placeModal ? (
        <PlaceModal
          roomId={placeModal.roomId}
          place={placeModal.place}
          onClose={() => setPlaceModal(null)}
          onDone={() => {
            setPlaceModal(null)
            load()
          }}
        />
      ) : null}

      {confirm ? (
        <Modal open onClose={() => setConfirm(null)} title={confirm.title}>
          <div style={{ fontSize: 14, color: 'var(--color-text-secondary)', lineHeight: 1.5, margin: '4px 0 20px' }}>
            {confirm.message}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Button variant="danger" fullWidth onClick={confirm.onConfirm}>
              В архив
            </Button>
            <Button variant="secondary" fullWidth onClick={() => setConfirm(null)}>
              Отмена
            </Button>
          </div>
        </Modal>
      ) : null}
    </div>
  )
}

function RoomRow({ room, buildingArchived, open, onToggle, canManage, onEdit, onArchive, onUnarchive, onAddPlace, onEditPlace, onArchivePlace, onUnarchivePlace }) {
  const activePlaces = room.places.filter((p) => !p.is_archived).length
  const hasPlaces = room.places.length > 0
  // В архивном помещении без мест разворачивать нечего — стрелку не показываем.
  const expandable = !(room.is_archived && !hasPlaces)
  // Управлять местами можно только в активном помещении активного здания.
  const canManagePlaces = canManage && !buildingArchived && !room.is_archived

  const roomMenu = room.is_archived
    ? [{ label: 'Вернуть из архива', onClick: onUnarchive }]
    : [
        { label: 'Изменить', onClick: onEdit },
        { label: 'В архив', onClick: onArchive },
      ]

  return (
    <div style={{ borderRadius: 12, boxShadow: 'inset 0 0 0 1px var(--color-border)', marginBottom: 9, opacity: room.is_archived ? 0.6 : 1 }}>
      <div
        onClick={expandable ? onToggle : undefined}
        style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '12px 13px', cursor: expandable ? 'pointer' : 'default' }}
      >
        {expandable ? (
          <Icon name="chevron-right" size={16} strokeWidth={2.2} style={{ flex: 'none', color: 'var(--color-text-placeholder)', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .16s' }} />
        ) : (
          <span style={{ width: 16, flex: 'none' }} />
        )}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            {room.is_archived ? <Badge>Архив</Badge> : null}
            <span style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{room.name}</span>
            {room.requires_pass ? (
              <Icon name="key-round" size={13} strokeWidth={2} title="Требуется ключ/пропуск" style={{ flex: 'none', color: 'var(--color-text-muted)' }} />
            ) : null}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <Badge>этаж {room.floor || '—'}</Badge>
            <Badge>мест {activePlaces}</Badge>
          </div>
        </div>
        {canManage && !buildingArchived ? (
          <div style={{ flex: 'none' }} onClick={(e) => e.stopPropagation()}>
            <ActionMenu items={roomMenu} />
          </div>
        ) : null}
      </div>

      {open && (hasPlaces || canManagePlaces) ? (
        <div style={{ padding: '4px 13px 14px 43px', background: 'var(--color-fill-input)', borderRadius: '0 0 11px 11px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 10 }}>
            {room.places.map((place) => (
              <PlaceChip
                key={place.id}
                place={place}
                canManage={canManagePlaces}
                onEdit={() => onEditPlace(place)}
                onArchive={() => onArchivePlace(place)}
                onUnarchive={() => onUnarchivePlace(place)}
              />
            ))}
            {canManagePlaces ? (
              <button
                type="button"
                onClick={onAddPlace}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, fontWeight: 600, background: 'transparent', color: 'var(--color-text-muted)', borderRadius: 8, padding: '6px 10px', boxShadow: 'inset 0 0 0 1px var(--color-border-strong)', cursor: 'pointer', border: 'none', fontFamily: 'inherit' }}
              >
                <Icon name="plus" size={14} strokeWidth={2.2} />
                Место
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}

// Место-чип: клик открывает меню действий (Изменить / В архив либо
// Вернуть из архива). Иконок-кнопок на самом чипе нет.
function PlaceChip({ place, canManage, onEdit, onArchive, onUnarchive }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const archived = place.is_archived

  useEffect(() => {
    if (!open) return
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const items = archived
    ? [{ label: 'Вернуть из архива', onClick: onUnarchive }]
    : [
        { label: 'Изменить', onClick: onEdit },
        { label: 'В архив', onClick: onArchive },
      ]

  return (
    <div className="ele-action-menu" ref={ref}>
      <button
        type="button"
        onClick={() => canManage && setOpen((o) => !o)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 500,
          background: 'var(--color-surface)', color: 'var(--color-text-secondary)', borderRadius: 8,
          padding: '7px 11px', boxShadow: 'inset 0 0 0 1px var(--color-border)', border: 'none', fontFamily: 'inherit',
          cursor: canManage ? 'pointer' : 'default',
          opacity: archived ? 0.55 : 1, textDecoration: archived ? 'line-through' : 'none',
        }}
      >
        <Icon
          name={place.place_type === 'storage' ? 'warehouse' : 'briefcase'}
          size={13}
          strokeWidth={2}
          title={place.place_type === 'storage' ? 'Место хранения' : 'Рабочее место'}
          style={{ color: 'var(--color-text-muted)' }}
        />
        {place.requires_pass ? (
          <Icon name="key-round" size={13} strokeWidth={2} title="Требуется ключ/пропуск" style={{ color: 'var(--color-text-muted)' }} />
        ) : null}
        {place.name}
        {place.place_type === 'workplace' && place.employees_detail?.length ? (
          <span style={{ color: 'var(--color-text-placeholder)' }}>· {place.employees_detail.length}</span>
        ) : null}
      </button>
      {open ? (
        <div className="ele-action-menu__list" style={{ left: 0, right: 'auto', minWidth: 180 }} role="menu">
          {items.map((it, i) => (
            <button
              key={i}
              type="button"
              role="menuitem"
              className="ele-action-menu__item"
              onClick={() => {
                setOpen(false)
                it.onClick()
              }}
            >
              {it.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

const toggleBtnStyle = {
  fontFamily: 'inherit',
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--color-text-muted)',
  background: 'var(--color-fill-input)',
  border: 'none',
  borderRadius: 8,
  padding: '5px 10px',
  cursor: 'pointer',
  flex: 'none',
}

function BuildingGlyph() {
  return <Icon name="building-2" size={18} strokeWidth={1.7} />
}

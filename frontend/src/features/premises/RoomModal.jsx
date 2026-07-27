import { useState } from 'react'
import { Banner, Button, Checkbox, Input, Modal } from '../../shared/ui'
import { createRoom, deleteRoomPlan, updateRoom, uploadRoomPlan } from './premisesApi.js'

// Создание/редактирование Помещения/зоны внутри здания. Тип выбирается сверху:
//  • Помещение/зона — обычное помещение; можно отметить как «Этаж-парковка»
//    (тогда этаж обязателен и уникален среди этаж-парковок здания);
//  • Прилегающая парковка — снаружи здания, этажа нет.
// У парковки (любого вида) можно приложить план (PDF/изображение) и задать
// признак «требуется ключ/пропуск».
export function RoomModal({ buildingId, room, onClose, onDone }) {
  const isEdit = Boolean(room)
  const [kind, setKind] = useState(room?.parking_type === 'adjacent' ? 'adjacent' : 'room')
  const [floorParking, setFloorParking] = useState(room?.parking_type === 'floor')
  const [name, setName] = useState(room?.name || '')
  const [floor, setFloor] = useState(room?.floor || '')
  const [requiresPass, setRequiresPass] = useState(room?.requires_pass || false)
  const [planFile, setPlanFile] = useState(room?.plan_file || null) // уже загруженный
  const [pendingFile, setPendingFile] = useState(null) // выбранный, ещё не загружен
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [fieldErrors, setFieldErrors] = useState({})

  const isFloorParking = kind === 'room' && floorParking
  const parkingType = kind === 'adjacent' ? 'adjacent' : isFloorParking ? 'floor' : ''
  const isParking = Boolean(parkingType)
  // Пока в помещении созданы места — тип (парковка ↔ помещение) и признак
  // «Этаж-парковка» менять нельзя (места несовместимы с другим типом).
  const typeLocked = isEdit && (room?.places?.length || 0) > 0

  const pickFile = (e) => {
    const f = (e.target.files || [])[0]
    e.target.value = ''
    if (!f) return
    if (f.size > 20 * 1024 * 1024) {
      setError(`Файл «${f.name}» больше 20 МБ.`)
      return
    }
    setError(null)
    setPendingFile(f)
  }

  const submit = async () => {
    setSubmitting(true)
    setError(null)
    setFieldErrors({})
    const payload = {
      building: buildingId,
      name,
      floor: kind === 'adjacent' ? '' : floor,
      parking_type: parkingType,
      requires_pass: requiresPass,
    }
    try {
      let saved = isEdit ? await updateRoom(room.id, payload) : await createRoom(payload)
      // План парковки — отдельным эндпоинтом после сохранения помещения.
      if (isParking && pendingFile) {
        const fd = new FormData()
        fd.append('file', pendingFile)
        saved = await uploadRoomPlan(saved.id, fd)
      } else if ((!isParking || (!planFile && !pendingFile)) && room?.plan_file) {
        // План удалили в форме либо помещение перестало быть парковкой.
        saved = await deleteRoomPlan(saved.id)
      }
      onDone(saved)
    } catch (err) {
      if (err.errors) {
        setFieldErrors(err.errors)
      } else {
        setError(err.detail || 'Не удалось сохранить помещение.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const title = isEdit
    ? kind === 'adjacent'
      ? 'Редактирование парковки'
      : 'Редактирование помещения/зоны'
    : 'Новое помещение/зона'

  return (
    <Modal open onClose={onClose} title={title}>
      {error ? <Banner variant="error">{error}</Banner> : null}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, margin: '4px 0 20px' }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Тип</div>
          <Segmented
            value={kind}
            onChange={setKind}
            disabled={typeLocked}
            options={[
              { value: 'room', label: 'Помещение / зона' },
              { value: 'adjacent', label: 'Прилегающая парковка' },
            ]}
          />
          {typeLocked ? (
            <div style={{ fontSize: 11.5, color: 'var(--color-text-placeholder)', marginTop: 8 }}>
              Пока в помещении есть места, тип менять нельзя.
            </div>
          ) : null}
        </div>

        <Input
          label="Название / номер"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={fieldErrors.name}
        />

        {kind === 'room' ? (
          <>
            <Input
              label="Номер этажа"
              required={isFloorParking}
              placeholder="например: 5, 1А, -1P"
              value={floor}
              onChange={(e) => setFloor(e.target.value)}
              error={fieldErrors.floor}
            />
            <Checkbox
              label="Этаж-парковка"
              checked={floorParking}
              onChange={setFloorParking}
              disabled={typeLocked}
            />
          </>
        ) : null}

        {isParking ? (
          <PlanField
            planFile={pendingFile ? { original_filename: pendingFile.name, size: pendingFile.size } : planFile}
            onPick={pickFile}
            onRemove={() => {
              setPendingFile(null)
              setPlanFile(null)
            }}
          />
        ) : null}

        <Checkbox label="Требуется ключ/пропуск" checked={requiresPass} onChange={setRequiresPass} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Button fullWidth loading={submitting} onClick={submit}>
          {isEdit ? 'Сохранить' : 'Создать'}
        </Button>
        <Button variant="secondary" fullWidth onClick={onClose}>
          Отмена
        </Button>
      </div>
    </Modal>
  )
}

// Сегментированный переключатель — визуально как «Учёт пробега» у типа
// транспорта. disabled блокирует смену (тип нельзя менять, пока есть места).
function Segmented({ value, onChange, options, disabled }) {
  return (
    <div style={{ display: 'flex', gap: 8, opacity: disabled ? 0.6 : 1 }}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          disabled={disabled}
          onClick={() => onChange(o.value)}
          style={{
            flex: 1,
            padding: '9px 6px',
            fontSize: 13,
            fontWeight: 600,
            fontFamily: 'inherit',
            cursor: disabled ? 'default' : 'pointer',
            borderRadius: 8,
            border: 'none',
            color: value === o.value ? 'var(--color-primary-text)' : 'var(--color-text-secondary)',
            background: value === o.value ? 'var(--color-primary)' : 'var(--color-fill-input)',
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

// План парковки — один файл (PDF/изображение). Показывает выбранный/загруженный
// файл со ссылкой (если уже на сервере) и кнопкой удаления, иначе — зону выбора.
function PlanField({ planFile, onPick, onRemove }) {
  return (
    <div>
      <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 6 }}>План парковки</div>
      {planFile ? (
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px',
            borderRadius: 10, boxShadow: 'inset 0 0 0 1px var(--color-border)',
          }}
        >
          {planFile.url ? (
            <a href={planFile.url} target="_blank" rel="noreferrer" style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={planFile.original_filename}>
              {planFile.original_filename}
            </a>
          ) : (
            <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={planFile.original_filename}>
              {planFile.original_filename}
            </span>
          )}
          <span style={{ fontSize: 12, color: 'var(--color-text-placeholder)', flex: 'none' }}>
            {Math.round(planFile.size / 1024)} КБ
          </span>
          <button
            type="button"
            onClick={onRemove}
            style={{ border: 'none', background: 'none', color: 'var(--color-error)', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', padding: 4, flex: 'none' }}
          >
            Удалить
          </button>
        </div>
      ) : (
        <label
          style={{
            display: 'block', textAlign: 'center', padding: '14px 12px', borderRadius: 10,
            border: '1px dashed var(--color-border-strong)', cursor: 'pointer', fontSize: 13.5,
          }}
        >
          <input type="file" accept="application/pdf,image/*" onChange={onPick} style={{ display: 'none' }} />
          <b>Выберите файл</b>
          <div style={{ fontSize: 12, color: 'var(--color-text-placeholder)', marginTop: 3 }}>
            PDF или изображение, до 20 МБ
          </div>
        </label>
      )}
    </div>
  )
}

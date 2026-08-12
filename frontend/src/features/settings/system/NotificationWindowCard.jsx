import { useState } from 'react'
import { Banner, Card, Input, Select } from '../../../shared/ui'
import { updateNotificationSettings } from '../settingsApi.js'
import { sectionTitle, sectionHint } from './helpers.js'

// Универсальный список IANA-зон для селекта окна уведомлений (как в BackupTab:
// supportedValuesOf есть во всех актуальных браузерах, фолбэк — минимальный набор).
const DEVICE_TZ = (() => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
})()
const TIMEZONES = (() => {
  const base = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : []
  // Гарантируем наличие UTC (дефолт с бэкенда) и зоны устройства: в некоторых
  // движках supportedValuesOf не возвращает литерал «UTC», и тогда нативный
  // <select value="UTC"> показал бы первую опцию по алфавиту, а не выбранную.
  const withUtc = base.includes('UTC') ? base : ['UTC', ...base]
  return withUtc.includes(DEVICE_TZ) ? withUtc : [DEVICE_TZ, ...withUtc]
})()

const hhmm = (t) => (t || '').slice(0, 5)

// Окно отправки уведомлений (push + письма) и его часовой пояс. Автосохранение:
// поля времени — по blur (частичное/пустое значение не шлём), зона — сразу по
// выбору. Одинаковое «с» и «до» = круглосуточно (без ограничения по времени).
export function NotificationWindowCard({ initialNotify }) {
  const init = {
    start: hhmm(initialNotify?.notify_window_start) || '09:00',
    end: hhmm(initialNotify?.notify_window_end) || '21:00',
    tz: initialNotify?.notify_window_timezone || 'UTC',
  }
  const [draft, setDraft] = useState(init)
  const [saved, setSaved] = useState(init)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  const save = async (patch) => {
    setError(null)
    setSaving(true)
    try {
      const updated = await updateNotificationSettings(patch)
      const next = {
        start: hhmm(updated.notify_window_start),
        end: hhmm(updated.notify_window_end),
        tz: updated.notify_window_timezone,
      }
      setSaved(next)
      setDraft(next)
    } catch (err) {
      setError(err.detail || 'Не удалось сохранить время отправки уведомлений.')
      setDraft(saved) // откат к последнему сохранённому
    } finally {
      setSaving(false)
    }
  }

  // Пустое/неизменённое значение времени не сохраняем; пустое — откатываем.
  const onTimeBlur = (field, apiField) => {
    const value = draft[field]
    if (!value) {
      setDraft((d) => ({ ...d, [field]: saved[field] }))
      return
    }
    if (value === saved[field]) return
    save({ [apiField]: value })
  }

  const onTz = (tz) => {
    setDraft((d) => ({ ...d, tz }))
    save({ notify_window_timezone: tz })
  }

  const roundTheClock = draft.start === draft.end

  return (
    <Card style={{ flex: 1, minWidth: 0 }}>
      <div style={sectionTitle}>Время отправки уведомлений</div>
      <div style={sectionHint}>
        Push-уведомления и письма отправляются только в этом интервале. События вне интервала ставятся
        в очередь и уходят с началом ближайшего рабочего окна.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Input
          label="Отправлять с"
          type="time"
          value={draft.start}
          disabled={saving}
          onChange={(e) => setDraft((d) => ({ ...d, start: e.target.value }))}
          onBlur={() => onTimeBlur('start', 'notify_window_start')}
        />
        <Input
          label="до"
          type="time"
          value={draft.end}
          disabled={saving}
          onChange={(e) => setDraft((d) => ({ ...d, end: e.target.value }))}
          onBlur={() => onTimeBlur('end', 'notify_window_end')}
        />
      </div>
      <div style={{ marginTop: 12 }}>
        <Select label="Часовой пояс" value={draft.tz} disabled={saving} onChange={onTz}>
          {TIMEZONES.map((tz) => (
            <option key={tz} value={tz}>{tz}</option>
          ))}
        </Select>
      </div>
      {roundTheClock ? (
        <div style={{ fontSize: 12.5, color: 'var(--color-text-placeholder)', marginTop: 12 }}>
          Круглосуточно — без ограничений по времени.
        </div>
      ) : null}
      {error ? (
        <div style={{ marginTop: 10 }}>
          <Banner variant="error">{error}</Banner>
        </div>
      ) : null}
    </Card>
  )
}

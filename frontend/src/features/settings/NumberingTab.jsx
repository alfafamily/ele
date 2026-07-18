import { useEffect, useState } from 'react'
import { Banner, Card, Input, Skeleton } from '../../shared/ui'
import { getNumberingSettings, updateNumberingSettings } from './settingsApi.js'

const FIELDS = [
  { key: 'equipment_number_prefix', label: 'Оборудование' },
  { key: 'key_number_prefix', label: 'Ключи' },
  { key: 'pass_number_prefix', label: 'Пропуска' },
]

export function NumberingTab() {
  const [settings, setSettings] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    getNumberingSettings().then(setSettings)
  }, [])

  // Сохранение по blur — префикс не может быть пустым (валидируется на бэкенде);
  // при ошибке возвращаем прежнее значение и показываем баннер.
  const patchPrefix = async (key) => {
    const value = (settings[key] || '').trim()
    setError(null)
    try {
      const updated = await updateNumberingSettings({ [key]: value })
      setSettings(updated)
    } catch (err) {
      setError(err?.errors?.[key]?.[0] || err?.detail || 'Не удалось сохранить префикс.')
      const fresh = await getNumberingSettings()
      setSettings(fresh)
    }
  }

  if (!settings) {
    return (
      <Card>
        <Skeleton height={40} />
      </Card>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {error ? <Banner variant="error">{error}</Banner> : null}
      <Card>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {FIELDS.map((f) => (
            <Input
              key={f.key}
              label={f.label}
              value={settings[f.key] ?? ''}
              onChange={(e) => setSettings({ ...settings, [f.key]: e.target.value })}
              onBlur={() => patchPrefix(f.key)}
              style={{ fontFamily: 'var(--font-mono)' }}
            />
          ))}
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--color-text-placeholder)', marginTop: 12, lineHeight: 1.5 }}>
          Формат номера: ПРЕФИКС-номер (напр. KEY-1). Смена префикса не сбрасывает нумерацию.
        </div>
      </Card>
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import { useCompany, useRefreshCompany } from '../../app/CompanyContext.jsx'
import { Banner, Button, Card, Checkbox, Input, Select, Spinner } from '../../shared/ui'
import {
  deleteCompanyLogo,
  getCompanySettings,
  getStorageMode,
  updateCompanySettings,
  updateStorageMode,
  uploadCompanyLogo,
} from './settingsApi.js'

// Читает натуральные размеры выбранного изображения в браузере (без загрузки
// на сервер) — для проверки ограничения 600×600 px до отправки.
function readImageSize(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve({ width: img.naturalWidth, height: img.naturalHeight })
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('not an image'))
    }
    img.src = url
  })
}

export function CompanyTab() {
  const company = useCompany()
  const refreshCompany = useRefreshCompany()
  const [settings, setSettings] = useState(null)
  const [storageMode, setStorageMode] = useState(null)
  const [ipListText, setIpListText] = useState('')
  const [restrictByIp, setRestrictByIp] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [savingStorage, setSavingStorage] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [saved, setSaved] = useState(false)
  const fileInputRef = useRef(null)

  const load = () => {
    getCompanySettings().then((data) => {
      setSettings(data)
      setIpListText((data.ip_allowlist || []).join(', '))
      setRestrictByIp((data.ip_allowlist || []).length > 0)
    })
    getStorageMode().then((data) => setStorageMode(data.storage_mode))
  }

  useEffect(load, [])

  if (!settings || !storageMode) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
        <Spinner />
      </div>
    )
  }

  const onLogoSelected = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError(null)

    // Клиентская проверка (§3.1: не более 600×600 px) — мгновенная понятная
    // ошибка, не «молча ничего не произошло». Серверная валидация остаётся
    // источником истины (её ошибку тоже показываем ниже).
    if (!file.type.startsWith('image/')) {
      setError('Файл должен быть изображением (PNG, JPG, SVG).')
      return
    }
    const dims = await readImageSize(file).catch(() => null)
    if (dims && (dims.width > 600 || dims.height > 600)) {
      setError(`Логотип должен быть не более 600×600 px — загружено ${dims.width}×${dims.height} px.`)
      return
    }

    setUploadingLogo(true)
    try {
      await uploadCompanyLogo(file)
      await refreshCompany() // обновляем лого в rail и на этой странице без релоада
    } catch (err) {
      setError(err.errors ? Object.values(err.errors).flat().join(' ') : err.detail || 'Не удалось загрузить логотип.')
    } finally {
      setUploadingLogo(false)
    }
  }

  const onRemoveLogo = async () => {
    setUploadingLogo(true)
    setError(null)
    try {
      await deleteCompanyLogo()
      await refreshCompany()
    } catch (err) {
      setError(err.detail || 'Не удалось удалить логотип.')
    } finally {
      setUploadingLogo(false)
    }
  }

  const onStorageModeChange = async (mode) => {
    setSavingStorage(true)
    setError(null)
    try {
      await updateStorageMode(mode)
      setStorageMode(mode)
    } catch (err) {
      setError(err.detail || 'Не удалось сменить режим хранилища.')
    } finally {
      setSavingStorage(false)
    }
  }

  const submit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    setSaved(false)
    const ipList = restrictByIp
      ? ipListText
          .split(/[,\n]/)
          .map((s) => s.trim())
          .filter(Boolean)
      : []
    try {
      const updated = await updateCompanySettings({
        name: settings.name,
        inn: settings.inn,
        kpp: settings.kpp,
        domain: settings.domain,
        ip_allowlist: ipList,
      })
      setSettings(updated)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      setError(err.errors ? Object.values(err.errors).flat().join(' ') : err.detail || 'Не удалось сохранить.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 19, fontWeight: 600 }}>Компания</div>
          <div style={{ fontSize: 13, color: 'var(--color-text-placeholder)', marginTop: 2 }}>Реквизиты организации — объект единственный</div>
        </div>
        <Button loading={submitting} onClick={submit}>
          {saved ? 'Сохранено' : 'Сохранить'}
        </Button>
      </div>

      {error ? (
        <div style={{ marginBottom: 14 }}>
          <Banner variant="error">{error}</Banner>
        </div>
      ) : null}

      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Card style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <span
            style={{
              width: 72,
              height: 72,
              flex: 'none',
              borderRadius: 16,
              background: 'var(--color-fill-active-tint)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--color-text-muted)',
              fontWeight: 700,
              fontSize: 20,
              overflow: 'hidden',
            }}
          >
            {uploadingLogo ? <Spinner size={24} /> : company?.logo ? <img src={company.logo.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (settings.name?.[0] || 'E')}
          </span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Логотип компании</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button type="button" variant="secondary" onClick={() => fileInputRef.current?.click()}>
                Загрузить
              </Button>
              {company?.logo ? (
                <button type="button" onClick={onRemoveLogo} style={{ border: 'none', background: 'none', color: 'var(--color-error)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  Удалить
                </button>
              ) : null}
              <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onLogoSelected} />
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--color-text-placeholder)', marginTop: 6 }}>Не более 600×600 px</div>
          </div>
        </Card>

        <Card>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 14 }}>Основные реквизиты</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ gridColumn: 'span 2' }}>
              <Input label="Название компании" required value={settings.name} onChange={(e) => setSettings({ ...settings, name: e.target.value })} />
            </div>
            <Input label="ИНН" value={settings.inn} onChange={(e) => setSettings({ ...settings, inn: e.target.value })} />
            <Input label="КПП" value={settings.kpp} onChange={(e) => setSettings({ ...settings, kpp: e.target.value })} />
          </div>
        </Card>

        <Card>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 14 }}>Доступ и приглашения</div>
          <Input label="Домен для приглашений" value={settings.domain} onChange={(e) => setSettings({ ...settings, domain: e.target.value })} />
          <div style={{ marginTop: 14 }}>
            <Checkbox label="Ограничивать вход по IP" checked={restrictByIp} onChange={setRestrictByIp} />
          </div>
          {restrictByIp ? (
            <div style={{ marginTop: 12 }}>
              <Input label="Разрешённые IP (через запятую)" value={ipListText} onChange={(e) => setIpListText(e.target.value)} />
            </div>
          ) : null}
        </Card>

        <Card>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 14 }}>Хранилище файлов</div>
          <Select label="Режим" value={storageMode} onChange={onStorageModeChange} disabled={savingStorage}>
            <option value="local">Локально</option>
            <option value="s3">S3</option>
          </Select>
          <div style={{ fontSize: 12, color: 'var(--color-text-placeholder)', marginTop: 8 }}>
            Параметры подключения S3 задаются в .env сервера (§8.6) — здесь только выбор активного режима.
          </div>
        </Card>
      </form>
    </div>
  )
}

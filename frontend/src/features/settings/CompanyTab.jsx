import { useEffect, useRef, useState } from 'react'
import { useCompany, useRefreshCompany } from '../../app/CompanyContext.jsx'
import { useMediaQuery } from '../../shared/hooks/useMediaQuery.js'
import { Banner, Button, Card, Input, Spinner } from '../../shared/ui'
import { deleteCompanyLogo, getCompanySettings, updateCompanySettings, uploadCompanyLogo } from './settingsApi.js'

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

const TILE = 96
const linkBtn = { border: 'none', background: 'none', color: 'var(--color-text-secondary)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }

// Настройки → Компания — реквизиты организации: логотип, название, ИНН.
// Технические настройки — в отдельной вкладке «Системные» (SystemTab).
export function CompanyTab() {
  const company = useCompany()
  const refreshCompany = useRefreshCompany()
  const isMobile = useMediaQuery('(max-width: 768px)')
  const [settings, setSettings] = useState(null)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [saved, setSaved] = useState(false)
  const fileInputRef = useRef(null)

  useEffect(() => {
    getCompanySettings().then(setSettings)
  }, [])

  if (!settings) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
        <Spinner />
      </div>
    )
  }

  const pickLogo = () => fileInputRef.current?.click()

  const onLogoSelected = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError(null)
    // Клиентская проверка (§3.1: не более 600×600 px) — мгновенная понятная
    // ошибка. Серверная валидация остаётся источником истины.
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
      // Загрузка нового лого на бэкенде сама удаляет старый (CompanyLogoUploadView).
      await uploadCompanyLogo(file)
      await refreshCompany()
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

  const submit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    setSaved(false)
    try {
      const updated = await updateCompanySettings({ name: settings.name, inn: settings.inn })
      setSettings((prev) => ({ ...prev, ...updated }))
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      setError(err.errors ? Object.values(err.errors).flat().join(' ') : err.detail || 'Не удалось сохранить.')
    } finally {
      setSubmitting(false)
    }
  }

  const logoBlock = (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, flex: 'none' }}>
      {uploadingLogo ? (
        <span style={{ width: TILE, height: TILE, borderRadius: 16, background: 'var(--color-fill-active-tint)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Spinner size={24} />
        </span>
      ) : company?.logo ? (
        <>
          <span style={{ width: TILE, height: TILE, borderRadius: 16, overflow: 'hidden', background: 'var(--color-fill-active-tint)', display: 'block' }}>
            <img src={company.logo.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </span>
          <div style={{ display: 'flex', gap: 12 }}>
            <button type="button" style={linkBtn} onClick={pickLogo}>
              Загрузить новый
            </button>
            <button type="button" style={{ ...linkBtn, color: 'var(--color-error)' }} onClick={onRemoveLogo}>
              Удалить
            </button>
          </div>
        </>
      ) : (
        // Лого не загружено — вся плитка кликабельна для выбора файла.
        <button
          type="button"
          onClick={pickLogo}
          style={{
            width: TILE,
            height: TILE,
            borderRadius: 16,
            border: '1.5px dashed var(--color-border-strong)',
            background: 'var(--color-fill-active-tint)',
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
            color: 'var(--color-text-muted)',
            fontFamily: 'inherit',
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          <span style={{ fontSize: 11 }}>Логотип</span>
        </button>
      )}
      <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onLogoSelected} />
    </div>
  )

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

      <form onSubmit={submit}>
        <Card>
          <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'center' : 'flex-start', gap: 20 }}>
            {logoBlock}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
              <Input label="Название компании" required value={settings.name} onChange={(e) => setSettings({ ...settings, name: e.target.value })} />
              <Input label="ИНН" value={settings.inn} onChange={(e) => setSettings({ ...settings, inn: e.target.value })} />
            </div>
          </div>
        </Card>
      </form>
    </div>
  )
}

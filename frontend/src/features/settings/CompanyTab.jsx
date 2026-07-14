import { useEffect, useRef, useState } from 'react'
import { useCompany, useRefreshCompany } from '../../app/CompanyContext.jsx'
import { useMediaQuery } from '../../shared/hooks/useMediaQuery.js'
import { Banner, Card, Spinner } from '../../shared/ui'
import { fieldError, InlineField } from './inlineFields.jsx'
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
const menuItem = { border: 'none', background: 'none', textAlign: 'left', padding: '10px 12px', borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', color: 'var(--color-text-primary)', whiteSpace: 'nowrap' }

// Настройки → Компания — реквизиты организации: логотип, название, ИНН.
// Технические настройки — в отдельной вкладке «Системные» (SystemTab).
export function CompanyTab() {
  const company = useCompany()
  const refreshCompany = useRefreshCompany()
  const isMobile = useMediaQuery('(max-width: 768px)')
  const [name, setName] = useState(null) // null — ещё грузится
  const [inn, setInn] = useState('')
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [logoMenu, setLogoMenu] = useState(false)
  const [logoError, setLogoError] = useState(null)
  const fileInputRef = useRef(null)

  useEffect(() => {
    getCompanySettings().then((c) => {
      setName(c.name || '')
      setInn(c.inn || '')
    })
  }, [])

  if (name === null) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
        <Spinner />
      </div>
    )
  }

  const saveName = async (val) => {
    try {
      const u = await updateCompanySettings({ name: val })
      setName(u.name || '')
      refreshCompany() // обновляем название в rail
    } catch (err) {
      return fieldError(err)
    }
  }
  const saveInn = async (val) => {
    try {
      const u = await updateCompanySettings({ inn: val })
      setInn(u.inn || '')
    } catch (err) {
      return fieldError(err)
    }
  }

  const pickLogo = () => fileInputRef.current?.click()

  const onLogoSelected = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setLogoError(null)
    if (!file.type.startsWith('image/')) {
      setLogoError('Файл должен быть изображением (PNG, JPG, SVG).')
      return
    }
    const dims = await readImageSize(file).catch(() => null)
    if (dims && (dims.width > 600 || dims.height > 600)) {
      setLogoError(`Логотип должен быть не более 600×600 px — загружено ${dims.width}×${dims.height} px.`)
      return
    }
    setUploadingLogo(true)
    try {
      // Загрузка нового лого на бэкенде сама удаляет старый (CompanyLogoUploadView).
      await uploadCompanyLogo(file)
      await refreshCompany()
    } catch (err) {
      setLogoError(fieldError(err))
    } finally {
      setUploadingLogo(false)
    }
  }

  const onRemoveLogo = async () => {
    setUploadingLogo(true)
    setLogoError(null)
    try {
      await deleteCompanyLogo()
      await refreshCompany()
    } catch (err) {
      setLogoError(err.detail || 'Не удалось удалить логотип.')
    } finally {
      setUploadingLogo(false)
    }
  }

  const logoBlock = (
    <div style={{ flex: 'none', position: 'relative' }}>
      {uploadingLogo ? (
        <span style={{ width: TILE, height: TILE, borderRadius: 16, background: 'var(--color-fill-active-tint)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Spinner size={24} />
        </span>
      ) : company?.logo ? (
        // Логотип загружен — клик по нему открывает меню Загрузить новый/Удалить.
        <>
          <button
            type="button"
            onClick={() => setLogoMenu((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={logoMenu}
            style={{ width: TILE, height: TILE, borderRadius: 16, overflow: 'hidden', background: 'var(--color-fill-active-tint)', border: 'none', padding: 0, cursor: 'pointer', display: 'block' }}
          >
            <img src={company.logo.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </button>
          {logoMenu ? (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 45 }} onClick={() => setLogoMenu(false)} />
              <div
                role="menu"
                style={{ position: 'absolute', top: TILE + 6, left: '50%', transform: 'translateX(-50%)', zIndex: 46, minWidth: 168, padding: 6, display: 'flex', flexDirection: 'column', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 12, boxShadow: 'var(--shadow-block)' }}
              >
                <button type="button" style={menuItem} onClick={() => { setLogoMenu(false); pickLogo() }}>
                  Загрузить новый
                </button>
                <button type="button" style={{ ...menuItem, color: 'var(--color-error)' }} onClick={() => { setLogoMenu(false); onRemoveLogo() }}>
                  Удалить
                </button>
              </div>
            </>
          ) : null}
        </>
      ) : (
        // Лого не загружено — вся плитка кликабельна для выбора файла.
        <button
          type="button"
          onClick={pickLogo}
          style={{ width: TILE, height: TILE, borderRadius: 16, border: '1.5px dashed var(--color-border-strong)', background: 'var(--color-fill-active-tint)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, color: 'var(--color-text-muted)', fontFamily: 'inherit' }}
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
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 19, fontWeight: 600 }}>Компания</div>
        <div style={{ fontSize: 13, color: 'var(--color-text-placeholder)', marginTop: 2 }}>Реквизиты организации — объект единственный</div>
      </div>

      {logoError ? (
        <div style={{ marginBottom: 14 }}>
          <Banner variant="error">{logoError}</Banner>
        </div>
      ) : null}

      <Card>
        <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'center' : 'flex-start', gap: 20 }}>
          {logoBlock}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%' }}>
            <InlineField label="Название компании" value={name} onSave={saveName} />
            <InlineField label="ИНН" value={inn} onSave={saveInn} onClear={() => saveInn('')} />
          </div>
        </div>
      </Card>
    </div>
  )
}

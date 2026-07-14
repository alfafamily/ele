import { useEffect, useState } from 'react'
import { SmartCaptcha } from '../auth/SmartCaptcha.jsx'
import { useMediaQuery } from '../../shared/hooks/useMediaQuery.js'
import { Banner, Button, Card, Checkbox, Input, Spinner } from '../../shared/ui'
import {
  checkCaptcha,
  checkYandexId,
  getCompanySettings,
  getSystemStatus,
  sendSmtpTestCode,
  testStorage,
  updateCompanySettings,
  updateStorageMode,
  verifySmtpTestCode,
} from './settingsApi.js'

const sectionTitle = { fontSize: 15, fontWeight: 600, marginBottom: 4 }
const sectionHint = { fontSize: 12, color: 'var(--color-text-placeholder)', marginBottom: 14 }
const notConfigured = (
  <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Настройки для сервиса не заданы в .env.</div>
)

export function SystemTab() {
  const isMobile = useMediaQuery('(max-width: 768px)')
  const [status, setStatus] = useState(null) // system-status: флаги конфигурации из .env
  const [loadError, setLoadError] = useState(null)

  // Домен и ограничение по IP
  const [domain, setDomain] = useState('')
  const [restrictByIp, setRestrictByIp] = useState(false)
  const [ipRows, setIpRows] = useState([]) // [{ ip, note }]
  const [savingAccess, setSavingAccess] = useState(false)
  const [accessSaved, setAccessSaved] = useState(false)
  const [accessError, setAccessError] = useState(null)

  // Хранилище
  const [storageMode, setStorageMode] = useState('local')
  const [savingStorage, setSavingStorage] = useState(false)
  const [storageTesting, setStorageTesting] = useState(false)
  const [storageResult, setStorageResult] = useState(null) // { ok, msg }

  // SMTP
  const [smtpStatus, setSmtpStatus] = useState('idle') // idle|sending|sent|checking|ok
  const [smtpCode, setSmtpCode] = useState('')
  const [smtpEmail, setSmtpEmail] = useState('')
  const [smtpError, setSmtpError] = useState(null)

  // Яндекс ID
  const [yandexResult, setYandexResult] = useState(null) // { ok, msg }
  const [yandexChecking, setYandexChecking] = useState(false)

  // Капча
  const [captchaOpen, setCaptchaOpen] = useState(false)
  const [captchaResult, setCaptchaResult] = useState(null) // { ok, msg }
  const [captchaChecking, setCaptchaChecking] = useState(false)

  useEffect(() => {
    Promise.all([getSystemStatus(), getCompanySettings()])
      .then(([st, company]) => {
        setStatus(st)
        setStorageMode(st.storage_mode)
        setDomain(company.domain || '')
        const list = company.ip_allowlist || []
        setRestrictByIp(list.length > 0)
        setIpRows(list.length > 0 ? list.map((e) => ({ ip: e.ip || '', note: e.note || '' })) : [{ ip: '', note: '' }])
      })
      .catch(() => setLoadError('Не удалось загрузить системные настройки.'))
  }, [])

  if (loadError) return <Banner variant="error">{loadError}</Banner>
  if (!status) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
        <Spinner />
      </div>
    )
  }

  const onStorageMode = async (mode) => {
    setSavingStorage(true)
    setStorageResult(null)
    try {
      await updateStorageMode(mode)
      setStorageMode(mode)
    } catch (err) {
      setStorageResult({ ok: false, msg: err.detail || 'Не удалось сменить режим хранилища.' })
    } finally {
      setSavingStorage(false)
    }
  }

  const runStorageTest = async () => {
    setStorageTesting(true)
    setStorageResult(null)
    try {
      const data = await testStorage()
      setStorageResult({ ok: true, msg: data.detail })
    } catch (err) {
      setStorageResult({ ok: false, msg: err.detail || 'Проверка не пройдена.' })
    } finally {
      setStorageTesting(false)
    }
  }

  const saveAccess = async () => {
    setSavingAccess(true)
    setAccessError(null)
    setAccessSaved(false)
    const ip_allowlist = restrictByIp
      ? ipRows.map((r) => ({ ip: r.ip.trim(), note: r.note.trim() })).filter((r) => r.ip)
      : []
    try {
      const updated = await updateCompanySettings({ domain, ip_allowlist })
      setDomain(updated.domain || '')
      setAccessSaved(true)
      setTimeout(() => setAccessSaved(false), 2000)
    } catch (err) {
      setAccessError(err.errors ? Object.values(err.errors).flat().join(' ') : err.detail || 'Не удалось сохранить.')
    } finally {
      setSavingAccess(false)
    }
  }

  const setRow = (i, patch) => setIpRows((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  const addRow = () => setIpRows((rows) => [...rows, { ip: '', note: '' }])
  const removeRow = (i) => setIpRows((rows) => (rows.length > 1 ? rows.filter((_, idx) => idx !== i) : [{ ip: '', note: '' }]))

  const sendSmtp = async () => {
    setSmtpStatus('sending')
    setSmtpError(null)
    try {
      const data = await sendSmtpTestCode()
      setSmtpEmail(data.email)
      setSmtpCode('')
      setSmtpStatus('sent')
    } catch (err) {
      setSmtpStatus('idle')
      setSmtpError(err.detail || 'Не удалось отправить письмо. Проверьте настройки SMTP в .env.')
    }
  }

  const verifySmtp = async () => {
    setSmtpStatus('checking')
    setSmtpError(null)
    try {
      await verifySmtpTestCode(smtpCode)
      setSmtpStatus('ok')
    } catch (err) {
      setSmtpStatus('sent')
      setSmtpError(err.detail || 'Неверный код.')
    }
  }

  const runYandexCheck = async () => {
    setYandexChecking(true)
    setYandexResult(null)
    try {
      const data = await checkYandexId()
      setYandexResult({ ok: true, msg: data.detail })
    } catch (err) {
      setYandexResult({ ok: false, msg: err.detail || 'Проверка не пройдена.' })
    } finally {
      setYandexChecking(false)
    }
  }

  // Обычная функция, не useCallback: все хуки должны стоять выше ранних return
  // (спиннер при !status), иначе на первом рендере хуков меньше, чем на втором,
  // и React падает «Rendered more hooks than previous render».
  const onCaptchaToken = async (token) => {
    setCaptchaChecking(true)
    setCaptchaResult(null)
    try {
      const data = await checkCaptcha(token)
      setCaptchaResult({ ok: true, msg: data.detail })
    } catch (err) {
      setCaptchaResult({ ok: false, msg: err.detail || 'Капча не пройдена.' })
    } finally {
      setCaptchaChecking(false)
      setCaptchaOpen(false)
    }
  }

  const resultBanner = (r) => (r ? <Banner variant={r.ok ? 'success' : 'error'}>{r.msg}</Banner> : null)

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 19, fontWeight: 600 }}>Системные</div>
        <div style={{ fontSize: 13, color: 'var(--color-text-placeholder)', marginTop: 2 }}>
          Хранилище, доступ и проверка интеграций
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Хранилище файлов */}
        <Card>
          <div style={sectionTitle}>Хранилище файлов</div>
          <div style={sectionHint}>Где хранятся загруженные файлы. Параметры S3 задаются в .env сервера.</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { value: 'local', label: 'Локальное хранилище' },
              { value: 's3', label: 'S3' },
            ].map((opt) => (
              <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 14 }}>
                <input
                  type="radio"
                  name="storage-mode"
                  checked={storageMode === opt.value}
                  disabled={savingStorage}
                  onChange={() => onStorageMode(opt.value)}
                />
                {opt.label}
              </label>
            ))}
          </div>
          <div style={{ marginTop: 14 }}>
            {storageMode === 's3' && !status.s3_configured ? (
              notConfigured
            ) : (
              <Button type="button" variant="secondary" loading={storageTesting} onClick={runStorageTest}>
                Выполнить проверку
              </Button>
            )}
          </div>
          {storageResult ? <div style={{ marginTop: 12 }}>{resultBanner(storageResult)}</div> : null}
        </Card>

        {/* Домен и ограничения входа */}
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ ...sectionTitle, marginBottom: 0 }}>Домен и ограничения входа</div>
            <Button type="button" loading={savingAccess} onClick={saveAccess}>
              {accessSaved ? 'Сохранено' : 'Сохранить'}
            </Button>
          </div>
          {accessError ? (
            <div style={{ marginBottom: 12 }}>
              <Banner variant="error">{accessError}</Banner>
            </div>
          ) : null}
          <Input label="Домен аккаунтов в системе" value={domain} onChange={(e) => setDomain(e.target.value)} />
          <div style={{ marginTop: 14 }}>
            <Checkbox label="Ограничивать вход по IP" checked={restrictByIp} onChange={setRestrictByIp} />
          </div>
          {restrictByIp ? (
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {ipRows.map((row, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    gap: 8,
                    flexDirection: isMobile ? 'column' : 'row',
                    alignItems: isMobile ? 'stretch' : 'flex-end',
                  }}
                >
                  <div style={{ width: isMobile ? 'auto' : 200 }}>
                    <Input label="IP или подсеть" placeholder="203.0.113.0/24" value={row.ip} onChange={(e) => setRow(i, { ip: e.target.value })} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <Input label="Примечание" placeholder="Офис, VPN…" value={row.note} onChange={(e) => setRow(i, { note: e.target.value })} />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeRow(i)}
                    title="Удалить"
                    aria-label="Удалить IP"
                    style={{
                      border: 'none',
                      background: 'none',
                      color: 'var(--color-text-muted)',
                      cursor: 'pointer',
                      height: 44,
                      padding: '0 6px',
                      alignSelf: isMobile ? 'flex-end' : 'auto',
                    }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
              <div>
                <Button type="button" variant="secondary" onClick={addRow}>
                  + Добавить IP
                </Button>
              </div>
            </div>
          ) : null}
        </Card>

        {/* Проверка почты (SMTP) */}
        <Card>
          <div style={sectionTitle}>Проверка почты (SMTP)</div>
          <div style={sectionHint}>
            {smtpStatus === 'sent' || smtpStatus === 'checking'
              ? `Код отправлен на ${smtpEmail} — введите его, чтобы подтвердить доставку.`
              : 'Отправим письмо с кодом на вашу почту и попросим ввести код — так проверяется реальная доставка.'}
          </div>
          {!status.email_configured ? (
            notConfigured
          ) : smtpStatus === 'ok' ? (
            <Banner variant="success">SMTP работает — письмо доставлено.</Banner>
          ) : (
            <>
              {smtpError ? (
                <div style={{ marginBottom: 12 }}>
                  <Banner variant="error">{smtpError}</Banner>
                </div>
              ) : null}
              {smtpStatus === 'sent' || smtpStatus === 'checking' ? (
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
                  <div style={{ width: 160 }}>
                    <Input label="Код из письма" value={smtpCode} onChange={(e) => setSmtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" />
                  </div>
                  <Button type="button" loading={smtpStatus === 'checking'} disabled={smtpCode.length !== 6} onClick={verifySmtp}>
                    Подтвердить
                  </Button>
                  <Button type="button" variant="secondary" onClick={sendSmtp}>
                    Отправить ещё раз
                  </Button>
                </div>
              ) : (
                <Button type="button" variant="secondary" loading={smtpStatus === 'sending'} onClick={sendSmtp}>
                  Выполнить проверку
                </Button>
              )}
            </>
          )}
        </Card>

        {/* Проверка Яндекс ID */}
        <Card>
          <div style={sectionTitle}>Проверка входа через Яндекс ID</div>
          <div style={sectionHint}>Доступность Яндекс ID по реквизитам, заданным в .env.</div>
          {!status.yandex_id_configured ? (
            notConfigured
          ) : (
            <>
              <Button type="button" variant="secondary" loading={yandexChecking} onClick={runYandexCheck}>
                Выполнить проверку
              </Button>
              {yandexResult ? <div style={{ marginTop: 12 }}>{resultBanner(yandexResult)}</div> : null}
            </>
          )}
        </Card>

        {/* Проверка Яндекс Captcha */}
        <Card>
          <div style={sectionTitle}>Проверка Яндекс SmartCaptcha</div>
          <div style={sectionHint}>Решите капчу — сервер проверит её вашим серверным ключом из .env.</div>
          {!status.captcha_configured ? (
            notConfigured
          ) : (
            <>
              {captchaOpen ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <SmartCaptcha siteKey={status.captcha_site_key} onToken={onCaptchaToken} />
                  {captchaChecking ? <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Проверяем…</div> : null}
                </div>
              ) : (
                <Button type="button" variant="secondary" onClick={() => { setCaptchaResult(null); setCaptchaOpen(true) }}>
                  Выполнить проверку
                </Button>
              )}
              {captchaResult ? <div style={{ marginTop: 12 }}>{resultBanner(captchaResult)}</div> : null}
            </>
          )}
        </Card>
      </div>
    </div>
  )
}

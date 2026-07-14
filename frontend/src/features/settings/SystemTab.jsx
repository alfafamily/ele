import { useEffect, useState } from 'react'
import { SmartCaptcha } from '../auth/SmartCaptcha.jsx'
import { useMediaQuery } from '../../shared/hooks/useMediaQuery.js'
import { Banner, Button, Card, Input, Spinner } from '../../shared/ui'
import { FieldView, fieldError, FIELD_W, IconBtn, InlineField } from './inlineFields.jsx'
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
const checkRow = { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }

const normalizeIps = (list) => (list || []).map((e) => ({ ip: e.ip || '', note: e.note || '' }))

// Индикатор результата проверки рядом с кнопкой: зелёный кружок с галочкой при
// успехе; красный кружок с крестиком и текстом ошибки при неудаче.
function StatusDot({ ok }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" style={{ flex: 'none' }} aria-hidden>
      <circle cx="12" cy="12" r="10" fill={ok ? 'var(--color-success)' : 'var(--color-error)'} />
      <path d={ok ? 'M7 12.5l3 3 7-7' : 'M8.5 8.5l7 7M15.5 8.5l-7 7'} fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
function CheckResult({ result }) {
  if (!result) return null
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
      <StatusDot ok={result.ok} />
      {!result.ok && result.msg ? <span style={{ color: 'var(--color-error)', fontSize: 13 }}>{result.msg}</span> : null}
    </span>
  )
}

export function SystemTab() {
  const isMobile = useMediaQuery('(max-width: 768px)')
  const [status, setStatus] = useState(null) // system-status: флаги конфигурации из .env
  const [loadError, setLoadError] = useState(null)

  // Домен и IP — inline-редактирование каждого поля отдельно, без общей кнопки
  // «Сохранить»: каждое действие сразу пишется в company/settings.
  const [domain, setDomain] = useState('')
  const [ipList, setIpList] = useState([]) // сохранённые [{ ip, note }]
  const [addingIp, setAddingIp] = useState(false)
  const [ipDraft, setIpDraft] = useState({ ip: '', note: '' })
  const [ipBusy, setIpBusy] = useState(false)
  const [ipError, setIpError] = useState(null)

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
        setIpList(normalizeIps(company.ip_allowlist))
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
    // S3 без параметров в .env — переключение не выполняется, радио остаётся на
    // локальном (storageMode не меняем), показываем ошибку.
    if (mode === 's3' && !status.s3_configured) {
      setStorageResult({ ok: false, msg: 'Параметры S3 не заданы в .env, использование S3 невозможно.' })
      return
    }
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

  const saveDomain = async (val) => {
    try {
      const u = await updateCompanySettings({ domain: val })
      setDomain(u.domain || '')
    } catch (err) {
      return fieldError(err)
    }
  }

  const applyAddIp = async () => {
    const entry = { ip: ipDraft.ip.trim(), note: ipDraft.note.trim() }
    if (!entry.ip) {
      setIpError('Укажите IP-адрес.')
      return
    }
    setIpBusy(true)
    setIpError(null)
    try {
      const u = await updateCompanySettings({ ip_allowlist: [...ipList, entry] })
      setIpList(normalizeIps(u.ip_allowlist))
      setAddingIp(false)
    } catch (err) {
      setIpError(fieldError(err))
    } finally {
      setIpBusy(false)
    }
  }

  const deleteIp = async (i) => {
    setIpBusy(true)
    setIpError(null)
    try {
      const u = await updateCompanySettings({ ip_allowlist: ipList.filter((_, idx) => idx !== i) })
      setIpList(normalizeIps(u.ip_allowlist))
    } catch (err) {
      setIpError(fieldError(err))
    } finally {
      setIpBusy(false)
    }
  }

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
          <div style={sectionHint}>Выберите где будут хранятся загруженные файлы.</div>
          <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? 10 : 24 }}>
            {[
              { value: 'local', label: 'Локальное хранилище' },
              { value: 's3', label: 'S3' },
            ].map((opt) => (
              <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 14 }}>
                <input type="radio" name="storage-mode" checked={storageMode === opt.value} disabled={savingStorage} onChange={() => onStorageMode(opt.value)} />
                {opt.label}
              </label>
            ))}
          </div>
          <div style={{ ...checkRow, marginTop: 14 }}>
            <Button type="button" variant="secondary" loading={storageTesting} onClick={runStorageTest}>
              Выполнить проверку
            </Button>
            <CheckResult result={storageResult} />
          </div>
        </Card>

        {/* Домен и ограничения входа */}
        <Card>
          <div style={{ ...sectionTitle, marginBottom: 14 }}>Домен и ограничения входа</div>

          <InlineField label="Домен аккаунтов в системе" value={domain} onSave={saveDomain} onClear={() => saveDomain('')} />

          <div style={{ ...sectionTitle, marginTop: 20, marginBottom: 6, fontSize: 13 }}>Разрешённые IP-адреса</div>
          <div style={{ fontSize: 12, color: 'var(--color-text-placeholder)', marginBottom: 12 }}>
            Пока список пуст — вход не ограничивается. Примечание к адресу показывается его подписью.
          </div>
          {ipError ? (
            <div style={{ marginBottom: 12 }}>
              <Banner variant="error">{ipError}</Banner>
            </div>
          ) : null}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {ipList.map((row, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
                <div style={{ maxWidth: FIELD_W, minWidth: 0 }}>
                  <FieldView label={row.note || 'IP-адрес'} value={row.ip} mono />
                </div>
                <IconBtn kind="delete" title="Удалить" onClick={() => deleteIp(i)} disabled={ipBusy} />
              </div>
            ))}

            {addingIp ? (
              <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', flexDirection: isMobile ? 'column' : 'row' }}>
                <div style={{ width: FIELD_W }}>
                  <Input label="IP или подсеть" placeholder="203.0.113.0/24" value={ipDraft.ip} onChange={(e) => setIpDraft({ ...ipDraft, ip: e.target.value })} autoFocus style={{ fontFamily: 'var(--font-mono)' }} />
                </div>
                <div style={{ width: FIELD_W }}>
                  <Input label="Примечание" placeholder="Офис, VPN…" value={ipDraft.note} onChange={(e) => setIpDraft({ ...ipDraft, note: e.target.value })} />
                </div>
                <div style={{ display: 'flex', gap: 6, flex: 'none', alignSelf: isMobile ? 'flex-end' : 'auto' }}>
                  <IconBtn outlined kind="apply" title="Применить" onClick={applyAddIp} disabled={ipBusy} />
                  <IconBtn outlined kind="cancel" title="Отменить" onClick={() => { setAddingIp(false); setIpError(null) }} disabled={ipBusy} />
                </div>
              </div>
            ) : (
              <div>
                <Button type="button" variant="secondary" onClick={() => { setIpDraft({ ip: '', note: '' }); setIpError(null); setAddingIp(true) }}>
                  + Добавить IP
                </Button>
              </div>
            )}
          </div>
        </Card>

        {/* Проверка почты (SMTP) */}
        <Card>
          <div style={sectionTitle}>Проверка почты (SMTP)</div>
          <div style={sectionHint}>
            {status.email_configured
              ? 'Отправим письмо с кодом на вашу почту и попросим ввести код'
              : 'Параметры SMTP не заданы в .env, отправка писем невозможна'}
          </div>
          {status.email_configured ? (
            smtpStatus === 'sent' || smtpStatus === 'checking' ? (
              <>
                <div style={{ fontSize: 12, color: 'var(--color-text-placeholder)', marginBottom: 10 }}>Код отправлен на {smtpEmail}</div>
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
                {smtpError ? <div style={{ marginTop: 10 }}><CheckResult result={{ ok: false, msg: smtpError }} /></div> : null}
              </>
            ) : (
              <div style={checkRow}>
                {smtpStatus === 'ok' ? (
                  <CheckResult result={{ ok: true }} />
                ) : (
                  <>
                    <Button type="button" variant="secondary" loading={smtpStatus === 'sending'} onClick={sendSmtp}>
                      Выполнить проверку
                    </Button>
                    {smtpError ? <CheckResult result={{ ok: false, msg: smtpError }} /> : null}
                  </>
                )}
              </div>
            )
          ) : null}
        </Card>

        {/* Проверка Яндекс ID */}
        <Card>
          <div style={sectionTitle}>Проверка входа через Яндекс ID</div>
          <div style={sectionHint}>
            {status.yandex_id_configured
              ? 'Проверяется связь с приложением ЯндексOAuth.'
              : 'Параметры ЯндексOAuth не заданы в .env, использование ЯндексID невозможно'}
          </div>
          {status.yandex_id_configured ? (
            <div style={checkRow}>
              <Button type="button" variant="secondary" loading={yandexChecking} onClick={runYandexCheck}>
                Выполнить проверку
              </Button>
              <CheckResult result={yandexResult} />
            </div>
          ) : null}
        </Card>

        {/* Проверка Яндекс Captcha */}
        <Card>
          <div style={sectionTitle}>Проверка Яндекс SmartCaptcha</div>
          <div style={sectionHint}>
            {status.captcha_configured
              ? 'Решите капчу — сервер проверит корректность её работы и подключения.'
              : 'Параметры Яндекс SmartCaptcha не заданы в .env, использование Яндекс SmartCaptcha невозможно'}
          </div>
          {status.captcha_configured ? (
            captchaOpen ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <SmartCaptcha siteKey={status.captcha_site_key} onToken={onCaptchaToken} />
                {captchaChecking ? <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Проверяем…</div> : null}
              </div>
            ) : (
              <div style={checkRow}>
                <Button type="button" variant="secondary" onClick={() => { setCaptchaResult(null); setCaptchaOpen(true) }}>
                  Выполнить проверку
                </Button>
                <CheckResult result={captchaResult} />
              </div>
            )
          ) : null}
        </Card>
      </div>
    </div>
  )
}

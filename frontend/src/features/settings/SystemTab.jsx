import { useEffect, useState } from 'react'
import { SmartCaptcha } from '../auth/SmartCaptcha.jsx'
import { useMediaQuery } from '../../shared/hooks/useMediaQuery.js'
import { Banner, Button, Card, Input, Spinner } from '../../shared/ui'
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

function iconPaths(kind) {
  switch (kind) {
    case 'edit':
      return (
        <>
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
        </>
      )
    case 'delete':
      return (
        <>
          <path d="M4 7h16" />
          <path d="M9 7V5h6v2" />
          <path d="M6 7l1 13h10l1-13" />
        </>
      )
    case 'apply':
      return <path d="M5 12l5 5L20 6" />
    default: // cancel
      return <path d="M18 6L6 18M6 6l12 12" />
  }
}

// Иконочная кнопка действия у поля (редактировать/удалить/применить/отменить).
function IconBtn({ kind, title, onClick, disabled }) {
  const color = kind === 'delete' ? 'var(--color-error)' : kind === 'apply' ? 'var(--color-success)' : 'var(--color-text-muted)'
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      style={{ border: 'none', background: 'none', cursor: disabled ? 'default' : 'pointer', color, padding: 6, opacity: disabled ? 0.4 : 1, display: 'inline-flex' }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {iconPaths(kind)}
      </svg>
    </button>
  )
}

// «Записанное» поле — лейбл + значение под ним (как на просмотре оборудования),
// справа кнопки-действия.
function ReadField({ label, value, mono, actions }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ flex: 1, minWidth: 0, background: 'var(--color-fill-input)', borderRadius: 10, padding: '8px 14px' }}>
        <div style={{ fontSize: 12, color: 'var(--color-text-placeholder)', lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
        <div
          style={{
            fontSize: 15,
            color: value ? 'var(--color-text-primary)' : 'var(--color-text-placeholder)',
            fontFamily: mono ? 'var(--font-mono)' : 'inherit',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {value || '—'}
        </div>
      </div>
      {actions ? <div style={{ display: 'flex', gap: 2, flex: 'none' }}>{actions}</div> : null}
    </div>
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
  const [domainEditing, setDomainEditing] = useState(false)
  const [domainDraft, setDomainDraft] = useState('')
  const [addingIp, setAddingIp] = useState(false)
  const [ipDraft, setIpDraft] = useState({ ip: '', note: '' })
  const [accessBusy, setAccessBusy] = useState(false)
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
        setIpList((company.ip_allowlist || []).map((e) => ({ ip: e.ip || '', note: e.note || '' })))
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

  // Единая запись domain/ip_allowlist: патчим только переданное поле.
  const patchAccess = async (patch, after) => {
    setAccessBusy(true)
    setAccessError(null)
    try {
      const updated = await updateCompanySettings(patch)
      setDomain(updated.domain || '')
      setIpList((updated.ip_allowlist || []).map((e) => ({ ip: e.ip || '', note: e.note || '' })))
      after?.()
    } catch (err) {
      setAccessError(err.errors ? Object.values(err.errors).flat().join(' ') : err.detail || 'Не удалось сохранить.')
    } finally {
      setAccessBusy(false)
    }
  }

  const applyDomain = () => patchAccess({ domain: domainDraft.trim() }, () => setDomainEditing(false))
  const deleteDomain = () => patchAccess({ domain: '' })

  const applyAddIp = () => {
    const entry = { ip: ipDraft.ip.trim(), note: ipDraft.note.trim() }
    if (!entry.ip) {
      setAccessError('Укажите IP-адрес.')
      return
    }
    patchAccess({ ip_allowlist: [...ipList, entry] }, () => setAddingIp(false))
  }
  const deleteIp = (i) => patchAccess({ ip_allowlist: ipList.filter((_, idx) => idx !== i) })

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
          <div style={sectionTitle}>Домен и ограничения входа</div>
          <div style={sectionHint}>Каждое поле редактируется отдельно и сохраняется сразу.</div>
          {accessError ? (
            <div style={{ marginBottom: 12 }}>
              <Banner variant="error">{accessError}</Banner>
            </div>
          ) : null}

          {/* Домен */}
          {domainEditing ? (
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6 }}>
              <div style={{ flex: 1 }}>
                <Input label="Домен аккаунтов в системе" value={domainDraft} onChange={(e) => setDomainDraft(e.target.value)} autoFocus />
              </div>
              <IconBtn kind="apply" title="Применить" onClick={applyDomain} disabled={accessBusy} />
              <IconBtn kind="cancel" title="Отменить" onClick={() => setDomainEditing(false)} disabled={accessBusy} />
            </div>
          ) : (
            <ReadField
              label="Домен аккаунтов в системе"
              value={domain}
              actions={
                <>
                  <IconBtn kind="edit" title="Редактировать" onClick={() => { setDomainDraft(domain); setAccessError(null); setDomainEditing(true) }} disabled={accessBusy} />
                  <IconBtn kind="delete" title="Очистить" onClick={deleteDomain} disabled={accessBusy || !domain} />
                </>
              }
            />
          )}

          {/* Список разрешённых IP */}
          <div style={{ ...sectionTitle, marginTop: 20, marginBottom: 6, fontSize: 13 }}>Разрешённые IP-адреса</div>
          <div style={{ fontSize: 12, color: 'var(--color-text-placeholder)', marginBottom: 12 }}>
            Пока список пуст — вход не ограничивается. Примечание к адресу показывается его подписью.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {ipList.map((row, i) => (
              <ReadField
                key={i}
                mono
                label={row.note || 'IP-адрес'}
                value={row.ip}
                actions={<IconBtn kind="delete" title="Удалить" onClick={() => deleteIp(i)} disabled={accessBusy} />}
              />
            ))}

            {addingIp ? (
              <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', flexDirection: isMobile ? 'column' : 'row' }}>
                <div style={{ width: isMobile ? 'auto' : 200 }}>
                  <Input label="IP или подсеть" placeholder="203.0.113.0/24" value={ipDraft.ip} onChange={(e) => setIpDraft({ ...ipDraft, ip: e.target.value })} autoFocus />
                </div>
                <div style={{ flex: 1, alignSelf: isMobile ? 'stretch' : 'auto' }}>
                  <Input label="Примечание" placeholder="Офис, VPN…" value={ipDraft.note} onChange={(e) => setIpDraft({ ...ipDraft, note: e.target.value })} />
                </div>
                <div style={{ display: 'flex', flex: 'none', alignSelf: isMobile ? 'flex-end' : 'auto' }}>
                  <IconBtn kind="apply" title="Применить" onClick={applyAddIp} disabled={accessBusy} />
                  <IconBtn kind="cancel" title="Отменить" onClick={() => setAddingIp(false)} disabled={accessBusy} />
                </div>
              </div>
            ) : (
              <div>
                <Button type="button" variant="secondary" onClick={() => { setIpDraft({ ip: '', note: '' }); setAccessError(null); setAddingIp(true) }}>
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

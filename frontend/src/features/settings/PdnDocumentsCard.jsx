import { useEffect, useRef, useState } from 'react'
import { Button, Card, Spinner } from '../../shared/ui'
import { fieldError } from './fieldError.js'
import { deletePdnDocument, getPdnDocuments, setPdnDocumentLink, uploadPdnDocumentFile } from './settingsApi.js'

// Компактный переключатель Ссылка/Файл — в одну строку с инпутом/кнопкой,
// высота ровно по кнопке (--control-height).
function ModeToggle({ value, onChange }) {
  return (
    <div
      style={{
        display: 'flex', height: 'var(--control-height)', flex: 'none',
        background: 'var(--color-fill-input)', borderRadius: 10, padding: 3, gap: 3,
      }}
    >
      {[
        { v: 'link', label: 'Ссылка' },
        { v: 'file', label: 'Файл' },
      ].map((o) => (
        <button
          key={o.v}
          type="button"
          onClick={() => onChange(o.v)}
          style={{
            border: 'none', borderRadius: 8, padding: '0 16px', fontSize: 13, fontWeight: 600,
            fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap',
            color: value === o.v ? 'var(--color-primary-text)' : 'var(--color-text-secondary)',
            background: value === o.v ? 'var(--color-primary)' : 'transparent',
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

// B51-R2. Настройки → Компания: документы по обработке ПДн. Каждый вид задаётся
// ссылкой ИЛИ файлом; при вводе ссылки файл скачивается и хранится локально.
// Недоступная ссылка (не 200) или веб-страница вместо файла — не сохраняются.
const KINDS = [
  { kind: 'consent', name: 'Согласие на обработку ПДн' },
  { kind: 'policy', name: 'Политика обработки ПДн' },
  { kind: 'regulation', name: 'Положение в области обработки ПДн' },
]

const sectionTitle = { fontSize: 15, fontWeight: 600, marginBottom: 4 }

function DocRow({ meta, doc, onChanged }) {
  const [mode, setMode] = useState(doc?.source_mode || 'link')
  const [url, setUrl] = useState(doc?.source_mode === 'link' ? doc?.source_url || '' : '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [ok, setOk] = useState(false)
  const fileRef = useRef(null)

  const saveLink = async () => {
    setError(null)
    setOk(false)
    if (!url.trim()) {
      setError('Укажите ссылку на файл документа.')
      return
    }
    setBusy(true)
    try {
      const updated = await setPdnDocumentLink(meta.kind, url.trim())
      setOk(true)
      onChanged(updated)
    } catch (err) {
      setError(fieldError(err))
    } finally {
      setBusy(false)
    }
  }

  const onFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError(null)
    setOk(false)
    setBusy(true)
    try {
      const updated = await uploadPdnDocumentFile(meta.kind, file)
      setOk(true)
      onChanged(updated)
    } catch (err) {
      setError(fieldError(err))
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    setBusy(true)
    setError(null)
    try {
      await deletePdnDocument(meta.kind)
      setOk(false)
      setUrl('')
      onChanged(null)
    } catch (err) {
      setError(fieldError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ padding: '16px 0', borderTop: '1px solid var(--color-border)' }}>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>{meta.name}</div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <ModeToggle value={mode} onChange={setMode} />
        {mode === 'link' ? (
          <input
            type="text"
            placeholder="https://…/document.pdf"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            style={{
              flex: '1 1 260px', minWidth: 200, height: 'var(--control-height)',
              border: `1px solid ${error ? 'var(--color-error)' : 'var(--color-border-strong)'}`,
              borderRadius: 10, padding: '0 14px', fontSize: 14, fontFamily: 'inherit',
              background: 'var(--color-surface)', color: 'var(--color-text-primary)', outline: 'none',
            }}
          />
        ) : (
          <input ref={fileRef} type="file" style={{ display: 'none' }} onChange={onFile} />
        )}
        <Button
          variant="secondary"
          onClick={mode === 'link' ? saveLink : () => fileRef.current?.click()}
          loading={busy}
          disabled={busy}
        >
          {mode === 'link' ? 'Загрузить по ссылке' : doc ? 'Заменить файл' : 'Загрузить файл'}
        </Button>
      </div>
      {error ? <div style={{ fontSize: 12.5, color: 'var(--color-error)', marginTop: 6 }}>{error}</div> : null}

      {/* Текущая сохранённая локальная копия. */}
      {doc?.file?.url ? (
        <div style={{ marginTop: 10, fontSize: 13, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ color: 'var(--color-text-placeholder)' }}>Сохранённая копия:</span>
          <a href={doc.file.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-primary)' }}>
            {doc.file.original_filename || 'документ'}
          </a>
          {ok ? <span style={{ color: 'var(--color-success, #1f9d57)', fontSize: 12.5 }}>✓ Доступна</span> : null}
          <button
            type="button"
            onClick={remove}
            disabled={busy}
            style={{ border: 'none', background: 'none', color: 'var(--color-error)', fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}
          >
            Снять
          </button>
        </div>
      ) : (
        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--color-text-placeholder)' }}>Не задан</div>
      )}
    </div>
  )
}

export function PdnDocumentsCard() {
  const [docs, setDocs] = useState(null)

  useEffect(() => {
    getPdnDocuments().then(setDocs)
  }, [])

  return (
    <Card style={{ marginBottom: 16 }}>
      <div style={sectionTitle}>Документы по обработке персональных данных</div>
      <div style={{ fontSize: 12, color: 'var(--color-text-placeholder)', marginBottom: 4 }}>
        Ссылки и файлы подставляются в текст согласия при регистрации и приглашении. При вводе ссылки файл
        загружается по ней и хранится локально; недоступная ссылка или веб-страница вместо файла не сохраняются.
      </div>
      {docs === null ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
          <Spinner />
        </div>
      ) : (
        KINDS.map((meta) => (
          <DocRow
            key={meta.kind}
            meta={meta}
            doc={docs[meta.kind]}
            onChanged={(updated) => setDocs((d) => ({ ...d, [meta.kind]: updated }))}
          />
        ))
      )}
    </Card>
  )
}

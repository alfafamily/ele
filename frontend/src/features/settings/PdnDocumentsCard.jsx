import { useEffect, useRef, useState } from 'react'
import { Button, Card, Input, Segmented, Spinner } from '../../shared/ui'
import { fieldError } from './fieldError.js'
import { deletePdnDocument, getPdnDocuments, setPdnDocumentLink, uploadPdnDocumentFile } from './settingsApi.js'

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
      <div style={{ maxWidth: 220, marginBottom: 10 }}>
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: 'link', label: 'Ссылка' },
            { value: 'file', label: 'Файл' },
          ]}
        />
      </div>

      {mode === 'link' ? (
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 300px', minWidth: 220 }}>
            <Input
              placeholder="https://…/document.pdf"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              error={error}
            />
          </div>
          <Button variant="secondary" onClick={saveLink} loading={busy} disabled={busy}>
            Загрузить по ссылке
          </Button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <Button variant="secondary" onClick={() => fileRef.current?.click()} loading={busy} disabled={busy}>
            {doc ? 'Заменить файл' : 'Загрузить файл'}
          </Button>
          <input ref={fileRef} type="file" style={{ display: 'none' }} onChange={onFile} />
          {error ? <span style={{ fontSize: 12.5, color: 'var(--color-error)' }}>{error}</span> : null}
        </div>
      )}

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

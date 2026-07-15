import { useEffect, useState } from 'react'
import { VALUE_TYPE_LABELS } from '../../shared/eav'
import { Banner, BackButton, Button, Card, Spinner, StatusPill } from '../../shared/ui'
import { DeleteTypeModal } from './DeleteTypeModal.jsx'
import { FieldFormModal } from './FieldFormModal.jsx'
import { NewTypeModal } from './NewTypeModal.jsx'
import { makeTypesApi } from './typesApi.js'

// Общий редактор Типов оборудования/лицензий — оба домена
// делят один и тот же CRUD-контракт (список/детали/реквизиты/impact),
// различия — только в текстах и в паре захардкоженных Типов лицензий.
export function TypesEditorPage({ domain, title }) {
  const api = makeTypesApi(domain)
  const [types, setTypes] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [showNewType, setShowNewType] = useState(false)
  const [showDeleteType, setShowDeleteType] = useState(false)
  const [fieldModal, setFieldModal] = useState(null) // null | 'new' | field object
  const [error, setError] = useState(null)

  const load = async (keepSelection = true) => {
    const data = await api.listTypes()
    setTypes(data)
    if (!keepSelection || (selectedId && !data.some((t) => t.id === selectedId))) {
      setSelectedId(data[0]?.id ?? null)
    } else if (selectedId === null && data.length > 0) {
      setSelectedId(data[0].id)
    }
  }

  useEffect(() => {
    load(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domain])

  if (types === null) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
        <Spinner />
      </div>
    )
  }

  const selected = types.find((t) => t.id === selectedId) || null

  const toggleArchive = async (type) => {
    await api.updateType(type.id, { is_archived: !type.is_archived })
    load()
  }

  const deleteType = async () => {
    try {
      await api.deleteType(selected.id)
      setShowDeleteType(false)
      load(false)
    } catch (err) {
      if (err.status === 409) {
        setShowDeleteType(false)
        setError(err.detail)
      } else {
        throw err
      }
    }
  }

  const deleteField = async (field) => {
    try {
      await api.deleteField(selected.id, field.id)
      load()
    } catch (err) {
      setError(err.detail || 'Не удалось удалить реквизит.')
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <BackButton />
        <h1 style={{ fontSize: 'var(--font-size-h1)', fontWeight: 600, letterSpacing: 'var(--font-h1-letter-spacing)' }}>
          Типы {title}
        </h1>
      </div>
      {error ? (
        <div style={{ marginBottom: 14 }}>
          <Banner variant="error">{error}</Banner>
        </div>
      ) : null}

      <div className="ele-sidebar-layout" style={{ gridTemplateColumns: '260px 1fr' }}>
        <div style={{ background: 'var(--color-surface)', borderRadius: 16, padding: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {types.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setSelectedId(t.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
                padding: '10px 12px',
                borderRadius: 10,
                border: 'none',
                background: t.id === selectedId ? 'var(--color-fill-active-tint)' : 'transparent',
                fontWeight: t.id === selectedId ? 600 : 500,
                fontSize: 14,
                cursor: 'pointer',
                textAlign: 'left',
                fontFamily: 'inherit',
                opacity: t.is_archived ? 0.65 : 1,
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span>
                {t.is_archived ? <StatusPill variant="archived">Архивный</StatusPill> : null}
              </span>
              <span style={{ fontSize: 11, color: 'var(--color-text-placeholder)', flex: 'none' }}>{t.objects_count}</span>
            </button>
          ))}
          <Button variant="secondary" fullWidth onClick={() => setShowNewType(true)} style={{ marginTop: 6 }}>
            + Новый тип
          </Button>
        </div>

        {selected ? (
          <Card style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, gap: 12, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ fontSize: 18, fontWeight: 600 }}>{selected.name}</div>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', background: 'var(--color-fill-active-tint)', padding: '3px 9px', borderRadius: 20 }}>
                  {selected.objects_count} объектов
                </span>
              </div>
              {!selected.is_locked ? (
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button variant="secondary" onClick={() => toggleArchive(selected)}>
                    {selected.is_archived ? 'Вернуть из архива' : 'Архивировать'}
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={selected.objects_count > 0}
                    title={selected.objects_count > 0 ? 'Есть привязанные объекты — доступно только архивирование' : undefined}
                    onClick={() => setShowDeleteType(true)}
                  >
                    Удалить
                  </Button>
                </div>
              ) : null}
            </div>

            {selected.objects_count > 0 && !selected.is_locked ? (
              <div style={{ fontSize: 11, color: 'var(--color-text-placeholder)', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="5" y="11" width="14" height="9" rx="2" />
                  <path d="M8 11V8a4 4 0 0 1 8 0v3" />
                </svg>
                Удаление недоступно: к типу привязаны объекты. Доступно архивирование.
              </div>
            ) : null}

            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Реквизиты типа</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {selected.fields.map((f) => (
                <div
                  key={f.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    background: f.is_locked ? 'var(--color-fill-input)' : 'var(--color-surface)',
                    boxShadow: f.is_locked ? 'none' : 'inset 0 0 0 1px var(--color-border)',
                    borderRadius: 10,
                    padding: '11px 13px',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                      {f.name}
                      {f.is_locked ? <StatusPill variant="archived">базовый</StatusPill> : null}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--color-text-placeholder)', marginTop: 1 }}>
                      {VALUE_TYPE_LABELS[f.value_type]} · {f.is_required ? 'обязательный' : 'необязательный'}
                      {f.value_type === 'file' ? ` · ${f.allow_multiple ? 'несколько файлов' : 'один файл'}` : ''}
                      {f.is_locked ? ' · зафиксирован' : ''}
                    </div>
                  </div>
                  {!f.is_locked ? (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <IconButton title="Редактировать" onClick={() => setFieldModal(f)}>
                        <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
                      </IconButton>
                      <IconButton title="Удалить" onClick={() => deleteField(f)}>
                        <path d="M4 7h16M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M6 7l1 13h10l1-13" />
                      </IconButton>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
            <Button variant="secondary" fullWidth style={{ marginTop: 12 }} onClick={() => setFieldModal('new')}>
              + Добавить реквизит
            </Button>
          </Card>
        ) : (
          <Card style={{ flex: 1 }}>
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--color-text-muted)' }}>Типов пока нет.</div>
          </Card>
        )}
      </div>

      {showNewType ? (
        <NewTypeModal
          onClose={() => setShowNewType(false)}
          onCreate={async (name) => {
            const created = await api.createType(name)
            setShowNewType(false)
            setSelectedId(created.id)
            load()
          }}
        />
      ) : null}

      {showDeleteType && selected ? <DeleteTypeModal type={selected} onClose={() => setShowDeleteType(false)} onConfirm={deleteType} /> : null}

      {fieldModal ? (
        <FieldFormModal
          field={fieldModal === 'new' ? null : fieldModal}
          checkImpact={fieldModal !== 'new' ? () => api.getFieldImpact(selected.id, fieldModal.id) : undefined}
          onClose={() => setFieldModal(null)}
          onSave={async (payload) => {
            if (fieldModal === 'new') {
              await api.createField(selected.id, payload)
            } else {
              await api.updateField(selected.id, fieldModal.id, payload)
            }
            setFieldModal(null)
            load()
          }}
        />
      ) : null}
    </div>
  )
}

function IconButton({ title, onClick, children }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--color-fill-input)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </svg>
    </button>
  )
}

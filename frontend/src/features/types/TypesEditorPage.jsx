import { useEffect, useState } from 'react'
import { VALUE_TYPE_LABELS } from '../../shared/eav'
import { ActionMenu, Badge, Banner, BackButton, Button, Card, Spinner } from '../../shared/ui'
import { DeleteTypeModal } from './DeleteTypeModal.jsx'
import { FieldFormModal } from './FieldFormModal.jsx'
import { NewTypeModal } from './NewTypeModal.jsx'
import { makeTypesApi } from './typesApi.js'

// Склонение «объект» по числу + примечание, почему удаление типа заблокировано.
function objectsPlural(n) {
  const d = n % 10
  const h = n % 100
  if (d === 1 && h !== 11) return 'объект'
  if (d >= 2 && d <= 4 && (h < 10 || h >= 20)) return 'объекта'
  return 'объектов'
}

function deleteBlockedNote(n) {
  const verb = n % 10 === 1 && n % 100 !== 11 ? 'Создан' : 'Создано'
  return `Удаление невозможно. ${verb} ${n} ${objectsPlural(n)} с этим типом`
}

// Общий редактор Типов оборудования/лицензий — оба домена
// делят один и тот же CRUD-контракт (список/детали/реквизиты/impact),
// различия — только в текстах и в паре захардкоженных Типов лицензий.
export function TypesEditorPage({ domain, title }) {
  const api = makeTypesApi(domain)
  const [types, setTypes] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [showNewType, setShowNewType] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null) // тип, который удаляем
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
      await api.deleteType(deleteTarget.id)
      setDeleteTarget(null)
      load(false)
    } catch (err) {
      if (err.status === 409) {
        setDeleteTarget(null)
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

  const typeMenu = (t) => {
    const items = [{ label: t.is_archived ? 'Вернуть из архива' : 'Архивировать', onClick: () => toggleArchive(t) }]
    // Удаление — только если к типу не привязаны объекты. Иначе пункт остаётся
    // видимым, но заблокирован (замочек) + примечание почему (см. note ниже).
    if (t.objects_count === 0) {
      items.push({ label: 'Удалить', danger: true, onClick: () => setDeleteTarget(t) })
    } else {
      items.push({ label: 'Удалить', icon: 'lock', disabled: true })
    }
    return items
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <BackButton />
          <h1 style={{ fontSize: 'var(--font-size-h1)', fontWeight: 600, letterSpacing: 'var(--font-h1-letter-spacing)', margin: 0 }}>
            Типы {title}
          </h1>
        </div>
        <Button onClick={() => setShowNewType(true)}>＋ Новый тип</Button>
      </div>
      {error ? (
        <div style={{ marginBottom: 14 }}>
          <Banner variant="error">{error}</Banner>
        </div>
      ) : null}

      <div className="ele-sidebar-layout" style={{ gridTemplateColumns: selected ? '300px 1fr' : '300px' }}>
        <div style={{ background: 'var(--color-surface)', borderRadius: 16, padding: 10, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {types.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--color-text-muted)', padding: '8px 10px' }}>Типы пока не созданы</div>
          ) : null}
          {types.map((t) => (
            <div
              key={t.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, paddingRight: 6, borderRadius: 11,
                background: t.id === selectedId ? 'var(--color-fill-active-tint)' : 'transparent',
              }}
            >
              <button
                type="button"
                onClick={() => setSelectedId(t.id)}
                style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: '10px 12px', border: 'none', flex: 1, minWidth: 0, textAlign: 'left', fontFamily: 'inherit', cursor: 'pointer', color: 'var(--color-text-primary)', background: 'transparent' }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                  {t.is_archived ? <Badge>Архив</Badge> : null}
                  <span style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: t.is_archived ? 0.65 : 1 }}>{t.name}</span>
                </span>
                <span style={{ fontSize: 11.5, color: 'var(--color-text-placeholder)' }}>
                  Реквизиты: {t.fields.length} · объектов: {t.objects_count}
                </span>
              </button>
              {!t.is_locked ? <ActionMenu items={typeMenu(t)} note={t.objects_count > 0 ? deleteBlockedNote(t.objects_count) : undefined} /> : null}
            </div>
          ))}
        </div>

        {selected ? (
          <Card style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 18, fontWeight: 600 }}>{selected.name}</div>
              <Badge style={{ fontSize: 11, padding: '3px 9px' }}>{selected.objects_count} объектов</Badge>
              {selected.is_archived ? <Badge style={{ fontSize: 11, padding: '3px 9px' }}>В архиве</Badge> : null}
            </div>

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
                      {f.is_locked ? <Badge>базовый</Badge> : null}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--color-text-placeholder)', marginTop: 1 }}>
                      {VALUE_TYPE_LABELS[f.value_type]} · {f.is_required ? 'обязательный' : 'необязательный'}
                      {f.value_type === 'file' ? ` · ${f.allow_multiple ? 'несколько файлов' : 'один файл'}` : ''}
                      {f.is_locked ? ' · зафиксирован' : ''}
                    </div>
                  </div>
                  {!f.is_locked ? (
                    <ActionMenu
                      items={[
                        { label: 'Редактировать', onClick: () => setFieldModal(f) },
                        { label: 'Удалить', danger: true, onClick: () => deleteField(f) },
                      ]}
                    />
                  ) : null}
                </div>
              ))}
            </div>
            <Button variant="secondary" fullWidth style={{ marginTop: 12 }} onClick={() => setFieldModal('new')}>
              ＋ Добавить реквизит
            </Button>
          </Card>
        ) : null}
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

      {deleteTarget ? <DeleteTypeModal type={deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={deleteType} /> : null}

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

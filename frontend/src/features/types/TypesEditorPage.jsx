import { useEffect, useState } from 'react'
import { usePermissions } from '../../app/usePermissions.js'
import { VALUE_TYPE_LABELS } from '../../shared/eav'
import { ActionMenu, Badge, Banner, BackButton, Button, Card, ConfirmModal, Icon, SearchInput, Spinner } from '../../shared/ui'
import { RegulationFormModal } from '../equipment/RegulationFormModal.jsx'
import { DeleteTypeModal } from './DeleteTypeModal.jsx'
import { FieldFormModal } from './FieldFormModal.jsx'
import { NewTypeModal } from './NewTypeModal.jsx'
import { RenameTypeModal } from './RenameTypeModal.jsx'
import { makeTypesApi } from './typesApi.js'

const KIND_LABEL = { software: 'Программная', hardware: 'Аппаратная' }

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
  const [showArchived, setShowArchived] = useState(false)
  const [search, setSearch] = useState('') // поиск по названию типа (клиентский)
  const [showNewType, setShowNewType] = useState(false)
  const [renameTarget, setRenameTarget] = useState(null) // тип, который переименовываем
  const [deleteTarget, setDeleteTarget] = useState(null) // тип, который удаляем
  const [deleteFieldTarget, setDeleteFieldTarget] = useState(null) // реквизит, который удаляем
  const [fieldModal, setFieldModal] = useState(null) // null | 'new' | field object
  const [error, setError] = useState(null)
  const perms = usePermissions()
  // B13+: регламенты ТО выбранного типа (только оборудование). Грузятся отдельно
  // от типов (в списке типов их нет).
  const [regulations, setRegulations] = useState(null)
  const [regModal, setRegModal] = useState(null) // null | 'new' | regulation object
  const [archiveReg, setArchiveReg] = useState(null) // регламент для архивирования

  // По умолчанию выбираем первый активный тип (архивные скрыты).
  const pickDefaultId = (data) => (data.find((t) => !t.is_archived) || data[0])?.id ?? null

  const load = async (keepSelection = true) => {
    const data = await api.listTypes()
    setTypes(data)
    if (!keepSelection || (selectedId && !data.some((t) => t.id === selectedId))) {
      setSelectedId(pickDefaultId(data))
    } else if (selectedId === null && data.length > 0) {
      setSelectedId(pickDefaultId(data))
    }
  }

  useEffect(() => {
    load(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domain])

  // Регламенты выбранного типа — только для оборудования с включённым ТО.
  useEffect(() => {
    const sel = types?.find((t) => t.id === selectedId)
    if (domain !== 'equipment' || !sel || !sel.maintenance_enabled || !perms.canManageMaintenance) {
      setRegulations(null)
      return
    }
    let cancelled = false
    setRegulations(null)
    api.listRegulations(sel.id).then((data) => {
      if (!cancelled) setRegulations(data)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domain, selectedId, types])

  const reloadRegulations = async (typeId) => {
    setRegulations(await api.listRegulations(typeId))
  }

  if (types === null) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
        <Spinner />
      </div>
    )
  }

  const selected = types.find((t) => t.id === selectedId) || null
  // Архивные типы скрыты по умолчанию; кнопка «Показать архив» — как у списка
  // Зданий в «Помещениях».
  const hasArchived = types.some((t) => t.is_archived)
  const q = search.trim().toLowerCase()
  const visibleTypes = (showArchived ? types : types.filter((t) => !t.is_archived)).filter(
    (t) => !q || t.name.toLowerCase().includes(q),
  )

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

  const deleteField = async () => {
    try {
      await api.deleteField(selected.id, deleteFieldTarget.id)
      setDeleteFieldTarget(null)
      load()
    } catch (err) {
      setDeleteFieldTarget(null)
      setError(err.detail || 'Не удалось удалить реквизит.')
    }
  }

  const toggleRegArchive = async (reg, archived) => {
    await api.archiveRegulation(selected.id, reg.id, archived)
    reloadRegulations(selected.id)
  }

  const typeMenu = (t) => {
    const items = [
      // У оборудования модалка редактирует и флаги (SIM/ТО), поэтому «Изменить»;
      // у лицензий меняется только наименование — «Переименовать».
      { label: domain === 'equipment' ? 'Изменить' : 'Переименовать', onClick: () => setRenameTarget(t) },
      { label: t.is_archived ? 'Вернуть из архива' : 'Архивировать', onClick: () => toggleArchive(t) },
    ]
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
      <div className="ele-page-head" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <BackButton />
          <h1 style={{ fontSize: 'var(--font-size-h1)', fontWeight: 600, letterSpacing: 'var(--font-h1-letter-spacing)', margin: 0, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            Типы {title}
          </h1>
        </div>
        <div className="ele-page-head__actions">
          <Button onClick={() => setShowNewType(true)} title="Новый тип" aria-label="Новый тип">
            <Icon className="ele-only-desktop" name="plus" size={18} strokeWidth={2.2} />
            <span className="ele-only-desktop">Новый тип</span>
            <Icon className="ele-only-mobile" name="plus" size={22} strokeWidth={2.4} />
          </Button>
        </div>
      </div>
      {error ? (
        <div style={{ marginBottom: 14 }}>
          <Banner variant="error">{error}</Banner>
        </div>
      ) : null}

      <div className="ele-sidebar-layout" style={{ gridTemplateColumns: selected ? '300px 1fr' : '300px' }}>
        <div style={{ background: 'var(--color-surface)', borderRadius: 16, padding: 10, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '6px 8px 8px' }}>
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--color-text-placeholder)' }}>
              Типы
            </span>
            {hasArchived ? (
              <button type="button" onClick={() => setShowArchived((v) => !v)} style={toggleBtnStyle}>
                {showArchived ? 'Скрыть архив' : 'Показать архив'}
              </button>
            ) : null}
          </div>
          <div style={{ padding: '0 4px 8px' }}>
            <SearchInput value={search} onChange={setSearch} placeholder="Поиск" />
          </div>
          {visibleTypes.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--color-text-muted)', padding: '8px 10px' }}>
              {q ? 'Ничего не найдено' : 'Типы пока не созданы'}
            </div>
          ) : null}
          {visibleTypes.map((t) => (
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
              {/* B18: вид типа лицензии (задан при создании, неизменяем). */}
              {domain === 'license' && selected.kind ? (
                <Badge style={{ fontSize: 11, padding: '3px 9px' }}>{KIND_LABEL[selected.kind] || selected.kind}</Badge>
              ) : null}
              <Badge style={{ fontSize: 11, padding: '3px 9px' }}>{selected.objects_count} объектов</Badge>
              {selected.is_archived ? <Badge style={{ fontSize: 11, padding: '3px 9px' }}>В архиве</Badge> : null}
            </div>

            {/* B17/B13: флаги SIM и ТО — только для чтения; изменяются в модалке
                «Изменить» (и на форме создания). Здесь — текстовый статус. */}
            {domain === 'equipment' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 18 }}>
                <TypeFlagStatus
                  on={!!selected.allows_sim}
                  onText="В оборудование можно устанавливать SIM"
                  offText="В оборудование нельзя устанавливать SIM"
                />
                <TypeFlagStatus
                  on={!!selected.allows_license}
                  onText="К оборудованию можно привязывать лицензии"
                  offText="К оборудованию нельзя привязывать лицензии"
                />
                <TypeFlagStatus
                  on={!!selected.maintenance_enabled}
                  onText="Для оборудования можно проводить ТО"
                  offText="Для оборудования не доступно проведение ТО"
                />
              </div>
            ) : null}

            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Реквизиты типа</div>
            <Button variant="secondary" fullWidth style={{ marginBottom: 12 }} onClick={() => setFieldModal('new')}>
              <Icon name="plus" size={18} strokeWidth={2.2} />
              Добавить реквизит
            </Button>
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
                        { label: 'Удалить', danger: true, onClick: () => setDeleteFieldTarget(f) },
                      ]}
                    />
                  ) : null}
                </div>
              ))}
            </div>

            {/* B13+: регламенты ТО — только для оборудования с включённым ТО и
                только для тех, кто управляет ТО (admin / учётчик с флагом). */}
            {domain === 'equipment' && selected.maintenance_enabled && perms.canManageMaintenance ? (
              <div style={{ marginTop: 28 }}>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Регламенты ТО</div>
                <Button variant="secondary" fullWidth style={{ marginBottom: 12 }} onClick={() => setRegModal('new')}>
                  <Icon name="plus" size={18} strokeWidth={2.2} />
                  Добавить регламент
                </Button>
                {regulations === null ? (
                  <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Загрузка…</div>
                ) : regulations.length === 0 ? (
                  <div style={{ fontSize: 13.5, color: 'var(--color-text-muted)' }}>
                    Регламенты пока не созданы.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {regulations.map((reg) => (
                      <div
                        key={reg.id}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 12,
                          background: 'var(--color-surface)', boxShadow: 'inset 0 0 0 1px var(--color-border)',
                          borderRadius: 10, padding: '11px 13px',
                        }}
                      >
                        {/* Содержимое приглушается у архивных; кнопка возврата — нет. */}
                        <div style={{ flex: 1, minWidth: 0, opacity: reg.is_archived ? 0.55 : 1 }}>
                          <div style={{ fontSize: 13.5, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                            {reg.name}
                            {reg.is_archived ? <Badge>В архиве</Badge> : null}
                          </div>
                          <div style={{ fontSize: 11.5, color: 'var(--color-text-placeholder)', marginTop: 1 }}>
                            {regulationPeriodLabel(reg)} · позиций: {reg.items.length}
                          </div>
                        </div>
                        {reg.is_archived ? (
                          <button type="button" title="Вернуть из архива" onClick={() => toggleRegArchive(reg, false)} style={typeReturnBtn}>
                            <Icon name="undo-2" size={18} strokeWidth={2} />
                          </button>
                        ) : (
                          <ActionMenu
                            items={[
                              { label: 'Изменить', onClick: () => setRegModal(reg) },
                              { label: 'Отменить', danger: true, onClick: () => setArchiveReg(reg) },
                            ]}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : null}
          </Card>
        ) : null}
      </div>

      {showNewType ? (
        <NewTypeModal
          domain={domain}
          onClose={() => setShowNewType(false)}
          onCreate={async (name, extra) => {
            const created = await api.createType(name, extra)
            setShowNewType(false)
            setSelectedId(created.id)
            load()
          }}
        />
      ) : null}

      {renameTarget ? (
        <RenameTypeModal
          type={renameTarget}
          domain={domain}
          onClose={() => setRenameTarget(null)}
          onSave={async (payload) => {
            await api.updateType(renameTarget.id, payload)
            setRenameTarget(null)
            load()
          }}
        />
      ) : null}

      {deleteTarget ? <DeleteTypeModal type={deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={deleteType} /> : null}

      {deleteFieldTarget ? (
        <ConfirmModal
          title="Удалить реквизит?"
          message={`Реквизит «${deleteFieldTarget.name}» будет удалён у Типа. Значения этого реквизита во всех объектах этого Типа будут удалены безвозвратно.`}
          confirmLabel="Удалить"
          onConfirm={deleteField}
          onClose={() => setDeleteFieldTarget(null)}
        />
      ) : null}

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

      {regModal ? (
        <RegulationFormModal
          regulation={regModal === 'new' ? null : regModal}
          onClose={() => setRegModal(null)}
          onSave={async (payload) => {
            if (regModal === 'new') {
              await api.createRegulation(selected.id, payload)
            } else {
              await api.updateRegulation(selected.id, regModal.id, payload)
            }
            setRegModal(null)
            reloadRegulations(selected.id)
          }}
        />
      ) : null}

      {archiveReg ? (
        <ConfirmModal
          title="Отменить регламент?"
          message={`Регламент «${archiveReg.name}» будет отменён (в архив) для всего оборудования этого типа. Плановые даты ТО по нему обнулятся; вернуть регламент можно позже.`}
          confirmLabel="Отменить"
          onConfirm={async () => {
            await toggleRegArchive(archiveReg, true)
            setArchiveReg(null)
          }}
          onClose={() => setArchiveReg(null)}
        />
      ) : null}
    </div>
  )
}

// «раз в N мес.» / «по потребности» — подпись периодичности регламента.
export function regulationPeriodLabel(reg) {
  if (reg.on_demand) return 'По потребности'
  const n = reg.period_months
  const d = n % 10
  const h = n % 100
  const word = d === 1 && h !== 11 ? 'месяц' : d >= 2 && d <= 4 && (h < 10 || h >= 20) ? 'месяца' : 'месяцев'
  return `Раз в ${n} ${word}`
}

// Текст-статус флага Типа оборудования (SIM/ТО) — в блоке реквизитов только для
// чтения. Иконка-галочка/крестик + подпись, зелёный/приглушённый цвет.
function TypeFlagStatus({ on, onText, offText }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <Icon
        name={on ? 'circle-check' : 'circle-x'}
        size={16}
        strokeWidth={2}
        style={{ color: on ? 'var(--color-success)' : 'var(--color-text-placeholder)', flex: 'none' }}
      />
      <span style={{ fontSize: 13.5, fontWeight: 500, color: on ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>
        {on ? onText : offText}
      </span>
    </div>
  )
}

const typeReturnBtn = {
  width: 44, height: 44, flex: 'none', borderRadius: 10, background: 'var(--color-fill-input)', border: 'none',
  color: 'var(--color-text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
}

const toggleBtnStyle = {
  fontFamily: 'inherit',
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--color-text-muted)',
  background: 'var(--color-fill-input)',
  border: 'none',
  borderRadius: 8,
  padding: '5px 10px',
  cursor: 'pointer',
  flex: 'none',
}

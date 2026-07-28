import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Can, usePermissions } from '../../app/usePermissions.js'
import { FieldValueDisplay } from '../../shared/eav'
import { LeadIconCircle } from '../../shared/LeadIconCircle.jsx'
import { PlacementRow } from '../../shared/PlacementRow.jsx'
import { HistoryList } from '../../shared/HistoryList.jsx'
import { ActionMenu, BackButton, Button, Card, ConfirmModal, Icon, Spinner } from '../../shared/ui'
import { AttachEquipmentModal } from './AttachEquipmentModal.jsx'
import { DetachToStorageModal } from '../employees/DetachToStorageModal.jsx'
import { detachLicenseFromEquipment, getLicense, getLicenseHistoryPath } from './licensesApi.js'
import { MaskedKeyField } from './MaskedKeyField.jsx'
import { LICENSE_STATUS_LABEL } from './statusLabels.js'
import { UtilizeModal } from './UtilizeModal.jsx'

// B18: вид лицензии (Программная/Аппаратная) — свойство её Типа.
const KIND_LABEL = { software: 'Программная', hardware: 'Аппаратная' }

export function LicenseCardPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const perms = usePermissions()
  const [license, setLicense] = useState(null)
  const [loadError, setLoadError] = useState(false)
  const [showUtilize, setShowUtilize] = useState(false)
  const [showAttach, setShowAttach] = useState(false)
  const [confirmDetach, setConfirmDetach] = useState(false)
  const [detachToStorage, setDetachToStorage] = useState(false)
  const [historyKey, setHistoryKey] = useState(0)

  const load = useCallback(() => {
    setLoadError(false)
    getLicense(id)
      .then((data) => {
        setLicense(data)
        setHistoryKey((k) => k + 1)
      })
      .catch(() => setLoadError(true))
  }, [id])

  useEffect(load, [load])

  if (loadError) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: 60, textAlign: 'center' }}>
        <div style={{ fontSize: 16, fontWeight: 600 }}>Не удалось открыть лицензию</div>
        <div style={{ fontSize: 14, color: 'var(--color-text-muted)' }}>Объект не найден или недоступен.</div>
        <Link to="/licenses">
          <Button variant="secondary">К списку лицензий</Button>
        </Link>
      </div>
    )
  }

  if (!license) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
        <Spinner />
      </div>
    )
  }

  const onDetach = async (storagePlaceId) => {
    await detachLicenseFromEquipment(license.id, storagePlaceId)
    load()
  }

  return (
    <div>
      {/* Хлебные крошки — только desktop: на мобильных вложенности глубже двух
          уровней нет, назад решает кнопка «Назад». */}
      <div className="ele-only-desktop" style={{ fontSize: 13, color: 'var(--color-text-placeholder)', marginBottom: 10 }}>
        <Link to="/licenses" style={{ color: 'var(--color-text-muted)' }}>
          Лицензии
        </Link>{' '}
        / {license.license_type_name}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
          <BackButton />
          <h1 className="ele-card-title">{license.license_type_name}</h1>
        </div>
        {!license.is_retired && perms.canManageLicenses ? (
          <>
            <div className="ele-card-actions-desktop">
              <Button variant="danger" onClick={() => setShowUtilize(true)}>
                Утилизировать
              </Button>
              <Link to={`/licenses/${license.id}/edit`}>
                <Button>Редактировать</Button>
              </Link>
            </div>
            <div className="ele-card-actions-mobile">
              <ActionMenu
                items={[
                  { label: 'Редактировать', onClick: () => navigate(`/licenses/${license.id}/edit`) },
                  { label: 'Утилизировать', danger: true, onClick: () => setShowUtilize(true) },
                ]}
              />
            </div>
          </>
        ) : null}
      </div>

      <div className={'ele-obj-layout' + (license.is_retired ? ' ele-obj-layout--no-side' : '')}>
        <div className="ele-obj-layout__main">
          <Card>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Основная информация</div>
          <div className="ele-field-grid">
            <Field label="Тип лицензии" value={license.license_type_name} />
            <Field label="Вид лицензии" value={KIND_LABEL[license.license_type_kind] || '—'} />
            <Field label="Статус" value={license.is_retired ? 'Утилизирована' : LICENSE_STATUS_LABEL[license.status]} />
          </div>
        </Card>

        {(() => {
          // Файловые реквизиты выносим в отдельный блок «Файлы» под параметрами.
          // B30: реквизиты показываем в порядке, заданном у Типа (field_order).
          const byOrder = (a, b) => a.field_order - b.field_order
          const paramValues = license.field_values.filter((fv) => fv.value_type !== 'file').sort(byOrder)
          const fileValues = license.field_values.filter((fv) => fv.value_type === 'file').sort(byOrder)
          return (
            <>
              <Card>
                <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Параметры лицензии</div>
                {paramValues.length === 0 ? (
                  <div style={{ fontSize: 13.5, color: 'var(--color-text-muted)' }}>У этого Типа нет реквизитов.</div>
                ) : (
                  <div className="ele-field-grid">
                    {paramValues.map((fv) =>
                      fv.is_locked ? (
                        <MaskedKeyField key={fv.field} fv={fv} canReveal={perms.canRevealSecrets} />
                      ) : (
                        <FieldValueDisplay key={fv.field} fv={fv} />
                      )
                    )}
                  </div>
                )}
              </Card>

              {fileValues.length > 0 ? (
                <Card>
                  <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Файлы</div>
                  <div className="ele-field-grid">
                    {fileValues.map((fv) => (
                      <FieldValueDisplay key={fv.field} fv={fv} />
                    ))}
                  </div>
                </Card>
              ) : null}
            </>
          )
        })()}

        <Card>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Дополнительные поля</div>
          {license.custom_fields.length === 0 ? (
            <div style={{ fontSize: 13.5, color: 'var(--color-text-muted)' }}>Дополнительных полей нет.</div>
          ) : (
            <div className="ele-field-grid">
              {license.custom_fields.map((cf) => (
                <Field key={cf.id} label={cf.name} value={cf.value} />
              ))}
            </div>
          )}
        </Card>
        </div>

        {/* Боковой блок «Лицензия установлена на» — справа и липкий (desktop),
            перед Историей (mobile); у утилизированной всегда пуст — скрыт. */}
        {!license.is_retired ? (
        <Card className="ele-obj-layout__side ele-card-sticky">
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Размещение</div>
          {license.equipment_detail ? (
            <>
              <PlacementRow
                circle={<LeadIconCircle name="tag" size={46} iconSize={20} />}
                label="В оборудовании"
                title={<Link to={`/equipment/${license.equipment_detail.id}`} style={{ color: 'var(--color-text-primary)' }}>{license.equipment_detail.type_and_model}</Link>}
                sub={license.equipment_detail.inventory_number || undefined}
              />
              <Can perm="canManageLicenses">
                <Button variant="secondary" fullWidth style={{ marginTop: 14 }} onClick={() => (license.is_hardware ? setDetachToStorage(true) : setConfirmDetach(true))}>
                  Отвязать
                </Button>
              </Can>
            </>
          ) : license.is_hardware ? (
            <>
              {license.storage_place_detail ? (
                <PlacementRow
                  circle={<LeadIconCircle name="warehouse" size={46} iconSize={20} />}
                  label="На складе"
                  title={license.storage_place_detail.name}
                  sub={`${license.storage_place_detail.building_name} — ${license.storage_place_detail.room_name}`}
                />
              ) : (
                <PlacementRow
                  circle={<LeadIconCircle name="warehouse" size={46} iconSize={20} />}
                  label="На складе"
                  title="Без склада"
                />
              )}
              <Can perm="canManageLicenses">
                <Button fullWidth style={{ marginTop: 14 }} onClick={() => setShowAttach(true)}>
                  <Icon name="plus" size={18} strokeWidth={2.2} />
                  Привязать к оборудованию
                </Button>
              </Can>
            </>
          ) : (
            <>
              <PlacementRow
                circle={<LeadIconCircle name="cloud" size={46} iconSize={20} />}
                title="Не хранится физически"
              />
              <Can perm="canManageLicenses">
                <Button fullWidth style={{ marginTop: 14 }} onClick={() => setShowAttach(true)}>
                  <Icon name="plus" size={18} strokeWidth={2.2} />
                  Привязать к оборудованию
                </Button>
              </Can>
            </>
          )}
        </Card>
        ) : null}

        <Card className="ele-obj-layout__history">
          <HistoryList path={getLicenseHistoryPath(license.id)} reloadKey={historyKey} />
        </Card>
      </div>

      {confirmDetach && license.equipment_detail ? (
        <ConfirmModal
          title="Отвязать от оборудования?"
          message={`Лицензия «${license.license_type_name}» будет отвязана от «${license.equipment_detail.type_and_model}».`}
          confirmLabel="Отвязать"
          onConfirm={() => onDetach()}
          onClose={() => setConfirmDetach(false)}
        />
      ) : null}

      {detachToStorage && license.equipment_detail ? (
        <DetachToStorageModal
          title="Отвязать и убрать на склад"
          description={`Аппаратная лицензия «${license.license_type_name}» будет отвязана от оборудования и положена на склад.`}
          onConfirm={async (storagePlaceId) => {
            await onDetach(storagePlaceId)
            setDetachToStorage(false)
          }}
          onClose={() => setDetachToStorage(false)}
        />
      ) : null}

      {showUtilize ? (
        <UtilizeModal
          license={license}
          onClose={() => setShowUtilize(false)}
          onDone={() => {
            setShowUtilize(false)
            load()
          }}
        />
      ) : null}
      {showAttach ? (
        <AttachEquipmentModal
          license={license}
          onClose={() => setShowAttach(false)}
          onAttached={() => {
            setShowAttach(false)
            load()
          }}
        />
      ) : null}
    </div>
  )
}

function Field({ label, value, muted }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 12, color: 'var(--color-text-placeholder)', marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 500, color: muted ? 'var(--color-text-muted)' : 'inherit', overflowWrap: 'break-word' }}>{value || '—'}</div>
    </div>
  )
}

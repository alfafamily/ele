import { useState } from 'react'
import { Banner, Button, Checkbox, Input, Modal } from '../../shared/ui'

// Модалка создания Вида имущества. Доменные поля:
//  · equipment — чекбокс «Установка SIM/E-SIM» (B17);
//  · license  — выбор типа «Программная/Аппаратная» (B18), обязателен и после
//    создания не меняется (определяет ключевой реквизит Вида).
export function NewTypeModal({ domain, onClose, onCreate }) {
  const [name, setName] = useState('')
  const [allowsSim, setAllowsSim] = useState(false)
  const [allowsLicense, setAllowsLicense] = useState(false)
  const [maintenanceEnabled, setMaintenanceEnabled] = useState(false)
  const [kind, setKind] = useState('software')
  // B3: тип транспорта — единица учёта пробега + признак регистрации в ГИБДД
  // (Да → есть базовый реквизит «Гос.номер»). Оба задаются при создании.
  const [mileageUnit, setMileageUnit] = useState('km')
  const [gibdd, setGibdd] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const isLicense = domain === 'license'
  const isTransport = domain === 'transport'

  const submit = async () => {
    setSubmitting(true)
    setError(null)
    try {
      const extra = isLicense
        ? { kind }
        : isTransport
          ? { mileage_unit: mileageUnit, gibdd_registration: gibdd }
          : { allows_sim: allowsSim, allows_license: allowsLicense, maintenance_enabled: maintenanceEnabled }
      await onCreate(name, extra)
    } catch (err) {
      setError(err.errors ? Object.values(err.errors).flat().join(' ') : err.detail || 'Не удалось создать вид.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open onClose={onClose} title="Новый вид">
      {error ? <Banner variant="error">{error}</Banner> : null}
      <Input label="Наименование" required autoFocus value={name} onChange={(e) => setName(e.target.value)} />

      {isLicense ? (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Тип лицензии</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { value: 'software', label: 'Программная', hint: 'Ключевой реквизит — «Номер/ключ».' },
              { value: 'hardware', label: 'Аппаратная', hint: 'Ключевой реквизит — «Номер/ID/Serial токена»; свободный ключ можно хранить на складе.' },
            ].map((opt) => (
              <label key={opt.value} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', padding: '10px 12px', borderRadius: 10, boxShadow: `inset 0 0 0 1px ${kind === opt.value ? 'var(--color-primary)' : 'var(--color-border)'}` }}>
                <input type="radio" name="license-kind" checked={kind === opt.value} onChange={() => setKind(opt.value)} style={{ marginTop: 2, flex: 'none' }} />
                <span style={{ minWidth: 0 }}>
                  <span style={{ fontSize: 14, fontWeight: 500 }}>{opt.label}</span>
                  <span style={{ display: 'block', fontSize: 11.5, color: 'var(--color-text-placeholder)', marginTop: 2 }}>{opt.hint}</span>
                </span>
              </label>
            ))}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--color-text-placeholder)', marginTop: 8 }}>
            Тип задаётся один раз и не меняется после создания вида.
          </div>
        </div>
      ) : isTransport ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, marginTop: 16 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Учёт пробега</div>
            <Segmented
              value={mileageUnit}
              onChange={setMileageUnit}
              options={[
                { value: 'km', label: 'По километрам' },
                { value: 'motohours', label: 'По моточасам' },
              ]}
            />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Регистрация в ГИБДД</div>
            <Segmented
              value={gibdd ? 'yes' : 'no'}
              onChange={(v) => setGibdd(v === 'yes')}
              options={[
                { value: 'yes', label: 'Да' },
                { value: 'no', label: 'Нет' },
              ]}
            />
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 16 }}>
          <div>
            <Checkbox label="В оборудование можно устанавливать SIM/E-SIM" checked={allowsSim} onChange={setAllowsSim} />
            <div style={{ fontSize: 11.5, color: 'var(--color-text-placeholder)', marginTop: 2, marginLeft: 30 }}>
              Только в оборудование этого вида можно будет устанавливать SIM/E-SIM.
            </div>
          </div>
          <div>
            <Checkbox label="К оборудованию можно привязывать лицензии" checked={allowsLicense} onChange={setAllowsLicense} />
            <div style={{ fontSize: 11.5, color: 'var(--color-text-placeholder)', marginTop: 2, marginLeft: 30 }}>
              Только у оборудования этого вида будет блок «Установленные лицензии».
            </div>
          </div>
          <div>
            <Checkbox label="Для оборудования можно проводить ТО" checked={maintenanceEnabled} onChange={setMaintenanceEnabled} />
            <div style={{ fontSize: 11.5, color: 'var(--color-text-placeholder)', marginTop: 2, marginLeft: 30 }}>
              Включает учёт техобслуживания: кнопку «Провести ТО», статусы и индикаторы в списке.
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
        <Button variant="secondary" fullWidth onClick={onClose}>
          Отмена
        </Button>
        <Button fullWidth loading={submitting} disabled={!name.trim()} onClick={submit}>
          Создать
        </Button>
      </div>
    </Modal>
  )
}

// Сегментированный выбор Да/Нет и т.п. (взаимоисключающий).
function Segmented({ value, onChange, options }) {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          style={{
            flex: 1,
            padding: '9px 6px',
            fontSize: 13,
            fontWeight: 600,
            fontFamily: 'inherit',
            cursor: 'pointer',
            borderRadius: 8,
            border: 'none',
            color: value === o.value ? 'var(--color-primary-text)' : 'var(--color-text-secondary)',
            background: value === o.value ? 'var(--color-primary)' : 'var(--color-fill-input)',
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

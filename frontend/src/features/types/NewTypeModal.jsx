import { useState } from 'react'
import { Banner, Button, Input, Modal } from '../../shared/ui'

// Модалка создания Типа. Доменные поля:
//  · equipment — чекбокс «Установка SIM/E-SIM» (B17);
//  · license  — выбор вида «Программная/Аппаратная» (B18), обязателен и после
//    создания не меняется (определяет ключевой реквизит Типа).
export function NewTypeModal({ domain, onClose, onCreate }) {
  const [name, setName] = useState('')
  const [allowsSim, setAllowsSim] = useState(false)
  const [kind, setKind] = useState('software')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const isLicense = domain === 'license'

  const submit = async () => {
    setSubmitting(true)
    setError(null)
    try {
      const extra = isLicense ? { kind } : { allows_sim: allowsSim }
      await onCreate(name, extra)
    } catch (err) {
      setError(err.errors ? Object.values(err.errors).flat().join(' ') : err.detail || 'Не удалось создать тип.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open onClose={onClose} title="Новый тип">
      {error ? <Banner variant="error">{error}</Banner> : null}
      <Input label="Наименование" required autoFocus value={name} onChange={(e) => setName(e.target.value)} />

      {isLicense ? (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Вид лицензии</div>
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
            Вид задаётся один раз и не меняется после создания типа.
          </div>
        </div>
      ) : (
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginTop: 16, cursor: 'pointer' }}>
          <input type="checkbox" checked={allowsSim} onChange={(e) => setAllowsSim(e.target.checked)} style={{ marginTop: 2, flex: 'none' }} />
          <span style={{ minWidth: 0 }}>
            <span style={{ fontSize: 14, fontWeight: 500 }}>В оборудование можно устанавливать SIM/E-SIM</span>
            <span style={{ display: 'block', fontSize: 11.5, color: 'var(--color-text-placeholder)', marginTop: 2 }}>
              Только в оборудование этого типа можно будет устанавливать SIM/E-SIM.
            </span>
          </span>
        </label>
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

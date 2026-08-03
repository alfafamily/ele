import { Card, StatusPill } from '../../shared/ui'
import { DeviceSnapshotChip } from '../../shared/DeviceSnapshot.jsx'

// B51-R2. Блок «Согласие на обработку ПДн» на карточке сотрудника. Оператор и
// субъект — два независимых подтверждения (могут сосуществовать). Вместо номера
// версии — перечень документов, на которые дано согласие (ссылки на копии).

function fmt(dt) {
  if (!dt) return ''
  const d = new Date(dt)
  return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const labelStyle = { fontSize: 13.5, fontWeight: 600 }
const metaStyle = { fontSize: 12.5, color: 'var(--color-text-muted)', marginTop: 2 }

export function ConsentCard({ employee }) {
  const consents = employee.consents || []
  const operator = consents.find((c) => c.source === 'operator')
  const self = consents.find((c) => c.source === 'self')
  const has = Boolean(operator || self)
  // Перечень документов — из последнего доступного снимка (self приоритетнее).
  const documents = (self?.documents?.length ? self.documents : operator?.documents) || []

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: has ? 14 : 8 }}>
        <div style={{ fontSize: 16, fontWeight: 600 }}>Согласие на обработку ПДн</div>
        <StatusPill variant={has ? 'assigned' : 'meta'}>{has ? 'Получено' : 'Не зафиксировано'}</StatusPill>
      </div>

      {operator ? (
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', paddingBottom: self ? 12 : 0 }}>
          <div>
            <div style={labelStyle}>Подтверждено оператором</div>
            <div style={metaStyle}>
              {[operator.by_position, operator.by_name].filter(Boolean).join(' · ')}
              {operator.by_position || operator.by_name ? ' — ' : ''}
              {fmt(operator.at)}
            </div>
          </div>
        </div>
      ) : null}

      {self ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: operator ? 12 : 0, borderTop: operator ? '1px solid var(--color-border)' : 'none' }}>
          <div>
            <div style={labelStyle}>Подтверждено сотрудником</div>
            <div style={metaStyle}>{fmt(self.at)}</div>
          </div>
          {self.device_snapshot ? <DeviceSnapshotChip snapshot={self.device_snapshot} /> : null}
        </div>
      ) : null}

      {!has ? (
        <div style={{ fontSize: 12.5, color: 'var(--color-text-placeholder)', lineHeight: 1.5 }}>
          Согласие не зафиксировано (запись заведена до внедрения фиксации либо без отметки). Связанному сотруднику
          показывается напоминание подтвердить согласие.
        </div>
      ) : null}

      {documents.length ? (
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px dashed var(--color-border)' }}>
          <div style={{ fontSize: 12, color: 'var(--color-text-placeholder)', marginBottom: 8 }}>
            Документы, на которые дано согласие:
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {documents.map((d) => (
              <a
                key={d.kind}
                href={d.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontSize: 13, color: 'var(--color-primary)', textDecoration: 'none',
                  background: 'var(--color-fill-input)', border: '1px solid var(--color-border)',
                  borderRadius: 8, padding: '6px 11px',
                }}
              >
                {d.kind_display}
              </a>
            ))}
          </div>
        </div>
      ) : null}
    </Card>
  )
}

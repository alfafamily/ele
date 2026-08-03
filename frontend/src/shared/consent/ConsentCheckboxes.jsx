import { Checkbox } from '../ui'

// B51-R2. Два обязательных согласия субъекта на обработку ПДн: ознакомление
// (Политика + Положение) и собственно согласие. Тексты и три гиперссылки
// согласованы с заказчиком — не менять без согласования. Слово становится
// ссылкой только если оператор задал соответствующий документ (иначе — текст).
//
// Используется на саморегистрации и в модалке дособирания согласия (Профиль).
// `pdn` — объект bootstrap.pdn_consent: { company_name, company_inn, documents }.

function DocPhrase({ doc, children }) {
  if (doc?.url) {
    return (
      <a href={doc.url} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    )
  }
  return <span>{children}</span>
}

// «[для] компании «Ромашка» (ИНН 7701234567)» — название/ИНН опциональны.
function companyMention(pdn, prefix) {
  const name = pdn?.company_name
  const inn = pdn?.company_inn
  return (
    <>
      {prefix ? `${prefix} ` : ''}компании
      {name ? <> «{name}»</> : null}
      {inn ? <> (ИНН {inn})</> : null}
    </>
  )
}

export function ConsentCheckboxes({ pdn, acknowledged, agreed, onAcknowledged, onAgreed }) {
  const docs = pdn?.documents || {}
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Checkbox
        checked={acknowledged}
        onChange={onAcknowledged}
        label={
          <span>
            Я ознакомлен с{' '}
            <DocPhrase doc={docs.policy}>Политикой обработки персональных данных</DocPhrase> и{' '}
            <DocPhrase doc={docs.regulation}>Положением в области обработки персональных данных</DocPhrase>{' '}
            {companyMention(pdn, '')}.
          </span>
        }
      />
      <Checkbox
        checked={agreed}
        onChange={onAgreed}
        label={
          <span>
            Выражаю своё{' '}
            <DocPhrase doc={docs.consent}>Согласие на обработку персональных данных</DocPhrase>{' '}
            {companyMention(pdn, 'для')}.
          </span>
        }
      />
    </div>
  )
}

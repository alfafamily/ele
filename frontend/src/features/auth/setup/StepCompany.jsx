import { useState } from 'react'
import { Button, Input } from '../../../shared/ui'

export function StepCompany({ value, onNext, onBack }) {
  const [name, setName] = useState(value.name)
  const [inn, setInn] = useState(value.inn)
  const [kpp, setKpp] = useState(value.kpp)

  const submit = (e) => {
    e.preventDefault()
    onNext({ name, inn, kpp })
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <div className="ele-wizard-step__title">Данные компании</div>
        <div className="ele-wizard-step__subtitle">Базовые реквизиты — их можно изменить позже в Настройках.</div>
      </div>
      <Input label="Название компании" required value={name} onChange={(e) => setName(e.target.value)} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Input label="ИНН" value={inn} onChange={(e) => setInn(e.target.value)} />
        <Input label="КПП" value={kpp} onChange={(e) => setKpp(e.target.value)} />
      </div>
      <div className="ele-wizard-actions">
        <Button type="button" variant="secondary" onClick={onBack}>
          Назад
        </Button>
        <Button type="submit">Продолжить</Button>
      </div>
    </form>
  )
}

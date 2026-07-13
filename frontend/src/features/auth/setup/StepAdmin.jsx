import { useState } from 'react'
import { Banner, Button, Input } from '../../../shared/ui'

export function StepAdmin({ value, onNext }) {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState(value.email)
  const [password, setPassword] = useState(value.password)
  const [passwordRepeat, setPasswordRepeat] = useState(value.password_repeat)
  const [error, setError] = useState(null)

  const submit = (e) => {
    e.preventDefault()
    if (password !== passwordRepeat) {
      setError('Пароли не совпадают.')
      return
    }
    setError(null)
    onNext({ email, password, password_repeat: passwordRepeat })
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <div className="ele-wizard-step__title">Учётная запись администратора</div>
        <div className="ele-wizard-step__subtitle">Первый пользователь системы с полными правами.</div>
      </div>
      {error ? <Banner variant="error">{error}</Banner> : null}
      <Input label="ФИО" value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" />
      <Input label="Email" type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Input label="Пароль" required showToggle autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <Input
          label="Повторите пароль"
          required
          showToggle
          autoComplete="new-password"
          value={passwordRepeat}
          onChange={(e) => setPasswordRepeat(e.target.value)}
        />
      </div>
      <div className="ele-wizard-actions ele-wizard-actions--end">
        <Button type="submit">Продолжить</Button>
      </div>
    </form>
  )
}

import { useState } from 'react'
import { useAuth } from '../../../app/AuthContext.jsx'
import { StepAdmin } from './StepAdmin.jsx'
import { StepCompany } from './StepCompany.jsx'
import { StepIndicator } from './StepIndicator.jsx'
import { StepIntegrations } from './StepIntegrations.jsx'
import './setup.css'

const EMPTY_ADMIN = { last_name: '', first_name: '', email: '', password: '', password_repeat: '' }
const EMPTY_COMPANY = { name: '', inn: '' }

// Setup Wizard (уточнено v1.3) — первичное создание Администратора
// и Компании при первом заходе в браузере, если ни CLI/.env, ни мастер ранее
// администратора не создали (BootstrapView.setup_required).
export function SetupWizardPage() {
  const { completeSetup } = useAuth()
  const [step, setStep] = useState(1)
  const [admin, setAdmin] = useState(EMPTY_ADMIN)
  const [company, setCompany] = useState(EMPTY_COMPANY)

  return (
    <div className="ele-wizard-shell">
      <div className="ele-wizard-card">
        <div className="ele-wizard-card__logo">
          <img src="/brand/ele-full.svg" alt="ELE" />
        </div>
        <StepIndicator current={step} />

        {step === 1 ? (
          <StepAdmin
            value={admin}
            onNext={(data) => {
              setAdmin(data)
              setStep(2)
            }}
          />
        ) : step === 2 ? (
          <StepCompany
            value={company}
            onBack={() => setStep(1)}
            onNext={(data) => {
              setCompany(data)
              setStep(3)
            }}
          />
        ) : (
          <StepIntegrations admin={admin} company={company} onBack={() => setStep(2)} onDone={completeSetup} />
        )}
      </div>
    </div>
  )
}

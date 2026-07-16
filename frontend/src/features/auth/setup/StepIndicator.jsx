import { Icon } from '../../../shared/ui'

const STEPS = [
  { n: 1, label: 'Администратор' },
  { n: 2, label: 'Компания' },
  { n: 3, label: 'Проверка' },
]

export function StepIndicator({ current }) {
  return (
    <div className="ele-wizard-steps">
      {STEPS.map((step, i) => (
        <div key={step.n} style={{ display: 'contents' }}>
          <div className="ele-wizard-step">
            <div
              className={
                'ele-wizard-step__circle' +
                (step.n < current ? ' ele-wizard-step__circle--done' : step.n === current ? ' ele-wizard-step__circle--active' : '')
              }
            >
              {step.n < current ? <Icon name="check" size={15} strokeWidth={3} style={{ color: '#fff' }} /> : step.n}
            </div>
            <span className={'ele-wizard-step__label' + (step.n === current ? ' ele-wizard-step__label--active' : '')}>
              {step.label}
            </span>
          </div>
          {i < STEPS.length - 1 ? (
            <div className={'ele-wizard-step__connector' + (step.n < current ? ' ele-wizard-step__connector--done' : '')} />
          ) : null}
        </div>
      ))}
    </div>
  )
}

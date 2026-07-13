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
              {step.n < current ? (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12l5 5L20 6" />
                </svg>
              ) : (
                step.n
              )}
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

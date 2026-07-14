import './StatusPill.css'

// Статус-пилюли списков: «Закреплено»/«Свободное»,
// «Установлена»/«Свободная», «Списано»/«Утилизирована» (архивный вариант),
// бейдж роли «Администратор» и т.п. — variant задаёт цветовую пару из токенов.
export function StatusPill({ variant = 'archived', children }) {
  return <span className={`ele-pill ele-pill--${variant}`}>{children}</span>
}

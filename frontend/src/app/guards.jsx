import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './AuthContext.jsx'

// Guard'ы читают состояние, уже загруженное BootstrapGate (см. App.jsx) —
// решают, какой экран первый: Setup Wizard, логин или приложение.

export function RequireSetupPending({ children }) {
  const { bootstrap } = useAuth()
  if (!bootstrap.setup_required) return <Navigate to="/login" replace />
  return children
}

export function RequireGuest({ children }) {
  const { bootstrap, user } = useAuth()
  if (bootstrap.setup_required) return <Navigate to="/setup" replace />
  if (user) return <Navigate to="/" replace />
  return children
}

export function RequireAuth({ children }) {
  const { bootstrap, user } = useAuth()
  const location = useLocation()
  if (bootstrap.setup_required) return <Navigate to="/setup" replace />
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />
  return children
}

// Раздел «Настройки» — только Администратор; используется внутри
// RequireAuth, поэтому user здесь уже гарантированно есть.
export function RequireAdmin({ children }) {
  const { user } = useAuth()
  if (user.role !== 'admin') return <Navigate to="/" replace />
  return children
}

// Лицензии/Сотрудники/Типы — Admin/Accountant. Сотрудник (в т.ч.
// Наблюдатель) видит из бизнес-разделов только Оборудование — без этого
// гейта прямой переход по URL показал бы сломанный экран вместо редиректа
// (бэкенд и так отклонит запросы, это гейт только для UX).
export function RequireStaff({ children }) {
  const { user } = useAuth()
  if (user.role !== 'admin' && user.role !== 'accountant') return <Navigate to="/" replace />
  return children
}

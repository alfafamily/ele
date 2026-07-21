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

// Управление объектами и редактор Типов — только Admin/Accountant. Наблюдатель
// и обычный «Сотрудник» сюда не попадают: их отправляем на «/» (там сработает
// RequireViewer и уведёт обычного сотрудника в Профиль). Бэкенд и так отклонит
// запросы — гейт нужен только ради UX (не показывать сломанный экран).
export function RequireStaff({ children }) {
  const { user } = useAuth()
  if (user.role !== 'admin' && user.role !== 'accountant') return <Navigate to="/" replace />
  return children
}

// Просмотр бизнес-разделов (Оборудование/Лицензии/Сотрудники/Связь/Средства
// доступа/Помещения) — Admin/Accountant или Наблюдатель. Обычному «Сотруднику»
// (без признака) бизнес-разделы недоступны — его посадочная страница Профиль.
// Роль «Ответственный за ТО» ограничена разделом Оборудование — прочие разделы
// уводят её на список Оборудования.
export function RequireViewer({ children }) {
  const { user } = useAuth()
  const canView = user.role === 'admin' || user.role === 'accountant' || (user.role === 'employee' && user.is_observer)
  if (!canView) return <Navigate to={user.role === 'maintenance' ? '/' : '/profile'} replace />
  return children
}

// B13+. Раздел Оборудование (список/карточка) — как RequireViewer, но
// дополнительно пускает роль «Ответственный за ТО».
export function RequireEquipmentViewer({ children }) {
  const { user } = useAuth()
  const canView =
    user.role === 'admin' ||
    user.role === 'accountant' ||
    user.role === 'maintenance' ||
    (user.role === 'employee' && user.is_observer)
  if (!canView) return <Navigate to="/profile" replace />
  return children
}

// B13+. Проведение ТО — Admin / роль «Ответственный за ТО» / «Ответственный за
// учёт» с флагом can_maintain.
export function RequireMaintainer({ children }) {
  const { user } = useAuth()
  const canPerform =
    user.role === 'admin' ||
    user.role === 'maintenance' ||
    (user.role === 'accountant' && user.can_maintain)
  if (!canPerform) return <Navigate to="/" replace />
  return children
}

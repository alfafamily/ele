import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

// B54 (a11y): осмысленный <title> вкладки по разделу. Названия берём 1:1 из
// уже существующих подписей навигации/экранов — новую копию не вводим. Формат
// «Раздел · ELE»; на неизвестном пути — просто «ELE». Порядок правил важен:
// более специфичные префиксы идут раньше общих (…-types и /reports/ раньше
// корневого раздела), первое совпадение выигрывает.
const RULES = [
  ['/login', 'Вход'],
  ['/register', 'Регистрация'],
  ['/reset-password', 'Восстановление пароля'],
  ['/accept-invite', 'Приглашение'],
  ['/confirm-email', 'Подтверждение email'],
  ['/change-email', 'Смена email'],
  ['/setup', 'Мастер настройки'],
  ['/equipment-types', 'Виды оборудования'],
  ['/equipment', 'Оборудование'],
  ['/transport-types', 'Виды транспорта'],
  ['/transport', 'Транспорт'],
  ['/tools', 'Инструменты'],
  ['/license-types', 'Виды лицензий'],
  ['/licenses', 'Лицензии'],
  ['/employees/assignments', 'Операции закрепления'],
  ['/employees/reports', 'Отчёты'],
  ['/employees', 'Сотрудники'],
  ['/sim-cards', 'Корпоративная связь'],
  ['/passes', 'Средства доступа'],
  ['/premises/reports', 'Отчёты'],
  ['/premises', 'Помещения'],
  ['/settings', 'Настройки'],
  ['/notifications', 'Уведомления'],
  ['/profile', 'Профиль'],
  ['/guide', 'Руководство'],
  ['/styleguide', 'Styleguide'],
]

function titleFor(pathname) {
  const hit = RULES.find(([prefix]) => pathname === prefix || pathname.startsWith(prefix + '/'))
  return hit ? `${hit[1]} · ELE` : 'ELE'
}

// Ставит document.title по текущему маршруту. Рендерится один раз внутри
// роутера (ничего не отрисовывает).
export function RouteTitle() {
  const { pathname } = useLocation()
  useEffect(() => {
    document.title = titleFor(pathname)
  }, [pathname])
  return null
}

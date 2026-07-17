// Клиентское зеркало матрицы доступа — только для скрытия элементов
// интерфейса (кнопки создания/редактирования и т.п.); реальное принуждение
// прав всегда на бэкенде (core/permissions.py), это не место истины.
export function computePermissions(user) {
  const role = user?.role
  const isAdmin = role === 'admin'
  const isAccountant = role === 'accountant'
  const isStaff = isAdmin || isAccountant
  // Наблюдатель — «Сотрудник» с признаком is_observer: сквозной просмотр всех
  // бизнес-разделов (кроме «Настроек» и редактора Типов), строго read-only.
  const isObserver = role === 'employee' && !!user?.is_observer
  // Право открыть бизнес-раздел (Оборудование/Лицензии/Сотрудники/Связь/
  // Средства доступа/Помещения) — staff или Наблюдатель.
  const canViewBusiness = isStaff || isObserver

  return {
    isAdmin,
    isAccountant,
    isStaff,
    isObserver,
    canViewBusiness,
    // Управление объектами (создание/редактирование/действия) — только staff.
    canManageEquipment: isStaff,
    canManageLicenses: isStaff,
    canManageEmployees: isStaff,
    canManagePremises: isStaff,
    canManageTypes: isStaff,
    // Просмотр раздела — staff или Наблюдатель.
    canViewLicensesSection: canViewBusiness,
    canViewEmployeesSection: canViewBusiness,
    canViewPremises: canViewBusiness,
    // «Номер/ключ» лицензии и прочие скрытые по умолчанию секреты — только staff
    // (Наблюдателю бэкенд их не отдаёт, здесь скрываем «глазик»).
    canRevealSecrets: isStaff,
    canViewSettings: isAdmin,
  }
}

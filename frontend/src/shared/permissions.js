// Клиентское зеркало матрицы доступа §2.3 — только для скрытия элементов
// интерфейса (кнопки создания/редактирования и т.п.); реальное принуждение
// прав всегда на бэкенде (core/permissions.py), это не место истины.
export function computePermissions(user) {
  const role = user?.role
  const isAdmin = role === 'admin'
  const isAccountant = role === 'accountant'
  const isStaff = isAdmin || isAccountant

  return {
    isAdmin,
    isAccountant,
    isStaff,
    // Оборудование — единственный раздел, доступный Сотруднику (только просмотр,
    // своё или всё при is_observer — фильтрация уже на бэкенде в get_queryset()).
    canManageEquipment: isStaff,
    canViewLicensesSection: isStaff,
    canManageLicenses: isStaff,
    canViewEmployeesSection: isStaff,
    canManageEmployees: isStaff,
    canManageTypes: isStaff,
    canViewSettings: isAdmin,
  }
}

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
  // B13+: роль «Ответственный за ТО» — ограничена разделом Оборудование,
  // только чтение объектов + проведение ТО (регламенты не настраивает).
  const isMaintenance = role === 'maintenance'
  // B13+: «Ответственный за учёт» с флагом can_maintain.
  const canMaintainFlag = isAccountant && !!user?.can_maintain
  // Право открыть бизнес-раздел (Оборудование/Лицензии/Сотрудники/Связь/
  // Средства доступа/Помещения) — staff или Наблюдатель.
  const canViewBusiness = isStaff || isObserver
  // Раздел Оборудование дополнительно видит роль «Ответственный за ТО».
  const canViewEquipment = canViewBusiness || isMaintenance
  // B13+: проведение ТО — admin / роль ТО / учётчик с флагом.
  const canPerformMaintenance = isAdmin || isMaintenance || canMaintainFlag
  // B13+: управление регламентами/планами/датой первого ТО — admin / учётчик с флагом.
  const canManageMaintenance = isAdmin || canMaintainFlag
  // B13+: видимость ТО-блоков (правый «Обслуживание», раздел «Регламенты» на
  // карточке, статусы/фильтры ТО в списке оборудования) — все, кто причастен к
  // ТО (admin / роль ТО / учётчик с флагом) плюс Наблюдатель (сквозной read-only).
  // Учётчик БЕЗ флага ТО эти блоки не видит — делать с ними он ничего не может.
  const canSeeMaintenance = canViewEquipment && !(isAccountant && !canMaintainFlag)

  return {
    isAdmin,
    isAccountant,
    isStaff,
    isObserver,
    isMaintenance,
    canViewBusiness,
    canViewEquipment,
    canPerformMaintenance,
    canManageMaintenance,
    canSeeMaintenance,
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

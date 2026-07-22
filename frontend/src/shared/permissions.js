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
  // B13+/B23: «Ответственный за учёт» с флагом «Ответственный за ТО» (проведение).
  const canMaintainFlag = isAccountant && !!user?.can_maintain
  // B23: «Ответственный за учёт» с флагом «Может управлять регламентами ТО».
  const canManageRegulationsFlag = isAccountant && !!user?.can_manage_regulations
  // Право открыть бизнес-раздел (Оборудование/Лицензии/Сотрудники/Связь/
  // Средства доступа/Помещения) — staff или Наблюдатель.
  const canViewBusiness = isStaff || isObserver
  // Раздел Оборудование дополнительно видит роль «Ответственный за ТО».
  const canViewEquipment = canViewBusiness || isMaintenance
  // B13+: проведение ТО — admin / роль ТО / учётчик с флагом «Ответственный за ТО».
  const canPerformMaintenance = isAdmin || isMaintenance || canMaintainFlag
  // B13+/B23: управление регламентами/планами/датой первого ТО — admin / учётчик
  // с флагом «Может управлять регламентами ТО» (отвязано от проведения ТО).
  const canManageMaintenance = isAdmin || canManageRegulationsFlag
  // B13+/B23: видимость ТО-блоков (правый «Обслуживание», статусы/фильтры ТО в
  // списке оборудования) — все, кто причастен к ТО (admin / роль ТО / учётчик с
  // любым из флагов ТО) плюс Наблюдатель (сквозной read-only). Учётчик без обоих
  // флагов ТО эти блоки не видит — делать с ними он ничего не может.
  const canSeeMaintenance = canViewEquipment && !(isAccountant && !canMaintainFlag && !canManageRegulationsFlag)
  // B23: область типов для проведения ТО. maintenance_all_types !== false → все.
  const maintenanceAllTypes = isAdmin || user?.maintenance_all_types !== false
  const maintenanceTypeIds = (user?.maintenance_types || []).map(Number)

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
    maintenanceAllTypes,
    maintenanceTypeIds,
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

// B23. Может ли пользователь проводить ТО оборудования данного типа — с учётом
// права проведения ТО и области выбранных типов (все / некоторые). typeId — id
// типа оборудования (equipment.equipment_type).
export function canMaintainType(perms, typeId) {
  if (!perms.canPerformMaintenance) return false
  if (perms.maintenanceAllTypes) return true
  return perms.maintenanceTypeIds.includes(Number(typeId))
}

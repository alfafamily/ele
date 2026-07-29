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
  // B22: роль «Автомеханик» — раздел Транспорт (read-only объекты) + проведение ТО.
  const isAutomechanic = role === 'automechanic'
  // B22: «Ответственный за учёт» с флагами ТО транспорта.
  const canMaintainTransportFlag = isAccountant && !!user?.can_maintain_transport
  const canManageTransportRegulationsFlag = isAccountant && !!user?.can_manage_transport_regulations
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

  // B22: раздел Транспорт — staff / Наблюдатель / Автомеханик.
  const canViewTransport = canViewBusiness || isAutomechanic
  // Управление объектами транспорта (создание/редактирование/действия) — только staff.
  const canManageTransport = isStaff
  // Проведение ТО транспорта — admin / Автомеханик / учётчик с флагом.
  const canPerformTransportMaintenance = isAdmin || isAutomechanic || canMaintainTransportFlag
  // Управление регламентами ТО транспорта — admin / учётчик с флагом.
  const canManageTransportMaintenance = isAdmin || canManageTransportRegulationsFlag
  // Видимость ТО-блоков транспорта: все причастные к ТО транспорта + Наблюдатель.
  // Учётчик без обоих флагов ТО транспорта эти блоки не видит.
  const canSeeTransportMaintenance =
    canViewTransport && !(isAccountant && !canMaintainTransportFlag && !canManageTransportRegulationsFlag)
  // B22: область типов транспорта для проведения ТО.
  const maintenanceAllTransportTypes = isAdmin || user?.maintenance_all_transport_types !== false
  const maintenanceTransportTypeIds = (user?.maintenance_transport_types || []).map(Number)

  return {
    isAdmin,
    isAccountant,
    isStaff,
    isObserver,
    isMaintenance,
    isAutomechanic,
    canViewBusiness,
    canViewEquipment,
    canPerformMaintenance,
    canManageMaintenance,
    canSeeMaintenance,
    maintenanceAllTypes,
    maintenanceTypeIds,
    canViewTransport,
    canManageTransport,
    canPerformTransportMaintenance,
    canManageTransportMaintenance,
    canSeeTransportMaintenance,
    maintenanceAllTransportTypes,
    maintenanceTransportTypeIds,
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
    // B45: отчёты по местам/сотрудникам — Администратор / Ответственный за учёт.
    canViewReports: isStaff,
  }
}

// B32. Доступ к «Истории изменений» на карточке объекта:
//  'full' — Администратор / Ответственный за учёт (вся история);
//  'maintenance' — только выполненные ТО (Механик по оборудованию на
//  Оборудовании, Автомеханик на Транспорте);
//  'none' — остальным (Наблюдатель / Сотрудник) историю не показываем.
// section: 'equipment' | 'transport' | 'other'.
export function historyMode(perms, section) {
  if (perms.isStaff) return 'full'
  if (section === 'equipment' && perms.isMaintenance) return 'maintenance'
  if (section === 'transport' && perms.isAutomechanic) return 'maintenance'
  return 'none'
}

// B23. Может ли пользователь проводить ТО оборудования данного типа — с учётом
// права проведения ТО и области выбранных типов (все / некоторые). typeId — id
// типа оборудования (equipment.equipment_type).
export function canMaintainType(perms, typeId) {
  if (!perms.canPerformMaintenance) return false
  if (perms.maintenanceAllTypes) return true
  return perms.maintenanceTypeIds.includes(Number(typeId))
}

// B22. Может ли пользователь проводить ТО транспорта данного типа — с учётом
// права проведения ТО транспорта и области выбранных типов.
export function canMaintainTransportType(perms, typeId) {
  if (!perms.canPerformTransportMaintenance) return false
  if (perms.maintenanceAllTransportTypes) return true
  return perms.maintenanceTransportTypeIds.includes(Number(typeId))
}

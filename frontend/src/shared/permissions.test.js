import { describe, it, expect } from 'vitest'
import { computePermissions, historyMode, canMaintainType, canMaintainTransportType } from './permissions.js'

describe('computePermissions — роли', () => {
  it('администратор: полный доступ', () => {
    const p = computePermissions({ role: 'admin' })
    expect(p.isAdmin).toBe(true)
    expect(p.isStaff).toBe(true)
    expect(p.canViewSettings).toBe(true)
    expect(p.canManageEquipment).toBe(true)
    expect(p.canManageTransport).toBe(true)
    expect(p.canPerformMaintenance).toBe(true)
    expect(p.canManageMaintenance).toBe(true)
    expect(p.maintenanceAllTypes).toBe(true)
    expect(p.canRevealSecrets).toBe(true)
  })

  it('учётчик без флагов ТО: staff, но ТО-блоки скрыты', () => {
    const p = computePermissions({ role: 'accountant' })
    expect(p.isStaff).toBe(true)
    expect(p.canViewSettings).toBe(false)
    expect(p.canPerformMaintenance).toBe(false)
    expect(p.canManageMaintenance).toBe(false)
    expect(p.canSeeMaintenance).toBe(false)
    expect(p.canSeeTransportMaintenance).toBe(false)
    expect(p.canViewReports).toBe(true)
  })

  it('учётчик с can_maintain: проводит ТО и видит блоки', () => {
    const p = computePermissions({ role: 'accountant', can_maintain: true })
    expect(p.canPerformMaintenance).toBe(true)
    expect(p.canSeeMaintenance).toBe(true)
    expect(p.canManageMaintenance).toBe(false)
  })

  it('учётчик с can_manage_regulations: управляет регламентами', () => {
    const p = computePermissions({ role: 'accountant', can_manage_regulations: true })
    expect(p.canManageMaintenance).toBe(true)
    expect(p.canSeeMaintenance).toBe(true)
    expect(p.canPerformMaintenance).toBe(false)
  })

  it('наблюдатель (employee + is_observer): сквозной read-only', () => {
    const p = computePermissions({ role: 'employee', is_observer: true })
    expect(p.isObserver).toBe(true)
    expect(p.canViewBusiness).toBe(true)
    expect(p.canManageEquipment).toBe(false)
    expect(p.canRevealSecrets).toBe(false)
    expect(p.canViewSettings).toBe(false)
    expect(p.canSeeMaintenance).toBe(true)
  })

  it('ответственный за ТО (maintenance): только Оборудование', () => {
    const p = computePermissions({ role: 'maintenance' })
    expect(p.isMaintenance).toBe(true)
    expect(p.canViewEquipment).toBe(true)
    expect(p.canViewBusiness).toBe(false)
    expect(p.canPerformMaintenance).toBe(true)
    expect(p.canViewTransport).toBe(false)
  })

  it('автомеханик: только Транспорт + проведение ТО', () => {
    const p = computePermissions({ role: 'automechanic' })
    expect(p.isAutomechanic).toBe(true)
    expect(p.canViewTransport).toBe(true)
    expect(p.canPerformTransportMaintenance).toBe(true)
    expect(p.canViewEquipment).toBe(false)
  })

  it('обычный сотрудник: бизнес-разделы недоступны', () => {
    const p = computePermissions({ role: 'employee' })
    expect(p.canViewBusiness).toBe(false)
    expect(p.canViewEquipment).toBe(false)
    expect(p.canViewTransport).toBe(false)
    expect(p.canViewReports).toBe(false)
  })

  it('без пользователя (null): всё выключено, без исключений', () => {
    const p = computePermissions(null)
    expect(p.isAdmin).toBe(false)
    expect(p.canViewBusiness).toBe(false)
    expect(p.maintenanceTypeIds).toEqual([])
  })

  it('maintenance_all_types=false → область ограничена списком типов', () => {
    const p = computePermissions({ role: 'accountant', can_maintain: true, maintenance_all_types: false, maintenance_types: [1, '2'] })
    expect(p.maintenanceAllTypes).toBe(false)
    expect(p.maintenanceTypeIds).toEqual([1, 2])
  })
})

describe('historyMode', () => {
  it('staff → полная история', () => {
    expect(historyMode({ isStaff: true }, 'equipment')).toBe('full')
  })
  it('механик на Оборудовании → только ТО', () => {
    expect(historyMode({ isStaff: false, isMaintenance: true }, 'equipment')).toBe('maintenance')
  })
  it('автомеханик на Транспорте → только ТО', () => {
    expect(historyMode({ isStaff: false, isAutomechanic: true }, 'transport')).toBe('maintenance')
  })
  it('механик на чужом разделе (Транспорт) → none', () => {
    expect(historyMode({ isStaff: false, isMaintenance: true }, 'transport')).toBe('none')
  })
  it('сотрудник → none', () => {
    expect(historyMode({ isStaff: false }, 'other')).toBe('none')
  })
})

describe('canMaintainType / canMaintainTransportType', () => {
  it('нет права проведения → false', () => {
    expect(canMaintainType({ canPerformMaintenance: false }, 5)).toBe(false)
  })
  it('область «все типы» → true для любого', () => {
    expect(canMaintainType({ canPerformMaintenance: true, maintenanceAllTypes: true }, 5)).toBe(true)
  })
  it('ограниченная область: тип в списке → true, вне → false', () => {
    const perms = { canPerformMaintenance: true, maintenanceAllTypes: false, maintenanceTypeIds: [1, 2] }
    expect(canMaintainType(perms, 2)).toBe(true)
    expect(canMaintainType(perms, 9)).toBe(false)
  })
  it('транспорт: та же логика по своим полям', () => {
    const perms = { canPerformTransportMaintenance: true, maintenanceAllTransportTypes: false, maintenanceTransportTypeIds: [7] }
    expect(canMaintainTransportType(perms, 7)).toBe(true)
    expect(canMaintainTransportType(perms, 8)).toBe(false)
    expect(canMaintainTransportType({ canPerformTransportMaintenance: false }, 7)).toBe(false)
  })
})

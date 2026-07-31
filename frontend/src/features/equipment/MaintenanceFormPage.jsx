import { MaintenanceFormPage as SharedMaintenanceFormPage } from '../../shared/maintenance/MaintenanceFormPage.jsx'
import { getEquipment, getEquipmentRegulations, performMaintenance } from './equipmentApi.js'
import { planStatusIcon } from './statusLabels.js'

// B13+. Проведение ТО оборудования — общий экран ТО без доп. полей.
export function MaintenanceFormPage() {
  return (
    <SharedMaintenanceFormPage
      getEntity={getEquipment}
      getRegulations={getEquipmentRegulations}
      performMaintenance={performMaintenance}
      planStatusIcon={planStatusIcon}
      notFoundTitle="Не удалось открыть оборудование"
      backLabel="К списку оборудования"
      backRoute="/"
    />
  )
}

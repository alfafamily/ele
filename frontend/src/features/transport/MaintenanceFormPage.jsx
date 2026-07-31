import { MaintenanceFormPage as SharedMaintenanceFormPage } from '../../shared/maintenance/MaintenanceFormPage.jsx'
import { getTransport, getTransportRegulations, performMaintenance } from './transportApi.js'
import { planStatusIcon } from './statusLabels.js'
import { MileageField } from './MileageField.jsx'

// B22. Проведение ТО транспорта — общий экран ТО + доп. поле «Текущий пробег».
export function MaintenanceFormPage() {
  return (
    <SharedMaintenanceFormPage
      getEntity={getTransport}
      getRegulations={getTransportRegulations}
      performMaintenance={performMaintenance}
      planStatusIcon={planStatusIcon}
      notFoundTitle="Не удалось открыть транспорт"
      backLabel="К списку транспорта"
      backRoute="/transport"
      ExtraFields={MileageField}
    />
  )
}

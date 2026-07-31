import { RegulationsSection } from '../../shared/maintenance/RegulationsSection.jsx'
import {
  archiveEquipmentRegulation,
  createEquipmentRegulation,
  restoreEquipmentRegulation,
  setRegulationCancelled,
  setRegulationDate,
  updateEquipmentRegulation,
} from './equipmentApi.js'
import { planStatusIcon } from './statusLabels.js'

// B13+. Раздел «Регламенты ТО» на карточке оборудования — общий блок ТО.
export function EquipmentRegulationsSection({ equipment, regulations, canManage, onChanged }) {
  return (
    <RegulationsSection
      entity={equipment}
      regulations={regulations}
      canManage={canManage}
      onChanged={onChanged}
      entityGenitive="оборудования"
      planStatusIcon={planStatusIcon}
      api={{
        archive: archiveEquipmentRegulation,
        create: createEquipmentRegulation,
        restore: restoreEquipmentRegulation,
        update: updateEquipmentRegulation,
        setCancelled: setRegulationCancelled,
        setDate: setRegulationDate,
      }}
    />
  )
}

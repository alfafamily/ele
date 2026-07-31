import { RegulationsSection } from '../../shared/maintenance/RegulationsSection.jsx'
import {
  archiveTransportRegulation,
  createTransportRegulation,
  restoreTransportRegulation,
  setRegulationCancelled,
  setRegulationDate,
  updateTransportRegulation,
} from './transportApi.js'
import { planStatusIcon } from './statusLabels.js'

// B22. Раздел «Регламенты ТО» на карточке транспорта — общий блок ТО (зеркало
// одноимённого блока Оборудования).
export function TransportRegulationsSection({ transport, regulations, canManage, onChanged }) {
  return (
    <RegulationsSection
      entity={transport}
      regulations={regulations}
      canManage={canManage}
      onChanged={onChanged}
      entityGenitive="транспорта"
      planStatusIcon={planStatusIcon}
      api={{
        archive: archiveTransportRegulation,
        create: createTransportRegulation,
        restore: restoreTransportRegulation,
        update: updateTransportRegulation,
        setCancelled: setRegulationCancelled,
        setDate: setRegulationDate,
      }}
    />
  )
}

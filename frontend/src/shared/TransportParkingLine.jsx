import { PlanLink } from './PlanLink.jsx'

// Строка состояния парковки транспорта — под карточкой транспорта в блоках
// сотрудника/профиля. Три состояния: закреплён за местом (+ план), «на адресе
// сотрудника», либо место не закреплено.
export function TransportParkingLine({ parking }) {
  const strong = { color: 'var(--color-text-secondary)', fontWeight: 600 }
  return (
    <div
      style={{
        marginTop: 8, paddingLeft: 28, fontSize: 12, color: 'var(--color-text-placeholder)',
        display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
      }}
    >
      {parking?.kind === 'spot' ? (
        <>
          <span>Парковочное место: <span style={strong}>{parking.place_name}</span></span>
          {parking.plan_file?.url ? <PlanLink file={parking.plan_file} /> : null}
        </>
      ) : parking?.kind === 'driver_address' ? (
        <span>Парковочное место: <span style={strong}>На адресе сотрудника</span></span>
      ) : (
        <span>Парковочное место: не закреплено за транспортом</span>
      )}
    </div>
  )
}

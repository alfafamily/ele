import { Spinner } from '../shared/ui/index.js'

// B38: заглушка Suspense при ленивой подгрузке чанка раздела (React.lazy в
// AppRoutes). Центрированный штатный Spinner — тот же индикатор, что и для
// прочих загрузочных состояний, чтобы переход между разделами выглядел единообразно.
export function RouteFallback() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '60vh',
        width: '100%',
      }}
    >
      <Spinner />
    </div>
  )
}

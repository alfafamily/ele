import './Skeleton.css'

// Перенесено 1:1 из design/ELE_design_dc.html (.skel) — плейсхолдер строки
// списка/поля на время загрузки (B1 hint-placeholder-count и т.п.).
export function Skeleton({ width = '100%', height = 16, className = '', style }) {
  return <div className={['ele-skel', className].filter(Boolean).join(' ')} style={{ width, height, ...style }} />
}

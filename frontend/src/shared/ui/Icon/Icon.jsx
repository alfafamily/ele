import { icons } from './icons.js'

// Единая иконка продукта. Рисует SVG 24×24 из реестра icons.js обводкой в
// currentColor — цвет и активное состояние задаются через CSS (color/className),
// как раньше в navIcons. Размер и толщину линии можно переопределить пропсами.
//
//   <Icon name="search" />
//   <Icon name="chevron-right" size={16} strokeWidth={2} style={{ color: '#757784' }} />
//
// aria-hidden по умолчанию: иконки живут внутри кнопок/ссылок с aria-label или
// текстом. Если иконка несёт самостоятельный смысл — передайте aria-label и role.
export function Icon({ name, size = 22, strokeWidth = 1.8, className, style, title, ...rest }) {
  const path = icons[name]
  if (!path) {
    if (import.meta.env.DEV) console.warn(`[Icon] неизвестное имя: "${name}"`)
    return null
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      aria-label={title}
      {...rest}
      dangerouslySetInnerHTML={{ __html: title ? `<title>${title}</title>${path}` : path }}
    />
  )
}

export default Icon

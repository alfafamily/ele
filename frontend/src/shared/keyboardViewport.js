// Кросс-платформенная поддержка экранной клавиатуры.
//
// Android Chrome решает `interactive-widget=resizes-content` в viewport-мете
// (клавиатура ужимает лейаут-вьюпорт). iOS Safari этот тег игнорирует и вместо
// этого ужимает ТОЛЬКО visual viewport, оставляя лейаут прежним — из-за чего
// нижние кнопки форм/модалок уезжают под клавиатуру, а прокрутка «перелетает»
// за них к фоновой подложке.
//
// Здесь синхронизируем `window.visualViewport` с CSS-переменными на :root:
//   --vvh      — высота видимой части вьюпорта (над клавиатурой);
//   --vv-top   — смещение видимой части сверху (iOS сдвигает вьюпорт);
//   --kb-height— высота клавиатуры (0, если закрыта).
// Плюс класс `kb-open` на <html>, когда клавиатура открыта. CSS модалок/страниц
// опирается на эти переменные (с фолбэком на 100dvh, если API недоступен —
// desktop/старые браузеры: тогда всё работает как раньше).
export function initKeyboardViewport() {
  const vv = window.visualViewport
  if (!vv) return
  const root = document.documentElement

  const update = () => {
    const height = Math.round(vv.height)
    const top = Math.round(vv.offsetTop)
    // Высота клавиатуры = лейаут-вьюпорт минус видимая часть. ВАЖНО: без
    // vv.offsetTop — он на iOS меняется при прокрутке тела страницы, и если его
    // вычитать, оценка «плавает», класс kb-open мигает, а завязанный на него
    // min-height страницы прыгает (пустая область + откат скролла к инпуту).
    const keyboard = Math.max(0, Math.round(window.innerHeight - height))
    root.style.setProperty('--vvh', `${height}px`)
    root.style.setProperty('--vv-top', `${top}px`)
    root.style.setProperty('--kb-height', `${keyboard}px`)
    // Порог, чтобы не реагировать на мелкие панели браузера.
    root.classList.toggle('kb-open', keyboard > 80)
  }

  update()
  vv.addEventListener('resize', update)
  vv.addEventListener('scroll', update)
}

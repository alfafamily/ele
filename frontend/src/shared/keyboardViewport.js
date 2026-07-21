// Кросс-платформенная поддержка экранной клавиатуры.
//
// Android Chrome решает `interactive-widget=resizes-content` в viewport-мете
// (клавиатура ужимает лейаут-вьюпорт). iOS Safari этот тег игнорирует и вместо
// этого ужимает ТОЛЬКО visual viewport, оставляя лейаут прежним — из-за чего
// нижние кнопки форм/модалок уезжают под клавиатуру, а прокрутка «перелетает»
// за них к фоновой подложке.
//
// Здесь синхронизируем `window.visualViewport` с CSS-переменными на :root:
//   --vvh    — высота видимой части вьюпорта (над клавиатурой);
//   --vv-top — смещение видимой части сверху (iOS сдвигает вьюпорт).
// Их использует ТОЛЬКО bottom-sheet модалки (Modal.css), чтобы вставать над
// клавиатурой (фолбэк 100dvh — desktop/без API). Страницы намеренно НЕ
// завязаны на эти переменные: попытка управлять их высотой/скроллом под iOS
// ломала прокрутку (браузер возвращал к активному инпуту), поэтому там
// оставлено штатное поведение с косметическим зазором под клавиатурой.
export function initKeyboardViewport() {
  const vv = window.visualViewport
  if (!vv) return
  const root = document.documentElement

  const update = () => {
    root.style.setProperty('--vvh', `${Math.round(vv.height)}px`)
    root.style.setProperty('--vv-top', `${Math.round(vv.offsetTop)}px`)
  }

  update()
  vv.addEventListener('resize', update)
  vv.addEventListener('scroll', update)
}

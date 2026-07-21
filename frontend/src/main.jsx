import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './shared/theme/index.css'
import App from './App.jsx'
import { initKeyboardViewport } from './shared/keyboardViewport.js'

// Ручное управление прокруткой при навигации (см. ScrollManager /
// useScrollRestoration): браузерное авто-восстановление для SPA срабатывает до
// отрисовки контента и сбрасывает восстановленный список в начало.
if ('scrollRestoration' in history) history.scrollRestoration = 'manual'

// Синхронизация visual viewport с CSS-переменными (клавиатура на iOS Safari).
initKeyboardViewport()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// PWA-устанавливаемость — offline не требуется, sw.js только
// проксирует сеть без кеширования.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
  })
}

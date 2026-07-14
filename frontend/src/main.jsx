import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './shared/theme/index.css'
import App from './App.jsx'

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

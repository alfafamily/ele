import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    // Разрешённые Host для dev-сервера. По умолчанию поведение Vite не меняется;
    // при работе за доменом (HTTPS-стенд) домен задаётся через VITE_ALLOWED_HOSTS
    // (список через запятую), иначе Vite отвечает «Blocked request».
    allowedHosts: process.env.VITE_ALLOWED_HOSTS
      ? process.env.VITE_ALLOWED_HOSTS.split(',').map((h) => h.trim()).filter(Boolean)
      : undefined,
    // HMR за обратным прокси с TLS: клиент подключается по wss к домену:443.
    // Без VITE_HMR_HOST — поведение по умолчанию (локальная разработка).
    hmr: process.env.VITE_HMR_HOST
      ? { host: process.env.VITE_HMR_HOST, protocol: 'wss', clientPort: 443 }
      : undefined,
    // Для `npm run dev` вне docker-compose — прокси на backend напрямую.
    // Внутри docker-compose путь /api/* проксирует Caddy, это не задействуется.
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})

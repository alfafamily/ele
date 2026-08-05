// B41 — durable E2E-набор для ELE (Playwright, headless).
// baseURL берётся из E2E_BASE_URL. Caddy проксирует / → SPA, /api/* → backend.
//   - Локально: живой стек за Caddy на домене (см. reports/B41-e2e.md).
//     E2E_BASE_URL=https://test-ele.dailycompany.cc
//   - CI: чистый стек docker-compose.e2e.yml на plain-HTTP :8080 (дефолт ниже).
import { defineConfig, devices } from '@playwright/test'

const baseURL = process.env.E2E_BASE_URL || 'http://localhost:8080'

export default defineConfig({
  testDir: './tests/e2e',
  // Полная параллельность внутри файла; между файлами — по числу воркеров.
  fullyParallel: true,
  // На CI запрещаем .only (забытый фокус-тест не должен зеленить прогон).
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Общий стенд/БД: ограничиваем воркеры, чтобы CRUD-сценарии разных файлов не
  // конкурировали за общие справочники. Изоляция данных — по уникальным префиксам.
  workers: process.env.CI ? 2 : 2,
  reporter: process.env.CI
    ? [['html', { open: 'never', outputFolder: 'playwright-report' }], ['list']]
    : [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  timeout: 45_000,
  expect: { timeout: 10_000 },
  outputDir: 'test-results',
  use: {
    baseURL,
    headless: true,
    // Let's Encrypt-сертификат домена валиден, но на изолированном CI-стенде
    // (self-signed / plain-HTTP) лишняя строгость только мешает.
    ignoreHTTPSErrors: true,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    locale: 'ru-RU',
    timezoneId: 'Europe/Moscow',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    // Setup: разовый логин администратора → storageState для остальных проектов.
    { name: 'setup', testMatch: /.*\.setup\.js/ },
    // Десктоп — основной прогон (вся функциональность) под сессией админа.
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        storageState: './tests/e2e/.auth/admin.json',
      },
      // Тесты вёрстки под мобильный вьюпорт — только в проекте mobile.
      grepInvert: /@mobile/,
      dependencies: ['setup'],
    },
    // Мобильная вёрстка — B41 явно требует проверку мобильного вьюпорта
    // (нижний таб-бар, drawer-меню, отсутствие горизонтального скролла).
    // Помечаем тесты тегом @mobile — на мобильном гоняем только вёрстку/навигацию.
    {
      name: 'mobile',
      use: {
        ...devices['Pixel 5'],
        storageState: './tests/e2e/.auth/admin.json',
      },
      grep: /@mobile/,
      dependencies: ['setup'],
    },
  ],
})

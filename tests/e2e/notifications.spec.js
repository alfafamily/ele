// Уведомления: структура страницы, каналы (Почта/Push) и что переключение
// канала реально уходит запросом в /api/notifications/preferences/.
// Реальную web-push подписку в headless-браузере воспроизвести нельзя —
// проверяем наличие управления push и его состояние (best-effort).
import { test, expect } from '@playwright/test'
import { expectNoHorizontalScroll } from './helpers.js'

// Разрешаем нотификации — чтобы состояние push не было «запрещено».
test.beforeEach(async ({ context, baseURL }) => {
  try {
    await context.grantPermissions(['notifications'], { origin: baseURL })
  } catch {
    /* не критично для проверок ниже */
  }
})

test('страница уведомлений: заголовок, колонки и кнопка push', async ({ page }) => {
  await page.goto('/notifications')
  await expect(page.getByRole('heading', { level: 1, name: 'Уведомления' })).toBeVisible()
  await expect(page.getByText('Почта', { exact: true })).toBeVisible()
  await expect(page.getByText('Push', { exact: true })).toBeVisible()
  // Управление push присутствует (в headless может быть недоступно — это ок).
  await expect(page.getByRole('button', { name: /push-уведомления на устройстве/ })).toBeVisible()
  await expectNoHorizontalScroll(page)
})

test('переключение канала «Почта» уходит в /api/notifications/preferences/', async ({ page }) => {
  await page.goto('/notifications')
  // Первый чекбокс в таблице каналов — это «Почта» для первого вида уведомлений.
  const firstEmail = page.getByRole('checkbox').first()
  await expect(firstEmail).toBeVisible()

  const [resp] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('/api/notifications/preferences/') && r.request().method() !== 'GET'),
    firstEmail.click(),
  ])
  expect(resp.ok()).toBeTruthy()

  // Возвращаем настройку в исходное состояние (аккаунт общий).
  await Promise.all([
    page.waitForResponse((r) => r.url().includes('/api/notifications/preferences/') && r.request().method() !== 'GET'),
    firstEmail.click(),
  ])
})

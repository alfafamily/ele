// Аутентификация, guard-редиректы, роли, истечение сессии.
// Эти тесты работают БЕЗ преднастроенной сессии — свой чистый контекст.
import { test, expect } from '@playwright/test'
import { CREDS, login, logout } from './helpers.js'

// Пустой storageState — перекрываем админскую сессию проекта.
test.use({ storageState: { cookies: [], origins: [] } })

test('guard: неавторизованного уводит на /login', async ({ page }) => {
  await page.goto('/equipment')
  await expect(page).toHaveURL(/\/login/)
  await expect(page.getByRole('button', { name: 'Войти' })).toBeVisible()
})

test('логин администратора: успешный вход и переход в приложение', async ({ page }) => {
  const me = await login(page, CREDS.admin)
  expect(me.role).toBe('admin')
  await page.goto('/profile')
  await expect(page.getByText('Данные учётной записи')).toBeVisible()
})

test('логин: неверный пароль → баннер ошибки, остаёмся на /login', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Email').fill(CREDS.admin.email)
  await page.getByLabel('Пароль').fill('заведомо-неверный-пароль')
  await page.getByRole('button', { name: 'Войти' }).click()
  await expect(page.getByText('Неверный email или пароль.')).toBeVisible()
  await expect(page).toHaveURL(/\/login/)
})

test('логаут: из Профиля возвращает на /login', async ({ page }) => {
  await login(page, CREDS.admin)
  await logout(page)
  // После логаута защищённый раздел снова недоступен.
  await page.goto('/employees')
  await expect(page).toHaveURL(/\/login/)
})

test('истечение сессии: без cookies API перестаёт узнавать пользователя', async ({ page, context }) => {
  await login(page, CREDS.admin)
  // Сессия активна: /api/auth/me/ возвращает пользователя.
  const before = await page.request.get('/api/auth/me/')
  expect(before.ok()).toBeTruthy()
  expect((await before.json()).role).toBe('admin')

  // Симулируем протухшую сессию — сбрасываем cookies.
  await context.clearCookies()

  // Сервер больше не аутентифицирует запрос (сессия завершена).
  // Примечание: SPA-оболочка может оставаться на экране из PWA-кэша — источник
  // истины авторизации именно серверный ответ.
  const after = await page.request.get('/api/auth/me/')
  expect(after.status(), 'после сброса cookies /api/auth/me/ должен быть 401/403').toBeGreaterThanOrEqual(401)
  expect(after.status()).toBeLessThan(404)
})

test('роль Наблюдатель: видит списки, но без действий и без Настроек', async ({ page }) => {
  const me = await login(page, CREDS.observer)
  expect(me.role).toBe('employee')
  expect(me.is_observer).toBe(true)
  await page.goto('/equipment')
  await expect(page.getByRole('heading', { level: 1, name: 'Оборудование' })).toBeVisible()
  // Наблюдатель не управляет объектами — кнопки добавления нет.
  await expect(page.getByRole('button', { name: 'Добавить оборудование' })).toHaveCount(0)
  // Настройки — только Администратор: guard уводит с /settings.
  await page.goto('/settings')
  await expect(page).not.toHaveURL(/\/settings/)
})

test('роль Сотрудник: бизнес-разделы недоступны, посадочная — Профиль', async ({ page }) => {
  const me = await login(page, CREDS.employee)
  expect(me.role).toBe('employee')
  expect(me.is_observer).toBe(false)
  await page.goto('/equipment')
  // Обычного сотрудника guard уводит из бизнес-раздела в Профиль.
  await expect(page).toHaveURL(/\/profile/)
  await expect(page.getByText('Данные учётной записи')).toBeVisible()
})

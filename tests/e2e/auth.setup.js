// Setup-проект Playwright: логинимся администратором один раз и сохраняем
// storageState, чтобы основные спеки не повторяли вход в каждом тесте.
import { test as setup, expect } from '@playwright/test'
import { CREDS } from './helpers.js'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const ADMIN_STATE = path.join(__dirname, '.auth', 'admin.json')

setup('аутентификация администратора', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Email').fill(CREDS.admin.email)
  await page.getByLabel('Пароль').fill(CREDS.admin.password)
  await page.getByRole('button', { name: 'Войти' }).click()
  // Дожидаемся ухода с формы входа и наличия профиля в /api/auth/me/.
  await expect(page).not.toHaveURL(/\/login/)
  const me = await page.request.get('/api/auth/me/')
  expect(me.ok()).toBeTruthy()
  expect((await me.json()).role).toBe('admin')
  await page.context().storageState({ path: ADMIN_STATE })
})

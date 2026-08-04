// Общие помощники E2E-набора B41.
// Селекторы — по ролям/тексту (реальные строки из компонентов), без хрупких CSS.
import { expect } from '@playwright/test'

// Учётные записи. На живом стенде и в CI-сиде (seed_e2e) совпадают по email/паролю.
export const CREDS = {
  admin: {
    email: process.env.E2E_ADMIN_EMAIL || 'admin@example.com',
    password: process.env.E2E_ADMIN_PASSWORD || 'changeme',
    role: 'admin',
  },
  // Наблюдатель — employee + is_observer: сквозной read-only без Настроек/Типов.
  observer: {
    email: process.env.E2E_OBSERVER_EMAIL || 'view@example.com',
    password: process.env.E2E_OBSERVER_PASSWORD || 'changeme',
    role: 'observer',
  },
  // Обычный сотрудник без признаков — только Профиль/Руководство.
  employee: {
    email: process.env.E2E_EMPLOYEE_EMAIL || 'emp@example.com',
    password: process.env.E2E_EMPLOYEE_PASSWORD || 'changeme',
    role: 'employee',
  },
}

// Разделы навигации (label из navSections.js) + h1 страницы-списка.
export const SECTIONS = [
  { to: '/equipment', nav: 'Оборудование', h1: 'Оборудование' },
  { to: '/tools', nav: 'Инструменты', h1: 'Инструменты' },
  { to: '/licenses', nav: 'Лицензии', h1: 'Лицензии' },
  { to: '/transport', nav: 'Транспорт', h1: 'Транспорт' },
  { to: '/sim-cards', nav: 'Корпоративная связь', h1: 'Корпоративная связь' },
  { to: '/passes', nav: 'Средства доступа', h1: 'Средства доступа' },
  { to: '/premises', nav: 'Помещения', h1: 'Помещения' },
  { to: '/employees', nav: 'Сотрудники', h1: 'Сотрудники' },
  { to: '/settings', nav: 'Настройки', h1: 'Настройки' },
]

// Уникальный суффикс на прогон — изолирует данные тестов друг от друга и от
// существующих объектов стенда, чтобы поиск находил ровно свою запись.
export function uniq(prefix = 'E2E') {
  const rnd = Math.random().toString(36).slice(2, 7)
  return `${prefix}-${Date.now().toString(36)}-${rnd}`
}

// UI-логин: заполнить форму и дождаться перехода в приложение. Возвращает
// профиль текущего пользователя (для проверок роли).
export async function login(page, { email, password }) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Пароль').fill(password)
  await page.getByRole('button', { name: 'Войти' }).click()
  // После входа guard уводит с /login; ждём, что мы уже не на форме входа.
  await expect(page).not.toHaveURL(/\/login/)
  return getMe(page)
}

export async function logout(page) {
  await page.goto('/profile')
  await page.getByRole('button', { name: 'Выйти из системы' }).click()
  await expect(page).toHaveURL(/\/login/)
}

// ── API-помощники (через контекст страницы: те же cookies сессии + CSRF) ──────
// Нужны для быстрой изоляции/уборки данных и для проверки «факт запроса к /api».

async function csrfToken(page) {
  // Гарантируем наличие csrftoken-cookie.
  await page.request.get('/api/auth/csrf/')
  const cookies = await page.context().cookies()
  const c = cookies.find((x) => x.name === 'csrftoken')
  return c ? c.value : ''
}

export async function apiGet(page, url) {
  const res = await page.request.get(url)
  expect(res.ok(), `GET ${url} → ${res.status()}`).toBeTruthy()
  return res.json()
}

async function apiWrite(page, method, url, data) {
  const token = await csrfToken(page)
  // Django на HTTPS сверяет Referer/Origin для CSRF — без них unsafe-запрос 403.
  // Берём origin из E2E_BASE_URL (надёжно и до первого goto), иначе из URL страницы.
  const base = process.env.E2E_BASE_URL || page.url()
  const origin = new URL(base).origin
  const res = await page.request.fetch(url, {
    method,
    headers: {
      'X-CSRFToken': token,
      'Content-Type': 'application/json',
      Referer: `${origin}/`,
      Origin: origin,
    },
    data: data ? JSON.stringify(data) : undefined,
  })
  return res
}

export const apiPost = (page, url, data) => apiWrite(page, 'POST', url, data)
export const apiPatch = (page, url, data) => apiWrite(page, 'PATCH', url, data)
export const apiDelete = (page, url) => apiWrite(page, 'DELETE', url)

export async function getMe(page) {
  const res = await page.request.get('/api/auth/me/')
  if (!res.ok()) return null
  return res.json()
}

// Уборка списка объектов по URL: тихо, без падения теста на 404/409.
export async function cleanup(page, urls) {
  for (const url of urls) {
    try {
      await apiDelete(page, url)
    } catch {
      /* уборка не должна валить тест */
    }
  }
}

// ── Проверки вёрстки (B41: длинные значения не должны ломать раскладку) ───────

// Нет горизонтальной прокрутки страницы (перекрытия/вылезание за вьюпорт).
export async function expectNoHorizontalScroll(page) {
  const overflow = await page.evaluate(() => {
    const el = document.documentElement
    // +2px допуск на субпиксельные округления/бордеры.
    return el.scrollWidth - el.clientWidth
  })
  expect(overflow, 'горизонтальная прокрутка страницы (вылет вёрстки за вьюпорт)').toBeLessThanOrEqual(2)
}

// Сбор ошибок консоли/сети для smoke: возвращает массив, наполняемый по ходу.
export function collectConsoleErrors(page) {
  const errors = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  page.on('pageerror', (err) => errors.push(String(err)))
  return errors
}

// Часть ошибок консоли — «шум» окружения (иконки/пуш/сеть медиа), не регрессии
// SPA. Фильтруем известный шум, чтобы smoke не был флаки.
export function significantErrors(errors) {
  const IGNORE = [
    /favicon/i,
    /manifest/i,
    /service ?worker/i,
    /ServiceWorker/i,
    /push/i,
    /VAPID/i,
    /Notification/i,
    /web-?push/i,
    /Failed to load resource.*\b(404|403)\b/i, // отсутствующие медиа/аватары на стенде
    /net::ERR_/i,
    /\/media\//i,
    /the server responded with a status of 40/i,
  ]
  return errors.filter((e) => !IGNORE.some((re) => re.test(e)))
}

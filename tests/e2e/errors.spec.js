// Обработка ошибок API на фронте (B42-добор к B41). Проверяем ветку, которую
// живой (исправный) бэкенд не воспроизводит: сбой загрузки списка. Перехватываем
// запрос списка через page.route и отвечаем 5xx / обрываем соединение — SPA
// должна показать баннер ошибки, а не вечный скелетон и не пустой список.
// Изолированно, без записи в БД.
import { test, expect } from '@playwright/test'

// PWA-стенд регистрирует service worker, который перехватывает fetch раньше
// page.route → подмена ответа не применяется. Для мок-спеков SW отключаем.
test.use({ serviceWorkers: 'block' })

const LISTS = [
  { section: 'Оборудование', to: '/equipment', listPath: '/api/equipment/' },
  { section: 'Транспорт', to: '/transport', listPath: '/api/transport/' },
  { section: 'Средства доступа', to: '/passes', listPath: '/api/access-passes/' },
]

// Единый текст ошибки загрузки списков (см. *ListPage.jsx: error → баннер).
const ERROR_TEXT = 'Не удалось загрузить список.'

for (const l of LISTS) {
  test(`${l.section}: ответ 500 на список → баннер ошибки`, async ({ page }) => {
    await page.route(
      (url) => new URL(url).pathname === l.listPath,
      (route) =>
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ detail: 'Внутренняя ошибка сервера' }),
        }),
    )

    await page.goto(l.to)
    await expect(page.getByText(ERROR_TEXT, { exact: true })).toBeVisible()
  })

  test(`${l.section}: обрыв сети на список → баннер ошибки`, async ({ page }) => {
    // Полный сетевой сбой (не HTTP-ответ) — клиент ловит исключение fetch.
    await page.route((url) => new URL(url).pathname === l.listPath, (route) => route.abort('failed'))

    await page.goto(l.to)
    await expect(page.getByText(ERROR_TEXT, { exact: true })).toBeVisible()
  })
}

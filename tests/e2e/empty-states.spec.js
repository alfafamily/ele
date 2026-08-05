// Пустые состояния списков (B42-добор к B41). На общем стенде списки всегда
// наполнены сидом, поэтому ветку «данных нет» проверяем не удалением реальных
// объектов (это разрушало бы стенд и параллельные тесты), а перехватом ответа
// списка через page.route: подменяем выдачу на пустую страницу DRF
// ({results:[], next:null}) и проверяем, что SPA рисует <EmptyState> с нужным
// заголовком. Изолированно, без записи в БД.
import { test, expect } from '@playwright/test'
import { expectNoHorizontalScroll } from './helpers.js'

// PWA-стенд регистрирует service worker, который перехватывает fetch раньше
// page.route → мок ответа не применяется. Для мок-спеков SW отключаем: запросы
// идут напрямую в сеть, и перехват работает.
test.use({ serviceWorkers: 'block' })

// listPath — pathname запроса списка (useCursorList), title — заголовок пустого
// состояния для дефолтной вкладки (см. *ListPage.jsx).
const LISTS = [
  { section: 'Оборудование', to: '/equipment', listPath: '/api/equipment/', title: 'Пока пусто' },
  { section: 'Транспорт', to: '/transport', listPath: '/api/transport/', title: 'Пока пусто' },
  { section: 'Средства доступа', to: '/passes', listPath: '/api/access-passes/', title: 'Пока пусто' },
]

// Пустая страница DRF-курсора: результатов нет, следующей страницы нет.
async function fulfillEmpty(route) {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ results: [], next: null, previous: null }),
  })
}

for (const l of LISTS) {
  test(`${l.section}: пустой список показывает состояние «${l.title}»`, async ({ page }) => {
    // Перехват ставим ДО перехода — первый же запрос списка отдаём пустым.
    // Совпадение строго по pathname, чтобы не задеть смежные (…-types, field-values).
    await page.route((url) => new URL(url).pathname === l.listPath, fulfillEmpty)

    await page.goto(l.to)

    await expect(page.getByText(l.title, { exact: true })).toBeVisible()
    // Пустое состояние не должно ломать раскладку.
    await expectNoHorizontalScroll(page)
  })
}

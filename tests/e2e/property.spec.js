// Прочее имущество (лицензии/связь/средства доступа/транспорт): проверяем, что
// форма создания открывается и валидирует обязательные поля (пустая отправка не
// создаёт объект — остаёмся на форме). Списки этих разделов покрыты smoke.spec.
// Глубокий CRUD с размещением/привязкой: лицензии — licenses.spec.js (B42);
// связь/средства доступа/транспорт — по мере необходимости (см. reports/B42-coverage.md).
import { test, expect } from '@playwright/test'
import { expectNoHorizontalScroll } from './helpers.js'

const FORMS = [
  { section: 'Лицензии', to: '/licenses/new' },
  { section: 'Корпоративная связь', to: '/sim-cards/new' },
  { section: 'Средства доступа', to: '/passes/new' },
  { section: 'Транспорт', to: '/transport/new' },
]

for (const f of FORMS) {
  test(`${f.section}: форма создания открывается и валидирует пустую отправку`, async ({ page }) => {
    await page.goto(f.to)
    // Форма отрисована (кнопка сохранения на месте) и без вылета вёрстки.
    const submit = page.getByRole('button', { name: 'Создать' })
    await expect(submit).toBeVisible()
    await expectNoHorizontalScroll(page)
    // Пустая отправка — объект не создаётся, остаёмся на маршруте /new.
    await submit.click()
    await expect(page).toHaveURL(new RegExp(f.to.replace('/', '\\/')))
  })
}

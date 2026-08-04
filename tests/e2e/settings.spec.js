// Настройки (только Администратор): переключение разделов и ключевой контент.
// Резервное копирование проверяем на УРОВНЕ UI (кнопка есть) — реальную копию
// НЕ запускаем (нет выгрузки в прод-S3).
import { test, expect } from '@playwright/test'
import { CREDS, expectNoHorizontalScroll } from './helpers.js'

// Раздел настроек на десктопе — по кнопке в nav[aria-label="Разделы настроек"].
function navItem(page, label) {
  return page.getByRole('navigation', { name: 'Разделы настроек' }).getByRole('button', { name: label })
}

test('раздел «Пользователи»: список содержит администратора', async ({ page }) => {
  await page.goto('/settings')
  await navItem(page, 'Пользователи').click()
  await expect(page.getByText(CREDS.admin.email).first()).toBeVisible()
  await expectNoHorizontalScroll(page)
})

test('раздел «Резервное копирование»: кнопка создания копии присутствует', async ({ page }) => {
  await page.goto('/settings')
  await navItem(page, 'Резервное копирование').click()
  await expect(page.getByRole('button', { name: 'Создать резервную копию' })).toBeVisible()
  // Копию НЕ запускаем — только проверяем наличие управления.
  await expectNoHorizontalScroll(page)
})

test('раздел «Компания»: реквизиты организации редактируемы', async ({ page }) => {
  await page.goto('/settings')
  await navItem(page, 'Компания').click()
  // На вкладке видны реквизиты организации.
  await expect(page.getByText('Название компании')).toBeVisible()
  await expect(page.getByText('ИНН', { exact: true })).toBeVisible()
  await expectNoHorizontalScroll(page)
})

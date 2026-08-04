// Smoke по КАЖДОМУ разделу SPA под сессией администратора:
// страница грузится, виден ключевой заголовок, нет горизонтального вылета
// вёрстки и нет значимых ошибок в консоли. Плюс мобильная навигация (@mobile).
import { test, expect } from '@playwright/test'
import { SECTIONS, expectNoHorizontalScroll, collectConsoleErrors, significantErrors } from './helpers.js'

// ── Разделы-списки: единый smoke по таблице SECTIONS ─────────────────────────
for (const s of SECTIONS) {
  test(`раздел ${s.nav}: список открывается и вёрстка цела`, async ({ page }) => {
    const errors = collectConsoleErrors(page)
    await page.goto(s.to)
    await expect(page.getByRole('heading', { level: 1, name: s.h1 })).toBeVisible()
    await expectNoHorizontalScroll(page)
    expect(significantErrors(errors), `ошибки консоли на ${s.to}`).toEqual([])
  })
}

// ── Личные разделы (доступны любой роли) ─────────────────────────────────────
test('Профиль: карточка учётной записи видна', async ({ page }) => {
  const errors = collectConsoleErrors(page)
  await page.goto('/profile')
  await expect(page.getByText('Данные учётной записи')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Выйти из системы' })).toBeVisible()
  await expectNoHorizontalScroll(page)
  expect(significantErrors(errors)).toEqual([])
})

test('Уведомления: страница и колонка «Почта»', async ({ page }) => {
  await page.goto('/notifications')
  await expect(page.getByRole('heading', { level: 1, name: 'Уведомления' })).toBeVisible()
  await expect(page.getByText('Почта', { exact: true })).toBeVisible()
  await expectNoHorizontalScroll(page)
})

test('Руководство: страница открывается', async ({ page }) => {
  await page.goto('/guide')
  await expect(page.getByRole('heading', { name: 'Руководство пользователя' })).toBeVisible()
  await expectNoHorizontalScroll(page)
})

// ── Настройки: вкладки-разделы ───────────────────────────────────────────────
test('Настройки: доступны ключевые разделы', async ({ page }) => {
  await page.goto('/settings')
  await expect(page.getByRole('heading', { level: 1, name: 'Настройки' })).toBeVisible()
  for (const label of ['Компания', 'Пользователи', 'Резервное копирование']) {
    await expect(page.getByText(label, { exact: true }).first()).toBeVisible()
  }
  await expectNoHorizontalScroll(page)
})

// ── Отчёты (B45): каждая страница отчёта открывается ─────────────────────────
const REPORTS = [
  { to: '/premises/reports/workplaces', title: 'Отчёт по рабочим местам' },
  { to: '/premises/reports/common', title: 'Отчёт по местам общего пользования' },
  { to: '/premises/reports/storage', title: 'Отчёт по местам хранения' },
  { to: '/premises/reports/parking', title: 'Отчёт по парковкам' },
  { to: '/employees/reports/property', title: 'Отчёт по имуществу у сотрудников' },
]
for (const r of REPORTS) {
  test(`Отчёт: ${r.title}`, async ({ page }) => {
    await page.goto(r.to)
    await expect(page.getByText(r.title).first()).toBeVisible()
    await expectNoHorizontalScroll(page)
  })
}

// ── Редакторы Видов имущества ────────────────────────────────────────────────
const TYPES = [
  { to: '/equipment-types' },
  { to: '/transport-types' },
  { to: '/license-types' },
]
for (const t of TYPES) {
  test(`Редактор видов открывается: ${t.to}`, async ({ page }) => {
    await page.goto(t.to)
    await expect(page.getByRole('heading', { name: /Виды/ }).first()).toBeVisible()
    await expectNoHorizontalScroll(page)
  })
}

// ── Мобильная вёрстка (@mobile): нет вылета вёрстки на узком вьюпорте ─────────
test('@mobile навигация по разделам без вылета вёрстки', async ({ page }) => {
  // Много полноэкранных загрузок в одном тесте — просим тройной бюджет времени.
  test.slow()
  for (const s of SECTIONS) {
    await page.goto(s.to, { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { level: 1, name: s.h1 })).toBeVisible()
    await expectNoHorizontalScroll(page)
  }
})

test('@mobile Профиль и нижняя навигация', async ({ page }) => {
  await page.goto('/profile')
  await expect(page.getByText('Данные учётной записи')).toBeVisible()
  await expectNoHorizontalScroll(page)
})

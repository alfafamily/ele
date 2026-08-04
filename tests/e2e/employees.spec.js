// Сотрудники: CRUD через UI + валидация + уборка через API.
import { test, expect } from '@playwright/test'
import { uniq, apiPost, apiDelete, expectNoHorizontalScroll } from './helpers.js'

test('создание сотрудника: happy-path + карточка + уборка', async ({ page }) => {
  const last = uniq('Фамилия')
  const first = uniq('Имя')
  let createdId = null

  await page.goto('/employees/new')
  await expect(page.getByRole('heading', { name: 'Новый сотрудник' })).toBeVisible()
  await page.getByLabel('Фамилия').fill(last)
  await page.getByLabel('Имя').fill(first)
  await page.getByLabel('Должность').fill('Инженер-испытатель E2E')
  // Согласие ПДн обязательно для активации кнопки «Создать».
  await page.getByRole('checkbox').first().check()

  await page.getByRole('button', { name: 'Создать' }).click()

  // Успех → переход на карточку /employees/:id.
  await expect(page).toHaveURL(/\/employees\/\d+/)
  const m = page.url().match(/\/employees\/(\d+)/)
  createdId = m && m[1]
  expect(createdId).toBeTruthy()
  await expect(page.getByText(last).first()).toBeVisible()
  await expectNoHorizontalScroll(page)

  // Уборка.
  if (createdId) await apiDelete(page, `/api/employees/${createdId}/`)
})

test('валидация: без Фамилии/Имени карточка не создаётся', async ({ page }) => {
  await page.goto('/employees/new')
  // Отмечаем согласие, чтобы кнопка была активна, но имя/фамилию не заполняем.
  await page.getByRole('checkbox').first().check()
  await page.getByRole('button', { name: 'Создать' }).click()
  // Остаёмся на форме создания — переход на карточку не произошёл.
  await expect(page).toHaveURL(/\/employees\/new/)
})

test('редактирование сотрудника: смена должности сохраняется', async ({ page }) => {
  const last = uniq('Ред')
  const first = uniq('Имя')
  // Готовим объект напрямую через API (быстро и изолированно).
  await page.goto('/employees')
  const created = await apiPost(page, '/api/employees/', {
    last_name: last, first_name: first, position: 'Старая должность', consent_obtained: true,
  })
  expect(created.ok(), `создание сотрудника через API: ${created.status()}`).toBeTruthy()
  const id = (await created.json()).id

  await page.goto(`/employees/${id}/edit`)
  await expect(page.getByRole('heading', { name: 'Редактирование сотрудника' })).toBeVisible()
  const newPos = 'Новая должность E2E'
  await page.getByLabel('Должность').fill(newPos)
  await page.getByRole('button', { name: 'Сохранить' }).click()
  // После сохранения форма уходит с /edit (на список/карточку).
  await expect(page).not.toHaveURL(/\/edit/)
  // Персист проверяем на карточке и через API.
  await page.goto(`/employees/${id}`)
  await expect(page.getByText(newPos).first()).toBeVisible()
  const fresh = await page.request.get(`/api/employees/${id}/`)
  expect((await fresh.json()).position).toBe(newPos)

  await apiDelete(page, `/api/employees/${id}/`)
})

test('раздел «Операции закрепления» открывается', async ({ page }) => {
  await page.goto('/employees/assignments')
  await expect(page.getByRole('heading', { name: /Операции закрепления/ })).toBeVisible()
  await expectNoHorizontalScroll(page)
})

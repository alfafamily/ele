// Оборудование: создание (свой Вид), карточка в UI, движение имущества
// (закрепление за сотрудником) с проверкой факта в /api/*/history/ и в
// «Выдано» карточки сотрудника + валидация формы.
//
// Ограничение бэкенда (ради целостности simple-history): оборудование/типы
// НЕ удаляются через API (DELETE → 405/409). Уборка — списание оборудования и
// архивация Вида. См. reports/B41-e2e.md.
import { test, expect } from '@playwright/test'
import { uniq, apiGet, apiPost, apiPatch } from './helpers.js'

test('валидация формы: без Вида и Учётного номера оборудование не создаётся', async ({ page }) => {
  await page.goto('/equipment/new')
  await expect(page.getByRole('heading', { name: 'Новое оборудование' })).toBeVisible()
  await page.getByRole('button', { name: 'Создать' }).click()
  // Обязательные поля не заполнены — остаёмся на форме создания.
  await expect(page).toHaveURL(/\/equipment\/new/)
})

test('создание оборудования + движение (закрепление) → история и «Выдано»', async ({ page }) => {
  const sfx = uniq('EQ')
  const inv = `INV-${sfx}`

  // 1. Свой Вид оборудования (изоляция от справочника стенда).
  const typeRes = await apiPost(page, '/api/equipment-types/', { name: `Вид-${sfx}` })
  expect(typeRes.ok(), `создание Вида: ${typeRes.status()}`).toBeTruthy()
  const typeId = (await typeRes.json()).id

  // 2. Экземпляр оборудования.
  const eqRes = await apiPost(page, '/api/equipment/', { equipment_type: typeId, inventory_number: inv })
  expect(eqRes.ok(), `создание оборудования: ${eqRes.status()}`).toBeTruthy()
  const eqId = (await eqRes.json()).id

  // 3. Карточка оборудования открывается и показывает учётный номер.
  await page.goto(`/equipment/${eqId}`)
  await expect(page.getByText(inv).first()).toBeVisible()

  // 4. Сотрудник-получатель.
  const empRes = await apiPost(page, '/api/employees/', {
    last_name: `Получатель-${sfx}`, first_name: 'Имя', consent_obtained: true,
  })
  expect(empRes.ok()).toBeTruthy()
  const emp = await empRes.json()

  // 5. Движение: закрепление за сотрудником (mode=mobile).
  const assignRes = await apiPost(page, `/api/equipment/${eqId}/assign/`, { mode: 'mobile', employee: emp.id })
  expect(assignRes.ok(), `assign: ${assignRes.status()}`).toBeTruthy()
  expect((await assignRes.json()).employee).toBe(emp.id)

  // 6a. Факт в simple-history: /api/equipment/:id/history/ содержит запись движения
  // с именем сотрудника (реально сохранилось, а не только в текущем состоянии).
  const history = await apiGet(page, `/api/equipment/${eqId}/history/`)
  const historyText = JSON.stringify(history)
  expect(historyText).toContain(emp.last_name)

  // 6b. Факт в UI: карточка сотрудника, вкладка «Выдано» → блок «Оборудование».
  await page.goto(`/employees/${emp.id}`)
  await expect(page.getByText(inv).first()).toBeVisible()

  // 7. Уборка (мягкая): списываем оборудование, архивируем Вид.
  await apiPost(page, `/api/equipment/${eqId}/write-off/`, {})
  await apiPatch(page, `/api/equipment-types/${typeId}/`, { is_archived: true })
  // Сотрудника с историей закрепления бэкенд удалять не даёт (см. отчёт) — оставляем.
})

// Лицензии — глубокий CRUD (B42-добор к B41: property.spec покрывал лишь
// открытие формы). Здесь — жизненный цикл с размещением/привязкой:
//  • создание Вида + экземпляра лицензии;
//  • размещение на оборудовании (привязка) и её отображение на карточке;
//  • серверный гард привязки (тип оборудования без флага «Установка лицензий»);
//  • утилизация (снятие привязки + признак утилизации).
// Движения делаем через API (изоляция/скорость), факты проверяем в UI и /api/*.
//
// Уборка мягкая: лицензии/типы через API не удаляем (simple-history) —
// утилизируем лицензию, списываем оборудование, архивируем Виды. См. reports/B41-e2e.md.
import { test, expect } from '@playwright/test'
import { uniq, apiGet, apiPost, apiPatch } from './helpers.js'

test('лицензия: размещение на оборудовании, гард привязки, утилизация', async ({ page }) => {
  const sfx = uniq('LIC')
  await page.goto('/licenses')

  // 1. Свой программный Вид лицензии. При создании Вид авто-заводит залоченный
  // обязательный реквизит-ключ («Номер/ключ») — без его значения лицензия не
  // создаётся, поэтому достаём id реквизита.
  const ltRes = await apiPost(page, '/api/license-types/', { name: `Вид-${sfx}`, kind: 'software' })
  expect(ltRes.ok(), `создание Вида лицензии: ${ltRes.status()}`).toBeTruthy()
  const licenseType = (await ltRes.json()).id
  const ltFull = await apiGet(page, `/api/license-types/${licenseType}/`)
  const keyField = ltFull.fields.find((f) => f.is_locked).id

  // 2. Два Вида оборудования: с разрешёнными лицензиями и без.
  const etYes = (await (await apiPost(page, '/api/equipment-types/', { name: `EqLic-${sfx}`, allows_license: true })).json()).id
  const etNo = (await (await apiPost(page, '/api/equipment-types/', { name: `EqNoLic-${sfx}`, allows_license: false })).json()).id

  const eqYes = (await (await apiPost(page, '/api/equipment/', { equipment_type: etYes, inventory_number: `INV-Y-${sfx}` })).json()).id
  const eqNo = (await (await apiPost(page, '/api/equipment/', { equipment_type: etNo, inventory_number: `INV-N-${sfx}` })).json()).id

  // 3. Лицензия, сразу размещённая на «разрешённом» оборудовании (привязка).
  const licRes = await apiPost(page, '/api/licenses/', {
    license_type: licenseType,
    equipment: eqYes,
    field_values_input: [{ field: keyField, value: `KEY-${sfx}` }],
  })
  expect(licRes.ok(), `создание лицензии с привязкой: ${licRes.status()}`).toBeTruthy()
  const lic = await licRes.json()
  const licId = lic.id
  expect(lic.equipment, 'лицензия привязана к оборудованию').toBe(eqYes)
  expect(lic.status, 'состояние размещения = assigned').toBe('assigned')

  // 4. UI карточки лицензии: Вид в заголовке + инвентарный номер привязанного
  // оборудования в блоке «Оборудование» (привязка реально отрисована).
  await page.goto(`/licenses/${licId}`)
  await expect(page.getByRole('heading', { name: `Вид-${sfx}` })).toBeVisible()
  await expect(page.getByText(`INV-Y-${sfx}`).first()).toBeVisible()

  // 5. Серверный гард: привязать лицензию к оборудованию, чей Вид НЕ разрешает
  // лицензии → 400 (валидация), объект не создаётся. Ключ передаём валидный и
  // уникальный, чтобы единственной причиной отказа был именно гард привязки.
  const denied = await apiPost(page, '/api/licenses/', {
    license_type: licenseType,
    equipment: eqNo,
    field_values_input: [{ field: keyField, value: `KEY2-${sfx}` }],
  })
  expect(denied.ok(), 'привязка к запрещённому Виду должна быть отклонена').toBeFalsy()
  expect(denied.status()).toBe(400)

  // 6. Утилизация: снимает привязку и ставит признак утилизации.
  const util = await apiPost(page, `/api/licenses/${licId}/utilize/`, { comment: `E2E ${sfx}` })
  expect(util.ok(), `утилизация: ${util.status()}`).toBeTruthy()
  const after = await apiGet(page, `/api/licenses/${licId}/`)
  expect(after.is_retired, 'лицензия утилизирована').toBe(true)
  expect(after.equipment, 'привязка снята при утилизации').toBeNull()

  // 7. Уборка: списываем оборудование, архивируем Виды.
  await apiPost(page, `/api/equipment/${eqYes}/write-off/`, {})
  await apiPost(page, `/api/equipment/${eqNo}/write-off/`, {})
  await apiPatch(page, `/api/equipment-types/${etYes}/`, { is_archived: true })
  await apiPatch(page, `/api/equipment-types/${etNo}/`, { is_archived: true })
  await apiPatch(page, `/api/license-types/${licenseType}/`, { is_archived: true })
})

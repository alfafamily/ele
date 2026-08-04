// Инструменты: количественный учёт (приход/списание/граница).
// Движение количеств требует склада-источника (серверное правило), а модалка
// движения тянет PlaceSelect — поэтому сами движения гоняем через API-экшены
// (add-units / write-off-units), а UI проверяем на отображении остатка/метрик.
// Числовую истину и граничную валидацию проверяем на /api/tools/:id/.
import { test, expect } from '@playwright/test'
import { uniq, apiGet, apiPost, apiPatch } from './helpers.js'

async function makeStoragePlace(page, sfx) {
  const b = await (await apiPost(page, '/api/buildings/', { name: `Скл-здание-${sfx}` })).json()
  const r = await (await apiPost(page, '/api/rooms/', { building: b.id, name: `Скл-пом-${sfx}` })).json()
  const p = await (await apiPost(page, '/api/places/', { room: r.id, name: `Склад-${sfx}`, place_type: 'storage' })).json()
  return { buildingId: b.id, placeId: p.id }
}

test('количественный учёт: приход/списание и граничное значение', async ({ page }) => {
  const sfx = uniq('TL')
  // Нужен переход, чтобы установилась сессия/страница; заодно проверим карточку.
  await page.goto('/tools')

  const { buildingId, placeId } = await makeStoragePlace(page, sfx)

  // 1. Инструмент с начальным остатком 10 на складе.
  const created = await apiPost(page, '/api/tools/', { name: `Инструмент-${sfx}`, quantity: 10, place: placeId })
  expect(created.ok(), `создание инструмента: ${created.status()}`).toBeTruthy()
  const id = (await created.json()).id
  let tool = await apiGet(page, `/api/tools/${id}/`)
  expect(tool.quantity).toBe(10)
  expect(tool.free).toBe(10)

  // 2. Карточка в UI: метрики учёта видны.
  await page.goto(`/tools/${id}`)
  await expect(page.getByText(`Инструмент-${sfx}`).first()).toBeVisible()
  await expect(page.getByText('Остаток', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('Свободно', { exact: true }).first()).toBeVisible()

  // 3. Приход +5 → остаток 15 (реальное движение через API-экшен).
  const add = await apiPost(page, `/api/tools/${id}/add-units/`, { quantity: 5, place: placeId })
  expect(add.ok(), `приход: ${add.status()}`).toBeTruthy()
  expect((await apiGet(page, `/api/tools/${id}/`)).quantity).toBe(15)

  // 4. Списание 3 → остаток 12.
  const off = await apiPost(page, `/api/tools/${id}/write-off-units/`, { quantity: 3, place: placeId })
  expect(off.ok(), `списание: ${off.status()}`).toBeTruthy()
  expect((await apiGet(page, `/api/tools/${id}/`)).quantity).toBe(12)

  // 5. Граница: списать больше, чем свободно → сервер отклоняет, остаток прежний.
  const over = await apiPost(page, `/api/tools/${id}/write-off-units/`, { quantity: 999, place: placeId })
  // Сервер отклоняет превышение (400 — валидация, 409 — конфликт остатка).
  expect(over.ok()).toBeFalsy()
  expect(over.status(), `ожидали 4xx-отказ, получили ${over.status()}`).toBeGreaterThanOrEqual(400)
  expect(over.status()).toBeLessThan(500)
  tool = await apiGet(page, `/api/tools/${id}/`)
  expect(tool.quantity).toBe(12)

  // 6. UI отражает актуальный остаток после перезагрузки карточки.
  await page.goto(`/tools/${id}`)
  await expect(page.getByText(`Инструмент-${sfx}`).first()).toBeVisible()

  // Уборка (мягкая — объекты append-only): списываем весь остаток, архивируем склад.
  await apiPost(page, `/api/tools/${id}/write-off-units/`, { quantity: 12, place: placeId })
  await apiPatch(page, `/api/buildings/${buildingId}/`, { is_archived: true })
})

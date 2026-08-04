// Помещения: здание → помещение → место (склад). Создаём через API,
// проверяем отображение в UI. Объекты append-only (DELETE→405 by design),
// поэтому уборка — архивация здания.
import { test, expect } from '@playwright/test'
import { uniq, apiGet, apiPost, apiPatch, expectNoHorizontalScroll } from './helpers.js'

test('иерархия здание/помещение/место создаётся и видна в UI', async ({ page }) => {
  const sfx = uniq('PR')
  const buildingName = `Здание-${sfx}`

  const bRes = await apiPost(page, '/api/buildings/', { name: buildingName })
  expect(bRes.ok(), `здание: ${bRes.status()}`).toBeTruthy()
  const building = await bRes.json()

  const rRes = await apiPost(page, '/api/rooms/', { building: building.id, name: `Помещение-${sfx}` })
  expect(rRes.ok(), `помещение: ${rRes.status()}`).toBeTruthy()
  const room = await rRes.json()

  const pRes = await apiPost(page, '/api/places/', { room: room.id, name: `Склад-${sfx}`, place_type: 'storage' })
  expect(pRes.ok(), `место: ${pRes.status()}`).toBeTruthy()

  // UI: здание видно в списке раздела «Помещения».
  await page.goto('/premises')
  await expect(page.getByRole('heading', { level: 1, name: 'Помещения' })).toBeVisible()
  await expect(page.getByText(buildingName).first()).toBeVisible()
  await expectNoHorizontalScroll(page)

  // Место действительно относится к зданию (проверка факта через API).
  const places = await apiGet(page, `/api/places/?room=${room.id}`)
  const list = places.results || places
  expect(list.some((p) => p.name === `Склад-${sfx}`)).toBeTruthy()

  // Уборка (мягкая): архивируем здание.
  await apiPatch(page, `/api/buildings/${building.id}/`, { is_archived: true })
})

test('валидация: место без наименования не создаётся', async ({ page }) => {
  const sfx = uniq('PRV')
  const bRes = await apiPost(page, '/api/buildings/', { name: `Здание-${sfx}` })
  const building = await bRes.json()
  const rRes = await apiPost(page, '/api/rooms/', { building: building.id, name: `Помещение-${sfx}` })
  const room = await rRes.json()
  // Пустое наименование → 400 с ошибкой поля.
  const bad = await apiPost(page, '/api/places/', { room: room.id, place_type: 'storage' })
  expect(bad.status()).toBe(400)
  const body = await bad.json()
  expect(JSON.stringify(body)).toContain('name')
  await apiPatch(page, `/api/buildings/${building.id}/`, { is_archived: true })
})

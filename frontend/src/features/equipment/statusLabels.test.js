import { describe, it, expect } from 'vitest'
import { planStatusIcon, maintenanceIndicators, maintenanceRowIndicators } from './statusLabels.js'

describe('planStatusIcon', () => {
  it('известный статус → цвет и подпись', () => {
    const r = planStatusIcon('overdue')
    expect(r.icon).toBe('wrench')
    expect(r.color).toBe('var(--color-error)')
    expect(r.title).toBe('ТО просрочено')
  })
  it('неизвестный статус → нейтральный цвет и «ТО»', () => {
    const r = planStatusIcon('???')
    expect(r.color).toBe('var(--color-text-muted)')
    expect(r.title).toBe('ТО')
  })
})

describe('maintenanceIndicators', () => {
  it('нет сводки / выключено → пусто', () => {
    expect(maintenanceIndicators(null)).toEqual([])
    expect(maintenanceIndicators({ enabled: false, critical: 'overdue' })).toEqual([])
  })
  it('только «нет даты» → одна серая иконка', () => {
    const out = maintenanceIndicators({ enabled: true, has_unplanned: true })
    expect(out).toHaveLength(1)
    expect(out[0].color).toBe('var(--color-text-placeholder)')
  })
  it('критичный + «нет даты» → две иконки, серая первой', () => {
    const out = maintenanceIndicators({ enabled: true, has_unplanned: true, critical: 'overdue' })
    expect(out).toHaveLength(2)
    expect(out[0].title).toContain('без установленной даты')
    expect(out[1].color).toBe('var(--color-error)')
  })
  it('критичный статус без сводного заголовка → падение на ярлык плана', () => {
    const out = maintenanceIndicators({ enabled: true, critical: 'not_planned' })
    expect(out[0].title).toBe('Дата ТО не задана')
  })
})

describe('maintenanceRowIndicators', () => {
  const summary = { enabled: true, has_unplanned: true, critical: 'overdue' }
  it('fullStatus → все иконки', () => {
    expect(maintenanceRowIndicators(summary, { fullStatus: true })).toHaveLength(2)
  })
  it('manageOnly + есть «нет даты» → только серая', () => {
    const out = maintenanceRowIndicators(summary, { fullStatus: false, manageOnly: true })
    expect(out).toHaveLength(1)
    expect(out[0].color).toBe('var(--color-text-placeholder)')
  })
  it('manageOnly без «нет даты» → пусто', () => {
    const out = maintenanceRowIndicators({ enabled: true, critical: 'overdue' }, { manageOnly: true })
    expect(out).toEqual([])
  })
  it('без причастности → пусто', () => {
    expect(maintenanceRowIndicators(summary, { fullStatus: false, manageOnly: false })).toEqual([])
  })
})

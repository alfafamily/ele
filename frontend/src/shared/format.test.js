import { describe, it, expect } from 'vitest'
import { formatBytes } from './format.js'

describe('formatBytes', () => {
  it('null/undefined → «—»', () => {
    expect(formatBytes(null)).toBe('—')
    expect(formatBytes(undefined)).toBe('—')
  })
  it('байты (< 1 КБ) — целыми', () => {
    expect(formatBytes(0)).toBe('0 Б')
    expect(formatBytes(500)).toBe('500 Б')
  })
  it('килобайты — округление до целого', () => {
    expect(formatBytes(5120)).toBe('5 КБ')
    expect(formatBytes(1536)).toBe('2 КБ') // round(1.5)
  })
  it('мегабайты — одна дробная цифра, ru-запятая', () => {
    expect(formatBytes(1.5 * 1024 * 1024)).toBe('1,5 МБ')
  })
  it('целое значение без хвоста «,0»', () => {
    expect(formatBytes(500 * 1024 * 1024)).toBe('500 МБ')
  })
  it('гигабайты и терабайты', () => {
    expect(formatBytes(2 * 1024 ** 3)).toBe('2 ГБ')
    expect(formatBytes(3 * 1024 ** 4)).toBe('3 ТБ')
  })
})

import { describe, it, expect } from 'vitest'
import { nameInitials } from './employeeName.js'

describe('nameInitials', () => {
  it('«Фамилия Имя» → первые буквы двух слов', () => {
    expect(nameInitials('Иванов Пётр')).toBe('ИП')
  })
  it('три слова (с отчеством) → первые две', () => {
    expect(nameInitials('Иванов Пётр Сергеевич')).toBe('ИП')
  })
  it('одно слово → первые две буквы', () => {
    expect(nameInitials('admin')).toBe('AD')
  })
  it('пустая строка / null / undefined → «?»', () => {
    expect(nameInitials('')).toBe('?')
    expect(nameInitials(null)).toBe('?')
    expect(nameInitials(undefined)).toBe('?')
  })
  it('лишние пробелы схлопываются', () => {
    expect(nameInitials('  Иванов   Пётр  ')).toBe('ИП')
  })
})

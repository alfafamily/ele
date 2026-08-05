import { describe, it, expect } from 'vitest'
import { splitApiError } from './formErrors.js'

describe('splitApiError', () => {
  it('без errors: общий detail уходит в баннер формы', () => {
    expect(splitApiError({ detail: 'Доступ запрещён' })).toEqual({
      fieldErrors: {},
      formError: 'Доступ запрещён',
    })
  })

  it('пустой объект → пустые ошибки', () => {
    expect(splitApiError({})).toEqual({ fieldErrors: {}, formError: null })
  })

  it('ошибки полей раскладываются по ключам', () => {
    const { fieldErrors, formError } = splitApiError({ errors: { name: ['Обязательное поле'] } })
    expect(fieldErrors).toEqual({ name: ['Обязательное поле'] })
    expect(formError).toBeNull()
  })

  it('non_field_errors идёт в баннер', () => {
    const { fieldErrors, formError } = splitApiError({ errors: { non_field_errors: ['Дубликат', 'ещё'] } })
    expect(fieldErrors).toEqual({})
    expect(formError).toBe('Дубликат ещё')
  })

  it('bannerKeys выносят указанные ключи в баннер', () => {
    const { fieldErrors, formError } = splitApiError(
      { errors: { field_values: ['Проверьте реквизиты'], name: ['Занято'] } },
      { bannerKeys: ['field_values'] },
    )
    expect(fieldErrors).toEqual({ name: ['Занято'] })
    expect(formError).toBe('Проверьте реквизиты')
  })

  it('не-массивное значение приводится к строке', () => {
    const { formError } = splitApiError({ errors: { non_field_errors: 'строкой' } })
    expect(formError).toBe('строкой')
  })

  it('errors есть, но всё по полям → formError падает на detail', () => {
    const { formError } = splitApiError({ errors: { name: ['x'] }, detail: 'запасной' })
    expect(formError).toBe('запасной')
  })
})

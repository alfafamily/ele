import { useCallback, useEffect, useState } from 'react'
import { apiGet } from '../shared/api/client'
import { useAuth } from './AuthContext'
import { CompanyContext } from './CompanyContext'

// Название + лого для навигации — видно любой аутентифицированной
// роли, в отличие от полной карточки Настройки → Компания (только Admin).
export function CompanyProvider({ children }) {
  const { user } = useAuth()
  const [company, setCompany] = useState(null)
  // B12: число активных возможных дублей сотрудников — для бейджа на иконке
  // «Настройки». Считается только для администратора (эндпоинт под IsAdmin).
  const [duplicatesCount, setDuplicatesCount] = useState(0)
  // B33: заканчивается место хотя бы в одном хранилище — для треугольника на
  // иконке «Настройки». Тоже только для администратора (эндпоинт под IsAdmin).
  const [storageLow, setStorageLow] = useState(false)

  // Перечитать компанию (напр. после смены лого) — чтобы обновить rail и
  // карточку Настроек без полной перезагрузки страницы.
  const refresh = useCallback(() => apiGet('/api/company/').then(setCompany), [])

  // B12: перечитать счётчик дублей (после объединения/пометки «не дубль» или
  // создания нового сотрудника). Тихо игнорируем ошибки (не критично для UI).
  const refreshDuplicates = useCallback(() => {
    if (user?.role !== 'admin') {
      setDuplicatesCount(0)
      return Promise.resolve()
    }
    return apiGet('/api/employees/duplicates-count/')
      .then((data) => setDuplicatesCount(data?.count ?? 0))
      .catch(() => {})
  }, [user])

  useEffect(() => {
    if (!user) {
      setCompany(null)
      setDuplicatesCount(0)
      setStorageLow(false)
      return
    }
    let cancelled = false
    apiGet('/api/company/').then((data) => {
      if (!cancelled) setCompany(data)
    })
    if (user.role === 'admin') {
      apiGet('/api/employees/duplicates-count/')
        .then((data) => {
          if (!cancelled) setDuplicatesCount(data?.count ?? 0)
        })
        .catch(() => {})
      // B33: свободное место опрашиваем один раз при входе (опрос S3 на бэке
      // кэшируется) — этого достаточно для треугольника-предупреждения.
      apiGet('/api/company/storage-space/')
        .then((data) => {
          if (!cancelled) setStorageLow(Boolean(data?.low))
        })
        .catch(() => {})
    }
    return () => {
      cancelled = true
    }
  }, [user])

  return (
    <CompanyContext.Provider value={{ company, refresh, duplicatesCount, refreshDuplicates, storageLow }}>
      {children}
    </CompanyContext.Provider>
  )
}

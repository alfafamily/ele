import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { apiGet } from '../shared/api/client'
import { useAuth } from './AuthContext'

const CompanyContext = createContext(null)

// Название + лого для навигации (§8.5) — видно любой аутентифицированной
// роли, в отличие от полной карточки Настройки → Компания (только Admin).
export function CompanyProvider({ children }) {
  const { user } = useAuth()
  const [company, setCompany] = useState(null)

  // Перечитать компанию (напр. после смены лого) — чтобы обновить rail и
  // карточку Настроек без полной перезагрузки страницы.
  const refresh = useCallback(() => apiGet('/api/company/').then(setCompany), [])

  useEffect(() => {
    if (!user) {
      setCompany(null)
      return
    }
    let cancelled = false
    apiGet('/api/company/').then((data) => {
      if (!cancelled) setCompany(data)
    })
    return () => {
      cancelled = true
    }
  }, [user])

  return <CompanyContext.Provider value={{ company, refresh }}>{children}</CompanyContext.Provider>
}

export function useCompany() {
  return useContext(CompanyContext)?.company ?? null
}

export function useRefreshCompany() {
  return useContext(CompanyContext)?.refresh
}

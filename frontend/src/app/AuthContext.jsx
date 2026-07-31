import { createContext, useContext } from 'react'

// Контекст аутентификации + хук-потребитель. Провайдер вынесен в AuthProvider.jsx,
// чтобы этот модуль экспортировал только не-компоненты (не ломает React Fast Refresh).
export const AuthContext = createContext(null)

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth должен использоваться внутри AuthProvider')
  return ctx
}

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { apiGet, apiPost, ApiError } from '../shared/api/client'

const AuthContext = createContext(null)

// Состояние, нужное guard'у роутера ДО того, как решать, что рендерить:
// какой первый экран (Setup Wizard/логин/приложение) и какие способы входа
// сейчас активны (Яндекс ID/капча условны по .env).
export function AuthProvider({ children }) {
  const [bootstrap, setBootstrap] = useState(null)
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const boot = await apiGet('/api/auth/bootstrap/')
      setBootstrap(boot)
      if (!boot.setup_required) {
        try {
          const me = await apiGet('/api/auth/me/')
          setUser(me)
        } catch (err) {
          if (err instanceof ApiError && err.status === 403) {
            setUser(null)
          } else {
            throw err
          }
        }
      } else {
        setUser(null)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  // Перечитать только текущего пользователя (напр. после смены ФИО/аватара
  // связанного Сотрудника) — без переключения глобального loading, чтобы не
  // мигал экран-загрузчик роутера.
  const refreshUser = useCallback(async () => {
    try {
      const me = await apiGet('/api/auth/me/')
      setUser(me)
    } catch {
      /* молча — гость останется как есть, роль решит guard */
    }
  }, [])

  const login = useCallback(async (email, password, captchaToken) => {
    const me = await apiPost('/api/auth/login/', { email, password, captcha_token: captchaToken || '' })
    setUser(me)
    return me
  }, [])

  const logout = useCallback(async () => {
    await apiPost('/api/auth/logout/')
    setUser(null)
    await refresh()
  }, [refresh])

  const completeSetup = useCallback(async () => {
    // SetupCompleteView сам логинит нового администратора сессией — просто
    // подтягиваем состояние заново, отдельного login() не нужно.
    await refresh()
  }, [refresh])

  const value = useMemo(
    () => ({ bootstrap, user, loading, login, logout, refresh, refreshUser, completeSetup, setUser }),
    [bootstrap, user, loading, login, logout, refresh, refreshUser, completeSetup]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth должен использоваться внутри AuthProvider')
  return ctx
}

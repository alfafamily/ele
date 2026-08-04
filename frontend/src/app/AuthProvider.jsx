import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiGet, apiPost, ApiError } from '../shared/api/client'
import { AuthContext } from './AuthContext'

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

  // B41-фикс: любой запрос, вернувший 401/403 (кроме auth-эндпоинтов), шлёт
  // событие ele:auth-check. Если мы считаем себя авторизованными — перепроверяем
  // сессию свежим /api/auth/me/: 401/403 → сессия истекла, сбрасываем user
  // (guard роутера сам перекинет на /login). Успех → это был обычный «доступ
  // запрещён» при живой сессии, ничего не делаем. Одновременные проверки гасим.
  useEffect(() => {
    if (!user) return undefined
    let checking = false
    const onAuthCheck = async () => {
      if (checking) return
      checking = true
      try {
        await apiGet('/api/auth/me/')
      } catch (err) {
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
          setUser(null)
        }
      } finally {
        checking = false
      }
    }
    window.addEventListener('ele:auth-check', onAuthCheck)
    return () => window.removeEventListener('ele:auth-check', onAuthCheck)
  }, [user])

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

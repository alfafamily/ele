// Единый API-клиент: cookie-сессия + CSRF-заголовок, разбор формата ошибок
// {"detail": "..."} / {"errors": {"поле": ["..."]}} (ТЗ §8.7).

function readCookie(name) {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : null
}

export class ApiError extends Error {
  constructor(status, data) {
    super(data?.detail || 'Ошибка запроса')
    this.status = status
    this.detail = data?.detail || null
    this.errors = data?.errors || null
    this.data = data || {}
  }
}

let csrfReady = null

// CSRF-cookie появляется только после первого GET — гарантируем это перед
// первым небезопасным запросом (login/register и т.п.), не заставляя каждый
// экран помнить об этом самому.
async function ensureCsrfCookie() {
  if (readCookie('csrftoken')) return
  if (!csrfReady) {
    csrfReady = fetch('/api/auth/csrf/', { credentials: 'include' }).catch(() => {})
  }
  await csrfReady
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

export async function apiRequest(path, { method = 'GET', body, signal } = {}) {
  const upperMethod = method.toUpperCase()
  if (!SAFE_METHODS.has(upperMethod)) {
    await ensureCsrfCookie()
  }

  const headers = {}
  const isFormData = body instanceof FormData
  if (body !== undefined && !isFormData) {
    headers['Content-Type'] = 'application/json'
  }
  const csrftoken = readCookie('csrftoken')
  if (csrftoken && !SAFE_METHODS.has(upperMethod)) {
    headers['X-CSRFToken'] = csrftoken
  }

  const response = await fetch(path, {
    method: upperMethod,
    headers,
    credentials: 'include',
    body: body === undefined ? undefined : isFormData ? body : JSON.stringify(body),
    signal,
  })

  if (response.status === 204) return null

  let data = null
  const text = await response.text()
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = null
    }
  }

  if (!response.ok) {
    throw new ApiError(response.status, data)
  }
  return data
}

export const apiGet = (path, opts) => apiRequest(path, { ...opts, method: 'GET' })
export const apiPost = (path, body, opts) => apiRequest(path, { ...opts, method: 'POST', body })
export const apiPatch = (path, body, opts) => apiRequest(path, { ...opts, method: 'PATCH', body })
export const apiDelete = (path, opts) => apiRequest(path, { ...opts, method: 'DELETE' })

// Единый API-клиент: cookie-сессия + CSRF-заголовок, разбор формата ошибок
// {"detail": "..."} / {"errors": {"поле": ["..."]}}.

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

// B56-R2 (#7): таймаут запроса — зависший бэкенд не должен оставлять вечный
// спиннер. Ограничиваем ТОЛЬКО обычные JSON-чтения/записи; загрузки файлов
// (FormData) и осознанно долгие операции (создание бэкапа, тяжёлые отчёты)
// вызывают apiRequest с `timeout: null` и не обрываются на полпути.
const DEFAULT_TIMEOUT_MS = 30000
// Синтетический код таймаута (реального HTTP-ответа нет). Отличим от сетевой
// ошибки, чтобы показать понятное сообщение вместо «Ошибка запроса».
const TIMEOUT_STATUS = 0
const TIMEOUT_MESSAGE = 'Превышено время ожидания ответа сервера. Попробуйте повторить.'

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

// `timeout`: миллисекунды до обрыва запроса. По умолчанию DEFAULT_TIMEOUT_MS
// для обычных запросов и НЕ применяется к загрузкам (FormData). `null`/`0`
// отключают таймаут явно (долгие операции — бэкап, отчёты).
export async function apiRequest(path, { method = 'GET', body, signal, timeout } = {}) {
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

  // Загрузки файлов по умолчанию без таймаута (медленная выгрузка большого файла
  // не должна рваться); всё остальное — DEFAULT_TIMEOUT_MS, если не задано явно.
  const effectiveTimeout =
    timeout !== undefined ? timeout : isFormData ? null : DEFAULT_TIMEOUT_MS

  // Внутренний контроллер обрывает запрос по таймауту и «подхватывает» внешний
  // signal вызывающего, чтобы работали оба (отмена компонентом И таймаут).
  const controller = new AbortController()
  let timedOut = false
  const timer =
    effectiveTimeout != null
      ? setTimeout(() => {
          timedOut = true
          controller.abort()
        }, effectiveTimeout)
      : null
  const onExternalAbort = () => controller.abort()
  if (signal) {
    if (signal.aborted) controller.abort()
    else signal.addEventListener('abort', onExternalAbort, { once: true })
  }

  let response
  try {
    response = await fetch(path, {
      method: upperMethod,
      headers,
      credentials: 'include',
      body: body === undefined ? undefined : isFormData ? body : JSON.stringify(body),
      signal: controller.signal,
    })
  } catch (err) {
    // Наш таймаут → понятная ошибка; аборт вызывающего/сетевой сбой → как есть.
    if (timedOut) throw new ApiError(TIMEOUT_STATUS, { detail: TIMEOUT_MESSAGE })
    throw err
  } finally {
    if (timer) clearTimeout(timer)
    if (signal) signal.removeEventListener('abort', onExternalAbort)
  }

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

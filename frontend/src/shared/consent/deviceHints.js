// B51-R2. Клиентские признаки устройства для слепка согласия — сервер их
// дополняет IP и разбором User-Agent (employees/consent.py capture_consent_snapshot).
// Те же поля, что для слепка при акцепте закреплений.
export function collectDeviceHints() {
  try {
    return {
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
      screen: `${window.screen?.width || 0}×${window.screen?.height || 0}`,
      language: navigator.language || '',
      platform: navigator.platform || '',
    }
  } catch {
    return {}
  }
}

import { useState } from 'react'
import { Button, Card } from '../../../shared/ui'
import { checkYandexId } from '../settingsApi.js'
import { sectionTitle, sectionHint, checkRow } from './helpers.js'
import { CheckResult, CheckSuccess } from './parts.jsx'

// Проверка входа через Яндекс ID — связь с приложением ЯндексOAuth.
export function YandexCard({ status }) {
  const [yandexResult, setYandexResult] = useState(null) // { ok, msg }
  const [yandexChecking, setYandexChecking] = useState(false)

  const runYandexCheck = async () => {
    setYandexChecking(true)
    setYandexResult(null)
    try {
      const data = await checkYandexId()
      setYandexResult({ ok: true, msg: data.detail })
    } catch (err) {
      setYandexResult({ ok: false, msg: err.detail || 'Проверка не пройдена.' })
    } finally {
      setYandexChecking(false)
    }
  }

  return (
    <Card style={{ flex: 1, minWidth: 0 }}>
      <div style={sectionTitle}>Проверка входа через Яндекс ID</div>
      <div style={sectionHint}>
        {status.yandex_id_configured
          ? 'Проверяется связь с приложением ЯндексOAuth.'
          : 'Параметры ЯндексOAuth не заданы в .env, использование ЯндексID невозможно'}
      </div>
      {status.yandex_id_configured ? (
        yandexResult?.ok ? (
          <CheckSuccess />
        ) : (
          <div style={checkRow}>
            <Button type="button" variant="secondary" loading={yandexChecking} onClick={runYandexCheck}>
              Выполнить проверку
            </Button>
            {yandexResult && !yandexResult.ok ? <CheckResult result={yandexResult} /> : null}
          </div>
        )
      ) : null}
    </Card>
  )
}

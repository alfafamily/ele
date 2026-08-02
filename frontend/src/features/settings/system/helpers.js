import { formatBytes } from '../../../shared/format.js'

// Общие стили секций системных настроек (были инлайн-константами в SystemTab).
export const sectionTitle = { fontSize: 15, fontWeight: 600, marginBottom: 4 }
export const sectionHint = { fontSize: 12, color: 'var(--color-text-placeholder)', marginBottom: 14 }
export const checkRow = { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }

export const normalizeIps = (list) => (list || []).map((e) => ({ ip: e.ip || '', note: e.note || '' }))

// B33: сведения о свободном месте внутри блока хранилища. Local — свободно/всего
// по разделу диска; S3 — занято, а «свободно» — только при заданной квоте (иначе
// «лимит не задан»).
export function spaceText(info) {
  if (info.kind === 'local') {
    return `Свободно ${formatBytes(info.free_bytes)} из ${formatBytes(info.total_bytes)}`
  }
  if (info.quota_bytes != null) {
    return `Занято ${formatBytes(info.used_bytes)} из ${formatBytes(info.quota_bytes)} · свободно ${formatBytes(info.free_bytes)}`
  }
  return `Занято ${formatBytes(info.used_bytes)} · лимит не задан`
}

// Рекомендации при неполучении письма/push — открываются кнопками «Письма нет»/
// «Push'a нет» рядом с проверками (согласовано с пользователем).
export const EMAIL_HELP = [
  'Проверьте папку «Спам» / «Нежелательная почта».',
  'Убедитесь, что в .env заданы и верны EMAIL_HOST, EMAIL_PORT, EMAIL_HOST_USER, EMAIL_HOST_PASSWORD.',
  'Проверьте, что адрес отправителя (DEFAULT_FROM_EMAIL) разрешён на почтовом сервере.',
  'Убедитесь, что исходящий порт SMTP не блокируется файрволом сервера.',
  'Некоторые почтовые провайдеры требуют отдельный «пароль приложения» вместо обычного.',
]
export const PUSH_HELP = [
  'Включите push\'и на проверяемом устройстве в разделе «Уведомления».',
  'Разрешите уведомления для сайта в браузере (значок настроек сайта в адресной строке).',
  'Проверьте, что push\'и не заблокированы в настройках устройства для браузера или PWA-приложения.',
  'На iPhone/iPad push работают только в приложении, добавленном на экран «Домой» через Safari.',
  'Проверьте, что в .env заданы VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY и VAPID_SUBJECT (валидный https:// или mailto:).',
  'Убедитесь, что у сервера есть доступ к push-сервисам (web.push.apple.com, fcm.googleapis.com).',
]

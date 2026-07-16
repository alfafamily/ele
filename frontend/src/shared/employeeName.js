// Инициалы для заглушки аватара сотрудника. Имя приходит в порядке
// «Фамилия Имя» (см. Employee.__str__), поэтому берём первые буквы первых двух
// слов → «ФИ». Для строки без пробела (например, e-mail в шапке) — первые две
// буквы, как раньше.
export function nameInitials(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}

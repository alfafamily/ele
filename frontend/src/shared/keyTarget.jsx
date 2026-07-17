// Отображение объекта доступа ключа: у ключа ровно один объект — одно место,
// одно помещение (с указанием здания в скобках) либо здание целиком. Для места
// в скобках показываем «здание — помещение» (место вложено в помещение).

// Объект-цель ключа: { name, scope } — name это место/помещение, scope — текст
// в скобках (здание, а для места ещё и помещение). Возвращает null для «здание
// целиком».
function keyTargetParts(pass) {
  const b = (pass.buildings || [])[0]
  if (!b) return { name: null, scope: null }
  const p = (pass.places || [])[0]
  if (p) return { name: p.name, scope: p.room_name ? `${b.name} — ${p.room_name}` : b.name }
  const r = (pass.rooms || [])[0]
  if (r) return { name: r.name, scope: b.name }
  return { name: null, scope: b.name } // всё здание
}

// Плоская строка (для заголовков вкладок, aria и т.п.).
export function keyTargetText(pass) {
  const { name, scope } = keyTargetParts(pass)
  if (scope === null) return '—'
  return name ? `${name} (${scope})` : scope
}

// JSX-версия: контекст в скобках — бледным нежирным текстом (как перечень
// помещений у пропусков).
export function KeyTarget({ pass }) {
  const { name, scope } = keyTargetParts(pass)
  if (scope === null) return '—'
  if (!name) return scope
  return (
    <>
      {name} <span className="ele-key-building">({scope})</span>
    </>
  )
}

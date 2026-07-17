// Отображение объекта доступа ключа: у ключа ровно один объект — одно место,
// одно помещение (с указанием здания в скобках) либо здание целиком.

// Плоская строка (для заголовков вкладок, aria и т.п.).
export function keyTargetText(pass) {
  const b = (pass.buildings || [])[0]
  const p = (pass.places || [])[0]
  const r = (pass.rooms || [])[0]
  if (!b) return '—'
  const target = p ? p.name : r ? r.name : null
  return target ? `${target} (${b.name})` : b.name
}

// JSX-версия: здание в скобках — бледным нежирным текстом (как перечень
// помещений у пропусков).
export function KeyTarget({ pass }) {
  const b = (pass.buildings || [])[0]
  const p = (pass.places || [])[0]
  const r = (pass.rooms || [])[0]
  if (!b) return '—'
  const target = p ? p.name : r ? r.name : null
  if (!target) return b.name
  return (
    <>
      {target} <span className="ele-key-building">({b.name})</span>
    </>
  )
}

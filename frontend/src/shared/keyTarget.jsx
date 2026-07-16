// Отображение объекта доступа ключа: у ключа ровно один объект — одно помещение
// (с указанием здания в скобках) либо здание целиком.

// Плоская строка (для заголовков вкладок, aria и т.п.).
export function keyTargetText(pass) {
  const b = (pass.buildings || [])[0]
  const r = (pass.rooms || [])[0]
  if (!b) return '—'
  return r ? `${r.name} (${b.name})` : b.name
}

// JSX-версия: здание в скобках — бледным нежирным текстом (как перечень
// помещений у пропусков).
export function KeyTarget({ pass }) {
  const b = (pass.buildings || [])[0]
  const r = (pass.rooms || [])[0]
  if (!b) return '—'
  if (!r) return b.name
  return (
    <>
      {r.name} <span className="ele-key-building">({b.name})</span>
    </>
  )
}

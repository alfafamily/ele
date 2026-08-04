// B65. Единый словарь размещения имущества: иконка + короткая подпись для
// сегментированных контролов (модалки закрепления, страницы создания) и иконка +
// полный текст для колонки «Размещение» в списках и блока на карточке.
// Короткие подписи согласованы в бэклоге (B65): Сотрудник / РМ / МОП / Склад.
// Компонент-иконка живёт отдельно в PlacementIcon.jsx (Fast Refresh, см. B28).

// Для тогглов размещения (ModeToggle): { icon, label }.
export const PLACEMENT = {
  employee: { icon: 'user', label: 'Сотрудник' },
  workplace: { icon: 'monitor', label: 'РМ' },
  common: { icon: 'coffee', label: 'МОП' },
  storage: { icon: 'warehouse', label: 'Склад' },
}

// B71. Иконка пилюли «свободного» размещения (не привязано к оборудованию/
// сотруднику): E-SIM «Свободна», свободная лицензия, «Свободный» транспорт.
// Подпись у разных сущностей своя, иконка — единая (не привязано → unlink).
export const PLACEMENT_FREE_ICON = 'unlink'

// Для колонки «Размещение» и карточки: иконка + полный текст (тултип/подпись).
export const PLACE_TYPE_META = {
  workplace: { icon: 'monitor', title: 'На рабочем месте' },
  common: { icon: 'coffee', title: 'На месте общего пользования' },
  storage: { icon: 'warehouse', title: 'На складе' },
}

// Полный текст размещения по типу места (для подписи на карточке).
export function placementFullTitle(placeType) {
  return (PLACE_TYPE_META[placeType] || PLACE_TYPE_META.storage).title
}

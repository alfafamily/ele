# ELE UI-kit (`shared/ui`)

Канонический набор презентационных блоков дизайн-системы ELE. React 19 + CSS-переменные,
без UI-фреймворков. Живую витрину смотри в dev: **`/styleguide`** (только `import.meta.env.DEV`).

## Правила

- Импорт только из бочки: `import { Button, Badge } from 'shared/ui'` (файл `index.js`).
- Никаких хардкод-значений цвета/отступа/радиуса — только токены из
  `shared/theme/tokens.css` (см. легенду в `/styleguide`).
- Иконки — только через `<Icon name="…" />` (реестр `Icon/icons.js`), инлайн-SVG запрещены.
- Нейтральные плашки/счётчики — только `Badge` (не свой `span` на `--color-fill-active-tint`).
- Цветные семантические статусы — только `StatusPill`.

## Каталог

| Компонент | Назначение | Ключевые пропсы / варианты |
|---|---|---|
| `Button` | Кнопки действий | `variant` primary/secondary/danger, `loading`, `disabled`, `fullWidth` |
| `Input` | Поле ввода с плавающим лейблом | `label`, `error`, `helperText`, `showToggle`, `multiline`, `required` |
| `Select` | Нативный select в визуале Input | `label`, `value`, `onChange`, `error`, `placeholder` |
| `TypeSelect` | Выбор Вида поиском (сворачивается в строку) | `options`, `value`, `onChange`, `icon`, `error` |
| `PlaceSelect` | Выбор Места размещения (B8) | `type`, `value`, `onChange`, `freeMap`, `allowNone` |
| `DatePicker` / `InlineCalendar` | Выбор даты (поповер / встроенный) | `value`, `onChange`, `minDate`, `maxDate` |
| `Checkbox` | Булев переключатель | `label`, `checked`, `onChange`, `disabled` |
| `Segmented` | Сегмент-контрол 2–3 значений | `options`, `value`, `onChange`, `label` |
| `RadioPills` | Ряд radio-пилюль (фильтры) | `options`, `value`, `onChange` |
| `TabBar` | Вкладки / фильтр-чипы | `options`, `value`, `onChange`, `variant='filter'`, `size` |
| `SearchInput` | Поиск в шапках списков | `value`, `onChange`, `placeholder` |
| `Table` / `TableRow` | Табличные списки | `columns` (key/label/width/sortable), `sortKey`, `sortDir`, `onSort`, `fit` |
| `Card` | Белая карточка-блок | `className`, `children` |
| `Badge` | Нейтральная плашка/счётчик | `children`, `style` |
| `StatusPill` | Цветной статус | `variant` assigned/free/archived/warning/danger/role/meta/clip |
| `Banner` | Сводное сообщение над формой | `variant` error/warning/success/info |
| `EmptyState` | Пустое состояние списка | `icon`, `title`, `description`, `action` |
| `Spinner` / `Skeleton` | Индикаторы загрузки | `size` / `width`, `height` |
| `Modal` | Модалка (desktop-центр / mobile bottom-sheet) | `open`, `onClose`, `title` |
| `ConfirmModal` | Подтверждение обратимого действия | `title`, `message`, `confirmLabel`, `danger`, `onConfirm`, `onClose` |
| `FilterModal` | Кнопка «Фильтры» + модалка (черновик) | `value`, `count`, `onApply`, `onClear`, `isDraftActive`, render-prop |
| `MultiSelectList` | Мультивыбор для фильтров | `options`, `selected`, `onToggle`, `search`, `chips` |
| `FormActions` | Горизонтальный ряд действий формы | `onCancel`, `onSubmit`, `submitting`, `submitLabel`, `submitDisabled` |
| `ModalActions` | Вертикальный ряд действий модалки | `children` (кнопки), `style` |
| `ActionMenu` | Кнопка «…» с меню действий | `items` (label/onClick/danger/disabled/icon), `note`, `label`, `title` |
| `BackButton` | Кнопка-иконка «Назад» | `onClick` (по умолчанию `navigate(-1)`) |
| `Icon` | Единый рендер иконок (Lucide-реестр) | `name`, `size`, `strokeWidth`, `title` (a11y) |

`FilterButton/` — только общие CSS-стили для `FilterModal`/`MultiSelectList`, JSX-компонента нет.

Каждый компонент несёт JSDoc-шапку в своём файле — там нюансы поведения и когда применять.

## Блоки вне `shared/ui` (в `src/shared/*`)

Переиспользуемые блоки, не входящие в базовый UI-kit (завязаны на домен/данные ELE). Живая
витрина — секция «shared/*» в `/styleguide`. Тянущие бэк помечены (◇).

| Блок | Назначение | Ключевые пропсы | Данные |
|---|---|---|---|
| `EmployeePicker` | Подбор сотрудника с поиском | `onSelect`, `excludeIds`, `extraParams`, `withPlus`, `error` | ◇ `/api/employees/` |
| `EquipmentPicker` | Подбор оборудования с поиском | `onSelect`, `simOnly`, `licenseOnly`, `excludeIds`, `error` | ◇ `/api/equipment/` |
| `EmployeeMultiPicker` | Мультивыбор сотрудников (чипы) | `value` `[{id,label}]`, `onChange`, `extraParams` | ◇ (через пикер) |
| `EquipmentMultiPicker` | Мультивыбор оборудования (чипы) | `value` `[{id,label}]`, `onChange`, `licenseTypeIds` | ◇ (через пикер) |
| `SelectedEmployee` | Свёрнутый вид выбранного сотрудника | `employee`, `onClear` | чистый |
| `SelectedTransport` | Свёрнутый вид выбранного транспорта | `transport`, `onClear` | чистый |
| `AttachSelectModal` | Модалка «привязать свободный объект» | `title`, `fetchPath`, `match`, `renderRow`, `attach`, `empty`, `submitLabel` | ◇ `fetchPath` |
| `AvatarCircle` | Аватар сотрудника (фото/инициалы) | `avatar`, `name`, `size`, `status`, `tinted` | чистый |
| `LeadIconCircle` | Кружок-подложка ведущей иконки | `name`, `size`, `color`, `tinted`, `status` | чистый |
| `ModeToggle` | Переключатель режима размещения | `mode`, `onChange`, `options` `[{value,label,icon}]` | чистый |
| `PlacementRow` | Строка «Размещение/Закреплено за» | `circle`, `label`, `title`, `sub` | чистый |
| `PlacementIcon` | Иконка типа места с тултипом | `placeType`, `size` | чистый |
| `AcceptanceIcon` | Иконка статуса акцепта | `status`, `size`, `inline` | чистый |
| `Tooltip` | Кастомная всплывающая подсказка | `label`, `children`, `inline` | чистый |
| `TruncatedText` | Обрезка «…» + тултип полного текста | `text`, `singleLine`, `as`, `className` | чистый |
| `EmployeeNameCell` | Ячейка «сотрудник» в списках | `name`, `position`, `department`, `status` | чистый |
| `KeyTarget` | Объект доступа ключа (место+здание) | `pass` | чистый |
| `TransportParkingLine` | Строка состояния парковки транспорта | `parking` | чистый |
| `PlanLink` | Ссылка «План парковки» → просмотрщик | `file` `{url}` | чистый |
| `TypeFilesView` | Read-only список общих файлов Вида (B67) | `files` `[{id,file}]` | чистый |
| `TypeFilesPicker` | Мультивыбор общих файлов Вида (B67) | `available`, `selectedIds`, `onChange` | чистый |
| `DeviceSnapshotChip` | Плашка «Слепок устройства» (B32, ПДн) | `snapshot` | чистый (только staff) |
| `CustomFieldsEditor` | «Доп. поля» имя/значение + DnD-порядок | `items`, `onChange` | чистый |
| `RemoteMultiSelect` | Загрузка списка + мультивыбор (фильтры) | `endpoint`, `mapOption`, `selected`, `onChange`, `extraOptions` | ◇ `endpoint` |
| `TypeRequisiteFilter` | Фильтр «Вид + реквизиты» | `endpoint`, `valuesBase`, `types`, `onTypesChange`, `req`, `onReqChange` | ◇ виды/значения |
| `PassAccessFilter` | Фильтр «Доступ в помещения» | `buildings`, `rooms`, `places`, `onChange`, `objectType` | ◇ `/api/buildings/` |
| `RequisiteAutocompleteChips` | Чипсы + автоподсказка значений реквизита | `value`, `onChange`, `valuesUrl`, `numeric` | ◇ подсказки по вводу |
| `HistoryList` | Лента истории объекта | `path`, `reloadKey`, `maintenanceOnly` | ◇ `path` |
| `InfiniteScrollSentinel` | Наблюдатель нижнего края (догрузка) | `hasMore`, `loading`, `onLoadMore` | утилита |

Прочие модули `src/shared/*` — не компоненты (утилиты/хуки): `employeeName.js`, `format.js`,
`permissions.js`, `roles.js`, `placement.js`, `filterParams.js`, `formErrors.js`, `listCache.js`,
`keyboardViewport.js`, каталоги `api/`, `hooks/`, `eav/`, `consent/`, `maintenance/`.

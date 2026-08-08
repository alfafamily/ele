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

/*
  Каталог дизайн-токенов для dev-styleguide (B10). Значения дублируют
  frontend/src/shared/theme/tokens.css 1:1 — это ЕДИНСТВЕННЫЙ источник токенов,
  здесь лишь описания для наглядной легенды. При правке tokens.css синхронизируй.
  Файл импортируется только под import.meta.env.DEV, в прод-бандл не попадает.
*/

export const COLOR_GROUPS = [
  {
    title: 'Текст',
    tokens: [
      ['--color-text-primary', '#1C1C21', 'Основной текст, заголовки, primary-фон'],
      ['--color-text-secondary', '#363642', 'Вторичный текст, тело абзацев'],
      ['--color-text-muted', '#757784', 'Приглушённый текст, подписи'],
      ['--color-text-placeholder', '#9FA2B2', 'Плейсхолдеры, подписи полей'],
    ],
  },
  {
    title: 'Фон и поверхности',
    tokens: [
      ['--color-bg-app', '#E6E9F2', 'Фон приложения (за рабочей областью)'],
      ['--color-bg-workspace', '#F2F4FA', 'Фон рабочей области/сцены'],
      ['--color-surface', '#FFFFFF', 'Карточки, модалки, поля'],
      ['--color-fill-input', '#F1F2F7', 'Заливка полей ввода, неактивных сегментов'],
      ['--color-fill-active-tint', '#EDEFF7', 'Ховер-заливка строк/кнопок'],
    ],
  },
  {
    title: 'Границы',
    tokens: [
      ['--color-border', '#E6E9F2', 'Базовая граница карточек/полей'],
      ['--color-border-strong', '#D8DAE3', 'Усиленная граница'],
      ['--color-border-hairline', '#F2F4FA', 'Тонкий разделитель'],
    ],
  },
  {
    title: 'Бренд / primary',
    tokens: [
      ['--color-primary', '#1C1C21', 'Основные кнопки, активные сегменты'],
      ['--color-primary-text', '#FFFFFF', 'Текст на primary-фоне'],
      ['--color-brand-accent', '#FF6A00', 'Акцент бренда'],
    ],
  },
  {
    title: 'Статусы',
    tokens: [
      ['--color-error', '#E53E3E', 'Ошибка (текст/иконка)'],
      ['--color-error-bg', '#FFEFEB', 'Фон ошибки (баннер)'],
      ['--color-error-border', '#F3D2CE', 'Граница ошибки'],
      ['--color-success', '#1E9E57', 'Успех / «Закреплено»'],
      ['--color-success-bg', '#EAF7EF', 'Фон успеха'],
      ['--color-info', '#2F6BE6', 'Инфо / «Свободно»'],
      ['--color-info-bg', '#E8F1FF', 'Фон инфо'],
      ['--color-warning', '#B7791F', 'Предупреждение'],
      ['--color-warning-bg', '#FFF7ED', 'Фон предупреждения'],
      ['--color-warning-bg-alt', '#FBF1DF', 'Альт. фон предупреждения'],
    ],
  },
  {
    title: 'Бейджи и пилюли',
    tokens: [
      ['--color-badge-bg', '#D4D9E8', 'Фон нейтрального Badge'],
      ['--color-badge-text', '#4C4F5E', 'Текст нейтрального Badge'],
      ['--color-role-admin-text', '#6B46C1', 'Текст бейджа «Администратор»'],
      ['--color-role-admin-bg', '#F0EBFF', 'Фон бейджа «Администратор»'],
    ],
  },
]

export const TYPOGRAPHY = [
  ['--font-size-h1', '28px', 'Заголовок экрана (H1)'],
  ['--font-size-section-title', '24px', 'Заголовок раздела'],
  ['--font-size-block-title', '16px', 'Заголовок блока (desktop)'],
  ['--font-size-block-title-mobile', '14px', 'Заголовок блока (mobile)'],
  ['--font-size-field-value', '15px', 'Значение поля'],
  ['--font-size-body', '14px', 'Основной текст'],
  ['--font-size-field-label', '12px', 'Подпись поля'],
  ['--font-size-micro', '12px', 'Микротекст'],
  ['--font-size-min-desktop', '11px', 'Минимальный размер (бейджи)'],
]

export const SPACING = [
  ['--spacing-card-padding', '20px', 'Внутренний отступ карточки (desktop)'],
  ['--spacing-card-padding-mobile', '16px', 'Внутренний отступ карточки (mobile)'],
  ['--spacing-block-gap', '16px', 'Промежуток между блоками'],
  ['--control-height', '44px', 'Высота контролов (desktop)'],
  ['--control-height-mobile', '48px', 'Высота контролов (mobile)'],
]

export const RADII = [
  ['--radius-chip', '8px', 'Чипы, сегменты'],
  ['--radius-control', '10px', 'Кнопки, поля'],
  ['--radius-card-mobile', '14px', 'Карточка (mobile)'],
  ['--radius-card', '16px', 'Карточка (desktop)'],
  ['--radius-pill', '20px', 'Пилюли, бейджи'],
  ['--radius-frame', '20px', 'Внешняя рамка/экран'],
  ['--radius-frame-mobile', '34px', 'Внешняя рамка (mobile)'],
  ['--radius-avatar', '50%', 'Аватары, круглые иконки'],
]

export const SHADOWS = [
  ['--shadow-screen-card', '0 20px 50px -22px rgba(28,28,33,.32)', 'Экран-карточка'],
  ['--shadow-block', '0 16px 40px -20px rgba(28,28,33,.26)', 'Блок/выпадающее меню'],
  ['--shadow-modal', '0 24px 60px -12px rgba(0,0,0,.4)', 'Модальное окно'],
]

// z-index в проекте заданы литералами в CSS-компонентов (не токены). Сведено
// для документации де-факто шкалы — при добавлении слоёв держись этих ярусов.
export const Z_INDEX = [
  ['40', 'AppLayout — верхняя панель / rail'],
  ['50', 'Выпадающие меню (ActionMenu, FilterButton, настройки)'],
  ['60–61', 'Мобильное меню/оверлеи AppLayout, календарь DatePicker'],
  ['1000', 'Modal (оверлей + окно)'],
  ['1100', 'FilePreviewModal (поверх обычной модалки)'],
]

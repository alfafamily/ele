import { useState } from 'react'
import {
  ActionMenu,
  BackButton,
  Badge,
  Banner,
  Button,
  Card,
  Checkbox,
  ConfirmModal,
  DatePicker,
  EmptyState,
  FilterModal,
  FormActions,
  Icon,
  Input,
  InlineCalendar,
  Modal,
  ModalActions,
  MultiSelectList,
  RadioPills,
  SearchInput,
  Segmented,
  Select,
  Skeleton,
  Spinner,
  StatusPill,
  TabBar,
  Table,
  TableRow,
} from '../../shared/ui'
import { icons } from '../../shared/ui/Icon/icons.js'
import { COLOR_GROUPS, RADII, SHADOWS, SPACING, TYPOGRAPHY, Z_INDEX } from './tokenData.js'
import './styleguide.css'

// ─────────────────────────────────────────────────────────────────────────────
// Dev-only styleguide (B10). Живая витрина дизайн-системы ELE: токены + все
// канонические блоки shared/ui во всех состояниях + реестр иконок. Подключается
// исключительно под import.meta.env.DEV в AppRoutes → в прод-бандл не попадает.
// Тексты страницы — dev-инструмент, свободны (не пользовательские UI-строки).
// ─────────────────────────────────────────────────────────────────────────────

function Demo({ title, desc, col, children }) {
  return (
    <div className="sg-demo">
      <div className="sg-demo__title">{title}</div>
      {desc ? <div className="sg-demo__desc">{desc}</div> : null}
      <div className={'sg-demo__stage' + (col ? ' sg-demo__stage--col' : '')}>{children}</div>
    </div>
  )
}

function Label({ children }) {
  return <div className="sg-demo__label">{children}</div>
}

// ── Токены ───────────────────────────────────────────────────────────────────

function TokensSection() {
  return (
    <section id="tokens" className="sg__section">
      <h2 className="sg__h2">Токены</h2>
      <p className="sg__lead">
        Единый источник — <code>frontend/src/shared/theme/tokens.css</code>. Все цвета, отступы,
        типографика, радиусы и тени заданы CSS-переменными <code>:root</code>. Ниже — визуальная
        легенда. Не хардкодь значения в компонентах — ссылайся на токены.
      </p>

      <h3 className="sg__h3">Цвета</h3>
      {COLOR_GROUPS.map((g) => (
        <div key={g.title} style={{ marginBottom: 18 }}>
          <div className="sg-demo__label" style={{ marginBottom: 8 }}>{g.title}</div>
          <div className="sg-swatches">
            {g.tokens.map(([name, val, desc]) => (
              <div key={name} className="sg-swatch" title={desc}>
                <div className="sg-swatch__chip" style={{ background: `var(${name})` }} />
                <div className="sg-swatch__meta">
                  <div className="sg-swatch__name">{name}</div>
                  <div className="sg-swatch__val">{val}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      <h3 className="sg__h3">Типографика</h3>
      <p className="sg__lead" style={{ marginBottom: 12 }}>
        Шрифты: <code>--font-ui</code> (Golos Text) для интерфейса, <code>--font-mono</code>
        {' '}(JetBrains Mono) для номеров/кода.
      </p>
      <Card>
        {TYPOGRAPHY.map(([name, val, desc]) => (
          <div key={name} style={{ display: 'flex', alignItems: 'baseline', gap: 16, padding: '8px 0', borderBottom: '1px solid var(--color-border-hairline)' }}>
            <span style={{ fontSize: `var(${name})`, fontWeight: 600, minWidth: 260 }}>Съешь ещё этих булочек</span>
            <span className="sg-swatch__name">{name}</span>
            <span className="sg-swatch__val">{val} — {desc}</span>
          </div>
        ))}
      </Card>

      <h3 className="sg__h3">Отступы и размеры</h3>
      <div className="sg-scale">
        {SPACING.map(([name, val, desc]) => (
          <div key={name} className="sg-scale__row">
            <span className="sg-scale__name">{name}</span>
            <span className="sg-scale__bar" style={{ width: val }} />
            <span className="sg-scale__val">{val} — {desc}</span>
          </div>
        ))}
      </div>

      <h3 className="sg__h3">Радиусы</h3>
      <div className="sg-radii">
        {RADII.map(([name, val, desc]) => (
          <div key={name} title={desc}>
            <div className="sg-radii__box" style={{ borderRadius: `var(${name})` }} />
            <div className="sg-swatch__name" style={{ marginTop: 6 }}>{name}</div>
            <div className="sg-swatch__val">{val}</div>
          </div>
        ))}
      </div>

      <h3 className="sg__h3">Тени</h3>
      <div className="sg-swatches">
        {SHADOWS.map(([name, val, desc]) => (
          <div key={name} title={desc} style={{ padding: 20 }}>
            <div className="sg-shadow" style={{ boxShadow: `var(${name})` }} />
            <div className="sg-swatch__name" style={{ marginTop: 12 }}>{name}</div>
            <div className="sg-swatch__val">{val}</div>
          </div>
        ))}
      </div>

      <h3 className="sg__h3">z-index (де-факто шкала)</h3>
      <p className="sg__lead" style={{ marginBottom: 12 }}>
        z-index заданы литералами в CSS компонентов, не токенами. Держись этих ярусов при
        добавлении новых слоёв.
      </p>
      <Card>
        {Z_INDEX.map(([z, desc]) => (
          <div key={z} style={{ display: 'flex', gap: 16, padding: '6px 0' }}>
            <span className="sg-swatch__name" style={{ minWidth: 80 }}>{z}</span>
            <span className="sg-swatch__val">{desc}</span>
          </div>
        ))}
      </Card>
    </section>
  )
}

// ── Компоненты ───────────────────────────────────────────────────────────────

function ComponentsSection() {
  const [text, setText] = useState('')
  const [err, setErr] = useState('Поле заполнено неверно')
  const [checked, setChecked] = useState(true)
  const [seg, setSeg] = useState('sim')
  const [pill, setPill] = useState('all')
  const [tab, setTab] = useState('active')
  const [selectVal, setSelectVal] = useState('')
  const [date, setDate] = useState('')
  const [search, setSearch] = useState('')
  const [multi, setMulti] = useState(['a'])
  const [modalOpen, setModalOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [filterVal] = useState({})

  const cols = [
    { key: 'name', label: 'Наименование', width: '1fr', sortable: true },
    { key: 'status', label: 'Статус', width: '160px' },
  ]

  return (
    <section id="components" className="sg__section">
      <h2 className="sg__h2">Компоненты</h2>
      <p className="sg__lead">
        Канонический набор <code>shared/ui</code>. Импорт — только из бочки{' '}
        <code>shared/ui</code>: <code>{'import { Button } from \'../../shared/ui\''}</code>. Каждый
        блок показан в ключевых состояниях/вариантах.
      </p>

      <Demo title="Button" desc="Варианты primary / secondary / danger. Состояния: default, loading, disabled, fullWidth.">
        <Label>Варианты</Label>
        <Button>Основная</Button>
        <Button variant="secondary">Вторичная</Button>
        <Button variant="danger">Опасная</Button>
        <Label>Состояния</Label>
        <Button loading>Загрузка</Button>
        <Button disabled>Отключена</Button>
        <div style={{ width: '100%' }}>
          <Button fullWidth>fullWidth</Button>
        </div>
      </Demo>

      <Demo title="Input" desc="Плавающий лейбл, ошибка под полем, helperText, showToggle (пароль), multiline." col>
        <Input label="Наименование" value={text} onChange={(e) => setText(e.target.value)} />
        <Input label="Обязательное" required helperText="Подсказка под полем" />
        <Input label="С ошибкой" value="" error={err} onChange={() => setErr('Поле заполнено неверно')} />
        <Input label="Пароль" showToggle />
        <Input label="Комментарий" multiline rows={3} />
      </Demo>

      <Demo title="Select" desc="Нативный select в визуале Input — для простых перечислений." col>
        <Select label="Роль" value={selectVal} onChange={(e) => setSelectVal(e.target.value)} placeholder="Выберите">
          <option value="admin">Администратор</option>
          <option value="viewer">Наблюдатель</option>
        </Select>
        <Select label="С ошибкой" error="Выберите значение">
          <option value="">—</option>
        </Select>
      </Demo>

      <Demo title="Checkbox / Segmented / RadioPills" desc="Переключатели: булев чекбокс, сегмент-контрол (2–3 значения), ряд radio-пилюль для фильтров.">
        <div style={{ width: '100%' }}>
          <Checkbox label="Согласие получено" checked={checked} onChange={setChecked} />
          <Checkbox label="Отключён" checked={false} onChange={() => {}} disabled />
        </div>
        <div style={{ width: 260 }}>
          <Segmented
            label="Тип связи"
            value={seg}
            onChange={setSeg}
            options={[{ value: 'sim', label: 'SIM' }, { value: 'esim', label: 'E-SIM' }]}
          />
        </div>
        <div style={{ width: '100%' }}>
          <Label>RadioPills</Label>
          <RadioPills
            value={pill}
            onChange={setPill}
            options={[{ value: 'all', label: 'Все' }, { value: 'assigned', label: 'Закреплённые' }, { value: 'free', label: 'Свободные' }]}
          />
        </div>
      </Demo>

      <Demo title="TabBar" desc="variant по умолчанию — вкладки (Активные/Архив); variant='filter' — фильтр-чипы.">
        <TabBar value={tab} onChange={setTab} options={[{ value: 'active', label: 'Работают' }, { value: 'archive', label: 'Уволены' }]} />
        <TabBar variant="filter" value={pill} onChange={setPill} options={[{ value: 'all', label: 'Все' }, { value: 'assigned', label: 'Закреплённое' }, { value: 'free', label: 'Свободное' }]} />
      </Demo>

      <Demo title="Badge / StatusPill" desc="Badge — нейтральная серо-синяя плашка (счётчики/этаж/«Архив»). StatusPill — цветные семантические статусы.">
        <Label>Badge</Label>
        <Badge>12</Badge>
        <Badge>Этаж 3</Badge>
        <Badge>Реквизиты: 4</Badge>
        <Label>StatusPill</Label>
        <StatusPill variant="assigned">Закреплено</StatusPill>
        <StatusPill variant="free">Свободное</StatusPill>
        <StatusPill variant="archived">Списано</StatusPill>
        <StatusPill variant="warning">Внимание</StatusPill>
        <StatusPill variant="danger">Утилизировано</StatusPill>
        <StatusPill variant="role">Администратор</StatusPill>
        <StatusPill variant="meta">Meta</StatusPill>
        <StatusPill variant="clip">Clip</StatusPill>
      </Demo>

      <Demo title="Banner" desc="Сводное сообщение над формой. Варианты error / warning / success / info." col>
        <Banner variant="error">Не удалось сохранить: проверьте выделенные поля.</Banner>
        <Banner variant="warning">Действие необратимо.</Banner>
        <Banner variant="success">Изменения сохранены.</Banner>
        <Banner variant="info">Если аккаунт существует, письмо отправлено.</Banner>
      </Demo>

      <Demo title="Card" desc="Базовая белая поверхность-блок." col>
        <Card>Содержимое карточки-блока «Основная информация».</Card>
      </Demo>

      <Demo title="SearchInput" desc="Поле поиска в шапках списков." col>
        <SearchInput value={search} onChange={setSearch} placeholder="Поиск по наименованию" />
      </Demo>

      <Demo title="DatePicker / InlineCalendar" desc="Выбор даты (поповер) и встроенный календарь.">
        <div style={{ width: 260 }}>
          <DatePicker label="Дата ТО" value={date} onChange={setDate} />
        </div>
        <InlineCalendar value={date} onChange={setDate} />
      </Demo>

      <Demo title="Table" desc="Табличные списки: columns описывают и заголовок, и разметку строк.">
        <div style={{ width: '100%' }}>
          <Table columns={cols} sortKey="name" sortDir="asc" onSort={() => {}}>
            <TableRow columns={cols}>
              <div>Ноутбук Lenovo</div>
              <div><StatusPill variant="assigned">Закреплено</StatusPill></div>
            </TableRow>
            <TableRow columns={cols}>
              <div>Монитор Dell</div>
              <div><StatusPill variant="free">Свободное</StatusPill></div>
            </TableRow>
          </Table>
        </div>
      </Demo>

      <Demo title="MultiSelectList" desc="Мультивыбор для модалки фильтров (чек-лист или режим чипсов).">
        <div style={{ width: '100%', maxWidth: 360 }}>
          <MultiSelectList
            search
            options={[{ value: 'a', label: 'Ноутбуки' }, { value: 'b', label: 'Мониторы' }, { value: 'c', label: 'Телефоны' }]}
            selected={multi}
            onToggle={(v) => setMulti((s) => (s.includes(v) ? s.filter((x) => x !== v) : [...s, v]))}
          />
        </div>
      </Demo>

      <Demo title="EmptyState" desc="Пустое состояние списка: иконка + заголовок + описание + опциональный CTA." col>
        <EmptyState
          icon={<Icon name="search" size={40} strokeWidth={1.4} />}
          title="Ничего не найдено"
          description="Измените запрос или сбросьте фильтры."
          action={<Button variant="secondary">Сбросить фильтры</Button>}
        />
      </Demo>

      <Demo title="Spinner / Skeleton" desc="Индикаторы загрузки: кольцо (bootstrap/секции) и плейсхолдер-строки списка.">
        <Spinner />
        <div style={{ flex: 1, minWidth: 220, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Skeleton width="70%" />
          <Skeleton width="90%" />
          <Skeleton width="50%" />
        </div>
      </Demo>

      <Demo title="FormActions / ModalActions" desc="FormActions — горизонтальный ряд под формой. ModalActions — вертикальный ряд действий в модалке (основная кнопка + «Отмена»).">
        <div style={{ flex: 1, minWidth: 280 }}>
          <Label>FormActions</Label>
          <FormActions onCancel={() => {}} onSubmit={() => {}} submitLabel="Сохранить" />
        </div>
        <div style={{ width: 260 }}>
          <Label>ModalActions</Label>
          <ModalActions>
            <Button variant="danger" fullWidth>Утилизировать</Button>
            <Button variant="secondary" fullWidth>Отмена</Button>
          </ModalActions>
        </div>
      </Demo>

      <Demo title="ActionMenu" desc="Кнопка «…» с меню действий (desktop — dropdown, mobile — bottom-sheet).">
        <ActionMenu
          items={[
            { label: 'Редактировать', icon: 'pencil-sparkles', onClick: () => {} },
            { label: 'Открепить', icon: 'unlink', onClick: () => {} },
            { label: 'Удалить', icon: 'trash-2', danger: true, onClick: () => {} },
          ]}
        />
      </Demo>

      <Demo title="BackButton" desc="Кнопка-иконка «Назад» в шапках вложенных экранов.">
        <BackButton onClick={() => {}} />
      </Demo>

      <Demo title="Modal / ConfirmModal / FilterModal" desc="Модальные окна (по центру на desktop, bottom-sheet на mobile). Откройте, чтобы посмотреть.">
        <Button variant="secondary" onClick={() => setModalOpen(true)}>Открыть Modal</Button>
        <Button variant="secondary" onClick={() => setConfirmOpen(true)}>Открыть ConfirmModal</Button>
        <FilterModal value={filterVal} count={2} onApply={() => {}} onClear={() => {}} isDraftActive={() => true}>
          {(draft, setDraft) => (
            <RadioPills
              value={draft.status || 'all'}
              onChange={(v) => setDraft({ ...draft, status: v })}
              options={[{ value: 'all', label: 'Все' }, { value: 'free', label: 'Свободные' }]}
            />
          )}
        </FilterModal>
        {modalOpen ? (
          <Modal open onClose={() => setModalOpen(false)} title="Пример модалки">
            <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
              Контент модального окна. На мобильных превращается в bottom-sheet.
            </p>
            <ModalActions>
              <Button fullWidth onClick={() => setModalOpen(false)}>Готово</Button>
              <Button variant="secondary" fullWidth onClick={() => setModalOpen(false)}>Отмена</Button>
            </ModalActions>
          </Modal>
        ) : null}
        {confirmOpen ? (
          <ConfirmModal
            title="Открепить объект?"
            message="Действие обратимо: объект вернётся в список свободных."
            confirmLabel="Открепить"
            onConfirm={async () => {}}
            onClose={() => setConfirmOpen(false)}
          />
        ) : null}
      </Demo>
    </section>
  )
}

// ── Иконки ───────────────────────────────────────────────────────────────────

function IconsSection() {
  const names = Object.keys(icons).sort()
  return (
    <section id="icons" className="sg__section">
      <h2 className="sg__h2">Иконки</h2>
      <p className="sg__lead">
        Единый реестр <code>shared/ui/Icon/icons.js</code> ({names.length} шт., Lucide-обводка
        24×24). Рендер только через <code>{'<Icon name="…" />'}</code>; инлайн-SVG запрещены.
      </p>
      <div className="sg-icons">
        {names.map((name) => (
          <div key={name} className="sg-icon">
            <Icon name={name} size={24} />
            <span className="sg-icon__name">{name}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

export function StyleguidePage() {
  return (
    <div className="sg">
      <div className="sg__bar">
        <div className="sg__brand">
          ELE UI-kit
          <small>dev styleguide · B10</small>
        </div>
        <nav className="sg__nav">
          <a href="#tokens">Токены</a>
          <a href="#components">Компоненты</a>
          <a href="#icons">Иконки</a>
        </nav>
      </div>
      <div className="sg__body">
        <TokensSection />
        <ComponentsSection />
        <IconsSection />
      </div>
    </div>
  )
}

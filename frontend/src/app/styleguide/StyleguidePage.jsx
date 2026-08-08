import { Component, useState } from 'react'
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
  InlineCalendar,
  Input,
  Modal,
  ModalActions,
  MultiSelectList,
  PlaceSelect,
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
  TypeSelect,
} from '../../shared/ui'
import { icons } from '../../shared/ui/Icon/icons.js'
// Блоки вне shared/ui (полный охват shared/*).
import { AcceptanceIcon } from '../../shared/AcceptanceIcon.jsx'
import { AttachSelectModal } from '../../shared/AttachSelectModal.jsx'
import { AvatarCircle } from '../../shared/AvatarCircle.jsx'
import { CustomFieldsEditor } from '../../shared/CustomFieldsEditor.jsx'
import { DeviceSnapshotChip } from '../../shared/DeviceSnapshot.jsx'
import { EmployeeMultiPicker } from '../../shared/EmployeeMultiPicker.jsx'
import { EmployeeNameCell } from '../../shared/EmployeeNameCell.jsx'
import { EmployeePicker } from '../../shared/EmployeePicker.jsx'
import { EquipmentMultiPicker } from '../../shared/EquipmentMultiPicker.jsx'
import { EquipmentPicker } from '../../shared/EquipmentPicker.jsx'
import { HistoryList } from '../../shared/HistoryList.jsx'
import { InfiniteScrollSentinel } from '../../shared/InfiniteScrollSentinel.jsx'
import { KeyTarget } from '../../shared/keyTarget.jsx'
import { LeadIconCircle } from '../../shared/LeadIconCircle.jsx'
import { ModeToggle } from '../../shared/ModeToggle.jsx'
import { PassAccessFilter } from '../../shared/PassAccessFilter.jsx'
import { PlacementIcon } from '../../shared/PlacementIcon.jsx'
import { PlacementRow } from '../../shared/PlacementRow.jsx'
import { PlanLink } from '../../shared/PlanLink.jsx'
import { RemoteMultiSelect } from '../../shared/RemoteMultiSelect.jsx'
import { RequisiteAutocompleteChips } from '../../shared/RequisiteAutocompleteChips.jsx'
import { SelectedEmployee } from '../../shared/SelectedEmployee.jsx'
import { SelectedTransport } from '../../shared/SelectedTransport.jsx'
import { Tooltip } from '../../shared/Tooltip.jsx'
import { TransportParkingLine } from '../../shared/TransportParkingLine.jsx'
import { TruncatedText } from '../../shared/TruncatedText.jsx'
import { TypeFilesPicker } from '../../shared/TypeFilesPicker.jsx'
import { TypeFilesView } from '../../shared/TypeFilesView.jsx'
import { TypeRequisiteFilter } from '../../shared/TypeRequisiteFilter.jsx'
import { COLOR_GROUPS, RADII, SHADOWS, SPACING, TYPOGRAPHY, Z_INDEX } from './tokenData.js'
import './styleguide.css'

// ─────────────────────────────────────────────────────────────────────────────
// Dev-only styleguide (B10). Живая витрина дизайн-системы ELE: токены + все
// канонические блоки shared/ui + переиспользуемые блоки shared/* во всех
// состояниях + реестр иконок. Подключается исключительно под import.meta.env.DEV
// в AppRoutes → в прод-бандл не попадает. Тексты страницы — dev-инструмент,
// свободны (не пользовательские UI-строки).
// ─────────────────────────────────────────────────────────────────────────────

// Лёгкий error boundary: API-зависимый блок при 401/сбое не должен ронять всю
// витрину. Ловим и показываем компактную заглушку вместо всплытия ошибки.
class SgErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { failed: false }
  }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    if (this.state.failed) {
      return <div className="sg-fallback">Блок не отрисовался (нет сессии/данных). Откройте под активной сессией.</div>
    }
    return this.props.children
  }
}

// API-зависимое демо монтируется по кнопке — до клика запросы не уходят (чтобы
// без сессии витрина не дёргала бэк и не ловила 401 при загрузке страницы).
function ApiDemo({ children, label = 'Загрузить (живые данные)' }) {
  const [on, setOn] = useState(false)
  return (
    <SgErrorBoundary>
      {on ? children : <Button variant="secondary" onClick={() => setOn(true)}>{label}</Button>}
    </SgErrorBoundary>
  )
}

// surface — сцена на белом фоне (блок в проде живёт внутри Card/модалки).
// col — вертикальная раскладка. note — жёлтая пометка над сценой.
function Demo({ title, desc, col, surface, note, children }) {
  const stageClass = [
    'sg-demo__stage',
    col ? 'sg-demo__stage--col' : '',
    surface ? 'sg-demo__stage--surface' : '',
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <div className="sg-demo">
      <div className="sg-demo__title">{title}</div>
      {desc ? <div className="sg-demo__desc">{desc}</div> : null}
      {note ? <div className="sg-note">{note}</div> : null}
      <div className={stageClass}>{children}</div>
    </div>
  )
}

function Label({ children }) {
  return <div className="sg-demo__label">{children}</div>
}

// Мок-данные для презентационных блоков (никакой сети).
const MOCK_EMPLOYEE = { id: 1, full_name: 'Иванов Пётр', position: 'Инженер', department: 'ИТ-отдел' }
const MOCK_TRANSPORT = { type_and_model: 'Toyota Camry', plate: 'А123ВС77', inventory_number: 'TR-014' }
const MOCK_TYPE_OPTIONS = [
  { id: 1, name: 'Ноутбук' },
  { id: 2, name: 'Монитор' },
  { id: 3, name: 'Телефон' },
]
const MOCK_TYPE_FILES = [
  { id: 1, file: { url: '#', original_filename: 'Инструкция.pdf' } },
  { id: 2, file: { url: '#', original_filename: 'Гарантия.pdf' } },
]
const MOCK_SNAPSHOT = {
  ip: '192.168.0.10', browser: 'Chrome', browser_version: '124', os: 'Windows', os_version: '11',
  device_type: 'Desktop', platform: 'Win32', timezone: 'Europe/Moscow', screen: '1920×1080', language: 'ru-RU',
}
const MOCK_PASS = { buildings: [{ name: 'Корпус А' }], rooms: [{ name: 'Серверная' }], places: [] }

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

// ── Компоненты shared/ui ─────────────────────────────────────────────────────

function ComponentsSection() {
  const [text, setText] = useState('')
  const [checked, setChecked] = useState(true)
  const [seg, setSeg] = useState('sim')
  const [pill, setPill] = useState('all')
  const [tab, setTab] = useState('active')
  const [selectVal, setSelectVal] = useState('')
  const [date, setDate] = useState('')
  const [search, setSearch] = useState('')
  const [multi, setMulti] = useState(['a'])
  const [typeVal, setTypeVal] = useState('')
  const [placeVal, setPlaceVal] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [filterVal] = useState({})

  const cols = [
    { key: 'name', label: 'Наименование', width: '1fr', sortable: true },
    { key: 'status', label: 'Статус', width: '160px' },
  ]

  return (
    <section id="components" className="sg__section">
      <h2 className="sg__h2">Компоненты shared/ui</h2>
      <p className="sg__lead">
        Канонический набор <code>shared/ui</code> (31 экспорт из <code>index.js</code>). Импорт —
        только из бочки: <code>{'import { Button } from \'../../shared/ui\''}</code>. Сцена белая, если
        блок в проде живёт внутри Card/модалки; серая — если на фоне списков/тулбаров.
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

      <Demo title="Input" surface desc="Плавающий лейбл, ошибка под полем, helperText, showToggle (пароль), multiline." col>
        <Input label="Наименование" value={text} onChange={(e) => setText(e.target.value)} />
        <Input label="Обязательное" required helperText="Подсказка под полем" />
        <Input label="С ошибкой" value="" error="Поле заполнено неверно" onChange={() => {}} />
        <Input label="Пароль" showToggle />
        <Input label="Комментарий" multiline rows={3} />
      </Demo>

      <Demo title="Select" surface desc="Нативный select в визуале Input — для простых перечислений." col>
        <Select label="Роль" value={selectVal} onChange={(e) => setSelectVal(e.target.value)} placeholder="Выберите">
          <option value="admin">Администратор</option>
          <option value="viewer">Наблюдатель</option>
        </Select>
        <Select label="С ошибкой" error="Выберите значение">
          <option value="">—</option>
        </Select>
      </Demo>

      <Demo title="TypeSelect" surface col
        desc="Выбор Вида поиском: пока не выбрано — «поиск + список»; после выбора сворачивается в строку выбранного (крестик снова открывает поиск). options — [{ id, name }].">
        <div className="sg-demo__pane">
          <TypeSelect label="Вид оборудования" options={MOCK_TYPE_OPTIONS} value={typeVal} onChange={setTypeVal} icon="cpu" />
        </div>
      </Demo>

      <Demo title="PlaceSelect" surface col
        note="Блок тянет живые данные (список мест с бэка). Полностью виден под активной сессией; без неё список пуст."
        desc="Выбор Места нужного типа (B8): «поиск + список» → строка выбранного места. Модальная ширина, белый фон.">
        <div className="sg-demo__pane">
          <ApiDemo label="Показать (тянет живые данные)">
            <PlaceSelect placeType="storage" label="Место хранения" value={placeVal} onChange={setPlaceVal} />
          </ApiDemo>
        </div>
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

      <Demo title="Badge / StatusPill" surface desc="Badge — нейтральная серо-синяя плашка (счётчики/этаж/«Архив»). StatusPill — цветные семантические статусы.">
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

      <Demo title="DatePicker / InlineCalendar" surface
        desc="Выбор даты: поповер (шириной 300px) и встроенный календарь (в проде — внутри модалки, на белом фоне контейнера).">
        <div style={{ width: 260 }}>
          <DatePicker label="Дата ТО" value={date} onChange={setDate} />
        </div>
        <div className="sg-demo__pane">
          <InlineCalendar value={date} onChange={setDate} />
        </div>
      </Demo>

      <Demo title="Table" surface desc="Табличные списки: columns описывают и заголовок, и разметку строк.">
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

      <Demo title="MultiSelectList" surface desc="Мультивыбор для модалки фильтров (в проде — внутри белой FilterModal). Чек-лист или режим чипсов.">
        <div style={{ width: '100%', maxWidth: 360 }}>
          <MultiSelectList
            search
            options={[{ value: 'a', label: 'Ноутбуки' }, { value: 'b', label: 'Мониторы' }, { value: 'c', label: 'Телефоны' }]}
            selected={multi}
            onToggle={(v) => setMulti((s) => (s.includes(v) ? s.filter((x) => x !== v) : [...s, v]))}
          />
        </div>
      </Demo>

      <Demo title="EmptyState" surface desc="Пустое состояние списка: иконка + заголовок + описание + опциональный CTA." col>
        <EmptyState
          icon={<Icon name="search" size={40} strokeWidth={1.4} />}
          title="Ничего не найдено"
          description="Измените запрос или сбросьте фильтры."
          action={<Button variant="secondary">Сбросить фильтры</Button>}
        />
      </Demo>

      <Demo title="Spinner / Skeleton" surface desc="Индикаторы загрузки: кольцо (bootstrap/секции) и плейсхолдер-строки списка.">
        <Spinner />
        <div style={{ flex: 1, minWidth: 220, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Skeleton width="70%" />
          <Skeleton width="90%" />
          <Skeleton width="50%" />
        </div>
      </Demo>

      <Demo title="FormActions / ModalActions" surface desc="FormActions — горизонтальный ряд под формой. ModalActions — вертикальный ряд действий в модалке (основная кнопка + «Отмена»).">
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

      <Demo title="ActionMenu" surface desc="Кнопка «…» с меню действий (desktop — dropdown на белом фоне, mobile — bottom-sheet). В проде живёт в шапке карточки.">
        <ActionMenu
          items={[
            { label: 'Редактировать', icon: 'pencil-sparkles', onClick: () => {} },
            { label: 'Открепить', icon: 'unlink', onClick: () => {} },
            { label: 'Удалить', icon: 'trash-2', danger: true, onClick: () => {} },
          ]}
        />
      </Demo>

      <Demo title="BackButton" surface desc="Кнопка-иконка «Назад» в шапках вложенных экранов.">
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

// ── Блоки вне shared/ui ──────────────────────────────────────────────────────

function ModeToggleDemo() {
  const [mode, setMode] = useState('employee')
  return (
    <ModeToggle
      mode={mode}
      onChange={setMode}
      options={[
        { value: 'employee', label: 'Сотрудник', icon: 'user' },
        { value: 'workplace', label: 'РМ', icon: 'monitor' },
        { value: 'common', label: 'МОП', icon: 'coffee' },
        { value: 'storage', label: 'Склад', icon: 'warehouse' },
      ]}
    />
  )
}

function TypeFilesPickerDemo() {
  const [ids, setIds] = useState([1])
  return <TypeFilesPicker available={MOCK_TYPE_FILES} selectedIds={ids} onChange={setIds} />
}

function SharedSection() {
  const [fields, setFields] = useState([{ name: 'Гар. срок', value: '24 мес.' }])
  const [empMulti, setEmpMulti] = useState([])
  const [eqMulti, setEqMulti] = useState([])
  const [typeReq, setTypeReq] = useState([])
  const [attachOpen, setAttachOpen] = useState(false)

  return (
    <section id="shared" className="sg__section">
      <h2 className="sg__h2">Блоки вне shared/ui</h2>
      <p className="sg__lead">
        Переиспользуемые блоки из <code>src/shared/*</code> (пикеры, презентационные и фильтр-блоки).
        Презентационные показаны на мок-данных; тянущие бэк — по кнопке «Загрузить», с пометкой и
        защитой от 401 (ошибка блока не роняет витрину).
      </p>

      <h3 className="sg__h3">Пикеры (подбор при закреплении/фильтрах)</h3>

      <Demo title="EmployeePicker" surface col
        note="Тянет живые данные (/api/employees/). Виден полностью под активной сессией."
        desc="Подбор сотрудника с поиском — «закрепить сотрудника», формы, приглашение.">
        <div className="sg-demo__pane">
          <ApiDemo><EmployeePicker onSelect={() => {}} /></ApiDemo>
        </div>
      </Demo>

      <Demo title="EquipmentPicker" surface col
        note="Тянет живые данные (/api/equipment/). Виден полностью под активной сессией."
        desc="Подбор оборудования с поиском — например, для установки SIM/лицензии.">
        <div className="sg-demo__pane">
          <ApiDemo><EquipmentPicker onSelect={() => {}} /></ApiDemo>
        </div>
      </Demo>

      <Demo title="EmployeeMultiPicker / EquipmentMultiPicker" surface col
        note="Внутри используют пикеры выше — тянут живые данные. value — [{ id, label }]."
        desc="Мультивыбор для фильтров: чипы выбранных + поиск.">
        <div className="sg-demo__pane">
          <ApiDemo>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <EmployeeMultiPicker value={empMulti} onChange={setEmpMulti} />
              <EquipmentMultiPicker value={eqMulti} onChange={setEqMulti} />
            </div>
          </ApiDemo>
        </div>
      </Demo>

      <Demo title="SelectedEmployee / SelectedTransport" surface col
        desc="Свёрнутый вид выбранного сотрудника/транспорта (после выбора в пикере): блок с заливкой + крестик сброса. Чистые пропсы.">
        <SelectedEmployee employee={MOCK_EMPLOYEE} onClear={() => {}} />
        <SelectedTransport transport={MOCK_TRANSPORT} onClear={() => {}} />
      </Demo>

      <Demo title="AttachSelectModal" surface
        note="Каркас модалки «привязать свободный объект» — тянет живые данные. Откройте под сессией."
        desc="Общая модалка: список свободных + поиск + мультивыбор чекбоксами + привязка.">
        <ApiDemo label="Открыть AttachSelectModal">
          <>
            <Button variant="secondary" onClick={() => setAttachOpen(true)}>Открыть модалку</Button>
            {attachOpen ? (
              <AttachSelectModal
                title="Установить SIM"
                fetchPath="/api/sim-cards/?free=1"
                match={(item, q) => !q || String(item.number || '').includes(q)}
                renderRow={(item) => <span>{item.number || item.id}</span>}
                attach={async () => {}}
                onAttached={() => setAttachOpen(false)}
                onClose={() => setAttachOpen(false)}
                empty={{ title: 'Нет свободных SIM' }}
                submitLabel="Установить"
              />
            ) : null}
          </>
        </ApiDemo>
      </Demo>

      <h3 className="sg__h3">Презентационные блоки</h3>

      <Demo title="AvatarCircle / LeadIconCircle" surface
        desc="Круглые подложки: аватар сотрудника (фото/инициалы) и ведущая иконка строки. tinted — для серого фона модалок. status — оверлей акцепта.">
        <Label>AvatarCircle</Label>
        <AvatarCircle name="Иванов Пётр" />
        <AvatarCircle name="Сидоров Иван" status="accepted" />
        <AvatarCircle name="Петров Глеб" tinted />
        <Label>LeadIconCircle</Label>
        <LeadIconCircle name="cpu" />
        <LeadIconCircle name="warehouse" status="pending" />
        <LeadIconCircle name="car" tinted />
      </Demo>

      <Demo title="ModeToggle" surface col
        desc="Переключатель режима размещения (иконка над подписью): Сотрудник / РМ / МОП / Склад.">
        <ModeToggleDemo />
      </Demo>

      <Demo title="PlacementRow / PlacementIcon" surface col
        desc="PlacementRow — строка блока «Размещение/Закреплено за» (кружок + подписи). PlacementIcon — иконка типа места с тултипом.">
        <PlacementRow
          circle={<AvatarCircle name="Иванов Пётр" size={40} />}
          label="Закреплено за"
          title="Иванов Пётр"
          sub="Инженер · ИТ-отдел"
        />
        <PlacementRow
          circle={<LeadIconCircle name="warehouse" />}
          label="Размещение"
          title="Склад №1"
          sub="Основное здание"
        />
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <PlacementIcon placeType="workplace" /> Рабочее место
          <span style={{ width: 16 }} />
          <PlacementIcon placeType="storage" /> Склад
        </div>
      </Demo>

      <Demo title="AcceptanceIcon" surface
        desc="Иконки статуса акцепта закрепления (единый набор для списков/карточек/истории).">
        <AcceptanceIcon status="in_absentia" /> заочно
        <AcceptanceIcon status="pending" /> ожидает
        <AcceptanceIcon status="accepted" /> подтверждено
        <AcceptanceIcon status="rejected" /> отклонено
      </Demo>

      <Demo title="Tooltip / TruncatedText" surface col
        desc="Tooltip — кастомная подсказка (наведите на десктопе). TruncatedText — обрезка «…» с тултипом полного текста, если не помещается.">
        <Tooltip label="Подсказка появляется при наведении (десктоп)">
          <span style={{ borderBottom: '1px dashed var(--color-text-muted)' }}>Наведи на меня</span>
        </Tooltip>
        <div style={{ width: 220 }}>
          <TruncatedText text="Очень длинное наименование, которое не помещается в колонку и обрезается">
            Очень длинное наименование, которое не помещается в колонку и обрезается
          </TruncatedText>
        </div>
      </Demo>

      <Demo title="EmployeeNameCell" surface col
        desc="Ячейка «сотрудник» в списках объектов: иконка акцепта + ФИО (перенос до 2 строк) + должность · отдел.">
        <div style={{ width: 260 }}>
          <EmployeeNameCell name="Иванов Пётр" position="Инженер" department="ИТ-отдел" status="accepted" />
        </div>
      </Demo>

      <Demo title="KeyTarget" surface
        desc="Отображение объекта доступа ключа: место/помещение + контекст (здание) в скобках. Чистый проп pass.">
        <span><KeyTarget pass={MOCK_PASS} /></span>
      </Demo>

      <Demo title="TransportParkingLine" surface col
        desc="Строка состояния парковки транспорта (место + план / на адресе / не закреплено). Чистый проп parking.">
        <TransportParkingLine parking={{ kind: 'spot', place_name: 'Парковка А-12' }} />
        <TransportParkingLine parking={{ kind: 'driver_address' }} />
        <TransportParkingLine parking={{ kind: 'none' }} />
      </Demo>

      <Demo title="PlanLink" surface
        desc="Текстовая ссылка «План парковки» — открывает план во встроенном просмотрщике. Проп file = { url }.">
        <PlanLink file={{ url: '#', original_filename: 'plan.pdf' }} />
      </Demo>

      <Demo title="TypeFilesView / TypeFilesPicker" surface col
        desc="B67. Общие файлы Вида: read-only список на карточке (View) и мультивыбор на форме (Picker). files — [{ id, file }].">
        <Label>TypeFilesView</Label>
        <TypeFilesView files={MOCK_TYPE_FILES} />
        <Label>TypeFilesPicker</Label>
        <TypeFilesPickerDemo />
      </Demo>

      <Demo title="DeviceSnapshotChip" surface
        note="Плашку видят только Администратор/Ответственный за учёт (ПДн). Под другой ролью не отрисуется."
        desc="B32. Слепок устройства при акцепте — компактная плашка, по клику модалка с полями.">
        <DeviceSnapshotChip snapshot={MOCK_SNAPSHOT} />
      </Demo>

      <Demo title="CustomFieldsEditor" surface col
        desc="«Дополнительные поля» — произвольные пары имя/значение с перетаскиванием порядка (grip). items / onChange.">
        <CustomFieldsEditor items={fields} onChange={setFields} />
      </Demo>

      <h3 className="sg__h3">Фильтр-блоки (тянут справочники)</h3>

      <Demo title="RemoteMultiSelect" surface col
        note="Тянет список с эндпоинта (места/операторы/поставщики). Виден под сессией."
        desc="Загрузка списка + мультивыбор (чек-лист) для модалки фильтров. endpoint + mapOption.">
        <div className="sg-demo__pane">
          <ApiDemo>
            <RemoteMultiSelect
              endpoint="/api/places/?type=storage"
              mapOption={(it) => ({ value: String(it.id), label: it.name })}
              selected={[]}
              onChange={() => {}}
            />
          </ApiDemo>
        </div>
      </Demo>

      <Demo title="TypeRequisiteFilter" surface col
        note="Тянет виды и значения реквизитов (Оборудование/Лицензии). Виден под сессией."
        desc="Блок фильтра «Вид + реквизиты»: мультивыбор видов чипсами + подблоки фильтров реквизитов.">
        <div className="sg-demo__pane">
          <ApiDemo>
            <TypeRequisiteFilter
              endpoint="/api/equipment-types/"
              valuesBase="/api/equipment/field-values/"
              types={typeReq}
              onTypesChange={setTypeReq}
              req={{}}
              onReqChange={() => {}}
            />
          </ApiDemo>
        </div>
      </Demo>

      <Demo title="PassAccessFilter" surface col
        note="Тянет дерево зданий/помещений/мест (/api/buildings/). Виден под сессией."
        desc="Фильтр «Доступ в помещения» для Средств доступа: здания → помещения → места, иерархически.">
        <div className="sg-demo__pane">
          <ApiDemo>
            <PassAccessFilter buildings={[]} rooms={[]} places={[]} onChange={() => {}} objectType="pass" />
          </ApiDemo>
        </div>
      </Demo>

      <Demo title="RequisiteAutocompleteChips" surface col
        note="Подсказки значений подтягиваются с бэка при вводе (valuesUrl). Чипсы работают и без сети."
        desc="Фильтр текст/число-реквизита: чипсы выбранных + инпут с автоподсказкой существующих значений.">
        <div className="sg-demo__pane">
          <SgErrorBoundary>
            <RequisiteAutocompleteChips value={['Dell', 'Lenovo']} onChange={() => {}} valuesUrl="/api/equipment/field-values/?field=1" />
          </SgErrorBoundary>
        </div>
      </Demo>

      <h3 className="sg__h3">История и утилиты</h3>

      <Demo title="HistoryList" surface col
        note="Тянет историю объекта (path). Виден под сессией."
        desc="Лента истории движений/изменений объекта с фильтром и слепками устройств.">
        <div style={{ width: '100%' }}>
          <ApiDemo><HistoryList path="/api/equipment/1/history/" /></ApiDemo>
        </div>
      </Demo>

      <Demo title="InfiniteScrollSentinel" surface col
        desc="Утилита: наблюдатель нижнего края списка — вызывает onLoadMore при попадании в вид. Визуально — спиннер при loading.">
        <InfiniteScrollSentinel hasMore loading onLoadMore={() => {}} />
        <span className="sg-swatch__val">hasMore + loading → показывает спиннер догрузки.</span>
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
          <a href="#components">shared/ui</a>
          <a href="#shared">shared/*</a>
          <a href="#icons">Иконки</a>
        </nav>
      </div>
      <div className="sg__body">
        <TokensSection />
        <ComponentsSection />
        <SharedSection />
        <IconsSection />
      </div>
    </div>
  )
}

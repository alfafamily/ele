import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from './AuthContext.jsx'
import { useCompany, useDuplicatesCount, useRefreshDuplicates, useStorageLow } from './CompanyContext.jsx'
import { navSectionsForRole } from './navSections.js'
import { HelpIcon, MenuIcon, SettingsIcon } from './navIcons.jsx'
import { roleLabel } from '../shared/roles.js'
import { nameInitials } from '../shared/employeeName.js'
import { Icon } from '../shared/ui'
import { PushPromptModal } from '../features/notifications/PushPromptModal.jsx'
import './AppLayout.css'

// B51-R2. Маркер на аватаре профиля, если сотрудник ещё не подтвердил согласие
// на обработку ПДн (жёлтый треугольник в правом нижнем углу, поверх аватара —
// размер блока не меняется, т.к. позиционируется абсолютно).
function ProfileConsentMarker() {
  return (
    <span className="ele-nav-warning" aria-label="Требуется подтвердить согласие на обработку ПДн">
      <Icon name="triangle-alert" size={12} strokeWidth={2.4} />
    </span>
  )
}

// Маркер-предупреждение (треугольник) поверх иконки «Настройки». Один общий
// значок на все причины: B12 — возможные дубли сотрудников, B33 — заканчивается
// место в хранилище. Причины перечисляем в подсказке через «; ».
function SettingsWarningMarker({ reasons }) {
  const title = reasons.join('; ')
  return (
    <span className="ele-nav-warning" title={title} aria-label={title}>
      <Icon name="triangle-alert" size={13} strokeWidth={2.4} />
    </span>
  )
}

export function AppLayout() {
  const { user } = useAuth()
  const company = useCompany()
  const duplicatesCount = useDuplicatesCount()
  const storageLow = useStorageLow()
  // Причины предупреждения на иконке «Настройки» (пусто — треугольника нет).
  const settingsWarnings = [
    ...(duplicatesCount > 0 ? ['Обнаружены возможные дубли сотрудников'] : []),
    ...(storageLow ? ['Заканчивается место в хранилище'] : []),
  ]
  const sections = navSectionsForRole(user.role, user.is_observer)
  const employeeName = user.employee ? user.employee.full_name : null
  const [drawerOpen, setDrawerOpen] = useState(false)
  // B31: закрепление бокового меню на десктопе. Закреплённый rail не сворачивается
  // при уходе курсора, а контент страниц сдвигается правее (не накрывается меню).
  // Состояние помним между сессиями (localStorage).
  const [railPinned, setRailPinned] = useState(() => {
    try {
      return localStorage.getItem('ele-rail-pinned') === '1'
    } catch {
      return false
    }
  })
  const location = useLocation()
  const refreshDuplicates = useRefreshDuplicates()

  const toggleRailPinned = () => {
    setRailPinned((v) => {
      const next = !v
      try {
        localStorage.setItem('ele-rail-pinned', next ? '1' : '0')
      } catch {
        /* localStorage недоступен — переключаем только в памяти */
      }
      return next
    })
  }

  // Закрываем выезжающее меню при переходе на другую страницу.
  useEffect(() => {
    setDrawerOpen(false)
  }, [location.pathname])

  // B12: держим бейдж возможных дублей актуальным — счётчик в CompanyContext
  // берётся при входе, но дубли могут появиться позже (создание сотрудника,
  // регистрация). Перечитываем на каждом переходе между разделами (лёгкий
  // GET, только для админа).
  useEffect(() => {
    refreshDuplicates?.()
  }, [location.pathname, refreshDuplicates])

  const avatar = (size, fontSize) => (
    <span className="ele-nav-warning-host">
      <span className="ele-rail__avatar" style={{ width: size, height: size, fontSize, overflow: 'hidden' }}>
        {user.employee?.avatar ? (
          <img src={user.employee.avatar.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          nameInitials(employeeName || user.email)
        )}
      </span>
      {user.needs_consent ? <ProfileConsentMarker /> : null}
    </span>
  )

  // Логотип по единой логике (desktop rail и мобильное меню): при загруженном
  // лого компании — лого компании + разделитель + знак ELE, иначе только ELE.
  const brand = company?.logo ? (
    <>
      <img className="ele-brand__company" src={company.logo.url} alt="" />
      <div className="ele-brand__divider" />
      <img className="ele-brand__full" src="/brand/ele-full.svg" alt="ELE" />
    </>
  ) : (
    <img className="ele-brand__full" src="/brand/ele-full.svg" alt="ELE" />
  )

  // «Настройки» — внизу rail, над «Помощью» (макет N); остальные разделы
  // идут сверху в порядке навигации.
  const topSections = sections.filter((s) => !s.bottom)
  const bottomSections = sections.filter((s) => s.bottom)
  const isAdmin = user.role === 'admin'
  // Мобильное выезжающее меню (drawer) — только основные разделы. Руководство,
  // Настройки, Профиль вынесены в нижний таб-бар, поэтому в меню не дублируются.
  const drawerSections = topSections

  return (
    <div className={`ele-shell${railPinned ? ' ele-shell--rail-pinned' : ''}`}>
      <aside className={`ele-rail${railPinned ? ' ele-rail--pinned' : ''}`}>
        <div className="ele-rail__brand">
          {/* Свёрнутый rail: лого компании, иначе краткий знак ELE (одна иконка) */}
          <img
            className={company?.logo ? 'ele-rail__brand-collapsed' : 'ele-rail__brand-collapsed ele-rail__brand-collapsed--mark'}
            src={company?.logo ? company.logo.url : '/brand/ele-icon.svg'}
            alt="ELE"
          />
          {/* Развёрнутый rail: полный логотип; при загруженном лого компании —
              лого компании + разделитель + полный знак ELE */}
          <div className="ele-rail__brand-expanded">
            {company?.logo ? (
              <>
                <img className="ele-rail__brand-logo" src={company.logo.url} alt="" />
                <div className="ele-rail__brand-divider" />
                <img className="ele-rail__brand-full" src="/brand/ele-full.svg" alt="ELE" />
              </>
            ) : (
              <img className="ele-rail__brand-full" src="/brand/ele-full.svg" alt="ELE" />
            )}
          </div>
          {/* B31: переключатель закрепления меню — виден в развёрнутом rail
              (по hover/фокусу) и всегда в закреплённом; выровнен по правому краю. */}
          <button
            type="button"
            className="ele-rail__pin"
            // После открепления снимаем фокус с кнопки: иначе rail держится
            // раскрытым через :focus-within, пока фокус на кнопке, и не
            // сворачивается при уходе курсора (только по клику вне меню).
            onClick={(e) => {
              toggleRailPinned()
              e.currentTarget.blur()
            }}
            aria-label={railPinned ? 'Открепить меню' : 'Закрепить меню'}
            aria-pressed={railPinned}
          >
            <Icon name={railPinned ? 'pin-off' : 'pin'} size={18} strokeWidth={2} />
          </button>
        </div>

        <NavLink to="/profile" className={({ isActive }) => `ele-rail__user${isActive ? ' ele-rail__user--active' : ''}`} onClick={(e) => e.currentTarget.blur()}>
          <span className="ele-nav-warning-host">
            <span className="ele-rail__avatar" style={{ overflow: 'hidden' }}>
              {user.employee?.avatar ? (
                <img src={user.employee.avatar.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                nameInitials(employeeName || user.email)
              )}
            </span>
            {user.needs_consent ? <ProfileConsentMarker /> : null}
          </span>
          <span className="ele-rail__user-text">
            <div className="ele-rail__user-name">{employeeName || user.email}</div>
            <div className="ele-rail__user-role">{roleLabel(user.role)}</div>
          </span>
        </NavLink>

        {/* B44. «Уведомления» — сразу под блоком пользователя, доступно всем ролям. */}
        <NavLink
          to="/notifications"
          onClick={(e) => e.currentTarget.blur()}
          className={({ isActive }) => `ele-rail__item${isActive ? ' ele-rail__item--active' : ''}`}
        >
          <span className="ele-rail__item-icon">
            <Icon name="bell" size={22} strokeWidth={1.7} />
          </span>
          <span className="ele-rail__label">Уведомления</span>
        </NavLink>

        <nav className="ele-rail__nav">
          {topSections.map(({ key, to, label, icon: Icon }) => (
            <NavLink
              key={key}
              to={to}
              end={to === '/'}
              onClick={(e) => e.currentTarget.blur()}
              className={({ isActive }) => `ele-rail__item${isActive ? ' ele-rail__item--active' : ''}`}
            >
              <span className="ele-rail__item-icon">
                <Icon />
              </span>
              <span className="ele-rail__label">{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="ele-rail__spacer" />

        {bottomSections.map(({ key, to, label, icon: SectionIcon }) => (
          <NavLink
            key={key}
            to={to}
            onClick={(e) => e.currentTarget.blur()}
            className={({ isActive }) => `ele-rail__item${isActive ? ' ele-rail__item--active' : ''}`}
          >
            <span className="ele-rail__item-icon ele-nav-warning-host">
              <SectionIcon />
              {key === 'settings' && settingsWarnings.length > 0 ? <SettingsWarningMarker reasons={settingsWarnings} /> : null}
            </span>
            <span className="ele-rail__label">{label}</span>
          </NavLink>
        ))}

        <NavLink
          to="/guide"
          onClick={(e) => e.currentTarget.blur()}
          className={({ isActive }) => `ele-rail__item${isActive ? ' ele-rail__item--active' : ''}`}
        >
          <span className="ele-rail__item-icon">
            <HelpIcon />
          </span>
          <span className="ele-rail__label">Руководство</span>
        </NavLink>
      </aside>

      <main className="ele-content ele-content--with-bottomnav">
        <div className="ele-content__inner">
          <Outlet />
        </div>
      </main>

      {/* Мобильный нижний таб-бар: Руководство · Настройки (админ) · Меню
          (открывает выезжающее меню) · Профиль. На десктопе скрыт (там rail). */}
      <nav className="ele-bottom-nav">
        <NavLink
          to="/guide"
          className={({ isActive }) => `ele-bottom-nav__item${isActive ? ' ele-bottom-nav__item--active' : ''}`}
        >
          <HelpIcon />
          <span>Руководство</span>
        </NavLink>
        {isAdmin ? (
          <NavLink
            to="/settings"
            className={({ isActive }) => `ele-bottom-nav__item${isActive ? ' ele-bottom-nav__item--active' : ''}`}
          >
            <span className="ele-nav-warning-host">
              <SettingsIcon />
              {settingsWarnings.length > 0 ? <SettingsWarningMarker reasons={settingsWarnings} /> : null}
            </span>
            <span>Настройки</span>
          </NavLink>
        ) : null}
        {drawerSections.length > 0 ? (
          <button
            type="button"
            className={`ele-bottom-nav__item${drawerOpen ? ' ele-bottom-nav__item--active' : ''}`}
            aria-haspopup="menu"
            aria-expanded={drawerOpen}
            onClick={() => setDrawerOpen(true)}
          >
            <MenuIcon />
            <span>Меню</span>
          </button>
        ) : null}
        <NavLink
          to="/profile"
          className={({ isActive }) => `ele-bottom-nav__item${isActive ? ' ele-bottom-nav__item--active' : ''}`}
        >
          {avatar(24, 10)}
          <span>Профиль</span>
        </NavLink>
      </nav>

      {/* Выезжающее справа меню (поверх страницы) со всеми разделами. */}
      {drawerOpen ? <div className="ele-drawer__backdrop" onClick={() => setDrawerOpen(false)} /> : null}
      <nav className={`ele-drawer${drawerOpen ? ' ele-drawer--open' : ''}`} aria-hidden={!drawerOpen}>
        {/* Логотип наверху меню — по логике десктопа (компания + ELE / только ELE). */}
        <div className="ele-drawer__brand">{brand}</div>
        <div className="ele-drawer__items">
          {drawerSections.map(({ key, to, label, icon: Icon }) => (
            <NavLink
              key={key}
              to={to}
              end={to === '/'}
              className={({ isActive }) => `ele-drawer__item${isActive ? ' ele-drawer__item--active' : ''}`}
              onClick={() => setDrawerOpen(false)}
            >
              <span className="ele-drawer__item-icon"><Icon /></span>
              <span>{label}</span>
            </NavLink>
          ))}
        </div>
      </nav>

      {/* B44. Разовое предложение включить push после входа. */}
      <PushPromptModal />
    </div>
  )
}

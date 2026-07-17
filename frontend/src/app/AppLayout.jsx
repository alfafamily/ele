import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from './AuthContext.jsx'
import { useCompany } from './CompanyContext.jsx'
import { navSectionsForRole } from './navSections.js'
import { HelpIcon, MenuIcon, SettingsIcon } from './navIcons.jsx'
import { roleLabel } from '../shared/roles.js'
import { nameInitials } from '../shared/employeeName.js'
import './AppLayout.css'

export function AppLayout() {
  const { user } = useAuth()
  const company = useCompany()
  const sections = navSectionsForRole(user.role)
  const employeeName = user.employee ? user.employee.full_name : null
  const [drawerOpen, setDrawerOpen] = useState(false)
  const location = useLocation()

  // Закрываем выезжающее меню при переходе на другую страницу.
  useEffect(() => {
    setDrawerOpen(false)
  }, [location.pathname])

  const avatar = (size, fontSize) => (
    <span className="ele-rail__avatar" style={{ width: size, height: size, fontSize, overflow: 'hidden' }}>
      {user.employee?.avatar ? (
        <img src={user.employee.avatar.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        nameInitials(employeeName || user.email)
      )}
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
    <div className="ele-shell">
      <aside className="ele-rail">
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
        </div>

        <NavLink to="/profile" className="ele-rail__user" onClick={(e) => e.currentTarget.blur()}>
          <span className="ele-rail__avatar" style={{ overflow: 'hidden' }}>
            {user.employee?.avatar ? (
              <img src={user.employee.avatar.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              nameInitials(employeeName || user.email)
            )}
          </span>
          <span className="ele-rail__user-text">
            <div className="ele-rail__user-name">{employeeName || user.email}</div>
            <div className="ele-rail__user-role">{roleLabel(user.role)}</div>
          </span>
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

        {bottomSections.map(({ key, to, label, icon: Icon }) => (
          <NavLink
            key={key}
            to={to}
            onClick={(e) => e.currentTarget.blur()}
            className={({ isActive }) => `ele-rail__item${isActive ? ' ele-rail__item--active' : ''}`}
          >
            <span className="ele-rail__item-icon">
              <Icon />
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
            <SettingsIcon />
            <span>Настройки</span>
          </NavLink>
        ) : null}
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
    </div>
  )
}

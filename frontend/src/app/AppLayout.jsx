import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from './AuthContext.jsx'
import { useCompany } from './CompanyContext.jsx'
import { navSectionsForRole } from './navSections.js'
import { HelpIcon, MenuIcon } from './navIcons.jsx'
import { roleLabel } from '../shared/roles.js'
import { nameInitials } from '../shared/employeeName.js'
import './AppLayout.css'

export function AppLayout() {
  const { user } = useAuth()
  const company = useCompany()
  const sections = navSectionsForRole(user.role)
  const employeeName = user.employee ? user.employee.full_name : null
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [topbarHidden, setTopbarHidden] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()

  // Верхняя панель скрывается на страницах создания/редактирования объектов
  // (маршруты …/new и …/edit) — чтобы не отвлекать при заполнении формы.
  const isFormPage = /\/(new|edit)\/?$/.test(location.pathname)

  // Закрываем выезжающее меню и показываем панель при переходе на другую страницу.
  useEffect(() => {
    setDrawerOpen(false)
    setTopbarHidden(false)
  }, [location.pathname])

  // Верхняя панель уезжает вверх при скролле вниз и возвращается при скролле
  // вверх (паттерн Material). У самого верха страницы всегда видна.
  useEffect(() => {
    let lastY = window.scrollY
    const onScroll = () => {
      const y = window.scrollY
      if (y < 10) setTopbarHidden(false)
      else if (y > lastY + 5) setTopbarHidden(true)
      else if (y < lastY - 5) setTopbarHidden(false)
      lastY = y
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const avatar = (size, fontSize) => (
    <span className="ele-rail__avatar" style={{ width: size, height: size, fontSize, overflow: 'hidden' }}>
      {user.employee?.avatar ? (
        <img src={user.employee.avatar.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        nameInitials(employeeName || user.email)
      )}
    </span>
  )
  // «Настройки» — внизу rail, над «Помощью» (макет N); остальные разделы
  // идут сверху в порядке навигации.
  const topSections = sections.filter((s) => !s.bottom)
  const bottomSections = sections.filter((s) => s.bottom)
  // Мобильное меню (drawer) — все разделы как на десктопе + Настройки (у админа)
  // и Руководство.
  const drawerSections = [
    ...topSections,
    ...bottomSections,
    { key: 'guide', to: '/guide', label: 'Руководство', icon: HelpIcon },
  ]

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

      {/* Мобильная верхняя панель: профиль слева, лого ELE по центру, меню
          справа. Скрыта на десктопе (там rail) и на страницах форм. */}
      {!isFormPage ? (
        <header className={`ele-topbar${topbarHidden ? ' ele-topbar--hidden' : ''}`}>
          <button type="button" className="ele-topbar__profile" aria-label="Профиль" onClick={() => navigate('/profile')}>
            {avatar(34, 12)}
          </button>
          {/* Лого по той же логике, что и развёрнутый rail: при загруженном лого
              компании — лого компании + разделитель + знак ELE, иначе только ELE. */}
          <div className="ele-topbar__brand">
            {company?.logo ? (
              <>
                <img className="ele-topbar__company-logo" src={company.logo.url} alt="" />
                <div className="ele-topbar__brand-divider" />
                <img className="ele-topbar__logo" src="/brand/ele-full.svg" alt="ELE" />
              </>
            ) : (
              <img className="ele-topbar__logo" src="/brand/ele-full.svg" alt="ELE" />
            )}
          </div>
          <button type="button" className="ele-topbar__menu" aria-label="Меню" aria-haspopup="menu" aria-expanded={drawerOpen} onClick={() => setDrawerOpen(true)}>
            <MenuIcon />
          </button>
        </header>
      ) : null}

      <main className={`ele-content${!isFormPage ? ' ele-content--with-topbar' : ''}`}>
        <div className="ele-content__inner">
          <Outlet />
        </div>
      </main>

      {/* Выезжающее справа меню (поверх страницы) со всеми разделами. */}
      {drawerOpen ? <div className="ele-drawer__backdrop" onClick={() => setDrawerOpen(false)} /> : null}
      <nav className={`ele-drawer${drawerOpen ? ' ele-drawer--open' : ''}`} aria-hidden={!drawerOpen}>
        <NavLink to="/profile" className="ele-drawer__user" onClick={() => setDrawerOpen(false)}>
          {avatar(40, 14)}
          <span className="ele-drawer__user-text">
            <span className="ele-drawer__user-name">{employeeName || user.email}</span>
            <span className="ele-drawer__user-role">{roleLabel(user.role)}</span>
          </span>
        </NavLink>
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

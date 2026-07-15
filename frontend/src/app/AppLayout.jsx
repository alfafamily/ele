import { useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from './AuthContext.jsx'
import { useCompany } from './CompanyContext.jsx'
import { navSectionsForRole } from './navSections.js'
import { HelpIcon, MoreIcon } from './navIcons.jsx'
import { roleLabel } from '../shared/roles.js'
import { Button, Modal } from '../shared/ui'
import './AppLayout.css'

function initials(email) {
  return (email || '?').slice(0, 2).toUpperCase()
}

export function AppLayout() {
  const { user } = useAuth()
  const company = useCompany()
  const sections = navSectionsForRole(user.role)
  const employeeName = user.employee ? user.employee.full_name : null
  // Настройки — только у Администратора и в мобильной нижней навигации их нет
  // (там первые 3 раздела + Профиль). Тап по «Профиль» на мобиле открывает
  // меню: у всех — Профиль/Руководство, у админа между ними ещё Настройки.
  const isAdmin = user.role === 'admin'
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const [moreMenuOpen, setMoreMenuOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const goTo = (to, close) => {
    close(false)
    navigate(to)
  }

  const avatar = (size, fontSize) => (
    <span className="ele-rail__avatar" style={{ width: size, height: size, fontSize, overflow: 'hidden' }}>
      {user.employee?.avatar ? (
        <img src={user.employee.avatar.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        initials(employeeName || user.email)
      )}
    </span>
  )
  // «Настройки» — внизу rail, над «Помощью» (макет N); остальные разделы
  // идут сверху в порядке навигации.
  const topSections = sections.filter((s) => !s.bottom)
  const bottomSections = sections.filter((s) => s.bottom)
  // Мобильная нижняя навигация: первые два раздела — напрямую, остальные
  // прячем в меню «Ещё» (иначе не помещаются, а разделов у admin/accountant
  // теперь больше — добавились «Помещения»).
  const mobilePrimary = topSections.slice(0, 2)
  const mobileMore = topSections.slice(2)
  const isMoreActive = mobileMore.some((s) => (s.to === '/' ? location.pathname === '/' : location.pathname.startsWith(s.to)))

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
              initials(employeeName || user.email)
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

      <main className="ele-content">
        <div className="ele-content__inner">
          <Outlet />
        </div>
      </main>

      <nav className="ele-bottom-nav">
        {mobilePrimary.map(({ key, to, label, icon: Icon }) => (
          <NavLink
            key={key}
            to={to}
            end={to === '/'}
            className={({ isActive }) => `ele-bottom-nav__item${isActive ? ' ele-bottom-nav__item--active' : ''}`}
          >
            <Icon />
            <span>{label}</span>
          </NavLink>
        ))}
        {mobileMore.length > 0 ? (
          <button
            type="button"
            className={`ele-bottom-nav__item${moreMenuOpen || isMoreActive ? ' ele-bottom-nav__item--active' : ''}`}
            aria-haspopup="menu"
            aria-expanded={moreMenuOpen}
            onClick={() => setMoreMenuOpen((v) => !v)}
          >
            <MoreIcon />
            <span>Ещё</span>
          </button>
        ) : null}
        <button
          type="button"
          className={`ele-bottom-nav__item${profileMenuOpen ? ' ele-bottom-nav__item--active' : ''}`}
          aria-haspopup="menu"
          aria-expanded={profileMenuOpen}
          onClick={() => setProfileMenuOpen((v) => !v)}
        >
          {avatar(22, 9)}
          <span>Профиль</span>
        </button>
      </nav>

      {moreMenuOpen ? (
        <Modal open onClose={() => setMoreMenuOpen(false)} title="Выберите пункт меню">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
            {mobileMore.map(({ key, to, label }) => (
              <Button key={key} variant="secondary" fullWidth onClick={() => goTo(to, setMoreMenuOpen)}>
                {label}
              </Button>
            ))}
          </div>
        </Modal>
      ) : null}

      {profileMenuOpen ? (
        <Modal open onClose={() => setProfileMenuOpen(false)} title="Выберите пункт меню">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
            <Button variant="secondary" fullWidth onClick={() => goTo('/profile', setProfileMenuOpen)}>
              Профиль
            </Button>
            {isAdmin ? (
              <Button variant="secondary" fullWidth onClick={() => goTo('/settings', setProfileMenuOpen)}>
                Настройки
              </Button>
            ) : null}
            <Button variant="secondary" fullWidth onClick={() => goTo('/guide', setProfileMenuOpen)}>
              Руководство
            </Button>
          </div>
        </Modal>
      ) : null}
    </div>
  )
}

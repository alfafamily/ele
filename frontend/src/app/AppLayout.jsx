import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from './AuthContext.jsx'
import { useCompany } from './CompanyContext.jsx'
import { navSectionsForRole } from './navSections.js'
import { HelpIcon } from './navIcons.jsx'
import { roleLabel } from '../shared/roles.js'
import './AppLayout.css'

function initials(email) {
  return (email || '?').slice(0, 2).toUpperCase()
}

export function AppLayout() {
  const { user } = useAuth()
  const company = useCompany()
  const sections = navSectionsForRole(user.role)
  const employeeName = user.employee ? user.employee.full_name : null
  // «Настройки» — внизу rail, над «Помощью» (§8.5, макет N); остальные разделы
  // идут сверху в порядке навигации.
  const topSections = sections.filter((s) => !s.bottom)
  const bottomSections = sections.filter((s) => s.bottom)

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

        <span className="ele-rail__item" style={{ color: 'var(--color-text-placeholder)', cursor: 'default' }}>
          <span className="ele-rail__item-icon">
            <HelpIcon />
          </span>
          <span className="ele-rail__label">Помощь</span>
        </span>
      </aside>

      <main className="ele-content">
        <div className="ele-content__inner">
          <Outlet />
        </div>
      </main>

      <nav className="ele-bottom-nav">
        {sections.slice(0, 3).map(({ key, to, label, icon: Icon }) => (
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
        <NavLink to="/profile" className={({ isActive }) => `ele-bottom-nav__item${isActive ? ' ele-bottom-nav__item--active' : ''}`}>
          <span className="ele-rail__avatar" style={{ width: 22, height: 22, fontSize: 9, overflow: 'hidden' }}>
            {user.employee?.avatar ? (
              <img src={user.employee.avatar.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              initials(employeeName || user.email)
            )}
          </span>
          <span>Профиль</span>
        </NavLink>
      </nav>
    </div>
  )
}

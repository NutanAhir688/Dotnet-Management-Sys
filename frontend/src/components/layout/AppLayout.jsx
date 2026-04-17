import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', roles: ['Admin', 'Agency', 'Shopkeeper'] },
  { to: '/profile', label: 'Profile', roles: ['Admin', 'Agency', 'Shopkeeper'] },
  { to: '/register', label: 'Register User', roles: ['Admin'] },
  { to: '/agencies', label: 'Agencies', roles: ['Admin', 'Agency', 'Shopkeeper'] },
  { to: '/products', label: 'Products', roles: ['Admin', 'Agency', 'Shopkeeper'] },
  { to: '/customers', label: 'Customers', roles: ['Admin', 'Shopkeeper'] },
  { to: '/orders', label: 'Orders', roles: ['Admin', 'Agency', 'Shopkeeper'] },
  { to: '/bills', label: 'Bills', roles: ['Admin', 'Agency', 'Shopkeeper'] },
]

export function AppLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const visibleItems = NAV_ITEMS.filter((item) => item.roles.includes(user?.role))

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <h2 className="brand-title">Inventory Manager</h2>
          <p className="brand-subtitle">Frontend Control Panel</p>
        </div>

        <nav className="nav-list" aria-label="Main navigation">
          {visibleItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `nav-link${isActive ? ' nav-link-active' : ''}`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="content-area">
        <header className="topbar">
          <div>
            <p className="topbar-label">Signed in as</p>
            <p className="topbar-user">
              {user?.username ?? 'User'} <span className="badge">{user?.role}</span>
            </p>
          </div>
          <button type="button" className="btn btn-outline" onClick={handleLogout}>
            Logout
          </button>
        </header>

        <main className="page-container">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

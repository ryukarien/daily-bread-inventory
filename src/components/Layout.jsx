import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { ClipboardList, Gauge, LogOut, Menu, PackageCheck, ShoppingBasket, Tags, X } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'

export default function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const linkClass = ({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`

  useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname])

  function signOut() {
    setMenuOpen(false)
    logout()
    navigate('/login')
  }

  return (
    <div className="min-h-screen">
      <header className="site-header">
        <div className="header-inner">
          <NavLink to="/sale" className="brand-link" aria-label="Daily Bread home">
            <img className="header-logo" src="./logo.svg" alt="Daily Bread toast mascot and DB logo" />
          </NavLink>
          <div className={`header-controls ${menuOpen ? 'header-controls-open' : ''}`}>
            <nav id="primary-navigation" className="main-nav" aria-label="Main menu">
              <NavLink to="/sale" className={linkClass}><ShoppingBasket size={19} /> New sale</NavLink>
              <NavLink to="/day" className={linkClass}><PackageCheck size={19} /> Open / close day</NavLink>
              <NavLink to="/report" className={linkClass}><ClipboardList size={19} /> Daily report</NavLink>
              <NavLink to="/inventory" className={linkClass}><Tags size={19} /> Prices and stock</NavLink>
              {user?.role === 'admin' && <NavLink to="/admin" className={linkClass}><Gauge size={19} /> Admin board</NavLink>}
            </nav>
            <div className="user-tools">
              <span className="role-pill">{user?.role === 'admin' ? 'Admin' : 'Staff'}</span>
              <button type="button" className="logout-button" onClick={signOut}><LogOut size={18} /><span>Log out</span></button>
            </div>
          </div>
          <button
            type="button"
            className="menu-toggle"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            aria-controls="primary-navigation"
            onClick={() => setMenuOpen((isOpen) => !isOpen)}
          >
            {menuOpen ? <X size={23} /> : <Menu size={23} />}
          </button>
        </div>
      </header>
      <main className="page-shell"><Outlet /></main>
      <footer className="site-footer">Daily Bread · Shop sales &amp; stock</footer>
    </div>
  )
}

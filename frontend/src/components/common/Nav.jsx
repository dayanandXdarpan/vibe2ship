import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { collection, query, where, onSnapshot } from 'firebase/firestore'
import { db } from '../../services/firebase'
import {
  Map, LayoutGrid, Bell, User, LogOut, Shield,
  Plus, Menu, X, Trophy, BarChart2, Home
} from 'lucide-react'
import useAuthStore from '../../store/authStore'
import './Nav.css'

const NAV_LINKS = [
  { path: '/feed', label: 'Feed', icon: LayoutGrid },
  { path: '/map', label: 'Map', icon: Map },
  { path: '/dashboard', label: 'Dashboard', icon: BarChart2 },
  { path: '/leaderboard', label: 'Leaderboard', icon: Trophy },
]

export default function Nav() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, profile, logout } = useAuthStore()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)

  const isActive = (path) => location.pathname === path

  // Live unread notification count
  useEffect(() => {
    if (!user) { setUnreadCount(0); return }
    const q = query(
      collection(db, 'notifications'),
      where('user_id', '==', user.uid),
      where('read', '==', false)
    )
    const unsub = onSnapshot(q, snap => setUnreadCount(snap.size), () => {})
    return () => unsub()
  }, [user])

  const handleLogout = async () => {
    await logout()
    navigate('/')
  }

  if (['/login', '/register'].includes(location.pathname)) return null

  return (
    <>
      <nav className="nav">
        <div className="nav__inner">
          {/* Logo */}
          <Link to="/" className="nav__logo">
            <div className="nav__logo-icon">प्र</div>
            <div className="nav__logo-text-wrap">
              <span className="nav__logo-text"><span className="gradient-text">Prastab</span></span>
              <span className="nav__logo-devanagari">प्रस्ताव</span>
            </div>
          </Link>

          {/* Desktop Links */}
          {user && (
            <div className="nav__links hide-mobile">
              {NAV_LINKS.map(({ path, label, icon: Icon }) => (
                <Link
                  key={path}
                  to={path}
                  className={`nav__link ${isActive(path) ? 'nav__link--active' : ''}`}
                >
                  <Icon size={16} />
                  <span>{label}</span>
                </Link>
              ))}
              {profile?.role === 'authority' || profile?.role === 'admin' ? (
                <Link
                  to="/authority"
                  className={`nav__link nav__link--authority ${isActive('/authority') ? 'nav__link--active' : ''}`}
                >
                  <Shield size={16} />
                  <span>Authority</span>
                </Link>
              ) : null}
            </div>
          )}

          {/* Right Actions */}
          <div className="nav__actions">
            {user ? (
              <>
                {/* Report CTA */}
                <Link to="/report" className="btn btn--primary btn--sm hide-mobile">
                  <Plus size={15} />
                  Report Issue
                </Link>

                {/* Notifications with live badge */}
                <Link to="/notifications" className="nav__icon-btn" style={{ position: 'relative' }}>
                  <Bell size={18} />
                  {unreadCount > 0 && (
                    <span className="nav__notif-badge">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </Link>

                {/* Profile */}
                <Link to="/profile" className="nav__icon-btn">
                  <User size={18} />
                </Link>

                {/* Points badge */}
                {profile && (
                  <div className="nav__points">
                    ⚡ {(profile.points || 0).toLocaleString()}
                  </div>
                )}

                {/* Logout */}
                <button onClick={handleLogout} className="nav__icon-btn hide-mobile" title="Logout">
                  <LogOut size={18} />
                </button>
              </>
            ) : (
              <>
                <Link to="/login" className="btn btn--ghost btn--sm">Log in</Link>
                <Link to="/register" className="btn btn--primary btn--sm">Sign up</Link>
              </>
            )}

            {/* Mobile hamburger */}
            <button
              className="nav__icon-btn show-mobile-only"
              onClick={() => setMobileOpen(!mobileOpen)}
            >
              {mobileOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile Menu */}
      {mobileOpen && user && (
        <div className="nav__mobile-menu animate-slide-up">
          {NAV_LINKS.map(({ path, label, icon: Icon }) => (
            <Link
              key={path}
              to={path}
              className={`nav__mobile-link ${isActive(path) ? 'nav__mobile-link--active' : ''}`}
              onClick={() => setMobileOpen(false)}
            >
              <Icon size={18} />
              {label}
            </Link>
          ))}
          <Link
            to="/report"
            className="btn btn--primary btn--full"
            onClick={() => setMobileOpen(false)}
          >
            <Plus size={16} />
            Report Issue
          </Link>
          <button onClick={handleLogout} className="nav__mobile-link" style={{ color: 'var(--danger)' }}>
            <LogOut size={18} />
            Log out
          </button>
        </div>
      )}
    </>
  )
}

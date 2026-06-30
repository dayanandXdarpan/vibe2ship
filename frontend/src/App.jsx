import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, Suspense, lazy, useState } from 'react'
import { Toaster } from 'react-hot-toast'
import useAuthStore from './store/authStore'
import Nav from './components/common/Nav'
import ErrorBoundary from './components/common/ErrorBoundary'
import './styles/index.css'

// Lazy-loaded pages
const Landing = lazy(() => import('./pages/Landing'))
const Feed = lazy(() => import('./pages/Feed'))
const ReportIssue = lazy(() => import('./pages/ReportIssue'))
const MapExplorer = lazy(() => import('./pages/MapExplorer'))
const IssueDetail = lazy(() => import('./pages/IssueDetail'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Leaderboard = lazy(() => import('./pages/Leaderboard'))
const AuthorityPortal = lazy(() => import('./pages/AuthorityPortal'))
const Profile = lazy(() => import('./pages/Profile'))
const Notifications = lazy(() => import('./pages/Notifications'))
const Login = lazy(() => import('./pages/auth/Login'))
const Register = lazy(() => import('./pages/auth/Register'))
const NotFound = lazy(() => import('./pages/NotFound'))

// Route guard
function ProtectedRoute({ children, requiredRole = null }) {
  const { user, profile, loading } = useAuthStore()
  
  if (loading) return <PageLoader />
  if (!user) return <Navigate to="/login" replace />
  if (requiredRole && profile?.role !== requiredRole && profile?.role !== 'admin') {
    return <Navigate to="/" replace />
  }
  return children
}

function PageLoader() {
  return (
    <div style={{ 
      minHeight: '100vh', 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center',
      background: 'var(--bg-base)'
    }}>
      <div style={{ textAlign: 'center' }}>
        <div className="loading-spinner" />
        <p className="body-sm" style={{ color: 'var(--text-secondary)', marginTop: '16px' }}>
          Loading Prastab...
        </p>
      </div>
    </div>
  )
}

export default function App() {
  const initAuth = useAuthStore(state => state.initAuth)
  const [installPrompt, setInstallPrompt] = useState(null)
  const [showInstall, setShowInstall] = useState(false)

  useEffect(() => {
    const unsubscribe = initAuth()
    return () => unsubscribe?.()
  }, [initAuth])

  // PWA install prompt
  useEffect(() => {
    const handler = (e) => {
      e.preventDefault()
      setInstallPrompt(e)
      setShowInstall(true)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstall = async () => {
    if (!installPrompt) return
    installPrompt.prompt()
    const { outcome } = await installPrompt.userChoice
    if (outcome === 'accepted') setShowInstall(false)
  }

  return (
    <BrowserRouter>
      <ErrorBoundary>
        <Nav />

        {/* PWA Install Banner */}
        {showInstall && (
          <div className="pwa-banner">
            <span>📱 Install Prastab as an app for the best experience</span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="btn btn--primary btn--sm" onClick={handleInstall}>Install</button>
              <button className="btn btn--ghost btn--sm" onClick={() => setShowInstall(false)}>×</button>
            </div>
          </div>
        )}

        <Suspense fallback={<PageLoader />}>
          <Routes>
          {/* Public */}
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          
          {/* Authenticated */}
          <Route path="/feed" element={<ProtectedRoute><Feed /></ProtectedRoute>} />
          <Route path="/report" element={<ProtectedRoute><ReportIssue /></ProtectedRoute>} />
          <Route path="/map" element={<ProtectedRoute><MapExplorer /></ProtectedRoute>} />
          <Route path="/issues/:id" element={<ProtectedRoute><IssueDetail /></ProtectedRoute>} />
          <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/leaderboard" element={<ProtectedRoute><Leaderboard /></ProtectedRoute>} />
          <Route path="/notifications" element={<ProtectedRoute><Notifications /></ProtectedRoute>} />
          <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
          
          {/* Authority only */}
          <Route 
            path="/authority" 
            element={
              <ProtectedRoute requiredRole="authority">
                <AuthorityPortal />
              </ProtectedRoute>
            } 
          />

          {/* 404 */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>

        {/* Global Toast notifications */}
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: 'var(--bg-elevated)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-default)',
              borderRadius: '10px',
              fontSize: '0.875rem',
            },
            success: { iconTheme: { primary: '#43D9AD', secondary: 'var(--bg-base)' } },
            error: { iconTheme: { primary: '#FF4D6D', secondary: 'var(--bg-base)' } },
          }}
        />
      </ErrorBoundary>
    </BrowserRouter>
  )
}

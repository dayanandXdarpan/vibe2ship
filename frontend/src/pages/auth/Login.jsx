import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Mail, Lock, Eye, EyeOff, LogIn, Globe } from 'lucide-react'
import useAuthStore from '../../store/authStore'
import toast from 'react-hot-toast'
import './Auth.css'

export default function Login() {
  const navigate = useNavigate()
  const { loginWithEmail, loginWithGoogle, loginAnonymously } = useAuthStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleEmail = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      await loginWithEmail(email, password)
      toast.success('Welcome back!')
      navigate('/feed')
    } catch (err) {
      toast.error(err.message || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  const handleGoogle = async () => {
    setLoading(true)
    try {
      await loginWithGoogle()
      toast.success('Welcome!')
      navigate('/feed')
    } catch (err) {
      toast.error(err.message || 'Google login failed')
    } finally {
      setLoading(false)
    }
  }

  const handleAnon = async () => {
    setLoading(true)
    try {
      await loginAnonymously()
      toast.success('Continuing as guest')
      navigate('/feed')
    } catch (err) {
      toast.error('Guest login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-bg">
        <div className="auth-glow auth-glow--1" />
        <div className="auth-glow auth-glow--2" />
      </div>

      <div className="auth-card card--glass animate-scale-in">
        <div className="auth-header">
          <div className="auth-logo">🏛️</div>
          <h1 className="display-md">Welcome back</h1>
          <p className="body-sm" style={{ color: 'var(--text-secondary)' }}>
            Sign in to report and track community issues
          </p>
        </div>

        {/* Google sign-in */}
        <button className="auth-google-btn" onClick={handleGoogle} disabled={loading}>
        <Globe size={18} />
          Continue with Google
        </button>

        <div className="auth-divider">
          <span>or</span>
        </div>

        <form onSubmit={handleEmail} className="auth-form">
          <div className="input-group">
            <label className="input-label">Email</label>
            <div className="auth-input-wrap">
              <Mail size={16} className="auth-input-icon" />
              <input
                type="email"
                className="input auth-input"
                placeholder="you@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                id="login-email"
              />
            </div>
          </div>

          <div className="input-group">
            <label className="input-label">Password</label>
            <div className="auth-input-wrap">
              <Lock size={16} className="auth-input-icon" />
              <input
                type={showPw ? 'text' : 'password'}
                className="input auth-input"
                placeholder="Your password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                id="login-password"
              />
              <button type="button" className="auth-toggle-pw" onClick={() => setShowPw(!showPw)}>
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <button type="submit" className="btn btn--primary btn--full btn--lg" disabled={loading} id="login-submit">
            {loading ? <span className="loading-dots" /> : <><LogIn size={18} /> Sign In</>}
          </button>
        </form>

        <button onClick={handleAnon} className="btn btn--ghost btn--full" disabled={loading}>
          Continue as Guest (limited access)
        </button>

        <p className="body-sm" style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
          Don't have an account?{' '}
          <Link to="/register" style={{ color: 'var(--primary-light)' }}>Sign up</Link>
        </p>
      </div>
    </div>
  )
}

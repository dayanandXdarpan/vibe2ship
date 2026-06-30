import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Mail, Lock, User, Eye, EyeOff, UserPlus, Globe } from 'lucide-react'
import useAuthStore from '../../store/authStore'
import toast from 'react-hot-toast'
import './Auth.css'

export default function Register() {
  const navigate = useNavigate()
  const { registerWithEmail, loginWithGoogle } = useAuthStore()
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' })
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)

  const update = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (form.password !== form.confirm) {
      toast.error('Passwords do not match')
      return
    }
    if (form.password.length < 6) {
      toast.error('Password must be at least 6 characters')
      return
    }
    setLoading(true)
    try {
      await registerWithEmail(form.email, form.password, form.name)
      toast.success('Account created! Welcome to Prastab 🏛️')
      navigate('/feed')
    } catch (err) {
      toast.error(err.message || 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  const handleGoogle = async () => {
    setLoading(true)
    try {
      await loginWithGoogle()
      toast.success('Welcome to Prastab!')
      navigate('/feed')
    } catch (err) {
      toast.error(err.message)
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
          <h1 className="display-md">Join the community</h1>
          <p className="body-sm" style={{ color: 'var(--text-secondary)' }}>
            Report issues, earn XP, and make your city better
          </p>
        </div>

        <button className="auth-google-btn" onClick={handleGoogle} disabled={loading}>
          <Globe size={18} />
          Sign up with Google
        </button>

        <div className="auth-divider"><span>or</span></div>

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="input-group">
            <label className="input-label">Full Name</label>
            <div className="auth-input-wrap">
              <User size={16} className="auth-input-icon" />
              <input
                type="text" className="input auth-input"
                placeholder="Your name" value={form.name}
                onChange={update('name')} required id="reg-name"
              />
            </div>
          </div>

          <div className="input-group">
            <label className="input-label">Email</label>
            <div className="auth-input-wrap">
              <Mail size={16} className="auth-input-icon" />
              <input
                type="email" className="input auth-input"
                placeholder="you@example.com" value={form.email}
                onChange={update('email')} required id="reg-email"
              />
            </div>
          </div>

          <div className="input-group">
            <label className="input-label">Password</label>
            <div className="auth-input-wrap">
              <Lock size={16} className="auth-input-icon" />
              <input
                type={showPw ? 'text' : 'password'} className="input auth-input"
                placeholder="Min. 6 characters" value={form.password}
                onChange={update('password')} required id="reg-password"
              />
              <button type="button" className="auth-toggle-pw" onClick={() => setShowPw(!showPw)}>
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div className="input-group">
            <label className="input-label">Confirm Password</label>
            <div className="auth-input-wrap">
              <Lock size={16} className="auth-input-icon" />
              <input
                type={showPw ? 'text' : 'password'} className="input auth-input"
                placeholder="Repeat password" value={form.confirm}
                onChange={update('confirm')} required id="reg-confirm"
              />
            </div>
          </div>

          <button type="submit" className="btn btn--primary btn--full btn--lg" disabled={loading} id="reg-submit">
            {loading ? <span className="loading-dots" /> : <><UserPlus size={18} /> Create Account</>}
          </button>
        </form>

        <p className="body-sm" style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
          Already have an account?{' '}
          <Link to="/login" style={{ color: 'var(--primary-light)' }}>Sign in</Link>
        </p>
      </div>
    </div>
  )
}

import React, { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import './Auth.css'

export default function Signup() {
  const { signUp, signInWithGoogle } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ fullName: '', email: '', password: '', role: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function set(key) { return e => setForm(f => ({ ...f, [key]: e.target.value })) }

  async function handleSignup(e) {
    e.preventDefault()
    if (!form.role) { setError('Please select your role'); return }
    setError('')
    setLoading(true)
    try {
      await signUp(form)
      navigate('/')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-logo">
          <div className="auth-logo-mark">M</div>
          <div className="auth-logo-text">Mentor<em>Space</em></div>
        </div>

        <h1 className="auth-title">Create your account</h1>
        <p className="auth-sub">Join the mentoring platform</p>

        <button className="google-btn" onClick={() => signInWithGoogle()}>
          <svg width="18" height="18" viewBox="0 0 18 18">
            <path fill="#4285F4" d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 0 0 2.38-5.88c0-.57-.05-.66-.15-1.18z"/>
            <path fill="#34A853" d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2a4.8 4.8 0 0 1-7.18-2.54H1.83v2.07A8 8 0 0 0 8.98 17z"/>
            <path fill="#FBBC05" d="M4.5 10.52a4.8 4.8 0 0 1 0-3.04V5.41H1.83a8 8 0 0 0 0 7.18l2.67-2.07z"/>
            <path fill="#EA4335" d="M8.98 4.18c1.17 0 2.23.4 3.06 1.2l2.3-2.3A8 8 0 0 0 1.83 5.4L4.5 7.49a4.77 4.77 0 0 1 4.48-3.3z"/>
          </svg>
          Continue with Google
        </button>

        <div className="auth-divider"><span>or</span></div>

        {/* Role picker */}
        <div className="role-pick">
          <button
            className={`role-pick-btn ${form.role === 'mentor' ? 'active' : ''}`}
            onClick={() => setForm(f => ({ ...f, role: 'mentor' }))} type="button"
          >
            <span className="role-pick-icon">🎓</span>
            <span className="role-pick-label">I'm a Mentor</span>
            <span className="role-pick-sub">I guide others</span>
          </button>
          <button
            className={`role-pick-btn ${form.role === 'mentee' ? 'active' : ''}`}
            onClick={() => setForm(f => ({ ...f, role: 'mentee' }))} type="button"
          >
            <span className="role-pick-icon">🙋</span>
            <span className="role-pick-label">I'm a Mentee</span>
            <span className="role-pick-sub">I want to learn</span>
          </button>
        </div>

        <form onSubmit={handleSignup}>
          <div className="auth-field">
            <label className="auth-label">Full Name</label>
            <input className="auth-input" placeholder="Arjun Kapoor"
              value={form.fullName} onChange={set('fullName')} required />
          </div>
          <div className="auth-field">
            <label className="auth-label">Email</label>
            <input className="auth-input" type="email" placeholder="you@example.com"
              value={form.email} onChange={set('email')} required />
          </div>
          <div className="auth-field">
            <label className="auth-label">Password</label>
            <input className="auth-input" type="password" placeholder="Min 8 characters"
              value={form.password} onChange={set('password')} required minLength={8} />
          </div>
          {error && <div className="auth-error">⚠ {error}</div>}
          <button className="auth-btn" type="submit" disabled={loading || !form.role}>
            {loading ? 'Creating account…' : 'Create Account →'}
          </button>
        </form>

        <p className="auth-switch">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  )
}

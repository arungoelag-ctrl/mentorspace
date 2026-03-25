import React, { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import './Auth.css'

const TEST_MENTORS = [
  { name: 'Arjun Kapoor', email: 'arjun.mentor@test.com', password: 'Test@1234' },
  { name: 'Priya Sharma', email: 'priya.mentor@test.com', password: 'Test@1234' },
  { name: 'Vikram Nair',  email: 'vikram.mentor@test.com', password: 'Test@1234' },
]

const TEST_MENTEES = [
  { name: 'Rahul Gupta', email: 'rahul.mentee@test.com', password: 'Test@1234' },
  { name: 'Sneha Patel', email: 'sneha.mentee@test.com', password: 'Test@1234' },
  { name: 'Amit Singh',  email: 'amit.mentee@test.com',  password: 'Test@1234' },
  { name: 'Deepa Rao',   email: 'deepa.mentee@test.com', password: 'Test@1234' },
  { name: 'Kartik Jain', email: 'kartik.mentee@test.com', password: 'Test@1234' },
]

export default function Login() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function fillAccount(account) {
    setEmail(account.email)
    setPassword(account.password)
    setError('')
  }

  async function handleLogin(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await signIn({ email, password })
      navigate('/')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card login-wide">
        <div className="auth-logo">
          <div className="auth-logo-mark">M</div>
          <div className="auth-logo-text">Mentor<em>Space</em></div>
        </div>

        <h1 className="auth-title">Welcome back</h1>

        {/* Quick login section */}
        <div className="quick-login-section">
          <div className="quick-login-label">🎓 Quick Login — Mentors</div>
          <div className="quick-login-grid">
            {TEST_MENTORS.map(m => (
              <button key={m.email} className="quick-btn mentor-quick" onClick={() => fillAccount(m)} type="button">
                <div className="quick-avatar mentor-av">{m.name.split(' ').map(n=>n[0]).join('')}</div>
                <span>{m.name}</span>
              </button>
            ))}
          </div>

          <div className="quick-login-label" style={{marginTop: 14}}>🙋 Quick Login — Mentees</div>
          <div className="quick-login-grid">
            {TEST_MENTEES.map(m => (
              <button key={m.email} className="quick-btn mentee-quick" onClick={() => fillAccount(m)} type="button">
                <div className="quick-avatar mentee-av">{m.name.split(' ').map(n=>n[0]).join('')}</div>
                <span>{m.name}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="auth-divider"><span>or enter manually</span></div>

        <form onSubmit={handleLogin}>
          <div className="auth-field">
            <label className="auth-label">Email</label>
            <input className="auth-input" type="email" placeholder="you@example.com"
              value={email} onChange={e => setEmail(e.target.value)} required />
          </div>
          <div className="auth-field">
            <label className="auth-label">Password</label>
            <input className="auth-input" type="password" placeholder="••••••••"
              value={password} onChange={e => setPassword(e.target.value)} required />
          </div>
          {error && <div className="auth-error">⚠ {error}</div>}
          <button className="auth-btn" type="submit" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign In →'}
          </button>
        </form>

        <p className="auth-switch">
          Don't have an account? <Link to="/signup">Create one</Link>
        </p>
      </div>
    </div>
  )
}

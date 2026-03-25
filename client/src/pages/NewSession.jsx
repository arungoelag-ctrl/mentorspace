import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import { createMeeting } from '../lib/api'
import MenteeHistory from './MenteeHistory'
import './NewSession.css'

const COLORS = ['#6c74f7', '#e8b84b', '#3dd68c', '#c792ea', '#f06060', '#4fc3f7']

export default function NewSession() {
  const navigate = useNavigate()
  const { profile, user } = useAuth()
  const [mentees, setMentees] = useState([])
  const [selectedMentee, setSelectedMentee] = useState(null)
  const [topic, setTopic] = useState('')
  const [duration, setDuration] = useState(60)
  const [loading, setLoading] = useState(false)
  const [loadingUsers, setLoadingUsers] = useState(true)
  const [result, setResult] = useState(null)
  const [err, setErr] = useState('')
  const [showHistory, setShowHistory] = useState(false)

  const yourName = profile?.full_name || ''
  const yourEmail = user?.email || ''
  const initials = yourName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()

  useEffect(() => { fetchMentees() }, [profile])

  async function fetchMentees() {
    if (!profile) return
    setLoadingUsers(true)
    try {
      const { data } = await supabase.from('profiles').select('*')
        .eq('role', 'mentee').neq('id', profile.id)
      setMentees(data || [])
      if (data?.length > 0) setSelectedMentee(data[0])
    } finally { setLoadingUsers(false) }
  }

  async function handleCreate(e) {
    e.preventDefault()
    if (!topic.trim()) { setErr('Please enter a session topic.'); return }
    if (!selectedMentee) { setErr('Please select a mentee'); return }
    setErr(''); setLoading(true)
    try {
      const meeting = await createMeeting({ topic, duration, mentorName: yourName })
      const sessionData = {
        meetingNumber: meeting.meetingId,
        password: meeting.password || '',
        userName: yourName, userEmail: yourEmail,
        role: 1, topic: meeting.topic,
        mentorName: yourName, menteeName: selectedMentee.full_name,
        joinUrl: meeting.joinUrl,
      }
      sessionStorage.setItem('session', JSON.stringify(sessionData))
      setResult({ ...meeting, ...sessionData })
    } catch (e) { setErr('Failed to create meeting: ' + e.message) }
    finally { setLoading(false) }
  }

  if (result) return (
    <div className="ns-wrap">
      <div className="success-card">
        <div className="success-tick">✓</div>
        <h2 className="success-title">Meeting Created!</h2>
        <p className="success-sub">Share the Meeting ID with {result.menteeName}</p>

        <div className="meeting-details">
          <div className="md-row"><span className="md-label">Topic</span><span className="md-value">{result.topic}</span></div>
          <div className="md-row highlight-row">
            <span className="md-label">Meeting ID</span>
            <span className="md-value mono big">{result.meetingNumber}</span>
            <button className="copy-btn" onClick={() => navigator.clipboard.writeText(result.meetingNumber)}>Copy</button>
          </div>
          {result.password && (
            <div className="md-row highlight-row">
              <span className="md-label">Password</span>
              <span className="md-value mono big">{result.password}</span>
              <button className="copy-btn" onClick={() => navigator.clipboard.writeText(result.password)}>Copy</button>
            </div>
          )}
          <div className="md-row">
            <span className="md-label">With</span>
            <span className="md-value">{result.menteeName}</span>
          </div>
        </div>

        <div className="device-note" style={{marginBottom:12}}>
          🎙 Chrome will ask for mic, speaker and camera — click Allow on all three.
        </div>

        <div className="success-actions">
          <button className="btn-secondary-lg" onClick={() => setShowHistory(true)}>
            📋 View History & Brief
          </button>
          <button className="btn-primary-lg" onClick={() => {
            sessionStorage.setItem('autoJoin', 'true')
            navigate(`/session/${result.meetingNumber}`)
          }}>▶ Join Now as Mentor</button>
          <button className="btn-ghost" onClick={() => { setResult(null); setTopic('') }}>← Create Another</button>
          <button className="btn-ghost" onClick={() => navigate('/')}>← Dashboard</button>
        </div>
      </div>

      {showHistory && (
        <MenteeHistory
          menteeName={selectedMentee?.full_name || ''}
          mentorName={yourName}
          onClose={() => setShowHistory(false)}
          onJoinMeeting={() => {
            setShowHistory(false)
            sessionStorage.setItem('autoJoin', 'true')
            navigate(`/session/${result.meetingNumber}`)
          }}
        />
      )}
    </div>
  )

  return (
    <div className="ns-wrap">
      <div className="ns-grid">
        <div className="ns-form-card">
          <div className="ns-back" onClick={() => navigate('/')}>← Back to Dashboard</div>
          <h2 className="ns-title">New Session</h2>
          <p className="ns-sub">Create a Zoom meeting with your mentee</p>

          <form onSubmit={handleCreate}>
            <div className="section">
              <div className="section-label">Choose Mentee</div>
              {loadingUsers ? <div className="ns-loading">Loading mentees…</div> :
               mentees.length === 0 ? <div className="ns-empty">No mentees found.</div> : (
                <div className="mentor-list">
                  {mentees.map((m, i) => (
                    <label key={m.id} className={`mentor-option ${selectedMentee?.id === m.id ? 'selected' : ''}`}>
                      <input type="radio" name="mentee" value={m.id}
                        checked={selectedMentee?.id === m.id}
                        onChange={() => setSelectedMentee(m)} hidden />
                      <div className="m-avatar" style={{ background: COLORS[i % COLORS.length] }}>
                        {m.full_name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                      </div>
                      <div className="m-info">
                        <div className="m-name">{m.full_name}</div>
                        <div className="m-title">{m.email}</div>
                      </div>
                      {selectedMentee?.id === m.id && <span className="m-check">✓</span>}
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="section">
              <div className="section-label">Session Details</div>
              <div className="field">
                <label className="field-label">Topic / Goal</label>
                <input className="field-input" placeholder="e.g. System Design — Design a URL Shortener"
                  value={topic} onChange={e => setTopic(e.target.value)} />
              </div>
              <div className="field">
                <label className="field-label">Duration</label>
                <select className="field-input" value={duration} onChange={e => setDuration(Number(e.target.value))}>
                  <option value={30}>30 minutes</option>
                  <option value={45}>45 minutes</option>
                  <option value={60}>60 minutes</option>
                  <option value={90}>90 minutes</option>
                </select>
              </div>
            </div>

            <div className="section">
              <div className="section-label">You <span className="autofill-badge">auto-filled</span></div>
              <div className="logged-in-banner">
                <div className="li-avatar">{initials}</div>
                <div className="li-info">
                  <div className="li-name">{yourName}</div>
                  <div className="li-email">{yourEmail}</div>
                </div>
                <div className="li-role">🎓 Mentor</div>
              </div>
            </div>

            {err && <div className="err-box">⚠ {err}</div>}
            <button className="btn-primary-lg" type="submit" disabled={loading || !selectedMentee}>
              {loading ? '⏳ Creating Zoom Meeting…' : '📹 Create Zoom Meeting'}
            </button>
          </form>
        </div>

        <div className="ns-side">
          <div className="preview-card">
            <div className="preview-label">Session Preview</div>
            <div className="preview-pair">
              <div className="preview-user">
                <div className="preview-avatar" style={{ background: 'linear-gradient(135deg,#6c74f7,#9c73f8)' }}>{initials}</div>
                <div className="preview-user-name">{yourName || 'You'}</div>
                <div className="preview-user-role">Mentor</div>
              </div>
              <div className="preview-arrow">⟷</div>
              <div className="preview-user">
                <div className="preview-avatar" style={{ background: COLORS[1] }}>
                  {selectedMentee?.full_name.split(' ').map(n => n[0]).join('').slice(0, 2) || '?'}
                </div>
                <div className="preview-user-name">{selectedMentee?.full_name.split(' ')[0] || '—'}</div>
                <div className="preview-user-role">Mentee</div>
              </div>
            </div>
            <div className="preview-topic">{topic || 'Your session topic'}</div>
            <div className="preview-meta">{duration} min session</div>
          </div>

          <div className="how-card">
            <div className="how-title">How it works</div>
            {[
              ['1', 'Click Create — real Zoom meeting via API'],
              ['2', 'Get Meeting ID instantly'],
              ['3', 'Review mentee history & brief'],
              ['4', 'Click Join — Zoom loads right in this app'],
            ].map(([n, text]) => (
              <div key={n} className="how-item">
                <span className="how-num">{n}</span><span>{text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

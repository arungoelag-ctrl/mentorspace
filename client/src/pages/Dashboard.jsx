import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import './Dashboard.css'

const SESSIONS = [
  { id: 'meet_live', mentor: 'Priya Mehta', mentee: 'Arjun Kapoor', topic: 'System Design', status: 'live',     time: 'Now',      meetingNumber: '' },
  { id: 'meet_002',  mentor: 'Aryan Gupta', mentee: 'Sana K.',      topic: 'PM Strategy',  status: 'upcoming',  time: 'Today 3 PM', meetingNumber: '' },
  { id: 'meet_003',  mentor: 'Nalini Rao',  mentee: 'Vikas N.',     topic: 'UX Portfolio', status: 'done',      time: 'Yesterday',  meetingNumber: '' },
]

export default function Dashboard() {
  const navigate = useNavigate()
  const [meetingId, setMeetingId] = useState('')

  function handleJoinCustom(e) {
    e.preventDefault()
    if (meetingId.trim()) navigate(`/session/${meetingId.trim().replace(/\s/g,'')}`)
  }

  return (
    <div className="dashboard">
      {/* header */}
      <div className="dash-header">
        <div>
          <h1 className="dash-title">Good morning, Arjun 👋</h1>
          <p className="dash-sub">Your mentor-mentee workspace is ready.</p>
        </div>
        <button className="btn btn-primary" onClick={() => navigate('/new')}>
          + Schedule Session
        </button>
      </div>

      {/* stats */}
      <div className="stats-row">
        {[
          { label: 'Sessions Done', value: '47', delta: '+12%', color: 'var(--accent)' },
          { label: 'Hours Mentored', value: '63', delta: '+8 hrs', color: 'var(--green)' },
          { label: 'Active Pairs',   value: '14', delta: '3 new',  color: 'var(--amber)' },
          { label: 'Avg Rating',     value: '4.8', delta: '42 reviews', color: 'var(--red)' },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <div className="stat-accent-bar" style={{ background: s.color }} />
            <div className="stat-label">{s.label}</div>
            <div className="stat-value">{s.value}</div>
            <div className="stat-delta">{s.delta}</div>
          </div>
        ))}
      </div>

      {/* quick join */}
      <div className="quick-join-card">
        <div className="qj-left">
          <span className="qj-icon">🔗</span>
          <div>
            <div className="qj-title">Quick Join by Meeting ID</div>
            <div className="qj-sub">Paste a Zoom meeting number to jump straight in</div>
          </div>
        </div>
        <form className="qj-form" onSubmit={handleJoinCustom}>
          <input
            className="qj-input"
            placeholder="e.g. 838 1683 9978"
            value={meetingId}
            onChange={e => setMeetingId(e.target.value)}
          />
          <button className="btn btn-primary btn-sm" type="submit">Join →</button>
        </form>
      </div>

      {/* sessions table */}
      <div className="section-head">
        <h2 className="section-title">Recent &amp; Upcoming</h2>
      </div>
      <div className="sessions-table">
        <div className="tbl-header">
          <span>Pair</span><span>Topic</span><span>Time</span><span>Status</span><span>Action</span>
        </div>
        {SESSIONS.map(s => (
          <div key={s.id} className="tbl-row">
            <div className="tbl-pair">
              <div className="pair-stack">
                <div className="mini-avatar a1">{s.mentor[0]}</div>
                <div className="mini-avatar a2">{s.mentee[0]}</div>
              </div>
              <div>
                <div className="pair-names">{s.mentor} → {s.mentee}</div>
              </div>
            </div>
            <span className="tbl-topic">{s.topic}</span>
            <span className="tbl-time">{s.time}</span>
            <span className={`badge badge-${s.status}`}>
              {s.status === 'live' && <span className="live-dot" />}
              {s.status}
            </span>
            <div>
              {s.status === 'live' && (
                <button className="btn btn-success btn-sm" onClick={() => navigate('/session/live')}>
                  Join Now
                </button>
              )}
              {s.status === 'upcoming' && (
                <button className="btn btn-ghost btn-sm" onClick={() => navigate('/new')}>Prepare</button>
              )}
              {s.status === 'done' && (
                <button className="btn btn-ghost btn-sm">View Notes</button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

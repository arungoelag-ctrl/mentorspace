import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import './MentorRequests.css'

const STAGE_COLORS = { Validation: '#e8b84b', Traction: '#3dd68c', Scaling: '#6c74f7' }

export default function MenteeRequests({ embedded = false, initialFilter = 'all' }) {
  const { profile, user } = useAuth()
  const navigate = useNavigate()
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState(initialFilter)
  const [respondingId, setRespondingId] = useState(null)
  const [accepting, setAccepting] = useState(false)

  useEffect(() => { if (profile) fetchRequests() }, [profile])
  useEffect(() => { setFilterStatus(initialFilter) }, [initialFilter])

  async function fetchRequests() {
    setLoading(true)
    try {
      const { data } = await supabase.from('meeting_requests').select('*')
        .eq('mentee_email', user?.email)
        .order('created_at', { ascending: false })
      setRequests(data || [])
    } finally { setLoading(false) }
  }

  async function acceptReschedule(req) {
    setAccepting(true)
    try {
      // Create Zoom meeting for the new time
      const meetingRes = await fetch('/api/meetings/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: `${req.company_name} - ${req.company_stage}`, duration: 60, mentorName: req.mentor_name })
      })
      const meeting = await meetingRes.json()
      await supabase.from('meeting_requests').update({
        status: 'accepted',
        requested_date: req.alternate_date,
        requested_slot: req.alternate_slot,
        zoom_meeting_id: meeting.meetingId,
        zoom_password: meeting.password,
        zoom_join_url: meeting.joinUrl,
        updated_at: new Date()
      }).eq('id', req.id)
      await fetchRequests()
      setRespondingId(null)
    } finally { setAccepting(false) }
  }

  async function declineReschedule(req) {
    await supabase.from('meeting_requests').update({ status: 'declined', updated_at: new Date() }).eq('id', req.id)
    await fetchRequests()
    setRespondingId(null)
  }

  const filtered = requests.filter(r => filterStatus === 'all' || r.status === filterStatus)

  return (
    <div className={embedded ? "mreq-wrap mreq-embedded" : "mreq-wrap"}>
      {!embedded && <div className="mreq-header">
        <button className="avail-back" onClick={() => navigate('/')}>← Dashboard</button>
        <div>
          <div className="avail-title">My Meeting Requests</div>
          <div className="avail-sub">Track your requests and join accepted meetings</div>
        </div>
        <button className="avail-add-btn" onClick={() => navigate('/discover')}>🔍 Discover Mentors</button>
      </div>}

      <div className="mreq-tabs">
        {[['all','All',requests.length],['pending','Pending',requests.filter(r=>r.status==='pending').length],['accepted','Accepted',requests.filter(r=>r.status==='accepted').length],['rescheduled','Rescheduled',requests.filter(r=>r.status==='rescheduled').length],['declined','Declined',requests.filter(r=>r.status==='declined').length]].map(([val,label,count]) => (
          <button key={val} className={`mreq-tab ${filterStatus===val?'active':''}`} onClick={() => setFilterStatus(val)}>
            {label} <span className="mreq-tab-count">{count}</span>
          </button>
        ))}
      </div>

      {loading ? <div className="avail-loading">Loading…</div> :
       filtered.length === 0 ? (
        <div className="avail-empty">
          <div className="avail-empty-icon">📬</div>
          <p>No {filterStatus === 'all' ? '' : filterStatus} requests.</p>
          <button className="avail-add-btn" style={{marginTop:12}} onClick={() => navigate('/discover')}>🔍 Find a Mentor</button>
        </div>
       ) : (
        <div className="mreq-list" style={{maxWidth:720}}>
          {filtered.map(req => (
            <div key={req.id} className="mreq-card">
              <div className="mreq-card-top">
                <div className="mreq-mentee-avatar">{req.mentor_name?.split(' ').map(n=>n[0]).join('').slice(0,2)}</div>
                <div className="mreq-card-info">
                  <div className="mreq-mentee-name">{req.mentor_name}</div>
                  <div className="mreq-company">{req.company_name}</div>
                </div>
                <div className="mreq-card-right">
                  <span className="mreq-stage-badge" style={{background:`${STAGE_COLORS[req.company_stage]}20`,color:STAGE_COLORS[req.company_stage],border:`1px solid ${STAGE_COLORS[req.company_stage]}40`}}>{req.company_stage}</span>
                </div>
              </div>

              <div className="mreq-card-date">
                📅 {req.requested_date} · 🕐 {req.requested_slot?.start}–{req.requested_slot?.end}
                <span className="mreq-tz"> ({req.timezone})</span>
              </div>

              {/* Rescheduled - show new time and respond */}
              {req.status === 'rescheduled' && (
                <div className="mreq-reschedule-notice">
                  <div className="mreq-reschedule-title">📅 Mentor suggested a new time:</div>
                  <div className="mreq-reschedule-time">{req.alternate_date} · {req.alternate_slot?.start}–{req.alternate_slot?.end}</div>
                  {req.mentor_note && <div className="mreq-mentor-note">"{req.mentor_note}"</div>}
                  {respondingId === req.id ? (
                    <div style={{display:'flex',gap:8,marginTop:10}}>
                      <button className="mreq-accept-btn" style={{flex:1}} onClick={() => acceptReschedule(req)} disabled={accepting}>
                        {accepting ? '⏳' : '✓ Accept New Time'}
                      </button>
                      <button className="mreq-decline-btn" onClick={() => declineReschedule(req)}>Decline</button>
                      <button className="avail-cancel-btn" onClick={() => setRespondingId(null)}>Cancel</button>
                    </div>
                  ) : (
                    <button className="mreq-reschedule-btn" style={{marginTop:8}} onClick={() => setRespondingId(req.id)}>Respond to New Time</button>
                  )}
                </div>
              )}

              {/* Declined */}
              {req.status === 'declined' && req.mentor_note && (
                <div className="mreq-declined-note">
                  <strong>Reason:</strong> {req.mentor_note}
                </div>
              )}

              {/* Accepted - Zoom details */}
              {req.status === 'accepted' && req.zoom_meeting_id && (
                <div className="mreq-zoom-bar">
                  <span>Meeting ID: <strong>{req.zoom_meeting_id}</strong></span>
                  {req.zoom_password && <span>PW: <strong>{req.zoom_password}</strong></span>}
                  <button className="mreq-join-btn" onClick={() => {
                    const s = { meetingNumber: req.zoom_meeting_id, password: req.zoom_password || '', topic: req.company_name, mentorName: req.mentor_name, menteeName: profile?.full_name, role: 0 }
                    sessionStorage.setItem('session', JSON.stringify(s))
                    navigate(`/session/${req.zoom_meeting_id}`)
                  }}>▶ Join Meeting</button>
                </div>
              )}
            </div>
          ))}
        </div>
       )}
    </div>
  )
}

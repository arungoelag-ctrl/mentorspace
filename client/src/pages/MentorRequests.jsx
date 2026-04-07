import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import './MentorRequests.css'

const STAGE_COLORS = { Validation: '#e8b84b', Traction: '#3dd68c', Scaling: '#6c74f7' }

export default function MentorRequests({ embedded = false, initialFilter = 'pending' }) {
  const { profile, user } = useAuth()
  const navigate = useNavigate()
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [briefCache, setBriefCache] = useState({})
  const [briefLoading, setBriefLoading] = useState(false)
  const [menteeProfile, setMenteeProfile] = useState(null)
  const [brief, setBrief] = useState(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [respondingId, setRespondingId] = useState(null)
  const [rescheduleDate, setRescheduleDate] = useState('')
  const [rescheduleStart, setRescheduleStart] = useState('')
  const [rescheduleEnd, setRescheduleEnd] = useState('')
  const [mentorNote, setMentorNote] = useState('')
  const [filterStatus, setFilterStatus] = useState(initialFilter)

  useEffect(() => { if (profile) fetchRequests() }, [profile])
  useEffect(() => { setFilterStatus(initialFilter) }, [initialFilter])

  async function fetchRequests() {
    setLoading(true)
    try {
      const { data } = await supabase.from('meeting_requests').select('*')
        .eq('mentor_email', user?.email)
        .order('created_at', { ascending: false })
      setRequests(data || [])
    } finally { setLoading(false) }
  }

  async function loadBrief(req) {
    // Fetch mentee profile for company details
    supabase.from('profiles').select('product,state,location,revenue_lakhs,employee_count,theme,problem_statement')
      .eq('email', req.mentee_email).single()
      .then(({data}) => setMenteeProfile(data || null))
    
    setSelected(req)
    setBrief(null)
    setRespondingId(null)

    // 1. Check in-memory cache first
    if (briefCache[req.id]) {
      setBrief(briefCache[req.id])
      return
    }

    // 2. Check DB for saved brief — only use if it matches this exact request
    try {
      const { data: saved } = await supabase
        .from('pre_meeting_briefs')
        .select('*')
        .eq('mentee_name', req.mentee_name)
        .eq('mentor_email', user?.email)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (saved && saved.meeting_request_id === req.id) {
        const cached = { brief: saved, sessions: [] }
        setBrief(cached)
        setBriefCache(prev => ({...prev, [req.id]: cached}))
        return
      }
    } catch(e) { /* no saved brief found */ }

    // 3. Generate fresh brief
    setBriefLoading(true)
    try {
      // Get mentee profile for richer context
      const { data: mp } = await supabase.from('profiles').select('product,state,location,revenue_lakhs,employee_count,theme,problem_statement').eq('email', req.mentee_email).single()
      setMenteeProfile(mp || null)

      const res = await fetch(`/api/brief-with-context/${encodeURIComponent(req.mentee_name)}?` + new URLSearchParams({
        companyName: req.company_name,
        mentorEmail: user?.email,
        companyUrl: req.company_url || '',
        stage: req.company_stage,
        goal: req.meeting_goal,
        requestId: req.id,
        product: mp?.product || '',
        location: mp?.location || '',
        state: mp?.state || '',
        revenueLakhs: mp?.revenue_lakhs || '',
        employeeCount: mp?.employee_count || '',
        theme: mp?.theme || '',
        companyInfo: req.company_info || ''
      }))
      const data = await res.json()
      setBrief(data)
      setBriefCache(prev => ({...prev, [req.id]: data}))
    } finally { setBriefLoading(false) }
  }

  async function acceptRequest(req) {
    setActionLoading(true)
    try {
      const meetingRes = await fetch('/api/meetings/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: `${req.company_name} - ${req.company_stage}`,
          duration: 60,
          mentorName: profile?.full_name,
          meetingType: 2,
          startTime: req.requested_date && req.requested_slot?.start
            ? `${req.requested_date}T${req.requested_slot.start}:00`
            : null
        })
      })
      const meeting = await meetingRes.json()
      await supabase.from('meeting_requests').update({
        status: 'accepted',
        zoom_meeting_id: meeting.meetingId,
        zoom_password: meeting.password,
        zoom_join_url: meeting.joinUrl,
        updated_at: new Date()
      }).eq('id', req.id)
      if (req.requested_date) {
        const { data: avail } = await supabase.from('mentor_availability').select('*')
          .eq('mentor_email', user?.email).eq('date', req.requested_date).single()
        if (avail) {
          const updatedSlots = avail.slots.map(s =>
            s.start === req.requested_slot?.start ? { ...s, booked: true } : s)
          await supabase.from('mentor_availability').update({ slots: updatedSlots }).eq('id', avail.id)
        }
      }
      await fetchRequests()
      setSelected(null)
    } finally { setActionLoading(false) }
  }

  async function declineRequest(req) {
    setActionLoading(true)
    try {
      await supabase.from('meeting_requests').update({
        status: 'declined', mentor_note: mentorNote, updated_at: new Date()
      }).eq('id', req.id)
      await fetchRequests()
      setSelected(null)
      setRespondingId(null)
    } finally { setActionLoading(false) }
  }

  async function rescheduleRequest(req) {
    if (!rescheduleDate || !rescheduleStart) return
    setActionLoading(true)
    try {
      await supabase.from('meeting_requests').update({
        status: 'rescheduled',
        alternate_date: rescheduleDate,
        alternate_slot: { start: rescheduleStart, end: rescheduleEnd },
        mentor_note: mentorNote,
        updated_at: new Date()
      }).eq('id', req.id)
      await fetchRequests()
      setSelected(null)
      setRespondingId(null)
    } finally { setActionLoading(false) }
  }

  const filtered = requests.filter(r => filterStatus === 'all' || r.status === filterStatus)
  const counts = {
    pending: requests.filter(r => r.status === 'pending').length,
    accepted: requests.filter(r => r.status === 'accepted').length,
    declined: requests.filter(r => r.status === 'declined').length,
    rescheduled: requests.filter(r => r.status === 'rescheduled').length
  }

  return (
    <div className={embedded ? "mreq-wrap mreq-embedded" : "mreq-wrap"}>
      {!embedded && <div className="mreq-header">
        <button className="mreq-back-btn" onClick={() => navigate('/')}>← Dashboard</button>
        <div className="mreq-header-text">
          <div className="mreq-title">Meeting Requests</div>
          <div className="mreq-subtitle">Review and respond to mentee meeting requests</div>
        </div>
        <button className="mreq-avail-btn" onClick={() => navigate('/availability')}>
          <span>📅</span> My Availability
        </button>
      </div>}

      <div className="mreq-tabs">
        {[['all','All',requests.length],['pending','Pending',counts.pending],['accepted','Accepted',counts.accepted],['rescheduled','Rescheduled',counts.rescheduled],['declined','Declined',counts.declined]].map(([val,label,count]) => (
          <button key={val} className={`mreq-tab ${filterStatus===val?'active':''}`} onClick={() => setFilterStatus(val)}>
            {label} <span className="mreq-tab-count">{count}</span>
          </button>
        ))}
      </div>

      <div className="mreq-body">
        <div className="mreq-list">
          {loading ? <div className="mreq-loading">Loading requests…</div> :
           filtered.length === 0 ? (
            <div className="mreq-empty">
              <div className="mreq-empty-icon">📬</div>
              <p>No {filterStatus === 'all' ? '' : filterStatus} requests</p>
            </div>
           ) : filtered.map(req => (
            <div key={req.id}
              className={`mreq-card ${selected?.id === req.id ? 'selected' : ''}`}
              onClick={() => loadBrief(req)}>
              <div className="mreq-card-top">
                <div className="mreq-avatar"
                  style={{background: STAGE_COLORS[req.company_stage] || '#6c74f7'}}>
                  {req.mentee_name?.split(' ').map(n=>n[0]).join('').slice(0,2)}
                </div>
                <div className="mreq-card-info">
                  <div className="mreq-card-name">{req.mentee_name}</div>
                  <div className="mreq-card-company">{req.company_name}</div>
                </div>
                <span className="mreq-stage-pill"
                  style={{background:`${STAGE_COLORS[req.company_stage]}18`, color: STAGE_COLORS[req.company_stage], border:`1px solid ${STAGE_COLORS[req.company_stage]}35`}}>
                  {req.company_stage}
                </span>
              </div>
              <div className="mreq-card-meta">
                <span>📅 {req.alternate_date || req.requested_date}</span>
                <span>🕐 {(req.alternate_slot || req.requested_slot)?.start}–{(req.alternate_slot || req.requested_slot)?.end}</span>
                <span className="mreq-card-tz">{req.timezone}</span>
              </div>
              <div className="mreq-card-goal">{req.meeting_goal?.slice(0, 110)}{req.meeting_goal?.length > 110 ? '…' : ''}</div>
              {req.status === 'accepted' && req.zoom_meeting_id && (
                <div className="mreq-zoom-bar">
                  <span>ID: <strong>{req.zoom_meeting_id}</strong></span>
                  {req.zoom_password && <span>PW: <strong>{req.zoom_password}</strong></span>}
                  <button className="mreq-join-btn" onClick={e => {
                    e.stopPropagation()
                    const s = { meetingNumber: req.zoom_meeting_id, password: req.zoom_password || '', topic: req.company_name, mentorName: profile?.full_name, menteeName: req.mentee_name, role: 1 }
                    sessionStorage.setItem('session', JSON.stringify(s))
                    navigate(`/session/${req.zoom_meeting_id}`)
                  }}>▶ Start Meeting</button>
                </div>
              )}
            </div>
          ))}
        </div>

        {selected && (
          <div className="mreq-detail">
            <div className="mreq-detail-header">
              <div>
                <div className="mreq-detail-name" style={{fontWeight:600,fontSize:18,letterSpacing:-0.3}}>{selected.mentee_name}</div>
                <div className="mreq-detail-meta">
                  {selected.company_stage && !['Accelerate','Liftoff','Ignite'].includes(selected.company_stage) && (
                    <span className="mreq-stage-pill"
                      style={{background:`${STAGE_COLORS[selected.company_stage]}18`, color:STAGE_COLORS[selected.company_stage], border:`1px solid ${STAGE_COLORS[selected.company_stage]}35`}}>
                      {selected.company_stage}
                    </span>
                  )}
                  <span className={`mreq-status-pill ${selected.status}`}>{selected.status}</span>
                </div>
              </div>
              <button className="mreq-close-btn" onClick={() => { setSelected(null); setRespondingId(null) }}>✕</button>
            </div>

            <div className="mreq-detail-section">
              <div className="mreq-detail-section-label">🏢 Company</div>
              <div className="mreq-info-row"><span>Company</span><strong>{selected.company_name}</strong></div>
              {selected.company_info && <div className="mreq-company-about">{selected.company_info}</div>}
              {menteeProfile?.product && <div className="mreq-info-row"><span>Product</span><strong>{menteeProfile.product}</strong></div>}
              {(menteeProfile?.location || menteeProfile?.state) && <div className="mreq-info-row"><span>Location</span><strong>{menteeProfile.location}{menteeProfile.state?', '+menteeProfile.state:''}</strong></div>}
              {menteeProfile?.revenue_lakhs && <div className="mreq-info-row"><span>Revenue</span><strong>₹{menteeProfile.revenue_lakhs}L</strong></div>}
              {menteeProfile?.employee_count && <div className="mreq-info-row"><span>Employees</span><strong>{menteeProfile.employee_count}</strong></div>}
              {menteeProfile?.theme && <div className="mreq-info-row"><span>Theme</span><strong>{menteeProfile.theme}</strong></div>}
              {selected.company_url && <div className="mreq-info-row"><span>URL</span><a href={selected.company_url} target="_blank" rel="noreferrer" className="mreq-link">{selected.company_url}</a></div>}
              <div className="mreq-info-row"><span>Date</span><strong>{selected.requested_date} · {selected.requested_slot?.start}–{selected.requested_slot?.end}</strong></div>
            </div>

            <div className="mreq-detail-section">
              <div className="mreq-detail-section-label">🎯 Meeting Goal</div>
              <div className="mreq-goal-text">{selected.meeting_goal}</div>
            </div>

            <div className="mreq-detail-section">
              <div className="mreq-detail-section-label">📋 Pre-Meeting Brief</div>
              {briefLoading ? (
                <div className="mreq-brief-loading">
                  <div className="mreq-spinner"/>
                  <span>Generating brief from past sessions…</span>
                </div>
              ) : brief?.brief ? (
                <div className="mreq-brief-content">
                  {brief.brief.red_flags?.filter(f=>f).length > 0 && (
                    <div className="mreq-red-flags">
                      <div className="mreq-flags-title">🚩 Red Flags</div>
                      {brief.brief.red_flags.map((f,i) => <div key={i} className="mreq-flag-item">⚠ {f}</div>)}
                    </div>
                  )}
                  {brief.brief.action_items?.filter(a=>a).length > 0 && (
                    <div className="mreq-action-items">
                      <div className="mreq-action-title">✅ Outstanding Action Items</div>
                      {brief.brief.action_items.map((a,i) => (
                        <div key={i} className="mreq-action-item">
                          <span className="mreq-num">{i+1}</span><span>{a}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="mreq-brief-text">{brief.brief.brief_text}</div>
                  {brief.brief.focus_areas?.length > 0 && (
                    <div className="mreq-focus-areas">
                      <div className="mreq-focus-title">🎯 Focus Areas for This Session</div>
                      {brief.brief.focus_areas.map((a,i) => (
                        <div key={i} className="mreq-focus-item">
                          <span className="mreq-num">{i+1}</span><span>{a}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {brief.brief.key_questions?.length > 0 && (
                    <div className="mreq-questions">
                      <div className="mreq-questions-title">💡 Suggested Questions</div>
                      {brief.brief.key_questions.map((q,i) => (
                        <div key={i} className="mreq-question-item">
                          <span className="mreq-num">{i+1}</span><span>{q}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : brief?.message ? (
                <div className="mreq-brief-empty">{brief.message}</div>
              ) : null}
            </div>

            {selected.status === 'pending' && (
              <div className="mreq-actions">
                {respondingId !== 'decline' && respondingId !== 'reschedule' && (
                  <>
                    <button className="mreq-accept-btn" onClick={() => acceptRequest(selected)} disabled={actionLoading}>
                      {actionLoading ? '⏳ Creating…' : '✓ Accept & Create Zoom Meeting'}
                    </button>
                    <button className="mreq-reschedule-btn" onClick={() => setRespondingId('reschedule')}>📅 Suggest Different Time</button>
                    <button className="mreq-decline-btn" onClick={() => setRespondingId('decline')}>✕ Decline</button>
                  </>
                )}
                {respondingId === 'decline' && (
                  <div className="mreq-respond-form">
                    <div className="mreq-respond-label">Reason (optional)</div>
                    <textarea className="mreq-respond-input" rows={3} placeholder="Let the mentee know why…"
                      value={mentorNote} onChange={e => setMentorNote(e.target.value)} />
                    <div style={{display:'flex',gap:8,marginTop:10}}>
                      <button className="mreq-decline-btn" onClick={() => declineRequest(selected)} disabled={actionLoading}>Confirm Decline</button>
                      <button className="mreq-cancel-btn" onClick={() => setRespondingId(null)}>Cancel</button>
                    </div>
                  </div>
                )}
                {respondingId === 'reschedule' && (
                  <div className="mreq-respond-form">
                    <div className="mreq-respond-label">Suggest a new date and time</div>
                    <input type="date" className="mreq-respond-input" style={{marginBottom:8}} value={rescheduleDate} onChange={e => setRescheduleDate(e.target.value)} />
                    <div style={{display:'flex',gap:8,marginBottom:8}}>
                      <input type="time" className="mreq-respond-input" value={rescheduleStart} onChange={e => setRescheduleStart(e.target.value)} />
                      <input type="time" className="mreq-respond-input" value={rescheduleEnd} onChange={e => setRescheduleEnd(e.target.value)} />
                    </div>
                    <textarea className="mreq-respond-input" rows={2} placeholder="Note to mentee (optional)"
                      value={mentorNote} onChange={e => setMentorNote(e.target.value)} style={{marginBottom:8}} />
                    <div style={{display:'flex',gap:8}}>
                      <button className="mreq-reschedule-btn" onClick={() => rescheduleRequest(selected)} disabled={actionLoading || !rescheduleDate || !rescheduleStart}>Send New Time</button>
                      <button className="mreq-cancel-btn" onClick={() => setRespondingId(null)}>Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

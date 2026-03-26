import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import TranscriptViewer from './TranscriptViewer'
import MenteeHistory from './MenteeHistory'
import './MentorDashboard.css'

function hour() {
  const h = new Date().getHours()
  return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening'
}

function SessionCard({ session, insights }) {
  const [expanded, setExpanded] = useState(false)
  const [viewingTranscript, setViewingTranscript] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [showSummary, setShowSummary] = useState(false)
  const sessionInsights = insights.filter(i => i.session_id === session.meeting_id)
  const finalInsight = sessionInsights.find(i => i.is_final)
  const snapshots = sessionInsights.filter(i => !i.is_final)

  return (
    <>
      <div className={`md-session-card ${expanded ? 'expanded' : ''}`}>
        <div className="md-session-card-header" onClick={() => setExpanded(!expanded)}>
          <div className="md-session-card-left">
            <div className={`md-session-dot ${session.status}`} />
            <div>
              <div className="md-session-topic">{session.topic || 'Untitled Session'}</div>
              <div className="md-session-meta">
                with {session.mentee_name || '—'} · {new Date(session.started_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                {session.ended_at && ` · ${Math.round((new Date(session.ended_at) - new Date(session.started_at)) / 60000)} min`}
                {sessionInsights.length > 0 && ` · ${sessionInsights.length} insight${sessionInsights.length !== 1 ? 's' : ''}`}
              </div>
            </div>
          </div>
          <div className="md-session-card-right">
            <div className={`md-session-status ${session.status}`}>{session.status}</div>
            <span className="md-expand-icon">{expanded ? '▲' : '▼'}</span>
          </div>
        </div>

        {expanded && (
          <div className="md-session-card-body">
            {finalInsight ? (
              <div className="md-insight-block final">
                <div className="md-insight-block-label">📝 Session Summary</div>
                <div className="md-insight-summary">{finalInsight.summary}</div>
                {finalInsight.questions?.length > 0 && (
                  <div className="md-insight-questions">
                    <div className="md-insight-q-label">💡 Questions for Next Session</div>
                    {finalInsight.questions.map((q, i) => (
                      <div key={i} className="md-insight-q-row">
                        <span className="md-q-num">{i + 1}</span><span>{q}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="md-no-insight">
                {session.status === 'ended' ? 'No summary generated for this session.' : 'Session still active — summary appears after it ends.'}
              </div>
            )}

            {snapshots.length > 0 && (
              <div className="md-snapshots">
                <div className="md-snapshots-label">⚡ Live Insight Snapshots ({snapshots.length})</div>
                {snapshots.map(snap => (
                  <div key={snap.id} className="md-snapshot-row">
                    <div className="md-snapshot-time">
                      {new Date(snap.snapshot_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                    <div className="md-snapshot-text">{snap.summary}</div>
                  </div>
                ))}
              </div>
            )}

            <div className="md-card-actions">
              <button className="tv-open-btn" onClick={e => { e.stopPropagation(); setViewingTranscript(true) }}>
                📄 Full Transcript
              </button>
              <button className="tv-open-btn" onClick={e => { e.stopPropagation(); setShowSummary(!showSummary) }}>
                📝 {showSummary ? 'Hide Summary' : 'Transcript Summary'}
              </button>
              {session.mentee_name && (
                <button className="tv-open-btn" onClick={e => { e.stopPropagation(); setShowHistory(true) }}>
                  📋 Brief
                </button>
              )}
              {session.status === 'active' && (
                <button className="tv-open-btn rejoin" onClick={e => {
                  e.stopPropagation()
                  sessionStorage.setItem('session', JSON.stringify({
                    meetingNumber: session.meeting_id, password: '',
                    topic: session.topic, mentorName: session.mentor_name,
                    menteeName: session.mentee_name, role: 1
                  }))
                  window.location.href = `/session/${session.meeting_id}`
                }}>▶ Rejoin</button>
              )}
            </div>

            {showSummary && finalInsight && (
              <div className="md-summary-expanded">
                <div className="md-summary-exp-title">📝 Transcript Summary</div>
                <div className="md-summary-exp-text">{finalInsight.summary}</div>
                {finalInsight.questions?.length > 0 && (
                  <>
                    <div className="md-summary-exp-title" style={{marginTop:12}}>💡 Questions for Next Session</div>
                    {finalInsight.questions.map((q,i) => (
                      <div key={i} className="md-insight-q-row">
                        <span className="md-q-num">{i+1}</span><span>{q}</span>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}
            {showSummary && !finalInsight && (
              <div className="md-summary-expanded">
                <div className="md-no-insight">No summary available for this session yet.</div>
              </div>
            )}
          </div>
        )}
      </div>

      {viewingTranscript && (
        <TranscriptViewer sessionId={session.meeting_id} topic={session.topic} onClose={() => setViewingTranscript(false)} />
      )}
      {showHistory && session.mentee_name && (
        <MenteeHistory menteeName={session.mentee_name} mentorName={session.mentor_name}
          onClose={() => setShowHistory(false)} />
      )}
    </>
  )
}

function MenteeDetail({ mentee, sessions, insights, onBack, onStartSession }) {
  const [brief, setBrief] = useState(null)
  const [briefLoading, setBriefLoading] = useState(false)
  const menteeSessions = sessions.filter(s => s.mentee_name === mentee.name)

  async function generateBrief() {
    setBriefLoading(true)
    try {
      const res = await fetch(`/api/brief/${encodeURIComponent(mentee.name)}`)
      const data = await res.json()
      setBrief(data)
    } finally { setBriefLoading(false) }
  }

  return (
    <div className="md-mentee-detail">
      <div className="md-detail-header">
        <button className="md-back-btn" onClick={onBack}>← All Mentees</button>
        <div>
          <div className="md-detail-name">{mentee.name}</div>
          <div className="md-detail-sub">{menteeSessions.length} session{menteeSessions.length !== 1 ? 's' : ''}</div>
        </div>
        <button className="md-new-btn" onClick={onStartSession}>+ New Session</button>
      </div>

      <div className="md-detail-grid">
        <div className="md-detail-col">
          <div className="md-col-title">Session History & Summaries</div>
          {menteeSessions.length === 0 ? <div className="md-empty">No sessions yet.</div> :
           menteeSessions.map(s => <SessionCard key={s.id} session={s} insights={insights} />)}
        </div>

        <div className="md-detail-col">
          <div className="md-col-title">Pre-Meeting Brief</div>
          {!brief ? (
            <div className="md-brief-placeholder">
              <div className="md-brief-icon">📋</div>
              <p>Generate an AI brief based on all past sessions with {mentee.name}.</p>
              <button className="md-brief-btn" onClick={generateBrief} disabled={briefLoading}>
                {briefLoading ? '⏳ Generating…' : '✨ Generate Brief'}
              </button>
            </div>
          ) : brief.message ? (
            <div className="md-empty">{brief.message}</div>
          ) : (
            <div className="md-brief-content">
              {brief.brief?.progress_summary && (
                <div className="md-brief-section">
                  <div className="md-brief-label">📈 Progress</div>
                  <div className="md-brief-progress">{brief.brief.progress_summary}</div>
                </div>
              )}
              {brief.brief?.red_flags?.length > 0 && (
                <div className="md-brief-section">
                  <div className="md-brief-label" style={{color:'#f06060'}}>🚩 Red Flags</div>
                  {brief.brief.red_flags.map((f,i) => (
                    <div key={i} style={{fontSize:13,color:'#f06060',padding:'6px 10px',background:'rgba(240,96,96,0.08)',borderRadius:6,marginBottom:4}}>⚠ {f}</div>
                  ))}
                </div>
              )}
              {brief.brief?.focus_areas?.length > 0 && (
                <div className="md-brief-section">
                  <div className="md-brief-label">🎯 Focus Areas</div>
                  <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                    {brief.brief.focus_areas.map((a,i) => <span key={i} className="md-focus-tag">{a}</span>)}
                  </div>
                </div>
              )}
              <div className="md-brief-section">
                <div className="md-brief-label">📝 Overview</div>
                <div className="md-brief-text">{brief.brief?.brief_text}</div>
              </div>
              {brief.brief?.key_questions?.length > 0 && (
                <div className="md-brief-section">
                  <div className="md-brief-label">💡 Questions to Ask</div>
                  {brief.brief.key_questions.map((q,i) => (
                    <div key={i} className="md-brief-q">
                      <span className="md-brief-qnum">{i+1}</span><span>{q}</span>
                    </div>
                  ))}
                </div>
              )}
              <button className="md-brief-btn" onClick={generateBrief} disabled={briefLoading} style={{marginTop:12}}>
                {briefLoading ? '⏳ Refreshing…' : '🔄 Refresh Brief'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function MentorDashboard() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const [sessions, setSessions] = useState([])
  const [insights, setInsights] = useState([])
  const [mentees, setMentees] = useState([])
  const [selectedMentee, setSelectedMentee] = useState(null)
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('all')

  useEffect(() => {
    // If Zoom redirected us back, end the active meeting
    const activeMeeting = localStorage.getItem('activeMeeting')
    if (activeMeeting) {
      localStorage.removeItem('activeMeeting')
      try {
        const m = JSON.parse(activeMeeting)
        const transcript = JSON.parse(sessionStorage.getItem('lastTranscript') || '[]')
        fetch(`/api/sessions/${m.meetingNumber}/end`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            transcript,
            topic: m.topic,
            mentorName: m.mentorName,
            menteeName: m.menteeName
          })
        }).then(() => setTimeout(fetchData, 1000))
      } catch(e) { console.log('Auto-end error:', e) }
    }
    if (profile) fetchData()
  }, [profile])

  async function fetchData() {
    setLoading(true)
    try {
      // Get sessions by mentor name OR mentor email OR sessions with no mentor assigned yet
      const { data: byName } = await supabase.from('sessions').select('*')
        .eq('mentor_name', profile.full_name)
        .order('started_at', { ascending: false })
      const { data: byEmail } = await supabase.from('sessions').select('*')
        .eq('mentor_email', profile.email || '')
        .neq('mentor_email', '')
        .order('started_at', { ascending: false })
      // Merge and deduplicate
      const allSessions = [...(byName || []), ...(byEmail || [])]
      const seen = new Set()
      const sessionData = allSessions.filter(s => {
        if (seen.has(s.id)) return false
        seen.add(s.id)
        return true
      }).sort((a,b) => new Date(b.started_at) - new Date(a.started_at))
      setSessions(sessionData || [])
      if (sessionData?.length > 0) {
        const { data: insightData } = await supabase.from('session_insights').select('*')
          .in('session_id', sessionData.map(s => s.meeting_id)).order('snapshot_time', { ascending: false })
        setInsights(insightData || [])
      }
      const uniqueMentees = [...new Set((sessionData || []).map(s => s.mentee_name).filter(Boolean))]
        .map(name => ({ name, sessions: (sessionData || []).filter(s => s.mentee_name === name) }))
      setMentees(uniqueMentees)
    } finally { setLoading(false) }
  }

  const filteredSessions = sessions.filter(s => statusFilter === 'all' || s.status === statusFilter)

  return (
    <div className="md-wrap">
      <div className="md-top">
        <div className="md-top-left">
          <div className="md-logo">M<em>S</em></div>
          <div>
            <div className="md-greeting">Good {hour()}, {profile?.full_name?.split(' ')[0]} 👋</div>
            <div className="md-role-chip">🎓 Mentor</div>
          </div>
        </div>
        <div className="md-top-right">
          <button className="md-intel-btn" onClick={() => navigate('/intelligence')}>📊 Market Intelligence</button>
          <button className="md-new-btn" onClick={() => navigate('/new')}>+ New Session</button>
          <button className="md-signout" onClick={signOut}>Sign out</button>
        </div>
      </div>

      <div className="md-body">
        <div className="md-sidebar">
          <div className="md-sidebar-title">My Mentees</div>
          {loading ? <div className="md-loading">Loading…</div> :
           mentees.length === 0 ? <div className="md-empty">No sessions yet.</div> :
           mentees.map(m => (
            <div key={m.name}
              className={`md-mentee-row ${selectedMentee?.name === m.name ? 'active' : ''}`}
              onClick={() => setSelectedMentee(selectedMentee?.name === m.name ? null : m)}>
              <div className="md-mentee-avatar">{m.name.split(' ').map(n=>n[0]).join('').slice(0,2)}</div>
              <div>
                <div className="md-mentee-name">{m.name}</div>
                <div className="md-mentee-meta">{m.sessions.length} session{m.sessions.length!==1?'s':''}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="md-main">
          {!selectedMentee ? (
            <>
              <div className="md-stats">
                <div className={`md-stat md-stat-clickable ${statusFilter==='all'?'active':''}`} onClick={()=>setStatusFilter('all')}>
                  <div className="md-stat-val">{sessions.length}</div>
                  <div className="md-stat-label">All Sessions</div>
                </div>
                <div className={`md-stat md-stat-clickable ${statusFilter==='active'?'active':''}`} onClick={()=>setStatusFilter('active')}>
                  <div className="md-stat-val">{sessions.filter(s=>s.status==='active').length}</div>
                  <div className="md-stat-label">Active</div>
                </div>
                <div className={`md-stat md-stat-clickable ${statusFilter==='ended'?'active':''}`} onClick={()=>setStatusFilter('ended')}>
                  <div className="md-stat-val">{sessions.filter(s=>s.status==='ended').length}</div>
                  <div className="md-stat-label">Completed</div>
                </div>
                <div className="md-stat">
                  <div className="md-stat-val">{mentees.length}</div>
                  <div className="md-stat-label">Mentees</div>
                </div>
                <div className="md-stat">
                  <div className="md-stat-val">{insights.length}</div>
                  <div className="md-stat-label">Insights</div>
                </div>
              </div>

              {loading ? <div className="md-loading">Loading…</div> :
               filteredSessions.length === 0 ? <div className="md-empty">No sessions found.</div> :
               filteredSessions.map(s => <SessionCard key={s.id} session={s} insights={insights} />)}
            </>
          ) : (
            <MenteeDetail mentee={selectedMentee} sessions={sessions} insights={insights}
              onBack={() => setSelectedMentee(null)} onStartSession={() => navigate('/new')} />
          )}
        </div>
      </div>
    </div>
  )
}

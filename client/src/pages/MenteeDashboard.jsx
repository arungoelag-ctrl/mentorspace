import React, { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import TranscriptViewer from './TranscriptViewer'
import MenteeRequestsTab from './MenteeRequests'
import DiscoverMentorsTab from './DiscoverMentors'
import './MenteeDashboard.css'

function SessionCard({ session, insights }) {
  const [expanded, setExpanded] = useState(false)
  const [viewingTranscript, setViewingTranscript] = useState(false)
  const sessionInsights = insights.filter(i => i.session_id === session.meeting_id)
  const finalInsight = sessionInsights.find(i => i.is_final)
  const snapshots = sessionInsights.filter(i => !i.is_final)

  return (
    <>
      <div className={`mentee-session-card ${expanded ? 'expanded' : ''}`}>
        <div className="mentee-session-header" onClick={() => setExpanded(!expanded)}>
          <div>
            <div className="mentee-session-topic">{session.topic || 'Untitled Session'}</div>
            <div className="mentee-session-meta">
              with {session.mentor_name || 'Mentor'} · {new Date(session.started_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
              {sessionInsights.length > 0 && ` · ${sessionInsights.length} insight${sessionInsights.length !== 1 ? 's' : ''}`}
            </div>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <div className={`md-session-status ${session.status}`}>{session.status === 'ended' ? 'completed' : session.status === 'active' ? 'in progress' : session.status}</div>
            <span style={{color:'#6b6f94',fontSize:12}}>{expanded ? '▲' : '▼'}</span>
          </div>
        </div>
        {expanded && (
          <div className="mentee-session-insight" onClick={e => e.stopPropagation()}>
            {finalInsight ? (
              <>
                <div className="mentee-insight-label">📝 Session Summary</div>
                <div className="mentee-insight-text">{finalInsight.summary}</div>
                {finalInsight.questions?.length > 0 && (
                  <>
                    <div className="mentee-insight-label" style={{marginTop:14}}>💡 Questions for Next Session</div>
                    {finalInsight.questions.map((q,i) => (
                      <div key={i} className="mentee-insight-q">
                        <span className="md-brief-qnum">{i+1}</span><span>{q}</span>
                      </div>
                    ))}
                  </>
                )}
                {snapshots.length > 0 && (
                  <>
                    <div className="mentee-insight-label" style={{marginTop:14}}>⚡ Live Snapshots</div>
                    {snapshots.map(snap => (
                      <div key={snap.id} className="mentee-snapshot-row">
                        <div className="mentee-snapshot-time">
                          {new Date(snap.snapshot_time).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}
                        </div>
                        <div className="mentee-snapshot-text">{snap.summary}</div>
                      </div>
                    ))}
                  </>
                )}
              </>
            ) : (
              <div style={{color:'#6b6f94',fontSize:13}}>
                {session.status === 'ended' ? 'No summary available.' : 'Session still active.'}
              </div>
            )}
            <button className="tv-open-btn" style={{marginTop:12}} onClick={() => setViewingTranscript(true)}>
              📄 View Full Transcript
            </button>
          </div>
        )}
      </div>
      {viewingTranscript && (
        <TranscriptViewer sessionId={session.meeting_id} topic={session.topic} onClose={() => setViewingTranscript(false)} />
      )}
    </>
  )
}

export default function MenteeDashboard() {
  const { profile, user, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [sessions, setSessions] = useState([])
  const [insights, setInsights] = useState([])
  const [loading, setLoading] = useState(false)
  const [statusFilter, setStatusFilter] = useState('ended')
  const [mainTab, setMainTab] = useState('sessions')
  const [requestsFilter, setRequestsFilter] = useState('pending')
  const [requestsRefresh, setRequestsRefresh] = useState(0)
  const [joinId, setJoinId] = useState('')
  const [joinPw, setJoinPw] = useState('')
  const [menteeRequests, setMenteeRequests] = useState([])

  useEffect(() => {
    if (location.state?.tab) {
      setMainTab(location.state.tab)
      if (location.state.filter) setRequestsFilter(location.state.filter)
      if (location.state.tab === 'requests') setRequestsRefresh(r => r+1)
      window.history.replaceState({}, '')
    }
  }, [])

  useEffect(() => { if (profile) fetchData() }, [profile])
  useEffect(() => { if (user) fetchMenteeRequests() }, [user])

  async function fetchData() {
    try {
      const { data: sessionData } = await supabase.from('sessions').select('*')
        .eq('mentee_name', profile.full_name).order('started_at', { ascending: false })
      setSessions(sessionData || [])
      if (sessionData?.length > 0) {
        const { data: insightData } = await supabase.from('session_insights').select('*')
          .in('session_id', sessionData.map(s => s.meeting_id)).order('snapshot_time', { ascending: false })
        setInsights(insightData || [])
      }
    } catch(e) { console.error(e) }
  }

  async function fetchMenteeRequests() {
    const { data } = await supabase.from('meeting_requests').select('id,status')
      .eq('mentee_email', user?.email)
    setMenteeRequests(data || [])
  }

  function handleJoin() {
    if (!joinId.trim()) return
    const sessionData = {
      meetingNumber: joinId.trim(),
      password: joinPw.trim(),
      userName: profile?.full_name || '',
      userEmail: user?.email || '',
      role: 0,
      topic: '',
      mentorName: '',
      menteeName: profile?.full_name || '',
    }
    sessionStorage.setItem('session', JSON.stringify(sessionData))
    navigate(`/session/${joinId.trim()}`)
  }

  const uniqueMentors = [...new Set(sessions.map(s => s.mentor_name).filter(Boolean))]
  const pendingRequests = menteeRequests.filter(r => r.status === 'pending')
  const upcomingMeetings = menteeRequests.filter(r => r.status === 'accepted')
  const declinedRequests = menteeRequests.filter(r => r.status === 'declined')

  return (
    <div className="mentee-wrap">
      <div className="mentee-top">
        <div className="mentee-top-left">
          <div className="md-logo">M<em>S</em></div>
          <div>
            <div className="md-greeting">{profile?.full_name}</div>
            <div className="mentee-role-chip">{profile?.company_name || 'Mentee'}</div>
          </div>
        </div>
        <div className="md-top-right">
          <button className="md-intel-btn" onClick={() => navigate('/discover')}>🔍 Find a Mentor</button>
          <button className="md-intel-btn" onClick={() => navigate('/intelligence')}>📊 Market Intelligence</button>
          <button className="md-signout" onClick={signOut}>Sign out</button>
        </div>
      </div>

      <div className="mobile-bottom-nav">
        <div className={`mobile-nav-item ${mainTab==='requests'?'active':''}`} onClick={()=>{ setMainTab('requests'); setRequestsFilter('pending') }}>
          <span>📬</span>
          <span>Meetings{menteeRequests.length>0?' ('+menteeRequests.length+')':''}</span>
        </div>
        <div className="mobile-nav-item" onClick={()=>navigate('/discover')}>
          <span>🔍</span><span>Find Mentor</span>
        </div>
        <div className={`mobile-nav-item ${mainTab==='profile'?'active':''}`} onClick={()=>setMainTab('profile')}>
          <span>👤</span><span>Profile</span>
        </div>
      </div>

      <div className="mentee-body">
        <div className="mentee-sidebar">
          <div className="md-sidebar-title">My Mentors</div>
          {uniqueMentors.length === 0 ? <div className="md-empty mentor-list-item" style={{fontSize:12,padding:'8px'}}>No mentors yet.</div> :
           uniqueMentors.map(mentor => (
            <div key={mentor} className="md-mentee-row mentor-list-item" onClick={() => setMainTab('sessions')}>
              <div className="md-mentee-avatar">{mentor.split(' ').map(n=>n[0]).join('').slice(0,2)}</div>
              <div>
                <div className="md-mentee-name">{mentor}</div>
                <div className="md-mentee-meta">{sessions.filter(s=>s.mentor_name===mentor).length} session{sessions.filter(s=>s.mentor_name===mentor).length!==1?'s':''}</div>
              </div>
            </div>
          ))}
          <div className="mentee-sidebar-divider" />
          <div className="md-sidebar-title">Navigation</div>
          <div className={`md-mentee-row ${mainTab==='requests'?'active':''}`} onClick={() => { setMainTab('requests'); setRequestsFilter('pending') }}>
            <div className="mentee-nav-icon">📬</div>
            <div>
              <div className="md-mentee-name">My Meetings</div>
              {pendingRequests.length > 0 && <div className="md-mentee-meta" style={{color:'#e8b84b'}}>{pendingRequests.length} pending</div>}
            </div>
          </div>
          <div className="md-mentee-row" onClick={() => navigate('/discover')}>
            <div className="tentee-nav-icon">🔍</div>
            <div className="md-mentee-name">Find a Mentor</div>
          </div>
          <div className={`md-mentee-row ${mainTab==='profile'?'active':''}`} onClick={() => setMainTab('profile')}>
            <div className="tentee-nav-icon">👤</div>
            <div className="md-mentee-name">My Profile</div>
          </div>
        </div>

        <div className="mentee-main">
          <div className="md-stats">
            <div className={`md-stat md-stat-clickable ${mainTab==='sessions'&&statusFilter==='ended'?'active':''}`}
              onClick={()=>{ setMainTab('sessions'); setStatusFilter('ended') }}>
              <div className="md-stat-val">{sessions.filter(s=>s.status==='ended').length}</div>
              <div className="md-stat-label">Completed</div>
            </div>
            <div className={`md-stat md-stat-clickable md-stat-pending ${mainTab==='requests'&&requestsFilter==='pending'?'active':''}`}
              onClick={()=>{ setMainTab('requests'); setRequestsFilter('pending') }}>
              <div className="md-stat-val md-stat-val-pending">{pendingRequests.length}</div>
              <div className="md-stat-label">Pending</div>
            </div>
            <div className={`md-stat md-stat-clickable md-stat-upcoming ${mainTab==='requests'&&requestsFilter==='accepted'?'active':''}`}
              onClick={()=>{ setMainTab('requests'); setRequestsFilter('accepted') }}>
              <div className="md-stat-val md-stat-val-upcoming">{upcomingMeetings.length}</div>
              <div className="md-stat-label">Scheduled</div>
            </div>
            <div className={`md-stat md-stat-clickable ${mainTab==='requests'&&requestsFilter==='declined'?'active':''}`}
              onClick={()=>{ setMainTab('requests'); setRequestsFilter('declined') }}>
              <div className="md-stat-val" style={{color:'#ef4444'}}>{declinedRequests.length}</div>
              <div className="md-stat-label">Declined</div>
            </div>
          </div>

          <div className="mentee-quick-join md-join-section">
            <div className="mentee-qj-title">🔗 Join a Session</div>
            <div className="mentee-qj-row">
              <input className="mentee-qj-input" placeholder="Enter Meeting ID from your mentor"
                value={joinId} onChange={e => setJoinId(e.target.value.replace(/\s/g, ''))}
                onKeyDown={e => e.key === 'Enter' && handleJoin()} />
              <input className="mentee-qj-input mentee-qj-pw" placeholder="Password (if any)"
                value={joinPw} onChange={e => setJoinPw(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleJoin()} />
              <button className="mentee-qj-btn" onClick={handleJoin} disabled={!joinId.trim()}>
                Join →
              </button>
            </div>
          </div>

          <div style={{display: mainTab==='sessions' ? 'block' : 'none'}}>
            <div className="mentee-sessions-list">
              {loading ? <div className="md-loading">Loading…</div> :
               sessions.length === 0 ? <div className="md-empty">No sessions yet.<br/>Use the Join box above when your mentor shares a Meeting ID.</div> :
               sessions.filter(s => statusFilter === 'all' || s.status === statusFilter).map(s => <SessionCard key={s.id} session={s} insights={insights} />)}
            </div>
          </div>
          <div style={{display: mainTab==='requests' ? 'block' : 'none'}}>
            <MenteeRequestsTab embedded initialFilter={requestsFilter} refreshTrigger={requestsRefresh} />
          </div>
          <div style={{display: mainTab==='profile' ? 'block' : 'none'}}>
            <div className="mentee-profile-view">
              <div className="mentee-profile-header">
                <div className="mentee-profile-avatar">{profile?.full_name?.split(' ').map(n=>n[0]).join('').slice(0,2)}</div>
                <div>
                  <div className="mentee-profile-name">{profile?.full_name}</div>
                  <div className="mentee-profile-email">{profile?.email}</div>
                  {profile?.tiering && <div className="mentee-profile-tier" style={{color: profile?.tiering === 'Accelerate' ? 'var(--accent)' : 'var(--green)'}}>{profile?.tiering}</div>}
                </div>
              </div>
              <div className="mentee-profile-grid">
                {profile?.company_name && <div className="mentee-profile-card"><div className="mentee-profile-label">🏭 Company</div><div className="mentee-profile-value">{profile.company_name}</div></div>}
                {profile?.product && <div className="mentee-profile-card"><div className="mentee-profile-label">📦 Product</div><div className="mentee-profile-value">{profile.product}</div></div>}
                {(profile?.location || profile?.state) && <div className="mentee-profile-card"><div className="mentee-profile-label">📍 Location</div><div className="mentee-profile-value">{profile?.location}{profile?.state ? ', '+profile.state : ''}</div></div>}
                {profile?.revenue_lakhs && <div className="mentee-profile-card"><div className="mentee-profile-label">💰 Revenue</div><div className="mentee-profile-value">₹{profile.revenue_lakhs}L</div></div>}
                {profile?.employee_count && <div className="mentee-profile-card"><div className="mentee-profile-label">👥 Employees</div><div className="mentee-profile-value">{profile.employee_count}</div></div>}
                {profile?.theme && <div className="mentee-profile-card"><div className="mentee-profile-label">🎯 Theme</div><div className="mentee-profile-value">{profile.theme}</div></div>}
              </div>
              {profile?.problem_statement && (
                <div className="mentee-profile-problem">
                  <div className="mentee-profile-label">💬 Problem Statement</div>
                  <div className="mentee-profile-problem-text">{profile.problem_statement}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

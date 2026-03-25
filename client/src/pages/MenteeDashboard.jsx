import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import TranscriptViewer from './TranscriptViewer'
import './MenteeDashboard.css'

function hour() {
  const h = new Date().getHours()
  return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening'
}

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
            <div className={`md-session-status ${session.status}`}>{session.status}</div>
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
  const [sessions, setSessions] = useState([])
  const [insights, setInsights] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeView, setActiveView] = useState('sessions')
  const [joinId, setJoinId] = useState('')
  const [joinPw, setJoinPw] = useState('')

  useEffect(() => { if (profile) fetchData() }, [profile])

  async function fetchData() {
    setLoading(true)
    try {
      const { data: sessionData } = await supabase.from('sessions').select('*')
        .eq('mentee_name', profile.full_name).order('started_at', { ascending: false })
      setSessions(sessionData || [])
      if (sessionData?.length > 0) {
        const { data: insightData } = await supabase.from('session_insights').select('*')
          .in('session_id', sessionData.map(s => s.meeting_id)).order('snapshot_time', { ascending: false })
        setInsights(insightData || [])
      }
    } finally { setLoading(false) }
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

  const finalInsights = insights.filter(i => i.is_final)
  const uniqueMentors = [...new Set(sessions.map(s => s.mentor_name).filter(Boolean))]

  return (
    <div className="mentee-wrap">
      <div className="mentee-top">
        <div className="mentee-top-left">
          <div className="md-logo">M<em>S</em></div>
          <div>
            <div className="md-greeting">Good {hour()}, {profile?.full_name?.split(' ')[0]} 👋</div>
            <div className="mentee-role-chip">🙋 Mentee</div>
          </div>
        </div>
        <div className="md-top-right">
          <button className="md-signout" onClick={signOut}>Sign out</button>
        </div>
      </div>

      <div className="mentee-body">
        {/* Stats */}
        <div className="md-stats">
          {[
            { label: 'Sessions Attended', value: sessions.length },
            { label: 'Completed', value: sessions.filter(s=>s.status==='ended').length },
            { label: 'Mentors', value: uniqueMentors.length },
            { label: 'AI Insights', value: finalInsights.length },
          ].map(s => (
            <div key={s.label} className="md-stat">
              <div className="md-stat-val">{s.value}</div>
              <div className="md-stat-label">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Quick Join */}
        <div className="mentee-quick-join">
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

        {/* View tabs */}
        <div className="mentee-view-tabs">
          <button className={`mentee-view-tab ${activeView==='sessions'?'active':''}`} onClick={()=>setActiveView('sessions')}>
            📋 Session History & Summaries
          </button>
          <button className={`mentee-view-tab ${activeView==='progress'?'active':''}`} onClick={()=>setActiveView('progress')}>
            📈 My Progress
          </button>
        </div>

        {activeView === 'sessions' && (
          <div className="mentee-sessions-list">
            {loading ? <div className="md-loading">Loading…</div> :
             sessions.length === 0 ? <div className="md-empty">No sessions yet.<br/>Use the Join box above when your mentor shares a Meeting ID.</div> :
             sessions.map(s => <SessionCard key={s.id} session={s} insights={insights} />)}
          </div>
        )}

        {activeView === 'progress' && (
          <div className="mentee-progress-view">
            <div className="mentee-progress-col">
              <div className="md-section-title">My Mentors</div>
              {uniqueMentors.length === 0 ? <div className="md-empty">No mentors yet.</div> :
               uniqueMentors.map(mentor => {
                const ms = sessions.filter(s => s.mentor_name === mentor)
                const topics = [...new Set(ms.map(s=>s.topic).filter(Boolean))]
                return (
                  <div key={mentor} className="mentee-mentor-card">
                    <div className="mentee-mentor-avatar">{mentor.split(' ').map(n=>n[0]).join('').slice(0,2)}</div>
                    <div>
                      <div className="mentee-mentor-name">{mentor}</div>
                      <div className="mentee-mentor-meta">{ms.length} session{ms.length!==1?'s':''}</div>
                      <div className="mentee-mentor-topics">
                        {topics.slice(0,3).map(t=><span key={t} className="mentee-topic-tag">{t}</span>)}
                      </div>
                    </div>
                  </div>
                )
               })}
            </div>

            <div className="mentee-progress-col">
              <div className="md-section-title">AI Insights History</div>
              {finalInsights.length === 0 ? (
                <div className="md-empty">No insights yet. Complete a session to see AI summaries here.</div>
              ) : finalInsights.map(ins => {
                const session = sessions.find(s => s.meeting_id === ins.session_id)
                return (
                  <div key={ins.id} className="mentee-insight-card">
                    <div className="mentee-insight-card-header">
                      <span>{session?.topic || 'Session'}</span>
                      <span className="mentee-insight-date">
                        {new Date(ins.snapshot_time).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})}
                      </span>
                    </div>
                    <div className="mentee-insight-card-text">{ins.summary}</div>
                    {ins.questions?.length > 0 && (
                      <div className="mentee-insight-card-qs">
                        <div style={{fontSize:10,fontFamily:'monospace',color:'#6b6f94',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:6}}>Questions for next</div>
                        {ins.questions.slice(0,3).map((q,i) => (
                          <div key={i} style={{fontSize:12,color:'var(--text)',padding:'4px 0',borderBottom:'1px solid var(--border)',display:'flex',gap:8}}>
                            <span style={{color:'var(--accent)',fontWeight:700,flexShrink:0}}>{i+1}.</span><span>{q}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

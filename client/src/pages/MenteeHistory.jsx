import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import TranscriptViewer from './TranscriptViewer'
import './MenteeHistory.css'

export default function MenteeHistory({ menteeName, mentorName, onClose, onJoinMeeting }) {
  const [sessions, setSessions] = useState([])
  const [insights, setInsights] = useState([])
  const [brief, setBrief] = useState(null)
  const [loading, setLoading] = useState(true)
  const [briefLoading, setBriefLoading] = useState(false)
  const [activeTab, setActiveTab] = useState('brief')
  const [expandedSession, setExpandedSession] = useState(null)
  const [viewingTranscript, setViewingTranscript] = useState(null)
  const [redFlags, setRedFlags] = useState([])

  useEffect(() => { fetchAll() }, [menteeName])

  async function fetchAll() {
    setLoading(true)
    try {
      const { data: sessionData } = await supabase
        .from('sessions').select('*')
        .eq('mentee_name', menteeName)
        .order('started_at', { ascending: false })
      setSessions(sessionData || [])

      if (sessionData?.length > 0) {
        const { data: insightData } = await supabase
          .from('session_insights').select('*')
          .in('session_id', sessionData.map(s => s.meeting_id))
          .order('snapshot_time', { ascending: false })
        setInsights(insightData || [])
      }

      // Fetch brief
      const res = await fetch(`/api/brief/${encodeURIComponent(menteeName)}`)
      const data = await res.json()
      if (data.brief) setBrief(data)
    } finally { setLoading(false) }
  }

  async function refreshBrief() {
    setBriefLoading(true)
    try {
      const res = await fetch(`/api/brief/${encodeURIComponent(menteeName)}`)
      const data = await res.json()
      if (data.brief) setBrief(data)
    } finally { setBriefLoading(false) }
  }

  const finalInsights = insights.filter(i => i.is_final)
  const completedSessions = sessions.filter(s => s.status === 'ended')

  return (
    <div className="mh-overlay">
      <div className="mh-panel">
        {/* Header */}
        <div className="mh-header">
          <div className="mh-header-left">
            <div className="mh-avatar">{menteeName.split(' ').map(n=>n[0]).join('').slice(0,2)}</div>
            <div>
              <div className="mh-mentee-name">{menteeName}</div>
              <div className="mh-mentee-meta">{completedSessions.length} completed sessions · {finalInsights.length} AI insights</div>
            </div>
          </div>
          <div className="mh-header-right">
            {onJoinMeeting && (
              <button className="mh-join-btn" onClick={onJoinMeeting}>▶ Join Meeting</button>
            )}
            <button className="mh-close" onClick={onClose}>✕</button>
          </div>
        </div>

        {/* Tabs */}
        <div className="mh-tabs">
          <button className={`mh-tab ${activeTab==='brief'?'active':''}`} onClick={()=>setActiveTab('brief')}>📋 Pre-Meeting Brief</button>
          <button className={`mh-tab ${activeTab==='history'?'active':''}`} onClick={()=>setActiveTab('history')}>📅 Session History</button>
          <button className={`mh-tab ${activeTab==='insights'?'active':''}`} onClick={()=>setActiveTab('insights')}>✨ Cumulative Insights</button>
        </div>

        <div className="mh-body">
          {loading ? (
            <div className="mh-loading"><div className="mh-spinner"/><span>Loading mentee history…</span></div>
          ) : (
            <>
              {/* BRIEF TAB */}
              {activeTab === 'brief' && (
                <div className="mh-content">
                  {!brief ? (
                    <div className="mh-empty">
                      <div className="mh-empty-icon">📋</div>
                      <p>No brief available yet.</p>
                      <p className="mh-empty-sub">Complete at least one session with {menteeName} to generate a brief.</p>
                      <button className="mh-refresh-btn" onClick={refreshBrief} disabled={briefLoading}>
                        {briefLoading ? '⏳ Generating…' : '✨ Generate Brief'}
                      </button>
                    </div>
                  ) : (
                    <>
                      {/* Red flags */}
                      {brief.brief?.red_flags?.length > 0 && (
                        <div className="mh-red-flags">
                          <div className="mh-red-flag-title">🚩 Inconsistencies / Red Flags</div>
                          {brief.brief.red_flags.map((flag, i) => (
                            <div key={i} className="mh-red-flag-item">⚠ {flag}</div>
                          ))}
                        </div>
                      )}

                      {brief.brief?.progress_summary && (
                        <div className="mh-brief-section">
                          <div className="mh-brief-label">📈 Progress</div>
                          <div className="mh-brief-progress">{brief.brief.progress_summary}</div>
                        </div>
                      )}

                      {brief.brief?.focus_areas?.length > 0 && (
                        <div className="mh-brief-section">
                          <div className="mh-brief-label">🎯 Focus Areas</div>
                          <div className="mh-tags">
                            {brief.brief.focus_areas.map((a,i) => <span key={i} className="mh-tag">{a}</span>)}
                          </div>
                        </div>
                      )}

                      <div className="mh-brief-section">
                        <div className="mh-brief-label">📝 Overview</div>
                        <div className="mh-brief-text">{brief.brief.brief_text}</div>
                      </div>

                      {brief.brief?.key_questions?.length > 0 && (
                        <div className="mh-brief-section">
                          <div className="mh-brief-label">💡 Questions to Ask This Session</div>
                          {brief.brief.key_questions.map((q,i) => (
                            <div key={i} className="mh-question">
                              <span className="mh-q-num">{i+1}</span><span>{q}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      <button className="mh-refresh-btn" onClick={refreshBrief} disabled={briefLoading}>
                        {briefLoading ? '⏳ Refreshing…' : '🔄 Refresh Brief'}
                      </button>
                    </>
                  )}
                </div>
              )}

              {/* HISTORY TAB */}
              {activeTab === 'history' && (
                <div className="mh-content">
                  {sessions.length === 0 ? (
                    <div className="mh-empty"><div className="mh-empty-icon">📅</div><p>No sessions yet.</p></div>
                  ) : sessions.map(s => {
                    const si = insights.filter(i => i.session_id === s.meeting_id)
                    const fi = si.find(i => i.is_final)
                    return (
                      <div key={s.id} className={`mh-session-card ${expandedSession===s.id?'expanded':''}`}>
                        <div className="mh-session-header" onClick={() => setExpandedSession(expandedSession===s.id?null:s.id)}>
                          <div>
                            <div className="mh-session-topic">{s.topic || 'Untitled Session'}</div>
                            <div className="mh-session-meta">
                              {new Date(s.started_at).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})}
                              {s.ended_at && ` · ${Math.round((new Date(s.ended_at)-new Date(s.started_at))/60000)} min`}
                            </div>
                          </div>
                          <div style={{display:'flex',alignItems:'center',gap:8}}>
                            <span className={`mh-status ${s.status}`}>{s.status}</span>
                            <span style={{color:'#6b6f94',fontSize:11}}>{expandedSession===s.id?'▲':'▼'}</span>
                          </div>
                        </div>
                        {expandedSession === s.id && (
                          <div className="mh-session-body">
                            {fi ? (
                              <>
                                <div className="mh-brief-label">📝 Summary</div>
                                <div className="mh-summary-text">{fi.summary}</div>
                                {fi.questions?.length > 0 && (
                                  <>
                                    <div className="mh-brief-label" style={{marginTop:10}}>💡 Questions for Next</div>
                                    {fi.questions.map((q,i) => (
                                      <div key={i} className="mh-question-sm">
                                        <span className="mh-q-num-sm">{i+1}</span><span>{q}</span>
                                      </div>
                                    ))}
                                  </>
                                )}
                              </>
                            ) : (
                              <div className="mh-no-summary">{s.status==='ended'?'No summary for this session.':'Session still active.'}</div>
                            )}
                            <button className="mh-tx-btn" onClick={() => setViewingTranscript(s)}>📄 View Transcript</button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* INSIGHTS TAB */}
              {activeTab === 'insights' && (
                <div className="mh-content">
                  {finalInsights.length === 0 ? (
                    <div className="mh-empty"><div className="mh-empty-icon">✨</div><p>No insights yet. Complete a session to generate AI insights.</p></div>
                  ) : (
                    <>
                      <div className="mh-insights-summary">
                        <div className="mh-is-title">Cumulative AI Analysis across {completedSessions.length} sessions</div>
                      </div>
                      {finalInsights.map((ins, idx) => {
                        const session = sessions.find(s => s.meeting_id === ins.session_id)
                        return (
                          <div key={ins.id} className="mh-insight-card">
                            <div className="mh-insight-header">
                              <div className="mh-insight-num">Session {finalInsights.length - idx}</div>
                              <div className="mh-insight-topic">{session?.topic || 'General'}</div>
                              <div className="mh-insight-date">
                                {new Date(ins.snapshot_time).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})}
                              </div>
                            </div>
                            <div className="mh-insight-summary">{ins.summary}</div>
                            {ins.questions?.length > 0 && (
                              <div className="mh-insight-qs">
                                {ins.questions.map((q,i) => (
                                  <div key={i} className="mh-question-sm">
                                    <span className="mh-q-num-sm">{i+1}</span><span>{q}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {viewingTranscript && (
        <TranscriptViewer
          sessionId={viewingTranscript.meeting_id}
          topic={viewingTranscript.topic}
          onClose={() => setViewingTranscript(null)}
        />
      )}
    </div>
  )
}

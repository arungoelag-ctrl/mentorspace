import React, { useState, useEffect } from 'react'
import './PreMeetingBrief.css'

export default function PreMeetingBrief({ menteeName, mentorName, onClose, compact = false, companyName = '', companyStage = '', meetingGoal = '', mentorEmail = '', requestId = '', onBriefLoaded = null }) {
  const [brief, setBrief] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (menteeName) fetchBrief()
  }, [menteeName])

  async function fetchBrief() {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        mentorEmail,
        companyName,
        stage: companyStage,
        goal: meetingGoal,
        ...(requestId ? { requestId } : {})
      })
      const res = await fetch(`/api/brief-with-context/${encodeURIComponent(menteeName)}?${params}`)
      const data = await res.json()
      if (data.error) { setError(data.error); return }
      if (data.message) { setError(data.message); return }
      setBrief(data)
      if (onBriefLoaded && data?.brief) onBriefLoaded(data.brief)
    } catch (err) {
      setError('Could not load brief: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  if (loading) return (
    <div className={`pmb-wrap ${compact ? 'compact' : ''}`}>
      <div className="pmb-loading">
        <div className="pmb-spinner" />
        <span>Loading pre-meeting brief for {menteeName}…</span>
      </div>
    </div>
  )

  if (error) return (
    <div className={`pmb-wrap ${compact ? 'compact' : ''}`}>
      <div className="pmb-empty">
        <div className="pmb-empty-icon">📋</div>
        <p>{error}</p>
        <p className="pmb-empty-sub">Complete a session with {menteeName} to generate briefs.</p>
      </div>
    </div>
  )

  if (!brief || !brief.brief) return (
    <div className={`pmb-wrap ${compact ? 'compact' : ''}`}>
      <div className="pmb-empty">
        <div className="pmb-empty-icon">🌱</div>
        <p>No previous sessions with {menteeName} yet.</p>
        <p className="pmb-empty-sub">After your first session ends, a brief will be generated here.</p>
      </div>
    </div>
  )

  const { brief: b, sessions } = brief

  return (
    <div className={`pmb-wrap ${compact ? 'compact' : ''}`}>
      {!compact && (
        <div className="pmb-header">
          <div className="pmb-title">
            <span className="pmb-icon">📋</span>
            Pre-Meeting Brief
          </div>
          <div className="pmb-meta">
            {menteeName} · {sessions?.length || 0} previous sessions
            {brief.fresh && <span className="pmb-fresh">✨ freshly generated</span>}
          </div>
          {onClose && <button className="pmb-close" onClick={onClose}>✕</button>}
        </div>
      )}

      <div className="pmb-body">
        {/* Progress summary */}
        {b.progress_summary && (
          <div className="pmb-section pmb-progress">
            <div className="pmb-section-label">📈 Progress</div>
            <div className="pmb-progress-text">{b.progress_summary}</div>
          </div>
        )}

        {/* Red flags */}
        {b.red_flags && b.red_flags.filter(f=>f).length > 0 && (
          <div className="pmb-section pmb-red-flags">
            <div className="pmb-section-label" style={{color:'var(--red)'}}>🚩 Red Flags</div>
            {b.red_flags.map((f,i) => (
              <div key={i} className="pmb-flag-item">⚠ {f}</div>
            ))}
          </div>
        )}

        {/* Action items */}
        {b.action_items && b.action_items.filter(a=>a).length > 0 && (
          <div className="pmb-section pmb-action-items">
            <div className="pmb-section-label" style={{color:'var(--green)'}}>✅ Outstanding Action Items</div>
            {b.action_items.map((a,i) => (
              <div key={i} className="pmb-action-item">
                <span className="pmb-q-num">{i+1}</span>
                <span>{a}</span>
              </div>
            ))}
          </div>
        )}

        {/* Main brief */}
        <div className="pmb-section">
          <div className="pmb-section-label">📝 Overview</div>
          <div className="pmb-brief-text">{b.brief_text}</div>
        </div>

        {/* Focus areas */}
        {b.focus_areas && b.focus_areas.length > 0 && (
          <div className="pmb-section">
            <div className="pmb-section-label">🎯 Focus Areas</div>
            <div className="pmb-focus-areas">
              {b.focus_areas.map((area, i) => (
                <span key={i} className="pmb-focus-tag">{area}</span>
              ))}
            </div>
          </div>
        )}

        {/* Key questions */}
        {b.key_questions && b.key_questions.length > 0 && (
          <div className="pmb-section">
            <div className="pmb-section-label">💡 Questions to Ask</div>
            <div className="pmb-questions">
              {b.key_questions.map((q, i) => (
                <div key={i} className="pmb-question">
                  <span className="pmb-q-num">{i + 1}</span>
                  <span>{q}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Past sessions timeline */}
        {sessions && sessions.length > 0 && (
          <div className="pmb-section">
            <div className="pmb-section-label">🕐 Session History</div>
            <div className="pmb-sessions">
              {sessions.map((s, i) => (
                <div key={s.id} className="pmb-session-row">
                  <span className="pmb-session-num">{sessions.length - i}</span>
                  <div>
                    <div className="pmb-session-topic">{s.topic || 'General session'}</div>
                    <div className="pmb-session-date">
                      {s.ended_at ? new Date(s.ended_at).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' }) : 'In progress'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

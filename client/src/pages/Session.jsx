import React, { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'
import { localDateKey, tomorrowDateKey } from '../lib/dateUtils'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { getSignature } from '../lib/api'
import PreMeetingBrief from './PreMeetingBrief'
import './Session.css'

function TranscriptLine({ line }) {
  return (
    <div className={`tx-line ${line.speaker === 'me' ? 'tx-me' : 'tx-other'} ${!line.done ? 'tx-interim' : ''}`}>
      <div className="tx-meta">
        <span className="tx-speaker">{line.name}</span>
        <span className="tx-time">{line.time}</span>
        {!line.done && <span className="tx-typing">…</span>}
      </div>
      <div className="tx-text">{line.text}</div>
    </div>
  )
}

function TranscriptTab({ transcript, setTranscript, meetingNumber, transcriptEndRef, transcriptActiveRef, transcriptActive, setTranscriptActive }) {
  const [error, setError] = useState('')

  function clickThroughMenus(finalLabel) {
    // Temporarily boost z-index for More button
    const affected = []
    document.querySelectorAll('[class*="more"], [class*="toolbar"], [class*="footer"]').forEach(el => {
      if (el.style) {
        affected.push({ el, prev: el.style.zIndex })
        el.style.zIndex = '999999'
      }
    })
    // Restore z-index after clicks complete
    const restoreZIndex = () => {
      affected.forEach(({ el, prev }) => { el.style.zIndex = prev })
    }
    const moreBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'More')
    if (!moreBtn) { restoreZIndex(); return }
    moreBtn.click()
    setTimeout(() => {
      const captionsEl = Array.from(document.querySelectorAll('*')).find(e => e.children.length === 0 && e.textContent.trim() === 'Captions')
      if (captionsEl) {
        captionsEl.click()
        setTimeout(() => {
          const targetEl = Array.from(document.querySelectorAll('*')).find(e => e.children.length === 0 && e.textContent.trim() === finalLabel)
          if (targetEl) targetEl.click()
          setTimeout(() => {
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
            restoreZIndex()
          }, 100)
        }, 300)
      } else {
        restoreZIndex()
      }
    }, 300)
  }

  function toggleTranscript() {
    if (transcriptActive) {
      clickThroughMenus('Hide Captions')
      if (transcriptActiveRef) transcriptActiveRef.current = false
      setTranscriptActive(false)
    } else {
      clickThroughMenus('Show Captions')
      if (transcriptActiveRef) transcriptActiveRef.current = true
      setTranscriptActive(true)
    }
  }

  return (
    <div className="transcript-body">
      <div className="tx-enable-bar">
        <button className={`tx-enable-btn ${transcriptActive ? 'active' : ''}`} onClick={toggleTranscript}>
          {transcriptActive ? '⏹ Disable Live Transcript' : '🎙 Enable Live Transcript'}
        </button>
      </div>

      {error && <div className="tx-error">⚠ {error}</div>}
      {transcript.length === 0 && !error && (
        <div className="tx-empty">
          <div className="tx-empty-icon">🎙</div>
          <p>Click Enable Live Transcript then speak.</p>
          <p className="tx-empty-sub">Or fetch from Zoom after the meeting.</p>
        </div>
      )}
      {transcript.length > 0 && (
        <>
          {transcript.map(line => <TranscriptLine key={line.id} line={line} />)}
          <div ref={transcriptEndRef} />
        </>
      )}
    </div>
  )
}

function AiInsights({ transcript, topic, insights, setInsights, meetingNumber }) {
  const [loading, setLoading] = useState(false)
  const [selectedIdx, setSelectedIdx] = useState(null)
  const insightsEndRef = useRef(null)

  useEffect(() => {
    if (insightsEndRef.current) insightsEndRef.current.scrollIntoView({ behavior: 'smooth' })
  }, [insights])

  async function generate() {
    if (transcript.length === 0) return
    setLoading(true)
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    try {
      // Only send transcript since last snapshot
      const lastSnapshot = insights[insights.length - 1]
      const lastLength = lastSnapshot ? lastSnapshot.transcriptLength : 0
      const newLines = transcript.slice(lastLength)
      if (newLines.length === 0) {
        setLoading(false)
        return
      }
      const res = await fetch('/api/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: newLines, topic, sinceSnapshot: lastLength > 0 })
      })
      const parsed = await res.json()
      if (parsed.error) throw new Error(parsed.error)
      const newInsight = { id: Date.now(), timestamp, summary: parsed.summary, questions: parsed.questions, transcriptLength: transcript.length }
      setInsights(prev => { const updated = [...prev, newInsight]; setSelectedIdx(updated.length - 1); return updated })
      if (meetingNumber) {
        fetch(`/api/sessions/${meetingNumber}/insights/save`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ summary: parsed.summary, questions: parsed.questions, transcriptLength: transcript.length })
        }).catch(() => {})
      }
    } catch (err) {
      setInsights(prev => [...prev, { id: Date.now(), timestamp, summary: 'Error: ' + err.message, questions: [], transcriptLength: transcript.length }])
    } finally { setLoading(false) }
  }

  const selectedInsight = selectedIdx !== null ? insights[selectedIdx] : insights[insights.length - 1]

  if (transcript.length === 0) return (
    <div className="ai-empty">
      <div className="ai-empty-icon">🤖</div>
      <p>AI insights appear once transcript starts.</p>
      <p className="ai-empty-sub">Needs at least a few lines of transcript.</p>
    </div>
  )

  return (
    <div className="ai-panel">
      <button className="ai-generate-btn" onClick={generate} disabled={loading}>
        {loading ? '⏳ Analysing…' : '✨ Generate Insights Snapshot'}
      </button>
      {loading && <div className="ai-loading"><div className="ai-spinner" /><span>Analysing…</span></div>}
      {insights.length === 0 && !loading && (
        <div className="ai-hint">Each click adds a timestamped snapshot — all are saved.</div>
      )}
      {insights.length > 0 && (
        <>
          <div className="insights-history">
            <div className="insights-history-label">Snapshots</div>
            <div className="insights-pills">
              {insights.map((ins, idx) => (
                <button key={ins.id}
                  className={`insight-pill ${(selectedIdx === idx || (selectedIdx === null && idx === insights.length - 1)) ? 'active' : ''}`}
                  onClick={() => setSelectedIdx(idx)}>
                  {ins.timestamp}
                  {idx === insights.length - 1 && <span className="pill-latest">●</span>}
                </button>
              ))}
            </div>
          </div>
          {selectedInsight && (
            <div className="insight-snapshot">
              <div className="insight-ts-bar">
                <span className="insight-ts">🕐 {selectedInsight.timestamp}</span>
                <span className="insight-count">
                  {selectedIdx > 0 || (selectedIdx === null && insights.length > 1)
                    ? `+${selectedInsight.transcriptLength} new lines`
                    : `${selectedInsight.transcriptLength} lines`}
                </span>
                {selectedInsight === insights[insights.length - 1] && <span className="insight-latest">latest</span>}
              </div>
              <div className="ai-section">
                <div className="ai-section-label">📝 Summary</div>
                <div className="ai-summary">{selectedInsight.summary}</div>
              </div>
              {selectedInsight.questions?.length > 0 && (
                <div className="ai-section" style={{ paddingBottom: 14 }}>
                  <div className="ai-section-label">💡 Suggested Questions</div>
                  <div className="ai-questions">
                    {selectedInsight.questions.map((q, i) => (
                      <div key={i} className="ai-question">
                        <span className="ai-q-num">{i + 1}</span><span>{q}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          <div ref={insightsEndRef} />
        </>
      )}
    </div>
  )
}

export default function Session() {
  const { id: meetingNumber } = useParams()
  const navigate = useNavigate()
  const { profile, user, signOut } = useAuth()
  const [phase, setPhase] = useState('setup')
  const [userName, setUserName] = useState('')
  const [userEmail, setUserEmail] = useState('')
  const [password, setPassword] = useState('')
  const [topic, setTopic] = useState('')
  const [mentorName, setMentorName] = useState('')
  const [menteeName, setMenteeName] = useState('')
  const [menteeEmail, setMenteeEmail] = useState('')
  const [menteeProfile, setMenteeProfile] = useState(null)
  const [expertQuery, setExpertQuery] = useState('')
  const [expandedExperts, setExpandedExperts] = useState({})
  const [selectedExpert, setSelectedExpert] = useState(null)
  const [expertScoreCache, setExpertScoreCache] = useState({})
  const [scoringExpert, setScoringExpert] = useState(null)
  const [errMsg, setErrMsg] = useState('')
  const [copied, setCopied] = useState('')
  const [activeTab, setActiveTab] = useState('transcript')
  const [briefData, setBriefData] = useState(null)
  const [briefLoading, setBriefLoading] = useState(false)

  const [actionTab, setActionTab] = useState('outstanding')
  const [selectedActions, setSelectedActions] = useState([])
  const [actionComments, setActionComments] = useState('')
  const [savingActions, setSavingActions] = useState(false)
  const [savedActions, setSavedActions] = useState(false)
  const [showExpertModal, setShowExpertModal] = useState(false)
  const [expertAvailability, setExpertAvailability] = useState([])
  const [expertSelectedSlot, setExpertSelectedSlot] = useState({}) // {expertId: {avail, slot}}
  const [expertModalDate, setExpertModalDate] = useState({}) // {expertId: availObj}
  const [sendingExpertRequest, setSendingExpertRequest] = useState(null)
  const [sentExpertRequests, setSentExpertRequests] = useState({})
  const [expertMatches, setExpertMatches] = useState([])
  const [loadingExperts, setLoadingExperts] = useState(false)
  const [transcript, setTranscript] = useState([])
  const [insights, setInsights] = useState([])
  const [postMeetingSummary, setPostMeetingSummary] = useState(null)
  const transcriptEndRef = useRef(null)
  const zoomRef = useRef(null)
  const [meetingActive, setMeetingActive] = useState(false)
  const transcriptRef = useRef([])
  const transcriptActiveRef = useRef(false)
  const [transcriptActive, setTranscriptActive] = useState(false)

  const role = profile?.role || 'mentor'

  // Release devices if tab is closed without ending meeting
  useEffect(() => {
    const cleanup = () => {
      try {
        navigator.mediaDevices.getUserMedia({ video: true, audio: true })
          .then(s => s.getTracks().forEach(t => t.stop())).catch(()=>{})
      } catch(e) {}
    }
    window.addEventListener('beforeunload', cleanup)
    return () => window.removeEventListener('beforeunload', cleanup)
  }, [])

  useEffect(() => {
    // Fetch mentee email from meeting request
    if (role === 'mentor' && meetingNumber) {
      supabase.from('meeting_requests').select('mentee_email').eq('zoom_meeting_id', meetingNumber).single()
        .then(({data}) => {
          if (data?.mentee_email) {
            setMenteeEmail(data.mentee_email)
            // Fetch mentee profile for richer expert matching
            supabase.from('profiles').select('product,theme,problem_statement,state,revenue_lakhs,company_name,tiering').eq('email', data.mentee_email).single()
              .then(({data: mp}) => { if (mp) setMenteeProfile(mp) })
          }
        })
    }

    if (role === 'mentor' && menteeName) {
      setBriefLoading(true)
      fetch('/api/brief-with-context/' + encodeURIComponent(menteeName) + '?' + new URLSearchParams({
        mentorEmail: userEmail || '',
        companyName: topic || '',
        stage: '',
        goal: ''
      }))
        .then(r => r.json())
        .then(data => { if (data?.brief) setBriefData(data.brief) })
        .catch(() => {})
        .finally(() => setBriefLoading(false))
    }
  }, [role, menteeName])
  const initials = (profile?.full_name || 'AK').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()

  useEffect(() => {
    if (!profile) return
    setUserName(profile.full_name || '')
    setUserEmail(user?.email || '')
    const raw = sessionStorage.getItem('session')
    if (raw) {
      const s = JSON.parse(raw)
      if (s.meetingNumber === meetingNumber) {
        setPassword(s.password || '')
        setTopic(s.topic || '')
        setMentorName(s.mentorName || '')
        setMenteeName(s.menteeName || '')
      }
    }
  }, [meetingNumber, profile, user])

  // Auto-join once userName is set
  useEffect(() => {
    if (phase === 'setup' && userName) {
      const timer = setTimeout(() => join(), 300)
      return () => clearTimeout(timer)
    }
  }, [phase, userName])

  useEffect(() => {
    transcriptRef.current = transcript
    // sync transcriptActiveRef from TranscriptTab is done via window
    if (transcript.length > 0) {
      sessionStorage.setItem('lastTranscript', JSON.stringify(transcript))
    }
    if (transcriptEndRef.current) transcriptEndRef.current.scrollIntoView({ behavior: 'smooth' })
  }, [transcript])

  // Load existing insights from DB when session goes live (only if none in memory)
  useEffect(() => {
    if (phase !== 'live' || !meetingNumber) return
    fetch(`/api/sessions/${meetingNumber}/insights`)
      .then(r => r.json())
      .then(data => {
        if (data.insights?.length > 0) {
          setInsights(prev => {
            if (prev.length > 0) return prev // don't overwrite existing
            return data.insights.map(ins => ({
              id: ins.id,
              timestamp: new Date(ins.snapshot_time).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}),
              summary: ins.summary,
              questions: ins.questions || [],
              transcriptLength: ins.transcript_length || 0
            }))
          })
        }
      }).catch(() => {})
  }, [phase, meetingNumber])

  // Load existing insights from DB when session goes live (only if none in memory)
  useEffect(() => {
    if (phase !== 'live' || !meetingNumber) return
    fetch(`/api/sessions/${meetingNumber}/insights`)
      .then(r => r.json())
      .then(data => {
        if (data.insights?.length > 0) {
          setInsights(prev => {
            if (prev.length > 0) return prev // don't overwrite existing
            return data.insights.map(ins => ({
              id: ins.id,
              timestamp: new Date(ins.snapshot_time).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}),
              summary: ins.summary,
              questions: ins.questions || [],
              transcriptLength: ins.transcript_length || 0
            }))
          })
        }
      }).catch(() => {})
  }, [phase, meetingNumber])

  // Auto-save transcript every 30 seconds during live session
  useEffect(() => {
    if (phase !== 'live') return
    const interval = setInterval(() => {
      const lines = transcriptRef.current
      if (lines.length > 0) {
        fetch(`/api/sessions/${meetingNumber}/transcript/save`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lines })
        }).catch(() => {})
      }
    }, 30000)

    // Save transcript when page is about to unload (Zoom redirect)
    const handleUnload = () => {
      const lines = transcriptRef.current
      if (lines.length > 0) {
        // sendBeacon works even during page unload
        const blob = new Blob(
          [JSON.stringify({ lines })],
          { type: 'application/json' }
        )
        navigator.sendBeacon(`/api/sessions/${meetingNumber}/transcript/save`, blob)
      }
    }
    window.addEventListener('beforeunload', handleUnload)
    return () => {
      clearInterval(interval)
      window.removeEventListener('beforeunload', handleUnload)
    }
  }, [phase, meetingNumber])

  function copy(text, label) {
    navigator.clipboard.writeText(text); setCopied(label); setTimeout(() => setCopied(''), 2000)
  }

  async function handleEndMeeting() {
    try {
      const currentTranscript = transcriptRef.current || []
      const res = await fetch(`/api/sessions/${meetingNumber}/end`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: currentTranscript, topic, mentorName: role === 'mentor' ? userName : mentorName, menteeName: role === 'mentee' ? userName : menteeName })
      })
      const data = await res.json()
      if (data.finalSummary) setPostMeetingSummary(data.finalSummary)
    } catch (e) { console.log('Could not save session end:', e) }
  }

  const join = useCallback(async () => {
    if (!userName.trim()) { setErrMsg('Name not loaded yet, please wait.'); return }
    setErrMsg(''); setPhase('loading')
    const uName = userName

    // Store current meeting info so we can end it if Zoom redirects us away
    const currentSession = JSON.parse(sessionStorage.getItem('session') || '{}')
    localStorage.setItem('activeMeeting', JSON.stringify({
      meetingNumber, topic, role,
      mentorName: role === 'mentor' ? uName : (currentSession.mentorName || mentorName || ''),
      menteeName: role === 'mentee' ? uName : (currentSession.menteeName || menteeName || '')
    }))

    fetch('/api/sessions/save', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ meetingId: meetingNumber, topic, mentorName: role === 'mentor' ? uName : mentorName, menteeName: role === 'mentee' ? uName : menteeName, menteeEmail: role === 'mentee' ? userEmail : '', mentorEmail: role === 'mentor' ? userEmail : '' })
    }).catch(() => {})

    try {
      const { ZoomMtg } = await import('@zoom/meetingsdk')
      zoomRef.current = ZoomMtg
      ZoomMtg.preLoadWasm(); ZoomMtg.prepareWebSDK()

      try {
        ZoomMtg.inMeetingServiceListener('onReceiveTranscriptionMsg', (data) => {
          if (!transcriptActiveRef.current) return
          if (!data?.text?.trim()) return
          const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          const isMe = data.displayName === uName.trim()
          setTranscript(prev => {
            const last = prev[prev.length - 1]
            if (last && last.name === data.displayName && !last.done) {
              return [...prev.slice(0, -1), { ...last, text: data.text, done: !!data.done }]
            }
            return [...prev, { id: Date.now() + Math.random(), name: data.displayName, speaker: isMe ? 'me' : 'other', text: data.text, time: now, done: !!data.done }]
          })
        })
      } catch (e) { console.log('Transcript listener error:', e.message) }

      const numericRole = role === 'mentor' ? 1 : 0
      const { signature, sdkKey } = await getSignature({ meetingNumber, role: numericRole })

      ZoomMtg.init({
        leaveUrl: window.location.origin + '/?ended=1',
        patchJsMedia: true,
        success: () => {
          ZoomMtg.join({
            signature, sdkKey, meetingNumber,
            userName: uName.trim(), userEmail: userEmail.trim(), passWord: password,
            success: () => { setPhase('live'); setMeetingActive(true); try { const am = JSON.parse(localStorage.getItem('activeMeeting')||'{}'); localStorage.setItem('activeMeeting', JSON.stringify({...am, wasActive:true})) } catch(e) {} },
            error: (e) => { setErrMsg('Join failed: ' + (e.reason || JSON.stringify(e))); setPhase('setup') }
          })
        },
        error: (e) => { setErrMsg('Init failed: ' + (e.reason || JSON.stringify(e))); setPhase('setup') }
      })

      setTimeout(() => setPhase(p => p === 'loading' ? 'live' : p), 10000)
    } catch (err) { setErrMsg('Error: ' + err.message); setPhase('setup') }
  }, [meetingNumber, role, userName, userEmail, password, topic, mentorName, menteeName])

  async function findExperts(customQuery = '') {
    setShowExpertModal(true)
    if (expertMatches.length > 0 && !customQuery) return
    setLoadingExperts(true)
    try {
      const lines = (transcriptRef.current || []).slice(-30).map(l => l.name + ': ' + l.text).join('\n')
      const briefContext = briefData ? [
        briefData.progress_summary,
        briefData.focus_areas?.join(', '),
        briefData.red_flags?.join(', ')
      ].filter(Boolean).join('. ') : ''
      const fullContext = customQuery || [
        menteeProfile?.problem_statement,
        lines.slice(-500),
        briefContext
      ].filter(Boolean).join('\n')

      const res = await fetch('/api/match-mentors', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({
          tiering: menteeProfile?.tiering || 'Liftoff',
          product: menteeProfile?.product || topic,
          theme: menteeProfile?.theme || 'Expert Connection',
          problemStatement: fullContext,
          companyName: menteeProfile?.company_name || menteeName,
          state: menteeProfile?.state || '',
          revenueLakhs: menteeProfile?.revenue_lakhs || '',
          matchCount: 6
        })
      })
      const data = await res.json()
      const matches = data.matches || []
      setExpertMatches(matches)
      if (matches.length > 0) {
        const today = tomorrowDateKey()
        const emails = matches.map(m => m.email)
        const { data: avail } = await supabase.from('mentor_availability')
          .select('*').in('mentor_email', emails).gte('date', today).order('date')
        setExpertAvailability(avail || [])
      }
    } catch(e) { console.error(e) }
    finally { setLoadingExperts(false) }
  }

  async function leave() {
    localStorage.removeItem('activeMeeting')
    try {
      if (role === 'mentor') {
        zoomRef.current?.endMeeting({})
      } else {
        zoomRef.current?.leaveMeeting({})
      }
    } catch (e) { console.log('Leave error:', e) }

    // Release camera and microphone back to OS
    try {
      const streams = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      streams.getTracks().forEach(track => track.stop())
    } catch(e) {}
    try {
      document.querySelectorAll('video, audio').forEach(el => {
        if (el.srcObject) { el.srcObject.getTracks().forEach(t => t.stop()); el.srcObject = null }
      })
    } catch(e) {}

    if (meetingActive) await handleEndMeeting()
    setPhase('ended')
  }

  // ── SETUP ──────────────────────────────────────────────────────────────────
  if (phase === 'setup') return (
    <div className="session-setup">
      <div className="setup-card">
        <div className="setup-meeting-info">
          <div className="smi-row"><span className="smi-label">Topic</span><span className="smi-value">{topic || 'Session'}</span></div>
          <div className="smi-row">
            <span className="smi-label">Meeting ID</span>
            <span className="smi-value mono accent">{meetingNumber}</span>
            <button className="mini-copy" onClick={() => copy(meetingNumber, 'id')}>{copied === 'id' ? '✓' : 'Copy'}</button>
          </div>
          {password && <div className="smi-row">
            <span className="smi-label">Password</span>
            <span className="smi-value mono accent">{password}</span>
            <button className="mini-copy" onClick={() => copy(password, 'pw')}>{copied === 'pw' ? '✓' : 'Copy'}</button>
          </div>}
        </div>

        <div className="who-joining">
          <div className="wj-avatar">{initials}</div>
          <div className="wj-info">
            <div className="wj-name"><strong>{userName || 'Loading…'}</strong></div>
            <div className="wj-email">{userEmail}</div>
          </div>
          <div className={`wj-role-badge ${role}`}>{role === 'mentor' ? '🎓 Mentor' : '🙋 Mentee'}</div>
        </div>

        {errMsg && <div className="err-box">⚠ {errMsg}</div>}

        <div className="setup-actions">
          <button className="btn btn-ghost" onClick={() => navigate('/')}>← Back</button>
          <button id="join-session-btn" className="btn btn-primary btn-lg" onClick={join}>▶ Join Session</button>
        </div>
        <div className="device-note">🎙 Chrome will ask for mic, speaker and camera — click Allow on all three.</div>
      </div>
    </div>
  )

  if (phase === 'loading') return (
    <div className="session-loading">
      <div className="loading-ring" />
      <p className="loading-text">Connecting to Zoom…</p>
      <p className="loading-sub">Zoom UI will appear in about 10 seconds</p>
      <button className="btn btn-ghost" style={{marginTop:24}} onClick={() => navigate('/')}>
        ← Back to Dashboard
      </button>
    </div>
  )

  if (phase === 'ended') return (
    <div className="session-ended">
      <div className="ended-card">
        <div className="ended-icon">✓</div>
        <h2 className="ended-title">Session Complete</h2>
        {postMeetingSummary ? (
          <div className="post-summary">
            <div className="ps-section"><div className="ps-label">📝 Summary</div><div className="ps-text">{postMeetingSummary.summary}</div></div>
            {postMeetingSummary.key_learnings?.length > 0 && <div className="ps-section"><div className="ps-label">🎓 Key Learnings</div>{postMeetingSummary.key_learnings.map((l, i) => <div key={i} className="ps-item">• {l}</div>)}</div>}
            {postMeetingSummary.action_items?.length > 0 && <div className="ps-section"><div className="ps-label">✅ Action Items</div>{postMeetingSummary.action_items.map((a, i) => <div key={i} className="ps-item">• {a}</div>)}</div>}
            {postMeetingSummary.questions_for_next?.length > 0 && <div className="ps-section"><div className="ps-label">💡 For Next Session</div>{postMeetingSummary.questions_for_next.map((q, i) => <div key={i} className="ps-item">• {q}</div>)}</div>}
            <p className="ps-saved">✅ Saved to mentee profile</p>
          </div>
        ) : <p className="ended-sub">Generating final summary…</p>}
        <button className="btn btn-primary" onClick={() => navigate('/')} style={{ marginTop: 20 }}>Back to Dashboard</button>
      </div>
    </div>
  )

  // ── LIVE ──────────────────────────────────────────────────────────────────
  return (
    <div className="session-live-wrap">
      <div className="live-topbar">
        <div className="live-left">
          <span className="live-dot-big" />
          <div>
            <div className="live-topic">{topic || 'Live Session'}</div>
            <div className="live-meta">
              <span className="live-id">ID: {meetingNumber}</span>
              {password && <span className="live-pw"> · PW: {password}</span>}
            </div>
          </div>
        </div>
        <div className="live-right">
          {role === 'mentor' && (
            <button className="brief-btn" onClick={() => setActiveTab(t => t === 'brief' ? 'transcript' : 'brief')}>
              📋 Brief
            </button>
          )}
          <div className="live-who">
            <div className="live-avatar">{initials}</div>
            <div>
              <div className="live-name">{userName}</div>
              <div className="live-role-chip">{role}</div>
            </div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={signOut} style={{ marginRight: 4 }}>Sign out</button>
          <button className="btn btn-danger btn-sm" onClick={leave} disabled={!meetingActive} style={{opacity:meetingActive?1:0.4,cursor:meetingActive?'pointer':'not-allowed'}}>{role === "mentor" ? "End Meeting ✕" : "Leave ✕"}</button>
        </div>
      </div>

      <div className="live-workbench">
        <div className="zoom-col"><div id="meetingSDKElement" className="zoom-embed" /></div>
        <div className="side-panel">
          <div className="panel-tabs">
            <button className={'panel-tab ' + (activeTab === 'transcript' ? 'active' : '')} onClick={() => setActiveTab('transcript')}>
              📝 Transcript {transcript.length > 0 && <span className="tab-count">{transcript.length}</span>}
            </button>
            <button className={'panel-tab ' + (activeTab === 'ai' ? 'active' : '')} onClick={() => setActiveTab('ai')}>
              ✨ AI Insights
            </button>
            {role === 'mentor' && (
              <button className={'panel-tab ' + (activeTab === 'actions' ? 'active' : '')} onClick={() => setActiveTab('actions')}>
                ✅ Action Items {briefData?.action_items?.filter(a=>a).length > 0 && <span className="tab-count">{briefData.action_items.filter(a=>a).length}</span>}
              </button>
            )}
            {role === 'mentor' && (
              <button className={'panel-tab ' + (activeTab === 'brief' ? 'active' : '')} onClick={() => setActiveTab('brief')}>
                📋 Brief
              </button>
            )}
          </div>
          {activeTab === 'transcript' && <TranscriptTab transcript={transcript} setTranscript={setTranscript} meetingNumber={meetingNumber} transcriptEndRef={transcriptEndRef} transcriptActiveRef={transcriptActiveRef} transcriptActive={transcriptActive} setTranscriptActive={setTranscriptActive} />}
          {activeTab === 'ai' && <div className="ai-body"><AiInsights transcript={transcript} topic={topic} insights={insights} setInsights={setInsights} meetingNumber={meetingNumber} /></div>}
          {activeTab === 'actions' && role === 'mentor' && (
            <div className="actions-panel">
              <div className="actions-subtabs">
                <button className={`actions-subtab ${actionTab==='outstanding'?'active':''}`} onClick={()=>setActionTab('outstanding')}>
                  📋 Outstanding
                </button>
                <button className={`actions-subtab ${actionTab==='new'?'active':''}`} onClick={()=>setActionTab('new')}>
                  ✅ New Actions
                </button>
              </div>

              {actionTab === 'outstanding' && (
                <div className="actions-list">
                  {briefData?.action_items?.filter(a=>a).length > 0 ? briefData.action_items.map((a,i) => (
                    <div key={i} className="actions-panel-item">
                      <span className="actions-num">{i+1}</span>
                      <span>{a}</span>
                    </div>
                  )) : (
                    <div className="actions-empty">
                      <div style={{fontSize:28,marginBottom:12}}>✅</div>
                      <p>No outstanding action items</p>
                      <p style={{fontSize:12,color:'var(--faint)',marginTop:4}}>Items from past sessions appear here</p>
                    </div>
                  )}
                </div>
              )}

              {actionTab === 'new' && (
                <div className="actions-new">
                  <div className="actions-new-label">Select action items agreed in this session:</div>
                  <div className="actions-new-options">
                    {['Playbook','Connect to Expert','Register for Masterclass','Service Provider','Research'].map(action => (
                      <button key={action}
                        className={`actions-new-btn ${selectedActions.includes(action)?'selected':''}`}
                        onClick={() => {
                          if (action === 'Connect to Expert') { findExperts(); setSelectedActions(prev => prev.includes(action)?prev:[...prev,action]) }
                          else setSelectedActions(prev => prev.includes(action)?prev.filter(a=>a!==action):[...prev,action])
                        }}>
                        {action === 'Playbook' && '📘 '}
                        {action === 'Connect to Expert' && '🤝 '}
                        {action === 'Register for Masterclass' && '🎓 '}
                        {action === 'Service Provider' && '🔧 '}
                        {action === 'Research' && '🔍 '}
                        {action}
                      </button>
                    ))}
                  </div>
                  <div className="actions-new-label" style={{marginTop:14}}>Comments</div>
                  <textarea className="actions-comments"
                    placeholder="Add any notes or context for these action items…"
                    rows={4}
                    value={actionComments}
                    onChange={e => setActionComments(e.target.value)} />
                  <button className="actions-save-btn"
                    disabled={savingActions || (selectedActions.length === 0 && !actionComments)}
                    onClick={async () => {
                      setSavingActions(true)
                      try {
                        const { createClient } = await import('@supabase/supabase-js')
                        const sb = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY)
                        await Promise.all(selectedActions.map(action =>
                          sb.from('session_action_items').insert({
                            session_id: meetingNumber,
                            mentor_email: role === 'mentor' ? userEmail : undefined,
                            mentee_email: role === 'mentee' ? userEmail : undefined,
                            mentee_name: menteeName,
                            mentor_name: role === 'mentor' ? userName : mentorName,
                            action_type: action,
                            comments: actionComments,
                            status: 'pending'
                          })
                        ))
                        if (selectedActions.length === 0 && actionComments) {
                          const sb2 = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY)
                          await sb2.from('session_action_items').insert({
                            session_id: meetingNumber,
                            mentee_name: menteeName,
                            mentor_name: role === 'mentor' ? userName : mentorName,
                            action_type: 'General',
                            comments: actionComments
                          })
                        }
                        setSavedActions(true)
                        setTimeout(() => setSavedActions(false), 3000)
                        setSelectedActions([])
                        setActionComments('')
                      } finally { setSavingActions(false) }
                    }}>
                    {savingActions ? '⏳ Saving…' : savedActions ? '✓ Saved!' : '💾 Save Action Items'}
                  </button>
                </div>
              )}
            </div>
          )}
          {activeTab === 'brief' && role === 'mentor' && (
            <div className="brief-panel">
              {briefLoading ? (
                <div className="brief-panel-loading"><div className="mreq-spinner"/><span>Loading brief…</span></div>
              ) : briefData ? (
                <>
                  {briefData.progress_summary && (
                    <div className="brief-panel-section">
                      <div className="brief-panel-label">📈 Progress</div>
                      <div className="brief-panel-text">{briefData.progress_summary}</div>
                    </div>
                  )}
                  {briefData.red_flags?.filter(f=>f).length > 0 && (
                    <div className="brief-panel-section brief-flags">
                      <div className="brief-panel-label" style={{color:'var(--red)'}}>🚩 Red Flags</div>
                      {briefData.red_flags.map((f,i) => <div key={i} className="brief-flag-item">⚠ {f}</div>)}
                    </div>
                  )}
                  <div className="brief-panel-section">
                    <div className="brief-panel-label">📝 Overview</div>
                    <div className="brief-panel-text">{briefData.brief_text}</div>
                  </div>
                  {briefData.focus_areas?.length > 0 && (
                    <div className="brief-panel-section">
                      <div className="brief-panel-label">🎯 Focus Areas</div>
                      <div className="brief-focus-tags">
                        {briefData.focus_areas.map((a,i) => <span key={i} className="brief-focus-tag">{a}</span>)}
                      </div>
                    </div>
                  )}
                  {briefData.key_questions?.length > 0 && (
                    <div className="brief-panel-section">
                      <div className="brief-panel-label">💡 Suggested Questions</div>
                      {briefData.key_questions.map((q,i) => (
                        <div key={i} className="brief-question">
                          <span className="actions-num">{i+1}</span><span>{q}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="actions-empty">
                  <div style={{fontSize:28,marginBottom:12}}>📋</div>
                  <p>No brief available</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      {showExpertModal && createPortal(
        <div onClick={()=>setShowExpertModal(false)} style={{position:'fixed',inset:0,background:'rgba(10,15,40,0.6)',zIndex:999999,display:'flex',alignItems:'center',justifyContent:'center',padding:20}}>
          <div onClick={e=>e.stopPropagation()} style={{background:'#fff',borderRadius:18,width:'100%',maxWidth:680,maxHeight:'85vh',overflow:'hidden',display:'flex',flexDirection:'column',boxShadow:'0 24px 80px rgba(0,0,0,0.25)'}}>
            <div style={{padding:'18px 24px 14px',borderBottom:'1px solid #eee',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <div>
                <div style={{fontSize:16,fontWeight:600,color:'#1a2b3c'}}>🤝 Connect to Expert</div>
                <div style={{fontSize:11,color:'#8a9bb0',marginTop:2}}>AI-matched from live session context + mentee profile</div>
              </div>
              <button onClick={()=>setShowExpertModal(false)} style={{width:30,height:30,borderRadius:8,border:'1px solid #eee',background:'#f8f8f8',cursor:'pointer'}}>✕</button>
            </div>
            <div style={{padding:'12px 20px',borderBottom:'1px solid #f0f0f0',display:'flex',gap:8}}>
              <input
                style={{flex:1,padding:'8px 12px',border:'1px solid #e2e8f0',borderRadius:8,fontSize:13,outline:'none'}}
                placeholder="Refine search e.g. 'export GTM for leather bags to Europe'..."
                value={expertQuery}
                onChange={e=>setExpertQuery(e.target.value)}
                onKeyDown={e=>e.key==='Enter'&&(setExpertMatches([]),findExperts(expertQuery))}
              />
              <button
                onClick={()=>{setExpertMatches([]);findExperts(expertQuery)}}
                style={{padding:'8px 16px',background:'#2563eb',border:'none',borderRadius:8,color:'#fff',fontSize:13,fontWeight:600,cursor:'pointer'}}>
                Search
              </button>
            </div>
            <div style={{overflowY:'auto',padding:20,display:'flex',flexDirection:'column',gap:12}}>
              {loadingExperts
                ? <div style={{display:'flex',alignItems:'center',gap:10,color:'#8a9bb0',padding:'20px 0'}}><div className="mreq-spinner"/> Finding best experts using full session context…</div>
                : expertMatches.length===0
                  ? <div style={{color:'#8a9bb0',textAlign:'center',padding:20}}>No matches found</div>
                  : expertMatches.map((expert,i) => {
                    const COLORS = ['#4f7cff','#f59e0b','#10b981','#8b5cf6','#ef4444','#06b6d4','#f97316','#84cc16','#ec4899','#14b8a6']
                    const expertAvail = expertAvailability.filter(a => a.mentor_email === expert.email && a.slots?.some(s=>!s.booked))
                    const selDate = expertModalDate[expert.id]
                    const selSlot = expertSelectedSlot[expert.id]?.slot
                    const sent = sentExpertRequests[expert.id]
                    return (
                      <div key={expert.id} style={{background:'#fff',border:'1px solid #e8ebff',borderRadius:14,overflow:'hidden',boxShadow:'0 2px 8px rgba(0,0,0,0.04)'}}>
                        {/* Tier bar - click to open detail */}
                        <div onClick={async()=>{ setSelectedExpert(expert); if (!expertScoreCache[expert.email]) { setScoringExpert(expert.email); try {
                    const transcriptContext = (transcriptRef.current||[]).slice(-20).map(l=>l.name+': '+l.text).join('\n')
                    const briefContext = briefData ? [briefData.progress_summary, briefData.focus_areas?.join(', ')].filter(Boolean).join('. ') : ''
                    const fullContext = expertQuery || [menteeProfile?.problem_statement, transcriptContext, briefContext].filter(Boolean).join('\n')
                    const res = await fetch('/api/score-mentor',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mentorEmail:expert.email,product:menteeProfile?.product||topic,problemStatement:fullContext,companyName:menteeProfile?.company_name||menteeName,state:menteeProfile?.state||'',revenueLakhs:menteeProfile?.revenue_lakhs||'',theme:menteeProfile?.theme||''})}); const d=await res.json(); if(d.score) setExpertScoreCache(prev=>({...prev,[expert.email]:d.score})) } catch(e){console.error(e)} finally{setScoringExpert(null)} } }}
                          style={{display:'flex',alignItems:'center',gap:8,padding:'10px 14px',background:expert.tier===1?'rgba(5,150,105,0.08)':'rgba(79,124,255,0.06)',cursor:'pointer'}}>
                          <span style={{fontSize:11,fontWeight:700,color:expert.tier===1?'#065f46':'#1e40af'}}>{expert.tier===1?'🏆 Strong Match':'👍 Good Match'}</span>
                          {expertScoreCache[expert.email] ? <span style={{fontSize:11,fontFamily:'monospace',color:'#64748b'}}>⭐ {(expertScoreCache[expert.email].industry_match_score||0)+(expertScoreCache[expert.email].operator_score||0)+(expertScoreCache[expert.email].expertise_score||0)+(expertScoreCache[expert.email].credentials_score||0)}/10</span> : <span style={{fontSize:10,color:'#94a3b8'}}>#{i+1}</span>}
                          {expert.hands_on && <span style={{fontSize:10,color:expert.hands_on==='Yes'?'#059669':expert.hands_on==='Partial'?'#d97706':'#dc2626'}}>{expert.hands_on==='Yes'?'🟢 Hands-on':expert.hands_on==='Partial'?'🟡 Partial':'🔴 Advisory'}</span>}
                          <span style={{marginLeft:'auto',fontSize:11,color:'#94a3b8',maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{expert.full_name} · {expert.primary_expertise}</span>
                          <span style={{fontSize:12,color:'#94a3b8',flexShrink:0}}>▶</span>
                        </div>
                        {false && (
                          <div style={{padding:14,display:'flex',flexDirection:'column',gap:10,borderTop:'1px solid #f0f4ff'}}>
                            {/* Tags */}
                            <div style={{display:'flex',alignItems:'flex-start',gap:5,flexWrap:'wrap'}}>
                              {expert.primary_industry && <span style={{fontSize:10,fontWeight:600,padding:'3px 9px',borderRadius:99,background:'#edf2f7',color:'#1a3a5c'}}>{expert.primary_industry}</span>}
                              {(() => { const b=(expert.bio||'').toLowerCase(); const mkts=['USA','Europe','UK','Singapore','Middle East','Japan','Global','International'].filter(m=>b.includes(m.toLowerCase())); return mkts.length>0 ? <span style={{fontSize:10,fontWeight:600,padding:'3px 9px',borderRadius:99,background:'#f0faf4',color:'#276749'}}>🌍 {mkts.slice(0,2).join(', ')}</span> : null })()}
                              <span style={{fontSize:10,color:'#4f7cff',background:'rgba(79,124,255,0.1)',padding:'3px 8px',borderRadius:6,fontWeight:700,marginLeft:'auto'}}>#{i+1}</span>
                            </div>
                            {/* Identity */}
                            <div style={{display:'flex',alignItems:'center',gap:10}}>
                              <div style={{width:42,height:42,borderRadius:10,background:COLORS[i%10],display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,fontWeight:700,color:'#fff',flexShrink:0}}>
                                {expert.full_name?.split(' ').map(n=>n[0]).join('').slice(0,2)}
                              </div>
                              <div style={{flex:1}}>
                                <div style={{fontSize:15,fontWeight:600,color:'#1a2b3c'}}>{expert.full_name}</div>
                                <div style={{fontSize:11,color:'#6b7a8a',marginTop:1}}>{expert.primary_expertise}{expert.secondary_expertise?' · '+expert.secondary_expertise:''}</div>
                                {expert.job_title && <div style={{fontSize:11,color:'#94a3b8',marginTop:1}}>{expert.job_title}{expert.current_company?' · '+expert.current_company:''}</div>}
                              </div>
                              {expert.linkedin_url && <a href={expert.linkedin_url} target="_blank" rel="noreferrer" style={{width:28,height:28,borderRadius:6,background:'#0077b5',color:'#fff',fontSize:12,fontWeight:800,display:'flex',alignItems:'center',justifyContent:'center',textDecoration:'none',flexShrink:0}}>in</a>}
                            </div>
                            {/* Tags row */}
                            <div style={{display:'flex',flexWrap:'wrap',gap:5}}>
                              {expert.years_experience && <span style={{fontSize:10,padding:'2px 8px',borderRadius:99,background:'#f1f5f9',color:'#475569'}}>{expert.years_experience}yr exp</span>}
                              {expert.location && <span style={{fontSize:10,padding:'2px 8px',borderRadius:99,background:'#f1f5f9',color:'#475569'}}>📍 {expert.location.split(',')[0]}</span>}
                              {expert.is_founder && <span style={{fontSize:10,padding:'2px 8px',borderRadius:99,background:'#eff6ff',color:'#1d4ed8'}}>Founder</span>}
                              {expert.is_angel_investor && <span style={{fontSize:10,padding:'2px 8px',borderRadius:99,background:'#fdf4ff',color:'#7e22ce'}}>Angel Investor</span>}
                              {expert.is_serial_entrepreneur && <span style={{fontSize:10,padding:'2px 8px',borderRadius:99,background:'#f0fdf4',color:'#15803d'}}>Serial Entrepreneur</span>}
                            </div>
                            {/* Match reason */}
                            <div style={{fontSize:12,color:'#2d3748',lineHeight:1.6,background:'rgba(79,124,255,0.04)',borderRadius:8,padding:'8px 12px',borderLeft:'3px solid #4f7cff'}}>{expert.match_reason}</div>
                            {/* Availability + booking */}
                            {sent ? (
                              <div style={{padding:'10px 14px',background:'#f0faf4',borderRadius:9,color:'#276749',fontSize:13,fontWeight:600,textAlign:'center'}}>✓ Request sent on behalf of {menteeName}</div>
                            ) : expertAvail.length === 0 ? (
                              <div style={{fontSize:12,color:'#aaa',fontStyle:'italic'}}>No availability set</div>
                            ) : (
                              <div style={{display:'flex',flexDirection:'column',gap:8}}>
                                <select value={selDate?.id||expertAvail[0]?.id||''} onChange={e => { const av = expertAvail.find(a=>a.id===e.target.value); setExpertModalDate(prev=>({...prev,[expert.id]:av})); setExpertSelectedSlot(prev=>({...prev,[expert.id]:{}})) }} style={{padding:'8px 12px',borderRadius:8,border:'1px solid #e0e0e0',fontSize:12,background:'#f8f9ff',outline:'none'}}>
                                  {expertAvail.map(av => (
                                    <option key={av.id} value={av.id}>{new Date(av.date+'T00:00:00').toLocaleDateString('en-IN',{weekday:'short',day:'numeric',month:'short'})} · {av.slots.filter(s=>!s.booked).length} slots</option>
                                  ))}
                                </select>
                                <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                                  {(selDate||expertAvail[0])?.slots.filter(s=>!s.booked).map((slot,si) => (
                                    <button key={si} onClick={()=>setExpertSelectedSlot(prev=>({...prev,[expert.id]:{avail:selDate||expertAvail[0],slot}}))} style={{padding:'5px 12px',borderRadius:7,border:`1.5px solid ${selSlot?.start===slot.start?'#4f7cff':'#e0e0e0'}`,background:selSlot?.start===slot.start?'rgba(79,124,255,0.1)':'#fff',color:selSlot?.start===slot.start?'#4f7cff':'#555',fontSize:11,cursor:'pointer',fontWeight:selSlot?.start===slot.start?700:400}}>
                                      {slot.start}–{slot.end}
                                    </button>
                                  ))}
                                </div>
                                {selSlot && (
                                  <button disabled={sendingExpertRequest===expert.id} onClick={async()=>{ setSendingExpertRequest(expert.id); try { const selAv = expertSelectedSlot[expert.id]?.avail || expertAvail[0]; await supabase.from('meeting_requests').insert({ mentee_id: null, mentee_name: menteeName, mentee_email: menteeEmail || '', mentor_id: expert.id, mentor_name: expert.full_name, mentor_email: expert.email, requested_date: selAv.date, requested_slot: selSlot, timezone: selAv.timezone || 'Asia/Kolkata', company_name: topic, meeting_goal: 'Expert connection recommended during mentoring session', status: 'pending' }); const updatedSlots = selAv.slots.map(s => s.start===selSlot.start?{...s,booked:true}:s); await supabase.from('mentor_availability').update({slots:updatedSlots}).eq('mentor_email',expert.email).eq('date',selAv.date); setSentExpertRequests(prev=>({...prev,[expert.id]:true})) } catch(e){console.error(e)} finally{setSendingExpertRequest(null)} }} style={{padding:'10px',borderRadius:9,background:'#4f7cff',border:'none',color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer',width:'100%'}}>
                                    {sendingExpertRequest===expert.id?'⏳ Sending…':'📨 Send Request for '+menteeName+' · '+selSlot.start+'–'+selSlot.end}
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })
              }
            </div>
          </div>
        </div>,
        document.body
      )}

      {selectedExpert && createPortal(
        <div onClick={()=>setSelectedExpert(null)} style={{position:'fixed',inset:0,background:'rgba(10,15,40,0.7)',zIndex:9999999,display:'flex',alignItems:'center',justifyContent:'center',padding:20}}>
          <div onClick={e=>e.stopPropagation()} style={{background:'#fff',borderRadius:18,width:'100%',maxWidth:640,maxHeight:'90vh',overflow:'hidden',display:'flex',flexDirection:'column',boxShadow:'0 24px 80px rgba(0,0,0,0.3)'}}>
            {/* Header */}
            <div style={{padding:'16px 20px',borderBottom:'1px solid #eee',background:'#f8fafc',display:'flex',alignItems:'center',gap:12}}>
              <div style={{flex:1}}>
                <div style={{fontSize:16,fontWeight:700,color:'#1a2b3c'}}>{selectedExpert.full_name}</div>
                <div style={{fontSize:11,color:'#64748b',fontFamily:'monospace'}}>{selectedExpert.job_title} · {selectedExpert.current_company}</div>
              </div>
              {selectedExpert.linkedin_url && <a href={selectedExpert.linkedin_url} target="_blank" rel="noreferrer" style={{width:30,height:30,borderRadius:7,background:'#0077b5',color:'#fff',fontSize:13,fontWeight:800,display:'flex',alignItems:'center',justifyContent:'center',textDecoration:'none'}}>in</a>}
              <button onClick={()=>setSelectedExpert(null)} style={{width:30,height:30,borderRadius:7,border:'1px solid #e2e8f0',background:'#fff',cursor:'pointer',fontSize:13}}>✕</button>
            </div>
            <div style={{overflowY:'auto',padding:18,display:'flex',flexDirection:'column',gap:14}}>
              {/* Match scorecard */}
              {(() => {
                const sc = expertScoreCache[selectedExpert.email]
                const tier = sc?.tier || selectedExpert.tier || 2
                const totalScore = sc ? (sc.industry_match_score||0)+(sc.operator_score||0)+(sc.expertise_score||0)+(sc.credentials_score||0) : selectedExpert.score
                const handsOn = sc?.hands_on || selectedExpert.hands_on
                const matchReason = sc?.match_reason || selectedExpert.match_reason
                return (
                  <div style={{background:'linear-gradient(135deg,rgba(79,124,255,0.06),rgba(79,124,255,0.02))',border:'1px solid rgba(79,124,255,0.2)',borderRadius:12,padding:'12px 16px'}}>
                    <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:12,flexWrap:'wrap'}}>
                      <span style={{fontSize:12,fontWeight:700,padding:'3px 10px',borderRadius:99,background:tier===1?'rgba(5,150,105,0.12)':'rgba(79,124,255,0.1)',color:tier===1?'#065f46':'#1e40af'}}>{tier===1?'🏆 Strong Match':'👍 Good Match'}</span>
                      <span style={{fontSize:13,fontWeight:700,fontFamily:'monospace',marginLeft:'auto'}}>⭐ {totalScore}/10</span>
                      {handsOn && <span style={{fontSize:11,color:handsOn==='Yes'?'#059669':handsOn==='Partial'?'#d97706':'#dc2626',fontWeight:600}}>{handsOn==='Yes'?'🟢 Hands-on Operator':handsOn==='Partial'?'🟡 Partial Experience':'🔴 Advisory Only'}</span>}
                    </div>
                    {scoringExpert===selectedExpert.email && !sc ? (
                      <div style={{display:'flex',alignItems:'center',gap:8,fontSize:12,color:'#94a3b8',padding:'8px 0'}}><div className="mreq-spinner" style={{width:14,height:14}}/>Analyzing match quality…</div>
                    ) : sc ? (
                      <>
                        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8,marginBottom:12}}>
                          {[{val:sc.industry_match_score,max:3,label:'Industry Match',reason:sc.industry_match_reason},{val:sc.operator_score,max:3,label:'Operator Exp',reason:sc.operator_reason},{val:sc.expertise_score,max:2,label:'Expertise',reason:sc.expertise_reason},{val:sc.credentials_score,max:2,label:'Credentials',reason:sc.credentials_reason}].map(item=>(
                            <div key={item.label} style={{textAlign:'center',padding:'8px 6px',background:'#fff',borderRadius:8,border:'1px solid #e2e8f0'}}>
                              <div style={{fontSize:18,fontWeight:700,color:'#2563eb',fontFamily:'monospace'}}>{item.val}/{item.max}</div>
                              <div style={{fontSize:9,color:'#94a3b8',textTransform:'uppercase',letterSpacing:'0.06em',fontWeight:600,marginTop:2}}>{item.label}</div>
                              {item.reason && <div style={{fontSize:10,color:'#475569',marginTop:4,lineHeight:1.4,textAlign:'left'}}>{item.reason}</div>}
                            </div>
                          ))}
                        </div>
                        {matchReason && <div style={{fontSize:12,color:'#1e293b',lineHeight:1.6,padding:'8px 10px',background:'rgba(5,150,105,0.06)',borderRadius:8,borderLeft:'3px solid #059669'}}>✅ {matchReason}</div>}
                      </>
                    ) : (
                      matchReason && <div style={{fontSize:12,color:'#1e293b',lineHeight:1.6,padding:'8px 10px',background:'rgba(5,150,105,0.06)',borderRadius:8,borderLeft:'3px solid #059669'}}>✅ {matchReason}</div>
                    )}
                  </div>
                )
              })()}
              {/* Bio */}
              {selectedExpert.bio && (
                <div>
                  <div style={{fontSize:10,fontWeight:700,color:'#94a3b8',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:6}}>About</div>
                  <div style={{fontSize:13,color:'#374151',lineHeight:1.7}}>{selectedExpert.bio.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim()}</div>
                </div>
              )}
              {/* Expertise */}
              <div>
                <div style={{fontSize:10,fontWeight:700,color:'#94a3b8',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:6}}>Expertise</div>
                <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                  {selectedExpert.primary_expertise && <span style={{fontSize:12,padding:'4px 10px',borderRadius:99,background:'#eff6ff',color:'#1d4ed8'}}>{selectedExpert.primary_expertise}</span>}
                  {selectedExpert.secondary_expertise && <span style={{fontSize:12,padding:'4px 10px',borderRadius:99,background:'#eff6ff',color:'#1d4ed8'}}>{selectedExpert.secondary_expertise}</span>}
                  {selectedExpert.is_founder && <span style={{fontSize:12,padding:'4px 10px',borderRadius:99,background:'#f0fdf4',color:'#15803d',fontWeight:600}}>Founder</span>}
                  {selectedExpert.is_angel_investor && <span style={{fontSize:12,padding:'4px 10px',borderRadius:99,background:'#fdf4ff',color:'#7e22ce',fontWeight:600}}>Angel Investor</span>}
                  {selectedExpert.is_serial_entrepreneur && <span style={{fontSize:12,padding:'4px 10px',borderRadius:99,background:'#fff7ed',color:'#c2410c',fontWeight:600}}>Serial Entrepreneur</span>}
                </div>
              </div>
              {/* Availability + Book */}
              {(() => {
                const expertAvail = expertAvailability.filter(a => a.mentor_email === selectedExpert.email && a.slots?.some(s=>!s.booked))
                const sent = sentExpertRequests[selectedExpert.id]
                const selDate = expertModalDate[selectedExpert.id]
                const selSlot = expertSelectedSlot[selectedExpert.id]?.slot
                return sent ? (
                  <div style={{padding:'12px 16px',background:'#f0faf4',borderRadius:10,color:'#276749',fontSize:14,fontWeight:600,textAlign:'center'}}>✓ Request sent on behalf of {menteeName}</div>
                ) : expertAvail.length === 0 ? (
                  <div style={{fontSize:13,color:'#94a3b8',fontStyle:'italic',textAlign:'center',padding:'12px 0'}}>No availability set yet</div>
                ) : (
                  <div style={{display:'flex',flexDirection:'column',gap:10}}>
                    <div style={{fontSize:10,fontWeight:700,color:'#94a3b8',textTransform:'uppercase',letterSpacing:'0.08em'}}>Book a Meeting</div>
                    <select value={selDate?.id||expertAvail[0]?.id||''} onChange={e=>{const av=expertAvail.find(a=>a.id===e.target.value);setExpertModalDate(prev=>({...prev,[selectedExpert.id]:av}));setExpertSelectedSlot(prev=>({...prev,[selectedExpert.id]:{}}))}} style={{padding:'10px 14px',borderRadius:9,border:'1px solid #e2e8f0',fontSize:13,background:'#f8fafc',outline:'none'}}>
                      {expertAvail.map(av=><option key={av.id} value={av.id}>{new Date(av.date+'T00:00:00').toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'short'})} · {av.slots.filter(s=>!s.booked).length} slots available</option>)}
                    </select>
                    <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
                      {(selDate||expertAvail[0])?.slots.filter(s=>!s.booked).map((slot,si)=>(
                        <button key={si} onClick={()=>setExpertSelectedSlot(prev=>({...prev,[selectedExpert.id]:{avail:selDate||expertAvail[0],slot}}))} style={{padding:'7px 14px',borderRadius:8,border:`1.5px solid ${selSlot?.start===slot.start?'#2563eb':'#e2e8f0'}`,background:selSlot?.start===slot.start?'rgba(37,99,235,0.1)':'#fff',color:selSlot?.start===slot.start?'#2563eb':'#475569',fontSize:12,cursor:'pointer',fontWeight:selSlot?.start===slot.start?700:400}}>
                          {slot.start}–{slot.end}
                        </button>
                      ))}
                    </div>
                    {selSlot && (
                      <button disabled={sendingExpertRequest===selectedExpert.id} onClick={async()=>{setSendingExpertRequest(selectedExpert.id);try{const selAv=expertSelectedSlot[selectedExpert.id]?.avail||expertAvail[0];await supabase.from('meeting_requests').insert({mentee_id:null,mentee_name:menteeName,mentee_email:menteeEmail||'',mentor_id:selectedExpert.id,mentor_name:selectedExpert.full_name,mentor_email:selectedExpert.email,requested_date:selAv.date,requested_slot:selSlot,timezone:selAv.timezone||'Asia/Kolkata',company_name:topic,meeting_goal:'Expert connection recommended during mentoring session',status:'pending'});const updatedSlots=selAv.slots.map(s=>s.start===selSlot.start?{...s,booked:true}:s);await supabase.from('mentor_availability').update({slots:updatedSlots}).eq('mentor_email',selectedExpert.email).eq('date',selAv.date);setSentExpertRequests(prev=>({...prev,[selectedExpert.id]:true}))}catch(e){console.error(e)}finally{setSendingExpertRequest(null)}}} style={{padding:'12px',borderRadius:10,background:'#2563eb',border:'none',color:'#fff',fontSize:14,fontWeight:700,cursor:'pointer',width:'100%'}}>
                        {sendingExpertRequest===selectedExpert.id?'⏳ Sending…':'📨 Book for '+menteeName+' · '+selSlot.start+'–'+selSlot.end}
                      </button>
                    )}
                  </div>
                )
              })()}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}

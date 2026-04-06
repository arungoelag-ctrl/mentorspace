import React, { useState, useEffect, useCallback, useRef } from 'react'
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
  const [transcript, setTranscript] = useState([])
  const [insights, setInsights] = useState([])
  const [postMeetingSummary, setPostMeetingSummary] = useState(null)
  const transcriptEndRef = useRef(null)
  const zoomRef = useRef(null)
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
            success: () => setPhase('live'),
            error: (e) => { setErrMsg('Join failed: ' + (e.reason || JSON.stringify(e))); setPhase('setup') }
          })
        },
        error: (e) => { setErrMsg('Init failed: ' + (e.reason || JSON.stringify(e))); setPhase('setup') }
      })

      setTimeout(() => setPhase(p => p === 'loading' ? 'live' : p), 10000)
    } catch (err) { setErrMsg('Error: ' + err.message); setPhase('setup') }
  }, [meetingNumber, role, userName, userEmail, password, topic, mentorName, menteeName])

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

    await handleEndMeeting()
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
          <button className="btn btn-danger btn-sm" onClick={leave}>{role === "mentor" ? "End Meeting ✕" : "Leave ✕"}</button>
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
                        onClick={() => setSelectedActions(prev =>
                          prev.includes(action) ? prev.filter(a=>a!==action) : [...prev, action]
                        )}>
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
    </div>
  )
}

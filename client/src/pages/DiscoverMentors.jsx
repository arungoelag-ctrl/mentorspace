import React, { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import './DiscoverMentors.css'

const COLORS = ['#6c74f7','#e8b84b','#3dd68c','#c792ea','#f06060','#4fc3f7']
const STAGES = [
  { value: 'Validation', label: 'Validation', sub: 'Pre-revenue, prototype, or MVP stage' },
  { value: 'Traction', label: 'Traction', sub: 'Pilot customers, early revenue, or initial market adoption' },
  { value: 'Scaling', label: 'Scaling', sub: 'Expanding into new markets and/or preparing for funding' },
]

export default function DiscoverMentors({ embedded = false }) {
  const { profile, user } = useAuth()
  const navigate = useNavigate()
  const [mentors, setMentors] = useState([])
  const [availability, setAvailability] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [selectedAvail, setSelectedAvail] = useState(null)
  const [selectedSlot, setSelectedSlot] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [form, setForm] = useState({ companyName: '', companyUrl: '', stage: '', goal: '' })

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    setLoading(true)
    try {
      const { data: mentorData } = await supabase.from('profiles').select('*').in('role', ['mentor', 'venture_partner'])
      setMentors(mentorData || [])
      const today = new Date().toISOString().split('T')[0]
      const { data: availData } = await supabase.from('mentor_availability').select('*')
        .gte('date', today).order('date', { ascending: true })
      setAvailability(availData || [])
    } finally { setLoading(false) }
  }

  function getMentorAvailability(mentorEmail) {
    return availability.filter(a => a.mentor_email === mentorEmail && a.slots.some(s => !s.booked))
  }

  async function submitRequest() {
    if (!form.companyName || !form.stage || !form.goal) return
    setSubmitting(true)
    try {
      const { error } = await supabase.from('meeting_requests').insert({
        mentee_id: user?.id,
        mentee_name: profile?.full_name,
        mentee_email: user?.email,
        mentor_id: selected.id,
        mentor_name: selected.full_name,
        mentor_email: selected.email,
        requested_date: selectedAvail.date,
        requested_slot: selectedSlot,
        timezone: selectedAvail.timezone,
        company_name: form.companyName,
        company_url: form.companyUrl,
        company_stage: form.stage,
        meeting_goal: form.goal,
        status: 'pending'
      })
      if (error) throw error
      setSubmitted(true)
      setShowForm(false)
    } finally { setSubmitting(false) }
  }

  if (submitted) return (
    <div className="discover-wrap">
      <div className="discover-success">
        <div className="discover-success-icon">✓</div>
        <h2>Request Sent!</h2>
        <p>Your meeting request has been sent to <strong>{selected?.full_name}</strong>.</p>
        <p className="discover-success-sub">You'll be notified when they respond. Check your requests dashboard for updates.</p>
        <div style={{display:'flex',gap:12,marginTop:20,justifyContent:'center'}}>
          <button className="discover-btn-primary" onClick={() => navigate('/mentee-requests')}>View My Requests</button>
          <button className="discover-btn-ghost" onClick={() => navigate('/')}>← Dashboard</button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="discover-wrap">
      {!embedded && <div className="discover-header">
        <button className="avail-back" onClick={() => navigate('/')}>← Dashboard</button>
        <div>
          <div className="avail-title">Discover Mentors</div>
          <div className="avail-sub">Browse mentors and book a meeting at a time that works for you</div>
        </div>
      </div>}

      {loading ? <div className="avail-loading">Loading mentors…</div> : (
        <div className="discover-grid">
          {mentors.map((mentor, i) => {
            const mentorAvail = getMentorAvailability(mentor.email)
            return (
              <div key={mentor.id}
                className={`discover-mentor-card ${selected?.id === mentor.id ? 'selected' : ''}`}
                onClick={() => { setSelected(mentor); setSelectedAvail(null); setSelectedSlot(null); setShowForm(false) }}>
                <div className="discover-mentor-top">
                  <div className="discover-mentor-avatar" style={{background: COLORS[i % COLORS.length]}}>
                    {mentor.full_name.split(' ').map(n=>n[0]).join('').slice(0,2)}
                  </div>
                  <div>
                    <div className="discover-mentor-name">{mentor.full_name}</div>
                    <div className="discover-mentor-email">{mentor.email}</div>
                  </div>
                  {mentorAvail.length > 0
                    ? <span className="discover-avail-badge">{mentorAvail.length} date{mentorAvail.length !== 1 ? 's' : ''} available</span>
                    : <span className="discover-no-avail">No availability</span>}
                </div>

                {selected?.id === mentor.id && (
                  <div className="discover-slots-section" onClick={e => e.stopPropagation()}>
                    {mentorAvail.length === 0 ? (
                      <div className="discover-no-slots">This mentor hasn't set availability yet.</div>
                    ) : (
                      <>
                        <div className="discover-slots-label">Select a date and time:</div>
                        {mentorAvail.map(avail => (
                          <div key={avail.id} className="discover-date-row">
                            <div className="discover-date-name">
                              {new Date(avail.date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
                              <span className="discover-tz"> ({avail.timezone})</span>
                            </div>
                            <div className="discover-time-slots">
                              {avail.slots.filter(s => !s.booked).map((slot, si) => (
                                <button key={si}
                                  className={`discover-time-btn ${selectedAvail?.id === avail.id && selectedSlot?.start === slot.start ? 'selected' : ''}`}
                                  onClick={() => { setSelectedAvail(avail); setSelectedSlot(slot) }}>
                                  {slot.start}–{slot.end}
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                        {selectedSlot && (
                          <button className="discover-btn-primary" style={{marginTop:14}}
                            onClick={e => { e.stopPropagation(); setShowForm(true) }}>
                            Continue with {selectedSlot.start}–{selectedSlot.end} →
                          </button>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {showForm && createPortal(
        <div className="dm-overlay" onClick={e => { if (e.target === e.currentTarget) setShowForm(false) }}>
          <div className="dm-modal">
            <div className="dm-header">
              <div>
                <div className="dm-title">Request a Meeting</div>
                <div className="dm-meta">
                  <span className="dm-pill">🎓 {selected?.full_name}</span>
                  <span className="dm-pill">📅 {new Date(selectedAvail?.date + 'T00:00:00').toLocaleDateString('en-IN', {day:'numeric',month:'short',year:'numeric'})}</span>
                  <span className="dm-pill">🕐 {selectedSlot?.start}–{selectedSlot?.end}</span>
                </div>
              </div>
              <button className="dm-close" onClick={() => setShowForm(false)}>✕</button>
            </div>
            <div className="dm-body">
              <div className="dm-field">
                <label className="dm-label">Company Name <span>*</span></label>
                <input className="dm-input" placeholder="Your company name"
                  value={form.companyName}
                  onChange={e => setForm(f => ({...f, companyName: e.target.value}))} />
              </div>
              <div className="dm-field">
                <label className="dm-label">Company URL</label>
                <input className="dm-input" placeholder="https://yourcompany.com"
                  value={form.companyUrl}
                  onChange={e => setForm(f => ({...f, companyUrl: e.target.value}))} />
              </div>
              <div className="dm-field">
                <label className="dm-label">Company Stage <span>*</span></label>
                <div className="dm-stages">
                  {STAGES.map(s => (
                    <button key={s.value}
                      className={`dm-stage-btn ${form.stage === s.value ? 'selected' : ''}`}
                      onClick={() => setForm(f => ({...f, stage: s.value}))}>
                      <div className="dm-stage-label">{s.label}</div>
                      <div className="dm-stage-sub">{s.sub}</div>
                    </button>
                  ))}
                </div>
              </div>
              <div className="dm-field">
                <label className="dm-label">What do you expect to achieve from this meeting? <span>*</span></label>
                <textarea className="dm-input dm-textarea"
                  placeholder="Describe what you'd like to discuss and what outcomes you're hoping for…"
                  rows={4} value={form.goal}
                  onChange={e => setForm(f => ({...f, goal: e.target.value}))} />
              </div>
            </div>
            <div className="dm-footer">
              <button className="dm-cancel" onClick={() => setShowForm(false)}>← Back</button>
              <button className="dm-submit" onClick={submitRequest}
                disabled={submitting || !form.companyName || !form.stage || !form.goal}>
                {submitting ? '⏳ Sending…' : '📨 Send Request'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}

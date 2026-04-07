import React, { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { localDateKey, tomorrowDateKey } from '../lib/dateUtils'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import './DiscoverMentors.css'

const COLORS = ['#6c74f7','#e8b84b','#3dd68c','#c792ea','#f06060','#4fc3f7']
const STAGES = [
  { value: 'Validation', label: 'Validation', sub: 'Pre-revenue, prototype, or MVP stage' },
  { value: 'Traction', label: 'Traction', sub: 'Pilot customers, early revenue, or initial market adoption' },
  { value: 'Scaling', label: 'Scaling', sub: 'Expanding into new markets and/or preparing for funding' },
]

export default function DiscoverMentors({ embedded = false, matchCache = null, onMatchCacheUpdate = null, onRequestSent = null }) {
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
  const [form, setForm] = useState({ companyName: '', companyUrl: '', stage: '', goal: '', companySummary: '' })
  const [loadingSummary, setLoadingSummary] = useState(false)

  useEffect(() => {
    if (profile) {
      setForm(f => ({
        ...f,
        companyName: profile.company_name || '',
        stage: profile.tiering === 'Accelerate' ? 'Growth' : profile.tiering === 'Liftoff' ? 'Traction' : '',
        goal: profile.problem_statement || ''
      }))
      // Auto-generate company summary if we have enough data
      if (profile.company_name && profile.product) {
        setLoadingSummary(true)
        fetch('/api/company-summary', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            companyName: profile.company_name,
            product: profile.product,
            location: profile.location,
            state: profile.state,
            revenueLakhs: profile.revenue_lakhs,
            employeeCount: profile.employee_count,
            tiering: profile.tiering
          })
        }).then(r => r.json())
          .then(d => { if (d.summary) setForm(f => ({...f, companySummary: d.summary})) })
          .catch(() => {})
          .finally(() => setLoadingSummary(false))
      }
    }
  }, [profile])
  const [matching, setMatching] = useState(false)
  const [matchSlots, setMatchSlots] = useState({}) // {mentorId: {avail, slot}}
  const [filterExpertise, setFilterExpertise] = useState([])
  const [filterSector, setFilterSector] = useState([])
  const [filterLocation, setFilterLocation] = useState('')
  const [filterMarket, setFilterMarket] = useState('')
  const [showOtherExpertise, setShowOtherExpertise] = useState(false)
  const [showOtherSector, setShowOtherSector] = useState(false)

  const TOP_EXPERTISE = ['Sales & Business Development','Entrepreneurship Coaching','Marketing & Branding','Business Model Development','Go to Market Strategy','Product Management','Investing','Training & Development','HR Consulting','Supply Chain Management','Business Finance','IT Consulting','Strategic Planning','Software Development','Digital Marketing']
  const OTHER_EXPERTISE = ['Research and Development','Data Analytics','Leadership Coaching','E-commerce Management','Digital Transformation','Intellectual Property Advisory','ESG Strategy','Customer Relationship Management','Product Design','Media & PR','Investment Banking','Venture Funding','Data Science','Cybersecurity','Sustainability','Content Strategy','Market Research']
  const TOP_SECTORS = ['Education & Training','Software & IT Services','Fintech, Banking & Financial Services','Agritech & Food Processing','Healthcare & Pharmaceuticals','Retail & E-Commerce','Automotive & Auto Components','Manufacturing','Media & Entertainment','Consumer Products']
  const OTHER_SECTORS = ['Deeptech','HR Services','Telecommunications','Legal Services','ESG & Sustainability','CleanTech','Technology & Innovation','Transportation & Logistics','Social & Community Services','Real Estate & Construction','Tourism & Hospitality','Spacetech','Textiles & Apparel','Fashion & Beauty','Engineering','Defence & Public Safety','Venture Funding']

  function toggleArr(arr, setArr, val) {
    setArr(prev => prev.includes(val) ? prev.filter(v=>v!==val) : [...prev, val])
  }
  const [modalMentor, setModalMentor] = useState(null)
  const [modalDate, setModalDate] = useState(null)
  const [matches, setMatches] = useState(() => {
    try { const s = sessionStorage.getItem('mentorMatches'); return s ? JSON.parse(s) : matchCache || null } catch(e) { return matchCache || null }
  })
  const [showMatches, setShowMatches] = useState(() => {
    try { return !!sessionStorage.getItem('mentorMatches') || matchCache !== null } catch(e) { return false }
  })

  useEffect(() => {
    fetchData()
    // Auto-load AI matches on mount
    if (profile) findBestMatches()
  }, [])

  useEffect(() => {
    // Also trigger when profile loads
    if (profile && !matches) findBestMatches()
  }, [profile])

  async function fetchData() {
    setLoading(true)
    try {
      const { data: mentorData } = await supabase.from('profiles').select('*').in('role', ['mentor', 'venture_partner'])
      setMentors(mentorData || [])
      const today = localDateKey(new Date())
      const { data: availData } = await supabase.from('mentor_availability').select('*')
        .gte('date', today).order('date', { ascending: true })

      // Fetch this mentee's pending requests to hide already-requested slots
      const { data: pendingReqs } = await supabase.from('meeting_requests')
        .select('mentor_email, requested_date, requested_slot')
        .eq('mentee_email', user?.email)
        .in('status', ['pending', 'accepted'])

      // Mark slots as booked if mentee already has a request for that slot
      const markedAvail = (availData || []).map(a => ({
        ...a,
        slots: a.slots.map(s => {
          const alreadyRequested = (pendingReqs || []).some(r =>
            r.mentor_email === a.mentor_email &&
            r.requested_date === a.date &&
            r.requested_slot?.start === s.start
          )
          return (s.booked || alreadyRequested) ? { ...s, booked: true } : s
        })
      }))

      setAvailability(markedAvail)
    } finally { setLoading(false) }
  }

  async function findBestMatches() {
    if (!profile) return
    // Use cached result if available
    try {
      const cached = sessionStorage.getItem('mentorMatches')
      if (cached) { setMatches(JSON.parse(cached)); setShowMatches(true); return }
    } catch(e) {}
    if (matchCache) { setMatches(matchCache); setShowMatches(true); return }
    setMatching(true)
    setShowMatches(false)
    try {
      const res = await fetch('/api/match-mentors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tiering: profile.tiering,
          product: profile.product,
          theme: profile.theme,
          problemStatement: profile.problem_statement,
          companyName: profile.company_name,
          state: profile.state,
          revenueLakhs: profile.revenue_lakhs
        })
      })
      const data = await res.json()
      const m = data.matches || []
      setMatches(m)
      setShowMatches(true)
      if (onMatchCacheUpdate) onMatchCacheUpdate(m)
      try { sessionStorage.setItem('mentorMatches', JSON.stringify(m)) } catch(e) {}
    } catch(e) {
      console.error('Match error:', e)
    } finally { setMatching(false) }
  }

  function getMentorAvailability(mentorEmail) {
    return availability.filter(a => a.mentor_email === mentorEmail && a.slots.some(s => !s.booked))
  }

  async function submitRequest() {
    if (!form.goal) return
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
        company_name: profile?.company_name || form.companyName,
        company_info: form.companySummary,
        company_url: form.companyUrl,
        company_stage: profile?.tiering || form.stage,
        meeting_goal: form.goal,
        status: 'pending'
      })
      if (error) throw error
      // Mark slot as booked in availability
      const updatedSlots = selectedAvail.slots.map(s =>
        s.start === selectedSlot.start ? { ...s, booked: true } : s
      )
      await supabase.from('mentor_availability')
        .update({ slots: updatedSlots })
        .eq('mentor_email', selected.email)
        .eq('date', selectedAvail.date)
      // Update local availability state so UI reflects immediately
      setAvailability(prev => prev.map(a =>
        a.mentor_email === selected.email && a.date === selectedAvail.date
          ? { ...a, slots: updatedSlots }
          : a
      ))
      setShowForm(false)
      setModalMentor(null)
      setSubmitted(true)
    } finally { setSubmitting(false) }
  }

  // Auto-redirect after submission
  useEffect(() => {
    if (submitted) {
      const t = setTimeout(() => {
        setSubmitted(false)
        if (onRequestSent) onRequestSent()
        else navigate('/', { state: { tab: 'requests', filter: 'pending' } })
      }, 2000)
      return () => clearTimeout(t)
    }
  }, [submitted])

  return (
    <div className="discover-wrap">
      {!embedded && <div className="discover-header">
        <button className="avail-back" onClick={() => navigate('/')}>← Dashboard</button>
        <div>
          <div className="avail-title">Discover Mentors</div>
          <div className="avail-sub">Browse mentors and book a meeting at a time that works for you</div>
        </div>

      </div>}


      {showMatches && matches && (
        <div className="discover-matches-panel">
          <div className="discover-matches-header">
            <div>
              <div className="discover-matches-title">AI Recommended Mentors</div>
              <div className="discover-matches-sub">{matches.length} best matches · based on your product, industry and goals</div>
            </div>
            <button className="discover-matches-close" onClick={() => setShowMatches(false)}>✕</button>
          </div>
          <div className="discover-matches-grid">
            {matches.map((mentor, i) => {
              const mentorAvail = getMentorAvailability(mentor.email)
              return (
                <div key={mentor.id} className="discover-match-card-v2" style={{cursor:"pointer"}} onClick={() => { const avail = getMentorAvailability(mentor.email); const first = avail[0]||null; setModalMentor(mentor); setModalDate(first); setSelectedAvail(first); setSelectedSlot(null); setSelected(mentor) }}>
                  <div className="dmv2-top">
                    <div className="dmv2-rank">#{mentor.rank}</div>
                    <div className="dmv2-avatar" style={{background: COLORS[i % COLORS.length]}}>
                      {mentor.full_name?.split(' ').map(n=>n[0]).join('').slice(0,2)}
                    </div>
                    <div className="dmv2-info">
                      <div className="dmv2-name">{mentor.full_name}</div>
                      <div className="dmv2-meta">{mentor.primary_expertise}{mentor.primary_industry ? ' · ' + mentor.primary_industry : ''}</div>
                    {(() => { const b=(mentor.bio||'').toLowerCase(); const mkts=['USA','Europe','UK','Singapore','Middle East','Japan','Africa','Australia','China','Global','International'].filter(m=>b.includes(m.toLowerCase())); return mkts.length>0 ? <div className="dmv2-location">🌍 {mkts.slice(0,2).join(', ')}</div> : null })()}
                    </div>
                    {mentor.linkedin_url && (
                      <a href={mentor.linkedin_url} target="_blank" rel="noreferrer" className="dmv2-linkedin"
                        onClick={e => e.stopPropagation()}>in</a>
                    )}
                  </div>
                  <div className="dmv2-reason">{mentor.match_reason}</div>
                  <div className="dmv2-tags">
                    {mentor.years_experience && <span className="dmv2-tag">{mentor.years_experience}yr exp</span>}
                    {mentor.is_founder && <span className="dmv2-tag">Founder</span>}
                    {mentor.is_serial_entrepreneur && <span className="dmv2-tag">Serial Entrepreneur</span>}
                    {mentor.is_angel_investor && <span className="dmv2-tag">Angel Investor</span>}
                  </div>
                  <div className="dmv2-footer">
                    {mentorAvail.length > 0
                      ? <span className="dm-avail-yes">📅 {mentorAvail.length} date{mentorAvail.length!==1?'s':''} available — click to book</span>
                      : <span className="dmv2-no-avail">No availability yet</span>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="dm-intel-filters">

        <div className="dm-filter-row">
          <span className="dm-filter-label">EXPERTISE:</span>
          <div className="dm-filter-pills">
            {filterExpertise.length > 0 && <button className="dm-filter-pill dm-filter-clear" onClick={() => setFilterExpertise([])}>✕ Clear</button>}
            {TOP_EXPERTISE.map(exp => (
              <button key={exp} className={'dm-filter-pill' + (filterExpertise.includes(exp)?' active':'')}
                onClick={() => toggleArr(filterExpertise, setFilterExpertise, exp)}>{exp}</button>
            ))}
            <div className="dm-filter-other-wrap">
              <button className="dm-filter-pill dm-filter-other-btn" onClick={() => setShowOtherExpertise(v=>!v)}>
                Other {showOtherExpertise ? '▲' : '▼'}
              </button>
              {showOtherExpertise && (
                <div className="dm-filter-other-dropdown">
                  {OTHER_EXPERTISE.map(exp => (
                    <button key={exp} className={'dm-filter-other-item' + (filterExpertise.includes(exp)?' active':'')}
                      onClick={() => toggleArr(filterExpertise, setFilterExpertise, exp)}>{exp}</button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="dm-filter-row">
          <span className="dm-filter-label">SECTOR:</span>
          <div className="dm-filter-pills">
            {filterSector.length > 0 && <button className="dm-filter-pill dm-filter-clear" onClick={() => setFilterSector([])}>✕ Clear</button>}
            {TOP_SECTORS.map(sec => (
              <button key={sec} className={'dm-filter-pill' + (filterSector.includes(sec)?' active':'')}
                onClick={() => toggleArr(filterSector, setFilterSector, sec)}>{sec}</button>
            ))}
            <div className="dm-filter-other-wrap">
              <button className="dm-filter-pill dm-filter-other-btn" onClick={() => setShowOtherSector(v=>!v)}>
                Other {showOtherSector ? '▲' : '▼'}
              </button>
              {showOtherSector && (
                <div className="dm-filter-other-dropdown">
                  {OTHER_SECTORS.map(sec => (
                    <button key={sec} className={'dm-filter-other-item' + (filterSector.includes(sec)?' active':'')}
                      onClick={() => toggleArr(filterSector, setFilterSector, sec)}>{sec}</button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="dm-filter-row">
          <span className="dm-filter-label">LOCATION:</span>
          <div className="dm-filter-pills">
            {['All','Delhi','Mumbai','Bangalore','Chennai','Hyderabad','Pune','Kolkata','Ahmedabad','Noida','Gurgaon'].map(loc => (
              <button key={loc} className={'dm-filter-pill' + (filterLocation===(loc==='All'?'':loc)?' active':'')}
                onClick={() => setFilterLocation(loc==='All'?'':loc)}>{loc}</button>
            ))}
          </div>
        </div>
        <div className="dm-filter-row">
          <span className="dm-filter-label">MARKET:</span>
          <div className="dm-filter-pills">
            {['All','Global','USA','Europe','UK','Singapore','Middle East','Africa','Australia','China','Japan','Export'].map(mkt => (
              <button key={mkt} className={'dm-filter-pill' + (filterMarket===(mkt==='All'?'':mkt.toLowerCase())?' active':'')}
                onClick={() => setFilterMarket(mkt==='All'?'':mkt.toLowerCase())}>{mkt}</button>
            ))}
          </div>
        </div>
      </div>

      {matching && !matches && (
        <div className="dm-matching-loader"><div className="mreq-spinner"/> Finding your best matches…</div>
      )}

      {loading ? <div className="avail-loading">Loading mentors…</div> : (
        <>
        <div className="dm-section-heading">
          <div className="dm-section-title">All Mentors</div>
          <div className="dm-section-sub">{mentors.filter(m => {
            const exp = ((m.primary_expertise||'') + ' ' + (m.secondary_expertise||'')).toLowerCase()
            const ind = ((m.primary_industry||'') + ' ' + (m.secondary_industry||'')).toLowerCase()
            const loc = (m.location||'').toLowerCase()
            return (filterExpertise.length===0 || filterExpertise.every(f => exp.includes(f.toLowerCase())))
              && (filterSector.length===0 || filterSector.some(f => ind.includes(f.toLowerCase())))
              && (!filterLocation || loc.includes(filterLocation.toLowerCase()))
          }).length} mentors</div>
        </div>
        <div className="dm-mentor-grid">
          {/* Sort: mentors with full data first, test accounts last */}
          {/* This is handled by sorting the filtered array below */}
          {mentors.filter(mentor => {
              const exp = (mentor.primary_expertise + ' ' + (mentor.secondary_expertise||'')).toLowerCase()
              const ind = (mentor.primary_industry + ' ' + (mentor.secondary_industry||'')).toLowerCase()
              const loc = (mentor.location || '').toLowerCase()
              return (filterExpertise.length===0 || filterExpertise.every(f => exp.includes(f.toLowerCase())))
                && (filterSector.length===0 || filterSector.some(f => ind.includes(f.toLowerCase())))
                && (!filterLocation || loc.includes(filterLocation.toLowerCase()))
            }).sort((a, b) => {
              const aHasData = a.primary_industry && a.primary_expertise ? 1 : 0
              const bHasData = b.primary_industry && b.primary_expertise ? 1 : 0
              return bHasData - aHasData
            }).map((mentor, i) => {
            const mentorAvail = getMentorAvailability(mentor.email)
            return (
              <div key={mentor.id} id={'mentor-' + mentor.id}
                className="dm-mentor-card"
                onClick={() => { const avail = getMentorAvailability(mentor.email); const first = avail[0]||null; setModalMentor(mentor); setModalDate(first); setSelectedAvail(first); setSelectedSlot(null); setSelected(mentor) }}>
                <div className="dm-mentor-card-top">
                  <div className="dm-mentor-tags">
                    {mentor.primary_industry && mentor.primary_industry !== '-' && <span className="dm-tag sector">{mentor.primary_industry}</span>}
                    {(() => { const b=(mentor.bio||'').toLowerCase(); const mkts=['USA','Europe','UK','Singapore','Middle East','Japan','Africa','Australia','China','Global','International'].filter(m=>b.includes(m.toLowerCase())); return mkts.length>0 ? <span className="dm-tag geo">🌍 {mkts.slice(0,2).join(', ')}</span> : null })()}
                  </div>
                  <div className="dm-mentor-avail-badge">
                    {mentorAvail.length > 0
                      ? <span className="dm-avail-yes">📅 {mentorAvail.length} date{mentorAvail.length!==1?'s':''}</span>
                      : <span className="dm-avail-no">No availability</span>}
                  </div>
                </div>
                <div className="dm-mentor-identity">
                  <div className="dm-mentor-avatar" style={{background: COLORS[i % COLORS.length]}}>
                    {mentor.full_name.split(' ').map(n=>n[0]).join('').slice(0,2)}
                  </div>
                  <div style={{flex:1}}>
                    <div className="dm-mentor-name">{mentor.full_name}</div>
                    <div className="dm-mentor-exp">{mentor.primary_expertise}{mentor.secondary_expertise ? ' · ' + mentor.secondary_expertise : ''}</div>
                    {mentor.years_experience && <div className="dm-mentor-yrs">{mentor.years_experience}yr exp</div>}
                  </div>
                  {mentor.linkedin_url && <a href={mentor.linkedin_url} target="_blank" rel="noreferrer" className="dmv2-linkedin" onClick={e=>e.stopPropagation()}>in</a>}
                </div>
                {mentor.bio && <div className="dm-mentor-bio">{mentor.bio.replace(/<[^>]+>/g,'').slice(0,110)}…</div>}

              </div>
            )
          })}
        </div>
        </>
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
                <label className="dm-label">
                  Company Information
                  {loadingSummary && <span className="dm-summary-loading"> · Generating…</span>}
                </label>
                <div className="dm-company-summary-readonly">{loadingSummary ? <span style={{color:"var(--muted)",fontStyle:"italic"}}>Generating company summary…</span> : form.companySummary || "Company information will appear here."}</div>
                {profile?.company_name && (
                  <div className="dm-company-chips">
                    {profile.company_name && <span className="dm-chip">🏭 {profile.company_name}</span>}
                    {profile.product && <span className="dm-chip">📦 {profile.product}</span>}
                    {profile.location && <span className="dm-chip">📍 {profile.location}{profile.state ? ', '+profile.state : ''}</span>}
                    {profile.revenue_lakhs && <span className="dm-chip">💰 ₹{profile.revenue_lakhs}L</span>}
                    {profile.employee_count && <span className="dm-chip">👥 {profile.employee_count} employees</span>}
                  </div>
                )}
              </div>
              <div className="dm-field">
                <label className="dm-label">What do you want to achieve from this meeting? <span>*</span> <span style={{fontWeight:400,color:"var(--muted)"}}>— pre-filled from your profile</span></label>
                <textarea className="dm-input dm-textarea"
                  placeholder="Describe what you'd like to discuss and what outcomes you're hoping for…"
                  rows={3} value={form.goal}
                  onChange={e => setForm(f => ({...f, goal: e.target.value}))} />
              </div>
            </div>
            <div className="dm-footer">
              <button className="dm-cancel" onClick={() => setShowForm(false)}>← Back</button>
              <button className="dm-submit" onClick={submitRequest}
                disabled={submitting || !form.goal}>
                {submitting ? '⏳ Sending…' : '📨 Send Request'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Mentor Detail Modal */}
      {modalMentor && createPortal(
        <div className="dm-modal-overlay" onClick={() => setModalMentor(null)}>
          <div className="dm-modal-box" onClick={e => e.stopPropagation()}>
            <button className="dm-modal-close" onClick={() => setModalMentor(null)}>✕</button>

            {/* Header */}
            <div className="dm-modal-header">
              <div className="dm-modal-tags">
                {modalMentor.primary_industry && modalMentor.primary_industry !== '-' && <span className="dm-tag sector">{modalMentor.primary_industry}</span>}
                {modalMentor.secondary_industry && modalMentor.secondary_industry !== '-' && <span className="dm-tag sector">{modalMentor.secondary_industry}</span>}
                {(() => { const b=(modalMentor.bio||'').toLowerCase(); const mkts=['USA','Europe','UK','Singapore','Middle East','Japan','Africa','Australia','China','Global','International'].filter(m=>b.includes(m.toLowerCase())); return mkts.length>0 ? <span className="dm-tag geo">🌍 {mkts.slice(0,2).join(', ')}</span> : null })()}
                {modalMentor.location && <span className="dm-tag" style={{background:'var(--surface)',color:'var(--muted)'}}>📍 {modalMentor.location}</span>}
              </div>
              <div className="dm-modal-identity">
                <div className="dm-modal-avatar" style={{background: COLORS[mentors.indexOf(modalMentor) % COLORS.length]}}>
                  {modalMentor.full_name?.split(' ').map(n=>n[0]).join('').slice(0,2)}
                </div>
                <div>
                  <div className="dm-modal-name">{modalMentor.full_name}</div>
                  <div className="dm-modal-exp">{modalMentor.primary_expertise}{modalMentor.secondary_expertise ? ' · ' + modalMentor.secondary_expertise : ''}</div>
                  {modalMentor.years_experience && <div className="dm-modal-yrs">{modalMentor.years_experience} years experience</div>}
                </div>
                {modalMentor.linkedin_url && (
                  <a href={modalMentor.linkedin_url} target="_blank" rel="noreferrer" className="dmv2-linkedin">in</a>
                )}
              </div>
            </div>

            {/* Bio */}
            {modalMentor.bio && (
              <div className="dm-modal-section">
                <div className="dm-modal-section-label">About</div>
                <div className="dm-modal-bio">{modalMentor.bio.replace(/<[^>]+>/g, ' ').replace(/\s+/g,' ').trim()}</div>
              </div>
            )}

            {/* Expertise tags */}
            <div className="dm-modal-section">
              <div className="dm-modal-section-label">Expertise</div>
              <div className="dm-modal-tags-row">
                {modalMentor.primary_expertise && <span className="dm-modal-tag">{modalMentor.primary_expertise}</span>}
                {modalMentor.secondary_expertise && <span className="dm-modal-tag">{modalMentor.secondary_expertise}</span>}
                {modalMentor.tertiary_expertise && <span className="dm-modal-tag">{modalMentor.tertiary_expertise}</span>}
                {modalMentor.is_founder && <span className="dm-modal-tag highlight">Founder</span>}
                {modalMentor.is_serial_entrepreneur && <span className="dm-modal-tag highlight">Serial Entrepreneur</span>}
                {modalMentor.is_angel_investor && <span className="dm-modal-tag highlight">Angel Investor</span>}
              </div>
            </div>
            {/* Sector */}
            {(modalMentor.primary_industry || modalMentor.secondary_industry) && (
              <div className="dm-modal-section">
                <div className="dm-modal-section-label">Sector</div>
                <div className="dm-modal-tags-row">
                  {modalMentor.primary_industry && modalMentor.primary_industry !== '-' && <span className="dm-modal-tag">{modalMentor.primary_industry}</span>}
                  {modalMentor.secondary_industry && modalMentor.secondary_industry !== '-' && <span className="dm-modal-tag">{modalMentor.secondary_industry}</span>}
                </div>
              </div>
            )}
            {/* Market */}
            {(() => {
              const b=(modalMentor.bio||'').toLowerCase()
              const mkts=['USA','Europe','UK','Singapore','Middle East','Japan','Africa','Australia','China','Global','International','Latin America','Southeast Asia'].filter(m=>b.includes(m.toLowerCase()))
              return mkts.length>0 ? (
                <div className="dm-modal-section">
                  <div className="dm-modal-section-label">Market Experience</div>
                  <div className="dm-modal-tags-row">
                    {mkts.map(m => <span key={m} className="dm-modal-tag highlight">{m}</span>)}
                  </div>
                </div>
              ) : null
            })()}

            {/* Availability + Booking */}
            <div className="dm-modal-section">
              <div className="dm-modal-section-label">Book a Meeting</div>
              {getMentorAvailability(modalMentor.email).length === 0 ? (
                <div className="dm-modal-no-avail">No availability set yet</div>
              ) : (
                <>
                  <select className="dm-modal-date-select"
                    value={modalDate?.id || getMentorAvailability(modalMentor.email)[0]?.id || ''}
                    onChange={e => {
                      const avail = getMentorAvailability(modalMentor.email).find(a => a.id === e.target.value)
                      setModalDate(avail||null); setSelectedAvail(avail||null); setSelectedSlot(null); setSelected(modalMentor)
                    }}>
                    {getMentorAvailability(modalMentor.email).map(avail => (
                      <option key={avail.id} value={avail.id}>
                        {new Date(avail.date+'T00:00:00').toLocaleDateString('en-IN',{weekday:'short',day:'numeric',month:'short'})} · {avail.slots.filter(s=>!s.booked).length} slots available
                      </option>
                    ))}
                  </select>
                  {(() => { const activeDate = modalDate || getMentorAvailability(modalMentor.email)[0]; return activeDate ? (
                    <div className="dm-modal-time-slots" style={{marginTop:10,display:'flex',flexWrap:'wrap',gap:6}}>
                      {activeDate.slots.filter(s=>!s.booked).map((slot,si) => (
                        <button key={si}
                          className={'dm-modal-time-btn'+(selectedSlot?.start===slot.start?' selected':'')}
                          onClick={() => setSelectedSlot(slot)}>
                          {slot.start}–{slot.end}
                        </button>
                      ))}
                    </div>
                  ) : null })()}
                  {selectedSlot && selected?.id === modalMentor.id && (
                    <button className="dm-modal-book-btn"
                      onClick={() => { setShowForm(true); setModalMentor(null) }}>
                      📨 Request Meeting · {selectedSlot.start}–{selectedSlot.end} →
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}

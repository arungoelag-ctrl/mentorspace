import React, { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { localDateKey, tomorrowDateKey } from '../lib/dateUtils'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import './DiscoverMentors.css'
import './MenteeDashboard.css'

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
  const [mainTab, setMainTab] = useState('ai')

  useEffect(() => {
    if (profile) {
      setForm(f => ({
        ...f,
        companyName: profile.company_name || '',
        stage: profile.tiering === 'Accelerate' ? 'Growth' : profile.tiering === 'Liftoff' ? 'Traction' : '',
        goal: profile.problem_statement || ''
      }))
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
  const [filterExpertise, setFilterExpertise] = useState([])
  const [aiQuery, setAiQuery] = useState('')
  const [aiSearching, setAiSearching] = useState(false)
  const [aiResults, setAiResults] = useState(null)
  const [aiTab, setAiTab] = useState('tier1')
  const [scoreCache, setScoreCache] = useState({})
  const [scoringMentor, setScoringMentor] = useState(null)
  const [matchTab, setMatchTab] = useState('tier1')
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

  useEffect(() => {
    fetchData()
    if (profile) findBestMatches()
  }, [])

  useEffect(() => {
    if (profile && !matches) findBestMatches()
  }, [profile])

  async function fetchData() {
    try {
      const { data: mentorData } = await supabase.from('profiles').select('*').in('role', ['mentor', 'venture_partner'])
      setMentors(mentorData || [])
      const today = localDateKey(new Date())
      const { data: availData } = await supabase.from('mentor_availability').select('*')
        .gte('date', today).order('date', { ascending: true })
      const { data: pendingReqs } = await supabase.from('meeting_requests')
        .select('mentor_email, requested_date, requested_slot')
        .eq('mentee_email', user?.email)
        .in('status', ['pending', 'accepted'])
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
    try {
      const cached = sessionStorage.getItem('mentorMatches')
      if (cached) { setMatches(JSON.parse(cached)); return }
    } catch(e) {}
    if (matchCache) { setMatches(matchCache); return }
    setMatching(true)
    try {
      const res = await fetch('/api/match-mentors-fast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tiering: profile.tiering,
          product: profile.product,
          theme: profile.theme,
          problemStatement: profile.problem_statement,
          companyName: profile.company_name,
          state: profile.state,
          revenueLakhs: profile.revenue_lakhs,
          matchCount: 6
        })
      })
      const data = await res.json()
      const m = data.matches || []
      setMatches(m)
      setMatchTab('tier1')
      if (onMatchCacheUpdate) onMatchCacheUpdate(m)
      try { sessionStorage.setItem('mentorMatches', JSON.stringify(m)) } catch(e) {}
    } catch(e) { console.error('Match error:', e) }
    finally { setMatching(false) }
  }

  async function loadMentorScore(mentor) {
    if (scoreCache[mentor.email]) return
    try {
      const s = JSON.parse(sessionStorage.getItem('mentorScores') || '{}')
      if (s[mentor.email]) { setScoreCache(prev => ({...prev, [mentor.email]: s[mentor.email]})); return }
    } catch(e) {}
    setScoringMentor(mentor.email)
    try {
      const { data: mp } = await supabase.from('profiles').select('product,theme,problem_statement,state,revenue_lakhs').eq('email', user?.email).single()
      const res = await fetch('/api/score-mentor', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({
          mentorEmail: mentor.email,
          product: mp?.product || aiQuery || '',
          problemStatement: aiQuery || mp?.problem_statement || mp?.product || '',
          companyName: profile?.company_name || '',
          state: mp?.state || mp?.location || '',
          revenueLakhs: mp?.revenue_lakhs || '',
          theme: mp?.theme || '',
          context: aiQuery || mp?.problem_statement || ''
        })
      })
      const data = await res.json()
      if (data.score) {
        const score = data.score
        setScoreCache(prev => ({...prev, [mentor.email]: score}))
        try { const s = JSON.parse(sessionStorage.getItem('mentorScores')||'{}'); s[mentor.email]=score; sessionStorage.setItem('mentorScores',JSON.stringify(s)) } catch(e) {}
        setMatches(prev => {
          if (!prev) return prev
          const updated = prev.map(m => m.email === mentor.email
            ? {...m, score: score.score, hands_on: score.hands_on, match_reason: score.match_reason}
            : m).sort((a,b) => (a.tier||2)-(b.tier||2) || (b.score||0)-(a.score||0))
          try { sessionStorage.setItem('mentorMatches', JSON.stringify(updated)) } catch(e) {}
          return updated
        })
      }
    } catch(e) { console.error(e) }
    finally { setScoringMentor(null) }
  }

  async function searchByQuery() {
    if (!aiQuery.trim()) { setAiResults(null); return }
    setAiSearching(true)
    try {
      const { data: mp } = await supabase.from('profiles').select('product,theme,problem_statement,state,location,revenue_lakhs').eq('email', user?.email).single()
      const res = await fetch('/api/match-mentors-fast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tiering: profile?.tiering || 'Liftoff',
          product: mp?.product || aiQuery,
          theme: mp?.theme || '',
          problemStatement: aiQuery,
          companyName: profile?.company_name || '',
          state: mp?.state || '',
          revenueLakhs: mp?.revenue_lakhs || '',
          matchCount: 10
        })
      })
      const data = await res.json()
      setAiResults(data.matches || [])
      setAiTab('tier1')
    } catch(e) { console.error(e) }
    finally { setAiSearching(false) }
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
      const updatedSlots = selectedAvail.slots.map(s =>
        s.start === selectedSlot.start ? { ...s, booked: true } : s
      )
      await supabase.from('mentor_availability')
        .update({ slots: updatedSlots })
        .eq('mentor_email', selected.email)
        .eq('date', selectedAvail.date)
      setAvailability(prev => prev.map(a =>
        a.mentor_email === selected.email && a.date === selectedAvail.date
          ? { ...a, slots: updatedSlots } : a
      ))
      setShowForm(false)
      setModalMentor(null)
      setSubmitted(true)
    } finally { setSubmitting(false) }
  }

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

  const filteredMentors = mentors.filter(mentor => {
    const exp = ((mentor.primary_expertise||'') + ' ' + (mentor.secondary_expertise||'')).toLowerCase()
    const ind = ((mentor.primary_industry||'') + ' ' + (mentor.secondary_industry||'')).toLowerCase()
    const loc = (mentor.location || '').toLowerCase()
    const bio = (mentor.bio || '').toLowerCase()
    return (filterExpertise.length===0 || filterExpertise.every(f => exp.includes(f.toLowerCase())))
      && (filterSector.length===0 || filterSector.some(f => ind.includes(f.toLowerCase())))
      && (!filterLocation || loc.includes(filterLocation.toLowerCase()))
      && (!filterMarket || bio.includes(filterMarket.toLowerCase()))
  }).sort((a,b) => {
    const aHasData = a.primary_industry && a.primary_expertise ? 1 : 0
    const bHasData = b.primary_industry && b.primary_expertise ? 1 : 0
    return bHasData - aHasData
  })

  function openMentor(mentor) {
    const avail = getMentorAvailability(mentor.email)
    const first = avail[0] || null
    setModalMentor(mentor)
    setModalDate(first)
    setSelectedAvail(first)
    setSelectedSlot(null)
    setSelected(mentor)
    loadMentorScore(mentor)
  }

  return (
    <div className="discover-wrap">
      {!embedded && (
        <div className="mobile-bottom-nav">
          <div className="mobile-nav-item" onClick={()=>navigate('/')}>
            <span>📬</span><span>Meetings</span>
          </div>
          <div className="mobile-nav-item active">
            <span>🔍</span><span>Find Mentor</span>
          </div>
          <div className="mobile-nav-item" onClick={()=>navigate('/')}>
            <span>👤</span><span>Profile</span>
          </div>
        </div>
      )}

      <div className="discover-scroll-body">

        <div className="dm-main-tabs">
          <button className={'dm-main-tab' + (mainTab==='ai' ? ' active' : '')} onClick={()=>setMainTab('ai')}>
            🤖 AI Picks
          </button>
          <button className={'dm-main-tab' + (mainTab==='search' ? ' active' : '')} onClick={()=>setMainTab('search')}>
            ✨ Search
          </button>
          <button className={'dm-main-tab' + (mainTab==='browse' ? ' active' : '')} onClick={()=>setMainTab('browse')}>
            🏷️ Browse
          </button>
        </div>

        {mainTab === 'ai' && (
          <div className="dm-tab-content">
            {matching && (
              <div className="dm-matching-loader"><div className="mreq-spinner"/> Finding your best matches…</div>
            )}
            {!matching && matches && (
              <>
                <div className="dm-tab-header">
                  <div className="dm-tab-title">Recommended for you</div>
                  <div className="dm-tab-sub">Based on your product, industry and goals</div>
                  <div className="dm-ai-tabs" style={{marginTop:10}}>
                    <button className={'dm-ai-tab' + (matchTab==='tier1' ? ' active' : '')} onClick={()=>setMatchTab('tier1')}>
                      🏆 Strong <span className="dm-ai-tab-count">{matches.filter(m=>m.tier===1).length}</span>
                    </button>
                    <button className={'dm-ai-tab' + (matchTab==='tier2' ? ' active' : '')} onClick={()=>setMatchTab('tier2')}>
                      🔍 Partial <span className="dm-ai-tab-count">{matches.filter(m=>m.tier===2).length}</span>
                    </button>
                  </div>
                </div>
                <div className="dm-mentor-grid">
                  {matches.filter(m => (matchTab==='tier1'&&m.tier===1)||(matchTab==='tier2'&&m.tier===2))
                    .sort((a,b) => (b.score||0)-(a.score||0))
                    .map((mentor, i) => {
                      const mentorAvail = getMentorAvailability(mentor.email)
                      return (
                        <div key={mentor.id} className="discover-match-card-v2" style={{cursor:'pointer'}} onClick={() => openMentor(mentor)}>
                          <div className={'dmv2-tier-bar dm-ai-tier-'+mentor.tier}>
                            <span>{mentor.tier===1?'🏆 Strong Match':'🔍 Partial Match'}</span>
                            {mentor.score && <span className="dm-ai-score">⭐ {mentor.score}/10</span>}
                            {mentor.hands_on && <span style={{fontSize:10,color:mentor.hands_on==='Yes'?'#059669':mentor.hands_on==='Partial'?'#d97706':'#dc2626'}}>{mentor.hands_on==='Yes'?'🟢 Hands-on':mentor.hands_on==='Partial'?'🟡 Partial':'🔴 Advisory'}</span>}
                          </div>
                          <div className="dmv2-top">
                            <div className="dmv2-rank">#{mentor.rank}</div>
                            <div className="dmv2-avatar" style={{background: COLORS[i % COLORS.length]}}>
                              {mentor.full_name?.split(' ').map(n=>n[0]).join('').slice(0,2)}
                            </div>
                            <div className="dmv2-info">
                              <div className="dmv2-name">{mentor.full_name}</div>
                              <div className="dmv2-meta">{mentor.primary_expertise}{mentor.primary_industry ? ' · ' + mentor.primary_industry : ''}</div>
                            </div>
                            {mentor.linkedin_url && (
                              <a href={mentor.linkedin_url} target="_blank" rel="noreferrer" className="dmv2-linkedin" onClick={e => e.stopPropagation()}>in</a>
                            )}
                          </div>
                          <div className="dmv2-reason">{mentor.match_reason}</div>
                          <div className="dmv2-tags">
                            {mentor.years_experience && <span className="dmv2-tag">{mentor.years_experience}yr exp</span>}
                            {mentor.location && <span className="dmv2-tag">📍 {mentor.location.split(',')[0]}</span>}
                            {mentor.is_founder && <span className="dmv2-tag highlight">Founder</span>}
                            {mentor.is_serial_entrepreneur && <span className="dmv2-tag highlight">Serial Entrepreneur</span>}
                            {mentor.is_angel_investor && <span className="dmv2-tag highlight">Angel Investor</span>}
                          </div>
                          <div className="dmv2-footer">
                            {mentorAvail.length > 0
                              ? <span className="dm-avail-yes">📅 {mentorAvail.length} date{mentorAvail.length!==1?'s':''} available</span>
                              : <span className="dmv2-no-avail">No availability yet</span>}
                          </div>
                        </div>
                      )
                    })}
                </div>
              </>
            )}
            {!matching && !matches && (
              <div className="dm-matching-loader"><div className="mreq-spinner"/> Loading your matches…</div>
            )}
          </div>
        )}

        {mainTab === 'search' && (
          <div className="dm-tab-content">
            <div className="dm-search-chat-wrap">
              <div className="dm-search-chat-label">✨ What kind of mentor are you looking for?</div>
              <div className="dm-search-chat-box">
                <textarea
                  className="dm-search-chat-input"
                  placeholder={"e.g. 'I need help scaling my leather export business to Europe and finding B2B buyers'"}
                  value={aiQuery}
                  rows={4}
                  onChange={e => { setAiQuery(e.target.value); if (!e.target.value) setAiResults(null) }}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); searchByQuery() } }}
                />
                <button className="dm-search-chat-btn" onClick={searchByQuery} disabled={aiSearching || !aiQuery.trim()}>
                  {aiSearching ? <span className="dm-search-spinner"/> : '↑'}
                </button>
              </div>
              <div className="dm-search-chat-footer">
                {aiQuery && <button className="dm-search-chat-clear" onClick={() => { setAiQuery(''); setAiResults(null) }}>✕ Clear</button>}
              </div>
              <div className="dm-search-chat-hints">
                {['Scale exports to Europe', 'Build B2B sales channels', 'Raise funding', 'Digital marketing for SME'].map(hint => (
                  <button key={hint} className="dm-search-hint" onClick={() => { setAiQuery(hint); }}>{hint}</button>
                ))}
              </div>
            </div>
            {aiResults && (
              <>
                <div className="dm-ai-tabs" style={{marginBottom:12}}>
                  <button className={'dm-ai-tab' + (aiTab==='tier1' ? ' active' : '')} onClick={()=>setAiTab('tier1')}>
                    🏆 Strong <span className="dm-ai-tab-count">{aiResults.filter(r=>r.tier===1).length}</span>
                  </button>
                  <button className={'dm-ai-tab' + (aiTab==='tier2' ? ' active' : '')} onClick={()=>setAiTab('tier2')}>
                    🔍 Partial <span className="dm-ai-tab-count">{aiResults.filter(r=>r.tier===2).length}</span>
                  </button>
                  <button className="dm-ai-clear-link" onClick={() => { setAiQuery(''); setAiResults(null) }}>✕ Clear</button>
                </div>
                <div className="dm-mentor-grid">
                  {aiResults.filter(m => (aiTab==='tier1'&&m.tier===1)||(aiTab==='tier2'&&m.tier===2))
                    .sort((a,b) => (b.score||0)-(a.score||0))
                    .map((mentor, i) => {
                      const mentorAvail = getMentorAvailability(mentor.email)
                      return (
                        <div key={mentor.id} className="dm-mentor-card" onClick={() => openMentor(mentor)}>
                          <div className={'dm-ai-match-bar dm-ai-tier-'+(mentor.tier||2)}>
                            <span>{mentor.tier===1?'🏆 Strong Match':'🔍 Partial Match'}</span>
                            <span className="dm-ai-score">⭐ {mentor.score}/10</span>
                          </div>
                          <div className="dm-mentor-identity">
                            <div className="dm-mentor-avatar" style={{background: COLORS[i % COLORS.length]}}>
                              {mentor.full_name.split(' ').map(n=>n[0]).join('').slice(0,2)}
                            </div>
                            <div style={{flex:1}}>
                              <div className="dm-mentor-name">{mentor.full_name}</div>
                              <div className="dm-mentor-exp">{mentor.primary_expertise}</div>
                            </div>
                            {mentor.linkedin_url && <a href={mentor.linkedin_url} target="_blank" rel="noreferrer" className="dmv2-linkedin" onClick={e=>e.stopPropagation()}>in</a>}
                          </div>
                          <div className="dmv2-reason">{mentor.match_reason}</div>
                          <div className="dmv2-footer">
                            {mentorAvail.length > 0
                              ? <span className="dm-avail-yes">📅 {mentorAvail.length} date{mentorAvail.length!==1?'s':''} available</span>
                              : <span className="dmv2-no-avail">No availability yet</span>}
                          </div>
                        </div>
                      )
                    })}
                </div>
              </>
            )}
          </div>
        )}

        {mainTab === 'browse' && (
          <div className="dm-tab-content">
            <div className="dm-tab-header">
              <div className="dm-tab-title">Browse all mentors</div>
              <div className="dm-tab-sub">{filteredMentors.length} mentors · filter by expertise or sector</div>
            </div>
            <div className="dm-browse-filters">
              <select className="dm-browse-select" value={filterSector[0]||''} onChange={e => setFilterSector(e.target.value ? [e.target.value] : [])}>
                <option value="">All Sectors</option>
                {[...TOP_SECTORS,...OTHER_SECTORS].map(sec => <option key={sec} value={sec}>{sec}</option>)}
              </select>
              <select className="dm-browse-select" value={filterMarket} onChange={e => setFilterMarket(e.target.value)}>
                <option value="">All Markets</option>
                {['global','usa','europe','uk','singapore','middle east','africa','australia','china','japan','export'].map(mkt => <option key={mkt} value={mkt}>{mkt.charAt(0).toUpperCase()+mkt.slice(1)}</option>)}
              </select>
              <select className="dm-browse-select" value={filterExpertise[0]||''} onChange={e => setFilterExpertise(e.target.value ? [e.target.value] : [])}>
                <option value="">All Expertise</option>
                {[...TOP_EXPERTISE,...OTHER_EXPERTISE].map(exp => <option key={exp} value={exp}>{exp}</option>)}
              </select>
              {(filterExpertise.length>0||filterSector.length>0||filterMarket) && (
                <button className="dm-browse-clear" onClick={() => { setFilterExpertise([]); setFilterSector([]); setFilterMarket('') }}>✕ Clear filters</button>
              )}
            </div>
            <div className="dm-mentor-grid">
              {filteredMentors.map((mentor, i) => {
                const mentorAvail = getMentorAvailability(mentor.email)
                return (
                  <div key={mentor.id} className="dm-mentor-card" onClick={() => openMentor(mentor)}>
                    <div className="dm-mentor-card-top">
                      <div className="dm-mentor-tags">
                        {mentor.primary_industry && mentor.primary_industry !== '-' && <span className="dm-tag sector">{mentor.primary_industry}</span>}
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
          </div>
        )}

      </div>

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
                <label className="dm-label">What do you want to achieve from this meeting? <span>*</span></label>
                <textarea className="dm-input dm-textarea"
                  placeholder="Describe what you'd like to discuss and what outcomes you're hoping for…"
                  rows={3} value={form.goal}
                  onChange={e => setForm(f => ({...f, goal: e.target.value}))} />
              </div>
            </div>
            <div className="dm-footer">
              <button className="dm-cancel" onClick={() => setShowForm(false)}>← Back</button>
              <button className="dm-submit" onClick={submitRequest} disabled={submitting || !form.goal}>
                {submitting ? '⏳ Sending…' : '📨 Send Request'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {modalMentor && createPortal(
        <div className="dm-modal-overlay" onClick={() => setModalMentor(null)}>
          <div className="dm-modal-box" onClick={e => e.stopPropagation()}>
            <button className="dm-modal-close" onClick={() => setModalMentor(null)}>✕</button>
            <div className="dm-modal-header">
              <div className="dm-modal-tags">
                {modalMentor.primary_industry && modalMentor.primary_industry !== '-' && <span className="dm-tag sector">{modalMentor.primary_industry}</span>}
                {modalMentor.secondary_industry && modalMentor.secondary_industry !== '-' && <span className="dm-tag sector">{modalMentor.secondary_industry}</span>}
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
            {(() => {
              const am = scoreCache[modalMentor.email] || (aiResults || []).find(r => r.email === modalMentor.email) || (matches || []).find(r => r.email === modalMentor.email)
              if (!am) return scoringMentor === modalMentor.email
                ? <div style={{padding:'10px 14px',background:'rgba(79,124,255,0.05)',borderRadius:10,fontSize:12,color:'var(--muted)',display:'flex',alignItems:'center',gap:8,marginBottom:12}}><div className="mreq-spinner"/>Loading match analysis…</div>
                : null
              return (
                <div className="dm-modal-scorecard">
                  <div className="dm-modal-scorecard-header">
                    <span className={'dm-modal-tier dm-modal-tier-'+(am.tier||2)}>
                      {am.tier===1?'🏆 Strong Match':'🔍 Partial Match'}
                    </span>
                    <span className="dm-modal-score-total">⭐ {am.score}/10</span>
                    <span style={{fontSize:12,fontWeight:600,color:am.hands_on==='Yes'?'#059669':am.hands_on==='Partial'?'#d97706':'#dc2626'}}>
                      {am.hands_on==='Yes'?'🟢 Hands-on Operator':am.hands_on==='Partial'?'🟡 Partial Experience':'🔴 Advisory Only'}
                    </span>
                  </div>
                  <div className="dm-modal-scorecard-grid">
                    {[
                      {val: am.industry_match_score, max: 3, label: 'Industry Match', reason: am.industry_match_reason},
                      {val: am.operator_score, max: 3, label: 'Operator Experience', reason: am.operator_reason},
                      {val: am.expertise_score, max: 2, label: 'Expertise', reason: am.expertise_reason},
                      {val: am.credentials_score, max: 2, label: 'Key Credentials', reason: am.credentials_reason}
                    ].map(item => (
                      <div key={item.label} className="dm-modal-score-item">
                        {item.val !== undefined
                          ? <div className="dm-modal-score-val">{item.val}/{item.max}</div>
                          : <div className="dm-modal-score-val dm-score-loading"><div className="mreq-spinner" style={{width:16,height:16}}/></div>
                        }
                        <div className="dm-modal-score-label">{item.label}</div>
                        {item.reason
                          ? <div className="dm-modal-score-reason">{item.reason}</div>
                          : item.val === undefined && <div className="dm-modal-score-reason" style={{color:'#cbd5e1'}}>Analyzing…</div>
                        }
                      </div>
                    ))}
                  </div>
                  {am.match_reason && <div className="dm-modal-match-reason">✅ {am.match_reason}</div>}
                </div>
              )
            })()}
            {modalMentor.bio && (
              <div className="dm-modal-section">
                <div className="dm-modal-section-label">About</div>
                <div className="dm-modal-bio">{modalMentor.bio.replace(/<[^>]+>/g, ' ').replace(/\s+/g,' ').trim()}</div>
              </div>
            )}
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
            {(modalMentor.primary_industry || modalMentor.secondary_industry) && (
              <div className="dm-modal-section">
                <div className="dm-modal-section-label">Sector</div>
                <div className="dm-modal-tags-row">
                  {modalMentor.primary_industry && modalMentor.primary_industry !== '-' && <span className="dm-modal-tag">{modalMentor.primary_industry}</span>}
                  {modalMentor.secondary_industry && modalMentor.secondary_industry !== '-' && <span className="dm-modal-tag">{modalMentor.secondary_industry}</span>}
                </div>
              </div>
            )}
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

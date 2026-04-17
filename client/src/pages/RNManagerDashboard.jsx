import React, { useState, useEffect } from 'react'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import './RNManagerDashboard.css'
import './MentorAvailability.css'

const EXPERTISE = ['Sales & Business Development','Entrepreneurship Coaching','Marketing & Branding','Business Model Development','Go to Market Strategy','Product Management','Investing','Training & Development','HR Consulting','Supply Chain Management','Business Finance','IT Consulting','Strategic Planning','Software Development','Digital Marketing','Research and Development','Data Analytics','Leadership Coaching','E-commerce Management','Digital Transformation']
const INDUSTRY = ['Education & Training','Software & IT Services','Fintech, Banking & Financial Services','Agritech & Food Processing','Healthcare & Pharmaceuticals','Retail & E-Commerce','Automotive & Auto Components','Manufacturing','Media & Entertainment','Consumer Products','Deeptech','HR Services','Telecommunications','Legal Services','ESG & Sustainability','CleanTech','Technology & Innovation','Transportation & Logistics']
const TIERINGS = ['Ignite','Liftoff','Accelerate','Ignite, Liftoff']
const COLORS = ['#2563eb','#7c3aed','#059669','#d97706','#dc2626','#0891b2','#9333ea','#16a34a','#ea580c','#0284c7']

export default function RNManagerDashboard() {
  const { profile, signOut } = useAuth()
  const [tab, setTab] = useState('mentors')

  // Mentors
  const [mentors, setMentors] = useState([])
  const [mentorsLoading, setMentorsLoading] = useState(false)
  const [tierFilter, setTierFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchField, setSearchField] = useState('name')
  const [counts, setCounts] = useState({total:0,liftoff:0,accelerate:0,ignite:0})
  const [selected, setSelected] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [confirmSave, setConfirmSave] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [savedMsg, setSavedMsg] = useState('')
  const [showModal, setShowModal] = useState(false)

  // Add
  const [addForm, setAddForm] = useState({full_name:'',email:'',phone:'',job_title:'',current_company:'',bio:'',linkedin_url:'',primary_expertise:'',secondary_expertise:'',primary_industry:'',secondary_industry:'',location:'',country:'India',tiering:'Liftoff',years_experience:'',is_angel_investor:false,is_serial_entrepreneur:false,is_founder:false,smb_mentor:false})
  const [adding, setAdding] = useState(false)
  const [addMsg, setAddMsg] = useState('')

  // Meetings
  const [meetings, setMeetings] = useState([])
  const [meetingsLoading, setMeetingsLoading] = useState(false)
  const [meetingSearch, setMeetingSearch] = useState('')
  const [meetingSearchField, setMeetingSearchField] = useState('mentor')
  const [meetingStatusFilter, setMeetingStatusFilter] = useState('all')
  const [meetingTierFilter, setMeetingTierFilter] = useState('all')
  const [selMeeting, setSelMeeting] = useState(null)
  const [meetingBrief, setMeetingBrief] = useState(null)
  const [meetingTranscript, setMeetingTranscript] = useState(null)
  const [meetingInsights, setMeetingInsights] = useState(null)
  const [meetingTab, setMeetingTab] = useState('overview')

  // Availability
  const [availSearch, setAvailSearch] = useState('')
  const [availResults, setAvailResults] = useState([])
  const [availMentor, setAvailMentor] = useState(null)
  const [availTier, setAvailTier] = useState('all')
  const [availSel, setAvailSel] = useState({})
  const [availSaved, setAvailSaved] = useState({})
  const [availSaving, setAvailSaving] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [dragMode, setDragMode] = useState(null)
  const [dragDate, setDragDate] = useState(null)
  const [availReqMap, setAvailReqMap] = useState({})
  const [weekStart, setWeekStart] = useState(() => { const d=new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate()-d.getDay()); return d })

  useEffect(() => { fetchCounts(); fetchMentors() }, [])
  useEffect(() => { if (tab==='meetings') fetchMeetings() }, [tab])

  async function fetchCounts() {
    const {data} = await supabase.from('profiles').select('tiering').eq('role','mentor')
    if (!data) return
    setCounts({ total:data.length, liftoff:data.filter(m=>m.tiering?.includes('Liftoff')).length, accelerate:data.filter(m=>m.tiering?.includes('Accelerate')).length, ignite:data.filter(m=>m.tiering?.includes('Ignite')).length })
  }

  async function fetchMentors(tier=tierFilter, query=searchQuery, field=searchField) {
    setMentorsLoading(true); setSelected(null); setShowModal(false)
    try {
      let q = supabase.from('profiles').select('*').eq('role','mentor')
      if (tier !== 'all') q = q.ilike('tiering','%'+tier+'%')
      if (query.trim()) {
        if (field==='name') q = q.ilike('full_name','%'+query+'%')
        else if (field==='email') q = q.ilike('email','%'+query+'%')
        else if (field==='phone') q = q.ilike('phone','%'+query+'%')
      }
      const {data} = await q.order('full_name').limit(200)
      setMentors(data || [])
    } finally { setMentorsLoading(false) }
  }

  function openEdit(mentor) {
    setSelected(mentor)
    setConfirmSave(false); setConfirmDelete(false); setSavedMsg('')
    setEditForm({ job_title:mentor.job_title||'', current_company:mentor.current_company||'', bio:(mentor.bio||'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim(), linkedin_url:mentor.linkedin_url||'', primary_expertise:mentor.primary_expertise||'', secondary_expertise:mentor.secondary_expertise||'', tertiary_expertise:mentor.tertiary_expertise||'', primary_industry:mentor.primary_industry||'', secondary_industry:mentor.secondary_industry||'', location:mentor.location||'', country:mentor.country||'', tiering:mentor.tiering||'', years_experience:mentor.years_experience||'', career_start_year:mentor.career_start_year||'', experience_category:mentor.experience_category||'', is_angel_investor:mentor.is_angel_investor||false, is_serial_entrepreneur:mentor.is_serial_entrepreneur||false, is_founder:mentor.is_founder||false, has_global_tier1:mentor.has_global_tier1||false, has_india_tier1:mentor.has_india_tier1||false, has_international_exp:mentor.has_international_exp||false, smb_mentor:mentor.smb_mentor||false })
    setShowModal(true)
  }

  async function saveMentor() {
    if (!confirmSave) { setConfirmSave(true); return }
    setSaving(true); setConfirmSave(false)
    try {
      const updates = { ...editForm, years_experience:editForm.years_experience?parseInt(editForm.years_experience):null, career_start_year:editForm.career_start_year?parseInt(editForm.career_start_year):null, updated_at:new Date() }
      const {error} = await supabase.from('profiles').update(updates).eq('id',selected.id)
      if (error) throw error
      setSavedMsg('Saved')
      setMentors(prev=>prev.map(m=>m.id===selected.id?{...m,...updates}:m))
      setTimeout(()=>setSavedMsg(''),3000)
    } catch(e) { setSavedMsg('Error: '+e.message) }
    finally { setSaving(false) }
  }

  async function deleteMentor() {
    if (!confirmDelete) { setConfirmDelete(true); return }
    setDeleting(true)
    try {
      await supabase.from('profiles').delete().eq('id',selected.id)
      await fetch('/api/admin/delete-mentor',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId:selected.id})})
      setMentors(prev=>prev.filter(m=>m.id!==selected.id))
      setShowModal(false); setSelected(null)
    } catch(e) { setSavedMsg('Error: '+e.message) }
    finally { setDeleting(false); setConfirmDelete(false) }
  }

  async function addMentor() {
    if (!addForm.full_name||!addForm.email) return
    setAdding(true); setAddMsg('')
    try {
      const res = await fetch('/api/admin/create-mentor',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:addForm.email,full_name:addForm.full_name})})
      const result = await res.json()
      if (result.error) throw new Error(result.error)
      const {error} = await supabase.from('profiles').insert({id:result.id,email:addForm.email,full_name:addForm.full_name,role:'mentor',phone:addForm.phone||null,job_title:addForm.job_title||null,current_company:addForm.current_company||null,bio:addForm.bio||null,linkedin_url:addForm.linkedin_url||null,primary_expertise:addForm.primary_expertise||null,secondary_expertise:addForm.secondary_expertise||null,primary_industry:addForm.primary_industry||null,secondary_industry:addForm.secondary_industry||null,location:addForm.location||null,country:addForm.country||'India',tiering:addForm.tiering||null,years_experience:addForm.years_experience?parseInt(addForm.years_experience):null,is_angel_investor:addForm.is_angel_investor,is_serial_entrepreneur:addForm.is_serial_entrepreneur,is_founder:addForm.is_founder,smb_mentor:addForm.smb_mentor,is_test_account:false})
      if (error) throw error
      setAddMsg('Mentor added'); fetchCounts()
      setAddForm({full_name:'',email:'',phone:'',job_title:'',current_company:'',bio:'',linkedin_url:'',primary_expertise:'',secondary_expertise:'',primary_industry:'',secondary_industry:'',location:'',country:'India',tiering:'Liftoff',years_experience:'',is_angel_investor:false,is_serial_entrepreneur:false,is_founder:false,smb_mentor:false})
    } catch(e) { setAddMsg('Error: '+e.message) }
    finally { setAdding(false) }
  }

  async function fetchMeetings() {
    setMeetingsLoading(true); setSelMeeting(null)
    try {
      let q = supabase.from('meeting_requests').select('*').order('created_at',{ascending:false})
      if (meetingSearch.trim()) {
        if (meetingSearchField==='mentor') q = q.ilike('mentor_name','%'+meetingSearch+'%')
        else q = q.ilike('mentee_name','%'+meetingSearch+'%')
      }
      const {data} = await q.limit(100)
      setMeetings(data||[])
    } finally { setMeetingsLoading(false) }
  }

  async function selectMeeting(m) {
    setSelMeeting(m); setMeetingBrief(null); setMeetingTranscript(null); setMeetingInsights(null); setMeetingTab('overview')
    supabase.from('pre_meeting_briefs').select('*').eq('meeting_request_id',m.id).single().then(({data})=>setMeetingBrief(data||null))
    if (m.zoom_meeting_id) {
      supabase.from('session_transcripts').select('*').eq('session_id',m.zoom_meeting_id).single().then(({data})=>setMeetingTranscript(data||null))
      supabase.from('session_insights').select('*').eq('session_id',m.zoom_meeting_id).eq('is_final',true).single().then(({data})=>setMeetingInsights(data||null))
    }
  }

  async function searchAvailMentors() {
    if (!availSearch.trim()) return
    let q = supabase.from('profiles').select('id,email,full_name,tiering').eq('role','mentor').ilike('full_name','%'+availSearch+'%')
    if (availTier !== 'all') q = q.ilike('tiering','%'+availTier+'%')
    const {data} = await q.limit(10)
    setAvailResults(data||[])
  }

  async function loadAvailMentor(mentor) {
    setAvailMentor(mentor); setAvailResults([]); setAvailSel({}); setAvailSaved({})
    const today = new Date().toISOString().split('T')[0]
    const {data:avails} = await supabase.from('mentor_availability').select('*').eq('mentor_email',mentor.email).gte('date',today).order('date')
    const sMap={}, selMap={}
    for (const a of avails||[]) {
      const hrs = new Set(a.slots.filter(s=>!s.booked).map(s=>parseInt(s.start)))
      sMap[a.date]=hrs; selMap[a.date]=new Set(hrs)
    }
    setAvailSaved(sMap); setAvailSel(selMap)
    const {data:reqs} = await supabase.from('meeting_requests').select('*').eq('mentor_email',mentor.email).in('status',['pending','accepted','completed'])
    const rm={}
    for (const r of reqs||[]) rm[r.requested_date+':'+r.requested_slot?.start?.split(':')[0]]=r
    setAvailReqMap(rm)
  }

  function handleMouseDown(e, dateStr, hour) {
    e.preventDefault()
    const isSelected = availSel[dateStr]?.has(hour)
    setDragMode(isSelected ? 'remove' : 'add')
    setDragDate(dateStr)
    setIsDragging(true)
    setAvailSel(prev => {
      const next = {...prev}
      if (!next[dateStr]) next[dateStr] = new Set()
      else next[dateStr] = new Set(next[dateStr])
      if (isSelected) next[dateStr].delete(hour)
      else next[dateStr].add(hour)
      return next
    })
  }

  function handleMouseEnter(dateStr, hour) {
    if (!isDragging) return
    setAvailSel(prev => {
      const next = {...prev}
      if (!next[dateStr]) next[dateStr] = new Set()
      else next[dateStr] = new Set(next[dateStr])
      if (dragMode === 'add') next[dateStr].add(hour)
      else next[dateStr].delete(hour)
      return next
    })
  }

  function handleMouseUp() { setIsDragging(false); setDragMode(null); setDragDate(null) }

  function dk(date) { return date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0') }
  function weekDates() { const dates=[],d=new Date(weekStart); for(let i=0;i<7;i++){dates.push(new Date(d));d.setDate(d.getDate()+1)} return dates }
  function toggleSlot(dateStr,hour) { setAvailSel(prev=>{ const s=new Set(prev[dateStr]||[]); if(s.has(hour))s.delete(hour);else s.add(hour); return{...prev,[dateStr]:s} }) }

  async function saveAvail() {
    if (!availMentor) return
    setAvailSaving(true)
    try {
      for (const [dateStr,hrs] of Object.entries(availSel)) {
        if (hrs.size===0) { await supabase.from('mentor_availability').delete().eq('mentor_email',availMentor.email).eq('date',dateStr) }
        else {
          const slots=[...hrs].sort((a,b)=>a-b).map(h=>({start:String(h).padStart(2,'0')+':00',end:String(h+1).padStart(2,'0')+':00',booked:false}))
          await supabase.from('mentor_availability').upsert({mentor_id:availMentor.id,mentor_email:availMentor.email,mentor_name:availMentor.full_name,date:dateStr,slots,timezone:'Asia/Kolkata'},{onConflict:'mentor_email,date'})
        }
      }
      setAvailSaved({...availSel}); alert('Availability saved!')
    } finally { setAvailSaving(false) }
  }

  const BOOL_FLAGS = [{key:'is_founder',label:'Founder'},{key:'is_angel_investor',label:'Angel Investor'},{key:'is_serial_entrepreneur',label:'Serial Entrepreneur'},{key:'has_global_tier1',label:'Global Tier 1'},{key:'has_india_tier1',label:'India Tier 1'},{key:'has_international_exp',label:'Intl Exp'},{key:'smb_mentor',label:'SMB Mentor'}]
  const TEXT_FIELDS = [{key:'job_title',label:'Job Title'},{key:'current_company',label:'Current Company'},{key:'location',label:'Location'},{key:'country',label:'Country'},{key:'years_experience',label:'Years Exp',type:'number'},{key:'career_start_year',label:'Career Start',type:'number'},{key:'experience_category',label:'Exp Category'},{key:'linkedin_url',label:'LinkedIn URL'}]
  const TIER_PILLS = [{key:'all',label:'All'},{key:'Liftoff',label:'Liftoff'},{key:'Accelerate',label:'Accelerate'},{key:'Ignite',label:'Ignite'}]
  const HOURS = Array.from({length:24},(_,i)=>i)

  const filteredMeetings = meetings.filter(m =>
    (meetingStatusFilter==='all'||m.status===meetingStatusFilter) &&
    (meetingTierFilter==='all')
  )

  return (
    <div className="rnm-wrap">
      <div className="rnm-header">
        <div className="rnm-logo">
          <div className="rnm-logo-mark">RN</div>
          <div>
            <div className="rnm-logo-name">Resource Network Manager</div>
            <div className="rnm-logo-sub">MENTOR MANAGEMENT PORTAL</div>
          </div>
        </div>
        <div className="rnm-header-right">
          <span className="rnm-user">{profile?.full_name}</span>
          <button className="rnm-signout" onClick={signOut}>Sign out</button>
        </div>
      </div>

      <div className="rnm-layout">
        <div className="rnm-sidebar">
          <nav className="rnm-sidenav">
            {[{key:'mentors',icon:'👥',label:'Find & Edit Mentors'},{key:'add',icon:'➕',label:'Add New Mentor'},{key:'meetings',icon:'📋',label:'Meetings'},{key:'availability',icon:'📅',label:'Mentor Availability'}].map(item => (
              <button key={item.key} className={'rnm-navitem'+(tab===item.key?' active':'')} onClick={()=>setTab(item.key)}>
                <span>{item.icon}</span><span>{item.label}</span>
              </button>
            ))}
          </nav>
        </div>

        <div className="rnm-main">

          {tab==='mentors' && (
            <div>
              <div className="rnm-tier-pills">
                {[{key:'all',label:'All',count:counts.total},{key:'Liftoff',label:'Liftoff',count:counts.liftoff},{key:'Accelerate',label:'Accelerate',count:counts.accelerate},{key:'Ignite',label:'Ignite',count:counts.ignite}].map(t => (
                  <button key={t.key} className={'rnm-tier-pill'+(tierFilter===t.key?' active':'')}
                    onClick={()=>{ setTierFilter(t.key); fetchMentors(t.key) }}>
                    {t.label} <span className="rnm-tier-count">{t.count}</span>
                  </button>
                ))}
              </div>
              <div className="rnm-toolbar">
                <select className="rnm-field-select" value={searchField} onChange={e=>setSearchField(e.target.value)}>
                  <option value="name">Name</option>
                  <option value="email">Email</option>
                  <option value="phone">Phone</option>
                </select>
                <input className="rnm-search-input" placeholder="Search mentors..." value={searchQuery}
                  onChange={e=>setSearchQuery(e.target.value)}
                  onKeyDown={e=>e.key==='Enter'&&fetchMentors(tierFilter,searchQuery,searchField)} />
                <button className="rnm-search-btn" onClick={()=>fetchMentors(tierFilter,searchQuery,searchField)}>Search</button>
                <span className="rnm-result-count">{mentors.length} mentors</span>
              </div>
              {mentorsLoading && <div className="rnm-loading">Loading...</div>}
              <div className="rnm-mentor-grid">
                {mentors.map((m,i) => (
                  <div key={m.id} className="rnm-mentor-card" onClick={()=>openEdit(m)}>
                    <div className="rnm-mc-top">
                      {m.primary_industry && <span className="rnm-mc-tag">{m.primary_industry}</span>}
                      {m.tiering && <span className={'rnm-mc-tier '+(m.tiering.split(',')[0].trim())}>{m.tiering}</span>}
                    </div>
                    <div className="rnm-mc-identity">
                      <div className="rnm-mc-avatar" style={{background:COLORS[i%COLORS.length]}}>
                        {m.full_name?.split(' ').map(n=>n[0]).join('').slice(0,2)}
                      </div>
                      <div>
                        <div className="rnm-mc-name">{m.full_name}</div>
                        <div className="rnm-mc-title">{m.primary_expertise}</div>
                        {m.location && <div className="rnm-mc-loc">📍 {m.location}</div>}
                      </div>
                    </div>
                    {m.years_experience && <div className="rnm-mc-exp">{m.years_experience} yrs exp</div>}
                  </div>
                ))}
                {mentors.length===0 && !mentorsLoading && (
                  <div className="rnm-grid-empty">Select a tier or search to browse mentors</div>
                )}
              </div>
            </div>
          )}

          {tab==='add' && (
            <div className="rnm-add-panel">
              <div className="rnm-edit-header">
                <div className="rnm-edit-name">Add New Mentor</div>
                {addMsg && <span className="rnm-save-msg" style={{marginLeft:'auto'}}>{addMsg}</span>}
                <button className="rnm-save-btn" onClick={addMentor} disabled={adding||!addForm.full_name||!addForm.email}>{adding?'Adding...':'Add Mentor'}</button>
              </div>
              <div className="rnm-edit-grid">
                {[{key:'full_name',label:'Full Name *'},{key:'email',label:'Email *',type:'email'},{key:'phone',label:'Phone'},{key:'job_title',label:'Job Title'},{key:'current_company',label:'Current Company'},{key:'location',label:'Location'},{key:'country',label:'Country'},{key:'years_experience',label:'Years Experience',type:'number'},{key:'linkedin_url',label:'LinkedIn URL'}].map(f => (
                  <div key={f.key} className="rnm-field">
                    <label className="rnm-label">{f.label}</label>
                    <input className="rnm-input" type={f.type||'text'} value={addForm[f.key]||''} onChange={e=>setAddForm(prev=>({...prev,[f.key]:e.target.value}))} />
                  </div>
                ))}
                <div className="rnm-field">
                  <label className="rnm-label">Tiering</label>
                  <select className="rnm-input" value={addForm.tiering} onChange={e=>setAddForm(prev=>({...prev,tiering:e.target.value}))}>
                    {TIERINGS.map(t=><option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="rnm-field">
                  <label className="rnm-label">Primary Expertise</label>
                  <select className="rnm-input" value={addForm.primary_expertise} onChange={e=>setAddForm(prev=>({...prev,primary_expertise:e.target.value}))}>
                    <option value="">Select...</option>
                    {EXPERTISE.map(e=><option key={e} value={e}>{e}</option>)}
                  </select>
                </div>
                <div className="rnm-field">
                  <label className="rnm-label">Primary Industry</label>
                  <select className="rnm-input" value={addForm.primary_industry} onChange={e=>setAddForm(prev=>({...prev,primary_industry:e.target.value}))}>
                    <option value="">Select...</option>
                    {INDUSTRY.map(i=><option key={i} value={i}>{i}</option>)}
                  </select>
                </div>
              </div>
              <div className="rnm-field" style={{marginTop:12}}>
                <label className="rnm-label">Bio</label>
                <textarea className="rnm-input rnm-textarea" rows={5} value={addForm.bio||''} onChange={e=>setAddForm(prev=>({...prev,bio:e.target.value}))} />
              </div>
              <div className="rnm-flags">
                {[{key:'is_founder',label:'Founder'},{key:'is_angel_investor',label:'Angel Investor'},{key:'is_serial_entrepreneur',label:'Serial Entrepreneur'},{key:'smb_mentor',label:'SMB Mentor'}].map(f=>(
                  <label key={f.key} className="rnm-checkbox">
                    <input type="checkbox" checked={!!addForm[f.key]} onChange={e=>setAddForm(prev=>({...prev,[f.key]:e.target.checked}))} />
                    {f.label}
                  </label>
                ))}
              </div>
            </div>
          )}

          {tab==='meetings' && (
            <div className="rnm-meetings-layout">
              <div className="rnm-meetings-panel">
                <div className="rnm-toolbar">
                  <select className="rnm-field-select" value={meetingSearchField} onChange={e=>setMeetingSearchField(e.target.value)}>
                    <option value="mentor">Mentor</option>
                    <option value="mentee">Mentee</option>
                  </select>
                  <input className="rnm-search-input" placeholder="Search..." value={meetingSearch}
                    onChange={e=>setMeetingSearch(e.target.value)}
                    onKeyDown={e=>e.key==='Enter'&&fetchMeetings()} />
                  <button className="rnm-search-btn" onClick={fetchMeetings}>Search</button>
                </div>
                <div className="rnm-tier-pills" style={{marginBottom:8}}>
                  {TIER_PILLS.map(t=>(
                    <button key={t.key} className={'rnm-tier-pill'+(meetingTierFilter===t.key?' active':'')} onClick={()=>setMeetingTierFilter(t.key)}>{t.label}</button>
                  ))}
                </div>
                <div className="rnm-meeting-filters">
                  {['all','pending','accepted','completed','declined','rescheduled'].map(s=>(
                    <button key={s} className={'rnm-filter-pill'+(meetingStatusFilter===s?' active':'')} onClick={()=>setMeetingStatusFilter(s)}>
                      {s.charAt(0).toUpperCase()+s.slice(1)} <span className="rnm-pill-count">{meetings.filter(m=>s==='all'||m.status===s).length}</span>
                    </button>
                  ))}
                </div>
                <div className="rnm-results">
                  {meetingsLoading && <div className="rnm-empty">Loading...</div>}
                  {filteredMeetings.map(m=>(
                    <div key={m.id} className={'rnm-mentor-row'+(selMeeting?.id===m.id?' active':'')} onClick={()=>selectMeeting(m)}>
                      <div className={'rnm-status-dot '+m.status}/>
                      <div className="rnm-mentor-info">
                        <div className="rnm-mentor-name">{m.mentee_name} → {m.mentor_name}</div>
                        <div className="rnm-mentor-meta">{m.company_name} · {m.requested_date} · {m.requested_slot?.start}–{m.requested_slot?.end}</div>
                        <div className="rnm-mentor-tags"><span className={'rnm-status-tag '+m.status}>{m.status}</span></div>
                      </div>
                    </div>
                  ))}
                  {filteredMeetings.length===0&&!meetingsLoading&&<div className="rnm-empty">Search to load meetings</div>}
                </div>
              </div>
              {selMeeting && (
                <div className="rnm-edit-panel">
                  <div className="rnm-edit-header">
                    <div>
                      <div className="rnm-edit-name">{selMeeting.mentee_name} with {selMeeting.mentor_name}</div>
                      <div className="rnm-edit-email">{selMeeting.company_name} · {selMeeting.requested_date}</div>
                    </div>
                    <span className={'rnm-status-tag '+selMeeting.status} style={{marginLeft:'auto'}}>{selMeeting.status}</span>
                  </div>
                  <div className="rnm-detail-tabs">
                    {['overview','brief','transcript','insights'].map(t=>(
                      <button key={t} className={'rnm-detail-tab'+(meetingTab===t?' active':'')} onClick={()=>setMeetingTab(t)}>{t.charAt(0).toUpperCase()+t.slice(1)}</button>
                    ))}
                  </div>
                  {meetingTab==='overview' && (
                    <div className="rnm-detail-section">
                      {[['Goal',selMeeting.meeting_goal],['Company',selMeeting.company_name],['Stage',selMeeting.company_stage],['Timezone',selMeeting.timezone],['Zoom ID',selMeeting.zoom_meeting_id]].filter(([,v])=>v).map(([k,v])=>(
                        <div key={k} className="rnm-info-row"><span>{k}</span><span>{v}</span></div>
                      ))}
                    </div>
                  )}
                  {meetingTab==='brief' && (
                    <div className="rnm-detail-section">
                      {!meetingBrief ? <div className="rnm-empty">No brief</div> : (
                        <>
                          {meetingBrief.progress_summary&&<div className="rnm-brief-block"><div className="rnm-brief-label">Progress</div>{meetingBrief.progress_summary}</div>}
                          {meetingBrief.red_flags?.filter(f=>f).length>0&&<div className="rnm-brief-block red"><div className="rnm-brief-label">Red Flags</div>{meetingBrief.red_flags.map((f,i)=><div key={i}>⚠ {f}</div>)}</div>}
                          {meetingBrief.brief_text&&<div className="rnm-brief-block"><div className="rnm-brief-label">Overview</div>{meetingBrief.brief_text}</div>}
                          {meetingBrief.key_questions?.length>0&&<div className="rnm-brief-block"><div className="rnm-brief-label">Key Questions</div>{meetingBrief.key_questions.map((q,i)=><div key={i} style={{padding:'4px 0',borderBottom:'1px solid #f0f0f0',fontSize:13}}>{i+1}. {q}</div>)}</div>}
                        </>
                      )}
                    </div>
                  )}
                  {meetingTab==='transcript' && (
                    <div className="rnm-detail-section">
                      {!meetingTranscript?<div className="rnm-empty">No transcript</div>:(
                        <div style={{display:'flex',flexDirection:'column',gap:8}}>
                          {(meetingTranscript.lines||[]).map((line,i)=>(
                            <div key={i} style={{padding:'8px 12px',background:'#f8faff',borderRadius:8,borderLeft:'3px solid #2563eb'}}>
                              <div style={{fontSize:10,fontFamily:'monospace',color:'#64748b',marginBottom:2}}>{line.name}</div>
                              <div style={{fontSize:13}}>{line.text}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  {meetingTab==='insights' && (
                    <div className="rnm-detail-section">
                      {!meetingInsights?<div className="rnm-empty">No insights</div>:(
                        <>
                          {meetingInsights.summary&&<div className="rnm-brief-block"><div className="rnm-brief-label">Summary</div>{meetingInsights.summary}</div>}
                          {meetingInsights.key_points?.length>0&&<div className="rnm-brief-block"><div className="rnm-brief-label">Key Points</div>{meetingInsights.key_points.map((p,i)=><div key={i} style={{fontSize:13,padding:'3px 0'}}>• {p}</div>)}</div>}
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {tab==='availability' && (
            <div className="rnm-avail-layout">
              <div className="rnm-search-panel">
                <div className="rnm-tier-pills" style={{marginBottom:8}}>
                  {TIER_PILLS.map(t=>(
                    <button key={t.key} className={'rnm-tier-pill'+(availTier===t.key?' active':'')} onClick={()=>setAvailTier(t.key)}>{t.label}</button>
                  ))}
                </div>
                <div className="rnm-search-bar">
                  <input className="rnm-search-input" placeholder="Search mentor..." value={availSearch}
                    onChange={e=>setAvailSearch(e.target.value)}
                    onKeyDown={e=>e.key==='Enter'&&searchAvailMentors()} />
                  <button className="rnm-search-btn" onClick={searchAvailMentors}>Search</button>
                </div>
                {availResults.length>0&&(
                  <div className="rnm-results">
                    {availResults.map(m=>(
                      <div key={m.id} className={'rnm-mentor-row'+(availMentor?.id===m.id?' active':'')} onClick={()=>loadAvailMentor(m)}>
                        <div className="rnm-mentor-avatar">{m.full_name?.split(' ').map(n=>n[0]).join('').slice(0,2)}</div>
                        <div className="rnm-mentor-info">
                          <div className="rnm-mentor-name">{m.full_name}</div>
                          <div className="rnm-mentor-tags">{m.tiering&&<span className="rnm-tag">{m.tiering}</span>}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {availMentor&&(
                  <div style={{padding:'10px 12px',background:'rgba(37,99,235,0.05)',border:'1px solid rgba(37,99,235,0.2)',borderRadius:10,marginTop:8}}>
                    <div style={{fontSize:13,fontWeight:600}}>{availMentor.full_name}</div>
                    <div style={{fontSize:11,color:'#64748b',fontFamily:'monospace'}}>{availMentor.email}</div>
                  </div>
                )}
              </div>

              {availMentor ? (
                <div className="rnm-avail-calendar" onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}>
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
                    <div style={{display:'flex',gap:6}}>
                      <button className="avail-nav-btn" onClick={()=>{const d=new Date(weekStart);d.setDate(d.getDate()-7);setWeekStart(d)}}>←</button>
                      <button className="avail-nav-btn" onClick={()=>{const d=new Date();d.setHours(0,0,0,0);d.setDate(d.getDate()-d.getDay());setWeekStart(d)}}>Today</button>
                      <button className="avail-nav-btn" onClick={()=>{const d=new Date(weekStart);d.setDate(d.getDate()+7);setWeekStart(d)}}>→</button>
                    </div>
                    <div style={{fontSize:13,fontWeight:600,color:'#1e293b'}}>
                      {weekStart.toLocaleDateString('en-IN',{month:'short',day:'numeric'})} – {new Date(weekStart.getTime()+6*86400000).toLocaleDateString('en-IN',{month:'short',day:'numeric',year:'numeric'})}
                    </div>
                    <button className="rnm-save-btn" onClick={saveAvail} disabled={availSaving}>{availSaving?'Saving...':'Save Availability'}</button>
                  </div>
                  <div className="avail-calendar">
                    <div className="avail-time-col">
                      <div className="avail-corner"/>
                      {HOURS.map(h=>(
                        <div key={h} className="avail-time-label">{h===0?'12 AM':h<12?h+' AM':h===12?'12 PM':(h-12)+' PM'}</div>
                      ))}
                    </div>
                    {weekDates().map((date,di)=>{
                      const dateStr=dk(date), now=new Date()
                      const isPast=date<new Date(now.getFullYear(),now.getMonth(),now.getDate())
                      const isToday=dk(date)===dk(now)
                      return (
                        <div key={di} className="avail-day-col">
                          <div className={'avail-day-header'+(isPast?' past':'')+(isToday?' today':'')}>
                            <div className="avail-day-name">{date.toLocaleDateString('en-IN',{weekday:'short'})}</div>
                            <div className="avail-day-date">{date.getDate()}</div>
                          </div>
                          {HOURS.map(hour=>{
                            const isSelected=availSel[dateStr]?.has(hour)
                            const isSaved=availSaved[dateStr]?.has(hour)
                            const req=availReqMap[dateStr+':'+hour]
                            const slotPast=new Date(dateStr+'T'+String(hour).padStart(2,'0')+':00:00')<now
                            let cls='avail-cell'
                            if(slotPast) cls+=' past'
                            if(isSelected) cls+=' selected'
                            if(isSaved&&isSelected) cls+=' saved'
                            if(req?.status==='accepted') cls+=' req-accepted'
                            if(req?.status==='pending') cls+=' req-pending'
                            if(req?.status==='accepted'&&slotPast) cls+=' req-past-completed'
                            return (
                              <div key={hour} className={cls}
                                onMouseDown={e=>!slotPast&&!req&&handleMouseDown(e,dateStr,hour)}
                                onMouseEnter={()=>!slotPast&&!req&&handleMouseEnter(dateStr,hour)}>
                                {req&&<div className={'avail-req-label '+(req.status==='accepted'?'accepted':'pending')}>
                                  <span className="avail-req-initials">{req.mentee_name?.split(' ').map(n=>n[0]).join('').slice(0,2)}</span>
                                  <span className="avail-req-name">{req.mentee_name?.split(' ')[0]}</span>
                                </div>}
                              </div>
                            )
                          })}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ) : (
                <div className="rnm-grid-empty">Search for a mentor to view and edit their availability</div>
              )}
            </div>
          )}

        </div>
      </div>

      {showModal && selected && (
        <div onClick={()=>{setShowModal(false);setConfirmSave(false);setConfirmDelete(false)}} style={{position:'fixed',inset:0,background:'rgba(15,23,42,0.55)',zIndex:99999,display:'flex',alignItems:'center',justifyContent:'center',padding:20}}>
          <div onClick={e=>e.stopPropagation()} style={{background:'#fff',borderRadius:16,width:'100%',maxWidth:720,maxHeight:'90vh',overflow:'hidden',display:'flex',flexDirection:'column',boxShadow:'0 24px 60px rgba(0,0,0,0.2)'}}>
            <div style={{padding:'16px 20px',borderBottom:'1px solid #e2e8f0',display:'flex',alignItems:'center',gap:12,background:'#f8fafc'}}>
              <div style={{flex:1}}>
                <div style={{fontSize:16,fontWeight:700,color:'#1e293b'}}>{selected.full_name}</div>
                <div style={{fontSize:11,color:'#64748b',fontFamily:'monospace'}}>{selected.email}{selected.phone?' · '+selected.phone:''}</div>
              </div>
              {savedMsg&&<span style={{fontSize:12,color:'#16a34a',fontWeight:600}}>{savedMsg}</span>}
              <button onClick={deleteMentor} disabled={deleting} style={{padding:'6px 12px',background:confirmDelete?'#ef4444':'#fff5f5',border:'1px solid',borderColor:confirmDelete?'#ef4444':'#fecaca',borderRadius:7,color:confirmDelete?'#fff':'#ef4444',fontSize:12,fontWeight:600,cursor:'pointer'}}>
                {deleting?'Deleting...':confirmDelete?'Confirm Delete':'🗑 Delete'}
              </button>
              <button onClick={saveMentor} disabled={saving} style={{padding:'6px 16px',background:confirmSave?'#16a34a':'#2563eb',border:'none',borderRadius:7,color:'#fff',fontSize:12,fontWeight:600,cursor:'pointer'}}>
                {saving?'Saving...':confirmSave?'Confirm Save':'Save Changes'}
              </button>
              <button onClick={()=>{setShowModal(false);setConfirmSave(false);setConfirmDelete(false)}} style={{width:28,height:28,borderRadius:7,border:'1px solid #e2e8f0',background:'#fff',cursor:'pointer',fontSize:13}}>✕</button>
            </div>
            <div style={{overflowY:'auto',padding:18,display:'flex',flexDirection:'column',gap:12}}>
              <div className="rnm-edit-grid">
                {TEXT_FIELDS.map(f=>(
                  <div key={f.key} className="rnm-field">
                    <label className="rnm-label">{f.label}</label>
                    <input className="rnm-input" type={f.type||'text'} value={editForm[f.key]||''} onChange={e=>setEditForm(prev=>({...prev,[f.key]:e.target.value}))} />
                  </div>
                ))}
                <div className="rnm-field">
                  <label className="rnm-label">Tiering</label>
                  <select className="rnm-input" value={editForm.tiering||''} onChange={e=>setEditForm(prev=>({...prev,tiering:e.target.value}))}>
                    <option value="">Select...</option>
                    {TIERINGS.map(t=><option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                {['primary_expertise','secondary_expertise','tertiary_expertise'].map(k=>(
                  <div key={k} className="rnm-field">
                    <label className="rnm-label">{k.split('_').join(' ')}</label>
                    <select className="rnm-input" value={editForm[k]||''} onChange={e=>setEditForm(prev=>({...prev,[k]:e.target.value}))}>
                      <option value="">Select...</option>
                      {EXPERTISE.map(e=><option key={e} value={e}>{e}</option>)}
                    </select>
                  </div>
                ))}
                {['primary_industry','secondary_industry'].map(k=>(
                  <div key={k} className="rnm-field">
                    <label className="rnm-label">{k.split('_').join(' ')}</label>
                    <select className="rnm-input" value={editForm[k]||''} onChange={e=>setEditForm(prev=>({...prev,[k]:e.target.value}))}>
                      <option value="">Select...</option>
                      {INDUSTRY.map(i=><option key={i} value={i}>{i}</option>)}
                    </select>
                  </div>
                ))}
              </div>
              <div className="rnm-field">
                <label className="rnm-label">Bio</label>
                <textarea className="rnm-input rnm-textarea" rows={5} value={editForm.bio||''} onChange={e=>setEditForm(prev=>({...prev,bio:e.target.value}))} />
              </div>
              <div className="rnm-flags">
                {BOOL_FLAGS.map(f=>(
                  <label key={f.key} className="rnm-checkbox">
                    <input type="checkbox" checked={!!editForm[f.key]} onChange={e=>setEditForm(prev=>({...prev,[f.key]:e.target.checked}))} />
                    {f.label}
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

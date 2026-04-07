import { localDateKey } from '../lib/dateUtils'
import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import './MentorAvailability.css'

const TIMEZONES = ['Asia/Kolkata','Asia/Dubai','Europe/London','Europe/Paris','America/New_York','America/Los_Angeles','Asia/Singapore','Australia/Sydney']
const HOURS = Array.from({length: 24}, (_, i) => i)
const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

function getWeekDates(startDate) {
  const dates = []
  const d = new Date(startDate)
  d.setDate(d.getDate() - d.getDay())
  for (let i = 0; i < 7; i++) { dates.push(new Date(d)); d.setDate(d.getDate() + 1) }
  return dates
}

function dateKey(date) { return localDateKey(date) }

function formatHour(h) {
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hour = h > 12 ? h - 12 : h === 0 ? 12 : h
  return `${hour}:00 ${ampm}`
}

function slotHour(slot) {
  return slot?.start ? parseInt(slot.start.split(':')[0]) : null
}

export default function MentorAvailability({ embedded = false }) {
  const { profile, user } = useAuth()
  const navigate = useNavigate()
  const [timezone, setTimezone] = useState('Asia/Kolkata')
  const [weekStart, setWeekStart] = useState(() => {
    const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate() - d.getDay()); return d
  })
  const [selected, setSelected] = useState({})
  const [saved, setSaved] = useState({})
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [dragMode, setDragMode] = useState(null)
  const [dragDate, setDragDate] = useState(null)
  const [tooltip, setTooltip] = useState(null)

  const weekDates = getWeekDates(weekStart)
  const today = new Date(); today.setHours(0,0,0,0)
  const todayStr = dateKey(today)

  useEffect(() => { if (user) fetchAll() }, [user])

  async function fetchAll() {
    setLoading(true)
    try {
      const [{ data: availData }, { data: reqData }] = await Promise.all([
        supabase.from('mentor_availability').select('*')
          .eq('mentor_email', user?.email)
          .gte('date', localDateKey(new Date())),
        supabase.from('meeting_requests').select('*')
          .eq('mentor_email', user?.email)
          .in('status', ['pending', 'accepted', 'rescheduled', 'completed'])
      ])
      const map = {}
      ;(availData || []).forEach(a => {
        map[a.date] = new Set(a.slots.filter(s => !s.booked).map(s => parseInt(s.start)))
      })
      setSaved(map)
      setSelected(map)
      setRequests(reqData || [])
    } finally { setLoading(false) }
  }

  // Build a lookup: { 'date:hour': request }
  const requestMap = {}
  requests.forEach(req => {
    const slot = req.alternate_slot || req.requested_slot
    const date = req.alternate_date || req.requested_date
    const hour = slotHour(slot)
    if (date && hour !== null) {
      requestMap[`${date}:${hour}`] = req
    }
  })

  function handleMouseDown(e, dateStr, hour) {
    e.preventDefault()
    if (dateStr < todayStr) return
    const isSelected = selected[dateStr]?.has(hour)
    setDragMode(isSelected ? 'remove' : 'add')
    setDragDate(dateStr)
    setIsDragging(true)
    setSelected(prev => {
      const next = { ...prev }
      if (!next[dateStr]) next[dateStr] = new Set()
      else next[dateStr] = new Set(next[dateStr])
      if (isSelected) next[dateStr].delete(hour)
      else next[dateStr].add(hour)
      return next
    })
  }

  function handleMouseEnter(dateStr, hour) {
    if (!isDragging || dragDate !== dateStr) return
    setSelected(prev => {
      const next = { ...prev }
      if (!next[dateStr]) next[dateStr] = new Set()
      else next[dateStr] = new Set(next[dateStr])
      if (dragMode === 'add') next[dateStr].add(hour)
      else next[dateStr].delete(hour)
      return next
    })
  }

  function handleMouseUp() { setIsDragging(false); setDragMode(null); setDragDate(null) }

  async function saveAvailability() {
    setSaving(true)
    try {
      for (const [dateStr, hours] of Object.entries(selected)) {
        if (hours.size === 0) {
          await supabase.from('mentor_availability').delete()
            .eq('mentor_email', user?.email).eq('date', dateStr)
          continue
        }
        const slots = [...hours].sort((a,b)=>a-b).map(h => ({
          start: `${String(h).padStart(2,'0')}:00`,
          end: `${String(h+1).padStart(2,'0')}:00`,
          booked: false
        }))
        await supabase.from('mentor_availability').upsert({
          mentor_id: user?.id, mentor_name: profile?.full_name,
          mentor_email: user?.email, date: dateStr, slots, timezone
        }, { onConflict: 'mentor_email,date' })
      }
      await fetchAll()
      alert('Availability saved!')
    } finally { setSaving(false) }
  }

  function prevWeek() { const d = new Date(weekStart); d.setDate(d.getDate()-7); setWeekStart(d) }
  function nextWeek() { const d = new Date(weekStart); d.setDate(d.getDate()+7); setWeekStart(d) }
  function goToday() { const d = new Date(); d.setDate(d.getDate()-d.getDay()); setWeekStart(d) }

  const weekLabel = `${weekDates[0].toLocaleDateString('en-IN',{day:'numeric',month:'short'})} – ${weekDates[6].toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})}`
  const totalSlots = Object.values(selected).reduce((sum,s) => sum + s.size, 0)

  return (
    <div className={embedded ? "avail-wrap avail-embedded" : "avail-wrap"} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}>
      {!embedded && <div className="avail-header">
        <button className="avail-back" onClick={() => navigate('/')}>← Dashboard</button>
        <div>
          <div className="avail-title">My Availability</div>
          <div className="avail-sub">Click or drag to select time slots · Requests shown on calendar</div>
        </div>
        <div className="avail-header-right">
          <select className="avail-tz-select" value={timezone} onChange={e => setTimezone(e.target.value)}>
            {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
          </select>
          <button className="avail-save-btn" onClick={saveAvailability} disabled={saving}>
            {saving ? '⏳ Saving…' : `Save (${totalSlots} slots)`}
          </button>
        </div>
      </div>}
      {embedded && (
        <div className="avail-embedded-toolbar">
          <select className="avail-tz-select" value={timezone} onChange={e => setTimezone(e.target.value)}>
            {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
          </select>
          <button className="avail-save-btn" onClick={saveAvailability} disabled={saving}>
            {saving ? '⏳ Saving…' : `Save (${totalSlots} slots)`}
          </button>
        </div>
      )}

      <div className="avail-week-nav">
        <button className="avail-nav-btn" onClick={prevWeek}>←</button>
        <button className="avail-today-btn" onClick={goToday}>Today</button>
        <div className="avail-week-label">{weekLabel}</div>
        <button className="avail-nav-btn" onClick={nextWeek}>→</button>
      </div>

      <div className="avail-calendar">
        <div className="avail-time-col" />
        {weekDates.map((date, i) => {
          const isPast = date < today
          const isToday = dateKey(date) === dateKey(new Date())
          return (
            <div key={i} className={`avail-day-header ${isPast?'past':''} ${isToday?'today':''}`}>
              <div className="avail-day-name">{DAYS[i]}</div>
              <div className="avail-day-date">{date.getDate()}</div>
              <div className="avail-day-month">{date.toLocaleDateString('en-IN',{month:'short'})}</div>
            </div>
          )
        })}
        {HOURS.map(hour => (
          <React.Fragment key={hour}>
            <div className="avail-time-label">{formatHour(hour)}</div>
            {weekDates.map((date, di) => {
              const dateStr = dateKey(date)
              const now = new Date()
              const slotDateTime = new Date(dateStr + 'T' + String(hour).padStart(2,'0') + ':00:00')
              const isPast = slotDateTime < now
              const isSelected = selected[dateStr]?.has(hour)
              const isSaved = saved[dateStr]?.has(hour)
              const req = requestMap[`${dateStr}:${hour}`]
              const isAccepted = req?.status === 'accepted' && !isPast
              const isPastCompleted = req?.status === 'accepted' && isPast
              const isPending = req?.status === 'pending' || req?.status === 'rescheduled'
              const menteeName = req?.mentee_name
              const menteeInitials = menteeName?.split(' ').map(n=>n[0]).join('').slice(0,2)

              let cellClass = `avail-cell`
              if (isPast) cellClass += ' past'
              if (isSelected) cellClass += ' selected'
              if (isSaved && isSelected) cellClass += ' saved'
              if (isAccepted) cellClass += ' req-accepted'
              if (isPastCompleted) cellClass += ' req-past-completed'
              if (isPending) cellClass += ' req-pending'

              return (
                <div key={di}
                  className={cellClass}
                  onMouseDown={e => !isPast && !req && handleMouseDown(e, dateStr, hour)}
                  onMouseEnter={() => { handleMouseEnter(dateStr, hour); }}
                  onMouseOver={() => req && setTooltip({req, dateStr, hour, di})}
                  onMouseOut={() => setTooltip(null)}
                >
                  {req && (
                    <div className={`avail-req-label ${isAccepted ? 'accepted' : isPastCompleted ? 'past-completed' : 'pending'}`}>
                      <span className="avail-req-initials">{menteeInitials}</span>
                      <span className="avail-req-name">{menteeName?.split(' ')[0]}</span>
                    </div>
                  )}
                </div>
              )
            })}
          </React.Fragment>
        ))}
      </div>

      <div className="avail-legend">
        <span className="avail-legend-item"><span className="avail-legend-dot selected"/>Available</span>
        <span className="avail-legend-item"><span className="avail-legend-dot saved"/>Saved</span>
        <span className="avail-legend-item"><span className="avail-legend-dot req-accepted"/>Accepted Meeting</span>
        <span className="avail-legend-item"><span className="avail-legend-dot req-past-completed"/>Completed Meeting</span>
        <span className="avail-legend-item"><span className="avail-legend-dot req-pending"/>Pending Request</span>
        <span className="avail-legend-item"><span className="avail-legend-dot past"/>Unavailable</span>
      </div>
    </div>
  )
}

import { createClient } from '@supabase/supabase-js'

const s = createClient(
  'https://oglgvkysbnyzqjtllirv.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9nbGd2a3lzYm55enFqdGxsaXJ2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDM0Mzk5MiwiZXhwIjoyMDg5OTE5OTkyfQ.pFroYMhRLpgW8OZTGEyLfYq4fH8WM4Xpz4-d-OA2-I0'
)
const now = new Date(); const today = now.toLocaleDateString('en-CA', {timeZone:'Asia/Kolkata'})
const { error: delError } = await s.from('mentor_availability').delete().lte('date', today)
console.log('Deleted past+today:', delError?.message || 'ok')
const { data: mentors } = await s.from('profiles').select('id, email, full_name').eq('role', 'mentor')
console.log('Mentors:', mentors.length)
function getNextWorkingDays(n) {
  const dates = []
  const d = new Date()
  d.setDate(d.getDate() + 1)
  while (dates.length < n) {
    if (d.getDay() !== 0 && d.getDay() !== 6) dates.push(d.toLocaleDateString('en-CA', {timeZone:'Asia/Kolkata'}))
    d.setDate(d.getDate() + 1)
  }
  return dates
}
const SLOTS = [
  { start: '09:00', end: '10:00' },
  { start: '10:00', end: '11:00' },
  { start: '11:00', end: '12:00' },
  { start: '14:00', end: '15:00' },
  { start: '15:00', end: '16:00' },
]
const dates = getNextWorkingDays(5)
console.log('New dates:', dates)
const rows = []
for (const mentor of mentors) {
  for (const date of dates) {
    rows.push({ mentor_id: mentor.id, mentor_email: mentor.email, mentor_name: mentor.full_name, date, slots: SLOTS.map(s => ({...s, booked: false})), timezone: 'Asia/Kolkata' })
  }
}
for (let i = 0; i < rows.length; i += 500) {
  const { error } = await s.from('mentor_availability').upsert(rows.slice(i, i+500), { onConflict: 'mentor_email,date' })
  if (error) console.error('Error:', error.message)
  process.stdout.write(`\r${Math.min(i+500, rows.length)}/${rows.length}`)
}
console.log('\nDone!')

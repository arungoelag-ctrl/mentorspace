import { createClient } from '@supabase/supabase-js'
import fetch from 'node-fetch'

const s = createClient(
  'https://oglgvkysbnyzqjtllirv.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9nbGd2a3lzYm55enFqdGxsaXJ2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDM0Mzk5MiwiZXhwIjoyMDg5OTE5OTkyfQ.pFroYMhRLpgW8OZTGEyLfYq4fH8WM4Xpz4-d-OA2-I0'
)

const REQUESTS = [
  { id: 'd320a255-f5c4-4616-bc48-85b78446c9fb', mentee: 'Rahul Gupta', mentor: 'arjun.mentor@test.com' },
  { id: '83116dab-0ebc-49a6-8259-73ca662f4ddc', mentee: 'Rahul Gupta', mentor: 'arjun.mentor@test.com' },
  { id: 'b150bc3f-7be9-4d27-9d3c-1c9755bd551f', mentee: 'Deepak Iyer', mentor: 'abhishek.dakhole@experttest.com' },
  { id: '45e12c67-4f82-42c7-b32d-b6ae53863613', mentee: 'Deepak Iyer', mentor: 'abhishek.dakhole@experttest.com' },
  { id: 'ebdbd7f0-47e9-4d8b-a9a1-e6c6ff04ce5d', mentee: 'Deepak Iyer', mentor: 'abhishek.dakhole@experttest.com' },
  { id: '4fef2c39-fa04-40f1-af86-f7eda901bca8', mentee: 'Deepak Iyer', mentor: 'abhishek.dakhole@experttest.com' },
  { id: 'cb6bd2dc-56d8-4668-a644-618eb98e5a62', mentee: 'Deepak Iyer', mentor: 'abhishek.dakhole@experttest.com' },
]

for (const req of REQUESTS) {
  try {
    const res = await fetch(`http://localhost:3001/api/brief-with-context/${encodeURIComponent(req.mentee)}?` + new URLSearchParams({
      mentorEmail: req.mentor, requestId: req.id
    }))
    const data = await res.json()
    if (data.brief) {
      // Insert directly to DB
      const { error } = await s.from('pre_meeting_briefs').upsert({
        mentee_name: req.mentee,
        mentor_email: req.mentor,
        meeting_request_id: req.id,
        brief_text: data.brief.brief_text,
        action_items: data.brief.action_items || [],
        key_questions: data.brief.key_questions || [],
        red_flags: data.brief.red_flags || [],
        focus_areas: data.brief.focus_areas || [],
        progress_summary: data.brief.progress_summary || ''
      }, { onConflict: 'meeting_request_id' })
      console.log(`${error ? '✗ '+error.message : '✓'} ${req.mentee} ${req.id.slice(0,8)}`)
    } else {
      console.log(`✗ No brief returned for ${req.mentee} ${req.id.slice(0,8)}`)
    }
  } catch(e) {
    console.log(`✗ ${req.mentee} ${req.id.slice(0,8)}: ${e.message}`)
  }
}
console.log('Done!')

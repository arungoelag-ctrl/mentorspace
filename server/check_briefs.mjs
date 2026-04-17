import { createClient } from '@supabase/supabase-js'
const s = createClient('https://oglgvkysbnyzqjtllirv.supabase.co','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9nbGd2a3lzYm55enFqdGxsaXJ2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDM0Mzk5MiwiZXhwIjoyMDg5OTE5OTkyfQ.pFroYMhRLpgW8OZTGEyLfYq4fH8WM4Xpz4-d-OA2-I0')
const [{data:reqs},{data:briefs}] = await Promise.all([
  s.from('meeting_requests').select('id,mentee_name,status').eq('status','accepted'),
  s.from('pre_meeting_briefs').select('meeting_request_id').not('meeting_request_id','is',null)
])
const briefIds = new Set(briefs.map(b => b.meeting_request_id))
const missing = reqs.filter(r => !briefIds.has(r.id))
console.log('Missing briefs:', JSON.stringify(missing,null,2))

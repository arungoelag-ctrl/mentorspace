import { createClient } from '@supabase/supabase-js'
const s = createClient('https://oglgvkysbnyzqjtllirv.supabase.co','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9nbGd2a3lzYm55enFqdGxsaXJ2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDM0Mzk5MiwiZXhwIjoyMDg5OTE5OTkyfQ.pFroYMhRLpgW8OZTGEyLfYq4fH8WM4Xpz4-d-OA2-I0')
const {data: sessions} = await s.from('sessions').select('meeting_id,status').eq('status','ended')
console.log('Ended sessions:', sessions?.length)
for (const session of sessions||[]) {
  const {error} = await s.from('meeting_requests').update({status:'completed'}).eq('zoom_meeting_id', session.meeting_id)
  console.log(error ? 'Error: '+error.message : 'Updated: '+session.meeting_id)
}

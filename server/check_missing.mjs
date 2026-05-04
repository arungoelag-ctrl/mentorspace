import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
dotenv.config({ path: './.env' })
dotenv.config({ path: '../client/.env' })

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
const { data } = await supabase
  .from('masterclass_transcripts')
  .select('si_no, session_title, ai_summary, key_topics')
  .eq('status', 'active')
  .order('si_no')

console.log('Total in DB:', data.length)
const missing = data.filter(r => !r.ai_summary || !r.key_topics?.length)
console.log('Missing ai_summary/key_topics:', missing.length)
missing.forEach(r => console.log('  si_no:', r.si_no, '-', r.session_title?.slice(0,50)))

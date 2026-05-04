import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
dotenv.config({ path: './.env' })
dotenv.config({ path: '../client/.env' })

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
const { data } = await supabase.from('masterclass_transcripts').select('si_no,transcript,cc_vtt,chat_log').eq('status','active').order('si_no')

console.log('Total in DB:', data.length)
console.log('Has transcript+cc+chat:', data.filter(r => r.transcript && r.cc_vtt && r.chat_log).length)
console.log('Has transcript+chat:', data.filter(r => r.transcript && r.chat_log).length)
console.log('Has transcript+cc:', data.filter(r => r.transcript && r.cc_vtt).length)
console.log('Has transcript only:', data.filter(r => r.transcript && !r.cc_vtt && !r.chat_log).length)
console.log('Has chat only (no tx):', data.filter(r => !r.transcript && r.chat_log).length)
console.log('Has nothing:', data.filter(r => !r.transcript && !r.cc_vtt && !r.chat_log).length)
console.log('Total with transcript:', data.filter(r => r.transcript).length)
console.log('Total with cc_vtt:', data.filter(r => r.cc_vtt).length)
console.log('Total with chat:', data.filter(r => r.chat_log).length)

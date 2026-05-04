import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
dotenv.config({ path: './.env' })
dotenv.config({ path: '../client/.env' })

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
const { data } = await supabase.from('venture_transcripts').select('cohort, month, company_name, transcript, profile').order('cohort')

console.log('Total in DB:', data.length)
const byCohort = {}
for (const r of data) {
  if (!byCohort[r.cohort]) byCohort[r.cohort] = 0
  byCohort[r.cohort]++
}
for (const [c,n] of Object.entries(byCohort)) console.log(`  ${c}: ${n}`)
console.log('With transcript:', data.filter(r => r.transcript).length)
console.log('With profile:', data.filter(r => r.profile).length)

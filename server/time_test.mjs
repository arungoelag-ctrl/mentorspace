import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
dotenv.config()

const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

console.log('Step 1: Get query embedding from OpenAI...')
let t = Date.now()
const embRes = await fetch('https://api.openai.com/v1/embeddings', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ model: 'text-embedding-3-small', input: 'shoes garments expand goa dehradun' })
})
const embData = await embRes.json()
const queryEmbedding = embData.data[0].embedding
console.log('  OpenAI embedding:', Date.now()-t, 'ms')

console.log('Step 2: pgvector similarity search...')
t = Date.now()
const { data } = await s.rpc('match_mentors_by_embedding', {
  query_embedding: queryEmbedding,
  tiering_filter: ['Accelerate', 'Liftoff', 'Ignite, Liftoff'],
  match_count: 30
})
console.log('  pgvector search:', Date.now()-t, 'ms', '- found', data?.length, 'candidates')

console.log('Step 3: Claude scoring (3 batches of 10 in parallel)...')
t = Date.now()
const res = await fetch('http://localhost:3001/api/match-mentors', {
  method: 'POST',
  headers: {'Content-Type':'application/json'},
  body: JSON.stringify({ tiering:'Accelerate', product:'shoes garments', problemStatement:'expand goa to dehradun', matchCount:10 })
})
await res.json()
console.log('  Full API call:', Date.now()-t, 'ms')

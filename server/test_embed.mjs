import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
dotenv.config()

const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

// Get embedding for query
const embRes = await fetch('https://api.openai.com/v1/embeddings', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ model: 'text-embedding-3-small', input: 'shoes and garments expand business from goa to dehradun geographic expansion retail fashion' })
})
const embData = await embRes.json()
const queryEmbedding = embData.data[0].embedding

const { data, error } = await s.rpc('match_mentors_by_embedding', {
  query_embedding: queryEmbedding,
  tiering_filter: ['Accelerate', 'Liftoff', 'Ignite, Liftoff'],
  match_count: 10
})

console.log('Error:', error?.message)
console.log('Results:', data?.length)

// Get names for the IDs
if (data?.length) {
  const ids = data.map(d => d.id)
  const { data: profiles } = await s.from('profiles').select('id, full_name, tiering').in('id', ids)
  data.forEach(d => {
    const p = profiles?.find(p => p.id === d.id)
    console.log(`  ${p?.full_name} (${p?.tiering}) - similarity: ${d.similarity?.toFixed(3)}`)
  })
}

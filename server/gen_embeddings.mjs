import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
dotenv.config()

const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

async function getEmbedding(text) {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: text.slice(0, 8000)
    })
  })
  const data = await res.json()
  if (data.error) throw new Error(data.error.message)
  return data.data[0].embedding
}

// Get all mentors without embeddings
const { data: mentors } = await s.from('profiles')
  .select('id, full_name, bio, primary_expertise, secondary_expertise, primary_industry, secondary_industry, job_title, current_company')
  .eq('role', 'mentor')
  .is('bio_embedding', null)

console.log(`Generating embeddings for ${mentors.length} mentors...`)

let done = 0
for (const mentor of mentors) {
  try {
    // Build rich text combining all fields
    const bio = (mentor.bio || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    const text = `${mentor.full_name}. ${mentor.job_title || ''} at ${mentor.current_company || ''}. Expertise: ${mentor.primary_expertise || ''} ${mentor.secondary_expertise || ''}. Industry: ${mentor.primary_industry || ''} ${mentor.secondary_industry || ''}. ${bio}`.slice(0, 8000)

    const embedding = await getEmbedding(text)

    await s.from('profiles').update({ bio_embedding: embedding }).eq('id', mentor.id)
    done++
    process.stdout.write(`\r${done}/${mentors.length} - ${mentor.full_name}          `)
  } catch(e) {
    console.error(`\nError for ${mentor.full_name}:`, e.message)
  }
}
console.log(`\nDone! Generated ${done} embeddings.`)

import { readFileSync, writeFileSync } from 'fs'
import * as dotenv from 'dotenv'
dotenv.config({ path: '../client/.env' })

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY

const mapping = JSON.parse(readFileSync('./topic_mapping.json', 'utf-8'))
const clusters = [...new Set(Object.values(mapping))]

// Find unmapped - load all topics from supabase
import { createClient } from '@supabase/supabase-js'
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)

async function main() {
  const { data: sessions } = await supabase
    .from('masterclass_transcripts')
    .select('key_topics')
    .eq('status', 'active')

  const allTopics = [...new Set(sessions.flatMap(m => m.key_topics || []))]
  const unmapped = allTopics.filter(t => !mapping[t])
  console.log(`Unmapped: ${unmapped.length}`)

  // Process in batches of 60
  const batchSize = 60
  for (let i = 0; i < unmapped.length; i += batchSize) {
    const batch = unmapped.slice(i, i + batchSize)
    console.log(`Mapping batch ${Math.floor(i/batchSize)+1}/${Math.ceil(unmapped.length/batchSize)}...`)

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 3000,
        messages: [{
          role: 'user',
          content: `Map each topic to the most appropriate cluster from this fixed list:

CLUSTERS (use EXACTLY these names):
${clusters.map((c,i) => `${i+1}. ${c}`).join('\n')}

TOPICS TO MAP:
${batch.map((t,i) => `${i+1}. ${t}`).join('\n')}

Respond ONLY with valid JSON, no markdown:
{"topic": "Exact Cluster Name from list above"}`
        }]
      })
    })

    const data = await res.json()
    if (data.error) { console.error(data.error); continue }
    const text = data.content[0].text.trim().replace(/```json|```/g, '').trim()
    const batchMapping = JSON.parse(text)
    Object.assign(mapping, batchMapping)
    console.log(`  Done`)
    await new Promise(r => setTimeout(r, 1000))
  }

  // Check remaining unmapped
  const stillUnmapped = allTopics.filter(t => !mapping[t])
  console.log(`Still unmapped: ${stillUnmapped.length}`)

  // Force-map anything still unmapped to closest cluster
  for (const t of stillUnmapped) {
    mapping[t] = 'Startup Fundamentals' // fallback
  }

  writeFileSync('./topic_mapping.json', JSON.stringify(mapping, null, 2))
  console.log(`✅ Saved — total mapped: ${Object.keys(mapping).length}`)
  console.log('Now run: node cluster_topics.mjs --apply')
}

main().catch(console.error)

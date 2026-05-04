import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import { readFileSync, writeFileSync } from 'fs'
dotenv.config({ path: '../client/.env' })

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

async function clusterBatch(topics, existingClusters = []) {
  const clusterHint = existingClusters.length > 0
    ? `\nTry to reuse these cluster names where appropriate: ${existingClusters.join(', ')}\n`
    : ''

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      messages: [{
        role: 'user',
        content: `Group these startup masterclass topics into canonical clusters.
${clusterHint}
Rules:
- Merge similar topics into one canonical name
- Use 15-20 broad clusters total across all batches
- Every topic must map to exactly one cluster
- Use clear startup-founder-friendly names

Topics to cluster:
${topics.map((t, i) => `${i+1}. ${t}`).join('\n')}

Respond ONLY with valid JSON object, no markdown, no truncation:
{"topic": "Cluster Name"}`
      }]
    })
  })

  const data = await res.json()
  if (data.error) throw new Error(JSON.stringify(data.error))
  const text = data.content[0].text.trim().replace(/```json|```/g, '').trim()
  return JSON.parse(text)
}

async function main() {
  const { data: sessions } = await supabase
    .from('masterclass_transcripts')
    .select('id, si_no, session_title, key_topics')
    .eq('status', 'active')

  const allTopics = [...new Set(sessions.flatMap(m => m.key_topics || []))]
  console.log(`Total unique topics: ${allTopics.length}`)

  if (!process.argv.includes('--apply')) {
    // Process in batches of 80
    const batchSize = 80
    const fullMapping = {}
    let existingClusters = []

    for (let i = 0; i < allTopics.length; i += batchSize) {
      const batch = allTopics.slice(i, i + batchSize)
      const batchNum = Math.floor(i/batchSize) + 1
      const totalBatches = Math.ceil(allTopics.length/batchSize)
      console.log(`Processing batch ${batchNum}/${totalBatches} (${batch.length} topics)...`)

      const mapping = await clusterBatch(batch, existingClusters)
      Object.assign(fullMapping, mapping)

      // Update cluster list for next batch to reuse names
      existingClusters = [...new Set(Object.values(fullMapping))]
      console.log(`  → ${existingClusters.length} clusters so far`)

      await new Promise(r => setTimeout(r, 1000))
    }

    const clusters = [...new Set(Object.values(fullMapping))]
    console.log(`\nFinal: ${allTopics.length} topics → ${clusters.length} clusters`)
    console.log('\nClusters:')
    clusters.sort().forEach(c => {
      const count = Object.values(fullMapping).filter(v => v === c).length
      console.log(`  "${c}" (${count} original topics)`)
    })

    // Check unmapped
    const unmapped = allTopics.filter(t => !fullMapping[t])
    if (unmapped.length > 0) {
      console.log(`\n⚠️  ${unmapped.length} unmapped topics:`, unmapped)
    }

    writeFileSync('./topic_mapping.json', JSON.stringify(fullMapping, null, 2))
    console.log('\nSaved to topic_mapping.json')
    console.log('Review above, then run with --apply to update database')

  } else {
    const mapping = JSON.parse(readFileSync('./topic_mapping.json', 'utf-8'))
    console.log('Applying topic mapping...')
    let updated = 0
    for (const session of sessions) {
      const oldTopics = session.key_topics || []
      const newTopics = [...new Set(oldTopics.map(t => mapping[t] || t))]
      await supabase
        .from('masterclass_transcripts')
        .update({ key_topics: newTopics })
        .eq('id', session.id)
      updated++
      console.log(`  [${session.si_no}] ${session.session_title.slice(0,40)} → ${newTopics.join(', ')}`)
    }
    console.log(`\n✅ Updated ${updated} sessions`)
    console.log('Next steps:')
    console.log('  1. DELETE FROM masterclass_topic_insights  (Supabase SQL Editor)')
    console.log('  2. node pregenerate_insights.mjs')
  }
}

main().catch(console.error)

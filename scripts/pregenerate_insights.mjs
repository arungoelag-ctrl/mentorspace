import { createClient } from '@supabase/supabase-js'
import fetch from 'node-fetch'
import * as dotenv from 'dotenv'
dotenv.config({ path: './client/.env' })

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY
const SERVER_URL = 'http://localhost:3001'

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

async function main() {
  const { data: masterclasses } = await supabase
    .from('masterclass_transcripts')
    .select('id, si_no, session_title, speaker, key_topics')
    .eq('status', 'active')

  console.log(`Loaded ${masterclasses.length} sessions`)

  const allTopics = [...new Set(masterclasses.flatMap(m => m.key_topics || []))]
  console.log(`Found ${allTopics.length} unique topics`)

  const { data: cached } = await supabase
    .from('masterclass_topic_insights')
    .select('topic')
  const cachedTopics = new Set((cached || []).map(c => c.topic))
  const todo = allTopics.filter(t => !cachedTopics.has(t))
  console.log(`${cachedTopics.size} already cached, ${todo.length} to generate\n`)

  let success = 0
  let failed = 0

  for (const topic of todo) {
    const matchingSessions = masterclasses.filter(m => (m.key_topics || []).includes(topic))
    console.log(`[${todo.indexOf(topic)+1}/${todo.length}] "${topic}" — ${matchingSessions.length} session(s)`)

    const { data: fullRecords } = await supabase
      .from('masterclass_transcripts')
      .select('id, session_title, speaker, transcript, cc_vtt, chat_log')
      .in('id', matchingSessions.map(m => m.id))

    if (!fullRecords?.length) {
      console.log(`  ⚠️  No records found, skipping`)
      failed++
      continue
    }

    try {
      const res = await fetch(`${SERVER_URL}/api/masterclass/topic-insights`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic,
          transcripts: fullRecords.map(r => ({
            session_title: r.session_title,
            speaker: r.speaker,
            transcript: r.transcript,
            cc_vtt: r.cc_vtt,
            chat_log: r.chat_log
          }))
        })
      })

      const data = await res.json()
      if (!data.insights) throw new Error(data.error || 'No insights returned')

      await supabase.from('masterclass_topic_insights').upsert({
        topic,
        insights: data.insights,
        session_ids: fullRecords.map(r => r.id),
        session_count: data.sessionCount
      }, { onConflict: 'topic' })

      console.log(`  ✅ ${data.insights.length} insights cached`)
      success++

      await new Promise(r => setTimeout(r, 1000))

    } catch(e) {
      console.log(`  ❌ Error: ${e.message}`)
      failed++
    }
  }

  console.log(`\n${'='.repeat(50)}`)
  console.log(`DONE — ${success} generated, ${failed} failed, ${cachedTopics.size} already cached`)
}

main().catch(console.error)

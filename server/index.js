import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import fetch from 'node-fetch';

const app = express();
app.use(cors({ origin: ['http://localhost:5173', 'http://localhost:3000'] }));
app.use(express.json());

const {
  ZOOM_CLIENT_ID,
  ZOOM_CLIENT_SECRET,
  ZOOM_SDK_KEY,
  ZOOM_SDK_SECRET,
  ZOOM_ACCOUNT_ID,
} = process.env;

// ─── GET ZOOM OAUTH ACCESS TOKEN (Server-to-Server) ───────────────────────────
async function getAccessToken() {
  const creds = Buffer.from(`${ZOOM_CLIENT_ID}:${ZOOM_CLIENT_SECRET}`).toString('base64');
  const res = await fetch(
    `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${ZOOM_ACCOUNT_ID}`,
    {
      method: 'POST',
      headers: { Authorization: `Basic ${creds}` },
    }
  );
  const data = await res.json();
  if (!data.access_token) {
    console.error('Token error:', data);
    throw new Error(data.reason || 'Failed to get Zoom token');
  }
  return data.access_token;
}

// ─── HEALTH CHECK ──────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// ─── CREATE A ZOOM MEETING ─────────────────────────────────────────────────────
app.post('/api/meetings/create', async (req, res) => {
  try {
    const { topic, duration = 60, mentorName = 'Mentor' } = req.body;
    const token = await getAccessToken();

    const meetRes = await fetch('https://api.zoom.us/v2/users/me/meetings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        topic: topic || `MentorSpace: ${mentorName} Session`,
        type: 1, // Instant meeting
        duration,
        settings: {
          join_before_host: true,
          waiting_room: false,
          mute_upon_entry: false,
          participant_video: true,
          host_video: true,
          auto_recording: 'none',
        },
      }),
    });

    const meeting = await meetRes.json();
    if (meeting.code) {
      console.error('Zoom API error:', meeting);
      return res.status(400).json({ error: meeting.message, code: meeting.code });
    }

    console.log('✅ Meeting created:', meeting.id, meeting.join_url);
    res.json({
      meetingId: String(meeting.id),
      meetingNumber: String(meeting.id),
      joinUrl: meeting.join_url,
      startUrl: meeting.start_url,
      password: meeting.password || '',
      topic: meeting.topic,
    });
  } catch (err) {
    console.error('Create meeting error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET ZOOM SDK SIGNATURE ────────────────────────────────────────────────────
// role: 0 = mentee (attendee), 1 = mentor (host)
app.post('/api/zoom/signature', (req, res) => {
  try {
    const { meetingNumber, role = 0 } = req.body;
    if (!meetingNumber) return res.status(400).json({ error: 'meetingNumber required' });

    const iat = Math.round(Date.now() / 1000) - 30;
    const exp = iat + 60 * 60 * 2; // 2 hours

    const payload = {
      sdkKey: ZOOM_SDK_KEY,
      appKey: ZOOM_SDK_KEY,
      mn: meetingNumber,
      role: Number(role),
      iat,
      exp,
      tokenExp: exp,
    };

    const signature = jwt.sign(payload, ZOOM_SDK_SECRET, {
      algorithm: 'HS256',
      header: { alg: 'HS256', typ: 'JWT' },
    });

    console.log(`✅ Signature generated for meeting ${meetingNumber} role=${role}`);
    res.json({ signature, sdkKey: ZOOM_SDK_KEY });
  } catch (err) {
    console.error('Signature error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── LIST MEETINGS ─────────────────────────────────────────────────────────────
app.get('/api/meetings', async (req, res) => {
  try {
    const token = await getAccessToken();
    const r = await fetch('https://api.zoom.us/v2/users/me/meetings?type=live', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await r.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET MY ZOOM USER ──────────────────────────────────────────────────────────
app.get('/api/zoom/me', async (req, res) => {
  try {
    const token = await getAccessToken();
    const r = await fetch('https://api.zoom.us/v2/users/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    res.json(await r.json());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ─── GENERATE MARKET INTELLIGENCE ────────────────────────────────────────────
app.post('/api/intelligence/generate', async (req, res) => {
  try {
    const { summaries, sessionCount } = req.body
    const text = await callClaude(`You are a market intelligence analyst for Wadhwani Foundation, which runs mentoring programs for entrepreneurs and businesses across India and emerging markets.

You have access to summaries from ${sessionCount} mentoring sessions. Ignore sessions that are purely technical tests with zero business content.

Session summaries:
${summaries}

From the real business content above, generate exactly 8 market intelligence cards. Spread them across DIFFERENT sectors and themes - do not generate more than 2 cards for any single sector. Cover the full range of businesses and topics discussed: healthcare, export, manufacturing, GTM strategy, market expansion, scaling, fundraising, distribution - whatever is present in the data.

Each card must be about a DIFFERENT insight. Vary the sectors, geographies and themes across all 8 cards.

Respond ONLY with valid JSON array:
[
  {
    "title": "Concise intelligence title",
    "summary": "2-3 sentence overview of the insight",
    "key_insight": "Single most important takeaway in one sentence",
    "sector": "One of: Manufacturing/SaaS/Fintech/Healthcare/FMCG/Agritech/EV/E-commerce/Export/Retail/EdTech/AI-ML/Climate Tech/Logistics/General",
    "geography": "One of: India/Southeast Asia/Europe/USA/Middle East/Africa/Latin America/Global",
    "theme": "One of: Market Entry/GTM Strategy/Fundraising/Competition/Product/Export/Scaling/Regulation/Distribution/General",
    "confidence": "4.5",
    "opportunities": ["opportunity 1", "opportunity 2", "opportunity 3"],
    "challenges": ["challenge 1", "challenge 2"],
    "recommendations": ["recommendation 1", "recommendation 2", "recommendation 3"],
    "session_count": 1
  }
]`)

    const clean = text.trim().replace(/^```json\n?/,'').replace(/^```\n?/,'').replace(/\n?```$/,'').trim()
    const cards = JSON.parse(clean)
    const dated = cards.map(card => ({ ...card, created_at: new Date().toISOString() }))
    res.json({ cards: dated })
  } catch (err) {
    console.error('Intelligence generate error:', err)
    res.status(500).json({ error: err.message })
  }
})


// ─── ENHANCED BRIEF WITH CONTEXT ─────────────────────────────────────────────
app.get('/api/brief-with-context/:menteeName', async (req, res) => {
  try {
    const menteeName = decodeURIComponent(req.params.menteeName)
    const { companyName, companyUrl, stage, goal, mentorEmail, requestId } = req.query

    // Get past sessions filtered by both mentee and mentor
    let sessionQuery = supabase
      .from('sessions').select('*')
      .eq('mentee_name', menteeName)
      .eq('status', 'ended')
      .order('ended_at', { ascending: false })
    if (mentorEmail) sessionQuery = sessionQuery.eq('mentor_email', mentorEmail)
    const { data: sessions } = await sessionQuery

    const sessionIds = (sessions || []).map(s => s.meeting_id)

    // Get final insights for those sessions
    const { data: insights } = sessionIds.length > 0
      ? await supabase.from('session_insights').select('*')
          .in('session_id', sessionIds)
          .eq('is_final', true)
          .order('snapshot_time', { ascending: false })
      : { data: [] }

    // Get recent transcripts (last 3 sessions)
    const { data: transcripts } = sessionIds.length > 0
      ? await supabase.from('session_transcripts').select('*')
          .in('session_id', sessionIds.slice(0, 3))
      : { data: [] }

    // Build session history text
    const sessionHistory = (insights || []).map((ins, i) => {
      const session = (sessions || []).find(s => s.meeting_id === ins.session_id)
      const date = session?.ended_at
        ? new Date(session.ended_at).toLocaleDateString('en-IN', {day:'numeric',month:'short',year:'numeric'})
        : 'Unknown date'
      return `SESSION ${i+1} — ${date} (Topic: ${session?.topic || 'General'})
Summary: ${ins.summary}
Action items / questions flagged: ${(ins.questions || []).join(' | ')}`
    }).join('\n\n')

    // Build transcript excerpts
    const transcriptExcerpts = (transcripts || []).map((t, i) => {
      const lines = (t.lines || []).slice(-20)
      return `--- Transcript excerpt (session ${i+1}) ---\n` + lines.map(l => `${l.name}: ${l.text}`).join('\n')
    }).join('\n\n')

    const hasPastSessions = (sessions || []).length > 0

    const prompt = `You are preparing a pre-meeting brief for a mentor at Wadhwani Foundation about their upcoming session with a mentee.

=== MENTEE: ${menteeName} ===
Past sessions with this mentor: ${hasPastSessions ? sessions.length : 0}

=== UPCOMING MEETING REQUEST ===
Company: ${companyName || 'Not provided'}
Company URL: ${companyUrl || 'Not provided'}
Stage: ${stage || 'Not provided'}
What mentee wants to achieve: ${goal || 'Not provided'}

${hasPastSessions ? `=== PAST SESSION HISTORY ===
${sessionHistory}

=== RECENT TRANSCRIPT EXCERPTS ===
${transcriptExcerpts || 'No transcript data available.'}` : '=== NO PAST SESSIONS ===\nThis is the first meeting with this mentee.'}

Generate a thorough pre-meeting brief. Rules:
- action_items: scan ALL past session transcripts and summaries for anything the mentee said they would do, or the mentor asked them to do, that has NOT been confirmed completed. Be specific. If no past sessions, return [].
- red_flags: note inconsistencies between sessions, unrealistic claims, or concerns from the meeting request itself. If none, return [].
- brief_text: 3 paragraphs. First: who this mentee is and their journey so far (or intro if first session). Second: what they want from this meeting and your read on it. Third: recommended focus for the session.
- key_questions: 5 sharp, specific questions tailored to their stage (${stage}) and goal. Not generic.
- focus_areas: 3 specific things to cover in this session.
- progress_summary: 1-2 sentences on overall trajectory.

Respond ONLY with valid JSON, no markdown fences:
{
  "brief_text": "...",
  "action_items": ["specific outstanding action item 1", "item 2"],
  "key_questions": ["sharp question 1", "question 2", "question 3", "question 4", "question 5"],
  "progress_summary": "1-2 sentences",
  "focus_areas": ["area 1", "area 2", "area 3"],
  "red_flags": ["concern 1 if any"]
}`

    const text = await callClaude(prompt)
    const clean = text.trim().replace(/^```json\n?/,'').replace(/^```\n?/,'').replace(/\n?```$/,'').trim()
    const parsed = JSON.parse(clean)

    // Save to DB (upsert by mentee+mentor so it overwrites stale briefs)
    try {
      await supabase.from('pre_meeting_briefs').upsert({
        mentee_name: menteeName,
        mentor_email: mentorEmail || null,
        meeting_request_id: requestId || null,
        brief_text: parsed.brief_text,
        action_items: parsed.action_items,
        key_questions: parsed.key_questions,
        red_flags: parsed.red_flags,
        focus_areas: parsed.focus_areas,
        progress_summary: parsed.progress_summary,
        company_stage: stage || null,
        created_at: new Date()
      }, { onConflict: 'mentee_name,mentor_email' })
    } catch(e) { console.log('Brief save skipped:', e.message) }

    res.json({
      brief: { ...parsed, created_at: new Date() },
      sessions: sessions || [],
      sessionCount: (sessions || []).length
    })
  } catch (err) {
    console.error('Brief with context error:', err)
    res.status(500).json({ error: err.message })
  }
})

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`\n🚀 MentorSpace Server running on http://localhost:${PORT}`);
  console.log(`   SDK Key: ${ZOOM_SDK_KEY?.slice(0, 8)}...`);
  console.log(`   Account: ${ZOOM_ACCOUNT_ID}\n`);
});

// ─── SUPABASE CLIENT ──────────────────────────────────────────────────────────
import { createClient } from '@supabase/supabase-js'
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

// ─── ANTHROPIC HELPER ─────────────────────────────────────────────────────────
async function callClaude(prompt) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }]
    })
  })
  const data = await res.json()
  if (data.error) throw new Error(data.error.message)
  return data.content[0].text
}

// ─── SAVE SESSION TO DB ───────────────────────────────────────────────────────
app.post('/api/sessions/save', async (req, res) => {
  try {
    const { meetingId, topic, mentorName, menteeName, menteeEmail, mentorEmail } = req.body

    // If mentor info is missing, check if session already exists with mentor info
    let finalMentorName = mentorName
    let finalMentorEmail = mentorEmail
    if (!mentorName) {
      const { data: existing } = await supabase
        .from('sessions').select('mentor_name,mentor_email')
        .eq('meeting_id', meetingId).single()
      if (existing?.mentor_name) {
        finalMentorName = existing.mentor_name
        finalMentorEmail = existing.mentor_email
      }
    }

    const { data, error } = await supabase
      .from('sessions')
      .upsert({
        meeting_id: meetingId,
        topic: topic || undefined,
        mentor_name: finalMentorName || undefined,
        mentee_name: menteeName || undefined,
        mentee_email: menteeEmail || undefined,
        mentor_email: finalMentorEmail || undefined,
        status: 'active'
      }, { onConflict: 'meeting_id' })
      .select()
    if (error) throw error

    // Upsert mentee profile
    await supabase.from('mentee_profiles').upsert({
      mentee_name: menteeName,
      mentee_email: menteeEmail,
      mentor_name: mentorName,
    }, { onConflict: 'mentee_email' })

    res.json({ ok: true, session: data[0] })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── SAVE TRANSCRIPT SNAPSHOT ─────────────────────────────────────────────────
app.post('/api/sessions/:meetingId/transcript/save', async (req, res) => {
  try {
    const { meetingId } = req.params
    // Handle both JSON and sendBeacon (text/plain) requests
    let body = req.body
    if (typeof body === 'string') {
      try { body = JSON.parse(body) } catch(e) {}
    }
    const { lines } = body
    const { error } = await supabase
      .from('session_transcripts')
      .upsert({ session_id: meetingId, lines, updated_at: new Date() }, { onConflict: 'session_id' })
    if (error) throw error
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── SAVE INSIGHT SNAPSHOT ────────────────────────────────────────────────────
app.post('/api/sessions/:meetingId/insights/save', async (req, res) => {
  try {
    const { meetingId } = req.params
    const { summary, questions, transcriptLength, isFinal } = req.body
    const { data, error } = await supabase
      .from('session_insights')
      .insert({
        session_id: meetingId,
        summary, questions,
        transcript_length: transcriptLength,
        is_final: isFinal || false
      })
      .select()
    if (error) throw error
    res.json({ ok: true, insight: data[0] })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── END MEETING - fetch final transcript + generate final summary ─────────────
app.post('/api/sessions/:meetingId/end', async (req, res) => {
  try {
    const { meetingId } = req.params
    const { transcript, topic, mentorName, menteeName } = req.body

    // Mark session ended
    await supabase.from('sessions').update({
      ended_at: new Date(), status: 'ended'
    }).eq('meeting_id', meetingId)

    // Save final transcript
    if (transcript && transcript.length > 0) {
      await supabase.from('session_transcripts')
        .upsert({ session_id: meetingId, lines: transcript, updated_at: new Date() }, { onConflict: 'session_id' })
    }

    // Try to get Zoom recording transcript too
    let zoomTranscript = []
    try {
      const token = await getAccessToken()
      const r = await fetch(`https://api.zoom.us/v2/meetings/${meetingId}/recordings`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const recordings = await r.json()
      const vttFile = (recordings.recording_files || []).find(f => f.file_type === 'TRANSCRIPT' || f.file_type === 'VTT')
      if (vttFile) {
        const vttRes = await fetch(vttFile.download_url + `?access_token=${token}`)
        const vttText = await vttRes.text()
        const blocks = vttText.split('\n\n')
        for (const block of blocks) {
          const lines = block.trim().split('\n')
          if (lines.length >= 3) {
            const textLine = lines.slice(2).join(' ')
            const speakerMatch = textLine.match(/^<v ([^>]+)>(.+)/)
            if (speakerMatch) {
              zoomTranscript.push({ name: speakerMatch[1], text: speakerMatch[2].trim(), time: lines[1] })
            }
          }
        }
      }
    } catch (e) {
      console.log('Could not fetch Zoom recording transcript:', e.message)
    }

    // Use best available transcript
    const finalTranscript = zoomTranscript.length > 0 ? zoomTranscript : (transcript || [])
    const transcriptText = finalTranscript.map(l => `${l.name}: ${l.text}`).join('\n')

    // Generate final AI summary
    let finalSummary = null
    if (transcriptText.length > 10 || finalTranscript.length > 0) {
      const prompt = `You are an AI assistant summarizing a mentoring session.

Mentor: ${mentorName}
Mentee: ${menteeName}
Topic: ${topic}

Full session transcript:
${transcriptText}

Generate a comprehensive session summary in JSON:
{
  "summary": "3-5 sentence overview of what was covered",
  "key_learnings": ["learning 1", "learning 2", "learning 3"],
  "action_items": ["action 1", "action 2"],
  "questions_for_next": ["question to explore next session 1", "question 2", "question 3"],
  "progress_notes": "1-2 sentences on mentee progress"
}`
      const text = await callClaude(prompt)
      const cleanText = text.trim().replace(/^```json\n?/,'').replace(/^```\n?/,'').replace(/\n?```$/,'').trim()
      finalSummary = JSON.parse(cleanText)

      // Save final insight
      await supabase.from('session_insights').insert({
        session_id: meetingId,
        summary: finalSummary.summary,
        questions: finalSummary.questions_for_next,
        transcript_length: finalTranscript.length,
        is_final: true
      })

      // Update mentee profile
      await supabase.from('mentee_profiles')
        .update({ total_sessions: supabase.rpc('increment', { x: 1 }), updated_at: new Date() })
        .eq('mentee_name', menteeName)
    }

    res.json({ ok: true, finalSummary, transcriptLines: finalTranscript.length })
  } catch (err) {
    console.error('End session error:', err)
    res.status(500).json({ error: err.message })
  }
})

// ─── GET PRE-MEETING BRIEF ────────────────────────────────────────────────────
app.get('/api/brief/:menteeName', async (req, res) => {
  try {
    const { menteeName } = req.params
    const decodedName = decodeURIComponent(menteeName)

    // Get all past sessions for this mentee
    const { data: sessions } = await supabase
      .from('sessions')
      .select('*')
      .eq('mentee_name', decodedName)
      .eq('status', 'ended')
      .order('ended_at', { ascending: false })
      .limit(10)

    // Get final insights directly by mentee name via sessions
    // Use all sessions (even those without mentor_name) to find insights
    const allMenteeSessions = sessions || []
    
    // Also get any sessions we might have missed
    const { data: allSessions } = await supabase
      .from('sessions')
      .select('*')
      .eq('mentee_name', decodedName)
      .eq('status', 'ended')
      .order('ended_at', { ascending: false })

    const combinedSessions = allSessions || allMenteeSessions
    
    if (!combinedSessions || combinedSessions.length === 0) {
      return res.json({ brief: null, message: 'No previous sessions found for this mentee.' })
    }

    const sessionIds = combinedSessions.map(s => s.meeting_id)
    const { data: insights } = await supabase
      .from('session_insights')
      .select('*')
      .in('session_id', sessionIds)
      .eq('is_final', true)
      .order('snapshot_time', { ascending: false })

    // Get existing brief if recent (within 24hrs)
    const { data: existingBrief } = await supabase
      .from('pre_meeting_briefs')
      .select('*')
      .eq('mentee_name', decodedName)
      .order('created_at', { ascending: false })
      .limit(1)

    if (existingBrief && existingBrief.length > 0) {
      const brief = existingBrief[0]
      const ageHours = (Date.now() - new Date(brief.created_at)) / 3600000
      if (ageHours < 24) {
        return res.json({ brief, sessions, fresh: false })
      }
    }

    // Generate new brief
    const sessionSummaries = (insights || []).map((ins, i) => {
      const session = sessions.find(s => s.meeting_id === ins.session_id)
      return `Session ${i + 1} (${session?.topic || 'General'}, ${new Date(ins.snapshot_time).toLocaleDateString()}):
Summary: ${ins.summary}
Questions for next: ${(ins.questions || []).join(', ')}`
    }).join('\n\n')

    if (!sessionSummaries) {
      return res.json({ brief: null, message: 'No completed session insights found yet.' })
    }

    const prompt = `You are preparing a pre-meeting brief for a mentor about their mentee.

Mentee: ${decodedName}
Number of past sessions: ${sessions.length}

Past session insights:
${sessionSummaries}

Generate a pre-meeting brief in JSON:
{
  "brief_text": "2-3 paragraph overview of this mentee's journey, progress, and where they are",
  "key_questions": ["important question to ask 1", "question 2", "question 3", "question 4", "question 5"],
  "progress_summary": "1-2 sentences on overall progress",
  "focus_areas": ["area to focus on 1", "area 2", "area 3"]
}`

    const text = await callClaude(prompt)
    const cleanText2 = text.trim().replace(/^```json\n?/,'').replace(/^```\n?/,'').replace(/\n?```$/,'').trim()
    const parsed = JSON.parse(cleanText2)

    // Save brief
    const { data: newBrief } = await supabase
      .from('pre_meeting_briefs')
      .insert({
        mentee_name: decodedName,
        brief_text: parsed.brief_text,
        key_questions: parsed.key_questions,
        progress_summary: parsed.progress_summary,
        created_at: new Date()
      })
      .select()

    res.json({ brief: { ...parsed, created_at: new Date() }, sessions, fresh: true })
  } catch (err) {
    console.error('Brief error:', err)
    res.status(500).json({ error: err.message })
  }
})

// ─── GET MENTEE HISTORY ───────────────────────────────────────────────────────
app.get('/api/mentee/:menteeName/history', async (req, res) => {
  try {
    const name = decodeURIComponent(req.params.menteeName)
    const { data: sessions } = await supabase
      .from('sessions')
      .select('*')
      .eq('mentee_name', name)
      .order('started_at', { ascending: false })

    const { data: insights } = await supabase
      .from('session_insights')
      .select('*')
      .in('session_id', (sessions || []).map(s => s.meeting_id))
      .eq('is_final', true)
      .order('snapshot_time', { ascending: false })

    res.json({ sessions: sessions || [], insights: insights || [] })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── GET SESSION INSIGHTS ────────────────────────────────────────────────────
app.get('/api/sessions/:meetingId/insights', async (req, res) => {
  try {
    const { meetingId } = req.params
    const { data, error } = await supabase
      .from('session_insights')
      .select('*')
      .eq('session_id', meetingId)
      .eq('is_final', false)
      .order('snapshot_time', { ascending: true })
    if (error) throw error
    res.json({ insights: data || [] })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── GET SESSION INSIGHTS ────────────────────────────────────────────────────
app.get('/api/sessions/:meetingId/insights', async (req, res) => {
  try {
    const { meetingId } = req.params
    const { data, error } = await supabase
      .from('session_insights')
      .select('*')
      .eq('session_id', meetingId)
      .eq('is_final', false)
      .order('snapshot_time', { ascending: true })
    if (error) throw error
    res.json({ insights: data || [] })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── AI INSIGHTS ──────────────────────────────────────────────────────────────
app.post('/api/insights', async (req, res) => {
  try {
    const { transcript, topic } = req.body
    if (!transcript || transcript.length === 0) {
      return res.status(400).json({ error: 'No transcript provided' })
    }
    const transcriptText = transcript.map(l => `${l.name}: ${l.text}`).join('\n')
    const isIncremental = req.body.sinceSnapshot
    const text = await callClaude(`You are an AI assistant helping a mentor during a mentoring session.

Session topic: ${topic || 'General mentoring session'}

${isIncremental ? 'New conversation since last snapshot:' : 'Live transcript so far:'}
${transcriptText}

Provide:
1. A concise 3-4 sentence summary of ${isIncremental ? 'what was discussed in THIS segment' : 'what has been discussed'}
2. Five specific follow-up questions the mentor should ask next based on this segment

Respond ONLY with valid JSON, no markdown:
{"summary": "...", "questions": ["q1", "q2", "q3", "q4", "q5"]}`)

    const cleanText2 = text.trim().replace(/^```json\n?/,'').replace(/^```\n?/,'').replace(/\n?```$/,'').trim()
    const parsed = JSON.parse(cleanText2)
    res.json(parsed)
  } catch (err) {
    console.error('Insights error:', err)
    res.status(500).json({ error: err.message })
  }
})

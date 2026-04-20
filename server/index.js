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
    const { topic, duration = 60, mentorName = 'Mentor', meetingType = 1, startTime = null } = req.body;
    const token = await getAccessToken();

    const meetRes = await fetch('https://api.zoom.us/v2/users/me/meetings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        topic: topic || `MentorSpace: ${mentorName} Session`,
        type: meetingType,
        ...(startTime ? { start_time: startTime, timezone: 'Asia/Kolkata' } : meetingType === 2 ? { start_time: new Date(Date.now() + 60000).toISOString(), timezone: 'Asia/Kolkata' } : {}),
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
    const { companyName, companyUrl, stage, goal, mentorEmail, requestId, product, location, state, revenueLakhs, employeeCount, theme, companyInfo } = req.query

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
Product/Service: ${product || 'Not provided'}
Location: ${location ? location + (state ? ', ' + state : '') : 'Not provided'}
Revenue: ${revenueLakhs ? '₹' + revenueLakhs + ' lakhs/year' : 'Not provided'}
Employees: ${employeeCount || 'Not provided'}
Theme/Focus: ${theme || 'Not provided'}
Company Background: ${companyInfo || 'Not provided'}
Program Stage: ${stage || 'Not provided'}
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
    let clean = text.trim().replace(/^```json\n?/,'').replace(/^```\n?/,'').replace(/\n?```$/,'').trim()
    // Fix common JSON issues - truncated strings, special chars
    clean = clean.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ' ')
    let parsed
    try {
      parsed = JSON.parse(clean)
    } catch(e) {
      // Try to extract partial JSON
      const match = clean.match(/\{[\s\S]*/)
      if (match) {
        try { parsed = JSON.parse(match[0] + '"}') } catch(e2) {
          parsed = { brief_text: 'Brief generation failed. Please try again.', action_items: [], key_questions: [], red_flags: [], focus_areas: [], progress_summary: '' }
        }
      } else {
        parsed = { brief_text: text.slice(0, 500), action_items: [], key_questions: [], red_flags: [], focus_areas: [], progress_summary: '' }
      }
    }

    // Save to DB
    try {
      const briefRow = {
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
      }
      if (requestId) {
        await supabase.from('pre_meeting_briefs').upsert(briefRow, { onConflict: 'meeting_request_id' })
      } else {
        await supabase.from('pre_meeting_briefs').insert(briefRow)
      }
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
      max_tokens: 4000,
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

    // Mark meeting request as completed
    await supabase.from('meeting_requests').update({ status: 'completed' }).eq('zoom_meeting_id', meetingId)

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

// ─── ADMIN: DELETE MENTOR AUTH ACCOUNT ───────────────────────────────────────
app.post('/api/admin/delete-mentor', async (req, res) => {
  try {
    const { userId } = req.body
    const { error } = await supabase.auth.admin.deleteUser(userId)
    if (error) return res.status(400).json({ error: error.message })
    res.json({ success: true })
  } catch(err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── ADMIN: CREATE MENTOR AUTH ACCOUNT ───────────────────────────────────────
app.post('/api/admin/create-mentor', async (req, res) => {
  try {
    const { email, full_name } = req.body
    const { data, error } = await supabase.auth.admin.createUser({
      email, password: '12345678',
      email_confirm: true,
      user_metadata: { full_name }
    })
    if (error) return res.status(400).json({ error: error.message })
    res.json({ id: data.user.id })
  } catch(err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── MENTOR EMBEDDING CACHE (loaded once on startup) ────────────────────────
let mentorEmbeddingCache = null

async function loadMentorEmbeddings() {
  console.log('Loading mentor embeddings into memory...')
  const start = Date.now()
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, full_name, primary_expertise, secondary_expertise, primary_industry, secondary_industry, tiering, location, years_experience, is_angel_investor, is_serial_entrepreneur, is_founder, linkedin_url, bio, job_title, current_company, bio_embedding')
    .eq('role', 'mentor')
    .not('bio_embedding', 'is', null)
  if (error) { console.error('Failed to load embeddings:', error.message); return }
  // Parse bio_embedding from string to float array
  mentorEmbeddingCache = data.map(m => ({
    ...m,
    bio_embedding: typeof m.bio_embedding === 'string' ? JSON.parse(m.bio_embedding) : m.bio_embedding
  }))
  console.log(`Loaded ${data.length} mentor embeddings in ${Date.now()-start}ms`)
}

// Load on startup
loadMentorEmbeddings()

// ─── EMBEDDING CACHE ─────────────────────────────────────────────────────────
const embeddingCache = new Map()
const queryResultsCache = new Map() // cache full Claude results by query key

function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

function findSimilarMentors(queryEmbedding, tieringFilter, topK = 30) {
  if (!mentorEmbeddingCache) return []
  return mentorEmbeddingCache
    .filter(m => tieringFilter.includes(m.tiering) && m.bio && m.bio.length > 50)
    .map(m => ({ ...m, similarity: cosineSimilarity(queryEmbedding, m.bio_embedding) }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK)
}

async function getQueryEmbedding(text) {
  const key = text.trim().toLowerCase().slice(0, 200)
  if (embeddingCache.has(key)) return embeddingCache.get(key)
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'text-embedding-3-small', input: text.slice(0, 8000) })
  })
  const data = await res.json()
  if (data.error) throw new Error(data.error.message)
  const embedding = data.data[0].embedding
  embeddingCache.set(key, embedding)
  if (embeddingCache.size > 100) embeddingCache.delete(embeddingCache.keys().next().value)
  return embedding
}

// ─── FAST MATCH (embedding pre-filter + Claude scoring, 3 Tier1 + 3 Tier2) ────
app.post('/api/match-mentors-fast', async (req, res) => {
  try {
    const { tiering, product, theme, problemStatement, companyName, state, revenueLakhs, matchCount = 6 } = req.body
    if (!mentorEmbeddingCache) return res.status(503).json({ error: 'Embeddings not loaded yet' })

    let tieringFilter
    if (tiering === 'Liftoff') tieringFilter = ['Liftoff', 'Ignite, Liftoff']
    else tieringFilter = ['Accelerate', 'Liftoff', 'Ignite, Liftoff']

    const queryText = `${product || ''} ${theme || ''} ${problemStatement || ''} ${companyName || ''} ${state || ''}`.trim()
    const queryEmbedding = await getQueryEmbedding(queryText)
    const candidates = findSimilarMentors(queryEmbedding, tieringFilter, 20)

    // Check query results cache first
    const cacheKey = `${tieringFilter.join(',')}_${queryText.slice(0,100)}`
    console.log('Cache key:', JSON.stringify(cacheKey))
    console.log('Cache size:', queryResultsCache.size)
    if (queryResultsCache.has(cacheKey)) {
      console.log('Fast: serving from query cache')
      return res.json(queryResultsCache.get(cacheKey))
    }

    // Build profiles for Claude
    const mentorProfiles = candidates.map((m, i) => {
      const bio = (m.bio || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 350)
      return `EXPERT ${i+1}: ${m.full_name} | ${m.job_title || ''} at ${m.current_company || ''} | ${m.primary_expertise || ''} | ${m.primary_industry || ''} | ${m.years_experience || '?'}yrs\n${bio}`
    }).join('\n---\n')

    const systemPrompt = `You are an expert matcher. Tier 1 = expert PERSONALLY worked in the SAME industry AND personally solved the SAME problem. Tier 2 = partial fit. Be strict about Tier 1.`

    const prompt = `Founder needs: ${problemStatement || product}
Company: ${companyName || ''} | Product: ${product} | Location: ${state || ''}

EXPERTS TO EVALUATE:
${mentorProfiles}

Return exactly 3 Tier 1 and 3 Tier 2 (if fewer Tier 1 exist, fill with Tier 2).
Return ONLY a JSON array of 6:
[{"index":1,"tier":1,"score":9,"match_reason":"2 sentences"},{"index":2,"tier":2,"score":6,"match_reason":"..."}]`

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 800, system: systemPrompt, messages: [{ role: 'user', content: prompt }] })
    })
    const data = await response.json()
    const text = data.content?.[0]?.text || ''
    const clean = text.trim().replace(/^```json\n?/,'').replace(/^```\n?/,'').replace(/\n?```$/,'').trim()
    let rankings
    try { rankings = JSON.parse(clean) } catch(e) {
      const match = clean.match(/\[[\s\S]*\]/)
      rankings = match ? JSON.parse(match[0]) : []
    }

    const matches = rankings.map((r, rank) => {
      const mentor = candidates[r.index - 1]
      if (!mentor) return null
      return { ...mentor, bio_embedding: undefined, rank: rank+1, tier: r.tier, score: r.score, match_reason: r.match_reason, match_label: r.tier===1?'Top Match':'Good Match' }
    }).filter(Boolean)

    const result = { matches, source: 'hybrid' }
    // Cache result (max 50 queries)
    queryResultsCache.set(cacheKey, result)
    if (queryResultsCache.size > 50) queryResultsCache.delete(queryResultsCache.keys().next().value)
    res.json(result)
  } catch(err) {
    console.error('Fast match error:', err)
    res.status(500).json({ error: err.message })
  }
})
// ─── MATCH MENTORS FOR A MENTEE (Bio-based scoring, Tier 1/2 rubric) ──────────
app.post('/api/match-mentors', async (req, res) => {
  try {
    const { tiering, product, theme, problemStatement, companyName, state, revenueLakhs, matchCount = 10, context = '' } = req.body

    if (!product && !problemStatement) return res.status(400).json({ error: 'product or problemStatement required' })

    // Tiering filter
    let tieringFilter
    if (tiering === 'Liftoff') {
      tieringFilter = ['Liftoff', 'Ignite, Liftoff']
    } else {
      tieringFilter = ['Accelerate', 'Liftoff', 'Ignite, Liftoff']
    }

    const { data: mentors } = await supabase
      .from('profiles')
      .select('id, full_name, email, primary_expertise, secondary_expertise, primary_industry, secondary_industry, tiering, location, years_experience, is_angel_investor, is_serial_entrepreneur, is_founder, linkedin_url, bio, job_title, current_company')
      .eq('role', 'mentor')
      .in('tiering', tieringFilter)

    if (!mentors || mentors.length === 0) return res.json({ matches: [] })

    // Step 1: Semantic pre-filter using OpenAI embeddings + pgvector
    const queryText = `${product} ${theme || ''} ${problemStatement || ''} ${companyName || ''} ${state || ''}`.trim()
    let candidates

    try {
      const queryEmbedding = await getQueryEmbedding(queryText)

      // Use pgvector cosine similarity to find top 30 mentors
      // In-memory cosine similarity search - instant, no DB call needed
      candidates = findSimilarMentors(queryEmbedding, tieringFilter, 30)
      console.log('In-memory search: found', candidates.length, 'candidates')
    } catch(embErr) {
      console.log('Embedding search failed, falling back to keyword:', embErr.message)
      const founderContext = queryText.toLowerCase()
      const keywords = founderContext.split(/\s+/).filter(w => w.length > 3)
      const scored = mentors.map(m => {
        let score = 0
        const bioText = (m.bio || '').replace(/<[^>]+>/g, ' ').toLowerCase()
        const structuredFields = `${m.primary_expertise || ''} ${m.secondary_expertise || ''} ${m.primary_industry || ''} ${m.secondary_industry || ''} ${m.job_title || ''} ${m.current_company || ''}`.toLowerCase()
        keywords.forEach(word => {
          if (structuredFields.includes(word)) score += 2
          if (bioText.includes(word)) score += 2
        })
        return { ...m, _pre_score: score }
      })
      scored.sort((a, b) => b._pre_score - a._pre_score)
      candidates = scored.slice(0, 30)
    }

    // Step 2: Build rich mentor profiles using bio for Claude
    const mentorProfiles = candidates.map((m, i) => {
      const bio = (m.bio || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 400)
      return `EXPERT ${i+1}: ${m.full_name}
Designation: ${m.job_title || ''} at ${m.current_company || ''}
Expertise: ${m.primary_expertise || ''}${m.secondary_expertise ? ', ' + m.secondary_expertise : ''}
Industry: ${m.primary_industry || ''}${m.secondary_industry ? ', ' + m.secondary_industry : ''}
Experience: ${m.years_experience || '?'} years
Bio: ${bio}`
    }).join('\n\n---\n\n')

    const systemPrompt = `You are an AI expert-matching assistant for Resources Network, helping Indian founders find the most suitable experts from a curated database.

CORE RULES YOU ALWAYS FOLLOW:
- Industry match alone is NOT enough for Tier 1
- Hands-on operator experience alone is NOT enough for Tier 1
- BOTH must be present for Tier 1
- When in doubt -> Tier 2, not Tier 1
- Never assume industry match if not clearly stated in the profile

KEY HANDS-ON RULE:
- Be honest — do not mark Yes for hands-on just because the expert is impressive
- Yes = personally done it on the ground as an operator
- Partial = advised / consulted / taught — not done directly
- No = no relevant experience in this area

MINIMUM RESULT RULES:
- You MUST always return at least 1 result total across both tiers
- Never return an empty array — always surface the best available option`

    const userPrompt = `You are helping an Indian founder find the right expert.

Founder's business brief and problem statement:
"${companyName ? 'Company: ' + companyName + '. ' : ''}Product/Service: ${product}. ${state ? 'Location: ' + state + '. ' : ''}${revenueLakhs ? 'Revenue: ₹' + revenueLakhs + 'L. ' : ''}${theme ? 'Theme: ' + theme + '. ' : ''}Problem: ${problemStatement || 'General business growth and scaling.'}"

Here are expert profiles to evaluate:

${mentorProfiles}

TIER CLASSIFICATION RULES:

TIER 1 — Strong Match (min 1, max 5):
Condition 1 — Industry Match: Expert has directly worked IN the same or very closely related industry. Not just advised — actually worked in it as an operator, founder, or senior leader.
Condition 2 — Operator Experience: Expert has PERSONALLY done the specific task or solved the specific problem the founder is facing. Not consulting, not teaching, not advising — done it themselves.
If even ONE condition is missing -> Tier 2, NOT Tier 1.

TIER 2 — Partial Match (max 5):
- Matches industry but lacks operator experience
- Has operator experience but from a different industry
- Has strong relevant expertise useful to the founder

SCORING:
- Industry Match: 3 points (3=direct, 2=adjacent, 1=advised, 0=none)
- Operator Experience: 3 points (3=personally done exact task, 2=closely related, 1=advised/taught, 0=none)
- Relevant Expertise: 2 points
- Key Credentials: 2 points

Return ONLY a JSON array of the top ${matchCount} experts across both tiers (Tier 1 first, then Tier 2). No extra text.

[
  {
    "index": <1-based index from list above>,
    "tier": 1,
    "score": <total out of 10>,
    "industry_match_score": <0-3>,
    "operator_score": <0-3>,
    "expertise_score": <0-2>,
    "expertise_reason": "<1 line on relevant expertise>",
    "credentials_score": <0-2>,
    "credentials_reason": "<1 line on key credentials>",
    "hands_on": "Yes|Partial|No",
    "industry_match_reason": "<1 line why industry matches>",
    "operator_reason": "<1 line on personal operator experience>",
    "match_reason": "<2-3 sentence overall why this expert fits the founder>"
  }
]`

    // Split into batches of 5 and score in parallel
    const BATCH_SIZE = 10
    const batches = []
    for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
      batches.push(candidates.slice(i, i + BATCH_SIZE))
    }

    async function scoreBatch(batch, batchOffset) {
      const batchProfiles = batch.map((m, i) => {
        const bio = (m.bio || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 250)
        return `EXPERT ${i+1}: ${m.full_name}
Designation: ${m.job_title || ''} at ${m.current_company || ''}
Expertise: ${m.primary_expertise || ''}${m.secondary_expertise ? ', ' + m.secondary_expertise : ''}
Industry: ${m.primary_industry || ''}${m.secondary_industry ? ', ' + m.secondary_industry : ''}
Experience: ${m.years_experience || '?'} years
Bio: ${bio}`
      }).join('\n\n---\n\n')

      const batchUserPrompt = userPrompt.replace(mentorProfiles, batchProfiles)
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 2000, system: systemPrompt, messages: [{ role: 'user', content: batchUserPrompt }] })
      })
      const data = await response.json()
      const text = data.content?.[0]?.text || ''
      const clean = text.trim().replace(/^```json\n?/,'').replace(/^```\n?/,'').replace(/\n?```$/,'').trim()
      let results
      try {
        results = JSON.parse(clean)
      } catch(e) {
        // Try to extract partial JSON array
        const match = clean.match(/\[[\s\S]*\]/)
        if (match) results = JSON.parse(match[0])
        else { console.error('Batch parse error:', clean.slice(0,200)); return [] }
      }
      if (!Array.isArray(results)) return []
      return results.map(r => ({ ...r, index: r.index + batchOffset }))
    }

    console.log('Scoring', candidates.length, 'candidates in', batches.length, 'parallel batches')
    const batchResults = await Promise.all(
      batches.map((batch, bi) => scoreBatch(batch, bi * BATCH_SIZE).then(r => {
        console.log('Batch', bi, 'returned', r.length, 'results')
        return r
      }).catch(e => {
        console.error('Batch', bi, 'failed:', e.message)
        return []
      }))
    )
    console.log('Total results before dedup:', batchResults.flat().length)
    const rankings = batchResults.flat()
      .sort((a, b) => a.tier !== b.tier ? a.tier - b.tier : b.score - a.score)
      .slice(0, matchCount)

    const matches = rankings.map((r, rank) => {
      const mentor = candidates[r.index - 1]
      if (!mentor) return null
      return {
        ...mentor,
        rank: rank + 1,
        tier: r.tier,
        score: r.score,
        industry_match_score: r.industry_match_score,
        operator_score: r.operator_score,
        expertise_score: r.expertise_score,
        expertise_reason: r.expertise_reason,
        credentials_score: r.credentials_score,
        credentials_reason: r.credentials_reason,
        hands_on: r.hands_on,
        industry_match_reason: r.industry_match_reason,
        operator_reason: r.operator_reason,
        match_reason: r.match_reason
      }
    }).filter(Boolean)

    res.json({ matches, total_candidates: mentors.length })
  } catch (err) {
    console.error('Match mentors error:', err)
    res.status(500).json({ error: err.message })
  }
})

// ─── SCORE SINGLE MENTOR (on-demand when card is clicked) ────────────────────
app.post('/api/score-mentor', async (req, res) => {
  try {
    const { mentorEmail, product, problemStatement, companyName, state, revenueLakhs, theme, context } = req.body
    const mentor = mentorEmbeddingCache?.find(m => m.email === mentorEmail)
    if (!mentor) return res.status(404).json({ error: 'Mentor not found' })

    const bio = (mentor.bio || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 400)

    const founderContext = context || problemStatement || product || ''
    const prompt = `You are scoring a single expert for a founder match.

Founder: ${companyName || ''} | Product: ${product} | Problem: ${founderContext} | Location: ${state || ''} | Revenue: ${revenueLakhs ? '₹'+revenueLakhs+'L' : 'N/A'}

Expert: ${mentor.full_name}
Title: ${mentor.job_title || ''} at ${mentor.current_company || ''}
Expertise: ${mentor.primary_expertise || ''} ${mentor.secondary_expertise || ''}
Industry: ${mentor.primary_industry || ''} ${mentor.secondary_industry || ''}
Bio: ${bio}

Score this expert on:
- Industry Match (0-3): Did they work IN the same industry as operator/founder/leader?
- Operator Experience (0-3): Did they PERSONALLY solve the same problem the founder faces?
- Expertise (0-2): Relevant expertise match
- Key Credentials (0-2): Strong credentials for this context

Tier 1 = BOTH industry match AND operator experience present
Tier 2 = only one present

Return ONLY JSON:
{
  "tier": 1,
  "score": 9,
  "industry_match_score": 3,
  "industry_match_reason": "1 line",
  "operator_score": 3,
  "operator_reason": "1 line",
  "expertise_score": 2,
  "expertise_reason": "1 line",
  "credentials_score": 1,
  "credentials_reason": "1 line",
  "hands_on": "Yes",
  "match_reason": "2-3 sentences why this expert fits"
}`

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 600, messages: [{ role: 'user', content: prompt }] })
    })
    const data = await response.json()
    const text = data.content?.[0]?.text || ''
    const clean = text.trim().replace(/^```json\n?/,'').replace(/^```\n?/,'').replace(/\n?```$/,'').trim()
    const score = JSON.parse(clean)
    res.json({ score })
  } catch(err) {
    console.error('Score mentor error:', err)
    res.status(500).json({ error: err.message })
  }
})

// ─── AI COMPANY SUMMARY ───────────────────────────────────────────────────────
app.post('/api/company-summary', async (req, res) => {
  try {
    const { companyName, product, location, state, revenueLakhs, employeeCount, tiering } = req.body
    const prompt = `Write a factual 2-sentence company profile. Only include objective facts about the company — name, what they make, where they are, size and revenue. Do NOT include goals, aspirations, what they are seeking, or why they want mentorship.

Company name: ${companyName}
Product/Service: ${product}
Location: ${location}, ${state}
Revenue: ₹${revenueLakhs} lakhs per year
Employees: ${employeeCount}

Write only 2 factual sentences describing what this company is and does. No goals, no aspirations, no mentorship language.`

    const text = await callClaude(prompt)
    res.json({ summary: text.trim() })
  } catch(err) {
    res.status(500).json({ error: err.message })
  }
})

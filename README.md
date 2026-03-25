# MentorSpace — Zoom-Embedded Mentoring Platform

React + Node.js + Supabase + Zoom Meeting SDK

---

## Prerequisites

- Node.js 18+ installed
- A Zoom account with:
  - A **Meeting SDK** app (for SDK Key + Secret)
  - A **Server-to-Server OAuth** app (for Client ID + Secret + Account ID)

---

## 1. Install dependencies

Open **two terminals**.

**Terminal 1 — Server:**
```bash
cd mentorspace/server
npm install
```

**Terminal 2 — Client:**
```bash
cd mentorspace/client
npm install
```

---

## 2. Check your .env files

**server/.env** (already filled in — keep this secret, never commit):
```
ZOOM_CLIENT_SECRET=e3Zp4HS8kdYDIfqH17cesMPY5wUY9wTS
ZOOM_SDK_SECRET=KuKi5Ym7U4K0Q13b1TnKjnFdQPAVFYCX
ZOOM_ACCOUNT_ID=wLnJdAieRr6tYtuiUNywFA
ZOOM_CLIENT_ID=4bkCRfNpRwCTu6Gi56OA5g
ZOOM_SDK_KEY=BpAQnTCgRrWgEbVoRDeUGQ
PORT=3001
```

**client/.env** (already filled in):
```
VITE_SUPABASE_URL=https://brendan-nonspheric-lenora.ngrok-free.dev
VITE_SUPABASE_ANON_KEY=sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH
VITE_API_URL=http://localhost:3001
VITE_ZOOM_SDK_KEY=BpAQnTCgRrWgEbVoRDeUGQ
```

---

## 3. Start both servers

**Terminal 1:**
```bash
cd mentorspace/server
node index.js
# → Running on http://localhost:3001
```

**Terminal 2:**
```bash
cd mentorspace/client
npm run dev
# → Running on http://localhost:5173
```

---

## 4. Test the full Zoom flow

### Step 1 — Create a meeting
Open http://localhost:5173 in Chrome.

Click **+ New Session** in the sidebar.

Fill in:
- Choose a mentor
- Your name (e.g. "Arjun")
- Topic (e.g. "System Design Practice")
- Duration
- Role: **Mentee** (for this tab)

Click **📹 Create Zoom Meeting**.

You'll see a real Meeting ID and join URL.

### Step 2 — Join as Mentee
Click **▶ Join Now as Mentee**.

The Zoom SDK loads inside the app. Your browser will ask:
- **Allow microphone** → click Allow
- **Allow camera** → click Allow

You are now in the meeting as a participant.

### Step 3 — Join as Mentor (second tab)
Open a **new browser tab** → http://localhost:5173/new

Fill in:
- Same mentor
- A different name (e.g. "Priya")  
- Same topic
- Role: **Mentor (Host)**

Click **Create Zoom Meeting** again — OR use the same Meeting ID from Step 1.

If reusing the same meeting: after creating, manually go to `/session/MEETING_ID` 
and the session page will connect.

Click **▶ Join Now as Mentor (Host)**.

### Step 4 — You're connected!
Both tabs now have live video/audio using your laptop's mic, camera, and speaker.
Zoom SDK handles all device routing automatically.

---

## Architecture

```
Browser (React + Vite :5173)
    │
    ├── /new        → fill form → POST /api/meetings/create
    ├── /session/:id → POST /api/zoom/signature → ZoomMtg.join()
    └── /mentors    → browse mentors, book sessions

Express Server (:3001)
    │
    ├── POST /api/meetings/create   → Zoom OAuth token → create meeting
    ├── POST /api/zoom/signature    → JWT for SDK auth
    ├── GET  /api/zoom/me           → Zoom user info
    └── GET  /health                → status check

Zoom API (zoom.us)
    └── Creates real meetings, returns ID + join URL

Supabase
    └── Ready to store sessions, users, notes
```

---

## Zoom SDK Important Notes

1. **HTTPS required in production** — SDK runs fine on localhost for dev
2. **Chrome recommended** — best WebRTC support
3. **Allow mic/camera** when the browser prompts — required for Zoom to work
4. **SDK Key vs API Key** — these are different Zoom app types:
   - Meeting SDK app → SDK Key + SDK Secret (for embedding)
   - Server-to-Server OAuth app → Client ID + Client Secret (for creating meetings)
5. **role=1 is Host, role=0 is Attendee** — only one host per meeting

---

## Supabase Schema (run in Supabase SQL editor to persist sessions)

```sql
create table sessions (
  id uuid default gen_random_uuid() primary key,
  meeting_id text not null,
  topic text,
  mentor_name text,
  mentee_name text,
  duration_minutes int default 60,
  password text,
  join_url text,
  created_at timestamptz default now()
);

create table notes (
  id uuid default gen_random_uuid() primary key,
  session_id text not null,
  content text,
  updated_at timestamptz default now()
);
```

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `Cannot reach zoom.us` | Server is offline — run `node index.js` in server/ |
| `SDK init error` | Check SDK Key matches your Zoom Meeting SDK app |
| `Signature invalid` | SDK Secret must be from Meeting SDK app, not API app |
| `Camera/mic not working` | Click Allow in browser permission prompt |
| `Meeting not found` | Meeting may have expired — create a new one |
| CORS error | Make sure server is on :3001 and client on :5173 |

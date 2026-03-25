export async function createMeeting({ topic, duration = 60, mentorName }) {
  const res = await fetch('/api/meetings/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topic, duration, mentorName }),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function getSignature({ meetingNumber, role }) {
  const res = await fetch('/api/zoom/signature', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ meetingNumber, role }),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

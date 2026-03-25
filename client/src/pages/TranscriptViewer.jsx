import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import './TranscriptViewer.css'

export default function TranscriptViewer({ sessionId, topic, onClose }) {
  const [lines, setLines] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')

  useEffect(() => { fetchTranscript() }, [sessionId])

  async function fetchTranscript() {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('session_transcripts').select('lines')
        .eq('session_id', sessionId).single()
      if (error) throw error
      setLines(data?.lines || [])
    } catch (e) { setError('No transcript saved for this session.') }
    finally { setLoading(false) }
  }

  const filtered = search.trim()
    ? lines.filter(l => l.text?.toLowerCase().includes(search.toLowerCase()) || l.name?.toLowerCase().includes(search.toLowerCase()))
    : lines

  const grouped = []
  filtered.forEach(line => {
    const last = grouped[grouped.length - 1]
    if (last && last.name === line.name) { last.texts.push(line.text) }
    else { grouped.push({ name: line.name, time: line.time, texts: [line.text] }) }
  })

  function highlight(text, q) {
    const parts = text.split(new RegExp(`(${q})`, 'gi'))
    return parts.map((p, i) => p.toLowerCase() === q.toLowerCase() ? <mark key={i} className="tv-highlight">{p}</mark> : p)
  }

  return (
    <div className="tv-overlay">
      <div className="tv-panel">
        <div className="tv-header">
          <div>
            <div className="tv-title">📄 Full Transcript</div>
            <div className="tv-subtitle">{topic || 'Session'} · {lines.length} lines</div>
          </div>
          <button className="tv-close" onClick={onClose}>✕</button>
        </div>
        <div className="tv-search-bar">
          <input className="tv-search" placeholder="🔍 Search transcript…"
            value={search} onChange={e => setSearch(e.target.value)} />
          {search && <span className="tv-search-count">{filtered.length} matches</span>}
        </div>
        <div className="tv-body">
          {loading && <div className="tv-loading"><div className="tv-spinner" /><span>Loading transcript…</span></div>}
          {!loading && error && <div className="tv-error"><div className="tv-error-icon">📭</div><p>{error}</p><p className="tv-error-sub">Transcript is only saved when the mentor clicks Leave during a session.</p></div>}
          {!loading && !error && lines.length === 0 && <div className="tv-error"><div className="tv-error-icon">🎙</div><p>No transcript lines saved for this session.</p></div>}
          {!loading && !error && grouped.map((group, i) => (
            <div key={i} className="tv-group">
              <div className="tv-speaker-row">
                <div className="tv-avatar">{(group.name||'U').split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase()}</div>
                <div className="tv-speaker-name">{group.name || 'Unknown'}</div>
                {group.time && <div className="tv-time">{group.time}</div>}
              </div>
              <div className="tv-bubbles">
                {group.texts.map((text, j) => (
                  <div key={j} className="tv-bubble">{search ? highlight(text, search) : text}</div>
                ))}
              </div>
            </div>
          ))}
        </div>
        {!loading && lines.length > 0 && (
          <div className="tv-footer">
            <button className="tv-copy-btn" onClick={() => navigator.clipboard.writeText(lines.map(l=>`${l.name}: ${l.text}`).join('\n'))}>
              📋 Copy Full Transcript
            </button>
            <span className="tv-footer-meta">{lines.length} lines</span>
          </div>
        )}
      </div>
    </div>
  )
}

import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import './IntelligenceDashboard.css'

const SECTORS = ['All', 'Manufacturing', 'SaaS', 'Fintech', 'Healthcare', 'FMCG', 'Agritech', 'EV', 'E-commerce', 'Export', 'Retail', 'EdTech', 'AI/ML', 'Climate Tech', 'Logistics']
const GEOGRAPHIES = ['All', 'India', 'Southeast Asia', 'Europe', 'USA', 'Middle East', 'Africa', 'Latin America']
const THEMES = ['All', 'Market Entry', 'GTM Strategy', 'Fundraising', 'Competition', 'Product', 'Export', 'Scaling', 'Regulation', 'Distribution']

export default function IntelligenceDashboard() {
  const { signOut } = useAuth()
  const navigate = useNavigate()
  const [insights, setInsights] = useState([])
  const [sessions, setSessions] = useState([])
  const [cards, setCards] = useState([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [search, setSearch] = useState('')
  const [sector, setSector] = useState('All')
  const [geography, setGeography] = useState('All')
  const [theme, setTheme] = useState('All')
  const [selected, setSelected] = useState(null)

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    setLoading(true)
    try {
      const { data: sessionData } = await supabase
        .from('sessions').select('*').eq('status', 'ended')
        .order('ended_at', { ascending: false })
      setSessions(sessionData || [])

      const { data: insightData } = await supabase
        .from('session_insights').select('*').eq('is_final', true)
        .order('snapshot_time', { ascending: false })
      setInsights(insightData || [])

      // Load saved intelligence cards
      const { data: cardData } = await supabase
        .from('intelligence_cards').select('*')
        .order('created_at', { ascending: false })
      setCards(cardData || [])
    } catch(e) {
      console.log('Error fetching data:', e)
    } finally { setLoading(false) }
  }

  async function generateIntelligence() {
    if (insights.length === 0) return
    setGenerating(true)
    try {
      const transcriptSummaries = insights.slice(0, 20).map(ins => {
        const session = sessions.find(s => s.meeting_id === ins.session_id)
        return `Topic: ${session?.topic || 'General'} | ${ins.summary}`
      }).join('\n\n')

      const res = await fetch('/api/intelligence/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ summaries: transcriptSummaries, sessionCount: sessions.length })
      })
      const data = await res.json()
      if (data.cards) {
        // Save cards to Supabase
        for (const card of data.cards) {
          await supabase.from('intelligence_cards').upsert(card, { onConflict: 'title' })
        }
        await fetchData()
      }
    } catch(e) {
      console.log('Generate error:', e)
    } finally { setGenerating(false) }
  }

  const filtered = cards.filter(c => {
    const matchSearch = !search || c.title?.toLowerCase().includes(search.toLowerCase()) || c.summary?.toLowerCase().includes(search.toLowerCase())
    const matchSector = sector === 'All' || c.sector === sector
    const matchGeo = geography === 'All' || c.geography === geography
    const matchTheme = theme === 'All' || c.theme === theme
    return matchSearch && matchSector && matchGeo && matchTheme
  })

  const stats = {
    sessions: sessions.length,
    insights: insights.length,
    sectors: [...new Set(cards.map(c => c.sector).filter(Boolean))].length,
    cards: cards.length
  }

  return (
    <div className="intel-wrap">
      {/* Header */}
      <header className="intel-header">
        <div className="intel-header-left">
          <div className="intel-logo">
            <div className="intel-logo-mark">W</div>
            <div>
              <div className="intel-logo-name">Wadhwani Foundation</div>
              <div className="intel-logo-sub">Market Intelligence Hub</div>
            </div>
          </div>
          <nav className="intel-nav">
            <button className="intel-nav-btn" onClick={() => navigate('/')}>← Dashboard</button>
            <button className="intel-nav-btn active">Market Intelligence</button>
            <button className="intel-nav-btn">Flash Trends</button>
          </nav>
        </div>
        <div className="intel-header-right">
          <button className="intel-gen-btn" onClick={generateIntelligence} disabled={generating || insights.length === 0}>
            {generating ? '⏳ Generating…' : '✨ Generate from Transcripts'}
          </button>
          <button className="intel-signout" onClick={signOut}>Sign out</button>
        </div>
      </header>

      {/* Stats bar */}
      <div className="intel-stats-bar">
        {[
          { label: 'Total Sessions', value: stats.sessions, icon: '🎯' },
          { label: 'AI Insights', value: stats.insights, icon: '✨' },
          { label: 'Sectors Covered', value: stats.sectors, icon: '🏭' },
          { label: 'Intelligence Cards', value: stats.cards, icon: '📊' },
        ].map(s => (
          <div key={s.label} className="intel-stat">
            <span className="intel-stat-icon">{s.icon}</span>
            <div>
              <div className="intel-stat-val">{s.value}</div>
              <div className="intel-stat-label">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="intel-body">
        {/* Search */}
        <div className="intel-search-wrap">
          <input
            className="intel-search"
            placeholder="Search by keyword (e.g., 'export certification', 'market entry', 'GTM strategy')..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {/* Filters */}
        <div className="intel-filters">
          <div className="intel-filter-group">
            <span className="intel-filter-label">Sector:</span>
            <div className="intel-filter-pills">
              {SECTORS.map(s => (
                <button key={s} className={`intel-pill ${sector === s ? 'active' : ''}`} onClick={() => setSector(s)}>{s}</button>
              ))}
            </div>
          </div>
          <div className="intel-filter-group">
            <span className="intel-filter-label">Geography:</span>
            <div className="intel-filter-pills">
              {GEOGRAPHIES.map(g => (
                <button key={g} className={`intel-pill ${geography === g ? 'active' : ''}`} onClick={() => setGeography(g)}>{g}</button>
              ))}
            </div>
          </div>
          <div className="intel-filter-group">
            <span className="intel-filter-label">Theme:</span>
            <div className="intel-filter-pills">
              {THEMES.map(t => (
                <button key={t} className={`intel-pill ${theme === t ? 'active' : ''}`} onClick={() => setTheme(t)}>{t}</button>
              ))}
            </div>
          </div>
        </div>

        {/* Cards grid */}
        {loading ? (
          <div className="intel-loading">
            <div className="intel-spinner" />
            <span>Loading intelligence data…</span>
          </div>
        ) : cards.length === 0 ? (
          <div className="intel-empty">
            <div className="intel-empty-icon">📊</div>
            <h3>No Intelligence Cards Yet</h3>
            <p>Click <strong>"Generate from Transcripts"</strong> to mine insights from your {insights.length} session summaries across {sessions.length} completed sessions.</p>
            <p className="intel-empty-sub">The AI will extract sector trends, competitive intelligence, market entry patterns, export opportunities, and more.</p>
            <button className="intel-gen-btn-lg" onClick={generateIntelligence} disabled={generating || insights.length === 0}>
              {generating ? '⏳ Generating Intelligence…' : '✨ Generate Market Intelligence'}
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="intel-empty">
            <div className="intel-empty-icon">🔍</div>
            <h3>No results found</h3>
            <p>Try different filters or search terms.</p>
          </div>
        ) : (
          <div className="intel-grid">
            {filtered.map(card => (
              <div key={card.id} className="intel-card" onClick={() => setSelected(card)}>
                <div className="intel-card-top">
                  <div className="intel-card-tags">
                    {card.sector && <span className="intel-tag sector">{card.sector}</span>}
                    {card.geography && <span className="intel-tag geo">🌍 {card.geography}</span>}
                    {card.theme && <span className="intel-tag theme">{card.theme}</span>}
                  </div>
                  {card.confidence && (
                    <div className="intel-card-conf">
                      <span className="intel-star">★</span> {card.confidence}
                    </div>
                  )}
                </div>
                <h3 className="intel-card-title">{card.title}</h3>
                <p className="intel-card-summary">{card.summary}</p>
                {card.key_insight && (
                  <div className="intel-card-insight">💡 {card.key_insight}</div>
                )}
                <button className="intel-card-cta">View Details →</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Detail modal */}
      {selected && (
        <div className="intel-modal-overlay" onClick={() => setSelected(null)}>
          <div className="intel-modal" onClick={e => e.stopPropagation()}>
            <div className="intel-modal-header">
              <div className="intel-card-tags">
                {selected.sector && <span className="intel-tag sector">{selected.sector}</span>}
                {selected.geography && <span className="intel-tag geo">🌍 {selected.geography}</span>}
                {selected.theme && <span className="intel-tag theme">{selected.theme}</span>}
              </div>
              <button className="intel-modal-close" onClick={() => setSelected(null)}>✕</button>
            </div>
            <h2 className="intel-modal-title">{selected.title}</h2>
            <p className="intel-modal-summary">{selected.summary}</p>

            {selected.key_insight && (
              <div className="intel-modal-section">
                <div className="intel-modal-label">💡 Key Insight</div>
                <div className="intel-modal-insight">{selected.key_insight}</div>
              </div>
            )}
            {selected.opportunities?.length > 0 && (
              <div className="intel-modal-section">
                <div className="intel-modal-label">🚀 Opportunities</div>
                {selected.opportunities.map((o, i) => (
                  <div key={i} className="intel-modal-item">
                    <span className="intel-modal-num">{i+1}</span><span>{o}</span>
                  </div>
                ))}
              </div>
            )}
            {selected.challenges?.length > 0 && (
              <div className="intel-modal-section">
                <div className="intel-modal-label">⚠️ Challenges</div>
                {selected.challenges.map((c, i) => (
                  <div key={i} className="intel-modal-item">
                    <span className="intel-modal-num">{i+1}</span><span>{c}</span>
                  </div>
                ))}
              </div>
            )}
            {selected.recommendations?.length > 0 && (
              <div className="intel-modal-section">
                <div className="intel-modal-label">✅ Recommendations</div>
                {selected.recommendations.map((r, i) => (
                  <div key={i} className="intel-modal-item">
                    <span className="intel-modal-num">{i+1}</span><span>{r}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="intel-modal-meta">
              Based on {selected.session_count || 1} session{(selected.session_count || 1) !== 1 ? 's' : ''} · Generated {new Date(selected.created_at).toLocaleDateString('en-IN', {day:'numeric',month:'short',year:'numeric'})}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

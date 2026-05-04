import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import './IntelligenceDashboard.css'

const SECTORS = ['All', 'Manufacturing', 'SaaS', 'Fintech', 'Healthcare', 'FMCG', 'Agritech', 'EV', 'E-commerce', 'Export', 'Retail', 'EdTech', 'AI/ML', 'Climate Tech', 'Logistics']
const GEOGRAPHIES = ['All', 'India', 'Southeast Asia', 'Europe', 'USA', 'Middle East', 'Africa', 'Latin America']
const THEMES = ['All', 'Market Entry', 'GTM Strategy', 'Fundraising', 'Competition', 'Product', 'Export', 'Scaling', 'Regulation', 'Distribution']
const SUPABASE_URL = 'https://oglgvkysbnyzqjtllirv.supabase.co'

function getAnonKey() {
  return import.meta.env.VITE_SUPABASE_ANON_KEY
}

async function sbFetch(path) {
  const key = getAnonKey()
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { 'apikey': key, 'Authorization': `Bearer ${key}` }
  })
  return r.json()
}

async function fetchOrGenerateTopicInsights(topic, allMasterclasses) {
  const { data: cached } = await supabase.from('masterclass_topic_insights').select('*').eq('topic', topic).single()
  if (cached?.insights?.length > 0) return { insights: cached.insights, sessionCount: cached.session_count, fromCache: true }

  const matchingSessions = allMasterclasses.filter(m => (m.key_topics || []).includes(topic))
  if (matchingSessions.length === 0) return { insights: [], sessionCount: 0 }

  const { data: fullRecords } = await supabase.from('masterclass_transcripts')
    .select('id, si_no, session_title, speaker, transcript, cc_vtt, chat_log')
    .in('id', matchingSessions.map(m => m.id))
  if (!fullRecords?.length) return { insights: [], sessionCount: 0 }

  const res = await fetch('/api/masterclass/topic-insights', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topic, transcripts: fullRecords.map(r => ({ session_title: r.session_title, speaker: r.speaker, transcript: r.transcript, cc_vtt: r.cc_vtt, chat_log: r.chat_log })) })
  })
  const data = await res.json()
  if (!data.insights) throw new Error(data.error || 'Failed')

  await supabase.from('masterclass_topic_insights').upsert({ topic, insights: data.insights, session_ids: fullRecords.map(r => r.id), session_count: data.sessionCount }, { onConflict: 'topic' })
  return { insights: data.insights, sessionCount: data.sessionCount, fromCache: false }
}

export default function IntelligenceDashboard() {
  const { signOut } = useAuth()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('market')

  // Market Intelligence
  const [cards, setCards] = useState([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [search, setSearch] = useState('')
  const [sector, setSector] = useState('All')
  const [geography, setGeography] = useState('All')
  const [theme, setTheme] = useState('All')
  const [selected, setSelected] = useState(null)
  const [marketTab, setMarketTab] = useState('insights')

  // Companies
  const [ventures, setVentures] = useState([])
  const [venturesLoading, setVenturesLoading] = useState(false)
  const [ventureSearch, setVentureSearch] = useState('')
  const [ventureSector, setVentureSector] = useState('All')
  const [ventureCohort, setVentureCohort] = useState('All')
  const [selectedVenture, setSelectedVenture] = useState(null)
  const [ventureInsights, setVentureInsights] = useState({})
  const [loadingVentureInsights, setLoadingVentureInsights] = useState({})

  // Masterclass
  const [masterclasses, setMasterclasses] = useState([])
  const [mcLoading, setMcLoading] = useState(false)
  const [mcSearch, setMcSearch] = useState('')
  const [mcTopic, setMcTopic] = useState('All')
  const [mcTopics, setMcTopics] = useState(['All'])
  const [mcSelected, setMcSelected] = useState(null)
  const [mcView, setMcView] = useState('topics')
  const [mcActiveTopic, setMcActiveTopic] = useState(null)
  const [mcTopicFilter, setMcTopicFilter] = useState('')
  const [topicInsights, setTopicInsights] = useState({})
  const [loadingTopics, setLoadingTopics] = useState({})

  useEffect(() => { fetchData() }, [])
  useEffect(() => {
    if (activeTab === 'masterclass' && masterclasses.length === 0) fetchMasterclasses()
  }, [activeTab])
  useEffect(() => { if (!mcSelected) setMcActiveTopic(null) }, [mcSelected])

  async function fetchData() {
    setLoading(true)
    try {
      const { data: cardData } = await supabase.from('intelligence_cards').select('*').order('created_at', { ascending: false })
      setCards(cardData || [])
    } catch(e) { console.log('Error:', e) }
    finally { setLoading(false) }
  }

  async function fetchVentures() {
    if (ventures.length > 0) return
    setVenturesLoading(true)
    try {
      const data = await sbFetch('venture_transcripts?select=id,company_name,cohort,month,sector,geography,ai_summary,key_topics&status=eq.active&order=cohort')
      setVentures(data || [])
    } catch(e) { console.log('fetchVentures error:', e) }
    finally { setVenturesLoading(false) }
  }

  async function loadCompanyInsights(venture) {
    const id = venture.id
    if (ventureInsights[id]) return
    setLoadingVentureInsights(p => ({...p, [id]: true}))
    try {
      const cached = await sbFetch(`company_insights?select=insights&company_id=eq.${id}`)
      if (cached?.[0]?.insights?.length > 0) {
        setVentureInsights(p => ({...p, [id]: cached[0].insights}))
        return
      }
      const full = await sbFetch(`venture_transcripts?select=transcript,profile&id=eq.${id}`)
      const r = await fetch('/api/venture/company-insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_id: id, company_name: venture.company_name, profile: full[0]?.profile, transcript: full[0]?.transcript })
      })
      const data = await r.json()
      if (data.insights) setVentureInsights(p => ({...p, [id]: data.insights}))
    } catch(e) {
      setVentureInsights(p => ({...p, [id]: ['Could not load insights.']}))
    } finally {
      setLoadingVentureInsights(p => ({...p, [id]: false}))
    }
  }

  async function fetchMasterclasses() {
    setMcLoading(true)
    try {
      const { data } = await supabase.from('masterclass_transcripts').select('id, si_no, session_title, speaker, session_date, ai_summary, key_topics').eq('status', 'active').order('session_date', { ascending: false })
      setMasterclasses(data || [])
      const allTopics = (data || []).flatMap(m => m.key_topics || [])
      setMcTopics(['All', ...new Set(allTopics)].slice(0, 40))
    } catch(e) { console.log('Error:', e) }
    finally { setMcLoading(false) }
  }

  async function selectTopic(topic) {
    setMcActiveTopic(topic)
    if (topicInsights[topic]) return
    setLoadingTopics(p => ({...p, [topic]: true}))
    try {
      const result = await fetchOrGenerateTopicInsights(topic, masterclasses)
      setTopicInsights(p => ({...p, [topic]: result}))
    } catch(e) {
      setTopicInsights(p => ({...p, [topic]: { insights: ['Could not load insights.'], sessionCount: 0 }}))
    } finally {
      setLoadingTopics(p => ({...p, [topic]: false}))
    }
  }

  async function generateIntelligence() {
    if (cards.length > 0) {
      const ok = window.confirm(`You already have ${cards.length} intelligence cards. Regenerate? This will take 3-4 minutes.`)
      if (!ok) return
    }
    setGenerating(true)
    try {
      const data = await sbFetch('venture_transcripts?select=company_name,cohort,sector,geography,ai_summary,key_topics,transcript,profile&limit=76')
      const ventures = data || []
      if (!ventures.length) { setGenerating(false); return }

      const transcriptSummaries = ventures.map(v => {
        const parts = [
          `Company: ${v.company_name} | Cohort: ${v.cohort} | Sector: ${v.sector} | Geography: ${v.geography}`,
          `Summary: ${v.ai_summary || ''}`,
          `Topics: ${(v.key_topics || []).join(', ')}`,
        ]
        if (v.profile) parts.push(`Profile: ${v.profile.slice(0, 500)}`)
        if (v.transcript) parts.push(`Transcript: ${v.transcript.slice(0, 800)}`)
        return parts.join('\n')
      }).join('\n\n---\n\n')

      const res = await fetch('/api/intelligence/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ summaries: transcriptSummaries, sessionCount: ventures.length })
      })
      const result = await res.json()
      if (result.cards) {
        for (const card of result.cards) {
          await supabase.from('intelligence_cards').insert(card)
        }
        await fetchData()
      }
    } catch(e) { console.log('Generate error:', e) }
    finally { setGenerating(false) }
  }

  const filtered = cards.filter(c => {
    const matchSearch = !search || c.title?.toLowerCase().includes(search.toLowerCase()) || c.summary?.toLowerCase().includes(search.toLowerCase())
    const matchSector = sector === 'All' || c.sector === sector
    const matchGeo = geography === 'All' || c.geography === geography
    const matchTheme = theme === 'All' || c.theme === theme
    return matchSearch && matchSector && matchGeo && matchTheme
  })

  const filteredVentures = ventures.filter(v => {
    const ms = !ventureSearch || v.company_name?.toLowerCase().includes(ventureSearch.toLowerCase()) || v.ai_summary?.toLowerCase().includes(ventureSearch.toLowerCase())
    const ss = ventureSector === 'All' || v.sector === ventureSector
    const cs = ventureCohort === 'All' || v.cohort === ventureCohort
    return ms && ss && cs
  })

  const filteredMc = masterclasses.filter(m => {
    const matchSearch = !mcSearch || m.session_title?.toLowerCase().includes(mcSearch.toLowerCase()) || m.ai_summary?.toLowerCase().includes(mcSearch.toLowerCase()) || m.speaker?.toLowerCase().includes(mcSearch.toLowerCase())
    const matchTopic = mcTopic === 'All' || (m.key_topics || []).includes(mcTopic)
    return matchSearch && matchTopic
  })

  const stats = {
    sectors: [...new Set(cards.map(c => c.sector).filter(Boolean))].length,
    cards: cards.length,
    masterclasses: masterclasses.length || 112,
    ventures: 76
  }

  return (
    <div className="intel-wrap">
      <header className="intel-header">
        <div className="intel-header-left">
          <div className="intel-logo">
            <div className="intel-logo-mark">W</div>
            <div>
              <div className="intel-logo-name">Wadhwani Foundation</div>
              <div className="intel-logo-sub">Transcript Intelligence Hub</div>
            </div>
          </div>
          <nav className="intel-nav">
            <button className="intel-nav-btn" onClick={() => navigate('/')}>← Dashboard</button>
            <button className="intel-nav-btn active">Transcript Intelligence</button>
            <button className="intel-nav-btn">Flash Trends</button>
          </nav>
        </div>
        <div className="intel-header-right">
          {activeTab === 'market' && (
            <button className="intel-gen-btn" onClick={generateIntelligence} disabled={generating}>
              {generating ? '⏳ Generating…' : '✨ Generate from Transcripts'}
            </button>
          )}
          <button className="intel-signout" onClick={signOut}>Sign out</button>
        </div>
      </header>

      <div className="intel-stats-bar">
        {[
          { label: 'Intelligence Cards', value: stats.cards, icon: '📊' },
          { label: 'Sectors Covered', value: stats.sectors, icon: '🏭' },
          { label: 'Venture Companies', value: stats.ventures, icon: '🏢' },
          { label: 'Masterclasses', value: stats.masterclasses, icon: '🎓' },
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

      <div className="intel-subtabs">
        <button className={`intel-subtab ${activeTab==='market'?'active':''}`} onClick={() => setActiveTab('market')}>📊 Market Intelligence</button>
        <button className={`intel-subtab ${activeTab==='masterclass'?'active':''}`} onClick={() => setActiveTab('masterclass')}>🎓 Masterclass Intelligence</button>
      </div>

      <div className="intel-body">

        {/* ── MARKET INTELLIGENCE ── */}
        {activeTab === 'market' && (
          <>
            <div className="mc-subtabs">
              <button className={`mc-subtab ${marketTab==='insights'?'active':''}`} onClick={() => setMarketTab('insights')}>📊 Intelligence Cards</button>
              <button className={`mc-subtab ${marketTab==='companies'?'active':''}`} onClick={() => { setMarketTab('companies'); fetchVentures() }}>🏢 Companies</button>
            </div>

            {/* INTELLIGENCE CARDS */}
            {marketTab === 'insights' && (<>
              <div className="intel-search-wrap" style={{marginTop:20}}>
                <input className="intel-search" placeholder="Search by keyword..." value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <div className="intel-filters">
                <div className="intel-filter-group">
                  <span className="intel-filter-label">Sector:</span>
                  <div className="intel-filter-pills">{SECTORS.map(s => <button key={s} className={`intel-pill ${sector===s?'active':''}`} onClick={() => setSector(s)}>{s}</button>)}</div>
                </div>
                <div className="intel-filter-group">
                  <span className="intel-filter-label">Geography:</span>
                  <div className="intel-filter-pills">{GEOGRAPHIES.map(g => <button key={g} className={`intel-pill ${geography===g?'active':''}`} onClick={() => setGeography(g)}>{g}</button>)}</div>
                </div>
                <div className="intel-filter-group">
                  <span className="intel-filter-label">Theme:</span>
                  <div className="intel-filter-pills">{THEMES.map(t => <button key={t} className={`intel-pill ${theme===t?'active':''}`} onClick={() => setTheme(t)}>{t}</button>)}</div>
                </div>
              </div>
              {loading ? (
                <div className="intel-loading"><div className="intel-spinner"/><span>Loading…</span></div>
              ) : cards.length === 0 ? (
                <div className="intel-empty">
                  <div className="intel-empty-icon">📊</div>
                  <h3>No Intelligence Cards Yet</h3>
                  <p>Click <strong>"Generate from Transcripts"</strong> to generate insights from 76 venture companies.</p>
                  <button className="intel-gen-btn-lg" onClick={generateIntelligence} disabled={generating}>
                    {generating ? '⏳ Generating…' : '✨ Generate Market Intelligence'}
                  </button>
                </div>
              ) : filtered.length === 0 ? (
                <div className="intel-empty"><div className="intel-empty-icon">🔍</div><h3>No results found</h3></div>
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
                        {card.confidence && <div className="intel-card-conf"><span className="intel-star">★</span> {card.confidence}</div>}
                      </div>
                      <h3 className="intel-card-title">{card.title}</h3>
                      <p className="intel-card-summary">{card.summary}</p>
                      {card.key_insight && <div className="intel-card-insight">💡 {card.key_insight}</div>}
                      <button className="intel-card-cta">View Details →</button>
                    </div>
                  ))}
                </div>
              )}
            </>)}

            {/* COMPANIES */}
            {marketTab === 'companies' && (<>
              <div className="intel-search-wrap" style={{marginTop:20}}>
                <input className="intel-search" placeholder="Search companies by name, sector, or topic..." value={ventureSearch} onChange={e => setVentureSearch(e.target.value)} />
              </div>
              <div className="intel-filters">
                <div className="intel-filter-group">
                  <span className="intel-filter-label">Sector:</span>
                  <div className="intel-filter-pills">
                    {['All', ...new Set(ventures.map(v => v.sector).filter(Boolean))].map(s => (
                      <button key={s} className={`intel-pill ${ventureSector===s?'active':''}`} onClick={() => setVentureSector(s)}>{s}</button>
                    ))}
                  </div>
                </div>
                <div className="intel-filter-group">
                  <span className="intel-filter-label">Cohort:</span>
                  <div className="intel-filter-pills">
                    {['All', 'Ahmedabad 2026', 'Chennai 2026', 'Pune 2026'].map(c => (
                      <button key={c} className={`intel-pill ${ventureCohort===c?'active':''}`} onClick={() => setVentureCohort(c)}>{c}</button>
                    ))}
                  </div>
                </div>
              </div>
              {venturesLoading ? (
                <div className="intel-loading"><div className="intel-spinner"/><span>Loading companies…</span></div>
              ) : (<>
                <div className="mc-count">{filteredVentures.length} companies</div>
                <div className="intel-grid">
                  {filteredVentures.map(v => (
                    <div key={v.id} className="intel-card mc-card" onClick={() => { setSelectedVenture(v); loadCompanyInsights(v) }}>
                      <div className="intel-card-top">
                        <div className="intel-card-tags">
                          {v.sector && <span className="intel-tag sector">{v.sector}</span>}
                          {v.geography && <span className="intel-tag geo">🌍 {v.geography}</span>}
                        </div>
                        <div className="mc-date">{v.cohort}</div>
                      </div>
                      <h3 className="intel-card-title">{v.company_name}</h3>
                      <p className="intel-card-summary">{v.ai_summary}</p>
                      <div className="intel-card-tags" style={{flexWrap:'wrap',gap:4,marginTop:4}}>
                        {(v.key_topics||[]).slice(0,3).map(t => <span key={t} className="intel-tag theme">{t}</span>)}
                      </div>
                      <button className="intel-card-cta">View Insights →</button>
                    </div>
                  ))}
                </div>
              </>)}
            </>)}
          </>
        )}

        {/* ── MASTERCLASS INTELLIGENCE ── */}
        {activeTab === 'masterclass' && (
          <>
            <div className="mc-subtabs">
              <button className={`mc-subtab ${mcView==='topics'?'active':''}`} onClick={() => setMcView('topics')}>🗂 Topic Explorer</button>
              <button className={`mc-subtab ${mcView==='sessions'?'active':''}`} onClick={() => setMcView('sessions')}>🎓 Sessions</button>
            </div>

            {/* TOPIC EXPLORER */}
            {mcView === 'topics' && (
              <div className="mc-explorer">
                <div className="mc-explorer-sidebar">
                  <div className="mc-explorer-sidebar-title">Topics</div>
                  <input className="mc-explorer-search" placeholder="Filter topics..." value={mcTopicFilter} onChange={e => setMcTopicFilter(e.target.value)} />
                  <div className="mc-explorer-topic-list">
                    {mcTopics.filter(t => t !== 'All' && t.toLowerCase().includes(mcTopicFilter.toLowerCase())).map(topic => {
                      const count = masterclasses.filter(m => (m.key_topics||[]).includes(topic)).length
                      const isSelected = mcActiveTopic === topic
                      const isCached = !!topicInsights[topic]
                      return (
                        <button key={topic} className={`mc-explorer-topic-item ${isSelected?'active':''}`} onClick={() => selectTopic(topic)}>
                          <span className="mc-explorer-topic-name">{topic}</span>
                          <div className="mc-explorer-topic-meta">
                            <span className="mc-topic-coverage">{count} session{count!==1?'s':''}</span>
                            {isCached && <span className="mc-topic-cached-dot">●</span>}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
                <div className="mc-explorer-panel">
                  {!mcActiveTopic ? (
                    <div className="mc-explorer-empty">
                      <div className="mc-explorer-empty-icon">🗂</div>
                      <h3>Select a topic</h3>
                      <p>Choose a topic from the left to see AI-synthesized insights from all sessions that covered it.</p>
                    </div>
                  ) : loadingTopics[mcActiveTopic] ? (
                    <div className="intel-loading" style={{padding:'60px 0'}}>
                      <div className="intel-spinner"/>
                      <span>Synthesizing insights from {masterclasses.filter(m=>(m.key_topics||[]).includes(mcActiveTopic)).length} transcript(s)…</span>
                    </div>
                  ) : topicInsights[mcActiveTopic] ? (
                    <div className="mc-explorer-insights">
                      <div className="mc-explorer-insights-header">
                        <h2 className="mc-explorer-insights-title">{mcActiveTopic}</h2>
                        <div className="mc-explorer-insights-meta">
                          Synthesized from {topicInsights[mcActiveTopic].sessionCount} session{topicInsights[mcActiveTopic].sessionCount!==1?'s':''}
                          {topicInsights[mcActiveTopic].fromCache ? ' · cached' : ' · just generated'}
                        </div>
                      </div>
                      <div className="mc-explorer-sources">
                        <div className="mc-explorer-sources-label">Sessions covered:</div>
                        <div className="mc-explorer-sources-list">
                          {masterclasses.filter(m=>(m.key_topics||[]).includes(mcActiveTopic)).map(m => (
                            <div key={m.id} className="mc-explorer-source-item">
                              <span className="mc-explorer-source-dot">▸</span>
                              <span>{m.session_title}</span>
                              {m.speaker && m.speaker !== 'nan' && <span className="mc-explorer-source-speaker">· {m.speaker}</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="mc-explorer-insights-list">
                        {topicInsights[mcActiveTopic].insights.map((insight, i) => (
                          <div key={i} className="mc-explorer-insight-item">
                            <span className="mc-explorer-insight-num">{i+1}</span>
                            <span>{insight}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            )}

            {/* SESSIONS VIEW */}
            {mcView === 'sessions' && (<>
              <div className="intel-search-wrap" style={{marginTop:20}}>
                <input className="intel-search" placeholder="Search by title, speaker, or topic..." value={mcSearch} onChange={e => setMcSearch(e.target.value)} />
              </div>
              <div className="intel-filters">
                <div className="intel-filter-group">
                  <span className="intel-filter-label">Topic:</span>
                  <div className="intel-filter-pills">
                    {mcTopics.map(t => <button key={t} className={`intel-pill ${mcTopic===t?'active':''}`} onClick={() => setMcTopic(t)}>{t}</button>)}
                  </div>
                </div>
              </div>
              {mcLoading ? (
                <div className="intel-loading"><div className="intel-spinner"/><span>Loading masterclass sessions…</span></div>
              ) : filteredMc.length === 0 ? (
                <div className="intel-empty"><div className="intel-empty-icon">🎓</div><h3>No sessions found</h3></div>
              ) : (<>
                <div className="mc-count">{filteredMc.length} session{filteredMc.length!==1?'s':''}</div>
                <div className="intel-grid">
                  {filteredMc.map(mc => (
                    <div key={mc.id} className="intel-card mc-card" onClick={() => setMcSelected(mc)}>
                      <div className="intel-card-top">
                        <div className="intel-card-tags">
                          {(mc.key_topics||[]).slice(0,3).map(t => <span key={t} className="intel-tag sector">{t}</span>)}
                        </div>
                        {mc.session_date && mc.session_date !== 'NaT' && (
                          <div className="mc-date">{new Date(mc.session_date).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})}</div>
                        )}
                      </div>
                      <h3 className="intel-card-title">{mc.session_title}</h3>
                      {mc.speaker && mc.speaker !== 'nan' && <div className="mc-speaker">👤 {mc.speaker}</div>}
                      <p className="intel-card-summary">{mc.ai_summary}</p>
                      <button className="intel-card-cta">View Summary →</button>
                    </div>
                  ))}
                </div>
              </>)}
            </>)}
          </>
        )}
      </div>

      {/* VENTURE COMPANY MODAL */}
      {selectedVenture && (
        <div className="intel-modal-overlay" onClick={() => setSelectedVenture(null)}>
          <div className="intel-modal" onClick={e => e.stopPropagation()}>
            <div className="intel-modal-header">
              <div className="intel-card-tags">
                {selectedVenture.sector && <span className="intel-tag sector">{selectedVenture.sector}</span>}
                {selectedVenture.geography && <span className="intel-tag geo">🌍 {selectedVenture.geography}</span>}
                <span className="intel-tag theme">{selectedVenture.cohort}</span>
              </div>
              <button className="intel-modal-close" onClick={() => setSelectedVenture(null)}>✕</button>
            </div>
            <h2 className="intel-modal-title">{selectedVenture.company_name}</h2>
            <div className="mc-modal-summary-box">
              <div className="intel-modal-label">📋 Company Overview</div>
              <p className="intel-modal-summary" style={{marginBottom:0}}>{selectedVenture.ai_summary}</p>
            </div>
            {selectedVenture.key_topics?.length > 0 && (
              <div className="intel-modal-section">
                <div className="intel-modal-label">🏷 Key Topics</div>
                <div className="intel-card-tags" style={{marginTop:8,flexWrap:'wrap',gap:6}}>
                  {selectedVenture.key_topics.map(t => <span key={t} className="intel-tag sector">{t}</span>)}
                </div>
              </div>
            )}
            <div className="intel-modal-section">
              <div className="intel-modal-label">💡 Company Insights</div>
              {loadingVentureInsights[selectedVenture.id] ? (
                <div className="mc-topic-loading" style={{padding:'12px 0'}}>
                  <div className="intel-spinner" style={{width:16,height:16,borderWidth:2}}/>
                  <span>Generating insights from transcript…</span>
                </div>
              ) : ventureInsights[selectedVenture.id] ? (
                <div className="mc-explorer-insights-list" style={{marginTop:10}}>
                  {ventureInsights[selectedVenture.id].map((insight, i) => (
                    <div key={i} className="mc-explorer-insight-item">
                      <span className="mc-explorer-insight-num">{i+1}</span>
                      <span>{insight}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* MARKET INTELLIGENCE MODAL */}
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

            {/* Stats row */}
            <div style={{display:'flex',gap:16,marginBottom:16,flexWrap:'wrap'}}>
              {selected.session_count > 0 && (
                <div style={{background:'#edf2f7',borderRadius:8,padding:'8px 14px',fontSize:13}}>
                  🏢 <strong>{selected.session_count}</strong> companies
                </div>
              )}
              {selected.total_revenue && (
                <div style={{background:'#f0faf4',borderRadius:8,padding:'8px 14px',fontSize:13}}>
                  💰 {selected.total_revenue}
                </div>
              )}
            </div>

            <p className="intel-modal-summary">{selected.summary}</p>

            {selected.key_insight && (
              <div className="intel-modal-section">
                <div className="intel-modal-label">💡 Key Insight</div>
                <div className="intel-modal-insight">{selected.key_insight}</div>
              </div>
            )}

            {selected.recommendations?.length > 0 && (
              <div className="intel-modal-section">
                <div className="intel-modal-label">✅ 5 Actionable Insights</div>
                {selected.recommendations.map((r,i) => (
                  <div key={i} className="intel-modal-item">
                    <span className="intel-modal-num">{i+1}</span>
                    <span>{r}</span>
                  </div>
                ))}
              </div>
            )}

            {selected.opportunities?.length > 0 && (
              <div className="intel-modal-section">
                <div className="intel-modal-label">🚀 Opportunities</div>
                {selected.opportunities.map((o,i) => <div key={i} className="intel-modal-item"><span className="intel-modal-num">{i+1}</span><span>{o}</span></div>)}
              </div>
            )}

            {selected.challenges?.length > 0 && (
              <div className="intel-modal-section">
                <div className="intel-modal-label">⚠️ Challenges</div>
                {selected.challenges.map((c,i) => <div key={i} className="intel-modal-item"><span className="intel-modal-num">{i+1}</span><span>{c}</span></div>)}
              </div>
            )}

            {selected.companies?.length > 0 && (
              <div className="intel-modal-section">
                <div className="intel-modal-label">🏢 Contributing Companies</div>
                <div className="intel-card-tags" style={{marginTop:8,flexWrap:'wrap',gap:6}}>
                  {selected.companies.map(c => <span key={c} className="intel-tag sector">{c}</span>)}
                </div>
              </div>
            )}

            <div className="intel-modal-meta">Generated {new Date(selected.created_at).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})}</div>
          </div>
        </div>
      )}

      {/* MASTERCLASS SESSION MODAL */}
      {mcSelected && (
        <div className="intel-modal-overlay" onClick={() => setMcSelected(null)}>
          <div className="intel-modal" onClick={e => e.stopPropagation()}>
            <div className="intel-modal-header">
              <div className="intel-card-tags">
                {(mcSelected.key_topics||[]).slice(0,4).map(t => <span key={t} className="intel-tag sector">{t}</span>)}
              </div>
              <button className="intel-modal-close" onClick={() => setMcSelected(null)}>✕</button>
            </div>
            <h2 className="intel-modal-title">{mcSelected.session_title}</h2>
            <div className="mc-modal-meta-row">
              {mcSelected.speaker && mcSelected.speaker !== 'nan' && <span className="mc-modal-speaker">👤 {mcSelected.speaker}</span>}
              {mcSelected.session_date && mcSelected.session_date !== 'NaT' && (
                <span className="mc-modal-date">📅 {new Date(mcSelected.session_date).toLocaleDateString('en-IN',{day:'numeric',month:'long',year:'numeric'})}</span>
              )}
            </div>
            <div className="mc-modal-summary-box">
              <div className="intel-modal-label">📋 Session Overview</div>
              <p className="intel-modal-summary" style={{marginBottom:0}}>{mcSelected.ai_summary}</p>
            </div>
            <div className="intel-modal-section" style={{marginTop:20}}>
              <div className="intel-modal-label">🏷 Topics Covered</div>
              <div className="intel-card-tags" style={{marginTop:10,flexWrap:'wrap',gap:8}}>
                {(mcSelected.key_topics||[]).map(t => (
                  <button key={t} className="intel-tag sector mc-topic-link"
                    onClick={() => { setMcSelected(null); setMcView('topics'); selectTopic(t) }}>
                    {t} →
                  </button>
                ))}
              </div>
              <p className="mc-topics-hint" style={{marginTop:10}}>Click a topic to explore synthesized insights across all sessions that covered it.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

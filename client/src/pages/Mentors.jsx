import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import './Mentors.css'

const MENTORS = [
  { id: 1, name: 'Priya Mehta',   title: 'Staff Engineer @ Google',       tags: ['System Design','DSA','FAANG'],    rating: 4.9, sessions: 48, rate: '₹2,500/hr', grad: 'linear-gradient(135deg,#4f7cff,#9b72ff)' },
  { id: 2, name: 'Aryan Gupta',   title: 'Product Lead @ Swiggy',         tags: ['Product','Strategy','GTM'],       rating: 4.7, sessions: 31, rate: '₹1,800/hr', grad: 'linear-gradient(135deg,#f5a524,#f56060)' },
  { id: 3, name: 'Nalini Rao',    title: 'Design Director @ Razorpay',    tags: ['UX/UI','Figma','Design Systems'], rating: 5.0, sessions: 22, rate: '₹3,000/hr', grad: 'linear-gradient(135deg,#3dd68c,#4f7cff)' },
  { id: 4, name: 'Vikram Joshi',  title: 'Data Scientist @ Microsoft',    tags: ['ML/AI','Python','LLMs'],          rating: 4.8, sessions: 19, rate: '₹2,200/hr', grad: 'linear-gradient(135deg,#9b72ff,#f5a524)' },
  { id: 5, name: 'Deepa Sharma',  title: 'Engineering Manager @ Flipkart',tags: ['Leadership','EM','Career'],       rating: 4.6, sessions: 37, rate: '₹2,800/hr', grad: 'linear-gradient(135deg,#f56060,#f5a524)' },
  { id: 6, name: 'Karan Mehrotra',title: 'Founder @ YC W23',              tags: ['Startups','Fundraising','GTM'],   rating: 4.9, sessions: 14, rate: '₹4,000/hr', grad: 'linear-gradient(135deg,#4f7cff,#3dd68c)' },
]

export default function Mentors() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')

  const filtered = MENTORS.filter(m =>
    m.name.toLowerCase().includes(query.toLowerCase()) ||
    m.tags.some(t => t.toLowerCase().includes(query.toLowerCase()))
  )

  return (
    <div className="mentors-page">
      <div className="mentors-header">
        <div>
          <h1 className="mentors-title">Find a Mentor</h1>
          <p className="mentors-sub">{MENTORS.length} mentors available · book a video session</p>
        </div>
        <input
          className="mentors-search"
          placeholder="Search by skill or name…"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
      </div>

      <div className="mentor-grid">
        {filtered.map(m => (
          <div key={m.id} className="mentor-card">
            <div className="mc-head">
              <div className="mc-avatar" style={{ background: m.grad }}>
                {m.name.split(' ').map(w=>w[0]).join('')}
              </div>
              <div>
                <div className="mc-name">{m.name}</div>
                <div className="mc-title">{m.title}</div>
              </div>
            </div>
            <div className="mc-tags">
              {m.tags.map(t => <span key={t} className="mc-tag">{t}</span>)}
            </div>
            <div className="mc-meta">
              <span className="mc-rating">★ {m.rating}</span>
              <span>{m.sessions} sessions</span>
              <span className="mc-rate">{m.rate}</span>
            </div>
            <div className="mc-actions">
              <button
                className="btn btn-primary btn-sm"
                style={{flex:1}}
                onClick={() => navigate('/new')}
              >
                📹 Book Video Session
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

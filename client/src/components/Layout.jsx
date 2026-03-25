import React, { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import './Layout.css'

const NAV = [
  { to: '/',        icon: '⬡', label: 'Dashboard' },
  { to: '/mentors', icon: '◈', label: 'Mentors'   },
  { to: '/new',     icon: '＋', label: 'New Session'},
]

export default function Layout({ children }) {
  const navigate = useNavigate()
  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <span className="logo-mark">M</span>
          <span className="logo-text">entor<em>Space</em></span>
        </div>

        <nav className="sidebar-nav">
          {NAV.map(n => (
            <NavLink key={n.to} to={n.to} end={n.to==='/'} className={({isActive})=>`nav-link ${isActive?'active':''}`}>
              <span className="nav-icon">{n.icon}</span>
              <span>{n.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="user-pill">
            <div className="user-avatar">AK</div>
            <div className="user-meta">
              <span className="user-name">Arjun Kapoor</span>
              <span className="user-role">Mentee</span>
            </div>
            <span className="online-dot" />
          </div>
        </div>
      </aside>

      <div className="main-wrap">
        <header className="topbar">
          <div className="topbar-left" />
          <div className="topbar-right">
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/new')}>
              + New Session
            </button>
          </div>
        </header>
        <main className="page-content">{children}</main>
      </div>
    </div>
  )
}

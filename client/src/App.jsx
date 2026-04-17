import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './lib/AuthContext'
import Login from './pages/Login'
import Signup from './pages/Signup'
import MentorDashboard from './pages/MentorDashboard'
import MenteeDashboard from './pages/MenteeDashboard'
import NewSession from './pages/NewSession'
import Session from './pages/Session'
import IntelligenceDashboard from './pages/IntelligenceDashboard'
import RNManagerDashboard from './pages/RNManagerDashboard'
import MentorAvailability from './pages/MentorAvailability'
import DiscoverMentors from './pages/DiscoverMentors'
import MentorRequests from './pages/MentorRequests'
import MenteeRequests from './pages/MenteeRequests'

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',color:'#6b6f94',fontFamily:'DM Mono'}}>Loading…</div>
  if (!user) return <Navigate to="/login" />
  return children
}

function Dashboard() {
  const { profile, loading } = useAuth()
  if (loading) return null
  if (profile?.role === 'mentor') return <MentorDashboard />
  if (profile?.role === 'venture_partner') return <MentorDashboard />
  if (profile?.role === 'mentee') return <MenteeDashboard />
  if (profile?.role === 'rn_manager') return <RNManagerDashboard />
  // Default fallback while profile loads
  return <MentorDashboard />
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/new" element={<ProtectedRoute><NewSession /></ProtectedRoute>} />
      <Route path="/session/:id" element={<ProtectedRoute><Session /></ProtectedRoute>} />
      <Route path="/intelligence" element={<ProtectedRoute><IntelligenceDashboard /></ProtectedRoute>} />
      <Route path="/availability" element={<ProtectedRoute><MentorAvailability /></ProtectedRoute>} />
      <Route path="/discover" element={<ProtectedRoute><DiscoverMentors /></ProtectedRoute>} />
      <Route path="/mentor-requests" element={<ProtectedRoute><MentorRequests /></ProtectedRoute>} />
      <Route path="/mentee-requests" element={<ProtectedRoute><MenteeRequests /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  )
}

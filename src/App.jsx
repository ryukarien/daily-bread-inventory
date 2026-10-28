import { useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import LoginPage from './pages/LoginPage'
import SalePage from './pages/SalePage'
import InventoryPage from './pages/InventoryPage'
import ReportPage from './pages/ReportPage'
import DayPage from './pages/DayPage'
import AdminPage from './pages/AdminPage'
import { initialize } from './services/localDb'

export default function App() {
  const [status, setStatus] = useState({ loading: true, error: '' })
  useEffect(() => {
    initialize().then(() => setStatus({ loading: false, error: '' }))
      .catch((error) => setStatus({ loading: false, error: error.message || 'Could not start the local database.' }))
  }, [])

  if (status.loading) return <div className="center-screen"><div className="loading-card">Warming up the oven…</div></div>
  if (status.error) return <div className="center-screen"><div className="error-card">Could not load Daily Bread: {status.error}</div></div>

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route path="/sale" element={<SalePage />} />
          <Route path="/day" element={<DayPage />} />
          <Route path="/report" element={<ReportPage />} />
          <Route path="/inventory" element={<InventoryPage />} />
          <Route element={<ProtectedRoute adminOnly />}>
            <Route path="/admin" element={<AdminPage />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/sale" replace />} />
    </Routes>
  )
}

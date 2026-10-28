import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { LockKeyhole } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'

export default function LoginPage() {
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  if (user) return <Navigate to="/sale" replace />

  async function submit(event) {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      await login(username, password)
      navigate('/sale')
    } catch (loginError) {
      setError(loginError.message)
    } finally { setBusy(false) }
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <img src="./logo.svg" alt="Daily Bread toast mascot and DB logo" className="login-logo" />
        <h1>Welcome to Daily Bread</h1>
        <p className="muted">Sign in to manage today's shop.</p>
        <form className="login-form" onSubmit={submit}>
          <label htmlFor="username">Username</label>
          <input id="username" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" placeholder="@yourusername" required />
          <label htmlFor="password">Password</label>
          <input id="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required />
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button button-primary login-submit" type="submit" disabled={busy}><LockKeyhole size={19} />{busy ? 'Signing in…' : 'Log in'}</button>
        </form>
        <p className="local-note">Your shop data is saved on this device.</p>
      </section>
    </main>
  )
}

import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { authenticate } from '../services/localDb'

const AuthContext = createContext(null)
const SESSION_KEY = 'daily-bread-session'

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null') } catch { return null }
  })

  async function login(username, password) {
    const account = await authenticate(username, password)
    if (!account) throw new Error('That username or password is not correct.')
    localStorage.setItem(SESSION_KEY, JSON.stringify(account))
    setUser(account)
  }

  function logout() {
    localStorage.removeItem(SESSION_KEY)
    setUser(null)
  }

  const value = useMemo(() => ({ user, login, logout }), [user])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider.')
  return context
}

export function useReady() {
  const [ready, setReady] = useState(false)
  useEffect(() => { setReady(true) }, [])
  return ready
}

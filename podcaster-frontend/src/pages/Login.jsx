import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'

// identycznie jak w Dashboardzie
const getApiBase = () => {
  const envUrl = import.meta.env.VITE_API_URL?.trim()?.replace(/\/+$/, '')
  if (envUrl) return envUrl
  if (import.meta.env.DEV) return 'http://localhost:3000'
  return ''
}

function Login() {
  const navigate = useNavigate()
  const API_BASE = useMemo(getApiBase, [])
  const [mode, setMode] = useState('login') // 'login' | 'register'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [plan, setPlan] = useState('FREE')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!API_BASE) {
      setError('Brak adresu API – ustaw VITE_API_URL.')
      return
    }
    try {
      setLoading(true)
      const url = `${API_BASE}/auth/${mode === 'login' ? 'login' : 'register'}`
      const body = mode === 'login'
        ? { email, password }
        : { email, password, plan }

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      // spróbuj wyciągnąć komunikat serwera, jeśli jest
      if (!res.ok) {
        const msg = await res.json().catch(() => null)
        throw new Error(msg?.error || (mode === 'login' ? 'Błędny login lub hasło' : 'Nie udało się zarejestrować'))
      }

      const data = await res.json()
      // { token, user: {…} }
      localStorage.setItem('token', data.token)
      if (data.user) localStorage.setItem('user', JSON.stringify(data.user))

      navigate('/dashboard')
    } catch (err) {
      setError(err.message || 'Wystąpił błąd')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container" style={{ maxWidth: 480, margin: '2rem auto' }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button
          onClick={() => setMode('login')}
          disabled={mode === 'login'}
          style={{ padding: '0.5rem 1rem', borderRadius: 6, border: '1px solid #ddd', background: mode === 'login' ? '#e5e7eb' : 'white' }}
        >
          Zaloguj się
        </button>
        <button
          onClick={() => setMode('register')}
          disabled={mode === 'register'}
          style={{ padding: '0.5rem 1rem', borderRadius: 6, border: '1px solid #ddd', background: mode === 'register' ? '#e5e7eb' : 'white' }}
        >
          Zarejestruj się
        </button>
      </div>

      <h1 style={{ marginBottom: 16 }}>{mode === 'login' ? 'Logowanie' : 'Rejestracja'}</h1>

      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '1rem' }}>
          <label htmlFor="email">Email</label><br />
          <input
            type="email"
            id="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ width: '100%', padding: '0.5rem', borderRadius: 6, border: '1px solid #ccc' }}
          />
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label htmlFor="password">Hasło</label><br />
          <input
            type="password"
            id="password"
            required
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ width: '100%', padding: '0.5rem', borderRadius: 6, border: '1px solid #ccc' }}
          />
        </div>

        {mode === 'register' && (
          <div style={{ marginBottom: '1rem' }}>
            <label htmlFor="plan">Plan</label><br />
            <select
              id="plan"
              value={plan}
              onChange={(e) => setPlan(e.target.value)}
              style={{ width: '100%', padding: '0.5rem', borderRadius: 6, border: '1px solid #ccc' }}
            >
              <option value="FREE">FREE</option>
              <option value="STARTER">STARTER</option>
              <option value="PRO">PRO</option>
              <option value="BUSINESS">BUSINESS</option>
            </select>
            <small style={{ color: '#6b7280' }}>Domyślnie FREE — zawsze możesz później zmienić plan.</small>
          </div>
        )}

        {error && <div style={{ color: 'red', marginBottom: '1rem' }}>{error}</div>}

        <button type="submit" disabled={loading} style={{ padding: '0.6rem 1rem', borderRadius: 6, background: '#111827', color: 'white', border: 'none', fontWeight: 600 }}>
          {loading ? 'Przetwarzanie…' : (mode === 'login' ? 'Zaloguj się' : 'Utwórz konto')}
        </button>
      </form>
    </div>
  )
}

export default Login
import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import PodcastCard from '../components/PodcastCard'
import '../styles/Dashboard.css'

// ✅ Najpierw bierzemy VITE_API_URL (dev i prod). Jeśli brak – w DEV fallback na localhost.
const getApiBase = () => {
  const envUrl = import.meta.env.VITE_API_URL?.trim()?.replace(/\/+$/, '')
  if (envUrl) return envUrl
  if (import.meta.env.DEV) return 'http://localhost:3000'
  return '' // w prod bez URL-a pokażemy komunikat w useEffect
}

const getToken = () => localStorage.getItem('token') || ''

function Dashboard() {
  const API_BASE = useMemo(getApiBase, [])
  const navigate = useNavigate()

  const [activeTab, setActiveTab] = useState('podcasts')
  const [podcasts, setPodcasts] = useState([])

  // auth/limity
  const [me, setMe] = useState(null)            // { id, email, plan, storage_used, created_at, episodes }
  const [planLimits, setPlanLimits] = useState(null) // { maxEpisodes, maxStorageMB }

  const [newPodcast, setNewPodcast] = useState({
    title: '',
    description: '',
    coverFile: null,
    audioFile: null
  })

  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // 🔔 Ostrzeżenie w produkcji, jeśli brak VITE_API_URL
  useEffect(() => {
    if (!import.meta.env.DEV && !API_BASE) {
      console.warn('Brak VITE_API_URL w środowisku produkcyjnym – ustaw zmienną na Railway.')
      setError('Konfiguracja: brak adresu API w produkcji. Ustaw VITE_API_URL na Railway.')
    }
  }, [API_BASE])

  // 👤 Pobierz /me (jeśli mamy token)
  useEffect(() => {
    if (!API_BASE) return
    const token = getToken()
    if (!token) {
      setMe(null)
      setPlanLimits(null)
      return
    }
    ;(async () => {
      try {
        const res = await fetch(`${API_BASE}/me`, {
          headers: { Authorization: `Bearer ${token}` }
        })
        if (!res.ok) {
          // token nieprawidłowy/wygaśnięty
          setMe(null)
          setPlanLimits(null)
          return
        }
        const data = await res.json()
        setMe(data.user)
        setPlanLimits(data.planLimits || null)
      } catch (e) {
        console.error('/me error', e)
      }
    })()
  }, [API_BASE])

  // 📥 Pobranie podcastów (publiczne)
  useEffect(() => {
    const fetchPodcasts = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/podcasts`)
        if (!res.ok) throw new Error('Błąd pobierania danych')
        const data = await res.json()
        setPodcasts(data)
      } catch (err) {
        console.error('Błąd ładowania podcastów:', err)
        setError('Nie udało się załadować podcastów.')
      }
    }

    if (API_BASE) fetchPodcasts()
  }, [API_BASE])

  const handleInputChange = (e) => {
    const { name, value, files } = e.target
    if (files) {
      setNewPodcast({ ...newPodcast, [name]: files[0] })
    } else {
      setNewPodcast({ ...newPodcast, [name]: value })
    }
    setError('')
    setSuccess('')
  }

  const handleAddPodcast = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (!newPodcast.title.trim() || !newPodcast.description.trim()) {
      setError('Uzupełnij tytuł i opis podcastu.')
      return
    }
    if (!API_BASE) {
      setError('Brak adresu API – sprawdź VITE_API_URL (prod) lub odpal backend lokalnie (dev).')
      return
    }
    const token = getToken()
    if (!token) {
      setError('Musisz być zalogowany, aby dodać podcast.')
      return
    }

    const formData = new FormData()
    formData.append('title', newPodcast.title)
    formData.append('description', newPodcast.description)
    if (newPodcast.coverFile) formData.append('cover', newPodcast.coverFile)
    if (newPodcast.audioFile) formData.append('audio', newPodcast.audioFile)

    try {
      const res = await fetch(`${API_BASE}/api/podcasts`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      })

      if (!res.ok) {
        const msg = await res.json().catch(() => ({}))
        throw new Error(msg?.error || 'Błąd podczas zapisu')
      }

      const addedPodcast = await res.json()
      setPodcasts([addedPodcast, ...podcasts])
      setNewPodcast({ title: '', description: '', coverFile: null, audioFile: null })
      setSuccess('Podcast dodany!')
      setTimeout(() => setSuccess(''), 3000)

      // odśwież /me (liczniki/limity)
      try {
        const meRes = await fetch(`${API_BASE}/me`, { headers: { Authorization: `Bearer ${token}` } })
        if (meRes.ok) {
          const data = await meRes.json()
          setMe(data.user)
          setPlanLimits(data.planLimits || null)
        }
      } catch {}
    } catch (err) {
      console.error(err)
      setError(err?.message || 'Nie udało się zapisać podcastu.')
    }
  }

  // 🗑 Usuń podcast
  const handleDeletePodcast = useCallback(async (id) => {
    if (!API_BASE) {
      setError('Brak adresu API – sprawdź VITE_API_URL.')
      return
    }
    const token = getToken()
    if (!token) {
      setError('Musisz być zalogowany, aby usuwać podcasty.')
      return
    }
    const ok = window.confirm('Na pewno usunąć ten podcast?')
    if (!ok) return

    try {
      const res = await fetch(`${API_BASE}/api/podcasts/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!res.ok) {
        const msg = await res.json().catch(() => ({}))
        throw new Error(msg?.error || 'Błąd usuwania')
      }

      setPodcasts((prev) => prev.filter((p) => p.id !== id))
      setSuccess('Podcast usunięty!')
      setTimeout(() => setSuccess(''), 3000)

      // odśwież /me
      try {
        const meRes = await fetch(`${API_BASE}/me`, { headers: { Authorization: `Bearer ${token}` } })
        if (meRes.ok) {
          const data = await meRes.json()
          setMe(data.user)
          setPlanLimits(data.planLimits || null)
        }
      } catch {}
    } catch (err) {
      console.error(err)
      setError(err?.message || 'Nie udało się usunąć podcastu.')
    }
  }, [API_BASE])

  const loggedIn = !!me
  const episodesLimitReached =
    loggedIn &&
    planLimits?.maxEpisodes !== null &&
    typeof me?.episodes === 'number' &&
    me.episodes >= planLimits.maxEpisodes

  const canSubmit = loggedIn && !episodesLimitReached

  const handleLogout = () => {
    try {
      localStorage.removeItem('token')
      setMe(null)
      setPlanLimits(null)
      setSuccess('Wylogowano')
      setTimeout(() => setSuccess(''), 2000)
      // przekierowanie do /login (fallback na pełne odświeżenie)
      try {
        navigate('/login')
      } catch {
        window.location.href = '/login'
      }
    } catch {
      window.location.href = '/login'
    }
  }

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <div className="dashboard-tabs">
          <button onClick={() => setActiveTab('podcasts')} className={activeTab === 'podcasts' ? 'active' : ''}>
            Podcasty
          </button>
          <button onClick={() => setActiveTab('stats')} className={activeTab === 'stats' ? 'active' : ''}>
            Statystyki
          </button>
          <button onClick={() => setActiveTab('distribution')} className={activeTab === 'distribution' ? 'active' : ''}>
            Dystrybucja
          </button>
          <button onClick={() => setActiveTab('transcription')} className={activeTab === 'transcription' ? 'active' : ''}>
            Transkrypcje
          </button>
        </div>

        {/* Pasek statusu logowania i limitów + wylogowanie */}
        <div style={{ marginTop: 8, fontSize: 14, opacity: 0.9, display: 'flex', gap: 12, alignItems: 'center' }}>
          <div style={{ flex: 1 }}>
            {loggedIn ? (
              <>
                Zalogowano jako <strong>{me.email}</strong> (plan: <strong>{me.plan}</strong>)
                {planLimits && (
                  <> • odcinki: <strong>{me.episodes}</strong>{planLimits.maxEpisodes !== null ? ` / ${planLimits.maxEpisodes}` : ' / ∞'}
                  {planLimits.maxStorageMB !== null ? ` • limit storage: ${planLimits.maxStorageMB} MB` : ' • storage: ∞'}</>
                )}
                {episodesLimitReached && (
                  <span style={{ marginLeft: 8, color: '#b91c1c', fontWeight: 600 }}>
                    Limit odcinków w Twoim planie został osiągnięty.
                  </span>
                )}
              </>
            ) : (
              <span>Nie zalogowano — dodawanie/usuwanie wymaga tokenu w <code>localStorage.token</code>.</span>
            )}
          </div>
          {loggedIn && (
            <button
              onClick={handleLogout}
              style={{
                background: '#334155',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                padding: '0.45rem 0.7rem',
                cursor: 'pointer',
                fontWeight: 600
              }}
            >
              Wyloguj
            </button>
          )}
        </div>
      </div>

      <div className="dashboard-content">
        {activeTab === 'podcasts' && (
          <>
            <form className="podcast-form" onSubmit={handleAddPodcast}>
              <input
                type="text"
                name="title"
                placeholder="Tytuł podcastu"
                value={newPodcast.title}
                onChange={handleInputChange}
                disabled={!canSubmit}
              />
              <input
                type="text"
                name="description"
                placeholder="Opis"
                value={newPodcast.description}
                onChange={handleInputChange}
                disabled={!canSubmit}
              />
              <input
                type="file"
                name="coverFile"
                accept="image/*"
                onChange={handleInputChange}
                disabled={!canSubmit}
              />
              <input
                type="file"
                name="audioFile"
                accept="audio/*"
                onChange={handleInputChange}
                disabled={!canSubmit}
              />
              <button type="submit" disabled={!canSubmit}>
                {episodesLimitReached ? 'Limit odcinków osiągnięty' : 'Dodaj podcast'}
              </button>
            </form>

            {error && <div className="message error">{error}</div>}
            {success && <div className="message success">{success}</div>}

            <div className="podcast-list">
              {podcasts.map((p) => (
                <div key={p.id} className="podcast-item" style={{ position: 'relative' }}>
                  <PodcastCard podcast={p} />
                  <button
                    onClick={() => handleDeletePodcast(p.id)}
                    className="delete-button"
                    style={{
                      position: 'absolute',
                      top: 12,
                      right: 12,
                      background: '#ef4444',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 6,
                      padding: '0.35rem 0.6rem',
                      cursor: 'pointer',
                      fontWeight: 600
                    }}
                    aria-label={`Usuń podcast ${p.title}`}
                    disabled={!loggedIn}
                  >
                    🗑 Usuń
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        {activeTab === 'stats' && <div>📊 Tu będą statystyki</div>}

        {activeTab === 'distribution' && (
          <div className="distribution-settings">
            <h2>📤 Dystrybucja podcastu</h2>
            {podcasts.length === 0 ? (
              <p>Najpierw dodaj przynajmniej jeden podcast.</p>
            ) : (
              podcasts.map(p => (
                <div key={p.id} className="distribution-card">
                  <h3>{p.title}</h3>
                  <p><strong>RSS:</strong> <code>https://podcaster.pl/rss/{p.id}</code></p>

                  <div className="platform-options">
                    <label>
                      <input type="checkbox" defaultChecked />
                      Spotify
                    </label>
                    <label>
                      <input type="checkbox" />
                      Apple Podcasts
                    </label>
                    <label>
                      <input type="checkbox" />
                      Amazon Music
                    </label>
                  </div>

                  <button className="distribute-button" disabled>
                    Zgłoś podcast (funkcja wkrótce)
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'transcription' && <div>📝 Transkrypcje i nagrania</div>}
      </div>
    </div>
  )
}

export default Dashboard
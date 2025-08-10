import { useState, useEffect, useMemo, useCallback } from 'react'
import { Link } from 'react-router-dom'
import PodcastCard from '../components/PodcastCard'
import '../styles/Dashboard.css'

// API base (VITE_API_URL → dev fallback na localhost)
const getApiBase = () => {
  const envUrl = import.meta.env.VITE_API_URL?.trim()?.replace(/\/+$/, '')
  if (envUrl) return envUrl
  if (import.meta.env.DEV) return 'http://localhost:3000'
  return ''
}
const getToken = () => localStorage.getItem('token') || ''

function Dashboard() {
  const API_BASE = useMemo(getApiBase, [])
  const [activeTab, setActiveTab] = useState('podcasts')
  const [podcasts, setPodcasts] = useState([])

  // auth/limity
  const [me, setMe] = useState(null)               // { id, email, plan, storage_used, created_at, episodes }
  const [planLimits, setPlanLimits] = useState(null) // { maxEpisodes, maxStorageMB }

  const [newPodcast, setNewPodcast] = useState({
    title: '',
    description: '',
    coverFile: null,
    audioFile: null
  })

  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // ostrzeżenie prod bez VITE_API_URL
  useEffect(() => {
    if (!import.meta.env.DEV && !API_BASE) {
      console.warn('Brak VITE_API_URL w produkcji – ustaw zmienną na Railway.')
      setError('Konfiguracja: brak adresu API w produkcji. Ustaw VITE_API_URL na Railway.')
    }
  }, [API_BASE])

  // /me — stan logowania i limity
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

// 📥 Pobranie odcinków WYŁĄCZNIE moich (wymaga tokenu)
useEffect(() => {
  if (!API_BASE) return
  const token = getToken()
  if (!token) { setPodcasts([]); return }

  ;(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/my-podcasts`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!res.ok) throw new Error('Błąd pobierania danych')
      const data = await res.json()
      setPodcasts(data)
    } catch (err) {
      console.error('Błąd ładowania podcastów:', err)
      setError('Nie udało się załadować podcastów.')
    }
  })()
}, [API_BASE, me?.id])

  // formularz
  const handleInputChange = (e) => {
    const { name, value, files } = e.target
    if (files) {
      setNewPodcast(prev => ({ ...prev, [name]: files[0] }))
    } else {
      setNewPodcast(prev => ({ ...prev, [name]: value }))
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
      setPodcasts(prev => [addedPodcast, ...prev])
      setNewPodcast({ title: '', description: '', coverFile: null, audioFile: null })
      setSuccess('Podcast dodany!')
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
      setError(err?.message || 'Nie udało się zapisać podcastu.')
    }
  }

  // usuwanie
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

      setPodcasts(prev => prev.filter(p => p.id !== id))
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

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        {/* Zakładki tylko dla zalogowanych */}
        {loggedIn && (
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
        )}

        <div style={{ marginTop: 8, fontSize: 14, opacity: 0.9 }}>
          {loggedIn ? (
            <>
              Zalogowano jako <strong>{me.email}</strong> (plan: <strong>{me.plan}</strong>)
              {planLimits && (
                <> • odcinki: <strong>{me.episodes}</strong>{planLimits.maxEpisodes !== null ? ` / ${planLimits.maxEpisodes}` : ' / ∞'}
                {planLimits.maxStorageMB !== null ? ` • limit storage: ${planLimits.maxStorageMB} MB` : ' • storage: ∞'}</>
              )}
            </>
          ) : (
            <span>Nie zalogowano — <Link to="/login">zaloguj się</Link>, aby zarządzać odcinkami.</span>
          )}
        </div>
      </div>

      <div className="dashboard-content">
        {/* GATE: cały panel dostępny tylko po zalogowaniu */}
        {!loggedIn ? (
          <div className="card" style={{ padding: '1.25rem', border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff' }}>
            <h3 style={{ marginTop: 0 }}>Zarządzanie podcastami</h3>
            <p>Ta sekcja jest dostępna tylko po zalogowaniu.</p>
            <Link to="/login" style={{ display: 'inline-block', background: '#3b82f6', color: '#fff', padding: '0.5rem 0.9rem', borderRadius: 6, fontWeight: 600 }}>
              Zaloguj się
            </Link>
          </div>
        ) : (
          <>
            {activeTab === 'podcasts' && (
              <>
                {/* Formularz dodawania */}
                <form className="podcast-form" onSubmit={handleAddPodcast}>
                  <input
                    type="text"
                    name="title"
                    placeholder="Tytuł podcastu"
                    value={newPodcast.title}
                    onChange={handleInputChange}
                  />
                  <input
                    type="text"
                    name="description"
                    placeholder="Opis"
                    value={newPodcast.description}
                    onChange={handleInputChange}
                  />
                  <input
                    type="file"
                    name="coverFile"
                    accept="image/*"
                    onChange={handleInputChange}
                  />
                  <input
                    type="file"
                    name="audioFile"
                    accept="audio/*"
                    onChange={handleInputChange}
                  />
                  <button type="submit">Dodaj podcast</button>
                </form>

                {error && <div className="message error">{error}</div>}
                {success && <div className="message success">{success}</div>}

                {/* Lista moich odcinków */}
                <div className="podcast-list">
                  {podcasts.map((p) => (
                    <div key={p.id} className="podcast-item" style={{ position: 'relative' }}>
                      <PodcastCard podcast={p} />
                      <button
                        onClick={() => handleDeletePodcast(p.id)}
                        className="delete-button"
                        style={{ position: 'absolute', top: 12, right: 12, background: '#ef4444', color: '#fff', border: 'none', borderRadius: 6, padding: '0.35rem 0.6rem', cursor: 'pointer', fontWeight: 600 }}
                        aria-label={`Usuń podcast ${p.title}`}
                      >
                        🗑 Usuń
                      </button>
                    </div>
                  ))}
                  {podcasts.length === 0 && <p>Nie masz jeszcze żadnych odcinków.</p>}
                </div>
              </>
            )}

            {activeTab === 'stats' && <div>📊 Tu będą statystyki</div>}
            {activeTab === 'distribution' && <div>📤 Tu będą ustawienia dystrybucji</div>}
            {activeTab === 'transcription' && <div>📝 Transkrypcje i nagrania</div>}
          </>
        )}
      </div>
    </div>
  )
}

export default Dashboard
import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import PodcastCard from '../components/PodcastCard'
import '../styles/Dashboard.css'
import { API_BASE, apiGet, apiPost, apiDelete, getToken } from '../lib/api'

// Uwaga: do czasu przejścia na strukturę feedów, zakładka „Podcasty” działa na "moich podcastach".
// Zakładka „Kanały” jest już w UI, działa miękko (placeholder, a gdy API istnieje – pokaże listę).

function Dashboard() {
  const [activeTab, setActiveTab] = useState('podcasts')

  // auth/limity
  const [me, setMe] = useState(null)                // { id, email, plan, storage_used, created_at, episodes }
  const [planLimits, setPlanLimits] = useState(null) // { maxEpisodes, maxStorageMB }

  // MOJE PODCASTY (legacy, do czasu wprowadzenia feedów)
  const [podcasts, setPodcasts] = useState([])
  const [newPodcast, setNewPodcast] = useState({
    title: '', description: '', coverFile: null, audioFile: null
  })

  // MOJE KANAŁY (feeds) – miękkie włączenie
  const [feeds, setFeeds] = useState([])            // gdy API jest, zapełni się
  const [feedsSupported, setFeedsSupported] = useState(true) // jeśli API 404, pokażemy placeholder

  // UI status
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Ostrzeżenie w prod, jeśli brak API_BASE
  useEffect(() => {
    if (!import.meta.env.DEV && !API_BASE) {
      console.warn('Brak VITE_API_URL w produkcji – ustaw zmienną na Railway.')
      setError('Konfiguracja: brak adresu API w produkcji. Ustaw VITE_API_URL na Railway.')
    }
  }, [])

  // /me — stan logowania i limity
  useEffect(() => {
    if (!API_BASE) return
    const token = getToken()
    if (!token) {
      setMe(null); setPlanLimits(null)
      return
    }
    ;(async () => {
      try {
        const data = await apiGet('/me')
        setMe(data.user)
        setPlanLimits(data.planLimits || null)
      } catch {
        setMe(null); setPlanLimits(null)
      }
    })()
  }, [])

  // 📥 Pobranie MOICH odcinków (legacy) – wymaga tokenu
  useEffect(() => {
    if (!API_BASE) return
    if (!me?.id) { setPodcasts([]); return }

    ;(async () => {
      try {
        const data = await apiGet('/api/my-podcasts')
        setPodcasts(data)
      } catch (err) {
        console.error('Błąd ładowania podcastów:', err)
        setError('Nie udało się załadować podcastów.')
      }
    })()
  }, [me?.id])

  // 📥 Próba pobrania MOICH KANAŁÓW (feeds) – jeśli endpoint nie istnieje, pokażemy placeholder
  useEffect(() => {
    if (!API_BASE) return
    if (!me?.id) { setFeeds([]); return }

    ;(async () => {
      try {
        const list = await apiGet('/api/feeds')     // przyszły endpoint
        // jeśli się powiedzie – mamy wsparcie feedów
        setFeedsSupported(true)
        setFeeds(Array.isArray(list) ? list : [])
      } catch (e) {
        // najpewniej 404 – feature jeszcze nie wdrożony po stronie backendu
        setFeedsSupported(false)
        setFeeds([])
      }
    })()
  }, [me?.id])

  // formularz (legacy odcinki)
  const handleInputChange = (e) => {
    const { name, value, files } = e.target
    setNewPodcast(prev => ({ ...prev, [name]: files ? files[0] : value }))
    setError(''); setSuccess('')
  }

  const handleAddPodcast = async (e) => {
    e.preventDefault()
    setError(''); setSuccess('')

    if (!newPodcast.title.trim() || !newPodcast.description.trim()) {
      setError('Uzupełnij tytuł i opis podcastu.')
      return
    }
    if (!API_BASE) {
      setError('Brak adresu API – sprawdź VITE_API_URL (prod) lub odpal backend lokalnie (dev).')
      return
    }
    if (!getToken()) {
      setError('Musisz być zalogowany, aby dodać podcast.')
      return
    }

    const formData = new FormData()
    formData.append('title', newPodcast.title)
    formData.append('description', newPodcast.description)
    if (newPodcast.coverFile) formData.append('cover', newPodcast.coverFile)
    if (newPodcast.audioFile) formData.append('audio', newPodcast.audioFile)

    try {
      const added = await apiPost('/api/podcasts', formData, true)
      setPodcasts(prev => [added, ...prev])
      setNewPodcast({ title: '', description: '', coverFile: null, audioFile: null })
      setSuccess('Podcast dodany!')
      setTimeout(() => setSuccess(''), 3000)

      // odśwież /me (liczniki/limity)
      try {
        const data = await apiGet('/me')
        setMe(data.user)
        setPlanLimits(data.planLimits || null)
      } catch {}
    } catch (err) {
      console.error(err)
      setError(err?.message || 'Nie udało się zapisać podcastu.')
    }
  }

  // usuwanie (legacy odcinki)
  const handleDeletePodcast = useCallback(async (id) => {
    if (!API_BASE) {
      setError('Brak adresu API – sprawdź VITE_API_URL.')
      return
    }
    if (!getToken()) {
      setError('Musisz być zalogowany, aby usuwać podcasty.')
      return
    }
    const ok = window.confirm('Na pewno usunąć ten podcast?')
    if (!ok) return

    try {
      await apiDelete(`/api/podcasts/${id}`)
      setPodcasts(prev => prev.filter(p => p.id !== id))
      setSuccess('Podcast usunięty!')
      setTimeout(() => setSuccess(''), 3000)

      // odśwież /me
      try {
        const data = await apiGet('/me')
        setMe(data.user)
        setPlanLimits(data.planLimits || null)
      } catch {}
    } catch (err) {
      console.error(err)
      setError(err?.message || 'Nie udało się usunąć podcastu.')
    }
  }, [])

  const loggedIn = !!me

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        {/* Zakładki tylko dla zalogowanych */}
        {loggedIn && (
          <div className="dashboard-tabs">
            <button onClick={() => setActiveTab('feeds')} className={activeTab === 'feeds' ? 'active' : ''}>
              Kanały
            </button>
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

        {/* Pasek statusu — tylko po zalogowaniu */}
        {loggedIn && (
          <div style={{ marginTop: 8, fontSize: 14, opacity: 0.9 }}>
            Zalogowano jako <strong>{me.email}</strong> (plan: <strong>{me.plan}</strong>)
            {planLimits && (
              <> • odcinki: <strong>{me.episodes}</strong>{planLimits.maxEpisodes !== null ? ` / ${planLimits.maxEpisodes}` : ' / ∞'}
              {planLimits.maxStorageMB !== null ? ` • limit storage: ${planLimits.maxStorageMB} MB` : ' • storage: ∞'}</>
            )}
          </div>
        )}
      </div>

      <div className="dashboard-content">
        {/* GATE: cały panel dostępny tylko po zalogowaniu */}
        {!loggedIn ? (
          <div className="card" style={{ padding: '1.25rem', border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff' }}>
            <h3 style={{ marginTop: 0 }}>Panel dostępny po zalogowaniu</h3>
            <p>Zaloguj się, aby zarządzać kanałami i odcinkami.</p>
            <Link to="/login" style={{ display: 'inline-block', background: '#3b82f6', color: '#fff', padding: '0.5rem 0.9rem', borderRadius: 6, fontWeight: 600 }}>
              Zaloguj się
            </Link>
          </div>
        ) : (
          <>
            {/* ───── KANAŁY (feeds) ───── */}
            {activeTab === 'feeds' && (
              <div className="card" style={{ padding: '1rem', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8 }}>
                {!feedsSupported ? (
                  <>
                    <h3 style={{ marginTop: 0 }}>Kanały (wkrótce)</h3>
                    <p>
                      Struktura kanałów nie jest jeszcze włączona na backendzie. Wkrótce dodamy możliwość tworzenia wielu kanałów
                      (np. „TechTalk” i „NewsDaily”), a odcinki będą przypisane do wybranego kanału.
                    </p>
                  </>
                ) : (
                  <>
                    <h3 style={{ marginTop: 0 }}>Moje kanały</h3>
                    {feeds.length === 0 ? (
                      <p>Nie masz jeszcze żadnych kanałów.</p>
                    ) : (
                      <ul style={{ margin: 0, paddingLeft: '1rem' }}>
                        {feeds.map(f => (
                          <li key={f.id}>
                            <strong>{f.name}</strong>
                            {f.description ? <span> — {f.description}</span> : null}
                          </li>
                        ))}
                      </ul>
                    )}
                    {/* Miejsce na formularz tworzenia kanału, gdy endpoint będzie gotowy */}
                  </>
                )}
              </div>
            )}

            {/* ───── PODCASTY (legacy – moje odcinki) ───── */}
            {activeTab === 'podcasts' && (
              <>
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
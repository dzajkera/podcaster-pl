import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import PodcastCard from '../components/PodcastCard'
import '../styles/Dashboard.css'
import { API_BASE, apiGet, apiPost, /* apiDelete, */ getToken } from '../lib/api'

function Dashboard() {
  const [activeTab, setActiveTab] = useState('feeds')

  // auth/limity
  const [me, setMe] = useState(null)                 // { id, email, plan, storage_used, created_at, episodes }
  const [planLimits, setPlanLimits] = useState(null) // { maxEpisodes, maxStorageMB }

  // feeds + episodes
  const [feeds, setFeeds] = useState([])
  const [activeFeedId, setActiveFeedId] = useState(null)
  const [episodes, setEpisodes] = useState([])

  // formularz nowego epizodu
  const [newEpisode, setNewEpisode] = useState({
    title: '', description: '', coverFile: null, audioFile: null
  })

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
    const token = getToken()
    if (!API_BASE || !token) { setMe(null); setPlanLimits(null); return }
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

  // moje feedy (po zalogowaniu)
  useEffect(() => {
    if (!me?.id) { setFeeds([]); setActiveFeedId(null); setEpisodes([]); return }
    ;(async () => {
      try {
        const all = await apiGet('/api/feeds')         // backend zwraca wszystkie
        const mine = all.filter(f => String(f.user_id) === String(me.id))
        setFeeds(mine)
        if (mine.length && !activeFeedId) setActiveFeedId(mine[0].id)
      } catch (err) {
        console.error('Błąd ładowania feedów:', err)
        setError(err.message || 'Nie udało się załadować kanałów.')
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.id])

  // epizody wybranego feedu
  useEffect(() => {
    if (!activeFeedId) { setEpisodes([]); return }
    ;(async () => {
      try {
        const eps = await apiGet(`/api/feeds/${activeFeedId}/episodes`)
        setEpisodes(eps)
      } catch (err) {
        console.error('Błąd ładowania epizodów:', err)
        setError(err.message || 'Nie udało się załadować epizodów.')
      }
    })()
  }, [activeFeedId])

  // formularz
  const handleInputChange = (e) => {
    const { name, value, files } = e.target
    setNewEpisode(prev => ({ ...prev, [name]: files ? files[0] : value }))
    setError(''); setSuccess('')
  }

  const handleAddEpisode = async (e) => {
    e.preventDefault()
    setError(''); setSuccess('')

    if (!activeFeedId) { setError('Wybierz kanał, do którego chcesz dodać odcinek.'); return }
    if (!newEpisode.title.trim() || !newEpisode.description.trim()) {
      setError('Uzupełnij tytuł i opis odcinka.')
      return
    }
    if (!API_BASE) {
      setError('Brak adresu API – sprawdź VITE_API_URL (prod) lub odpal backend lokalnie (dev).')
      return
    }
    if (!getToken()) {
      setError('Musisz być zalogowany, aby dodać odcinek.')
      return
    }

    const formData = new FormData()
    formData.append('title', newEpisode.title)
    formData.append('description', newEpisode.description)
    if (newEpisode.coverFile) formData.append('cover', newEpisode.coverFile)
    if (newEpisode.audioFile) formData.append('audio', newEpisode.audioFile)

    try {
      const added = await apiPost(`/api/feeds/${activeFeedId}/episodes`, formData, true)
      setEpisodes(prev => [added, ...prev])
      setNewEpisode({ title: '', description: '', coverFile: null, audioFile: null })
      setSuccess('Odcinek dodany!')
      setTimeout(() => setSuccess(''), 3000)

      // odśwież /me (liczniki/limity)
      try {
        const data = await apiGet('/me')
        setMe(data.user)
        setPlanLimits(data.planLimits || null)
      } catch {}
    } catch (err) {
      console.error(err)
      setError(err?.message || 'Nie udało się zapisać odcinka.')
    }
  }

  // usuwanie epizodu (odkomentuj, gdy masz DELETE /api/episodes/:id)
  /*
  const handleDeleteEpisode = useCallback(async (id) => {
    if (!activeFeedId) return
    if (!getToken()) { setError('Musisz być zalogowany, aby usuwać odcinki.'); return }
    const ok = window.confirm('Na pewno usunąć ten odcinek?')
    if (!ok) return
    try {
      await apiDelete(`/api/episodes/${id}`)
      setEpisodes(prev => prev.filter(p => p.id !== id))
      setSuccess('Odcinek usunięty!')
      setTimeout(() => setSuccess(''), 3000)
      try {
        const data = await apiGet('/me')
        setMe(data.user)
        setPlanLimits(data.planLimits || null)
      } catch {}
    } catch (err) {
      console.error(err)
      setError(err?.message || 'Nie udało się usunąć odcinka.')
    }
  }, [activeFeedId])
  */

  const loggedIn = !!me

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        {loggedIn && (
          <div className="dashboard-tabs">
            <button onClick={() => setActiveTab('feeds')} className={activeTab === 'feeds' ? 'active' : ''}>
              Kanały
            </button>
            <button onClick={() => setActiveTab('episodes')} className={activeTab === 'episodes' ? 'active' : ''}>
              Odcinki
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
            {/* Kanały */}
            {activeTab === 'feeds' && (
              <div className="card" style={{ padding: '1rem', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8 }}>
                <h3 style={{ marginTop: 0 }}>Moje kanały</h3>
                {feeds.length === 0 ? (
                  <p>Nie masz jeszcze żadnych kanałów.</p>
                ) : (
                  <>
                    <div style={{ marginBottom: 12 }}>
                      <label htmlFor="feedSelect" style={{ fontWeight: 600, marginRight: 8 }}>Aktywny kanał:</label>
                      <select
                        id="feedSelect"
                        value={activeFeedId || ''}
                        onChange={(e) => setActiveFeedId(e.target.value || null)}
                      >
                        {feeds.map(f => (
                          <option key={f.id} value={f.id}>
                            {f.title || `Kanał #${f.id}`}
                          </option>
                        ))}
                      </select>
                    </div>
                    <ul style={{ margin: 0, paddingLeft: '1rem' }}>
                      {feeds.map(f => (
                        <li key={f.id}>
                          <strong>{f.title || `Kanał #${f.id}`}</strong>
                          {f.description ? <span> — {f.description}</span> : null}
                          {String(f.id) === String(activeFeedId) && <em> (aktywny)</em>}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            )}

            {/* Odcinki wybranego kanału */}
            {activeTab === 'episodes' && (
              <>
                <div style={{ marginBottom: 16, display: 'flex', gap: 12, alignItems: 'center' }}>
                  <label htmlFor="feedSelect2" style={{ fontWeight: 600 }}>Kanał:</label>
                  <select
                    id="feedSelect2"
                    value={activeFeedId || ''}
                    onChange={(e) => setActiveFeedId(e.target.value || null)}
                  >
                    {feeds.map(f => (
                      <option key={f.id} value={f.id}>
                        {f.title || `Kanał #${f.id}`}
                      </option>
                    ))}
                  </select>
                  {feeds.length === 0 && <span>Brak kanałów. Najpierw utwórz kanał.</span>}
                </div>

                <form className="podcast-form" onSubmit={handleAddEpisode}>
                  <input
                    type="text"
                    name="title"
                    placeholder="Tytuł odcinka"
                    value={newEpisode.title}
                    onChange={handleInputChange}
                  />
                  <input
                    type="text"
                    name="description"
                    placeholder="Opis"
                    value={newEpisode.description}
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
                  <button type="submit" disabled={!activeFeedId}>Dodaj odcinek</button>
                </form>

                {error && <div className="message error">{error}</div>}
                {success && <div className="message success">{success}</div>}

                <div className="podcast-list">
                  {episodes.map((p) => (
                    <div key={p.id} className="podcast-item" style={{ position: 'relative' }}>
                      <PodcastCard podcast={p} />
                      <button
                        // onClick={() => handleDeleteEpisode(p.id)}
                        disabled
                        className="delete-button"
                        style={{ position: 'absolute', top: 12, right: 12, background: '#9ca3af', color: '#fff', border: 'none', borderRadius: 6, padding: '0.35rem 0.6rem', cursor: 'not-allowed', fontWeight: 600 }}
                        aria-label={`Usuń odcinek ${p.title}`}
                        title="Usuwanie wkrótce (backend DELETE /api/episodes/:id)"
                      >
                        🗑 Usuń
                      </button>
                    </div>
                  ))}
                  {episodes.length === 0 && <p>Ten kanał nie ma jeszcze odcinków.</p>}
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
import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import '../styles/Dashboard.css'
import { API_BASE, apiGet, apiPost, getToken } from '../lib/api'

// MVP: pełny fokus na feeds → episodes. Legacy "podcasts" wycinamy.

function Dashboard() {
  const [activeTab, setActiveTab] = useState('feeds')

  // auth/limity
  const [me, setMe] = useState(null)                 // { id, email, plan, storage_used, created_at, episodes }
  const [planLimits, setPlanLimits] = useState(null) // { maxEpisodes, maxStorageMB }

  // FEEDY
  const [feeds, setFeeds] = useState([])
  const [activeFeedId, setActiveFeedId] = useState(null)
  const [newFeed, setNewFeed] = useState({ title: '', slug: '', description: '' })

  // EPIZODY
  const [episodes, setEpisodes] = useState([])
  const [newEpisode, setNewEpisode] = useState({
    title: '', description: '', coverFile: null, audioFile: null
  })

  // UI
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

  // Pobierz feedy użytkownika
  useEffect(() => {
    if (!API_BASE || !me?.id) return
    ;(async () => {
      try {
        const list = await apiGet('/api/feeds')
        // backend obecnie zwraca wszystkie feedy; filtrujemy po user_id
        const mine = Array.isArray(list) ? list.filter(f => String(f.user_id) === String(me.id)) : []
        setFeeds(mine)
        // ustaw aktywny feed jeśli brak
        if (!activeFeedId && mine.length > 0) {
          setActiveFeedId(mine[0].id)
        }
      } catch (e) {
        console.error('Błąd /api/feeds', e)
        setFeeds([])
      }
    })()
  }, [me?.id])

  // Pobierz epizody aktywnego feedu
  useEffect(() => {
    if (!API_BASE || !me?.id || !activeFeedId) { setEpisodes([]); return }
    ;(async () => {
      try {
        const list = await apiGet(`/api/feeds/${activeFeedId}/episodes`)
        setEpisodes(Array.isArray(list) ? list : [])
      } catch (e) {
        console.error('Błąd /api/feeds/:id/episodes', e)
        setEpisodes([])
      }
    })()
  }, [me?.id, activeFeedId])

  // Handlery formularzy
  const handleFeedField = (e) => {
    const { name, value } = e.target
    setNewFeed(prev => ({ ...prev, [name]: value }))
    setError(''); setSuccess('')
  }

  const handleEpisodeField = (e) => {
    const { name, value, files } = e.target
    setNewEpisode(prev => ({ ...prev, [name]: files ? files[0] : value }))
    setError(''); setSuccess('')
  }

  const createFeed = async (e) => {
    e.preventDefault()
    setError(''); setSuccess('')

    if (!newFeed.title.trim()) {
      setError('Podaj tytuł kanału.')
      return
    }
    try {
      const body = {
        title: newFeed.title.trim(),
        slug: newFeed.slug?.trim() || null,
        description: newFeed.description?.trim() || ''
      }
      const created = await apiPost('/api/feeds', body, false)
      setFeeds(prev => [created, ...prev])
      setNewFeed({ title: '', slug: '', description: '' })
      setActiveFeedId(created.id)
      setActiveTab('episodes')
      setSuccess('Kanał utworzony!')
      setTimeout(() => setSuccess(''), 2500)
    } catch (err) {
      console.error(err)
      setError(err?.message || 'Nie udało się utworzyć kanału.')
    }
  }

  const addEpisode = async (e) => {
    e.preventDefault()
    setError(''); setSuccess('')

    if (!activeFeedId) { setError('Wybierz kanał.'); return }
    if (!newEpisode.title.trim() || !newEpisode.description.trim()) {
      setError('Podaj tytuł i opis odcinka.')
      return
    }

    const formData = new FormData()
    formData.append('title', newEpisode.title)
    formData.append('description', newEpisode.description)
    if (newEpisode.coverFile) formData.append('cover', newEpisode.coverFile)
    if (newEpisode.audioFile) formData.append('audio', newEpisode.audioFile)

    try {
      const ep = await apiPost(`/api/feeds/${activeFeedId}/episodes`, formData, true)
      setEpisodes(prev => [ep, ...prev])
      setNewEpisode({ title: '', description: '', coverFile: null, audioFile: null })
      setSuccess('Odcinek dodany!')
      setTimeout(() => setSuccess(''), 2500)
    } catch (err) {
      console.error(err)
      setError(err?.message || 'Nie udało się dodać odcinka.')
    }
  }

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
            <Link to="/login" className="btn-primary">Zaloguj się</Link>
          </div>
        ) : (
          <>
            {error && <div className="message error">{error}</div>}
            {success && <div className="message success">{success}</div>}

            {/* ───── KANAŁY ───── */}
            {activeTab === 'feeds' && (
              <div className="grid" style={{ gap: 16 }}>
                <form onSubmit={createFeed} className="card" style={{ padding: 16 }}>
                  <h3 style={{ marginTop: 0 }}>Nowy kanał</h3>
                  <input name="title" placeholder="Tytuł *" value={newFeed.title} onChange={handleFeedField} />
                  <input name="slug" placeholder="Slug (opcjonalnie)" value={newFeed.slug} onChange={handleFeedField} />
                  <input name="description" placeholder="Opis (opcjonalnie)" value={newFeed.description} onChange={handleFeedField} />
                  <button type="submit">Utwórz kanał</button>
                </form>

                <div className="card" style={{ padding: 16 }}>
                  <h3 style={{ marginTop: 0 }}>Moje kanały</h3>
                  {feeds.length === 0 ? (
                    <p>Nie masz jeszcze żadnych kanałów.</p>
                  ) : (
                    <ul style={{ margin: 0, paddingLeft: 16 }}>
                      {feeds.map(f => (
                        <li key={f.id} style={{ marginBottom: 6 }}>
                          <label style={{ cursor: 'pointer' }}>
                            <input
                              type="radio"
                              name="activeFeed"
                              value={f.id}
                              checked={String(activeFeedId) === String(f.id)}
                              onChange={() => setActiveFeedId(f.id)}
                              style={{ marginRight: 8 }}
                            />
                            <strong>{f.title || f.name || `Kanał ${f.id}`}</strong>
                            {f.description ? <span> — {f.description}</span> : null}
                          </label>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}

            {/* ───── ODCINKI ───── */}
            {activeTab === 'episodes' && (
              <>
                <div className="card" style={{ padding: 16, marginBottom: 16 }}>
                  <h3 style={{ marginTop: 0 }}>Dodaj odcinek</h3>
                  {feeds.length === 0 ? (
                    <p>Najpierw utwórz kanał w zakładce <strong>Kanały</strong>.</p>
                  ) : (
                    <>
                      <div style={{ marginBottom: 8 }}>
                        <label>Aktywny kanał:&nbsp;</label>
                        <select value={activeFeedId || ''} onChange={(e) => setActiveFeedId(e.target.value)}>
                          {feeds.map(f => (
                            <option key={f.id} value={f.id}>{f.title || f.name || `Kanał ${f.id}`}</option>
                          ))}
                        </select>
                      </div>

                      <form onSubmit={addEpisode}>
                        <input
                          type="text"
                          name="title"
                          placeholder="Tytuł odcinka"
                          value={newEpisode.title}
                          onChange={handleEpisodeField}
                        />
                        <input
                          type="text"
                          name="description"
                          placeholder="Opis"
                          value={newEpisode.description}
                          onChange={handleEpisodeField}
                        />
                        <input type="file" name="coverFile" accept="image/*" onChange={handleEpisodeField} />
                        <input type="file" name="audioFile" accept="audio/*" onChange={handleEpisodeField} />
                        <button type="submit">Dodaj odcinek</button>
                      </form>
                    </>
                  )}
                </div>

                <div className="podcast-list">
                  {episodes.map(ep => (
                    <div key={ep.id} className="podcast-item">
                      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                        {ep.coverUrl ? (
                          <img src={ep.coverUrl} alt="" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8 }} />
                        ) : (
                          <div style={{ width: 64, height: 64, background: '#eee', borderRadius: 8 }} />
                        )}
                        <div>
                          <div style={{ fontWeight: 700 }}>{ep.title}</div>
                          <div style={{ fontSize: 14, opacity: 0.85 }}>{ep.description}</div>
                          {ep.audioUrl && (
                            <audio controls style={{ marginTop: 6, width: 280 }}>
                              <source src={ep.audioUrl} />
                            </audio>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  {episodes.length === 0 && (
                    <p>Brak odcinków w wybranym kanale.</p>
                  )}
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
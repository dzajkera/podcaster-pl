
import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import '../styles/Dashboard.css'
import Alert from '../components/Alert'
import { API_BASE, apiGet, apiPost, apiDelete, getToken } from '../lib/api'

function Dashboard() {
  const [activeTab, setActiveTab] = useState('feeds')

  // auth/info
  const [me, setMe] = useState(null)
  const [planLimits, setPlanLimits] = useState(null)

  // feeds
  const [feeds, setFeeds] = useState([])
  const [activeFeedId, setActiveFeedId] = useState(null)
  const [newFeed, setNewFeed] = useState({ title: '', slug: '', description: '' })

  // episodes
  const [episodes, setEpisodes] = useState([])
  const [newEpisode, setNewEpisode] = useState({ title: '', description: '', coverFile: null, audioFile: null })

  // ui
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    if (!import.meta.env.DEV && !API_BASE) {
      console.warn('Brak VITE_API_URL w produkcji – ustaw zmienną na Railway.')
      setError('Konfiguracja: brak adresu API w produkcji. Ustaw VITE_API_URL na Railway.')
    }
  }, [])

  // /me
  useEffect(() => {
    if (!API_BASE) return
    const token = getToken()
    if (!token) { setMe(null); setPlanLimits(null); return }
    ;(async () => {
      try {
        const data = await apiGet('/me')
        setMe(data.user)
        setPlanLimits(data.planLimits || null)
      } catch {
        setMe(null)
        setPlanLimits(null)
      }
    })()
  }, [])

  // feeds
  useEffect(() => {
    if (!API_BASE || !me?.id) return
    ;(async () => {
      try {
        const list = await apiGet('/api/feeds')
        const mine = Array.isArray(list) ? list.filter(f => String(f.user_id) === String(me.id)) : []
        setFeeds(mine)
        if (!activeFeedId && mine.length > 0) setActiveFeedId(mine[0].id)
      } catch (e) {
        console.error(e)
        setFeeds([])
      }
    })()
  }, [me?.id])

  // episodes for active feed
  useEffect(() => {
    if (!API_BASE || !me?.id || !activeFeedId) { setEpisodes([]); return }
    ;(async () => {
      try {
        const list = await apiGet(`/api/feeds/${activeFeedId}/episodes`)
        setEpisodes(Array.isArray(list) ? list : [])
      } catch (e) {
        console.error(e)
        setEpisodes([])
      }
    })()
  }, [me?.id, activeFeedId])

  // --- limity (UX) ---
  const atMaxFeeds = !!(planLimits && planLimits.maxFeeds !== null && feeds.length >= planLimits.maxFeeds)
  const atMaxEpisodes = !!(planLimits && planLimits.maxEpisodesPerFeed !== null && episodes.length >= planLimits.maxEpisodesPerFeed)

  // handlers
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
    if (!newFeed.title.trim()) return setError('Podaj tytuł kanału.')
    if (atMaxFeeds) return setError(`Osiągnięto limit kanałów (${planLimits.maxFeeds}).`)

    try {
      const created = await apiPost('/api/feeds', {
        title: newFeed.title.trim(),
        slug: newFeed.slug?.trim() || null,
        description: newFeed.description?.trim() || ''
      })
      setFeeds(prev => [created, ...prev])
      setNewFeed({ title: '', slug: '', description: '' })
      setActiveFeedId(created.id)
      setActiveTab('episodes')
      setSuccess('Kanał utworzony!')
      setTimeout(() => setSuccess(''), 2200)
    } catch (err) {
      setError(err.message)
    }
  }

  const deleteFeed = async (feedId) => {
    setError(''); setSuccess('')
    const feed = feeds.find(f => String(f.id) === String(feedId))
    const ok = window.confirm(`Usunąć kanał "${feed?.title || feedId}" wraz ze wszystkimi odcinkami? Tej operacji nie można cofnąć.`)
    if (!ok) return
    try {
      await apiDelete(`/api/feeds/${feedId}`)
      setFeeds(prev => prev.filter(f => String(f.id) !== String(feedId)))
      if (String(activeFeedId) === String(feedId)) {
        const next = feeds.find(f => String(f.id) !== String(feedId))
        setActiveFeedId(next?.id || null)
        setEpisodes([]) // czyścimy listę odcinków dla usuniętego feedu
      }
      setSuccess('Kanał usunięty.')
      setTimeout(() => setSuccess(''), 1800)
    } catch (err) {
      setError(err.message || 'Nie udało się usunąć kanału.')
    }
  }

  const addEpisode = async (e) => {
    e.preventDefault()
    setError(''); setSuccess('')
    if (!activeFeedId) return setError('Wybierz kanał.')
    if (!newEpisode.title.trim() || !newEpisode.description.trim()) return setError('Podaj tytuł i opis odcinka.')
    if (atMaxEpisodes) return setError(`Osiągnięto limit odcinków w kanale (${planLimits.maxEpisodesPerFeed}).`)

    const fd = new FormData()
    fd.append('title', newEpisode.title)
    fd.append('description', newEpisode.description)
    if (newEpisode.coverFile) fd.append('cover', newEpisode.coverFile)
    if (newEpisode.audioFile) fd.append('audio', newEpisode.audioFile)

    try {
      const ep = await apiPost(`/api/feeds/${activeFeedId}/episodes`, fd, true)
      setEpisodes(prev => [ep, ...prev])
      setNewEpisode({ title: '', description: '', coverFile: null, audioFile: null })
      setSuccess('Odcinek dodany!')
      setTimeout(() => setSuccess(''), 2200)
    } catch (err) {
      setError(err.message)
    }
  }

  const deleteEpisode = async (episodeId) => {
    setError(''); setSuccess('')
    const ep = episodes.find(e => String(e.id) === String(episodeId))
    const ok = window.confirm(`Usunąć odcinek "${ep?.title || episodeId}"?`)
    if (!ok) return
    try {
      await apiDelete(`/api/episodes/${episodeId}`)
      setEpisodes(prev => prev.filter(e => String(e.id) !== String(episodeId)))
      setSuccess('Odcinek usunięty.')
      setTimeout(() => setSuccess(''), 1800)
    } catch (err) {
      setError(err.message || 'Nie udało się usunąć odcinka.')
    }
  }

  const loggedIn = !!me

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        {loggedIn && (
          <div className="dashboard-tabs">
            <button onClick={() => setActiveTab('feeds')} className={activeTab === 'feeds' ? 'active' : ''}>Kanały</button>
            <button onClick={() => setActiveTab('episodes')} className={activeTab === 'episodes' ? 'active' : ''}>Odcinki</button>
            <button onClick={() => setActiveTab('stats')} className={activeTab === 'stats' ? 'active' : ''}>Statystyki</button>
            <button onClick={() => setActiveTab('distribution')} className={activeTab === 'distribution' ? 'active' : ''}>Dystrybucja</button>
            <button onClick={() => setActiveTab('transcription')} className={activeTab === 'transcription' ? 'active' : ''}>Transkrypcje</button>
          </div>
        )}

        {loggedIn && (
          <div style={{ marginTop: 8, fontSize: 14, opacity: 0.9 }}>
            Zalogowano jako <strong>{me.email}</strong> (plan: <strong>{me.plan}</strong>)
            {planLimits && (
              <> • odcinki: <strong>{me.episodes}</strong>
              {planLimits.maxEpisodesPerFeed !== null ? ` / ${planLimits.maxEpisodesPerFeed} / feed` : ' / ∞ / feed'}
              {planLimits.maxFeeds !== null ? ` • kanały: max ${planLimits.maxFeeds}` : ' • kanały: ∞'}
              {planLimits.maxStorageMB !== null ? ` • storage: ${planLimits.maxStorageMB} MB` : ' • storage: ∞'}</>
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
            {error && <Alert type="error" style={{ marginBottom: 12 }}>{error}</Alert>}
            {success && <Alert type="success" style={{ marginBottom: 12 }}>{success}</Alert>}

            {/* ───── KANAŁY ───── */}
            {activeTab === 'feeds' && (
              <div className="grid" style={{ gap: 16 }}>
                <form onSubmit={createFeed} className="card" style={{ padding: 16 }}>
                  <h3 style={{ marginTop: 0 }}>Nowy kanał</h3>
                  <input name="title" placeholder="Tytuł *" value={newFeed.title} onChange={handleFeedField} />
                  <input name="slug" placeholder="Slug (opcjonalnie)" value={newFeed.slug} onChange={handleFeedField} />
                  <input name="description" placeholder="Opis (opcjonalnie)" value={newFeed.description} onChange={handleFeedField} />
                  <button type="submit" disabled={atMaxFeeds} title={atMaxFeeds ? 'Limit kanałów w planie wyczerpany' : ''}>
                    {atMaxFeeds ? 'Limit kanałów osiągnięty' : 'Utwórz kanał'}
                  </button>
                  {atMaxFeeds && (
                    <div style={{ marginTop: 8 }}><Alert type="info">Osiągnięto limit kanałów w Twoim planie.</Alert></div>
                  )}
                </form>

                <div className="card" style={{ padding: 16 }}>
                  <h3 style={{ marginTop: 0 }}>Moje kanały</h3>
                  {feeds.length === 0 ? (
                    <Alert type="info">Nie masz jeszcze żadnych kanałów.</Alert>
                  ) : (
                    <ul style={{ margin: 0, paddingLeft: 16 }}>
                      {feeds.map(f => (
                        <li
                          key={f.id}
                          style={{ marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}
                          className={String(activeFeedId) === String(f.id) ? 'active-feed' : ''}
                        >
                          <label style={{ cursor: 'pointer', flex: 1 }}>
                            <input
                              type="radio"
                              name="activeFeed"
                              value={f.id}
                              checked={String(activeFeedId) === String(f.id)}
                              onChange={() => setActiveFeedId(f.id)}
                              style={{ marginRight: 8 }}
                            />
                            <Link to={`/feeds/${f.id}`} style={{ textDecoration: 'none' }}>
                              <strong>{f.title || f.name || `Kanał ${f.id}`}</strong>
                            </Link>
                            {f.description ? <span> — {f.description}</span> : null}
                          </label>
                          <button
                            onClick={() => deleteFeed(f.id)}
                            className="btn-danger"
                            style={{ padding: '0.35rem 0.6rem' }}
                          >
                            🗑 Usuń
                          </button>
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
                    <Alert type="info">Najpierw utwórz kanał w zakładce <strong>Kanały</strong>.</Alert>
                  ) : (
                    <>
                      <div style={{ marginBottom: 8 }}>
                        <label>Aktywny kanał:&nbsp;</label>
                        <select value={activeFeedId || ''} onChange={(e) => setActiveFeedId(e.target.value)}>
                          {feeds.map(f => (
                            <option key={f.id} value={f.id}>{f.title || f.name || `Kanał ${f.id}`}</option>
                          ))}
                        </select>
                        &nbsp; <Link to={`/feeds/${activeFeedId || feeds[0]?.id}`}>przejdź do szczegółów</Link>
                      </div>

                      <form onSubmit={addEpisode}>
                        <input type="text" name="title" placeholder="Tytuł odcinka" value={newEpisode.title} onChange={handleEpisodeField} />
                        <input type="text" name="description" placeholder="Opis" value={newEpisode.description} onChange={handleEpisodeField} />
                        <input type="file" name="coverFile" accept="image/*" onChange={handleEpisodeField} />
                        <input type="file" name="audioFile" accept="audio/*" onChange={handleEpisodeField} />
                        <button type="submit" disabled={atMaxEpisodes} title={atMaxEpisodes ? 'Limit odcinków w tym kanale wyczerpany' : ''}>
                          {atMaxEpisodes ? 'Limit odcinków w kanale osiągnięty' : 'Dodaj odcinek'}
                        </button>
                        {atMaxEpisodes && (
                          <div style={{ marginTop: 8 }}><Alert type="info">Osiągnięto limit odcinków w tym kanale.</Alert></div>
                        )}
                      </form>
                    </>
                  )}
                </div>

                <div className="podcast-list">
                  {episodes.map(ep => (
                    <div key={ep.id} className="podcast-item" style={{ position: 'relative' }}>
                      <div style={{ display: 'flex', gap: 12, alignItems: 'center', width: '100%', justifyContent: 'space-between' }}>
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

                        <button
                          onClick={() => deleteEpisode(ep.id)}
                          className="btn-danger"
                          style={{ padding: '0.35rem 0.6rem', alignSelf: 'flex-start' }}
                        >
                          🗑 Usuń
                        </button>
                      </div>
                    </div>
                  ))}
                  {episodes.length === 0 && <Alert type="info">Brak odcinków w wybranym kanale.</Alert>}
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
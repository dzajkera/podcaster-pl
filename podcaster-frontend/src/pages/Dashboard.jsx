import { useState, useEffect, useMemo, useCallback } from 'react'
import { Link } from 'react-router-dom'          // ⬅️ dodaj
import PodcastCard from '../components/PodcastCard'
import '../styles/Dashboard.css'

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
  const [me, setMe] = useState(null)
  const [planLimits, setPlanLimits] = useState(null)

  const [newPodcast, setNewPodcast] = useState({
    title: '', description: '', coverFile: null, audioFile: null
  })

  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    if (!import.meta.env.DEV && !API_BASE) {
      console.warn('Brak VITE_API_URL w produkcji – ustaw zmienną na Railway.')
      setError('Konfiguracja: brak adresu API w produkcji. Ustaw VITE_API_URL na Railway.')
    }
  }, [API_BASE])

  // /me
  useEffect(() => {
    if (!API_BASE) return
    const token = getToken()
    if (!token) { setMe(null); setPlanLimits(null); return }
    ;(async () => {
      try {
        const res = await fetch(`${API_BASE}/me`, { headers: { Authorization: `Bearer ${token}` } })
        if (!res.ok) { setMe(null); setPlanLimits(null); return }
        const data = await res.json()
        setMe(data.user)
        setPlanLimits(data.planLimits || null)
      } catch (e) { console.error('/me error', e) }
    })()
  }, [API_BASE])

  // 📥 Pobranie odcinków TYLKO dla zalogowanego + filtr po user_id
  useEffect(() => {
    if (!API_BASE) return
    if (!me?.id) { setPodcasts([]); return }    // ⬅️ wyczyść, gdy nie zalogowany

    ;(async () => {
      try {
        const res = await fetch(`${API_BASE}/api/podcasts`)
        if (!res.ok) throw new Error('Błąd pobierania danych')
        const data = await res.json()
        const mine = data.filter(p => String(p.user_id) === String(me.id)) // ⬅️ tylko moje
        setPodcasts(mine)
      } catch (err) {
        console.error('Błąd ładowania podcastów:', err)
        setError('Nie udało się załadować podcastów.')
      }
    })()
  }, [API_BASE, me?.id])                          // ⬅️ zależność od me.id

  const handleInputChange = (e) => { /* bez zmian */ }
  const handleAddPodcast = async (e) => { /* bez zmian */ }
  const handleDeletePodcast = useCallback(async (id) => { /* bez zmian */ }, [API_BASE])

  const loggedIn = !!me

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <div className="dashboard-tabs">
          <button onClick={() => setActiveTab('podcasts')} className={activeTab === 'podcasts' ? 'active' : ''}>Podcasty</button>
          <button onClick={() => setActiveTab('stats')} className={activeTab === 'stats' ? 'active' : ''}>Statystyki</button>
          <button onClick={() => setActiveTab('distribution')} className={activeTab === 'distribution' ? 'active' : ''}>Dystrybucja</button>
          <button onClick={() => setActiveTab('transcription')} className={activeTab === 'transcription' ? 'active' : ''}>Transkrypcje</button>
        </div>

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
        {activeTab === 'podcasts' && (
          <>
            {/* GATE dla niezalogowanych */}
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
                {/* Formularz + lista tylko dla zalogowanych */}
                <form className="podcast-form" onSubmit={handleAddPodcast}>
                  {/* … pól nie zmieniamy … */}
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
          </>
        )}

        {activeTab === 'stats' && <div>📊 Tu będą statystyki</div>}
        {activeTab === 'distribution' && (loggedIn ? <div>…</div> : <p><Link to="/login">Zaloguj się</Link>, aby zarządzać dystrybucją.</p>)}
        {activeTab === 'transcription' && <div>📝 Transkrypcje i nagrania</div>}
      </div>
    </div>
  )
}

export default Dashboard
// src/pages/FeedDetail.jsx
import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import PodcastCard from '../components/PodcastCard'
import Alert from '../components/Alert'
import { API_BASE, apiGet, apiPost, apiDelete, getToken } from '../lib/api'

function FeedDetail() {
  const { feedId } = useParams()
  const [feed, setFeed] = useState(null)
  const [episodes, setEpisodes] = useState([])
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // formularz odcinka
  const [form, setForm] = useState({ title: '', description: '', cover: null, audio: null })

  // ⬇️ nowy: plik okładki kanału
  const [newFeedCover, setNewFeedCover] = useState(null)

  const loggedIn = !!getToken()

  // meta kanału
  useEffect(() => {
    if (!feedId) return
    ;(async () => {
      try {
        const all = await apiGet('/api/feeds')
        const f = Array.isArray(all) ? all.find(x => String(x.id) === String(feedId)) : null
        setFeed(f || null)
      } catch {
        setFeed(null)
      }
    })()
  }, [feedId])

  // lista odcinków
  const loadEpisodes = async () => {
    if (!feedId) return
    try {
      const list = await apiGet(`/api/feeds/${feedId}/episodes`)
      setEpisodes(Array.isArray(list) ? list : [])
    } catch (e) {
      setError(e.message)
    }
  }
  useEffect(() => { loadEpisodes() }, [feedId])

  // formularz odcinka
  const onChange = (e) => {
    const { name, value, files } = e.target
    setForm(prev => ({ ...prev, [name]: files ? files[0] : value }))
    setError(''); setSuccess('')
  }

  const onAddEpisode = async (e) => {
    e && e.preventDefault()
    setError(''); setSuccess('')
    if (!form.title.trim() || !form.description.trim()) return setError('Uzupełnij tytuł i opis.')
    if (!loggedIn) return setError('Musisz być zalogowany, aby dodać odcinek.')

    const fd = new FormData()
    fd.append('title', form.title)
    fd.append('description', form.description)
    if (form.cover) fd.append('cover', form.cover)
    if (form.audio) fd.append('audio', form.audio)

    try {
      await apiPost(`/api/feeds/${feedId}/episodes`, fd, true)
      await loadEpisodes()
      setForm({ title: '', description: '', cover: null, audio: null })
      setSuccess('Dodano odcinek!')
      setTimeout(() => setSuccess(''), 2200)
    } catch (e) {
      setError(e.message)
    }
  }

  // ⬇️ nowy: zmiana okładki kanału
  const onCoverFileChange = (e) => {
    const file = e.target.files?.[0] || null
    setNewFeedCover(file)
    setError(''); setSuccess('')
  }

  const onChangeFeedCover = async (e) => {
    e.preventDefault()
    setError(''); setSuccess('')
    if (!loggedIn) return setError('Musisz być zalogowany, aby zmienić okładkę.')
    if (!newFeedCover) return setError('Wybierz plik okładki.')

    try {
      const fd = new FormData()
      fd.append('cover', newFeedCover)

      const res = await fetch(`${API_BASE}/api/feeds/${feedId}/cover`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${getToken()}` },
        body: fd
      })
      if (!res.ok) {
        const msg = await res.json().catch(() => ({}))
        throw new Error(msg?.error || 'Nie udało się podmienić okładki.')
      }
      const updated = await res.json()
      // backend zwraca coverUrl
      setFeed(prev => (prev ? { ...prev, cover_url: undefined, coverUrl: updated.coverUrl } : prev))
      setNewFeedCover(null)
      setSuccess('Okładka kanału zaktualizowana.')
      setTimeout(() => setSuccess(''), 2000)
    } catch (e) {
      setError(e.message)
    }
  }

  const onDeleteEpisode = async (episodeId) => {
    setError(''); setSuccess('')
    if (!loggedIn) return setError('Musisz być zalogowany, aby usuwać odcinki.')
    const ep = episodes.find(e => String(e.id) === String(episodeId))
    const ok = window.confirm(`Usunąć odcinek "${ep?.title || episodeId}"? Tej operacji nie można cofnąć.`)
    if (!ok) return
    try {
      await apiDelete(`/api/episodes/${episodeId}`)
      setEpisodes(prev => prev.filter(e => String(e.id) !== String(episodeId)))
      setSuccess('Odcinek usunięty.')
      setTimeout(() => setSuccess(''), 1800)
    } catch (e) {
      setError(e.message || 'Nie udało się usunąć odcinka.')
    }
  }

  return (
    <div className="container">
      <div style={{ marginBottom: 12 }}>
        <Link to="/my-feeds">← Moje kanały</Link>
      </div>

      <h2 style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {/* ⬇️ miniaturka okładki kanału (jeśli jest) */}
        {feed?.coverUrl && (
          <img
            src={feed.coverUrl}
            alt=""
            style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 8 }}
          />
        )}
        {feed ? feed.title : 'Kanał'}
      </h2>
      {feed?.description && <p style={{ color: '#374151' }}>{feed.description}</p>}

      {/* ⬇️ formularz zmiany okładki kanału */}
      {loggedIn && (
        <form onSubmit={onChangeFeedCover} style={{ margin: '8px 0 16px', display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="file" accept="image/*" onChange={onCoverFileChange} />
          <button type="submit">Zmień okładkę</button>
        </form>
      )}

      {loggedIn ? (
        <form onSubmit={onAddEpisode} className="podcast-form" style={{ marginTop: 12 }}>
          <input name="title" placeholder="Tytuł odcinka" value={form.title} onChange={onChange} />
          <input name="description" placeholder="Opis" value={form.description} onChange={onChange} />
          <input type="file" name="cover" accept="image/*" onChange={onChange} />
          <input type="file" name="audio" accept="audio/*" onChange={onChange} />
          <button type="submit">Dodaj odcinek</button>
        </form>
      ) : (
        <Alert type="info"><Link to="/login">Zaloguj się</Link>, aby dodawać odcinki.</Alert>
      )}

      {error && <Alert type="error" style={{ marginTop: 8 }}>{error}</Alert>}
      {success && <Alert type="success" style={{ marginTop: 8 }}>{success}</Alert>}

      <div className="podcast-list" style={{ marginTop: 16 }}>
        {episodes.map(ep => (
          <div key={ep.id} className="podcast-item" style={{ position: 'relative' }}>
            <PodcastCard podcast={ep} />
            {ep.audioUrl && (
              <audio
                className="podcast-player"
                controls
                style={{ marginTop: 6, width: '100%' }}
              >
                <source src={ep.audioUrl} />
              </audio>
            )}
            {loggedIn && (
              <button
                onClick={() => onDeleteEpisode(ep.id)}
                className="btn-danger"
                style={{ position: 'absolute', top: 12, right: 12, padding: '0.35rem 0.6rem' }}
                aria-label={`Usuń odcinek ${ep.title}`}
              >
                🗑 Usuń
              </button>
            )}
          </div>
        ))}
        {episodes.length === 0 && <Alert type="info">Brak odcinków w tym kanale.</Alert>}
      </div>
    </div>
  )
}

export default FeedDetail
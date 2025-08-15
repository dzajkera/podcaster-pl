import { useEffect, useState, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import PodcastCard from '../components/PodcastCard'
import { getApiBase, authHeader, getToken } from '../lib/api'

function FeedDetail() {
  const { feedId } = useParams()
  const API_BASE = useMemo(getApiBase, [])
  const [feed, setFeed] = useState(null)
  const [episodes, setEpisodes] = useState([])
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [form, setForm] = useState({ title: '', description: '', cover: null, audio: null })
  const loggedIn = !!getToken()

  // załaduj meta feedu (MVP: z listy publicznej)
  useEffect(() => {
    if (!API_BASE || !feedId) return
    ;(async () => {
      try {
        const res = await fetch(`${API_BASE}/api/feeds`)
        if (!res.ok) throw new Error('Błąd pobierania feedów')
        const all = await res.json()
        setFeed(all.find(f => String(f.id) === String(feedId)) || null)
      } catch { setFeed(null) }
    })()
  }, [API_BASE, feedId])

  const loadEpisodes = async () => {
    if (!API_BASE || !feedId) return
    try {
      const res = await fetch(`${API_BASE}/api/feeds/${feedId}/episodes`)
      if (!res.ok) throw new Error('Błąd pobierania odcinków')
      setEpisodes(await res.json())
    } catch (e) { setError(e.message) }
  }
  useEffect(() => { loadEpisodes() }, [API_BASE, feedId])

  const onChange = (e) => {
    const { name, value, files } = e.target
    if (files) setForm(prev => ({ ...prev, [name]: files[0] }))
    else setForm(prev => ({ ...prev, [name]: value }))
    setError(''); setSuccess('')
  }

  const onAddEpisode = async (e) => {
    e.preventDefault()
    setError(''); setSuccess('')
    if (!form.title.trim() || !form.description.trim()) { setError('Uzupełnij tytuł i opis.'); return }
    if (!loggedIn) { setError('Musisz być zalogowany, aby dodać odcinek.'); return }

    const fd = new FormData()
    fd.append('title', form.title)
    fd.append('description', form.description)
    if (form.cover) fd.append('cover', form.cover)
    if (form.audio) fd.append('audio', form.audio)

    try {
      const res = await fetch(`${API_BASE}/api/feeds/${feedId}/episodes`, {
        method: 'POST',
        headers: { ...authHeader() },
        body: fd
      })
      if (!res.ok) {
        const msg = await res.json().catch(() => ({}))
        throw new Error(msg?.error || 'Błąd dodawania odcinka')
      }
      await loadEpisodes()
      setForm({ title: '', description: '', cover: null, audio: null })
      setSuccess('Dodano odcinek!')
      setTimeout(() => setSuccess(''), 2500)
    } catch (e) { setError(e.message) }
  }

  return (
    <div className="container">
      <div style={{ marginBottom: 12 }}>
        <Link to="/my-feeds">← Moje feedy</Link>
      </div>

      <h2>{feed ? feed.title : 'Feed'}</h2>
      {feed?.description && <p style={{ color: '#374151' }}>{feed.description}</p>}

      {loggedIn ? (
        <form onSubmit={onAddEpisode} className="podcast-form" style={{ marginTop: 12 }}>
          <input name="title" placeholder="Tytuł odcinka" value={form.title} onChange={onChange} />
          <input name="description" placeholder="Opis" value={form.description} onChange={onChange} />
          <input type="file" name="cover" accept="image/*" onChange={onChange} />
          <input type="file" name="audio" accept="audio/*" onChange={onChange} />
          <button type="submit">Dodaj odcinek</button>
        </form>
      ) : (
        <p><Link to="/login">Zaloguj się</Link>, aby dodawać odcinki.</p>
      )}

      {error && <div className="message error" style={{ marginTop: 8 }}>{error}</div>}
      {success && <div className="message success" style={{ marginTop: 8 }}>{success}</div>}

      <div className="podcast-list" style={{ marginTop: 16 }}>
        {episodes.map(ep => (
          <div key={ep.id} className="podcast-item" style={{ position: 'relative' }}>
            <PodcastCard podcast={ep} />
          </div>
        ))}
        {episodes.length === 0 && <p>Brak odcinków w tym feedzie.</p>}
      </div>
    </div>
  )
}
export default FeedDetail
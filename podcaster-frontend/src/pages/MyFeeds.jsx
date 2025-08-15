// src/pages/MyFeeds.jsx
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Alert from '../components/Alert'
import { apiGet, apiPost, getToken } from '../lib/api';

function MyFeeds() {
  const [feeds, setFeeds] = useState([])
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [slug, setSlug] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const navigate = useNavigate()
  const loggedIn = !!getToken()

  useEffect(() => {
    if (!loggedIn) return
    ;(async () => {
      try {
        const all = await apiGet('/api/feeds')
        // pokaż wszystkie moje — backend zwraca globalnie
        const me = await apiGet('/me')
        const mine = Array.isArray(all) ? all.filter(f => String(f.user_id) === String(me.user.id)) : []
        setFeeds(mine)
      } catch (e) { setError(e.message) }
    })()
  }, [loggedIn])

  const handleCreate = async (e) => {
    e.preventDefault()
    setError(''); setSuccess('')
    if (!title.trim()) return setError('Podaj tytuł')

    try {
      const feed = await apiPost('/api/feeds', { title, description, slug })
      setSuccess('Feed utworzony')
      setTitle(''); setDescription(''); setSlug('')
      navigate(`/feeds/${feed.id}`)
    } catch (e) { setError(e.message) }
  }

  if (!loggedIn) {
    return (
      <div className="container">
        <h2>Moje kanały</h2>
        <p>Ta sekcja jest dostępna po zalogowaniu.</p>
        <Link to="/login" className="button">Zaloguj się</Link>
      </div>
    )
  }

  return (
    <div className="container">
      <h2>Moje kanały</h2>

      <form onSubmit={handleCreate} style={{ margin: '1rem 0', padding: 12, border: '1px solid #e5e7eb', borderRadius: 8 }}>
        <h3>➕ Nowy kanał</h3>
        <div style={{ display: 'grid', gap: 8, maxWidth: 520 }}>
          <input placeholder="Tytuł *" value={title} onChange={e => setTitle(e.target.value)} />
          <input placeholder="Slug (opcjonalnie)" value={slug} onChange={e => setSlug(e.target.value)} />
          <textarea placeholder="Opis (opcjonalnie)" value={description} onChange={e => setDescription(e.target.value)} />
          <button type="submit">Utwórz kanał</button>
        </div>
        {error && <Alert type="error" style={{ marginTop: 8 }}>{error}</Alert>}
        {success && <Alert type="success" style={{ marginTop: 8 }}>{success}</Alert>}
      </form>

      <div style={{ display: 'grid', gap: 12 }}>
        {feeds.map(f => (
          <Link key={f.id} to={`/feeds/${f.id}`} style={{ padding: 12, border: '1px solid #e5e7eb', borderRadius: 8, textDecoration: 'none', color: 'inherit' }}>
            <strong>{f.title}</strong>
            {f.slug && <span style={{ color: '#6b7280' }}> — {f.slug}</span>}
            {f.description && <div style={{ marginTop: 4, color: '#374151' }}>{f.description}</div>}
          </Link>
        ))}
        {feeds.length === 0 && <Alert type="info">Nie masz jeszcze żadnych kanałów.</Alert>}
      </div>
    </div>
  )
}
export default MyFeeds
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getApiBase, authHeader } from '../lib/api'

function MyFeeds() {
  const API_BASE = getApiBase()
  const [feeds, setFeeds] = useState([])
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [slug, setSlug] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const navigate = useNavigate()
  const loggedIn = !!localStorage.getItem('token')

  useEffect(() => {
    if (!API_BASE || !loggedIn) return
    ;(async () => {
      try {
        const res = await fetch(`${API_BASE}/api/my-feeds`, { headers: { ...authHeader() } })
        if (!res.ok) throw new Error('Błąd pobierania feedów')
        setFeeds(await res.json())
      } catch (e) { setError(e.message) }
    })()
  }, [API_BASE, loggedIn])

  const handleCreate = async (e) => {
    e.preventDefault()
    setError(''); setSuccess('')
    if (!title.trim()) { setError('Podaj tytuł'); return }
    try {
      const res = await fetch(`${API_BASE}/api/feeds`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify({ title, description, slug })
      })
      if (!res.ok) {
        const msg = await res.json().catch(() => ({}))
        throw new Error(msg?.error || 'Błąd tworzenia feedu')
      }
      const feed = await res.json()
      setSuccess('Feed utworzony')
      setTitle(''); setDescription(''); setSlug('')
      navigate(`/feeds/${feed.id}`)
    } catch (e) { setError(e.message) }
  }

  if (!loggedIn) {
    return (
      <div className="container">
        <h2>Moje feedy</h2>
        <p>Ta sekcja jest dostępna po zalogowaniu.</p>
        <Link to="/login" className="button">Zaloguj się</Link>
      </div>
    )
  }

  return (
    <div className="container">
      <h2>Moje feedy</h2>

      <form onSubmit={handleCreate} style={{ margin: '1rem 0', padding: 12, border: '1px solid #e5e7eb', borderRadius: 8 }}>
        <h3>➕ Nowy feed</h3>
        <div style={{ display: 'grid', gap: 8, maxWidth: 520 }}>
          <input placeholder="Tytuł *" value={title} onChange={e => setTitle(e.target.value)} />
          <input placeholder="Slug (opcjonalnie)" value={slug} onChange={e => setSlug(e.target.value)} />
          <textarea placeholder="Opis (opcjonalnie)" value={description} onChange={e => setDescription(e.target.value)} />
          <button type="submit">Utwórz feed</button>
        </div>
        {error && <div className="message error" style={{ marginTop: 8 }}>{error}</div>}
        {success && <div className="message success" style={{ marginTop: 8 }}>{success}</div>}
      </form>

      <div style={{ display: 'grid', gap: 12 }}>
        {feeds.map(f => (
          <Link key={f.id} to={`/feeds/${f.id}`} style={{ padding: 12, border: '1px solid #e5e7eb', borderRadius: 8, textDecoration: 'none', color: 'inherit' }}>
            <strong>{f.title}</strong>
            {f.slug && <span style={{ color: '#6b7280' }}> — {f.slug}</span>}
            {f.description && <div style={{ marginTop: 4, color: '#374151' }}>{f.description}</div>}
          </Link>
        ))}
        {feeds.length === 0 && <p>Nie masz jeszcze żadnych feedów.</p>}
      </div>
    </div>
  )
}
export default MyFeeds
import { useState, useEffect } from 'react'
import PodcastCard from '../components/PodcastCard'
import '../styles/Dashboard.css'

function Dashboard() {
  const [activeTab, setActiveTab] = useState('podcasts')
  const [podcasts, setPodcasts] = useState([])

  const [newPodcast, setNewPodcast] = useState({
    title: '',
    description: '',
    coverFile: null,
    audioFile: null
  })

  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    const fetchPodcasts = async () => {
      try {
        const res = await fetch('http://localhost:3000/api/podcasts')
        if (!res.ok) throw new Error('Błąd pobierania danych')
        const data = await res.json()
        setPodcasts(data)
      } catch (err) {
        console.error('Błąd ładowania podcastów:', err)
        setError('Nie udało się załadować podcastów.')
      }
    }

    fetchPodcasts()
  }, [])

  const handleInputChange = (e) => {
    const { name, value, files } = e.target
    if (files) {
      setNewPodcast({ ...newPodcast, [name]: files[0] })
    } else {
      setNewPodcast({ ...newPodcast, [name]: value })
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

    const formData = new FormData()
    formData.append('title', newPodcast.title)
    formData.append('description', newPodcast.description)
    if (newPodcast.coverFile) formData.append('cover', newPodcast.coverFile)
    if (newPodcast.audioFile) formData.append('audio', newPodcast.audioFile)

    try {
      const res = await fetch('http://localhost:3000/api/podcasts', {
        method: 'POST',
        body: formData
      })

      if (!res.ok) throw new Error('Błąd podczas zapisu')

      const addedPodcast = await res.json()
      setPodcasts([addedPodcast, ...podcasts])
      setNewPodcast({ title: '', description: '', coverFile: null, audioFile: null })
      setSuccess('Podcast dodany!')
    } catch (err) {
      setError('Nie udało się zapisać podcastu.')
    }
  }

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
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
      </div>

      <div className="dashboard-content">
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
              {podcasts.map(p => (
                <div key={p.id} className="podcast-item">
                  <PodcastCard podcast={p} />
                </div>
              ))}
            </div>
          </>
        )}

        {activeTab === 'stats' && <div>📊 Tu będą statystyki</div>}

        {activeTab === 'distribution' && (
          <div className="distribution-settings">
            <h2>📤 Dystrybucja podcastu</h2>
            {podcasts.length === 0 ? (
              <p>Najpierw dodaj przynajmniej jeden podcast.</p>
            ) : (
              podcasts.map(p => (
                <div key={p.id} className="distribution-card">
                  <h3>{p.title}</h3>
                  <p><strong>RSS:</strong> <code>https://podcaster.pl/rss/{p.id}</code></p>

                  <div className="platform-options">
                    <label>
                      <input type="checkbox" defaultChecked />
                      Spotify
                    </label>
                    <label>
                      <input type="checkbox" />
                      Apple Podcasts
                    </label>
                    <label>
                      <input type="checkbox" />
                      Amazon Music
                    </label>
                  </div>

                  <button className="distribute-button" disabled>
                    Zgłoś podcast (funkcja wkrótce)
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'transcription' && <div>📝 Transkrypcje i nagrania</div>}
      </div>
    </div>
  )
}

export default Dashboard
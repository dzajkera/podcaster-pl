function PodcastCard({ podcast }) {
    return (
      <div className="podcast-card">
        {podcast.coverUrl && (
          <img
            src={podcast.coverUrl}
            alt={`Okładka: ${podcast.title}`}
            className="cover-image"
          />
        )}
  
        <div className="podcast-details">
          <h2 className="podcast-title">{podcast.title}</h2>
          <p className="podcast-description">{podcast.description}</p>
  
          {podcast.audioUrl && (
            <audio controls className="audio-player">
              <source src={podcast.audioUrl} type="audio/mpeg" />
              Twoja przeglądarka nie obsługuje odtwarzacza audio.
            </audio>
          )}
        </div>
      </div>
    )
  }
  
  export default PodcastCard
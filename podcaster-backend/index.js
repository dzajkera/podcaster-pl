import express from 'express'
import cors from 'cors'
import multer from 'multer'
import dotenv from 'dotenv'
import { v2 as cloudinary } from 'cloudinary'
import { Readable } from 'stream'

dotenv.config()

const app = express()
const port = process.env.PORT || 3000

app.use(cors())
app.use(express.json())

// Konfiguracja Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
})

// Konfiguracja Multer do obsługi uploadu
const storage = multer.memoryStorage()
const upload = multer({ storage })

// Pseudo-baza danych (tymczasowo w pamięci)
const podcasts = []

// Pomocnicza funkcja uploadu do Cloudinary
const uploadToCloudinary = (buffer, folder, resourceType) => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: resourceType },
      (error, result) => {
        if (error) reject(error)
        else resolve(result.secure_url)
      }
    )

    Readable.from(buffer).pipe(stream)
  })
}

// API: Dodanie podcastu
app.post('/api/podcasts', upload.fields([
  { name: 'cover', maxCount: 1 },
  { name: 'audio', maxCount: 1 }
]), async (req, res) => {
  const { title, description } = req.body

  if (!title || !description) {
    return res.status(400).json({ error: 'Tytuł i opis są wymagane.' })
  }

  try {
    const coverFile = req.files['cover']?.[0]
    const audioFile = req.files['audio']?.[0]

    let coverUrl = null
    let audioUrl = null

    if (coverFile) {
      coverUrl = await uploadToCloudinary(coverFile.buffer, 'podcasts/covers', 'image')
    }

    if (audioFile) {
      audioUrl = await uploadToCloudinary(audioFile.buffer, 'podcasts/audio', 'video') // audio to typ "video" w Cloudinary
    }

    const newPodcast = {
      id: Date.now(),
      title,
      description,
      coverUrl,
      audioUrl
    }

    podcasts.unshift(newPodcast)

    res.status(201).json(newPodcast)
  } catch (error) {
    console.error('Błąd podczas dodawania podcastu:', error)
    res.status(500).json({ error: 'Wystąpił błąd przy dodawaniu podcastu.' })
  }
})

// API: Pobranie wszystkich podcastów
app.get('/api/podcasts', (req, res) => {
  res.json(podcasts)
})

app.listen(port, () => {
  console.log(`✅ Serwer działa na http://localhost:${port}`)
})
import express from 'express'
import cors from 'cors'
import multer from 'multer'
import dotenv from 'dotenv'
import { v2 as cloudinary } from 'cloudinary'
import { Readable } from 'stream'
import pkg from 'pg'

dotenv.config()
const { Pool } = pkg

const app = express()
// Railway zwykle ustawia PORT — zostawiamy fallback 3000
const port = process.env.PORT || 3000

app.use(cors())
app.use(express.json())

// 🔎 Krótkie info diagnostyczne (bez ujawniania sekretów)
console.log('ENV CHECK:', {
  NODE_ENV: process.env.NODE_ENV,
  HAS_DATABASE_URL: !!process.env.DATABASE_URL,
  HAS_PGHOST: !!process.env.PGHOST,
  PORT: process.env.PORT,
})

// Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
})

// 🔗 Postgres (fallback: DATABASE_URL albo PGHOST/PGUSER/...)
// Railway dostarcza oba warianty, ale gdyby link nie zadziałał – użyjemy PGHOST...
const pgBaseConfig = process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL }
  : {
      host: process.env.PGHOST,
      port: process.env.PGPORT ? Number(process.env.PGPORT) : 5432,
      database: process.env.PGDATABASE,
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
    }

// W produkcji (i gdy host nie jest lokalny) włącz SSL
const needSSL =
  process.env.NODE_ENV === 'production' ||
  (pgBaseConfig.host && !['localhost', '127.0.0.1', '::1'].includes(pgBaseConfig.host))

const pool = new Pool({
  ...pgBaseConfig,
  ssl: needSSL ? { rejectUnauthorized: false } : false,
})

// ✔️ Init tabeli
async function initDb() {
  await pool.query(`
    create table if not exists podcasts (
      id          bigserial primary key,
      title       text not null,
      description text not null,
      cover_url   text,
      audio_url   text,
      created_at  timestamptz not null default now()
    );
  `)
  console.log('✅ DB ready')
}
initDb().catch(err => {
  console.error('DB init error', err)
  process.exit(1)
})

// Multer
const storage = multer.memoryStorage()
const upload = multer({ storage })

// helper: upload do Cloudinary
const uploadToCloudinary = (buffer, folder, resourceType) =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: resourceType },
      (error, result) => (error ? reject(error) : resolve(result.secure_url))
    )
    Readable.from(buffer).pipe(stream)
  })

// 🧪 prosty endpoint diagnostyczny
app.get('/__debug', (req, res) => {
  res.json({
    ok: true,
    NODE_ENV: process.env.NODE_ENV,
    HAS_DATABASE_URL: !!process.env.DATABASE_URL,
    HAS_PGHOST: !!process.env.PGHOST,
  })
})

// POST /api/podcasts — tworzenie
app.post(
  '/api/podcasts',
  upload.fields([{ name: 'cover', maxCount: 1 }, { name: 'audio', maxCount: 1 }]),
  async (req, res) => {
    const { title, description } = req.body
    if (!title?.trim() || !description?.trim()) {
      return res.status(400).json({ error: 'Tytuł i opis są wymagane.' })
    }

    try {
      const coverFile = req.files?.['cover']?.[0]
      const audioFile = req.files?.['audio']?.[0]

      let coverUrl = null
      let audioUrl = null

      if (coverFile) coverUrl = await uploadToCloudinary(coverFile.buffer, 'podcasts/covers', 'image')
      if (audioFile) audioUrl = await uploadToCloudinary(audioFile.buffer, 'podcasts/audio', 'video') // audio=video

      const insert = await pool.query(
        `insert into podcasts (title, description, cover_url, audio_url)
         values ($1,$2,$3,$4)
         returning id, title, description, cover_url as "coverUrl", audio_url as "audioUrl", created_at`,
        [title.trim(), description.trim(), coverUrl, audioUrl]
      )

      res.status(201).json(insert.rows[0])
    } catch (err) {
      console.error('Błąd podczas dodawania podcastu:', err)
      res.status(500).json({ error: 'Wystąpił błąd przy dodawaniu podcastu.' })
    }
  }
)

// GET /api/podcasts — lista (najświeższe na górze)
app.get('/api/podcasts', async (req, res) => {
  try {
    const q = await pool.query(
      `select id, title, description, cover_url as "coverUrl", audio_url as "audioUrl", created_at
       from podcasts
       order by created_at desc`
    )
    res.json(q.rows)
  } catch (err) {
    console.error('Błąd pobierania:', err)
    res.status(500).json({ error: 'Nie udało się pobrać podcastów.' })
  }
})

// (opcjonalnie) DELETE /api/podcasts/:id
app.delete('/api/podcasts/:id', async (req, res) => {
  try {
    const del = await pool.query('delete from podcasts where id=$1 returning id', [req.params.id])
    if (del.rowCount === 0) return res.status(404).json({ error: 'Nie znaleziono podcastu.' })
    res.json({ ok: true })
  } catch (err) {
    console.error('Błąd usuwania:', err)
    res.status(500).json({ error: 'Nie udało się usunąć podcastu.' })
  }
})

app.listen(port, () => {
  console.log(`✅ Serwer działa na http://localhost:${port}`)
})
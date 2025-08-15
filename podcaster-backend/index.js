import express from 'express';
import cors from 'cors';
import multer from 'multer';
import dotenv from 'dotenv';
import { v2 as cloudinary } from 'cloudinary';
import { Readable } from 'stream';
import pkg from 'pg';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

dotenv.config();
const { Pool } = pkg;

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// ─────────────────────────────────────────────────────────────
// Env check (bez ujawniania sekretów)
console.log('ENV CHECK:', {
  NODE_ENV: process.env.NODE_ENV,
  HAS_DATABASE_URL: !!process.env.DATABASE_URL,
  HAS_PGHOST: !!process.env.PGHOST,
  HAS_JWT_SECRET: !!process.env.JWT_SECRET,
  PORT: process.env.PORT,
});

// Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// PostgreSQL (Railway)
function makePool() {
  const hasUrl = !!process.env.DATABASE_URL;
  const hasDiscrete =
    !!process.env.PGHOST &&
    !!process.env.PGUSER &&
    !!process.env.PGPASSWORD &&
    !!process.env.PGDATABASE;

  if (!hasUrl && !hasDiscrete) {
    console.error('❌ Brak konfiguracji DB. Ustaw DATABASE_URL albo PGHOST/PGUSER/PGPASSWORD/PGDATABASE.');
    process.exit(1);
  }

  if (hasUrl) {
    return new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  }
  return new Pool({
    host: process.env.PGHOST,
    port: Number(process.env.PGPORT || 5432),
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE,
    ssl: { rejectUnauthorized: false },
  });
}
const pool = makePool();

// ─────────────────────────────────────────────────────────────
// Proste plany + limity
const PLANS = {
  FREE:      { maxEpisodes: 5,    maxStorageMB: 200    },
  STARTER:   { maxEpisodes: 100,  maxStorageMB: 5000   },
  PRO:       { maxEpisodes: 1000, maxStorageMB: 50000  },
  BUSINESS:  { maxEpisodes: null, maxStorageMB: null   }, // null = bez limitu
};

const MB = 1024 * 1024;

// ─────────────────────────────────────────────────────────────
// Inicjalizacja schematu + migracje kolumn public_id
async function initDb() {
  // Użytkownicy
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id            BIGSERIAL PRIMARY KEY,
      email         TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      plan          TEXT NOT NULL DEFAULT 'FREE',
      storage_used  BIGINT NOT NULL DEFAULT 0,    -- w bajtach
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  // Odcinki
  await pool.query(`
    CREATE TABLE IF NOT EXISTS podcasts (
      id              BIGSERIAL PRIMARY KEY,
      user_id         BIGINT REFERENCES users(id) ON DELETE CASCADE,
      title           TEXT NOT NULL,
      description     TEXT NOT NULL,
      cover_url       TEXT,
      audio_url       TEXT,
      cover_public_id TEXT,         -- do sprzątania i podmian
      audio_public_id TEXT,
      audio_bytes     BIGINT DEFAULT 0,
      cover_bytes     BIGINT DEFAULT 0,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  // defensywnie: jeśli tabela już była, dołóż kolumny jeśli ich brak
  await pool.query(`ALTER TABLE podcasts ADD COLUMN IF NOT EXISTS cover_public_id TEXT;`);
  await pool.query(`ALTER TABLE podcasts ADD COLUMN IF NOT EXISTS audio_public_id TEXT;`);

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_podcasts_user_id ON podcasts(user_id);`);

  console.log('✅ DB ready');
}
initDb().catch((err) => {
  console.error('DB init error', err);
  process.exit(1);
});

// ─────────────────────────────────────────────────────────────
// Multer (z pamięci)
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Helper: Cloudinary upload (stream) z wersjonowaniem po stałym public_id
const uploadToCloudinary = (buffer, { publicId, resourceType }) =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: undefined,            // używamy pełnego public_id poniżej
        public_id: publicId,          // STAŁE public_id => Cloudinary nada wersje v1, v2, ...
        overwrite: true,              // podmiana = nowa wersja
        unique_filename: false,       // bez losowych sufiksów
        resource_type: resourceType,  // 'image' | 'video' (audio = video)
      },
      (error, result) => {
        if (error) return reject(error);
        resolve({ url: result.secure_url, public_id: result.public_id });
      }
    );
    Readable.from(buffer).pipe(stream);
  });

// Fallback parser public_id z URL-a (dla legacy rekordów bez *_public_id)
function tryExtractPublicIdFromUrl(url) {
  try {
    // https://res.cloudinary.com/<cloud>/<type>/upload/v169.../podcaster/users/1/episodes/123/cover.jpg
    const u = new URL(url);
    const parts = u.pathname.split('/').filter(Boolean);
    const uploadIdx = parts.findIndex(p => p === 'upload');
    const pathParts = parts.slice(uploadIdx + 1);
    const withoutVersion = pathParts.filter(p => !/^v\d+$/.test(p));
    const last = withoutVersion[withoutVersion.length - 1];
    const noExt = last.replace(/\.[^.]+$/, '');
    const folders = withoutVersion.slice(0, -1);
    return (folders.length ? folders.join('/') + '/' : '') + noExt;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// Auth utils
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

function signToken(user) {
  return jwt.sign(
    { uid: user.id, email: user.email, plan: user.plan },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

async function authMiddleware(req, res, next) {
  try {
    const hdr = req.headers.authorization || '';
    const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Brak tokenu' });

    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // { uid, email, plan }
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Nieprawidłowy token' });
  }
}

// Sprawdzenie limitów planu PRZED uploadem
async function checkPlanAndQuotas(req, res, next) {
  try {
    const { uid } = req.user;
    const { rows } = await pool.query('SELECT plan, storage_used FROM users WHERE id=$1', [uid]);
    if (rows.length === 0) return res.status(401).json({ error: 'Użytkownik nie istnieje' });

    const user = rows[0];
    const planCfg = PLANS[user.plan] || PLANS.FREE;

    // Liczba odcinków
    if (planCfg.maxEpisodes !== null) {
      const countRes = await pool.query('SELECT COUNT(*)::int AS cnt FROM podcasts WHERE user_id=$1', [uid]);
      if (countRes.rows[0].cnt >= planCfg.maxEpisodes) {
        return res.status(403).json({ error: `Limit odcinków wyczerpany dla planu ${user.plan}.` });
      }
    }

    // Rozmiary plików, które zamierzamy dodać
    const coverBytes = req.files?.['cover']?.[0]?.size || 0;
    const audioBytes = req.files?.['audio']?.[0]?.size || 0;
    const incoming = coverBytes + audioBytes;

    if (planCfg.maxStorageMB !== null) {
      const limitBytes = planCfg.maxStorageMB * MB;
      if (Number(user.storage_used) + incoming > limitBytes) {
        return res.status(403).json({ error: `Brak miejsca w planie ${user.plan} (przekroczysz ${planCfg.maxStorageMB} MB).` });
      }
    }

    // ok
    req._quota = { plan: user.plan, storage_used: Number(user.storage_used), coverBytes, audioBytes };
    next();
  } catch (e) {
    console.error('Quota check error:', e);
    return res.status(500).json({ error: 'Błąd sprawdzania limitów.' });
  }
}

// ─────────────────────────────────────────────────────────────
// Diagnostyka
app.get('/__debug', (req, res) => {
  res.json({
    ok: true,
    NODE_ENV: process.env.NODE_ENV,
    HAS_DATABASE_URL: !!process.env.DATABASE_URL,
    HAS_PGHOST: !!process.env.PGHOST,
    HAS_JWT_SECRET: !!process.env.JWT_SECRET,
  });
});

// ─────────────────────────────────────────────────────────────
// AUTH
app.post('/auth/register', async (req, res) => {
  try {
    const { email, password, plan } = req.body;
    if (!email?.trim() || !password?.trim()) {
      return res.status(400).json({ error: 'Email i hasło są wymagane.' });
    }
    const normalizedPlan = (plan || 'FREE').toUpperCase();
    if (!PLANS[normalizedPlan]) return res.status(400).json({ error: 'Nieznany plan.' });

    const hash = await bcrypt.hash(password.trim(), 10);
    const ins = await pool.query(
      `INSERT INTO users (email, password_hash, plan)
       VALUES ($1,$2,$3)
       RETURNING id, email, plan, storage_used, created_at`,
      [email.trim().toLowerCase(), hash, normalizedPlan]
    );
    const user = ins.rows[0];
    const token = signToken(user);
    res.status(201).json({ token, user });
  } catch (e) {
    if (e?.code === '23505') {
      return res.status(409).json({ error: 'Użytkownik o tym emailu już istnieje.' });
    }
    console.error('Register error:', e);
    res.status(500).json({ error: 'Błąd rejestracji.' });
  }
});

app.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email?.trim() || !password?.trim()) {
      return res.status(400).json({ error: 'Email i hasło są wymagane.' });
    }
    const sel = await pool.query(
      `SELECT id, email, password_hash, plan, storage_used FROM users WHERE email=$1`,
      [email.trim().toLowerCase()]
    );
    if (sel.rows.length === 0) return res.status(401).json({ error: 'Nieprawidłowe dane logowania.' });

    const user = sel.rows[0];
    const ok = await bcrypt.compare(password.trim(), user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Nieprawidłowe dane logowania.' });

    const token = signToken(user);
    delete user.password_hash;
    res.json({ token, user });
  } catch (e) {
    console.error('Login error:', e);
    res.status(500).json({ error: 'Błąd logowania.' });
  }
});

app.get('/me', authMiddleware, async (req, res) => {
  try {
    const { uid } = req.user;
    const { rows } = await pool.query(
      `SELECT id, email, plan, storage_used, created_at FROM users WHERE id=$1`,
      [uid]
    );
    if (!rows.length) return res.status(404).json({ error: 'Użytkownik nie istnieje.' });

    const user = rows[0];
    const cnt = await pool.query(`SELECT COUNT(*)::int AS cnt FROM podcasts WHERE user_id=$1`, [uid]);
    user.episodes = cnt.rows[0].cnt;
    res.json({ user, planLimits: PLANS[user.plan] || PLANS.FREE });
  } catch (e) {
    console.error('/me error:', e);
    res.status(500).json({ error: 'Błąd pobierania profilu.' });
  }
});

// ─────────────────────────────────────────────────────────────
// PODCASTS (episodes)

// GET publiczny (pozostaje)
app.get('/api/podcasts', async (_req, res) => {
  try {
    const q = await pool.query(
      `SELECT id, user_id, title, description, cover_url AS "coverUrl", audio_url AS "audioUrl", created_at
       FROM podcasts
       ORDER BY created_at DESC`
    );
    res.json(q.rows);
  } catch (err) {
    console.error('Błąd pobierania:', err);
    res.status(500).json({ error: 'Nie udało się pobrać podcastów.' });
  }
});

// GET /api/my-podcasts — tylko moje, wymaga tokenu
app.get('/api/my-podcasts', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, user_id, title, description,
              cover_url AS "coverUrl",
              audio_url AS "audioUrl",
              created_at
       FROM podcasts
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [req.user.uid]
    );
    res.json(rows);
  } catch (err) {
    console.error('Błąd pobierania moich podcastów:', err);
    res.status(500).json({ error: 'Nie udało się pobrać Twoich podcastów.' });
  }
});

// POST – wymaga zalogowania + quota check (wersjonowane uploady do folderu per episode)
app.post(
  '/api/podcasts',
  authMiddleware,
  upload.fields([{ name: 'cover', maxCount: 1 }, { name: 'audio', maxCount: 1 }]),
  checkPlanAndQuotas,
  async (req, res) => {
    const { title, description } = req.body;
    if (!title?.trim() || !description?.trim()) {
      return res.status(400).json({ error: 'Tytuł i opis są wymagane.' });
    }

    const client = await pool.connect();
    try {
      const { uid } = req.user;
      const coverFile = req.files?.['cover']?.[0] || null;
      const audioFile = req.files?.['audio']?.[0] || null;

      const coverBytes = coverFile?.size || 0;
      const audioBytes = audioFile?.size || 0;

      // 1) Transakcja — najpierw utwórz rekord, aby uzyskać episodeId
      await client.query('BEGIN');
      const ins = await client.query(
        `INSERT INTO podcasts (user_id, title, description, cover_url, audio_url, cover_public_id, audio_public_id, cover_bytes, audio_bytes)
         VALUES ($1,$2,$3,NULL,NULL,NULL,NULL,$4,$5)
         RETURNING id`,
        [uid, title.trim(), description.trim(), coverBytes, audioBytes]
      );
      const episodeId = ins.rows[0].id;

      // 2) Uploady do STAŁYCH public_id => Cloudinary robi wersje (v1,v2,…)
      let cover = { url: null, public_id: null };
      let audio = { url: null, public_id: null };

      if (coverFile) {
        cover = await uploadToCloudinary(coverFile.buffer, {
          publicId: `podcaster/users/${uid}/episodes/${episodeId}/cover`,
          resourceType: 'image',
        });
      }
      if (audioFile) {
        audio = await uploadToCloudinary(audioFile.buffer, {
          publicId: `podcaster/users/${uid}/episodes/${episodeId}/audio`,
          resourceType: 'video', // audio = video w Cloudinary
        });
      }

      // 3) Uzupełnij rekord URL + public_id
      await client.query(
        `UPDATE podcasts
            SET cover_url = COALESCE($1, cover_url),
                audio_url = COALESCE($2, audio_url),
                cover_public_id = COALESCE($3, cover_public_id),
                audio_public_id = COALESCE($4, audio_public_id)
          WHERE id = $5`,
        [cover.url, audio.url, cover.public_id, audio.public_id, episodeId]
      );

      // 4) Zwiększ storage_used
      const inc = coverBytes + audioBytes;
      if (inc > 0) {
        await client.query(`UPDATE users SET storage_used = storage_used + $1 WHERE id=$2`, [inc, uid]);
      }

      await client.query('COMMIT');

      // Zwróć świeży rekord
      const out = await pool.query(
        `SELECT id, user_id, title, description,
                cover_url AS "coverUrl",
                audio_url AS "audioUrl",
                created_at
           FROM podcasts
          WHERE id = $1`,
        [episodeId]
      );
      res.status(201).json(out.rows[0]);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Błąd podczas dodawania podcastu (tx):', err);
      res.status(500).json({ error: 'Wystąpił błąd przy dodawaniu podcastu.' });
    } finally {
      client.release();
    }
  }
);

// DELETE – tylko właściciel + sprzątanie Cloudinary
app.delete('/api/podcasts/:id', authMiddleware, async (req, res) => {
  try {
    // pobierz właściciela + public_id i rozmiary
    const sel = await pool.query(
      `SELECT user_id,
              COALESCE(cover_bytes,0) + COALESCE(audio_bytes,0) AS bytes,
              cover_public_id, audio_public_id,
              cover_url, audio_url
       FROM podcasts WHERE id=$1`,
      [req.params.id]
    );
    if (!sel.rows.length) return res.status(404).json({ error: 'Nie znaleziono podcastu.' });

    const row = sel.rows[0];
    if (row.user_id !== Number(req.user.uid)) {
      return res.status(403).json({ error: 'Brak uprawnień do usunięcia.' });
    }

    // sprzątnij pliki z Cloudinary (jeśli mamy public_id; jeśli nie, spróbuj wyciągnąć z URL)
    const coverPid = row.cover_public_id || (row.cover_url ? tryExtractPublicIdFromUrl(row.cover_url) : null);
    const audioPid = row.audio_public_id || (row.audio_url ? tryExtractPublicIdFromUrl(row.audio_url) : null);

    try {
      if (coverPid) await cloudinary.uploader.destroy(coverPid, { resource_type: 'image' });
    } catch (e) {
      console.warn('Cloudinary cover destroy warning:', e?.message || e);
    }
    try {
      if (audioPid) await cloudinary.uploader.destroy(audioPid, { resource_type: 'video' });
    } catch (e) {
      console.warn('Cloudinary audio destroy warning:', e?.message || e);
    }

    // usuń rekord
    const del = await pool.query('DELETE FROM podcasts WHERE id=$1 AND user_id=$2 RETURNING id', [
      req.params.id,
      req.user.uid,
    ]);
    if (del.rowCount === 0) return res.status(404).json({ error: 'Nie znaleziono podcastu.' });

    // zdejmij storage
    const bytes = Number(row.bytes) || 0;
    if (bytes > 0) {
      await pool.query(`UPDATE users SET storage_used = GREATEST(storage_used - $1, 0) WHERE id=$2`, [bytes, req.user.uid]);
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('Błąd usuwania:', err);
    res.status(500).json({ error: 'Nie udało się usunąć podcastu.' });
  }
});

app.listen(port, () => {
  console.log(`✅ Serwer działa na http://localhost:${port}`);
});


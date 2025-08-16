// index.js
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

// ---------------- Env check ----------------
console.log('ENV CHECK:', {
  NODE_ENV: process.env.NODE_ENV,
  HAS_DATABASE_URL: !!process.env.DATABASE_URL,
  HAS_PGHOST: !!process.env.PGHOST,
  HAS_JWT_SECRET: !!process.env.JWT_SECRET,
  PORT: process.env.PORT,
});

// ---------------- Cloudinary ----------------
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ---------------- PG (Railway) ----------------
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

// ---------------- Plany/limity ----------------
// 1.1 Rozszerzone limity: maxFeeds, maxEpisodesPerFeed, maxStorageMB
const PLANS = {
  FREE:      { maxFeeds: 1,   maxEpisodesPerFeed: 10,   maxStorageMB: 200    },
  STARTER:   { maxFeeds: 5,   maxEpisodesPerFeed: 200,  maxStorageMB: 5000   },
  PRO:       { maxFeeds: 20,  maxEpisodesPerFeed: 1000, maxStorageMB: 50000  },
  BUSINESS:  { maxFeeds: null, maxEpisodesPerFeed: null, maxStorageMB: null  }, // null = bez limitu
};
const MB = 1024 * 1024;

// ---------------- Init + migracje ----------------
async function initDb() {
  // users
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id            BIGSERIAL PRIMARY KEY,
      email         TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      plan          TEXT NOT NULL DEFAULT 'FREE',
      storage_used  BIGINT NOT NULL DEFAULT 0,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  // feeds (kanały podcastu)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS feeds (
      id            BIGSERIAL PRIMARY KEY,
      user_id       BIGINT REFERENCES users(id) ON DELETE CASCADE,
      title         TEXT NOT NULL,
      slug          TEXT UNIQUE,
      description   TEXT,
      cover_url     TEXT,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_feeds_user_id ON feeds(user_id);`);

  // episodes
  await pool.query(`
    CREATE TABLE IF NOT EXISTS episodes (
      id              BIGSERIAL PRIMARY KEY,
      user_id         BIGINT REFERENCES users(id) ON DELETE CASCADE,
      feed_id         BIGINT REFERENCES feeds(id) ON DELETE CASCADE,
      title           TEXT NOT NULL,
      description     TEXT NOT NULL,
      cover_url       TEXT,
      audio_url       TEXT,
      cover_public_id TEXT,
      audio_public_id TEXT,
      audio_bytes     BIGINT DEFAULT 0,
      cover_bytes     BIGINT DEFAULT 0,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_episodes_user_id ON episodes(user_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_episodes_feed_id ON episodes(feed_id);`);

  // migracja ze starej "podcasts" (jeżeli istnieje)
  const { rows: hasOld } = await pool.query(`SELECT to_regclass('public.podcasts') AS tbl;`);
  if (hasOld?.[0]?.tbl === 'podcasts') {
    console.log('ℹ️ Wykryto starą tabelę podcasts — migracja do feeds/episodes...');
    const { rows: uids } = await pool.query(`SELECT DISTINCT user_id FROM podcasts WHERE user_id IS NOT NULL;`);
    for (const r of uids) {
      const uid = r.user_id;
      const feedIns = await pool.query(
        `INSERT INTO feeds (user_id, title, slug, description, cover_url)
         VALUES ($1, $2, $3, $4, NULL)
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [uid, 'Migrated Feed', null, 'Kanał utworzony podczas migracji']
      );
      let feedId;
      if (feedIns.rows.length) {
        feedId = feedIns.rows[0].id;
      } else {
        const { rows: f } = await pool.query(
          `SELECT id FROM feeds WHERE user_id=$1 AND title='Migrated Feed' LIMIT 1`, [uid]
        );
        feedId = f[0].id;
      }
      await pool.query(`
        INSERT INTO episodes (user_id, feed_id, title, description, cover_url, audio_url, cover_public_id, audio_public_id, audio_bytes, cover_bytes, created_at)
        SELECT user_id, $1, title, description, cover_url, audio_url, NULL, NULL, 0, 0, created_at
        FROM podcasts
        WHERE user_id = $2;
      `, [feedId, uid]);
    }
    console.log('✅ Migracja zakończona (sprawdź dane, potem usuń "podcasts" jeśli zbędna).');
  }

  console.log('✅ DB ready');
}
initDb().catch(err => {
  console.error('DB init error', err);
  process.exit(1);
});

// ---------------- Multer ----------------
const storage = multer.memoryStorage();
const upload = multer({ storage });

// ---------------- Cloudinary helpers ----------------
const uploadToCloudinary = (buffer, { publicId, resourceType }) =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        public_id: publicId,
        overwrite: true,
        unique_filename: false,
        resource_type: resourceType, // 'image' | 'video'
      },
      (error, result) => {
        if (error) return reject(error);
        resolve({ url: result.secure_url, public_id: result.public_id });
      }
    );
    Readable.from(buffer).pipe(stream);
  });

function tryExtractPublicIdFromUrl(url) {
  try {
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

// ---------------- Auth utils ----------------
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
  } catch {
    return res.status(401).json({ error: 'Nieprawidłowy token' });
  }
}

// ---------------- Limity / kwoty ----------------

// pomocniczo: pobierz konfigurację planu
function planConfig(plan) {
  return PLANS[plan] || PLANS.FREE;
}

// 1.3 globalny storage + (legacy global) liczba odcinków – sprawdzane PRZED uploadem
async function checkGlobalQuotas(req, res, next) {
  try {
    const { uid } = req.user;
    const { rows } = await pool.query('SELECT plan, storage_used FROM users WHERE id=$1', [uid]);
    if (!rows.length) return res.status(401).json({ error: 'Użytkownik nie istnieje' });

    const user = rows[0];
    const cfg = planConfig(user.plan);

    // Rozmiary plików (incoming)
    const coverBytes = req.files?.['cover']?.[0]?.size || 0;
    const audioBytes = req.files?.['audio']?.[0]?.size || 0;
    const incoming = coverBytes + audioBytes;

    if (cfg.maxStorageMB !== null) {
      const limitBytes = cfg.maxStorageMB * MB;
      if (Number(user.storage_used) + incoming > limitBytes) {
        return res.status(403).json({ error: `Brak miejsca w planie ${user.plan} (przekroczysz ${cfg.maxStorageMB} MB).` });
      }
    }

    req._quota = { plan: user.plan, storage_used: Number(user.storage_used), coverBytes, audioBytes };
    next();
  } catch (e) {
    console.error('Quota check error:', e);
    return res.status(500).json({ error: 'Błąd sprawdzania limitów.' });
  }
}

// 1.2 limit liczby feedów
async function checkFeedCreateLimit(req, res, next) {
  try {
    const { uid } = req.user;
    const { rows } = await pool.query('SELECT plan FROM users WHERE id=$1', [uid]);
    if (!rows.length) return res.status(401).json({ error: 'Użytkownik nie istnieje' });
    const cfg = planConfig(rows[0].plan);

    if (cfg.maxFeeds !== null) {
      const { rows: cnt } = await pool.query('SELECT COUNT(*)::int AS cnt FROM feeds WHERE user_id=$1', [uid]);
      if (cnt[0].cnt >= cfg.maxFeeds) {
        return res.status(403).json({ error: `Limit kanałów (${cfg.maxFeeds}) dla planu został wyczerpany.` });
      }
    }
    next();
  } catch (e) {
    console.error('Feed limit error:', e);
    res.status(500).json({ error: 'Błąd sprawdzania limitu kanałów.' });
  }
}

// 1.3 limit liczby odcinków w danym feedzie
async function checkEpisodePerFeedLimit(req, res, next) {
  try {
    const { uid } = req.user;
    const feedId = req.params.feedId;
    const { rows: urows } = await pool.query('SELECT plan FROM users WHERE id=$1', [uid]);
    if (!urows.length) return res.status(401).json({ error: 'Użytkownik nie istnieje' });
    const cfg = planConfig(urows[0].plan);

    if (cfg.maxEpisodesPerFeed !== null) {
      const { rows: cnt } = await pool.query('SELECT COUNT(*)::int AS cnt FROM episodes WHERE user_id=$1 AND feed_id=$2', [uid, feedId]);
      if (cnt[0].cnt >= cfg.maxEpisodesPerFeed) {
        return res.status(403).json({ error: `Limit odcinków (${cfg.maxEpisodesPerFeed}) w tym kanale został wyczerpany.` });
      }
    }
    next();
  } catch (e) {
    console.error('Episode-per-feed limit error:', e);
    res.status(500).json({ error: 'Błąd sprawdzania limitu odcinków w kanale.' });
  }
}

// ---------------- Diagnostyka ----------------
app.get('/__debug', (req, res) => {
  res.json({
    ok: true,
    NODE_ENV: process.env.NODE_ENV,
    HAS_DATABASE_URL: !!process.env.DATABASE_URL,
    HAS_PGHOST: !!process.env.PGHOST,
    HAS_JWT_SECRET: !!process.env.JWT_SECRET,
  });
});

// ---------------- AUTH ----------------
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
    if (!sel.rows.length) return res.status(401).json({ error: 'Nieprawidłowe dane logowania.' });

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
    const cnt = await pool.query(`SELECT COUNT(*)::int AS cnt FROM episodes WHERE user_id=$1`, [uid]);
    user.episodes = cnt.rows[0].cnt;
    res.json({ user, planLimits: PLANS[user.plan] || PLANS.FREE });
  } catch (e) {
    console.error('/me error:', e);
    res.status(500).json({ error: 'Błąd pobierania profilu.' });
  }
});

// ---------------- FEEDS ----------------

// Publiczne listowanie feedów
app.get('/api/feeds', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, user_id, title, slug, description, cover_url, created_at
       FROM feeds
       ORDER BY created_at DESC`
    );
    res.json(rows);
  } catch (e) {
    console.error('Błąd listowania feedów:', e);
    res.status(500).json({ error: 'Nie udało się pobrać feedów.' });
  }
});

// Tylko moje feedy
app.get('/api/my-feeds', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, user_id, title, slug, description, cover_url, created_at
       FROM feeds
       WHERE user_id=$1
       ORDER BY created_at DESC`,
      [req.user.uid]
    );
    res.json(rows);
  } catch (e) {
    console.error('Błąd listowania moich feedów:', e);
    res.status(500).json({ error: 'Nie udało się pobrać Twoich feedów.' });
  }
});

// 1.2 Tworzenie feedu z limitem maxFeeds
app.post('/api/feeds', authMiddleware, checkFeedCreateLimit, async (req, res) => {
  try {
    const { title, description, slug } = req.body || {};
    if (!title?.trim()) return res.status(400).json({ error: 'Tytuł feedu jest wymagany.' });

    const ins = await pool.query(
      `INSERT INTO feeds (user_id, title, slug, description, cover_url)
       VALUES ($1,$2,$3,$4,NULL)
       RETURNING id, user_id, title, slug, description, cover_url, created_at`,
      [req.user.uid, title.trim(), slug?.trim() || null, description?.trim() || null]
    );
    res.status(201).json(ins.rows[0]);
  } catch (e) {
    console.error('Błąd tworzenia feedu:', e);
    res.status(500).json({ error: 'Nie udało się utworzyć feedu.' });
  }
});

// 1.4 Usunięcie feedu + sprzątanie Cloudinary + odjęcie storage
app.delete('/api/feeds/:feedId', authMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const feedId = req.params.feedId;
    // upewnij się, że feed należy do usera
    const { rows } = await client.query(`SELECT id FROM feeds WHERE id=$1 AND user_id=$2`, [feedId, req.user.uid]);
    if (!rows.length) return res.status(404).json({ error: 'Feed nie istnieje lub nie należy do Ciebie.' });

    // weź wszystkie epizody do sprzątnięcia i policz bajty
    const { rows: eps } = await client.query(
      `SELECT id, cover_public_id, audio_public_id, cover_url, audio_url,
              COALESCE(cover_bytes,0) + COALESCE(audio_bytes,0) AS bytes
         FROM episodes
        WHERE feed_id=$1`,
      [feedId]
    );

    // Cloudinary cleanup (best effort)
    for (const ep of eps) {
      const cpid = ep.cover_public_id || (ep.cover_url ? tryExtractPublicIdFromUrl(ep.cover_url) : null);
      const apid = ep.audio_public_id || (ep.audio_url ? tryExtractPublicIdFromUrl(ep.audio_url) : null);
      try { if (cpid) await cloudinary.uploader.destroy(cpid, { resource_type: 'image' }); } catch {}
      try { if (apid) await cloudinary.uploader.destroy(apid, { resource_type: 'video' }); } catch {}
    }

    // policz sumaryczne bajty do odjęcia
    const totalBytes = eps.reduce((s, e) => s + Number(e.bytes || 0), 0);

    await client.query('BEGIN');
    await client.query(`DELETE FROM feeds WHERE id=$1 AND user_id=$2`, [feedId, req.user.uid]);
    if (totalBytes > 0) {
      await client.query(`UPDATE users SET storage_used = GREATEST(storage_used - $1, 0) WHERE id=$2`, [totalBytes, req.user.uid]);
    }
    await client.query('COMMIT');

    res.json({ ok: true, freedBytes: totalBytes });
  } catch (e) {
    await (async () => { try { await client.query('ROLLBACK'); } catch {} })();
    console.error('Błąd usuwania feedu:', e);
    res.status(500).json({ error: 'Nie udało się usunąć feedu.' });
  } finally {
    client.release();
  }
});

// ---------------- EPISODES ----------------

// Public: lista odcinków w feedzie
app.get('/api/feeds/:feedId/episodes', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, user_id, feed_id, title, description,
              cover_url AS "coverUrl",
              audio_url AS "audioUrl",
              created_at
         FROM episodes
        WHERE feed_id=$1
        ORDER BY created_at DESC`,
      [req.params.feedId]
    );
    res.json(rows);
  } catch (e) {
    console.error('Błąd listowania epizodów:', e);
    res.status(500).json({ error: 'Nie udało się pobrać odcinków.' });
  }
});

// Moje odcinki (wszystkie feedy)
app.get('/api/my-episodes', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, user_id, feed_id, title, description,
              cover_url AS "coverUrl",
              audio_url AS "audioUrl",
              created_at
         FROM episodes
        WHERE user_id=$1
        ORDER BY created_at DESC`,
      [req.user.uid]
    );
    res.json(rows);
  } catch (e) {
    console.error('Błąd listowania moich epizodów:', e);
    res.status(500).json({ error: 'Nie udało się pobrać Twoich odcinków.' });
  }
});

// 1.3 Dodanie odcinka do feedu: sprawdź własność feedu, limit per‑feed i storage
app.post(
  '/api/feeds/:feedId/episodes',
  authMiddleware,
  upload.fields([{ name: 'cover', maxCount: 1 }, { name: 'audio', maxCount: 1 }]),
  checkEpisodePerFeedLimit,   // najpierw liczba odcinków w kanale
  checkGlobalQuotas,          // potem storage
  async (req, res) => {
    const { title, description } = req.body || {};
    if (!title?.trim() || !description?.trim()) {
      return res.status(400).json({ error: 'Tytuł i opis są wymagane.' });
    }

    // feed musi należeć do usera
    const { rows: feedRows } = await pool.query(`SELECT id FROM feeds WHERE id=$1 AND user_id=$2`, [req.params.feedId, req.user.uid]);
    if (!feedRows.length) return res.status(404).json({ error: 'Feed nie istnieje lub nie należy do Ciebie.' });

    const client = await pool.connect();
    try {
      const uid = req.user.uid;
      const feedId = req.params.feedId;

      const coverFile = req.files?.['cover']?.[0] || null;
      const audioFile = req.files?.['audio']?.[0] || null;

      const coverBytes = coverFile?.size || 0;
      const audioBytes = audioFile?.size || 0;

      await client.query('BEGIN');
      const ins = await client.query(
        `INSERT INTO episodes (user_id, feed_id, title, description, cover_url, audio_url,
                               cover_public_id, audio_public_id, cover_bytes, audio_bytes)
         VALUES ($1,$2,$3,$4,NULL,NULL,NULL,NULL,$5,$6)
         RETURNING id`,
        [uid, feedId, title.trim(), description.trim(), coverBytes, audioBytes]
      );
      const episodeId = ins.rows[0].id;

      let cover = { url: null, public_id: null };
      let audio = { url: null, public_id: null };

      if (coverFile) {
        cover = await uploadToCloudinary(coverFile.buffer, {
          publicId: `podcaster/users/${uid}/feeds/${feedId}/episodes/${episodeId}/cover`,
          resourceType: 'image',
        });
      }
      if (audioFile) {
        audio = await uploadToCloudinary(audioFile.buffer, {
          publicId: `podcaster/users/${uid}/feeds/${feedId}/episodes/${episodeId}/audio`,
          resourceType: 'video',
        });
      }

      await client.query(
        `UPDATE episodes
            SET cover_url=$1, audio_url=$2,
                cover_public_id=$3, audio_public_id=$4
          WHERE id=$5`,
        [cover.url, audio.url, cover.public_id, audio.public_id, episodeId]
      );

      const inc = coverBytes + audioBytes;
      if (inc > 0) {
        await client.query(`UPDATE users SET storage_used = storage_used + $1 WHERE id=$2`, [inc, uid]);
      }

      await client.query('COMMIT');

      const out = await pool.query(
        `SELECT id, user_id, feed_id, title, description,
                cover_url AS "coverUrl",
                audio_url AS "audioUrl",
                created_at
           FROM episodes
          WHERE id=$1`,
        [episodeId]
      );
      res.status(201).json(out.rows[0]);
    } catch (e) {
      await client.query('ROLLBACK');
      console.error('Błąd dodawania epizodu:', e);
      res.status(500).json({ error: 'Wystąpił błąd przy dodawaniu odcinka.' });
    } finally {
      client.release();
    }
  }
);

// 1.4 Usuń odcinek: sprzątanie Cloudinary + odjęcie storage (było, zostaje)
app.delete('/api/episodes/:id', authMiddleware, async (req, res) => {
  try {
    const sel = await pool.query(
      `SELECT user_id,
              COALESCE(cover_bytes,0) + COALESCE(audio_bytes,0) AS bytes,
              cover_public_id, audio_public_id,
              cover_url, audio_url
         FROM episodes
        WHERE id=$1`,
      [req.params.id]
    );
    if (!sel.rows.length) return res.status(404).json({ error: 'Nie znaleziono odcinka.' });
    const row = sel.rows[0];
    if (row.user_id !== Number(req.user.uid)) {
      return res.status(403).json({ error: 'Brak uprawnień do usunięcia.' });
    }

    const coverPid = row.cover_public_id || (row.cover_url ? tryExtractPublicIdFromUrl(row.cover_url) : null);
    const audioPid = row.audio_public_id || (row.audio_url ? tryExtractPublicIdFromUrl(row.audio_url) : null);
    try { if (coverPid) await cloudinary.uploader.destroy(coverPid, { resource_type: 'image' }); } catch {}
    try { if (audioPid) await cloudinary.uploader.destroy(audioPid, { resource_type: 'video' }); } catch {}

    const del = await pool.query(`DELETE FROM episodes WHERE id=$1 AND user_id=$2 RETURNING id`, [
      req.params.id,
      req.user.uid,
    ]);
    if (!del.rowCount) return res.status(404).json({ error: 'Nie znaleziono odcinka.' });

    const bytes = Number(row.bytes) || 0;
    if (bytes > 0) {
      await pool.query(`UPDATE users SET storage_used = GREATEST(storage_used - $1, 0) WHERE id=$2`, [bytes, req.user.uid]);
    }

    res.json({ ok: true });
  } catch (e) {
    console.error('Błąd usuwania odcinka:', e);
    res.status(500).json({ error: 'Nie udało się usunąć odcinka.' });
  }
});

// ---------------- Legacy public alias ----------------
app.get('/api/podcasts', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, user_id, feed_id, title, description,
              cover_url AS "coverUrl",
              audio_url AS "audioUrl",
              created_at
         FROM episodes
        ORDER BY created_at DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error('Błąd pobierania (legacy /api/podcasts):', err);
    res.status(500).json({ error: 'Nie udało się pobrać podcastów.' });
  }
});

app.listen(port, () => {
  console.log(`✅ Serwer działa na http://localhost:${port}`);
});

import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const DURATIONS = { '1m': 1, '3m': 3, '6m': 6, '1y': 12 };

function resolveDuration(duration, expires_at) {
  if (expires_at) {
    const d = new Date(expires_at);
    return isNaN(d) ? null : d.toISOString().slice(0, 10);
  }
  if (duration && DURATIONS[duration] !== undefined) {
    const d = new Date();
    d.setMonth(d.getMonth() + DURATIONS[duration]);
    return d.toISOString().slice(0, 10);
  }
  return null;
}

export function createApp(db, adminUser, adminPass) {
  // ── Schema ────────────────────────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS licenses (
      key        TEXT PRIMARY KEY,
      name       TEXT    DEFAULT '',
      note       TEXT    DEFAULT '',
      created_at TEXT    DEFAULT (datetime('now')),
      active     INTEGER DEFAULT 1,
      expires_at TEXT    DEFAULT NULL
    )
  `);

  // Migrate existing DB — add expires_at if missing
  try { db.exec(`ALTER TABLE licenses ADD COLUMN expires_at TEXT DEFAULT NULL`); } catch {}

  // ── Queries ───────────────────────────────────────────────────────────────────
  const q = {
    list:        db.prepare('SELECT * FROM licenses ORDER BY created_at DESC'),
    get:         db.prepare(`
                   SELECT active, expires_at FROM licenses WHERE key = ?
                 `),
    insert:      db.prepare('INSERT INTO licenses (key, name, note, expires_at) VALUES (?, ?, ?, ?)'),
    setActive:   db.prepare('UPDATE licenses SET active = ? WHERE key = ?'),
    setExpiry:   db.prepare('UPDATE licenses SET expires_at = ? WHERE key = ?'),
    delete:      db.prepare('DELETE FROM licenses WHERE key = ?'),
    stats:       db.prepare(`
                   SELECT
                     SUM(CASE WHEN active = 1 AND (expires_at IS NULL OR expires_at > date('now')) THEN 1 ELSE 0 END) AS active,
                     SUM(CASE WHEN active = 0 THEN 1 ELSE 0 END) AS revoked,
                     SUM(CASE WHEN active = 1 AND expires_at IS NOT NULL AND expires_at <= date('now') THEN 1 ELSE 0 END) AS expired
                   FROM licenses
                 `),
  };

  function generateKey() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const seg = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    return `${seg()}-${seg()}-${seg()}-${seg()}`;
  }

  // ── Middleware ─────────────────────────────────────────────────────────────────
  const app = express();
  app.use(express.json());
  app.use(express.static(join(__dirname, 'public')));

  function requireAuth(req, res, next) {
    const header = req.headers.authorization ?? '';
    if (!header.startsWith('Basic ')) {
      res.set('WWW-Authenticate', 'Basic realm="xBot Admin"');
      return res.status(401).send('Unauthorized');
    }
    const [user, pass] = Buffer.from(header.slice(6), 'base64').toString().split(':');
    if (user !== adminUser || pass !== adminPass) {
      return res.status(403).send('Forbidden');
    }
    next();
  }

  // ── Public route (extension) ───────────────────────────────────────────────────
  app.options('/validate', (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    res.sendStatus(204);
  });

  app.post('/validate', (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    const { key } = req.body ?? {};
    if (!key || typeof key !== 'string') return res.json({ valid: false });
    const row = q.get.get(key.trim().toUpperCase());
    if (!row || row.active !== 1) return res.json({ valid: false });
    if (row.expires_at && row.expires_at <= new Date().toISOString().slice(0, 10)) {
      return res.json({ valid: false });
    }
    res.json({ valid: true });
  });

  // ── Admin routes ───────────────────────────────────────────────────────────────
  app.get('/admin/stats', requireAuth, (_req, res) => {
    res.json(q.stats.get());
  });

  app.get('/admin/keys', requireAuth, (_req, res) => {
    res.json(q.list.all());
  });

  app.post('/admin/keys', requireAuth, (req, res) => {
    const { name = '', note = '', expires_at, duration } = req.body ?? {};
    const key = generateKey();
    const expiry = resolveDuration(duration, expires_at);
    q.insert.run(key, name.trim(), note.trim(), expiry);
    res.json({ key, expires_at: expiry });
  });

  app.patch('/admin/keys/:key', requireAuth, (req, res) => {
    const { active, expires_at, duration } = req.body ?? {};
    if (active !== undefined) q.setActive.run(active ? 1 : 0, req.params.key);
    if (expires_at !== undefined || duration !== undefined) {
      q.setExpiry.run(resolveDuration(duration, expires_at), req.params.key);
    }
    res.json({ ok: true });
  });

  app.delete('/admin/keys/:key', requireAuth, (req, res) => {
    q.delete.run(req.params.key);
    res.json({ ok: true });
  });

  return app;
}

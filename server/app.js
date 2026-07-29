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

  // Sightings of a per-install ID (router.ts's INSTALL_ID_KEY, chrome.storage.sync,
  // random per Chrome account — see that file's comment for why sync rather than
  // local) alongside a key, recorded only on a successful /validate. Logging only,
  // for now: nothing here changes whether a check passes or fails, this just gives
  // the admin panel visibility into how many distinct installs are using one key.
  db.exec(`
    CREATE TABLE IF NOT EXISTS license_installs (
      key        TEXT NOT NULL,
      install_id TEXT NOT NULL,
      first_seen TEXT NOT NULL DEFAULT (datetime('now')),
      last_seen  TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (key, install_id)
    )
  `);

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

    recordInstall:  db.prepare(`
                      INSERT INTO license_installs (key, install_id) VALUES (?, ?)
                      ON CONFLICT(key, install_id) DO UPDATE SET last_seen = datetime('now')
                    `),
    installCounts:  db.prepare(`
                      SELECT key, COUNT(*) AS n
                      FROM license_installs
                      WHERE last_seen > datetime('now', '-30 days')
                      GROUP BY key
                    `),
    listInstalls:   db.prepare(`
                      SELECT install_id, first_seen, last_seen
                      FROM license_installs
                      WHERE key = ?
                      ORDER BY last_seen DESC
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
    const { key, installId } = req.body ?? {};
    if (!key || typeof key !== 'string') return res.json({ valid: false, expires_at: null });
    const normalizedKey = key.trim().toUpperCase();
    const row = q.get.get(normalizedKey);
    if (!row || row.active !== 1) return res.json({ valid: false, expires_at: null });
    if (row.expires_at && row.expires_at <= new Date().toISOString().slice(0, 10)) {
      return res.json({ valid: false, expires_at: row.expires_at });
    }
    // Logging only — a missing/malformed installId never affects the result
    // above, this only feeds the admin panel's distinct-installs-per-key view.
    if (installId && typeof installId === 'string' && installId.length <= 128) {
      try { q.recordInstall.run(normalizedKey, installId.trim()); } catch {}
    }
    res.json({ valid: true, expires_at: row.expires_at ?? null });
  });

  // ── Admin routes ───────────────────────────────────────────────────────────────
  app.get('/admin/stats', requireAuth, (_req, res) => {
    res.json(q.stats.get());
  });

  app.get('/admin/keys', requireAuth, (_req, res) => {
    // install_count_30d is additive — existing consumers of this response
    // that don't know about the field simply ignore it.
    const counts = Object.fromEntries(q.installCounts.all().map((r) => [r.key, r.n]));
    res.json(q.list.all().map((row) => ({ ...row, install_count_30d: counts[row.key] ?? 0 })));
  });

  // Per-install detail for one key — who (which install ID) has actually
  // been validating it and when, for reviewing a key flagged by an unusually
  // high install_count_30d above. No auto-action taken on this data.
  app.get('/admin/keys/:key/installs', requireAuth, (req, res) => {
    res.json(q.listInstalls.all(req.params.key.trim().toUpperCase()));
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
    if ('expires_at' in (req.body ?? {}) || duration !== undefined) {
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

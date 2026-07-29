import express from 'express';

const SIZES = ['small', 'medium', 'large', 'unknown'];
const TW_ORIGIN = /^https:\/\/[a-z0-9-]+\.tribalwars\.com\.pt$/;
const DEFAULT_WINDOW_HOURS = 12;

// Reuses the exact same validation endpoint the extension itself already
// calls from background/service-worker.ts's VALIDATE_LICENSE handler — same
// URL, same request shape — rather than inventing a second auth mechanism.
const LICENSE_VALIDATE_URL = 'https://license.vivaomadeira.com/validate';
// Mirrors router.ts's own client-side license cache TTL (CACHE_TTL_MS there).
const LICENSE_CACHE_TTL_MS = 24 * 3600_000;
const LICENSE_CHECK_TIMEOUT_MS = 5_000;

function windowMs(raw) {
  const hours = Number(raw);
  return (Number.isFinite(hours) && hours > 0 ? hours : DEFAULT_WINDOW_HOURS) * 3600_000;
}

// Real network call, swappable in tests (see createApp's second argument) so
// the test suite never depends on internet access or a real license key.
async function defaultValidateLicense(key) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LICENSE_CHECK_TIMEOUT_MS);
  try {
    const res = await fetch(LICENSE_VALIDATE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`validate endpoint returned ${res.status}`);
    const data = await res.json();
    return { valid: !!data.valid, expiresAt: data.expires_at ?? null };
  } finally {
    clearTimeout(timer);
  }
}

export function createApp(db, { validateLicense = defaultValidateLicense } = {}) {
  // ── Schema ────────────────────────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS attacks (
      world           TEXT NOT NULL,
      cmd_id          TEXT NOT NULL,
      src_village_id  TEXT NOT NULL,
      src_x           INTEGER,
      src_y           INTEGER,
      dest_village_id TEXT,
      player          TEXT,
      size            TEXT NOT NULL CHECK(size IN ('small','medium','large','unknown')),
      in_range        INTEGER NOT NULL DEFAULT 0,
      arrival_ms      INTEGER,
      reporter_id     TEXT,
      first_seen_ms   INTEGER NOT NULL,
      last_seen_ms    INTEGER NOT NULL,
      PRIMARY KEY (world, cmd_id)
    );
    CREATE INDEX IF NOT EXISTS idx_src_village ON attacks(world, src_village_id);

    -- Commands the client no longer sees on the incomings page AND whose own
    -- arrival time has already passed get moved here from "attacks" — keeps
    -- the active table (and therefore /advisory's confirmedNearby/knownSizes
    -- computation) scoped to attacks that are still relevant, instead of
    -- accumulating every attack ever reported forever.
    CREATE TABLE IF NOT EXISTS attacks_history (
      world           TEXT NOT NULL,
      cmd_id          TEXT NOT NULL,
      src_village_id  TEXT NOT NULL,
      src_x           INTEGER,
      src_y           INTEGER,
      dest_village_id TEXT,
      player          TEXT,
      size            TEXT NOT NULL,
      in_range        INTEGER NOT NULL DEFAULT 0,
      arrival_ms      INTEGER,
      reporter_id     TEXT,
      first_seen_ms   INTEGER NOT NULL,
      last_seen_ms    INTEGER NOT NULL,
      resolved_ms     INTEGER NOT NULL,
      PRIMARY KEY (world, cmd_id)
    );
  `);

  // ── Queries ───────────────────────────────────────────────────────────────────
  // Resolution rank: unknown = 0, small/medium/large = 1. A row is only overwritten
  // when the incoming observation outranks the stored one, so a later `unknown`
  // never erases a size someone already resolved.
  const q = {
    upsert: db.prepare(`
      INSERT INTO attacks (
        world, cmd_id, src_village_id, src_x, src_y, dest_village_id, player,
        size, in_range, arrival_ms, reporter_id, first_seen_ms, last_seen_ms
      ) VALUES (
        @world, @cmdId, @srcVillageId, @srcX, @srcY, @destVillageId, @player,
        @size, @inRange, @arrivalMs, @reporterId, @now, @now
      )
      ON CONFLICT(world, cmd_id) DO UPDATE SET
        size = CASE
          WHEN excluded.size <> 'unknown' AND attacks.size = 'unknown'
          THEN excluded.size ELSE attacks.size END,
        in_range = CASE
          WHEN excluded.size <> 'unknown' AND attacks.size = 'unknown'
          THEN excluded.in_range ELSE attacks.in_range END,
        last_seen_ms = @now
    `),

    byVillage: db.prepare(`
      SELECT size, in_range, arrival_ms
      FROM attacks
      WHERE world = ? AND src_village_id = ?
    `),

    totals: db.prepare(`
      SELECT COUNT(*) AS totalCommands,
             COUNT(DISTINCT src_village_id) AS totalSrcVillages
      FROM attacks WHERE world = ?
    `),

    advisoriesActive: db.prepare(`
      SELECT COUNT(*) AS n FROM (
        SELECT u.src_village_id
        FROM attacks u
        JOIN attacks l
          ON l.world = u.world
         AND l.src_village_id = u.src_village_id
         AND l.size IN ('large', 'medium')
         AND l.in_range = 1
        WHERE u.world = @world
          AND u.size = 'unknown'
          AND u.arrival_ms IS NOT NULL
          AND l.arrival_ms IS NOT NULL
          AND ABS(u.arrival_ms - l.arrival_ms) <= @windowMs
        GROUP BY u.src_village_id
      )
    `),

    getActive: db.prepare(`
      SELECT * FROM attacks WHERE world = ? AND cmd_id = ?
    `),
    deleteActive: db.prepare(`
      DELETE FROM attacks WHERE world = ? AND cmd_id = ?
    `),
    insertHistory: db.prepare(`
      INSERT INTO attacks_history (
        world, cmd_id, src_village_id, src_x, src_y, dest_village_id, player,
        size, in_range, arrival_ms, reporter_id, first_seen_ms, last_seen_ms, resolved_ms
      ) VALUES (
        @world, @cmd_id, @src_village_id, @src_x, @src_y, @dest_village_id, @player,
        @size, @in_range, @arrival_ms, @reporter_id, @first_seen_ms, @last_seen_ms, @resolved_ms
      )
      ON CONFLICT(world, cmd_id) DO UPDATE SET
        size = excluded.size, in_range = excluded.in_range,
        last_seen_ms = excluded.last_seen_ms, resolved_ms = excluded.resolved_ms
    `),
  };

  // Moves one row from the active table to history atomically — either both
  // statements apply or neither does, so a crash mid-move can't duplicate or
  // silently drop a row.
  const moveToHistory = db.transaction((world, cmdId, resolvedMs) => {
    const row = q.getActive.get(world, cmdId);
    if (!row) return false;
    q.insertHistory.run({ ...row, resolved_ms: resolvedMs });
    q.deleteActive.run(world, cmdId);
    return true;
  });

  // ── Middleware ────────────────────────────────────────────────────────────────
  const app = express();
  app.use(express.json());

  // Reflect the Origin only for TribalWars PT game pages — never a wildcard, since
  // this server binds to localhost and any page could otherwise read it. The
  // Private-Network header is what lets an HTTPS page reach localhost at all.
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && TW_ORIGIN.test(origin)) {
      res.set('Access-Control-Allow-Origin', origin);
      res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.set('Access-Control-Allow-Headers', 'Content-Type, X-XBot-License');
      res.set('Access-Control-Allow-Private-Network', 'true');
    }
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  // ── License gate ──────────────────────────────────────────────────────────────
  // In-memory only (resets on server restart — a restart is a reasonable
  // natural point to recheck, and this doesn't need to survive one). Every
  // data-bearing route requires a valid key; /health stays open since it's
  // just a liveness ping the panel needs before a key is even configured.
  //
  // Fail-closed, deliberately: a cache HIT is trusted without a fresh network
  // call (that's normal operation, not a failure), but if there's no usable
  // cache and the live validate call itself fails (network error, timeout,
  // non-200), the request is REJECTED — never falls back to an old cached
  // verdict or defaults to allowing it through. This is stricter than
  // router.ts's own client-side cache, which does fall back to a stale
  // cached verdict on a failed live check — that looser behavior was not
  // reused here on purpose.
  const licenseCache = new Map(); // normalizedKey -> { valid, expiresAt, checkedMs }

  async function checkLicense(key) {
    const now = Date.now();
    const cached = licenseCache.get(key);
    if (cached && (now - cached.checkedMs) < LICENSE_CACHE_TTL_MS) return cached;

    try {
      const { valid, expiresAt } = await validateLicense(key);
      const fresh = { valid, expiresAt, checkedMs: now };
      licenseCache.set(key, fresh);
      return fresh;
    } catch (e) {
      return { valid: false, expiresAt: null, checkedMs: now, unreachable: true };
    }
  }

  async function requireLicense(req, res, next) {
    const key = (req.get('X-XBot-License') || '').trim().toUpperCase();
    if (!key) return res.status(401).json({ ok: false, error: 'license key required' });

    const result = await checkLicense(key);
    if (!result.valid) {
      return result.unreachable
        ? res.status(503).json({ ok: false, error: 'license validation unreachable' })
        : res.status(403).json({ ok: false, error: 'invalid or expired license' });
    }
    next();
  }

  // ── Routes ────────────────────────────────────────────────────────────────────
  app.post('/report', requireLicense, (req, res) => {
    const {
      world, cmdId, srcVillageId, srcX, srcY, destVillageId,
      player, size, inRange, arrivalMs, reporterId,
    } = req.body ?? {};

    if (!world || !cmdId || !srcVillageId) {
      return res.status(400).json({ ok: false, error: 'world, cmdId and srcVillageId are required' });
    }
    if (!SIZES.includes(size)) {
      return res.status(400).json({ ok: false, error: `size must be one of ${SIZES.join('|')}` });
    }

    q.upsert.run({
      world: String(world),
      cmdId: String(cmdId),
      srcVillageId: String(srcVillageId),
      srcX: Number.isFinite(Number(srcX)) ? Number(srcX) : null,
      srcY: Number.isFinite(Number(srcY)) ? Number(srcY) : null,
      destVillageId: destVillageId != null ? String(destVillageId) : null,
      player: player != null ? String(player) : null,
      size,
      inRange: inRange ? 1 : 0,
      arrivalMs: Number.isFinite(Number(arrivalMs)) ? Number(arrivalMs) : null,
      reporterId: reporterId != null ? String(reporterId) : null,
      now: Date.now(),
    });

    res.json({ ok: true });
  });

  app.get('/advisory', requireLicense, (req, res) => {
    const { world, srcVillageId } = req.query;
    if (!world || !srcVillageId) {
      return res.status(400).json({ error: 'world and srcVillageId are required' });
    }

    const rows = q.byVillage.all(String(world), String(srcVillageId));
    const knownSizes = { small: 0, medium: 0, large: 0, unknown: 0 };
    for (const r of rows) knownSizes[r.size]++;

    // Raw evidence only — never a computed "likely X" guess. For each of
    // medium/large, "confirmed nearby" means at least one in-range row of
    // that size exists whose arrival falls within windowHours of at least
    // one currently-unknown row from the same village. The client shows
    // this as-is; the player decides what it means for any specific attack.
    const unknownArrivals = rows
      .filter((r) => r.size === 'unknown' && r.arrival_ms != null)
      .map((r) => r.arrival_ms);
    const span = windowMs(req.query.windowHours);

    function confirmedNearbyFor(size) {
      const arrivals = rows
        .filter((r) => r.size === size && r.in_range === 1 && r.arrival_ms != null)
        .map((r) => r.arrival_ms);
      if (arrivals.length === 0 || unknownArrivals.length === 0) return false;
      return unknownArrivals.some((u) => arrivals.some((a) => Math.abs(u - a) <= span));
    }

    res.json({
      srcVillageId: String(srcVillageId),
      knownSizes,
      confirmedNearby: {
        medium: confirmedNearbyFor('medium'),
        large: confirmedNearbyFor('large'),
      },
    });
  });

  app.get('/stats', requireLicense, (req, res) => {
    const { world } = req.query;
    if (!world) return res.status(400).json({ error: 'world is required' });

    const totals = q.totals.get(String(world));
    const { n } = q.advisoriesActive.get({ world: String(world), windowMs: windowMs(req.query.windowHours) });

    res.json({
      totalCommands: totals.totalCommands,
      totalSrcVillages: totals.totalSrcVillages,
      advisoriesActive: n,
    });
  });

  app.post('/resolve', requireLicense, (req, res) => {
    const { world, cmdId } = req.body ?? {};
    if (!world || !cmdId) {
      return res.status(400).json({ ok: false, error: 'world and cmdId are required' });
    }
    const moved = moveToHistory(String(world), String(cmdId), Date.now());
    res.json({ ok: true, moved });
  });

  app.get('/health', (_req, res) => res.json({ ok: true, db: 'xBot.db' }));

  return app;
}

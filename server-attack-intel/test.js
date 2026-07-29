import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { createApp } from './app.js';

const ORIGIN = 'https://pt111.tribalwars.com.pt';
const HOUR = 3600_000;
const TEST_KEY = 'TEST-VALID-KEY';

// Stands in for the real license.vivaomadeira.com call throughout this suite
// so tests never touch the network or depend on a real license key existing.
// Everywhere except the dedicated "License gate" suite below, TEST_KEY is
// always valid — that's enough to exercise every other route's own logic
// without the gate itself getting in the way.
function fakeValidateLicense(key) {
  return Promise.resolve(key === TEST_KEY ? { valid: true, expiresAt: null } : { valid: false, expiresAt: null });
}

let server;
let url;
let db;

before(async () => {
  db = new Database(':memory:');
  const app = createApp(db, { validateLicense: fakeValidateLicense });
  await new Promise((res) => { server = app.listen(0, res); });
  url = `http://localhost:${server.address().port}`;
});

after(() => server?.close());

// ── Helpers ────────────────────────────────────────────────────────────────────
async function post(path, body, headers = {}) {
  const r = await fetch(`${url}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-XBot-License': TEST_KEY, ...headers },
    body: JSON.stringify(body),
  });
  return { status: r.status, body: await r.json() };
}

async function get(path, headers = {}) {
  const r = await fetch(`${url}${path}`, { headers: { 'X-XBot-License': TEST_KEY, ...headers } });
  return { status: r.status, body: await r.json() };
}

function report(overrides = {}) {
  return post('/report', {
    world: 'pt111',
    cmdId: '1218502357',
    srcVillageId: '7045',
    srcX: 452,
    srcY: 419,
    destVillageId: '16807',
    player: 'Fr0do',
    size: 'small',
    inRange: true,
    arrivalMs: 1716000000000,
    reporterId: 'reporter-uuid',
    ...overrides,
  });
}

function row(world, cmdId) {
  return db.prepare('SELECT * FROM attacks WHERE world = ? AND cmd_id = ?').get(world, cmdId);
}
function historyRow(world, cmdId) {
  return db.prepare('SELECT * FROM attacks_history WHERE world = ? AND cmd_id = ?').get(world, cmdId);
}

// ── POST /report ──────────────────────────────────────────────────────────────
describe('POST /report', () => {
  test('inserts a row', async () => {
    const { status, body } = await report({ cmdId: 'insert-1' });
    assert.equal(status, 200);
    assert.deepEqual(body, { ok: true });

    const r = row('pt111', 'insert-1');
    assert.equal(r.src_village_id, '7045');
    assert.equal(r.src_x, 452);
    assert.equal(r.player, 'Fr0do');
    assert.equal(r.size, 'small');
    assert.equal(r.in_range, 1);
    assert.equal(r.arrival_ms, 1716000000000);
    assert.equal(r.first_seen_ms, r.last_seen_ms);
  });

  test('rejects an invalid size with 400', async () => {
    const { status } = await report({ cmdId: 'bad-size', size: 'huge' });
    assert.equal(status, 400);
    assert.equal(row('pt111', 'bad-size'), undefined);
  });

  test('rejects missing world / cmdId / srcVillageId with 400', async () => {
    assert.equal((await post('/report', { cmdId: 'x', srcVillageId: '1', size: 'small' })).status, 400);
    assert.equal((await post('/report', { world: 'pt111', srcVillageId: '1', size: 'small' })).status, 400);
    assert.equal((await post('/report', { world: 'pt111', cmdId: 'x', size: 'small' })).status, 400);
  });

  test('upgrades unknown → known on re-report', async () => {
    await report({ cmdId: 'upgrade-1', size: 'unknown', inRange: false });
    assert.equal(row('pt111', 'upgrade-1').size, 'unknown');

    await report({ cmdId: 'upgrade-1', size: 'large', inRange: true });
    const r = row('pt111', 'upgrade-1');
    assert.equal(r.size, 'large');
    assert.equal(r.in_range, 1);
  });

  test('never downgrades known → unknown', async () => {
    await report({ cmdId: 'downgrade-1', size: 'large', inRange: true });
    await report({ cmdId: 'downgrade-1', size: 'unknown', inRange: false });

    const r = row('pt111', 'downgrade-1');
    assert.equal(r.size, 'large');
    assert.equal(r.in_range, 1);
  });

  test('refreshes last_seen_ms but keeps first_seen_ms', async () => {
    await report({ cmdId: 'seen-1', size: 'small' });
    const first = row('pt111', 'seen-1');

    await new Promise((r) => setTimeout(r, 5));
    await report({ cmdId: 'seen-1', size: 'small' });
    const second = row('pt111', 'seen-1');

    assert.equal(second.first_seen_ms, first.first_seen_ms);
    assert.ok(second.last_seen_ms > first.last_seen_ms);
  });

  test('does not create a duplicate row for the same cmd_id', async () => {
    await report({ cmdId: 'dupe-1' });
    await report({ cmdId: 'dupe-1' });
    const { n } = db.prepare("SELECT COUNT(*) AS n FROM attacks WHERE cmd_id = 'dupe-1'").get();
    assert.equal(n, 1);
  });
});

// ── GET /advisory ─────────────────────────────────────────────────────────────
// confirmedNearby is raw evidence only (which sizes were actually confirmed
// nearby in time), never a computed "likely X" guess — the client decides
// how to present that, and the player decides what it means.
describe('GET /advisory', () => {
  const T = 1_700_000_000_000;

  test('returns confirmedNearby:{false,false} with zeroed counts for an unknown village', async () => {
    const { status, body } = await get('/advisory?world=pt111&srcVillageId=does-not-exist');
    assert.equal(status, 200);
    assert.deepEqual(body, {
      srcVillageId: 'does-not-exist',
      knownSizes: { small: 0, medium: 0, large: 0, unknown: 0 },
      hasOtherReports: false,
      confirmedNearby: { medium: false, large: false },
    });
  });

  test('confirms large for an in-window unknown', async () => {
    await report({ cmdId: 'adv-a-1', srcVillageId: 'adv-a', size: 'large', inRange: true, arrivalMs: T });
    await report({ cmdId: 'adv-a-2', srcVillageId: 'adv-a', size: 'unknown', inRange: false, arrivalMs: T + 2 * HOUR });

    const { body } = await get('/advisory?world=pt111&srcVillageId=adv-a&windowHours=12');
    assert.deepEqual(body.confirmedNearby, { medium: false, large: true });
    assert.deepEqual(body.knownSizes, { small: 0, medium: 0, large: 1, unknown: 1 });
  });

  test('confirms medium independently of large — both can be true at once', async () => {
    await report({ cmdId: 'adv-m-1', srcVillageId: 'adv-m', size: 'medium', inRange: true, arrivalMs: T });
    await report({ cmdId: 'adv-m-2', srcVillageId: 'adv-m', size: 'large', inRange: true, arrivalMs: T + HOUR });
    await report({ cmdId: 'adv-m-3', srcVillageId: 'adv-m', size: 'unknown', inRange: false, arrivalMs: T + 2 * HOUR });

    const { body } = await get('/advisory?world=pt111&srcVillageId=adv-m&windowHours=12');
    assert.deepEqual(body.confirmedNearby, { medium: true, large: true });
  });

  test('returns confirmedNearby.large:false when the unknown falls outside the window', async () => {
    await report({ cmdId: 'adv-b-1', srcVillageId: 'adv-b', size: 'large', inRange: true, arrivalMs: T });
    await report({ cmdId: 'adv-b-2', srcVillageId: 'adv-b', size: 'unknown', inRange: false, arrivalMs: T + 30 * HOUR });

    const { body } = await get('/advisory?world=pt111&srcVillageId=adv-b&windowHours=12');
    assert.equal(body.confirmedNearby.large, false);
  });

  test('windowHours widens the match', async () => {
    const { body } = await get('/advisory?world=pt111&srcVillageId=adv-b&windowHours=48');
    assert.equal(body.confirmedNearby.large, true);
  });

  test('windowHours defaults to 12 when omitted', async () => {
    assert.equal((await get('/advisory?world=pt111&srcVillageId=adv-a')).body.confirmedNearby.large, true);
    assert.equal((await get('/advisory?world=pt111&srcVillageId=adv-b')).body.confirmedNearby.large, false);
  });

  test('a large that is out of range does not confirm', async () => {
    await report({ cmdId: 'adv-c-1', srcVillageId: 'adv-c', size: 'large', inRange: false, arrivalMs: T });
    await report({ cmdId: 'adv-c-2', srcVillageId: 'adv-c', size: 'unknown', inRange: false, arrivalMs: T });

    const { body } = await get('/advisory?world=pt111&srcVillageId=adv-c');
    assert.deepEqual(body.confirmedNearby, { medium: false, large: false });
    assert.deepEqual(body.knownSizes, { small: 0, medium: 0, large: 1, unknown: 1 });
  });

  test('counts sizes even when nothing is confirmed', async () => {
    await report({ cmdId: 'adv-d-1', srcVillageId: 'adv-d', size: 'medium', inRange: true, arrivalMs: T });
    const { body } = await get('/advisory?world=pt111&srcVillageId=adv-d');
    // medium confirmed but no unknown row from this village to apply it to
    assert.deepEqual(body.confirmedNearby, { medium: false, large: false });
    assert.deepEqual(body.knownSizes, { small: 0, medium: 1, large: 0, unknown: 0 });
  });

  test('is scoped per world', async () => {
    await report({ world: 'pt222', cmdId: 'adv-a-1', srcVillageId: 'adv-a', size: 'unknown', arrivalMs: T });
    const { body } = await get('/advisory?world=pt222&srcVillageId=adv-a');
    assert.deepEqual(body.confirmedNearby, { medium: false, large: false });
    assert.deepEqual(body.knownSizes, { small: 0, medium: 0, large: 0, unknown: 1 });
  });

  // This is a cross-player signal ("another player confirmed this") — an
  // account's own earlier classification of an attack from a village must
  // never echo back as confirmation for its own other unknown attacks from
  // that same village.
  test('does not confirm using the requesting account\'s own report', async () => {
    await report({
      cmdId: 'adv-self-1', srcVillageId: 'adv-self', size: 'large', inRange: true,
      arrivalMs: T, reporterId: 'account-a',
    });
    await report({
      cmdId: 'adv-self-2', srcVillageId: 'adv-self', size: 'unknown', inRange: false,
      arrivalMs: T + HOUR, reporterId: 'account-a',
    });

    const { body } = await get('/advisory?world=pt111&srcVillageId=adv-self&windowHours=12&reporterId=account-a');
    assert.deepEqual(body.confirmedNearby, { medium: false, large: false });
    // knownSizes still reflects raw totals regardless of who reported them
    assert.deepEqual(body.knownSizes, { small: 0, medium: 0, large: 1, unknown: 1 });
  });

  test('still confirms using a different account\'s report', async () => {
    await report({
      cmdId: 'adv-other-1', srcVillageId: 'adv-other', size: 'large', inRange: true,
      arrivalMs: T, reporterId: 'account-b',
    });
    await report({
      cmdId: 'adv-other-2', srcVillageId: 'adv-other', size: 'unknown', inRange: false,
      arrivalMs: T + HOUR, reporterId: 'account-a',
    });

    const { body } = await get('/advisory?world=pt111&srcVillageId=adv-other&windowHours=12&reporterId=account-a');
    assert.deepEqual(body.confirmedNearby, { medium: false, large: true });
  });

  test('a mix of own and another account\'s report still confirms (own report alone is excluded, not the whole village)', async () => {
    await report({
      cmdId: 'adv-mix-1', srcVillageId: 'adv-mix', size: 'large', inRange: true,
      arrivalMs: T, reporterId: 'account-a',
    });
    await report({
      cmdId: 'adv-mix-2', srcVillageId: 'adv-mix', size: 'large', inRange: true,
      arrivalMs: T + HOUR, reporterId: 'account-b',
    });
    await report({
      cmdId: 'adv-mix-3', srcVillageId: 'adv-mix', size: 'unknown', inRange: false,
      arrivalMs: T + 2 * HOUR, reporterId: 'account-a',
    });

    const { body } = await get('/advisory?world=pt111&srcVillageId=adv-mix&windowHours=12&reporterId=account-a');
    assert.deepEqual(body.confirmedNearby, { medium: false, large: true });
  });

  test('omitting reporterId keeps prior behavior — confirms using any report, including what would be "own"', async () => {
    await report({
      cmdId: 'adv-noid-1', srcVillageId: 'adv-noid', size: 'large', inRange: true,
      arrivalMs: T, reporterId: 'account-a',
    });
    await report({
      cmdId: 'adv-noid-2', srcVillageId: 'adv-noid', size: 'unknown', inRange: false,
      arrivalMs: T + HOUR, reporterId: 'account-a',
    });

    const { body } = await get('/advisory?world=pt111&srcVillageId=adv-noid&windowHours=12');
    assert.deepEqual(body.confirmedNearby, { medium: false, large: true });
  });

  // hasOtherReports tells the client whether a "waiting" signal is even
  // meaningful — if the only data for this village is the requesting
  // account's own, there is nothing else that could ever confirm it.
  describe('hasOtherReports', () => {
    test('is false when the only report is the requesting account\'s own', async () => {
      await report({
        cmdId: 'adv-honly-1', srcVillageId: 'adv-honly', size: 'unknown', inRange: false,
        arrivalMs: T, reporterId: 'account-a',
      });

      const { body } = await get('/advisory?world=pt111&srcVillageId=adv-honly&reporterId=account-a');
      assert.equal(body.hasOtherReports, false);
    });

    test('is true as soon as any other account has reported anything, even without a size match', async () => {
      await report({
        cmdId: 'adv-hother-1', srcVillageId: 'adv-hother', size: 'small', inRange: true,
        arrivalMs: T - 100 * HOUR, reporterId: 'account-b',
      });
      await report({
        cmdId: 'adv-hother-2', srcVillageId: 'adv-hother', size: 'unknown', inRange: false,
        arrivalMs: T, reporterId: 'account-a',
      });

      const { body } = await get('/advisory?world=pt111&srcVillageId=adv-hother&reporterId=account-a');
      assert.equal(body.hasOtherReports, true);
      // still no confirmedNearby — a "small" report is not medium/large evidence
      assert.deepEqual(body.confirmedNearby, { medium: false, large: false });
    });

    test('is true whenever confirmedNearby is true', async () => {
      const { body } = await get('/advisory?world=pt111&srcVillageId=adv-other&reporterId=account-a');
      assert.equal(body.hasOtherReports, true);
    });

    test('is false for a village with no reports at all', async () => {
      const { body } = await get('/advisory?world=pt111&srcVillageId=does-not-exist-either&reporterId=account-a');
      assert.equal(body.hasOtherReports, false);
    });

    test('without reporterId, reflects whether ANY report exists (backward compatible)', async () => {
      const { body } = await get('/advisory?world=pt111&srcVillageId=adv-honly');
      assert.equal(body.hasOtherReports, true); // the account-a row from the first test above still counts
    });
  });
});

// ── GET /stats ────────────────────────────────────────────────────────────────
describe('GET /stats', () => {
  test('counts commands, villages and active advisories for one world', async () => {
    const sdb = new Database(':memory:');
    const app = createApp(sdb, { validateLicense: fakeValidateLicense });
    const s = await new Promise((res) => { const srv = app.listen(0, () => res(srv)); });
    const base = `http://localhost:${s.address().port}`;
    const T = 1_700_000_000_000;

    const send = (body) => fetch(`${base}/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-XBot-License': TEST_KEY },
      body: JSON.stringify({ world: 'pt111', ...body }),
    });

    // Village v1: eligible (large in range + unknown 1h later)
    await send({ cmdId: 'c1', srcVillageId: 'v1', size: 'large', inRange: true, arrivalMs: T });
    await send({ cmdId: 'c2', srcVillageId: 'v1', size: 'unknown', arrivalMs: T + HOUR });
    // Village v2: not eligible (unknown far outside the window)
    await send({ cmdId: 'c3', srcVillageId: 'v2', size: 'large', inRange: true, arrivalMs: T });
    await send({ cmdId: 'c4', srcVillageId: 'v2', size: 'unknown', arrivalMs: T + 100 * HOUR });
    // Village v3: no confirmed large
    await send({ cmdId: 'c5', srcVillageId: 'v3', size: 'unknown', arrivalMs: T });
    // Other world — must not leak into the counts
    await fetch(`${base}/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-XBot-License': TEST_KEY },
      body: JSON.stringify({ world: 'pt222', cmdId: 'c9', srcVillageId: 'v9', size: 'large', inRange: true, arrivalMs: T }),
    });

    const body = await (await fetch(`${base}/stats?world=pt111`, { headers: { 'X-XBot-License': TEST_KEY } })).json();
    assert.deepEqual(body, { totalCommands: 5, totalSrcVillages: 3, advisoriesActive: 1 });
    s.close();
  });

  test('returns zeroes for an unseen world', async () => {
    const { body } = await get('/stats?world=pt999');
    assert.deepEqual(body, { totalCommands: 0, totalSrcVillages: 0, advisoriesActive: 0 });
  });
});

// ── POST /resolve ─────────────────────────────────────────────────────────────
describe('POST /resolve', () => {
  test('moves the row from attacks to attacks_history', async () => {
    await report({ cmdId: 'res-1', srcVillageId: 'res-v1', size: 'small' });
    assert.ok(row('pt111', 'res-1'));

    const { status, body } = await post('/resolve', { world: 'pt111', cmdId: 'res-1' });
    assert.equal(status, 200);
    assert.deepEqual(body, { ok: true, moved: true });

    assert.equal(row('pt111', 'res-1'), undefined);
    const h = historyRow('pt111', 'res-1');
    assert.equal(h.src_village_id, 'res-v1');
    assert.equal(h.size, 'small');
    assert.ok(h.resolved_ms > 0);
  });

  test('resolving an unknown cmdId is a harmless no-op, not an error', async () => {
    const { status, body } = await post('/resolve', { world: 'pt111', cmdId: 'never-reported' });
    assert.equal(status, 200);
    assert.deepEqual(body, { ok: true, moved: false });
  });

  test('rejects missing world / cmdId with 400', async () => {
    assert.equal((await post('/resolve', { cmdId: 'x' })).status, 400);
    assert.equal((await post('/resolve', { world: 'pt111' })).status, 400);
  });

  test('a resolved large no longer shows as confirmedNearby for later advisory checks', async () => {
    const T = 1_700_500_000_000;
    await report({ cmdId: 'res-2', srcVillageId: 'res-v2', size: 'large', inRange: true, arrivalMs: T });
    await report({ cmdId: 'res-3', srcVillageId: 'res-v2', size: 'unknown', arrivalMs: T + HOUR });

    let adv = (await get('/advisory?world=pt111&srcVillageId=res-v2')).body;
    assert.deepEqual(adv.confirmedNearby, { medium: false, large: true });

    await post('/resolve', { world: 'pt111', cmdId: 'res-2' }); // the large one lands and is archived

    adv = (await get('/advisory?world=pt111&srcVillageId=res-v2')).body;
    assert.deepEqual(adv.confirmedNearby, { medium: false, large: false });
    assert.deepEqual(adv.knownSizes, { small: 0, medium: 0, large: 0, unknown: 1 });
  });
});

// ── GET /health ───────────────────────────────────────────────────────────────
describe('GET /health', () => {
  test('responds ok with no license header at all', async () => {
    const r = await fetch(`${url}/health`); // deliberately no X-XBot-License
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { ok: true, db: 'xBot.db' });
  });
});

// ── License gate ─────────────────────────────────────────────────────────────
// Every data-bearing route requires a valid key; /health is the one exception
// (covered above). Each test here spins up its own app with a purpose-built
// validateLicense stub so the caching/fail-closed behavior can be observed
// in isolation from the shared suite's always-valid TEST_KEY.
describe('License gate', () => {
  async function withApp(validateLicense, fn) {
    const ldb = new Database(':memory:');
    const app = createApp(ldb, { validateLicense });
    const s = await new Promise((res) => { const srv = app.listen(0, () => res(srv)); });
    const base = `http://localhost:${s.address().port}`;
    try {
      await fn(base);
    } finally {
      s.close();
    }
  }

  test('rejects a request with no license header at all — 401', async () => {
    const r = await fetch(`${url}/stats?world=pt111`); // no X-XBot-License
    assert.equal(r.status, 401);
    assert.deepEqual(await r.json(), { ok: false, error: 'license key required' });
  });

  test('rejects an invalid key — 403, never touches the route logic', async () => {
    await withApp(() => Promise.resolve({ valid: false, expiresAt: null }), async (base) => {
      const r = await fetch(`${base}/stats?world=pt111`, { headers: { 'X-XBot-License': 'WRONG-KEY' } });
      assert.equal(r.status, 403);
      assert.deepEqual(await r.json(), { ok: false, error: 'invalid or expired license' });
    });
  });

  test('fails closed — 503, not a silent pass-through — when validation itself errors', async () => {
    await withApp(() => Promise.reject(new Error('network down')), async (base) => {
      const r = await fetch(`${base}/stats?world=pt111`, { headers: { 'X-XBot-License': 'ANY-KEY' } });
      assert.equal(r.status, 503);
      assert.deepEqual(await r.json(), { ok: false, error: 'license validation unreachable' });
    });
  });

  test('a valid key allows the request through', async () => {
    await withApp(() => Promise.resolve({ valid: true, expiresAt: null }), async (base) => {
      const r = await fetch(`${base}/stats?world=pt111`, { headers: { 'X-XBot-License': 'GOOD-KEY' } });
      assert.equal(r.status, 200);
    });
  });

  test('caches a valid verdict — the validator is not called again within the TTL', async () => {
    let calls = 0;
    await withApp(
      () => { calls++; return Promise.resolve({ valid: true, expiresAt: null }); },
      async (base) => {
        await fetch(`${base}/stats?world=pt111`, { headers: { 'X-XBot-License': 'CACHE-KEY' } });
        await fetch(`${base}/advisory?world=pt111&srcVillageId=x`, { headers: { 'X-XBot-License': 'CACHE-KEY' } });
        await fetch(`${base}/stats?world=pt111`, { headers: { 'X-XBot-License': 'CACHE-KEY' } });
        assert.equal(calls, 1); // three requests, same key — only the first actually validated
      },
    );
  });

  test('a stale/unreachable check does not fall back to a previously-cached valid verdict from a different key', async () => {
    // Two different keys never share a cache entry, so this also incidentally
    // proves the cache is keyed per-key, not global.
    let shouldFail = false;
    await withApp(
      (key) => {
        if (key === 'GOOD-KEY') return Promise.resolve({ valid: true, expiresAt: null });
        if (shouldFail) return Promise.reject(new Error('down'));
        return Promise.resolve({ valid: true, expiresAt: null });
      },
      async (base) => {
        const good = await fetch(`${base}/stats?world=pt111`, { headers: { 'X-XBot-License': 'GOOD-KEY' } });
        assert.equal(good.status, 200);

        shouldFail = true;
        const other = await fetch(`${base}/stats?world=pt111`, { headers: { 'X-XBot-License': 'OTHER-KEY' } });
        assert.equal(other.status, 503); // OTHER-KEY has no cache of its own — fails closed on its own merits
      },
    );
  });
});

// ── CORS ──────────────────────────────────────────────────────────────────────
describe('CORS', () => {
  test('reflects a tribalwars.com.pt origin', async () => {
    const r = await fetch(`${url}/health`, { headers: { Origin: ORIGIN } });
    assert.equal(r.headers.get('access-control-allow-origin'), ORIGIN);
  });

  test('omits CORS headers for a foreign origin', async () => {
    const r = await fetch(`${url}/health`, { headers: { Origin: 'https://evil.example.com' } });
    assert.equal(r.headers.get('access-control-allow-origin'), null);
  });

  test('preflight returns 204 with private-network header', async () => {
    const r = await fetch(`${url}/report`, { method: 'OPTIONS', headers: { Origin: ORIGIN } });
    assert.equal(r.status, 204);
    assert.equal(r.headers.get('access-control-allow-origin'), ORIGIN);
    assert.equal(r.headers.get('access-control-allow-private-network'), 'true');
    assert.ok(r.headers.get('access-control-allow-methods').includes('POST'));
    assert.ok(r.headers.get('access-control-allow-headers').includes('Content-Type'));
    assert.ok(r.headers.get('access-control-allow-headers').includes('X-XBot-License'));
  });
});

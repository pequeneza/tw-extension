import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { createApp } from './app.js';

const ADMIN_USER = 'admin';
const ADMIN_PASS = 'testpass';
const AUTH = 'Basic ' + Buffer.from(`${ADMIN_USER}:${ADMIN_PASS}`).toString('base64');
const WRONG_AUTH = 'Basic ' + Buffer.from('admin:wrongpass').toString('base64');

let server;
let url;

before(async () => {
  const db = new Database(':memory:');
  const app = createApp(db, ADMIN_USER, ADMIN_PASS);
  await new Promise((res) => { server = app.listen(0, res); });
  url = `http://localhost:${server.address().port}`;
});

after(() => server?.close());

// ── Helpers ────────────────────────────────────────────────────────────────────
async function post(path, body, headers = {}) {
  const r = await fetch(`${url}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  return { status: r.status, body: await r.json() };
}

async function get(path, headers = {}) {
  const r = await fetch(`${url}${path}`, { headers });
  const text = await r.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: r.status, body };
}

async function patch(path, body, headers = {}) {
  const r = await fetch(`${url}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  return { status: r.status, body: await r.json() };
}

async function del(path, headers = {}) {
  const r = await fetch(`${url}${path}`, { method: 'DELETE', headers });
  return { status: r.status, body: await r.json() };
}

async function createKey(name = '') {
  const { body } = await post('/admin/keys', { name }, { Authorization: AUTH });
  return body.key;
}

// ── /validate ─────────────────────────────────────────────────────────────────
describe('POST /validate', () => {
  test('returns valid:false for unknown key', async () => {
    const { status, body } = await post('/validate', { key: 'FAKE-FAKE-FAKE-FAKE' });
    assert.equal(status, 200);
    assert.equal(body.valid, false);
  });

  test('returns valid:false when body is missing key', async () => {
    const { body } = await post('/validate', {});
    assert.equal(body.valid, false);
  });

  test('returns valid:true for an active key', async () => {
    const key = await createKey('validate-test');
    const { body } = await post('/validate', { key });
    assert.equal(body.valid, true);
  });

  test('key matching is case-insensitive', async () => {
    const key = await createKey('case-test');
    const { body } = await post('/validate', { key: key.toLowerCase() });
    assert.equal(body.valid, true);
  });

  test('returns valid:false for a revoked key', async () => {
    const key = await createKey('revoke-test');
    await patch(`/admin/keys/${key}`, { active: false }, { Authorization: AUTH });
    const { body } = await post('/validate', { key });
    assert.equal(body.valid, false);
  });

  test('returns valid:true after re-activating a revoked key', async () => {
    const key = await createKey('reactivate-test');
    await patch(`/admin/keys/${key}`, { active: false }, { Authorization: AUTH });
    await patch(`/admin/keys/${key}`, { active: true }, { Authorization: AUTH });
    const { body } = await post('/validate', { key });
    assert.equal(body.valid, true);
  });

  test('sets Access-Control-Allow-Origin header', async () => {
    const r = await fetch(`${url}/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'FAKE-FAKE-FAKE-FAKE' }),
    });
    assert.equal(r.headers.get('access-control-allow-origin'), '*');
  });
});

// ── OPTIONS /validate ─────────────────────────────────────────────────────────
describe('OPTIONS /validate', () => {
  test('returns 204 with CORS preflight headers', async () => {
    const r = await fetch(`${url}/validate`, { method: 'OPTIONS' });
    assert.equal(r.status, 204);
    assert.equal(r.headers.get('access-control-allow-origin'), '*');
    assert.ok(r.headers.get('access-control-allow-methods').includes('POST'));
  });
});

// ── Admin auth ────────────────────────────────────────────────────────────────
describe('Admin auth', () => {
  test('GET /admin/keys requires auth', async () => {
    const { status } = await get('/admin/keys');
    assert.equal(status, 401);
  });

  test('GET /admin/keys rejects wrong password', async () => {
    const { status } = await get('/admin/keys', { Authorization: WRONG_AUTH });
    assert.equal(status, 403);
  });

  test('GET /admin/keys accepts correct credentials', async () => {
    const { status } = await get('/admin/keys', { Authorization: AUTH });
    assert.equal(status, 200);
  });
});

// ── Key management ────────────────────────────────────────────────────────────
describe('POST /admin/keys', () => {
  test('generates a key in XXXX-XXXX-XXXX-XXXX format', async () => {
    const { body } = await post('/admin/keys', { name: 'format-test' }, { Authorization: AUTH });
    assert.match(body.key, /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  });

  test('generated keys are unique', async () => {
    const keys = await Promise.all(Array.from({ length: 10 }, () => createKey()));
    assert.equal(new Set(keys).size, 10);
  });

  test('new key is active by default', async () => {
    const key = await createKey('default-active');
    const { body } = await post('/validate', { key });
    assert.equal(body.valid, true);
  });
});

describe('GET /admin/keys', () => {
  test('lists all keys', async () => {
    const key = await createKey('list-test');
    const { body } = await get('/admin/keys', { Authorization: AUTH });
    assert.ok(Array.isArray(body));
    assert.ok(body.some((k) => k.key === key));
  });
});

describe('DELETE /admin/keys/:key', () => {
  test('deleted key no longer validates', async () => {
    const key = await createKey('delete-test');
    await del(`/admin/keys/${key}`, { Authorization: AUTH });
    const { body } = await post('/validate', { key });
    assert.equal(body.valid, false);
  });

  test('deleted key no longer appears in list', async () => {
    const key = await createKey('delete-list-test');
    await del(`/admin/keys/${key}`, { Authorization: AUTH });
    const { body } = await get('/admin/keys', { Authorization: AUTH });
    assert.ok(!body.some((k) => k.key === key));
  });
});

// ── Expiry ────────────────────────────────────────────────────────────────────
describe('Key expiration', () => {
  test('key with future expires_at is valid', async () => {
    const future = new Date();
    future.setFullYear(future.getFullYear() + 1);
    const { body: created } = await post('/admin/keys', {
      name: 'future-expiry',
      expires_at: future.toISOString().slice(0, 10),
    }, { Authorization: AUTH });
    assert.ok(created.expires_at);
    const { body } = await post('/validate', { key: created.key });
    assert.equal(body.valid, true);
  });

  test('key with past expires_at is invalid', async () => {
    const { body: created } = await post('/admin/keys', {
      name: 'past-expiry',
      expires_at: '2020-01-01',
    }, { Authorization: AUTH });
    const { body } = await post('/validate', { key: created.key });
    assert.equal(body.valid, false);
  });

  test('duration shorthand 1m sets expires_at ~1 month ahead', async () => {
    const { body: created } = await post('/admin/keys', {
      name: 'duration-test',
      duration: '1m',
    }, { Authorization: AUTH });
    assert.ok(created.expires_at);
    const expiry = new Date(created.expires_at);
    const now = new Date();
    const diffDays = (expiry - now) / (1000 * 60 * 60 * 24);
    assert.ok(diffDays > 25 && diffDays < 35, `Expected ~30 days, got ${diffDays}`);
    const { body } = await post('/validate', { key: created.key });
    assert.equal(body.valid, true);
  });

  test('expiry can be updated via PATCH', async () => {
    const key = await createKey('patch-expiry');
    await patch(`/admin/keys/${key}`, { expires_at: '2020-01-01' }, { Authorization: AUTH });
    const { body } = await post('/validate', { key });
    assert.equal(body.valid, false);
  });

  test('key with no expiry is permanently valid', async () => {
    const key = await createKey('no-expiry');
    const { body } = await post('/validate', { key });
    assert.equal(body.valid, true);
  });
});

// ── Stats ─────────────────────────────────────────────────────────────────────
describe('GET /admin/stats', () => {
  test('returns active and revoked counts', async () => {
    const db = new Database(':memory:');
    const app = createApp(db, ADMIN_USER, ADMIN_PASS);
    const s = await new Promise((res) => { const srv = app.listen(0, () => res(srv)); });
    const base = `http://localhost:${s.address().port}`;
    const auth = { Authorization: AUTH };

    // Create 2 active, 1 revoked
    const k1 = (await (await fetch(`${base}/admin/keys`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...auth }, body: '{}' })).json()).key;
    const k2 = (await (await fetch(`${base}/admin/keys`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...auth }, body: '{}' })).json()).key;
    await fetch(`${base}/admin/keys`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...auth }, body: '{}' });
    await fetch(`${base}/admin/keys/${k1}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...auth }, body: JSON.stringify({ active: false }) });
    await fetch(`${base}/admin/keys/${k2}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...auth }, body: JSON.stringify({ active: false }) });

    const r = await (await fetch(`${base}/admin/stats`, { headers: auth })).json();
    assert.equal(r.active, 1);
    assert.equal(r.revoked, 2);
    s.close();
  });
});

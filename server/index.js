import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createApp } from './app.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT       = process.env.PORT       ?? 3741;
const ADMIN_USER = process.env.ADMIN_USER ?? 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS;

if (!ADMIN_PASS) {
  console.error('Error: set ADMIN_PASS environment variable before starting.');
  process.exit(1);
}

const db  = new Database(join(__dirname, 'licenses.db'));
const app = createApp(db, ADMIN_USER, ADMIN_PASS);

// 127.0.0.1 only — Caddy (same box, /etc/caddy/Caddyfile → reverse_proxy
// localhost:3741) is the only thing that needs to reach this. Binding to
// all interfaces here meant the app was directly reachable from the
// internet on port 3741, bypassing Caddy's TLS termination entirely —
// including sending Basic Auth credentials for /admin/* in cleartext to
// anyone who hit it that way.
app.listen(PORT, '127.0.0.1', () => console.log(`xBot license server → http://localhost:${PORT}`));

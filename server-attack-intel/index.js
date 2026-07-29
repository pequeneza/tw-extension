import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createApp } from './app.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT ?? 3742;

const db  = new Database(join(__dirname, 'xBot.db'));
const app = createApp(db);

app.listen(PORT, () => console.log(`xBot attack-intel server → http://localhost:${PORT}`));

# xBot Attack Intel Server

Local-only Express + SQLite server that records incoming-attack observations reported by
the `attack_intel` xBot module and answers "is this village's next attack likely a fake?"
advisories. Data lives in `xBot.db` in this directory.

```bash
npm install
npm start        # http://localhost:3742  (override with PORT)
npm test
```

The server must be running locally for the `attack_intel` module to record anything —
if it is down, the module simply has nothing to report to.

CORS is restricted to `https://*.tribalwars.com.pt` origins (no wildcard), and preflight
responses send `Access-Control-Allow-Private-Network` so Chrome allows the game page to
reach localhost.

This is intentionally separate from `server/`, the paid license-key server. They share no
database, port, or code.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/report` | Upsert one observed command, keyed on `(world, cmdId)` |
| `GET` | `/advisory?world=&srcVillageId=&windowHours=12` | Advisory for one source village |
| `GET` | `/stats?world=` | `{ totalCommands, totalSrcVillages, advisoriesActive }` |
| `GET` | `/health` | Liveness check |

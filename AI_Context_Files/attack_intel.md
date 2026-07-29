# attack_intel

**File:** `tw-suite-extension/modules/attack_intel.user.js`
**Version:** 1.0.0
**Module ID:** `attack_intel`
**Trigger page:** `screen=overview_villages&mode=incomings` (any `subtype`)
**Re-entry guard:** `window.__twAttackIntelRunning`
**Depends on:** a separate local server, `server-attack-intel/` (not part of the extension bundle — must be started manually). That server in turn requires a valid xBot license, checked against `license.vivaomadeira.com` — see "License gating" below; this is the one part of the whole feature that needs internet access.

## What it does

Cross-player attack-size intelligence. On the combined incomings overview, reads each row's watchtower-classified attack size (small/medium/large/unknown) and reports it to a **local** database server running on the player's own machine. If another player (running the same module, pointed at the same local server) confirms a **large or medium, in-range** attack from a given source village, any of *your* still-`unknown` attacks from that same village — landing within a configurable time window of the confirmed one — get a small **raw-evidence marker** in a dedicated column appended to the *end* of the table (not the front — see "Column placement" below, that's a deliberate compatibility choice, not arbitrary): a faded `attack_large.webp` if a large was confirmed nearby, a faded `attack_medium.webp` if a medium was confirmed nearby, both together if applicable. This is deliberately **not** a computed "likely small" guess — it shows the raw fact that was detected and leaves the player to decide what it means for this specific attack (including whether to hand-tag it via `mass_label_renamer`). Every other `unknown` row in that column gets a small neutral dot instead, so it's visible that the tool checked and is actively tracking it, even when there's nothing notable to show yet. The markers are informational only; nothing about them ever overwrites the real classification or auto-labels a row.

Tracking persists in `localStorage` across page reloads and browser sessions — a command already seen keeps being recognised as "still incoming" even after a fresh page load, not just within one tab's lifetime. Once a tracked command's own arrival time has passed and it no longer appears on the incomings page (i.e. it actually landed, not just scrolled off/paginated away), the module tells the server to move it out of the active table into a separate history table — see "Cross-session tracking" below.

This is entirely local-machine, single-player-scoped for now — there is no cross-computer sync. Running two TribalWars logins on the *same* PC against the same running server is how multiple "players" currently share data (useful for testing before any real network sync exists). See "Local server" below.

## Why this exists / design constraints

- **No leak to the game.** All traffic is a direct browser→`localhost` `fetch()`. It never touches any `tribalwars.com.pt` server, so the game's backend has no visibility into it at all — that's inherent to targeting `localhost`, not something the code has to actively hide. This does **not** mean the request is invisible to the player's own browser (DevTools Network tab) or to any other script sharing the page — no code claims that.
- **Raw evidence only, never a computed guess or a hard override.** The stored `size` for a command is never changed by inference. Earlier versions rendered a single derived "likely small" icon; that was replaced deliberately — showing an inferred size risked being read as a classification the tool doesn't actually have. What's shown now is strictly which sizes were *actually confirmed nearby in time* from that village (a faded `attack_large.webp`/`attack_medium.webp` icon, both together if both apply) — raw facts, with the sizing judgment left entirely to the player. The column holding these markers (`.xbot-adv-col`) is added to *every* row, not just ones with something to show, so column alignment never breaks.
- **Silent when the server is offline.** The module must not disrupt the game page if the local server isn't running — `/report` calls are fire-and-forget with `.catch(() => {})`, no thrown errors, no console noise beyond `console.debug`. The React panel is the only place "server offline" is surfaced to the player.
- **Reporter identity is not the TribalWars account.** A random UUID (`localStorage attack_intel_reporter_id`) is generated once per browser install and sent with every report — not derived from `game_data.player`.

## Row parsing (`#incomings_table`)

Verified live against the game (not guessed from other docs). Table id `incomings_table`, data rows are plain `<tr>` (`row_a`/`row_b` alternating), 8 `<td>` per row, header row skipped:

| Column | Field | How it's read |
|---|---|---|
| `td[0]` | size, cmdId | First `<img>` filename → size (`attack_small.webp`→`small`, `attack_medium.webp`→`medium`, `attack_large.webp`→`large`, `attack.webp`→`unknown`). Non-`attack*` icons (e.g. a support row) are skipped entirely. `[data-command-id]` → `cmdId`. `.quickedit-label` text (minus any trailing `[BITO tag]`) is checked against `IGNORED_LABELS` (currently `["Btd"]`) — a match skips the row entirely, before it's reported or counted toward any advisory. |
| `td[1]` | destVillageId | `a[href*="village="]` query param `village`, falls back to `game_data.village.id` if the cell has no link. |
| `td[2]` | srcVillageId, srcX, srcY | `a[href*="info_village"]` query param `id` → `srcVillageId`. Text regex `\((\d+)\|(\d+)\)` → coords. |
| `td[3]` | player | Plain text (blank/irrelevant for barbarian sources). |
| `td[5]` | arrivalMs | Same "amanhã/DD.MM./HH:MM:SS" parsing logic as `desviador.user.js` (`fakes.md`-adjacent pattern), reusing its day/year-rollover handling. Uses `game_data.time` as the "now" reference (a page-load snapshot, not a continuously corrected server offset) — adequate for same-day/next-day disambiguation, not millisecond-precise. |
| `td[7]` | inRange | `"Dentro do Alcance"` → `true` (classification is final). A countdown string instead → `false` (still resolving; a currently-`unknown` size may firm up later). |

`td[4]` (distance) and `td[6]` (live countdown) are not used.

## Sync gating — nothing happens without consent

Data only moves (in either direction) during a **sync pass** — `scanAndReport()` + `advisoryTick()` run back to back as one unit, `runSync()`. A sync pass happens only when:

1. **The user explicitly requests one** — clicking "🔄 Sync now" in the panel (any time, in either mode) dispatches `xbot:attackintel:syncNow`, which the userscript listens for unconditionally.
2. **`syncMode` is `"automatic"`** — a timer also fires `runSync()` every `autoSyncMinutes` minutes. This can never run faster than `MIN_AUTO_SYNC_MINUTES` (5) — enforced in the userscript itself (`Math.max(MIN_AUTO_SYNC_MINUTES, ...)`), not just clamped in the settings UI, so a hand-edited or buggy setting can't bypass the floor.

`syncMode` defaults to `"manual"` — out of the box, nothing is ever sent or fetched automatically. There is no longer a `MutationObserver`-driven "report as soon as a row appears" behavior; a sync pass re-scans whatever's currently in the table at the moment it runs (still deduped via the in-memory `reported` Set, so re-scanning doesn't re-send already-reported commands).

```
whenTableReady()                    — polls for #incomings_table up to 10s
  └─ start()
       ├─ scheduleAuto()                    — sets up (or clears) the automatic timer
       ├─ setInterval(scheduleAuto, 30s)     — cheap, localStorage-only; reschedules if
       │                                       syncMode/autoSyncMinutes changed, otherwise
       │                                       leaves the existing timer's phase untouched
       └─ if syncMode === "automatic": runSync() once immediately (don't wait a full interval)

xbot:attackintel:syncNow  (React → Userscript) → runSync()   [always available, any mode]

runSync()
  └─ ensureAllGroupSelected(cb)   — clicks the "Todos" village group filter if some other
       │                            group is active, waits for it to take, then:
       ├─ scanAndReport(settings)  — per unreported row: POST {serverUrl}/report, fire-and-forget
       │                              (also refreshes the persisted tracked-commands map — see below)
       ├─ checkResolved(settings)  — tracked commands no longer on the page + past their own
       │                              arrivalMs: POST {serverUrl}/resolve, fire-and-forget
       └─ advisoryTick(settings)   — per distinct srcVillageId with unknown-size rows:
                                      addWaitingMarker() immediately, then
                                      GET {serverUrl}/advisory?...  → addSizeMarkers() for whichever
                                                                       of confirmedNearby.{large,medium}
                                                                       came back true
```

## Village group coverage

The incomings overview can be filtered to a specific village group (`Ataque`, `Defesa`, custom groups, …) — if anything other than "Todos" (`data-group-id="0"`, `data-group-type="all"`) is active, the table only shows that group's villages, and a sync would silently miss the rest. `ensureAllGroupSelected()` mirrors `ensureGroupSelected()` from `microapoios_enhanced.user.js` exactly: TribalWars renders the currently-active group as `<strong class="group-menu-item" data-group-id>` and every other one as a clickable `<a class="group-menu-item" data-group-id>`. If "Todos" isn't already the `<strong>`, its `<a>` is clicked and polled (150ms interval, 4s max) until it becomes the active `<strong>`, before the rest of the sync proceeds. If the group switcher isn't present on the page at all, it proceeds as-is rather than blocking.

No true multi-page pagination was found on this table as of writing (checked live — 185 rows rendered on a single page, no `.paging`/`.pagination` elements, the only `page=` links present are the column-sort headers). If this table does paginate at higher row counts, that's not yet handled — would need a live example to build against.

`healthCheck()` (`GET /health`) is the one exception — it runs once on every page load regardless of `syncMode`, purely so the panel shows correct online/offline status immediately. It carries no attack data, just a liveness probe.

## Cross-session tracking + resolve-on-arrival

`localStorage attack_intel_tracked_v1` — `{ [cmdId]: { world, srcVillageId, arrivalMs } }`. Unlike the in-memory `reported` Set (which only dedupes `/report` calls within one page load), this persists across reloads and sessions, so a command already known from a previous visit is still correctly treated as "still incoming" this session.

Every `scanAndReport()` pass refreshes the tracked entry for every currently-visible row (not just newly-reported ones). `checkResolved()` then looks for tracked entries that are **not** in the current scan:

- If the entry's own `arrivalMs` has already passed → treated as a real landing. `POST /resolve {world, cmdId}` is sent (fire-and-forget), and the entry is dropped from local tracking regardless of whether that request succeeds — a server outage can't grow this list forever.
- If `arrivalMs` is still in the future → left alone. Missing-but-not-yet-arrived almost always just means the row is on a different page of a paginated incomings list, not that it landed — treating absence alone as "arrived" would have produced false resolves every time the player changed pages.
- A safety-net prune also drops any entry more than 48h past its own `arrivalMs` regardless of server response, so a persistently unreachable server can't leave the tracked map growing without bound.

## Column placement — appended, never inserted at the front

`ensureAdvisoryColumn()` appends the `.xbot-adv-col` `<th>`/`<td>` as the *last* child of the header and every row — deliberately, after a real regression: an earlier version inserted it at index 0, which shifted every existing column's position by one. That broke `desviador.user.js`, which reads incoming-command rows by fixed positional index (e.g. `directTds[5]` for the arrival cell) via `span.quickedit[data-id]` — it scans rows generically, with no awareness that attack_intel added anything, so a shifted index silently pointed at the wrong cell. Any other module that ever reads `#incomings_table` rows positionally would have the same failure mode. Appending avoids this entirely: every original index (0–7) stays exactly where every other script already expects it, regardless of whether the advisory column exists.

## Advisory column states

Reflected in the `.xbot-adv-col` cell, so "checked, nothing notable" is visually distinguishable from "never checked" and from "here's what was actually confirmed":

| State | Rendering |
|---|---|
| Not `unknown`-size, or not yet synced | Blank cell |
| `unknown`-size, checked, nothing confirmed nearby | Small grey dot (`.xbot-attackintel-waiting`) |
| `unknown`-size, `confirmedNearby.large` true | Faded/grayscale `attack_large.webp` (`.xbot-attackintel-marker-large`) |
| `unknown`-size, `confirmedNearby.medium` true | Faded/grayscale `attack_medium.webp` (`.xbot-attackintel-marker-medium`) |
| Both `large` and `medium` confirmed nearby | Both icons shown together, replacing the grey dot |

Each icon reuses the row's *own* current icon URL (always `attack.webp`, since this only ever fires for unknown-size rows), swapping just the filename — same technique `makeSizeIcon()` uses as the very first version of this feature (`fakes.md`-era `attack_small.webp` icon), so it automatically matches whatever CDN asset path this world/server happens to be using rather than a hardcoded URL.

`addSizeMarkers()` never renders a size the server didn't actually report as confirmed — there is no "small" marker, since a `small` observation was never part of the inference (only `medium`/`large`, `in_range=1` rows count as "confirmed").

## License gating

`server-attack-intel` requires a valid xBot license on every data-bearing request — reuses the exact same validation the extension itself already performs (`POST https://license.vivaomadeira.com/validate {key}` → `{valid, expires_at}`, the same call `background/service-worker.ts`'s `VALIDATE_LICENSE` handler makes), rather than inventing a second auth mechanism. `/health` is the one route left open, since the panel needs *some* way to show "server reachable" before a key is even configured.

**Getting the key into the main-world script.** The key lives in `chrome.storage.sync`, which `attack_intel.user.js` (main world, no `chrome.*` access) can't read directly:
- **Real extension**: `router.ts` already validates the key before injecting any module (see the license check a few lines above the module-injection loop) — right after that check passes, it now also writes the key to `sessionStorage['__xbot_license_key__']`, mirroring the existing `__xbot_cfg__` config bridge. `currentLicenseKey()` in the userscript reads this first.
- **Bare Tampermonkey (no `router.ts`, no bridge)**: falls back to `settings.licenseKey` — a manually-entered value in `AttackIntelView.tsx`'s Settings tab (or hand-set in `attack_intel_settings_v1` directly). Same server-side enforcement either way; this is only about *where the client gets the key from*, not a weaker check.

**Server-side verdict caching** (`server-attack-intel/app.js`, in-memory `Map`, resets on restart): a cache hit within `LICENSE_CACHE_TTL_MS` (24h, mirroring `router.ts`'s own `CACHE_TTL_MS`) is trusted without a fresh network call. A `defaultValidateLicense()` call has a 5s timeout (`AbortController`).

**Fail-closed, deliberately, and not the same as `router.ts`'s own behavior**: if there's no usable cache and the live validate call itself fails (network error, timeout, non-200), the request is **rejected** (`503`) — it never falls back to an old cached verdict or defaults to allowing the request through. This is stricter than `router.ts`'s client-side cache, which *does* fall back to a stale cached verdict when its own live check fails (`catch { return cached ?? invalid }`). That looser behavior was deliberately not reused here — a license outage disabling the local server entirely is treated as an acceptable trade-off for never letting the gate be silently bypassed.

**Response codes** (all `{ok: false, error}` except 200): `401` no key sent at all · `403` key present but invalid/expired · `503` couldn't confirm right now (validator unreachable or timed out) · `200` valid, request proceeds normally.

**Client-side status surfacing**: `attack_intel.user.js` tracks the *last* response's outcome as `licenseStatus` (`null` | `"ok"` | `"missing"` | `"invalid"` | `"unreachable"`), separately from `serverOnline`. Getting a `401`/`403`/`503` back still means the server was reached — `serverOnline` stays `true`; only an actual network failure (`fetch` rejecting) sets it `false`. `AttackIntelView.tsx`'s Main tab shows a distinct message per `licenseStatus` value so "server's fine but your key is rejected" never looks like "server offline."

**CORS**: the custom `X-XBot-License` header has to be explicitly advertised in `Access-Control-Allow-Headers` (alongside `Content-Type`) or a real cross-origin preflight would reject it before the request ever reaches `requireLicense`.

**Tests use dependency injection, not the real network**: `createApp(db, { validateLicense })` accepts an optional validator function, defaulting to the real HTTP-calling one in production. `test.js` passes a stub everywhere so the suite never depends on internet access or a real license key — see the dedicated "License gate" `describe` block for the 401/403/503/caching/per-key-isolation tests.

## CustomEvent bridge

| Direction | Event | Payload |
|---|---|---|
| Userscript → React | `xbot:attackintel:state` | `{ serverOnline: boolean, trackedThisSession: number, lastSyncMs: number \| null, licenseStatus: null \| "ok" \| "missing" \| "invalid" \| "unreachable" }` |
| React → Userscript | `xbot:attackintel:getState` | — (probe; listener registered unconditionally at script top-level, works even off the incomings page) |
| React → Userscript | `xbot:attackintel:syncNow` | — requests one sync pass immediately, regardless of `syncMode` |

## Settings (localStorage `attack_intel_settings_v1`)

Read/written independently by both the userscript and `AttackIntelView.tsx` — no round-trip.

| Field | Default | Description |
|---|---|---|
| `enabled` | `true` | Master on/off. When `false`, no syncing happens in either mode, and the automatic timer is torn down. |
| `serverUrl` | `"http://localhost:3742"` | Base URL of the local attack-intel server. |
| `windowHours` | `12` | ± hours around a confirmed medium/large arrival to flag other unresolved same-village attacks with a raw-evidence marker. |
| `syncMode` | `"manual"` | `"manual"` — only `xbot:attackintel:syncNow` triggers a sync. `"automatic"` — also syncs on a timer. |
| `autoSyncMinutes` | `5` | Automatic-mode interval. Floored at 5 minutes in the userscript itself, independent of what's stored. |
| `keepTracking` | `false` | No network on load: shows the advisory column immediately, pre-populated from the local advisory cache (`attack_intel_advisory_cache_v1`) for any `unknown` row whose source village has a recent cached result — see "Local advisory cache" below. A real sync still always supersedes whatever was rendered from cache. |
| `licenseKey` | `""` | Only consulted when there's no `sessionStorage` bridge to read from (bare Tampermonkey, no real extension). Under the real extension this is ignored — `router.ts`'s already-validated key always wins. See "License gating". |

## Other localStorage keys

| Key | Content |
|---|---|
| `attack_intel_reporter_id` | Random UUID, generated once, persisted forever. Not tied to the TW account. |
| `attack_intel_tracked_v1` | `{ [cmdId]: { world, srcVillageId, arrivalMs } }` — persisted across sessions; drives resolve-on-arrival detection. |
| `attack_intel_advisory_cache_v1` | `{ [srcVillageId]: { confirmedNearby: {medium, large}, checkedMs } }` — see "Local advisory cache" below. |

## Local advisory cache

`localStorage`, not IndexedDB — deliberately. This is at most one small JSON entry per distinct source village ever seen (a few hundred bytes each, even for an account with hundreds of attacking villages), nowhere near localStorage's ~5-10MB per-origin ceiling. Every other module in this codebase already reads/writes small JSON maps here synchronously with zero setup; IndexedDB's async API and versioned-schema overhead would buy nothing at this scale, just more code for the same result.

`advisoryTick()` writes to it after every successful `/advisory` response — `{confirmedNearby: {medium, large}, checkedMs: Date.now()}` keyed by `srcVillageId` (not `cmdId`: advisory results apply per-village, not per-command). `saveAdvisoryCache()` prunes any entry older than `ADVISORY_CACHE_STALE_MS` (24h) on every write, so the cache can't grow unbounded without a separate cleanup pass.

`renderCachedAdvisories(table)` — called from `start()` when `keepTracking` is on, *before* `scheduleAuto()`/any sync — reads this cache synchronously and, for every currently-`unknown` row whose village has a non-stale cached entry, renders the waiting dot or the red/orange marker(s) immediately from that cached verdict. No network involved. Whatever a subsequent real sync finds always supersedes it (`addSizeMarkers()`/`addWaitingMarker()` are idempotent per cell either way).

## Tampermonkey compatibility note

Some Tampermonkey builds (notably its MV3 Chrome build) execute `@grant none` scripts in a JS global that's isolated from the actual page — the DOM (`document`, `fetch`, `localStorage`) stays shared, but a plain `window.X = ...` assignment silently isn't visible from the page/console. Confirmed in testing: this also broke Tampermonkey's own script injection outright on TribalWars specifically, because Tampermonkey's default injection mode uses an `eval`-based mechanism that the game page's own CSP (`script-src` without `unsafe-eval`) blocks — surfaced as a CSP violation in DevTools' **Issues** tab, not the Console, with nothing from the script ever running.

Fix applied: `@grant unsafeWindow` plus a `pageWindow = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window` fallback, used for every debug-visible global (`TM_ATTACK_INTEL_STATE`, `__twAttackIntelRunning`) and `game_data` read. Under the real xBot extension (true main-world injection) this is a no-op since `unsafeWindow === window` there. Under bare Tampermonkey, if a script still doesn't run at all (not even a silent global-visibility issue — genuinely nothing executes), the underlying cause is almost always the CSP/eval issue, and the fix is **Tampermonkey Dashboard → the script → its own Settings tab → Sandbox Mode → "Page"** — that mode injects as a plain inline `<script>` tag instead of `eval`-ing the source, which sidesteps the CSP restriction entirely.

---

## Local server — `server-attack-intel/`

Sibling to `server/` (the production license server) — deliberately separate, not touched by this feature. Same stack: Express + `better-sqlite3`.

```bash
cd server-attack-intel
npm install
npm start          # PORT env var overrides the default 3742
```

The module records nothing while this isn't running — it's manual, per-machine infrastructure, not bundled into the extension.

### Database

File: **`xBot.db`** (exact capitalization), created in `server-attack-intel/` on first run. Excluded from git via `.gitignore` (along with `-wal`/`-shm`/`-journal` sidecars).

```sql
CREATE TABLE attacks (
  world, cmd_id, src_village_id, src_x, src_y, dest_village_id,
  player, size, in_range, arrival_ms, reporter_id,
  first_seen_ms, last_seen_ms,
  PRIMARY KEY (world, cmd_id)
);
CREATE INDEX idx_src_village ON attacks(world, src_village_id);

-- Rows moved here by POST /resolve once the client confirms a command has
-- landed. Keeps /advisory and /stats scoped to attacks that are still
-- relevant instead of accumulating every attack ever reported forever.
CREATE TABLE attacks_history (
  world, cmd_id, src_village_id, src_x, src_y, dest_village_id,
  player, size, in_range, arrival_ms, reporter_id,
  first_seen_ms, last_seen_ms, resolved_ms,
  PRIMARY KEY (world, cmd_id)
);
```

Upsert rule (one SQL statement, `ON CONFLICT DO UPDATE`): a report only overwrites the stored `size`/`in_range` when the new value is *more resolved* than what's stored — `unknown → known` upgrades, `known → unknown` never downgrades, and `known → known` (e.g. an existing `small` later reported as `large`) does **not** overwrite, since both already count as resolved. `last_seen_ms` refreshes on every report regardless; `first_seen_ms` is set once.

`moveToHistory(world, cmdId, resolvedMs)` — a `db.transaction()` wrapping a select + insert + delete, so a crash mid-move can't duplicate a row into history or drop it from both tables. Returns `false` (no-op) if the row isn't found in `attacks`, so re-resolving something already moved (or never reported) is harmless.

### Endpoints

All except `/health` require header `X-XBot-License: <key>` — see "License gating" above.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `POST` | `/report` | required | Upsert one observed command. Body: `{world, cmdId, srcVillageId, srcX, srcY, destVillageId, player, size, inRange, arrivalMs, reporterId}`. `400` if `world`/`cmdId`/`srcVillageId` missing or `size` isn't one of `small\|medium\|large\|unknown`. |
| `GET` | `/advisory?world=&srcVillageId=&windowHours=` | required | `{srcVillageId, knownSizes:{small,medium,large,unknown}, confirmedNearby:{medium,large}}`. Computed **only from the active `attacks` table** — resolved/history rows never contribute. `confirmedNearby.large`/`.medium` are independent booleans, each true only when at least one `in_range=1` row of that size exists AND at least one `unknown` row's `arrival_ms` falls within `windowHours` of it — both can be true at once (e.g. a village that sent one medium and one large near the same time). This is raw evidence, not a derived verdict — there's no single "likely X" field; the client renders whichever of the two came back true and leaves interpretation to the player. `windowHours` defaults to 12. |
| `GET` | `/stats?world=&windowHours=` | required | `{totalCommands, totalSrcVillages, advisoriesActive}` — active table only, same reasoning as `/advisory`. `advisoriesActive` computed by a single grouped self-join, not per-village looping. |
| `POST` | `/resolve` | required | Body: `{world, cmdId}`. Moves the row from `attacks` to `attacks_history` (see `moveToHistory` above). `{ok:true, moved:true\|false}` — `moved:false` if it wasn't found in the active table, which is a normal outcome, not an error. `400` if `world`/`cmdId` missing. |
| `GET` | `/health` | **none** | `{ok:true, db:"xBot.db"}` — deliberately open so the panel can show "server reachable" even before a key is configured. |

### CORS / browser access

Requests originate from a content script running on `https://*.tribalwars.com.pt` pages, calling `localhost` — this needs explicit handling, not just a permissive default:

- `Access-Control-Allow-Origin` is **reflected only** when the request's `Origin` matches `/^https:\/\/[a-z0-9-]+\.tribalwars\.com\.pt$/` — never a wildcard, since the server binds to all interfaces on localhost.
- `Access-Control-Allow-Private-Network: true` is set on the `OPTIONS` preflight — required for Chrome's Private Network Access policy to let a public HTTPS page reach `localhost` at all. The browser will show a one-time permission prompt the first time; this header is what makes that prompt resolve successfully instead of the request silently failing.
- `Access-Control-Allow-Headers` includes `X-XBot-License` alongside `Content-Type` — without this, a real cross-origin preflight would reject the custom header before any request carrying it ever reached the server.

### Testing

`server-attack-intel/test.js` (`node:test`, in-memory db, 32 tests) covers the upsert resolution rules, advisory window logic per size (including that `medium` and `large` are confirmed independently and can both be true, out-of-window and out-of-range cases), per-world scoping, `/resolve`'s move-to-history behavior (including that a resolved `large` stops showing as confirmed-nearby), the license gate (missing/invalid/unreachable/valid, TTL caching, per-key cache isolation — all via a stubbed `validateLicense`, never the real network), and the CORS behaviors (reflects TW origin / omits for a foreign origin / preflight sends the PNA header + advertises `X-XBot-License`). Run with `npm test`.

## Known limitations (v1)

- **No cross-computer sync.** Each machine's `xBot.db` is fully independent. Multiple TribalWars accounts logged in on the *same* machine, pointed at the same running server, is the only way data currently merges.
- **`arrivalMs` precision** depends on `game_data.time` at page load, not a live server-time offset — fine for the ±hour-scale advisory window this feature uses, not suitable for anything needing sub-second precision.
- **The time window is a heuristic**, not a verified TribalWars population-cap mechanic — `windowHours` is user-tunable specifically because "how long after a large/medium wave can a village *not* also send another one" is an assumption, not confirmed game logic. This is exactly why the feature stops at showing raw confirmed-nearby facts rather than computing a specific size guess — the underlying game mechanic isn't confirmed, so the tool doesn't pretend to know more than it does.
- **The license gate introduces a real internet dependency** into a feature that was otherwise fully local. Fail-closed was a deliberate choice (see "License gating"): if `license.vivaomadeira.com` is down, or the machine has no internet, or DNS fails, every request gets rejected with `503` — even for a player with a genuinely valid key — until the cache from a prior successful check (up to 24h old) expires or the validator becomes reachable again.

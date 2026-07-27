# attack_generator

**File:** `tw-suite-extension/modules/attack_generator.user.js`
**Version:** 1.0
**Module ID:** `attack_generator`
**Trigger page:** `screen=place` (not confirm)
**Re-entry guard:** None needed — the engine is gated behind manual start (see below), so
re-injection on repeated navigation never causes duplicate runs.
**Start behavior:** **Manual only.** Unlike `fakes.user.js` (which auto-runs on injection),
this script *never* calls its engine on load — not on first injection, not on page
reload/revisit, even if a previous run was left active. It only runs after an explicit
`xbot:attackgen:start` event from the panel's Start button. This is intentional: Attack
Generator can send arbitrary real troop commands (not just fakes), so it must not fire
without the user directly triggering it each time.

## What it does

General-purpose attack command generator. Shares its village/rally-point/target-plan
infrastructure with `fakes.user.js` ([`fakes.md`](./fakes.md)), but generalizes two things
Fakes hardcodes:

1. **Troop composition** — pluggable, not just the 2%-population fake calculation.
2. **Execution** — either sends immediately in sequence (like Fakes), or **queues** the
   generated commands into the existing Autosender (`xbot_autosender_queue`, see
   [`auto_sender.md`](./auto_sender.md)) for precision-timed landings, instead of
   reimplementing timing logic.

It also adds automatic target discovery (player/tribe/continent/points/bounding-box filters
over the world's `map/village.txt` / `map/player.txt` / `map/ally.txt`), feeding the same
`coords` field the manual textarea uses.

## Manual-start bridge (CustomEvents)

| Direction | Event | Payload |
|---|---|---|
| React → userscript | `xbot:attackgen:start` | — (ignored if already active or not on `screen=place`) |
| React → userscript | `xbot:attackgen:stop` | — sets the existing `attackgen_paused` flag; the running loop exits within one iteration |
| Userscript (one-shot) | `xbot:attackgen:generateCoords` | See "Automatic target discovery" below — this listener is always registered and does **not** require Start (it's a read-only lookup, not an attack action) |

`sessionStorage["attackgen_active"]` mirrors whether the engine is currently running
(`"1"`/`"0"`), reset to `"0"` unconditionally on every script load. `AttackGeneratorView`'s
Status tab polls this alongside the other runtime keys and shows **Start** when idle,
**Stop** while active.

## Troop builders (`buildTroops`, dispatched on `CONFIG.attackType`)

| `attackType` | Behavior |
|---|---|
| `fake` | Identical to `fakes.user.js`'s `calculateFakeTroopsFrom` — 2%-of-points population rule, scouts + 1 siege unit + infantry/cavalry fill, capped by Settings. |
| `custom` | Fixed unit counts from `CONFIG.customUnits` (`{unit: count}`). If rally-point availability is short on any requested unit, the target is skipped entirely (no partial sends). |
| `send_all` | Sends all available combat units (spear…catapult), minus `garrisonReservePct`% left behind per unit. |
| `ram_then_catapult` / `catapult_then_ram` | Fills the primary siege unit up to its cap/availability, then the secondary, plus scouts up to `maxScouts`. Caps: `maxRams`, `maxCatapults`. |

## Execution modes (`CONFIG.executionMode`)

### `sequential` — `runFetchLoop()`
Exact fetch-based flow as `fakes.user.js`: `fetchAllVillages()` → for each village,
`fetchRallyPointData()` → `buildTroops()` → `sendAttackViaFetch()` (POST attack, check
arrival window, POST confirm). No browser navigation.

### `timed` — `runTimedQueueBuild()`
For each eligible village/target pair: `fetchRallyPointData()` for availability only (no
POST), `buildTroops()`, then `computeTravelMs()` (distance × slowest unit's minutes/field ÷
world+unit speed, mirroring `src/content/overlay/queue-utils.ts`'s `fetchWorldSpeed()`) to
derive `launch`/`arrival` timestamps:
- `timedArrivalMode: "asap"` — launch = now + 5s, arrival = launch + travel time.
- `timedArrivalMode: "target_time"` — arrival = next occurrence of `timedTargetArrival`
  (HH:MM), launch = arrival − travel time; skipped if that's in the past.

The resulting entry is pushed into `localStorage["xbot_autosender_queue"]` (same shape
documented in `auto_sender.md`) and `xbot:autosender:run` `{action:"getState"}` is
dispatched so the already-running Autosender engine picks it up immediately. **This module
never touches `auto_sender.user.js`'s confirm-page timing logic** — it only ever produces
queue entries.

## Automatic target discovery (`CONFIG.targetMode === "auto"`)

`fetchWorldData()` fetches `/map/village.txt`, `/map/player.txt`, `/map/ally.txt`, caching
the parsed result in `localStorage["attackgen_world_data_v1"]` for 6 hours.
`generateAutoCoords(opts)` filters villages by player name, tribe tag/name, continent
(`K##`), min/max points, and a min/max X/Y bounding box, returning `{coords, count}`. At
least one filter must be set or it returns `{coords: [], count: 0, error: "No filters set"}`.

Triggered from the React panel via a one-shot `xbot:attackgen:generateCoords` CustomEvent
(not a polling value — the userscript registers a `document.addEventListener` for it
unconditionally on load). The result is written to
`sessionStorage["attackgen_generated_coords"]` for the panel to read on its next poll and
copy into the `coords` field.

*Not implemented* (FakeGenerator.js extras, out of scope for v1): radius-from-center, the
20:1 no-attack rule, "selective random" weighting.

## Target plan / caps (shared logic with Fakes)

Same persistent per-coord plan (`attackgen_target_plan_v1`), per-run village/target
counters, coords-fingerprint auto-reset, and arrival-window check as `fakes.user.js` — see
`fakes.md` for the algorithm description. Field names are renamed generically
(`attacksPerVillage` instead of `fakesPerVillage`).

## Config (localStorage `attackgen_config_v1`, overridden by `chrome.storage.sync` via
`window.__twSuiteCfg('attack_generator')` / live mirror `sessionStorage
xbot_live_cfg_attack_generator`)

| Field | Default | Description |
|---|---|---|
| `attackType` | `"fake"` | `fake` \| `custom` \| `send_all` \| `ram_then_catapult` \| `catapult_then_ram` |
| `customUnits` | `{}` | `{unit: count}` map, used when `attackType === "custom"` |
| `garrisonReservePct` | 0 | % of each unit left behind, used when `attackType === "send_all"` |
| `targetMode` | `"manual"` | `manual` \| `auto` |
| `autoPlayers` / `autoTribes` / `autoContinents` | `""` | Auto-filter inputs |
| `autoMinPoints` / `autoMaxPoints` | 0 / 999999 | Auto-filter point range |
| `autoMinX` / `autoMaxX` / `autoMinY` / `autoMaxY` | 0/999/0/999 | Auto-filter bounding box |
| `executionMode` | `"sequential"` | `sequential` \| `timed` |
| `timedArrivalMode` | `"asap"` | `asap` \| `target_time` |
| `timedTargetArrival` | `""` | HH:MM, used when `timedArrivalMode === "target_time"` |
| `coords` | `""` | Space-separated `XXX\|YYY` targets (manual entry or auto-generated) |
| `attackDelay`/`attackRandom`/`confirmDelay`/`confirmRandom`/`switchDelay`/`switchRandom` | see schema | Sequential-mode timing, same semantics as Fakes |
| `attacksPerVillage` / `maxAttacksPerCoord` / `multiHitAttacks` / `multiHitChance` | see schema | Same semantics as Fakes' equivalents |
| `arrivalStart` / `arrivalEnd` / `stopAtEnd` | see schema | Sequential-mode arrival window |

## Settings (localStorage `attackgen_settings_v1`)

| Field | Default | Description |
|---|---|---|
| `maxCatapults` | 1 | Cap for catapults (fake mode siege + presets) |
| `maxRams` | 1 | Cap for rams (presets) |
| `maxScouts` | 20 | Cap for scouts |
| `maxInfantry` | 35 | Cap for spear+sword+axe (fake mode) |
| `maxCavalry` | 999 | Cap for light+heavy (fake mode) |

## UI bridge (sessionStorage, mirrors Fakes' `fake_*` keys under `attackgen_*`)

| Key | Content |
|---|---|
| `attackgen_ui_log` | JSON array (max 50) of `{ts, message, level}`. |
| `attackgen_sent` | Total attacks sent/queued this session. |
| `attackgen_total_coords` | Total target count. |
| `attackgen_pending_target` | Current target coord being processed. |
| `attackgen_paused` | `"1"` when the Cancel button (screen lock) or panel Stop is pressed. |
| `attackgen_active` | `"1"` while the engine is running; always reset to `"0"` on script load. Drives the panel's Start/Stop button. |
| `attackgen_generated_coords` | One-shot result of the last `xbot:attackgen:generateCoords` request. |

## localStorage persistence keys

| Key | Content |
|---|---|
| `attackgen_config_v1` / `attackgen_settings_v1` | User config/settings objects. |
| `attackgen_target_plan_v1` | `{ "coord": { planned, initialized } }`. |
| `attackgen_coords_fingerprint_v1` | Sorted-unique coord fingerprint for change detection. |
| `attackgen_run_id_v1` | Current run ID. |
| `attackgen_sent_by_village_v1__run_<id>` / `attackgen_target_sent_v1__run_<id>` | Per-run counters. |
| `attackgen_world_data_v1` | Cached `{ts, data:{villages,players,allies}}` from world data files (6h TTL). |
| `attackgen_ui_log_v1` / `attackgen_sent_v1` / `attackgen_total_coords_v1` / `attackgen_pending_target_v1` | Persisted UI-bridge mirrors. |

## Cookie

`attackgen_index` — current position in the coords array (shared across tabs via cookie,
separate from Fakes' `fake_index`).

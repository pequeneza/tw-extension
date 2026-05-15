# fakes

**File:** `tw-suite-extension/modules/fakes.user.js`  
**Version:** 7.1 (fetch mode + screen lock)  
**Module ID:** `fakes`  
**Trigger page:** `screen=place` (not confirm)  
**Re-entry guard:** None — script checks page URL and runs `runFetchLoop()` once

## What it does

Sends fake attacks (minimal troop composition satisfying TribalWars' 2%-of-village-points population requirement) from all player villages at a configurable list of target coordinates. Operates in **fetch mode**: uses `fetch()` to GET the rally-point page for each village, computes troops, and POSTs attack + confirm without any page navigation. Shows a full-screen overlay during the run.

## Core flow

```
showScreenLock()         — blurred overlay with Cancel button
runFetchLoop()
  ├─ fetchAllVillages()           — from game_data or overview HTML
  └─ for each village (loop):
       ├─ currentIndex()          — cookie-based target pointer
       ├─ findNextEligibleTarget() — skip exhausted targets per plan
       ├─ fetchRallyPointData()   — GET screen=place, parse troops + hidden fields
       ├─ calculateFakeTroopsFrom() — build minimal fake within caps
       ├─ sleep(attackDelay ± random)
       ├─ sendFakeViaFetch()      — POST attack, check arrival, POST confirm
       └─ incSentForVillage_id() / incTargetSent() — update counters
hideScreenLock()
```

## Troop selection algorithm (`calculateFakeTroopsFrom`)

`requiredPop = ceil(villagePoints × 2 / 100)`

1. Take up to `maxScouts` scouts (mandatory — no scouts = skip village).
2. Take 1 catapult (or 1 ram if no catapult). Both count against `maxCatapults`.
3. Fill remaining pop budget with infantry (spear/sword/axe ≤ `maxInfantry`) then cavalry (light/heavy ≤ `maxCavalry`).
4. If still under budget and `maxCatapults > 1`, add more siege.
5. If budget still not reached → return `null` (skip village).

## Target plan (persistent, per-run)

Each coordinate gets a **planned hit count** decided once and stored permanently in `fake_target_plan_v1`:

- With probability `multiHitChance`%, the coord is assigned `multiHitAttacks` hits.
- Otherwise it gets 1 hit.
- Hard cap: `maxAttacksPerCoord`.
- `findNextEligibleTarget()` skips coords where `sent ≥ planned`.

**Coord change detection:** a sorted-unique fingerprint of all coords is stored in `fake_coords_fingerprint_v1`. If the list changes, the plan is wiped and a new run ID is generated automatically.

## Arrival window check

Before confirming, `sendFakeViaFetch()` parses the arrival time from the confirm page HTML (`#arrival_time`). If the arrival falls outside `[arrivalStart, arrivalEnd]`, the attack is skipped (`skip: true`) and the target index advances.

## Config (localStorage `fake_sender_config_v1`)

| Field | Default | Description |
|-------|---------|-------------|
| `attackDelay` | 3500 ms | Base delay before POSTing the attack. |
| `attackRandom` | 2500 ms | ± random variation on attack delay. |
| `confirmDelay` | 800 ms | Delay before POSTing the confirm. |
| `confirmRandom` | 800 ms | ± random variation on confirm delay. |
| `switchDelay` | 8500 ms | Delay between villages in the fetch loop. |
| `switchRandom` | 3500 ms | ± random variation on switch delay. |
| `fakesPerVillage` | 10 | Max fakes per village per run. |
| `maxAttacksPerCoord` | 2 | Hard cap per target coordinate. |
| `multiHitAttacks` | 2 | N attacks for "lucky" coords. |
| `multiHitChance` | 20 | % chance a coord is designated multi-hit. |
| `arrivalStart` | "08:01" | Earliest allowed arrival time (HH:MM). |
| `arrivalEnd` | "22:58" | Latest allowed arrival time (HH:MM). |
| `stopAtEnd` | true | Stop when all targets exhausted (vs. wrap). |
| `coords` | (list) | Space-separated `XXX\|YYY` target coordinates. |

## Settings (localStorage `fake_sender_settings_v1`)

| Field | Default | Description |
|-------|---------|-------------|
| `maxCatapults` | 1 | Max catapults (or rams) per fake. |
| `maxScouts` | 20 | Max scouts per fake. |
| `maxInfantry` | 35 | Max total infantry (spear+sword+axe) per fake. |
| `maxCavalry` | 999 | Max total cavalry (light+heavy) per fake. |

## xBot config integration

`window.__twSuiteCfg('fakes')` values override localStorage at load time. Live changes from `FakeSenderView` are written to `sessionStorage xbot_live_cfg_fakes` — the script reads this at each cycle start.

## UI bridge (sessionStorage)

| Key | Content |
|-----|---------|
| `fake_ui_log` | JSON array (max 50) of `{ts, message, level}` — the Status tab log. |
| `fake_sent` | Total attacks sent this session. |
| `fake_total_coords` | Total target count (for the progress bar in the overlay). |
| `fake_pending_target` | Current target coord being processed. |
| `fake_paused` | `"1"` when the Cancel button is pressed. |

## localStorage persistence keys

| Key | Content |
|-----|---------|
| `fake_sender_config_v1` | User config object. |
| `fake_sender_settings_v1` | Troop cap settings. |
| `fake_target_plan_v1` | `{ "coord": { planned, initialized } }` — persistent target plan. |
| `fake_coords_fingerprint_v1` | Sorted-unique coord fingerprint for change detection. |
| `fake_run_id_v1` | Current run ID (changes on coords change). |
| `fake_sent_by_village_v1__run_<id>` | `{ "id:<villageId>": count }` — per-run village counters. |
| `fake_target_sent_v1__run_<id>` | `{ "coord": count }` — per-run target counters. |
| `fake_ui_log_v1` | Persisted log (shown after page reload). |
| `fake_sent_v1` | Persisted sent total. |
| `fake_total_coords_v1` | Persisted total coords count. |
| `fake_pending_target_v1` | Persisted current target. |

## Cookie

`fake_index` — current position in the coords array (shared across tabs via cookie).

# planeador

**File:** `tw-suite-extension/modules/planeador.user.js`  
**Version:** 1.1.0  
**Trigger page:** Any `game.php` (UI opens via button; active on `screen=memo` for watcher)  
**Re-entry guard:** `window.__twPlaneadorLoaded`

## What it does

**Coordinated attack departure planner** — fetches all player villages with their current troops, lets the user pick a target and desired arrival time, and computes the latest safe departure for each village. Generates pre-filled attack URLs. Handles both noble-train snipes (auto mode reads incoming attacks) and manual departure scheduling. On `screen=memo` it acts as a watcher that fires due departures.

## Travel time formula

```
travelSec(troops, distance, gameSpeed, unitSpeed)
  → max over all units with count > 0 of:
      distance × BASE_SEC[unit] / (gameSpeed × unitSpeed)

// Support with sigil: speed × (1 + sigilPct/100), so time = baseSec / (1 + sigilPct/100)
// e.g. 14% sigil: time = baseSec / 1.14  (NOT baseSec × 0.86 — that would be wrong)
// Attacks: unaffected by sigil
sec = (_cmdType === 'Support' && sigilPct > 0)
    ? baseSec / (1 + sigilPct / 100)
    : baseSec

departureMs = arrivalMs - Math.round(sec * 1000)  // ms precision
```

> **Precision note:** `Math.round(sec * 1000)` is used — NOT `Math.round(sec) * 1000`. The latter loses up to 999 ms of precision by rounding to the nearest second before scaling.

> **Sigil formula note:** `baseSec × (1 - pct/100)` is WRONG. It reduces time by applying the percentage directly to the duration. The correct formula is `baseSec / (1 + pct/100)` because sigil increases speed: if speed is 14% faster, travel time = base / 1.14 ≈ 0.877 × base, not 0.86 × base. Verified against Kumin's output.

## BASE_SEC constants (seconds per tile at gameSpeed=1, unitSpeed=1)

| Unit | BASE_SEC |
|------|----------|
| spear | 1080 |
| sword | 1320 |
| axe | 1080 |
| archer | 1080 |
| spy | 540 |
| light | 600 |
| marcher | 600 |
| heavy | 660 |
| ram | 1800 |
| catapult | 1800 |
| snob | 2100 |
| knight | 600 |

## Key functions

| Function | Purpose |
|----------|---------|
| `fetchServerConfig()` | Reads `game_data.speed` + `game_data.unit_speed`; falls back to fetching `/page/settings`. |
| `fetchGroups()` | GETs `overview_villages`, parses village group navigation into `[{id, name}]`. |
| `fetchVillages(groupId)` | GETs `overview_villages&mode=units&type=own_home`, parses village table into `{villageId, name, x, y, troops}` array. |
| `parseVillagesTable(html)` | Extracts per-village troop counts from the units overview HTML. |
| `travelSec(troops, distance, gameSpeed, unitSpeed)` | Returns worst-case travel time in seconds for a mixed composition. |
| `dist(x1, y1, x2, y2)` | Euclidean tile distance. |
| `buildAttackUrl(villageId, tx, ty, troops, targetVillageId)` | Constructs a pre-filled `screen=place` attack URL. |
| `readPageCoords()` | Reads village coordinates from the page's "Coordenadas:" table row. |
| `parseDatetime(dateStr, timeStr)` | Parses "DD/MM/YYYY" + "HH:MM:SS" into a JS timestamp. |
| `parseGroups(html)` | Multi-strategy group parser (link hrefs → named select → any select with group URLs). |

## Server config resolution

1. `game_data.speed` + `game_data.unit_speed` (preferred — no HTTP cost)
2. `fetch(/page/settings)` → parse embedded `"speed":` / `"unit_speed":` from script blocks
3. Fallback: table rows labelled "Velocidade do jogo" / "Velocidade das unidades"

## Sigil support

Sigil is a game mechanic that makes **support commands arrive faster**. Attacks are unaffected.

- The `[name=sigilia]` input in the overlay panel holds the sigil percentage (0–100).
- `runCalc()` reads this value and stores it in `_lastCalc.sigilPct`.
- `renderTable()` receives `sigilPct` and applies it when computing `sec` for Support commands.
- `kuminEntry` and `autosendEntry` both carry `sigilPct` so downstream tools (kumin_gluer, auto_sender) can apply the same adjustment.

**Pipeline:**
```
overlay [name=sigilia] input
  → runCalc() reads sigilPct, stores in _lastCalc
  → reRenderTable() passes sigilPct to renderTable()
  → renderTable() applies baseSec * (1 - sigilPct/100) for Support rows
  → kuminEntry.sigilPct / autosendEntry.sigilPct written to queue
```

## UI

Panel injected into the right sidebar (TW-themed `<table class="vis">`):

| Element | Purpose |
|---------|---------|
| Target coords input | `XXX\|YYY` target village. |
| Arrival datetime | Desired arrival time (`datetime-local` with ms precision). |
| Group selector | Filter source villages by group. |
| Refresh button | Re-fetches villages from the overview. |
| Unit toggles | Pick which unit type sets the departure speed. |
| Sigilia input | Sigil percentage (0–100). Applied only to Support command timing. |
| Village table | Name, coords, troops, distance, computed departure time, attack link. |

## localStorage keys

| Key | Content |
|-----|---------|
| `tw_gap_snipe_plan_v12` | Current snipe plan `{target, sourceVillageId, unitsToSend, midGapArrivalMs, createdAt}`. Expires after 5 min TTL. |
| `tw_snipe_manual_timings_v1` | Manual timing entries `{target, timings[]}`. |

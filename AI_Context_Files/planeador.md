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

departureMs = arrivalMs - travelSec × 1000
```

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

## UI

Panel injected into the right sidebar (TW-themed `<table class="vis">`):

| Element | Purpose |
|---------|---------|
| Target coords input | `XXX\|YYY` target village. |
| Arrival datetime | Desired arrival time (`datetime-local` with ms precision). |
| Group selector | Filter source villages by group. |
| Refresh button | Re-fetches villages from the overview. |
| Unit toggles | Pick which unit type sets the departure speed. |
| Village table | Name, coords, troops, distance, computed departure time, attack link. |

## localStorage keys

| Key | Content |
|-----|---------|
| `tw_gap_snipe_plan_v12` | Current snipe plan `{target, sourceVillageId, unitsToSend, midGapArrivalMs, createdAt}`. Expires after 5 min TTL. |
| `tw_snipe_manual_timings_v1` | Manual timing entries `{target, timings[]}`. |

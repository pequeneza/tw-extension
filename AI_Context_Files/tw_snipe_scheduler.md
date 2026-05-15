# tw_snipe_scheduler

**File:** `tw-suite-extension/modules/tw_snipe_scheduler.user.js`  
**Version:** 1.7.0  
**Trigger page:** `screen=overview*` and `screen=place*` on `pt111.tribalwars.com.pt` only  
**Re-entry guard:** Returns immediately if `window.jQuery` is not present

## What it does

**Gap snipe scheduler** — helps the player send support into a noble-train gap at exactly the right time. Shows a sorted list of own villages with per-village countdown timers. Opens the rally point in a new tab, fills in target coords and units, submits the form, and auto-confirms on `screen=place?try=confirm` — but does **not** click the final send button (support only, no attack).

## Modes

| Mode | Behaviour |
|------|-----------|
| **Auto** | Reads incoming noble attacks from the page, computes the gap midpoint, and populates candidates automatically. |
| **Manual** | User enters target coordinates and one or more attack timings manually. |

## Speed parameters (from suite config)

| Config key | Default | Description |
|-----------|---------|-------------|
| `gameSpeed` | 1.4 | Server speed multiplier. |
| `unitSpeed` | 0.75 | Unit speed multiplier. |

## Travel time formula

```
speedFactor = 1 / (gameSpeed × unitSpeed)
travelMs = UNIT_MIN_PER_FIELD[unit] × dist(from, to) × speedFactor × 60 × 1000
```

## UNIT_MIN_PER_FIELD (minutes per tile at gameSpeed=1, unitSpeed=1)

| Unit | min/tile |
|------|----------|
| spear | 18 |
| sword | 22 |
| axe | 18 |
| archer | 18 |
| spy | 9 |
| light | 10 |
| marcher | 10 |
| heavy | 11 |
| ram | 30 |
| catapult | 30 |
| snob | 35 |
| knight | 10 |

Units sorted fastest → slowest: `spy, light, knight, marcher, heavy, spear, axe, archer, sword, ram, catapult, snob`.

## Key functions

| Function | Purpose |
|----------|---------|
| `loadPlan()` / `clearPlan()` | Read/delete the current plan from `localStorage` (5 min TTL — stale plans are auto-discarded). |
| `loadManualTimings()` / `saveManualTimings()` | Persist manual target + timing entries. |
| `travelMsForUnit(unit, from, to, speedFactor)` | Computes travel time in ms for a single unit type. |
| `fillTargetOnPlace(plan)` | Writes target coords into `.target-input-field`. |
| `fillUnitsOnPlace(plan)` | Sets unit amounts in `.unitsInput` fields. |
| `submitSupportOnPlace()` | Clicks the support submit button (`input[name="suport"]`). |
| `fillCStimeAndConfirm(plan)` | Writes `midGapArrivalMs` into `#CStime` and clicks Confirmar (used on confirm screen). |
| `runPlaceAutomationIfNeeded()` | Entry point on `screen=place` — dispatches to fill/confirm based on page state. |
| `gmGet(url)` | Fetches a URL via `GM_xmlhttpRequest` (or `$.get` fallback). |
| `parseHTML(html)` | Parses an HTML string via `DOMParser`. |
| `getServerNowMs()` | Returns `Timing.getCurrentServerTime()` or `Date.now()`. |

## Plan object (stored in `tw_gap_snipe_plan_v12`)

```json
{
  "target": { "x": 123, "y": 456 },
  "sourceVillageId": "12345",
  "unitsToSend": { "spy": 1, "light": 50 },
  "midGapArrivalMs": 1716000000000,
  "createdAt": 1716000000000
}
```

## localStorage keys

| Key | Content |
|-----|---------|
| `tw_gap_snipe_plan_v12` | Active snipe plan (expires after 5 min TTL). |
| `tw_snipe_manual_timings_v1` | Manual timings `{ target: "XXX\|YYY", timings: [ms, ...] }`. |

## Unit data source

Fetches own-home troop counts from:
`/game.php?village=<id>&screen=overview_villages&mode=units&type=own_home`

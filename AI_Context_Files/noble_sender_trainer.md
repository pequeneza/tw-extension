# noble_sender_trainer

**File:** `tw-suite-extension/modules/noble_sender_trainer.user.js`  
**Version:** 0.22-extpatch3  
**Trigger page:** `screen=snob` (excluding `mode=coin`)  
**Re-entry guard:** `window.__nobleMarketCallLoaded`

## What it does

**Noble Resource Sender + Auto-Trainer** — a sidebar dashboard that collects resources from all player villages and sends them to the current village to fund nobleman training. Also includes an **auto-train** feature that monitors when resources become available and clicks the recruit button automatically.

## Main action flow (`startSendingAndTraining`)

```
1. Read requested nobles count from UI input
2. Compute total needed: N × {wood:40000, clay:50000, iron:50000}
3. fetchIncomingResources()  →  GET screen=market&mode=call  →  parse #res_sum
4. remaining = needed - currentStock - incomingResources
5. Sort selected source villages by distance (closest first)
6. For each source village (that is selected and has merchants):
     sendResource(src.id → currentVillage.id, wood/clay/iron)
     random 1.2–2.1 s delay between API calls
7. Report result
```

## Noble cost constants

```js
NOBLE_COST = { wood: 40000, clay: 50000, iron: 50000 }
```

## Resource transfer API

Uses `TribalWars.post('market', { ajaxaction: 'map_send', village: srcId, h: game_data.csrf }, payload, onSuccess, onError)`.

## Auto-train (`autoTrainIfReady`)

1. Checks `#train_snob_cell` text for a time string like `"Recursos disponíveis hoje às HH:MM"`.
2. If time is in the future → schedules a page reload for that time + 5–15 s jitter.
3. On reload → looks for `a.btn-recruit` and clicks it immediately.
4. If the button still isn't visible after the scheduled time → arms a fallback reload (10–20 s jitter).
5. Disabled automatically if next noble is more than 24 hours away.
6. State is persisted per village ID so it survives page navigations.
7. Minimum 60 s between page reloads (rate limit).

## UI (TW-themed `<table class="vis">` prepended to the right sidebar)

| Element | Purpose |
|---------|---------|
| Nobles input | How many nobles to fund. |
| Points threshold | Ignore villages below this point count. |
| Refresh list button | Re-fetches all villages from the overview. |
| Send + Train button | Starts `startSendingAndTraining()`. |
| Select/Deselect all | Toggles all village checkboxes. |
| Auto Recrutar toggle | Enables/disables auto-train for this village. |
| Incoming line | Shows incoming resources from `mode=call`. |
| Village table | Name, coords, points, distance, resources, merchants, checkbox. Sorted by distance. |
| Log area | Scrollable log with colour-coded messages (err/ok/warn/info). |
| Minimise button | Collapses the panel body; state persisted. |

## Key functions

| Function | Purpose |
|----------|---------|
| `fetchAllVillages()` | GETs overview_villages&mode=prod, parses village table. |
| `fetchIncomingResources()` | GETs market&mode=call, parses #res_sum totals. |
| `buildVillageTable()` | Rebuilds the table DOM from `playerVillages`. |
| `sendResource(srcId, tgtId, w, c, i)` | Posts a single resource transfer. |
| `startSendingAndTraining()` | Orchestrates the full send flow. |
| `autoTrainIfReady(manual)` | Checks readiness and either clicks or schedules reload. |
| `msUntilReady()` | Parses `#train_snob_cell` for remaining wait time (ms). |
| `findRecruitBtn()` | Returns `a.btn-recruit` if visible, null otherwise. |

## localStorage keys (prefix `tw_suite_noble_sender__`)

| Key | Content |
|-----|---------|
| `nobleSettings` | `{ requestedNobles, ignoreBelowPoints }` |
| `nobleUIState` | `{ minimized: bool }` |
| `autoTraining_<villageId>` | `true/false` — auto-train active for this village. |
| `autoTrainCount_<villageId>` | Number of nobles to train (from the input at activation time). |
| `lastRefresh` | Timestamp of last page reload (rate-limit guard, 60 s minimum). |

## Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `NOBLE_COST` | `{wood:40000, clay:50000, iron:50000}` | Resource cost per noble. |
| `MAX_LINES` | 120 | Maximum log entries shown. |
| `AT_MIN_REFRESH_GAP_MS` | 60 000 ms | Minimum time between auto-refreshes. |
| `AT_REFRESH_ON_MISSING` | 10 000 ms | Base delay for fallback refresh when button not found. |
| `AT_REFRESH_JITTER` | 10 000 ms | Random jitter on top of fallback delay. |
| `AT_MAX_WAIT_MS` | 86 400 000 ms (24 h) | Disable auto-train if next noble is beyond this. |

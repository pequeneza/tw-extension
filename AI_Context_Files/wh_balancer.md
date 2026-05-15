# wh_balancer

**File:** `tw-suite-extension/modules/wh_balancer.user.js`  
**Version:** 4.0.0  
**Trigger page:** Any `game.php` (requires `window.game_data`)  
**Re-entry guard:** `window.__twWHBalancerRunning`

## What it does

**Warehouse Balancer** — distributes resources across player villages via the market so that each village's warehouse stays as full as possible. Extended features include: HQ build priority (reserves resources for the next building in a template sequence), PP (premium points) route locking, manual coordinate locks, and full React overlay integration.

## Main run flow

```
xbot:balancer:run  →  TM_WH_BALANCER.run()
  ├─ fetchAllVillages()       — GET overview_villages&mode=prod
  ├─ filterCandidates()       — apply maxDistance, minResources, group filter
  ├─ fetchAllHqDataBulk()     — fetch building levels + queue + template sequences
  ├─ computeTransfers()       — determine wood/stone/iron to send per village pair
  │    ├─ reserveHqCost()     — subtract next-building cost from available stock
  │    └─ applyPpLocks()      — skip locked resource routes
  ├─ sendTransfers()          — POST TribalWars.post('market', {ajaxaction:'send_res'})
  └─ dispatch xbot:balancer:state
```

## HQ priority pipeline (`fetchAllHqDataBulk`)

| Step | URL | Purpose |
|------|-----|---------|
| 1 | `overview_villages&mode=buildings` | Current building levels + active queue per village |
| 2 | `am_village` | Template ID/name assigned to each village |
| 3 | `am_village&mode=queue&template=ID` | Build sequence for each unique template (cached) |

- **`TW_BUILD_COST` + `calcBuildingCost(buildingId, level)`** — hardcoded cost table (base × factor^(level−1)). Avoids per-village `screen=main` fetches.
- **Effective level** = `completedLevel + queuedLevels[buildingId]`. Buildings already queued are skipped.
- Queue building IDs are parsed from `img src` path (`buildings/smith.webp` → `"smith"`).

## PP (premium points) route locking

Locks block the balancer from sending resources along a specific village→resource route until explicitly unlocked. PP plans describe a full multi-shipment operation to fund a premium trade, stored separately.

## CustomEvent bridge

| Direction | Event | Payload |
|-----------|-------|---------|
| React → Userscript | `xbot:balancer:run` | `{ settings }` — triggers a full balance run |
| React → Userscript | `xbot:balancer:fetchPlans` | — triggers template plan fetch from `am_village` |
| Userscript → React | `xbot:balancer:state` | `{ running, villages, transfers, settings, hqData }` |
| Userscript → React | `xbot:balancer:plansResult` | `[{ id, name, steps: [{buildingId, targetLevel}] }]` |

## Key functions

| Function | Purpose |
|----------|---------|
| `fetchAllVillages()` | GETs production overview; parses village resources, warehouse capacity, merchants. |
| `fetchBuildingsOverview()` | Parses building levels from `td.upgrade_building.b_BUILDINGID`. Queue via `#building_order_VID` (NOT `ul.order_queue` — browser moves `<ul>` out of table cells). |
| `fetchTemplateList()` | GETs `am_village&mode=template`, extracts `[{id, name}]` from template links. |
| `fetchAllHqDataBulk(candidates)` | Main HQ fetch — determines next building and its cost per village. |
| `calcBuildingCost(buildingId, level)` | Returns `{wood, stone, iron}` cost for upgrading to `level`. |
| `loadPpLocks()` / `savePpLocks()` | Read/write PP route lock array. |
| `loadPpPlans()` / `savePpPlans()` | Read/write PP operation plans. |
| `loadHqData()` / `saveHqData()` | Read/write cached HQ result map (with 30-min staleness check). |
| `setManualCoordLock(coordsKey, lockObj)` | Lock a coordinate for specific resources manually. |
| `setManualCoordComment(coordsKey, comment)` | Attach a comment string (max 80 chars) to a coord lock. |

## Settings (localStorage `tm_whbalancer_settings`)

| Field | Description |
|-------|-------------|
| `maxDistance` | Maximum tile distance for resource transfers. |
| `minResources` | Minimum resources a village must have before it can send. |
| `reserveAmount` | Resources to keep back in each source village. |
| `groupId` | Village group filter. |
| `debugMode` | Enables verbose `console.log` output. |
| `hqEnabled` | Enable HQ priority / building reservation. |

## localStorage keys

| Key | Content |
|-----|---------|
| `tm_whbalancer_settings` | User settings object. |
| `tm_whbalancer_plans_v1` | `[{id, name, steps:[{buildingId, targetLevel}]}]` — all template build sequences. |
| `tm_whbalancer_hq_data_v1` | Serialised `Map` entries from last HQ fetch. |
| `tm_whbalancer_hq_timestamp_v1` | Timestamp (ms) of last HQ fetch; stale after 30 min. |
| `tm_whbalancer_pp_locks_v2` | `[{villageId, res, updatedAt}]` — active PP route locks. |
| `tm_whbalancer_pp_plans_v2` | `[{id, targetVillageId, payRes, neededRes, shipments[]}]` — PP operation plans. |
| `tm_whbalancer_manual_locks_coords_v1` | `{"XXX\|YYY": {wood, stone, iron}}` — manual coord locks. |
| `tm_whbalancer_manual_locks_comments_v1` | `{"XXX\|YYY": "comment string"}` — per-coord comments. |

## Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `HQ_STALENESS_MS` | 30 min | Re-fetch HQ data when cache is older than this. |
| `SETTINGS_KEY` | `"tm_whbalancer_settings"` | localStorage key for settings. |

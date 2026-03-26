# xBot WH Balancer — Context Brief
**Paste this at the start of a new conversation to get instant context.**

---

## File
`tw-suite-extension/modules/wh_balancer.user.js` — ~3240 lines, vanilla JS userscript (TW PT, jQuery available as `$`).

**Repo:** https://github.com/pequeneza/tw-extension (branch: `react-ts-vite`)

---

## Architecture
Single IIFE. A launcher button (`xBalancer`) is injected into the TW page header. Clicking it calls `window.TM_WH_BALANCER.run()` which opens a `Dialog.show()` popup and runs the balancer.

**Main execution pipeline in `runComputationAndRender()`:**
```
fetchIncomingOverview()          → incomingRes
fetchProdOverview()              → rawVillagesData
apply reservePerVillage          → villagesData (stocks reduced)
apply pendingSends               → adjusts for already-sent resources
computeTotalsAndAverages()       → averages (including convergent average)
computeExcessShortage()          → excessResources[], shortageResources[]
applyManualCoordLocks()
applyPpResourceLock()
[if hqPriorityEnabled]
fetchHqNextBuilding() × N      → hqData Map (sequential with delay)
applyHqBuildPriority()         → boosts shortage & zeroes excess for empty-queue villages
assignMerchantsAndBuildLinks()   → links[]
normalizeAndCombineLinks() → deduped
addDistanceToLinks() + maxDistance filter
renderRows() + appendSuggestedShipmentsToTable()
[PP plan building if no persisted plans]
```

---

## Recent Fixes (Important)

**HQ Cache Persistence** (March 2026)
- Fixed HQ data not surviving page changes / section switches.
- `loadHqData()` now always returns a `Map` and safely clears corrupted data.
- `state.hqData` is guaranteed to be a `Map`.
- Cache is now saved even when only displaying cached data.
- Increased `HQ_STALENESS_MS` to **1 hour** (was 30 min).

---

## Settings (localStorage key: `tm_whbalancer_settings`)
| Setting                    | Default   | Notes |
|---------------------------|-----------|-------|
| `isMinting`               | false     | Ignore all balancing rules |
| `lowPoints`               | 3000      | Villages below this are strong receivers (never donors unless long queue) |
| `highPoints`              | 7000      | Built-out donor threshold |
| `highFarm`                | 23000     | High farm pop donor threshold |
| `builtOutPercentage`      | 0.26      | Keep % in finished villages (min 0.01) |
| `needsMorePercentage`     | 0.7       | Target fill % for priority villages |
| `reservePerVillage`       | 0         | Flat reserve subtracted from every village |
| `maxDistance`             | 9999      | Global max distance filter |
| `hqPriorityEnabled`       | false     | Enable HQ build queue priority |
| `maxedOutPoints`          | 10471     | Skip HQ check for fully maxed villages |
| `lowPointsLongQueueHours` | 3         | Low-points villages with long queues may donate |
| `sendAllEnabled`          | false     | Enable Send All automation |
| `sendAllIntervalMs`       | 500       | ms between automatic clicks |

**Premium / Instant Trade (10pp) Settings:**
- `premiumInstantEnabled`, `premiumThreshold`, `premiumMinTradeAmount`, `premiumMoveAmount`, `premiumStagingStrategy`, `premiumMaxDistance`, `premiumMaxTargetFillPct`, `premiumMaxPlansHardCap`, `premiumDonorKeepPct`, etc.

---

## Key localStorage Keys
| Key | Purpose |
|-----|--------|
| `tm_whbalancer_settings` | All user settings |
| `tm_whbalancer_pp_locks_v2` | PP resource locks |
| `tm_whbalancer_pp_plans_v2` | Persisted PP plans + timers |
| `tm_whbalancer_manual_locks_coords_v1` | Manual coord-based locks |
| `tm_whbalancer_manual_locks_comments_v1` | Comments for manual locks |
| `tm_whbalancer_hq_data_v1` | Cached HQ build queue data |
| `tm_whbalancer_hq_timestamp_v1` | HQ cache timestamp |

---

## villagesData Object Shape
```js
{
  id, name, points, url,
  wood, stone, iron,                  // current stock (after reserve + pendingSends)
  warehouseCapacity, availableMerchants, totalMerchants,
  farmSpaceUsed, farmSpaceTotal
}

---

## computeExcessShortage — key logic
- **Base:** `temp[res] = current - fleetAverage` (or `-(needsCap - current)` if avg > needsCap)
- **Incoming credit:** `temp += inc[res]`  (reduces shortage or offsets excess)
- **Built-out path** (`points > highPoints` OR `farmUsed > highFarm`):
  ```js
  leave = (stock > wh_leave) ? wh_leave : reservePerVillage
  // wh_leave = builtOutPercentage × warehouseCapacity
  // If stock < wh_leave → leave = reservePerVillage (donate everything above reserve)
  // This was a critical fix: old code used min(wh_leave, stock) = stock → zero excess
  ```
- **Low-points path** (`points < lowPoints`): `temp = -(needsCap - stock - incoming)` — always receiver
- **Overflow path** (`stock + inc >= wh`): same leave formula, but **skipped for low-points villages**
- **Low-points safety clamp**: if temp > 0 after all paths, force to 0 (never a donor)
- **Donor hard cap**: `if (temp > stock) temp = stock`
- Result floored to 1000 (merchant unit)

---

## applyHqBuildPriority — key logic
- Runs after applyManualCoordLocks + applyPpResourceLock
- Checks `state.hqData` Map (villageId → HQ fetch result)
- Skips villages where: `queueEndsSec > 0`, `!buildingName`, or `costs === 0`
- Skips resources locked by manual coord locks or PP locks
- For eligible villages with empty queue:
  - **Zeroes excess** for needed resources (village must not donate what it needs for building)
  - **Boosts shortage** to `max(existing, Math.ceil(missingRes / 1000) * 1000)`
  - `missing = max(0, buildingCost - (stock + incoming))`

---

## fetchHqNextBuilding — two fetches per village
1. `screen=main&mode=accountmanager` → parses `div.vis > h4:contains("Próxima") > p.vis_item > a.inline-icon`
   - Extracts `buildingName` (anchor text) and `buildingId` (screen= param from href)
   - Early return if no next building configured
2. `Promise.all([screen=main&mode=build, screen=main])`
   - `mode=build` → `tr[class*='buildorder'] td span[data-endtime]` → max Unix timestamp → `queueEndsSec`
   - `screen=main` → `#main_buildrow_{buildingId} td.cost_wood[data-cost]` → exact integer costs

**Rate limiting:** sequential with 300ms delay between villages. Skips villages where `points >= maxedOutPoints` OR `points < lowPoints`.

---

## pendingSends — cross-run deduplication
`state.pendingSends` array, populated on every `sendResource()` call:
```js
{ source: string, target: string, wood: int, stone: int, iron: int, sentAt: timestamp }
```
On each Run, applied before computation: subtracts from donor stock, credits receiver incoming.  
Entries expire after 2 hours. Resets when dialog is closed (new `run()` call).

---

## HQ Check panel
- Button: "Check HQ" / "Show HQ" (label changes based on whether `state.hqData` is cached)
- If `state.hqData` exists (Run with checkbox enabled): instant render from cache, no HTTP
- Otherwise: sequential fetch with 300ms gap, progress counter shown
- Panel has `max-height: 260px; overflow-y: auto` scrollbar
- Sorted: shortfalls first, then by queue end time

---

## CSS classes added this session
| Class | Purpose |
|---|---|
| `.tmHqBoostRow` | Yellow row highlight for HQ-priority sends in send list |
| `.tmBadgeHQ` | Yellow `[HQ]` badge in target cell |
| `.tmPpHeader` / `.tmPpRow` | Blue highlight for PP plan rows |
| `.tmBadgePP` | Blue `[PP]` badge |

---

## Known issues / things NOT yet fixed
- The `renderRows` HQ badge condition requires `hqTarget.costWood + costStone + costIron > 0` — if costs fail to parse from `screen=main` the badge silently won't appear (check network tab for 429s)
- `computeHqReadiness` uses `prodWood/Stone/Iron = 0` (conservative — no production credit)
- `appendSuggestedShipmentsToTable` prepends PP rows; if called multiple times they could stack (guard: `loadPpPlans().length > 0 → early return` in runComputationAndRender prevents this)

---

## How to make edits efficiently
1. Read only the relevant section with `sed -n 'LINE1,LINE2p'` before editing
2. Use Python `str.replace()` with exact string matching (assert count == 1 before replacing)
3. Always syntax-check with `node -e "new vm.Script(src)"` after edits
4. Copy output to `/mnt/user-data/outputs/tw-suite-extension/modules/wh_balancer.user.js`

---

## Function index (line numbers)
| Function | Line |
|---|---|
| `loadSettings` / `saveSettings` | 482 / 602 |
| `computeExcessShortage` | 1082 |
| `applyManualCoordLocks` | 457 |
| `applyPpResourceLock` | 1192 |
| `applyHqBuildPriority` | 1227 |
| `assignMerchantsAndBuildLinks` | 1280 |
| `normalizeAndCombineLinks` | 1384 |
| `sendResource` | 718 |
| `fetchHqNextBuilding` | 2869 |
| `computeHqReadiness` | 2942 |
| `runHqCheck` | 2980 |
| `runComputationAndRender` | 3087 |
| `showMainDialog` | 2083 |
| `renderRows` | 2690 |
| `appendSuggestedShipmentsToTable` | 2741 |
| `renderSummary` | 2644 |
| `buildOneInstantTradePlan` | 1422 |
| `buildPlansUntilDone` | 1640 |
| `startPlanCountdown` | 1822 |
| `resumePersistedPlans` | 1934 |
| `readSettingsFromUI` | 2561 |
| `run` | 3212 |
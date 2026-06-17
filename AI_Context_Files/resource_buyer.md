# resource_buyer

**File:** `tw-suite-extension/modules/resource_buyer.user.js`  
**Version:** 2.0.0  
**Trigger page:** `screen=market&mode=exchange`  
**Re-entry guard:** None (URL-matched; runs only on the exchange page)

## What it does

**Automated premium exchange buyer** — monitors the market exchange page and buys wood, stone, and iron using premium points (PP) until the village reaches a configured fill target. The script has no vanilla JS UI; all controls are provided by `ResourceBuyerView.tsx`. Start/stop and config are driven entirely via CustomEvents.

## Main cycle flow

```
setRunning(true)
  └─ scheduleNextCycle(~50ms initial)
       └─ checkAndBuyResources()
            ├─ Detect usage warnings → reload if found
            ├─ Guard: current PP >= MIN_PP_TO_BUY? → skip cycle
            ├─ Read storageCap
            ├─ Read incoming resources
            ├─ Read min-trade rates (readMinTradePerResource × 3) → dispatchState()
            ├─ For each resource in priority order:
            │    ├─ Skip if buy_<res> disabled
            │    ├─ Skip if exchange stock <= MIN_STOCK_THRESHOLD
            │    ├─ Compute target = storageCap × PURCHASE_PERCENTAGE
            │    ├─ missing = min(target − current, storageCap − (current + incoming))
            │    │    ↳ incoming is only used to cap storage overflow, not to decide need
            │    ├─ Skip if missing <= 0
            │    ├─ Floor to multiple of minTrade unit → skip if result == 0
            │    ├─ Snapshot PP, record LAST_BOUGHT_KEY / LAST_PURCHASE_KEY
            │    ├─ setTimeout preDelay (200-600ms): fill input
            │    ├─ setTimeout preDelay + fillToClick (600-2500ms): click buy button
            │    ├─ setTimeout preDelay + fillToClick + clickToConf (400-800ms): click confirm
            │    │    └─ readConfirmedAmount() from dialog → update LAST_BOUGHT_KEY with actual
            │    └─ return 'purchased' → scheduleNextCycle(COOLDOWN_MS = 7000ms)
            └─ Nothing to buy → reload in PAGE_RELOAD_INTERVAL ms
```

## Config (localStorage `tw_buyer_config`)

| Field | Default | Description |
|-------|---------|-------------|
| `ENABLED` | true | Master on/off switch. |
| `buy_wood` | true | Enable wood purchases. |
| `buy_stone` | true | Enable stone purchases. |
| `buy_iron` | true | Enable iron purchases. |
| `priority` | `['wood','stone','iron']` | Order in which resources are bought each cycle. |
| `MIN_PP_TO_BUY` | 100 | Skip cycle if current PP is below this value. |
| `PURCHASE_PERCENTAGE` | 0.70 | Buy until village is at this fraction of storage (0–1). |
| `MIN_STOCK_THRESHOLD` | 50 | Skip a resource if exchange stock ≤ this value (hard gate, prevents overspend on tiny lots). |
| `PAGE_RELOAD_INTERVAL` | 30 000 ms | Reload the page when there is nothing left to buy. |
| `RANDOM_INTERVAL_MIN` | 600 ms | Minimum delay between filling input and clicking buy. |
| `RANDOM_INTERVAL_MAX` | 2 500 ms | Maximum delay between filling input and clicking buy. |

## Interaction timing

Each purchase is split into three staggered steps to simulate human behaviour:

| Phase | Delay |
|-------|-------|
| Pre-fill pause (read the page) | 200–600 ms |
| Fill → click buy (`RANDOM_INTERVAL_MIN..MAX`) | 600–2 500 ms (configurable) |
| Buy click → confirm click | 400–800 ms |

`COOLDOWN_MS = 7 000 ms` after a purchase — ensures the next cycle cannot fire before the confirm dialog has been handled (max interaction ≈ 3 900 ms, leaves ~3 100 ms buffer).

## Min-trade flooring

`readMinTradePerResource(res)` reads the "Classificar" row of the exchange table to find how many units equal 1 PP for each resource (value is stock-dependent and changes dynamically).

- **Primary selector:** `#premium_exchange_rate_<res>` — inferred from TW naming convention, **not yet confirmed live**
- **Fallback:** iterates `table tr`, finds a row where `cells[0].textContent` matches `/classificar/i`, reads `cells[1/2/3]`

`amount = Math.floor(Math.min(missing, stock) / minUnit) * minUnit`

If the rate cannot be read (`null`), the resource is skipped for that cycle with a console warning.

The current rates are sent to the overlay via `dispatchState()` at the start of each cycle and displayed in the "Taxas actuais" section of `ResourceBuyerView.tsx`.

## Confirmed amount reconciliation

TW may sell fewer units per PP tier than the amount entered. `readConfirmedAmount(dialog)` parses the confirmation dialog text `"Comprar [img] N por [img] 1"` to extract the actual amount. If it differs from the requested amount, `LAST_BOUGHT_KEY` is updated before the stats reconcile on next page load.

## Incoming resources

`readIncomingResources()` parses the "A chegar" header to get wood/stone/iron in transit. Incoming is used **only** to compute available storage space (`storageCap − (current + incoming)`), not to decide whether to buy. This allows the script to purchase available stock even when prior bulk buys are still in transit.

## CustomEvent bridge

| Direction | Event | Payload |
|-----------|-------|---------|
| Userscript → React | `xbot:buyer:state` | `{ running, config, stats, minTrade }` |
| React → Userscript | `xbot:buyer:start` | — |
| React → Userscript | `xbot:buyer:stop` | — |
| React → Userscript | `xbot:buyer:save` | `{ config: BuyerConfig }` |
| React → Userscript | `xbot:buyer:getState` | — (probe; overlay polls every 1.5 s) |
| React → Userscript | `xbot:buyer:resetStats` | — |

## Stats reconciliation (cross-reload)

On each page load `reconcileStats()` runs before `dispatchState()`:
1. Reads `PP_BEFORE_KEY` (PP snapshot taken just before buy) and `LAST_BOUGHT_KEY` (res + amount, actual from dialog)
2. Reads current PP; delta = ppBefore − ppNow
3. If delta > 0: adds delta to `stats.ppSpent` and amount to `stats[res]`, persists to `STATS_KEY`
4. Clears both keys

## Confirmed DOM selectors (tribalwars.com.pt)

| Element | Selector | Notes |
|---------|----------|-------|
| Premium points | `#premium_points` | |
| Storage capacity | `#storage` | |
| Village wood/stone/iron | `#wood`, `#stone`, `#iron` | |
| Exchange stock | `#premium_exchange_stock_wood/stone/iron` | TD element |
| Buy inputs | `#premium_exchange_buy_wood input` etc. | inside TD |
| Buy button | `.btn-premium-exchange-buy` | INPUT element |
| Confirm dialog | `.confirmation-box` | |
| Confirm yes | `.btn-confirm-yes` | |
| Min trade rate | `#premium_exchange_rate_wood/stone/iron` | ⚠ not yet confirmed live — fallback uses "Classificar" row text search |

## localStorage keys

| Key | Content |
|-----|---------|
| `tw_buyer_config` | Serialised `BuyerConfig` object. |
| `tw_buyer_running` | `"true"` / `"false"` — survives page reloads to auto-restart. |
| `tw_buyer_last_purchase` | Timestamp (ms) of last purchase, for COOLDOWN calculation on startup. |
| `tw_buyer_pp_before` | PP count snapshotted just before a buy, used by `reconcileStats()`. |
| `tw_buyer_last_bought` | `{ res, amount }` — last buy record (amount is updated to actual after dialog read). |
| `tw_buyer_stats` | `{ ppSpent, wood, stone, iron }` — session totals. |
| `tw_buyer_next_action_at` | Timestamp (ms) of next scheduled action — polled by overlay for countdown display. |

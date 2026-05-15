# resource_buyer

**File:** `tw-suite-extension/modules/resource_buyer.user.js`  
**Version:** 2.0.0  
**Trigger page:** `screen=market&mode=exchange`  
**Re-entry guard:** None (URL-matched by `@match`; runs only on the exchange page)

## What it does

**Automated premium exchange buyer** — monitors the market exchange page and buys wood, clay, and iron using premium points (PP) until the village reaches a configured fill target. The script has no vanilla JS UI; all controls are provided by the `ResourceBuyerView.tsx` React overlay panel. Start/stop and config changes are driven entirely via CustomEvents.

## Main cycle flow

```
setRunning(true)
  └─ scheduleNextCycle(50ms)
       └─ checkAndBuyResources()
            ├─ Read current PP, storage, village resources
            ├─ For each resource in priority order:
            │    ├─ Skip if buy_<res> disabled
            │    ├─ Skip if PP >= MAX_PREMIUM_POINTS  → wait PREMIUM_POINTS_TIMEOUT
            │    ├─ Skip if exchange stock < MIN_STOCK_THRESHOLD
            │    ├─ Compute target = storage × PURCHASE_PERCENTAGE
            │    ├─ If current < target: fill buy input, click buy button
            │    └─ Confirm dialog if present
            └─ scheduleNextCycle(1000–3000ms)
```

## Config (localStorage `tw_buyer_config`)

| Field | Default | Description |
|-------|---------|-------------|
| `ENABLED` | true | Master on/off switch. |
| `buy_wood` | true | Enable wood purchases. |
| `buy_stone` | true | Enable clay purchases. |
| `buy_iron` | true | Enable iron purchases. |
| `priority` | `['wood','stone','iron']` | Order in which resources are bought. |
| `MAX_PREMIUM_POINTS` | 5000 | Pause buying when PP exceeds this value. |
| `PREMIUM_POINTS_TIMEOUT` | 600 000 ms (10 min) | Wait before retrying when PP is above max. |
| `PURCHASE_PERCENTAGE` | 0.70 | Buy until village is at this fraction of storage (0–1). |
| `MIN_STOCK_THRESHOLD` | 50 | Skip a resource if the exchange has less than this available. |
| `PAGE_RELOAD_INTERVAL` | 10 000 ms | Periodic safety page reload while running. |
| `RANDOM_INTERVAL_MIN` | 50 ms | Minimum random delay between cycle steps. |
| `RANDOM_INTERVAL_MAX` | 180 ms | Maximum random delay between cycle steps. |

## CustomEvent bridge

| Direction | Event | Payload |
|-----------|-------|---------|
| Userscript → React | `xbot:buyer:state` | `{ running: bool, config: BuyerConfig }` |
| React → Userscript | `xbot:buyer:start` | — |
| React → Userscript | `xbot:buyer:stop` | — |
| React → Userscript | `xbot:buyer:save` | `{ config: BuyerConfig }` |
| React → Userscript | `xbot:buyer:getState` | — (probe to sync overlay on open) |

## Confirmed DOM selectors (tribalwars.com.pt)

| Element | Selector |
|---------|---------|
| Premium points | `#premium_points` |
| Storage | `#storage` |
| Village wood/clay/iron | `#wood`, `#stone`, `#iron` |
| Exchange stock wood/clay/iron | `#premium_exchange_stock_wood`, `#premium_exchange_stock_stone`, `#premium_exchange_stock_iron` |
| Buy inputs | `#premium_exchange_buy_wood input`, `#premium_exchange_buy_stone input`, `#premium_exchange_buy_iron input` |
| Buy button | `.btn-premium-exchange-buy` (INPUT element) |
| Confirm dialog | `.confirmation-box` |
| Confirm yes | `.btn-confirm-yes` |

## localStorage keys

| Key | Content |
|-----|---------|
| `tw_buyer_config` | Serialised `BuyerConfig` object. |

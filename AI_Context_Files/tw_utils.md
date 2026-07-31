# tw_utils

**File:** `tw-suite-extension/modules/tw_utils.user.js`  
**Version:** 1.3.0  
**Trigger page:** Any `game.php`  
**Re-entry guard:** `window.__twUtilsLoaded`

## What it does

**Multi-feature utility module** — injects several independent quality-of-life tools into the game page. Each feature activates only on the relevant screen. Config is provided by `window.__twSuiteCfg('tw_utils')`.

## Features

| Feature | Active screen | Description |
|---------|--------------|-------------|
| **Village Switcher** | `screen=map` | Adds a context-menu button via `TWMap.context` so clicking an own village on the map opens a switch-village prompt. |
| **Incoming Filter** | Incomings overview (`screen=overview_villages&mode=incomings`) | Adds a toggle button per row to hide/show support-type incoming commands. |
| **Quickbar Collapse** | All pages | Adds a `[±]` toggle button that collapses or expands the quickbar (`#quickbar`). State persisted in `localStorage`. |
| **Bulk Cancel** | Any page with cancel links | Floating button that collects all `.command-cancel` hrefs on the page and fires them sequentially via `fetch()`. Shows a running counter. |
| **Unit Max + Simulator** | `screen=overview_villages` and `screen=place` | "Max" button that combines own troops + incoming support + outgoing support into a single totals panel. "Sim" button that POSTs to `screen=place&mode=sim` and displays simulator results inline. |

## Key functions

| Function | Purpose |
|----------|---------|
| `initVillageSwitcher()` | Registers a native `TWMap.context` button; only on `screen=map`. |
| `initIncomingFilter()` | Adds `.tw-incf-btn` toggle button to each incoming row. |
| `initQuickbarCollapse()` | Inserts `#tw-qb-toggle` button; reads/writes `tw_qb_collapsed`. |
| `initBulkCancel()` | Appends `#tw-bc-fixed` floating button; collects cancel hrefs and fires them. |
| `initUnitMax()` | Adds `#tw-umax-btn` button; reads own troops, merges support from sessionStorage. |
| `initUnitSimulator()` | Adds `#tw-umax-sim-btn`; POSTs to TW's sim endpoint and parses combat results. |
| `getCurrentScreen()` | Returns `URLSearchParams(location.search).get('screen')`. |

## CustomEvent bridge

| Direction | Event | Payload |
|-----------|-------|---------|
| React → Userscript | `xbot:twutils:cancelAll` | — (triggers bulk cancel from the overlay) |

## sessionStorage keys

| Key | Content |
|-----|---------|
| `tw_umax_support_v1` | Parsed incoming support unit totals (cached, per-village). |
| `tw_umax_template_v1` | Saved troop composition template for the simulator. |
| `tw_umax_sim_v1` | Last simulator result object. |

## localStorage keys

| Key | Content |
|-----|---------|
| `tw_qb_collapsed` | `"1"` when quickbar is collapsed, absent when expanded. |

## CSS classes injected

| Class | Element |
|-------|---------|
| `.tw-incf-btn` | Incoming filter toggle button. |
| `.tw-incf-forbidden` | Red circle-slash overlay on active filter button. |
| `#tw-qb-toggle` | Quickbar collapse toggle. |
| `.tw-bc-btn` | Bulk-cancel button style. |
| `#tw-bc-fixed` | Floating fixed bulk-cancel button. |
| `#tw-umax-btn` | Unit Max trigger button. |
| `#tw-umax-sim-btn` | Simulator trigger button. |
| `#tw-umax-panel` | Expandable unit totals panel. |
| `#tw-umax-sim-panel` | Inline simulator results panel. |

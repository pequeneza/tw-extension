# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**xBot** is a Chrome MV3 extension for TribalWars PT (tribalwars.com.pt) automation. It has two distinct codebases that are built together:

- `src/` — React/TypeScript popup UI + content scripts (compiled via Vite + Rollup)
- `tw-suite-extension/modules/` — Vanilla JS userscripts that run in the game page's main world

## Commands

```bash
npm run build       # Full production build → dist/
npm run dev         # Watch mode (recompiles on changes)
npm run typecheck   # TypeScript strict check, no emit
npm run clean       # Delete dist/
npm run clean:all   # Delete dist/ + node_modules/
```

Build steps in order:
1. **Vite** builds popup (`popup/popup.html` + chunks)
2. **extensionAssetsPlugin** (vite.config.ts) copies manifest, icons, userscripts to `dist/`, prepending `tw-suite-config-bridge.js` to every userscript
3. **build-scripts.mjs** (Rollup) compiles `content/router.ts`, `content/overlay.entry.tsx`, and `background/service-worker.ts` as separate IIFEs/ESM

No lint or test scripts exist. Type checking is `npm run typecheck`.

## Architecture: Two-World Model

The extension splits JS across two isolated browser contexts:

| Context | Files | Has access to |
|---|---|---|
| **Main world** | `*.user.js` modules | `window`, `game_data`, `$`, `TribalWars`, `UI`, `Dialog` |
| **Isolated world** | Content scripts (`router.ts`, `overlay.entry.tsx`) | Chrome APIs only; no direct `window` access |

Communication between worlds happens via `CustomEvent` dispatched on `document`.

## Config Flow

```
Popup UI → chrome.storage.sync
                ↓
         router.ts (content script, runs on every game page)
                ↓  reads storage, writes per-module config
         sessionStorage["__xbot_cfg__"]
                ↓  prepended to every userscript
         tw-suite-config-bridge.js
                ↓  exposes window.__twSuiteCfg(moduleId)
         *.user.js modules call window.__twSuiteCfg('module_id')
```

Per-module settings (beyond enabled/disabled) are stored in `localStorage` by the userscripts themselves.

## Key Source Files

- **`src/types/modules.ts`** — `ModuleId` union type, `ModuleConfig` interface, `MODULE_CONFIGS[]` (9 modules). Add new modules here.
- **`src/types/config-schemas.ts`** — `FieldDef` and `ModuleConfigSchema` types, `MODULE_CONFIG_SCHEMAS` map. Drives the popup config UI for each module.
- **`vite.config.ts`** — `USERSCRIPT_MAP` maps module IDs to their `.user.js` source files. Add new modules here too.
- **`src/content/router.ts`** — Content script that injects enabled, URL-matched userscripts into the page at `document_end`.
- **`src/content/overlay/Overlay.tsx`** — Mounts React overlay inside Shadow DOM; routes between module panels (Balancer, Snipe, etc.).
- **`src/content/overlay/overlay-css.ts`** — All overlay CSS as a template literal with color tokens (`n0`–`n900`, `b500`, `r500`, `g600`, `a500`).
- **`build-scripts.mjs`** — Rollup configs for the three non-popup scripts; handles paths with spaces (OneDrive).

## Userscript Patterns

Every userscript follows this structure:

```js
(function() {
  if (window.__twModuleNameRunning) return;  // re-entry guard
  window.__twModuleNameRunning = true;

  const cfg = window.__twSuiteCfg?.('module_id') ?? {};  // reads extension config

  function whenReady(cb) {
    // polls for $, TribalWars, UI, Dialog then calls cb
  }
  whenReady(function() { /* main logic */ });
})();
```

Userscripts communicate with the React overlay via CustomEvents:
- **Userscript → React:** `document.dispatchEvent(new CustomEvent('xbot:module:state', { detail: {...} }))`
- **React → Userscript:** `document.dispatchEvent(new CustomEvent('xbot:module:run', { detail: {...} }))`

## React Overlay Patterns

Overlay components (in `src/content/overlay/`) run in Shadow DOM. They:
- Use `CustomEvent` for all communication with the main-world userscripts
- Follow a two-tab layout: main action tab + settings tab
- Use CSS variables defined in `overlay-css.ts` (no external UI libraries)

## Adding a New Module

1. Create `*.user.js` in `tw-suite-extension/modules/`
2. Add to `USERSCRIPT_MAP` in `vite.config.ts`
3. Add `ModuleConfig` entry to `MODULE_CONFIGS` in `src/types/modules.ts`
4. Optionally add `ModuleConfigSchema` to `src/types/config-schemas.ts`
5. If the module needs a React panel, add a view component in `src/content/overlay/` and wire it in `Overlay.tsx`

## Additional Context

Detailed architecture docs and WH Balancer algorithm specifics are in `AI_Context_Files/` at the repo root — read these before working on WH Balancer or the overlay bridge.

---

## Resource Buyer — Current State & Pending Work

### What was done
- `resource_buyer.user.js` was refactored from Tampermonkey userscript to Chrome extension context:
  - Replaced `GM_getValue`/`GM_setValue` with `localStorage` (`tw_buyer_config` key)
  - Fixed buy input selector from `input[name="buy_${res}"]` → `#premium_exchange_buy_${res} input`
  - Increased default `MAX_PREMIUM_POINTS` from 300 → 5000
  - Removed all vanilla JS UI (~170 lines)
  - Added CustomEvent bridge (events below)
- `src/content/overlay/ResourceBuyerView.tsx` created — React panel wired into the overlay
- `Overlay.tsx` updated: View type `"buyer"` added, import, `onCfg` handler, `<ResourceBuyerView>` rendered

### CustomEvent bridge (resource buyer)
| Direction | Event name | Payload |
|---|---|---|
| Userscript → React | `xbot:buyer:state` | `{ running: bool, config: BuyerConfig }` |
| React → Userscript | `xbot:buyer:start` | — |
| React → Userscript | `xbot:buyer:stop` | — |
| React → Userscript | `xbot:buyer:save` | `{ config: BuyerConfig }` |
| React → Userscript | `xbot:buyer:getState` | — (probe) |

### Confirmed working DOM selectors (tribalwars.com.pt exchange page)
| Element | Selector | Notes |
|---|---|---|
| Village wood | `#wood` | textContent |
| Village stone | `#stone` | textContent |
| Village iron | `#iron` | textContent |
| Storage capacity | `#storage` | textContent |
| Premium points | `#premium_points` | textContent, value was 806 in testing |
| Exchange stock wood | `#premium_exchange_stock_wood` | TD element |
| Exchange stock stone | `#premium_exchange_stock_stone` | TD element |
| Exchange stock iron | `#premium_exchange_stock_iron` | TD element |
| Buy input wood | `#premium_exchange_buy_wood input` | inside TD |
| Buy input stone | `#premium_exchange_buy_stone input` | inside TD |
| Buy input iron | `#premium_exchange_buy_iron input` | inside TD |
| Buy button | `.btn-premium-exchange-buy` | INPUT element (not A or button) |
| Confirm dialog | `.confirmation-box` | ⚠ NOT yet verified live |
| Confirm yes button | `.btn-confirm-yes` | ⚠ NOT yet verified live |

### Pending fixes for ResourceBuyerView.tsx
1. **Config sync bug** — `useEffect` in `ResourceBuyerView.tsx` re-syncs `cfg` from the userscript state on every probe (every 1.5s), overwriting the user's unsaved changes. Fix: only sync on first detection (use a `syncedRef` guard so subsequent state updates don't clobber dirty form state).

2. **Resource icons** — Use the same game asset icons as `BalancerView.tsx`:
   ```ts
   const RES_ICON_URLS = {
     wood:  "https://dspt.innogamescdn.com/asset/b2fb8d33/graphic/holz.png",
     stone: "https://dspt.innogamescdn.com/asset/b2fb8d33/graphic/lehm.png",
     iron:  "https://dspt.innogamescdn.com/asset/b2fb8d33/graphic/eisen.png",
   };
   ```
   Replace the emoji labels (`🪵 Wood` etc.) with `<img>` icons matching the `ResIcon` component in `BalancerView.tsx`.

3. **Field labels** — Current labels are unclear. Rename:
   - `MAX_PREMIUM_POINTS` → "Max PP to spend" + help: "Pause buying when PP exceeds this value"
   - `PURCHASE_PERCENTAGE` → "Fill target (0–1)" + help: "Buy until village reaches this fraction of storage. E.g. 0.7 = 70%"
   - `MIN_STOCK_THRESHOLD` → "Min market stock" + help: "Skip a resource if the exchange has less than this amount available"
   - `PREMIUM_POINTS_TIMEOUT` → "PP cooldown (ms)" + help: "How long to wait before retrying when PP is above max"
   - `PAGE_RELOAD_INTERVAL` → "Safety reload (ms)" + help: "Reloads the page periodically while running to prevent stale state"

4. **Trigger button** — Add a `🛒` trigger button to the `trigger-stack` in `Overlay.tsx`, visible only when on `screen=market&mode=exchange` and `isOn("resource_buyer")`. Pattern to follow:
   ```tsx
   {isExchangePage && isOn("resource_buyer") && (
     <button className="trigger trigger--buyer"
       onClick={() => { setViewP({ type: "buyer" }); setOpen(true); }}
       title="Resource Buyer" aria-label="Resource Buyer">🛒</button>
   )}
   ```
   Also add `.trigger--buyer { position: relative; top: unset; }` to `overlay-css.ts` (same as `.trigger--balancer` at line ~138).

### Build command
```bash
npm run build
```
Always run after any change to `src/` or `tw-suite-extension/modules/`. The extension loads from `dist/`.
After building, go to `chrome://extensions` and click ↺ reload on the extension.

---

## Native Autosender — Plan

Goal: replace Kumin autosender dependency with a fully bundled xBot module.

### What Kumin Does (reference)
- **Command queue** — localStorage key `overviewVars_ID_{playerId}{worldId}`, JSON array with `{ src, tgt, launch, arrival, units, ntTemplate, sigilPct, leaveHome }` per entry
- **Watcher** — runs on screen=memo, polls every second, fires when `Date.now() ≥ launch - pingOffset`
- **Ping offset** — periodic XHR round-trips, picks weighted median with MAD outlier removal for server-client clock delta
- **Execution** — opens `screen=place` with command data in sessionStorage; place-tab fills unit inputs, busy-wait loop for sub-100ms precision
- **NT filling** — on `screen=place?try=confirm`, fills noble-train units and sigil % before submitting
- **Worker timer** — overwrites `window.setInterval/setTimeout` with a SharedWorker version so background tabs don't throttle

### Proposed Architecture

```
Planeador "+ Autosend" button
        │
        ▼
xbot_autosender_queue (localStorage)
        │
        ▼
auto_sender.user.js  ← runs on every page (matchPattern: /.*/)
  ├─ Ping measurer  (XHR to /game.php?ajax=..., weighted median)
  ├─ Watcher loop   (SharedWorker-based, fires at launch - pingOffset)
  └─ Launcher       (window.open screen=place with sessionStorage payload)
        │
        ▼
screen=place handler (same auto_sender.user.js, different branch)
  ├─ Read sessionStorage["xbot_send_cmd"]
  ├─ Fill unit inputs
  ├─ Click "Atacar" → busy-wait at confirm screen
  └─ Submit → close tab
        │
        ▼
AutoSenderView.tsx  (React overlay panel)
  ├─ Live queue table (entry, countdown badge, src→tgt, units)
  ├─ Ping offset display + manual override
  ├─ Pause / clear controls
  └─ CustomEvent bridge: xbot:autosender:state / xbot:autosender:run
```

### Implementation Phases

**Phase 1 — Core engine** (`auto_sender.user.js`)
- SharedWorker-based timer (adapt Kumin's worker approach)
- Ping measurer: 5 XHR samples to `/game.php`, weighted median, store offset in sessionStorage
- Queue watcher: runs on every page, picks entries due within 30s, opens place-tab
- screen=place handler: reads `xbot_send_cmd` from sessionStorage, fills inputs, busy-wait send

**Phase 2 — Planeador integration**
- Replace/supplement "+ Kumin" button with "+ Autosend" button
- Button writes directly to `xbot_autosender_queue` — no Kumin dependency
- Keep "+ Kumin" as optional for users who still use Kumin

**Phase 3 — React panel** (`AutoSenderView.tsx`)
- Live queue with Portuguese date badges (reuse `fmtPtDate` from GluerView)
- Per-entry delete button, ping offset display, start/pause toggle

**Phase 4 — NT support** (optional, post-MVP)
- On `screen=place?try=confirm`, read `xbot_send_cmd.ntTemplate`
- Fill noble train unit counts

### Open Decisions
1. **Kumin format compatibility** — read/write Kumin's `overviewVars_ID_*` key too, or xBot-only key?
2. **Module identity** — new module `auto_sender` or enhance existing `tw_snipe_scheduler`?
3. **Phase scope** — Phase 1+2 only first, or build all 3 together?

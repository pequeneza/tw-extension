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

## WH Balancer — HQ Build Priority

The balancer can identify the next building each village should construct and reserve resources for it. The full pipeline:

### Data sources (fetchAllHqDataBulk)
| Step | URL | Purpose |
|---|---|---|
| 1 | `overview_villages&mode=buildings` | Current building levels + active build queue per village |
| 2 | `am_village` | Which template ID/name is assigned to each village |
| 3 | `am_village&mode=queue&template=ID` | Build sequence for each unique template (cached in `tm_whbalancer_plans_v1`) |

### Key functions (wh_balancer.user.js)
- **`TW_BUILD_COST` + `calcBuildingCost(buildingId, level)`** — Hardcoded building cost table (base cost × factor^(level−1)). Replaces per-village `screen=main` HTTP fetches entirely.
- **`fetchTemplateList()`** — Fetches `screen=am_village&mode=template`, finds all templates by their `template=ID` link href, returns `[{id, name}]`.
- **`fetchBuildingsOverview()`** — Fetches the buildings overview page. Parses building levels from `td.upgrade_building.b_BUILDINGID`. Finds queue items via `$p.find("#building_order_VID")` (NOT `$tr.find("ul.order_queue")` — the browser HTML parser moves `<ul>` out of table cells, so the page-root ID lookup is required).
- **`fetchAllHqDataBulk(candidates)`** — Main HQ data fetch. Determines next building from template sequence vs. effective levels (`completed + queued`), computes cost for `completedLevel + 1` (the immediate next single upgrade, not the template target level).

### localStorage keys (wh_balancer.user.js)
| Key | Content |
|---|---|
| `tm_whbalancer_plans_v1` | `[{id, name, steps: [{buildingId, targetLevel}]}]` — all template build sequences. Populated by "Fetch Plans" button. |
| `tm_whbalancer_hq_data_v1` | Cached HQ result map from last run. |
| `tm_whbalancer_hq_timestamp_v1` | Timestamp of last HQ fetch (ms). |
| `tm_whbalancer_settings` | User settings object. |

### React (BalancerView.tsx) — HQ tab
- **`FetchedPlan`** interface + **`BLDG_LABEL`** map: types/labels for the plan display.
- **`PlanRow`** component: collapsible row showing plan name, step count, and final target levels per building.
- **`fetchPlansAction`**: dispatches `xbot:balancer:fetchPlans` → userscript fetches all templates and saves to `tm_whbalancer_plans_v1`.
- **Events**: `xbot:balancer:fetchPlans` (React→userscript) / `xbot:balancer:plansResult` (userscript→React).

### Template key matching
`fetchAmVillageTemplateMap` produces name-based keys (`n:XXX`) when the village list page has no numeric template ID in links. `cachedPlanSeqs` (inside `fetchAllHqDataBulk`) indexes by **both** `p.id` and `n:${p.name}` so either form matches the cache.

### Effective level logic
The "next building" determination uses `effectiveLevel = completedLevel + queuedLevels[buildingId]`. This skips buildings already being built in the queue (resources already consumed). Queue item building IDs are parsed from the `img src` path (`buildings/smith.webp` → `"smith"`), which is reliable and encoding-agnostic.

## Additional Context

Detailed architecture docs and WH Balancer algorithm specifics are in `AI_Context_Files/` at the repo root — read these before working on WH Balancer or the overlay bridge.

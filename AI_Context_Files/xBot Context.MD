# xBot Module Development Context

## Project Overview

**Game:** Tribal Wars PT (`https://*.tribalwars.com.pt/game.php*`)  
**Bot name:** xBot — a browser extension that injects a side-panel overlay into the TW game UI.  
**Stack:** Userscript (vanilla JS + jQuery) + React/TypeScript content script rendered inside a Shadow DOM overlay.

The existing module is the **WH Balancer** (`wh_balancer.user.js` + `BalancerView.tsx`). Any new module follows the same architecture.

---

## Architecture

### Two-world model

The browser extension has two isolated JavaScript worlds:

| World | Files | Access |
|-------|-------|--------|
| **Main world** (userscript) | `*.user.js` | Full access to `window`, `game_data`, `$` (jQuery), `TribalWars`, `UI`, `Dialog` |
| **Isolated world** (content script) | `*.tsx` React components | No access to main world `window`. Communicates via `CustomEvent` on `document` only. |

Communication between the two worlds is done exclusively via `document.dispatchEvent(new CustomEvent('xbot:MODULE:EVENT', { detail: ... }))`.

### Overlay / panel integration

The React panel (`BalancerView.tsx`) is mounted inside a **Shadow DOM** overlay managed by `Overlay.tsx`. The overlay has its own CSS variables and design system. Key integration points in `Overlay.tsx`:

```typescript
// 1. Add to View union type
type View = { type: "balancer" } | { type: "your_module" } | ...

// 2. Import your view component
import { YourModuleView } from "./YourModuleView";

// 3. Add trigger button in trigger-stack
<button onClick={() => setView({ type: "your_module" })}>🔧 YourModule</button>

// 4. Mount your view
{view.type === "your_module" && <YourModuleView visible onBack={() => setView(null)}/>}

// 5. Add drawer width token if needed (overlay-css.ts)
// --w-your-module: 1000px;
// .drawer--your-module { width: var(--w-your-module); }
```

### CSS / design system

All CSS lives in `overlay-css.ts` (a template literal exported as a string, injected into the Shadow DOM). The balancer's additional CSS is in `balancer-overlay.css` and must be appended before the closing backtick.

CSS variables available (defined in `:host`):
- Colors: `--n0` through `--n900` (neutrals), `--b500` (blue), `--r500` (red), `--g600` (green), `--a500` (amber)
- Typography: `--mono`
- Shadows: `--shadow-xl`
- Component tokens: `--b-bg`, `--b-br` (button background/border)

Common utility classes: `.btn`, `.btn-save`, `.btn-save--dirty`, `.btn-save--saved`, `.btn-ghost`, `.input`, `.field`, `.field-label`, `.field-check`, `.toggle`, `.toggle-thumb`, `.cfg-body`, `.cfg-section`, `.cfg-header`, `.cfg-footer`, `.cfg-title`, `.cfg-subtitle`, `.cfg-icon`, `.section-label`, `.state-msg`, `.field-help`, `.spinner`, `.live-pip`, `.back-btn`

---

## Userscript Pattern

### Module skeleton

```javascript
// ==UserScript==
// @name         Tribal Wars - Your Module Name
// @match        https://*.tribalwars.com.pt/game.php*
// @grant        none
// ==/UserScript==
(function () {
  "use strict";
  if (typeof window.game_data === "undefined") return;

  function whenReady(fn, tries = 0) {
    const has$ = typeof window.$ !== "undefined";
    const hasTW = typeof window.TribalWars !== "undefined";
    if (has$ && hasTW) fn();
    else if (tries < 300) setTimeout(() => whenReady(fn, tries + 1), 100);
  }

  whenReady(() => {
    // inject launcher button, keyboard shortcuts, etc.
  });

  window.TM_YOUR_MODULE = (function () {
    let state = null;

    // Suite config integration (optional — allows popup config overrides)
    const _suiteCfg = (typeof window.__twSuiteCfg === 'function')
      ? window.__twSuiteCfg('your_module')
      : {};

    // ── Settings ──────────────────────────────────────────────────────────
    const SETTINGS_KEY = "tm_yourmodule_settings";
    function loadSettings() { /* load from localStorage with defaults + migration */ }
    function saveSettings(s) { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); }

    // ── State bridge to React panel ───────────────────────────────────────
    function updateReactState(payload) {
      window.TM_YOUR_MODULE_STATE = { ...payload };
      document.dispatchEvent(new CustomEvent('xbot:yourmodule:state', { detail: payload }));
    }

    // ── Event listeners from React panel ─────────────────────────────────
    document.addEventListener('xbot:yourmodule:run',    () => { runHeadless(); });
    document.addEventListener('xbot:yourmodule:action', (e) => { /* handle */ });

    // ── Headless run (called by React panel's Run button) ─────────────────
    async function runHeadless() {
      state = { settings: loadSettings(), /* ... */ };
      try {
        updateReactState({ running: true, statusText: 'Fetching…' });
        await runComputationAndRender();
      } catch (e) {
        console.error('[YOUR_MODULE] runHeadless failed', e);
        updateReactState({ running: false, statusText: 'Error — check console' });
      }
    }

    // ── Legacy jQuery dialog run (called by toolbar button) ───────────────
    async function run() {
      state = { settings: loadSettings(), /* ... */ };
      showMainDialog();
    }

    return { run };
  })();
})();
```

### Key utilities available in main world

```javascript
// TW globals
game_data.village.id        // current village ID
game_data.player.id         // player ID
game_data.speed             // server speed multiplier

// jQuery AJAX
const html = await $.get(url);
const $page = $(html);

// TW API
TribalWars.post("market", { ajaxaction: "map_send", village: srcId }, payload, callback);
UI.SuccessMessage("text");
UI.ErrorMessage("text");
Dialog.show("content", html);
Dialog.close();

// URL builder
function makeURL(params) {
  return `game.php?${new URLSearchParams(params).toString()}`;
}

// Overview URLs (handles sitter mode)
function getOverviewUrls() {
  if (game_data.player.sitter > 0) {
    return {
      prod: makeURL({ t: game_data.player.id, screen: "overview_villages", mode: "prod", page: "-1" }),
      inc:  makeURL({ t: game_data.player.id, screen: "overview_villages", mode: "trader", type: "inc", page: "-1" }),
    };
  }
  return {
    prod: makeURL({ screen: "overview_villages", mode: "prod", page: "-1" }),
    inc:  makeURL({ screen: "overview_villages", mode: "trader", type: "inc", page: "-1" }),
  };
}
```

### Fetching village data (`screen=overview_villages&mode=prod`)

The prod overview page is the primary source for all village data. It returns one row per village with: wood/stone/iron stocks, warehouse capacity, available/total merchants, farm (used/total), points, village name+coords, village ID, village URL.

The page also contains `ul.order_queue` per village (build queue items with `data-title` containing absolute end times in PT locale: `"hoje às 22:32"`, `"amanhã às 06:54"`, `"a 02.04. às 18:44"`).

Village name format: `"001x (440|651) K64"` — coords always embedded, parseable with `/(\d+)\|(\d+)/`.

---

## React Panel Pattern

### Component skeleton

```typescript
// YourModuleView.tsx
import React, { useCallback, useEffect, useRef, useState } from "react";

interface YourModuleSettings { /* ... */ }
interface YourModuleState { running: boolean; statusText: string; /* ... */ }
type Tab = "main" | "settings";

const SETTINGS_KEY = "tm_yourmodule_settings";
const DEFAULT_SETTINGS: YourModuleSettings = { /* ... */ };

function loadSettings(): YourModuleSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<YourModuleSettings>) };
  } catch { return { ...DEFAULT_SETTINGS }; }
}
function saveSettings(s: YourModuleSettings) { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); }

function dispatch(name: string, detail?: unknown) {
  document.dispatchEvent(new CustomEvent(name, detail !== undefined ? { detail } : undefined));
}

function useModuleState() {
  const [running, setRunning] = useState(false);
  const [status, setStatus]   = useState("");
  const [detected, setDetected] = useState(false);
  const probeRef = useRef<ReturnType<typeof setInterval>|null>(null);

  useEffect(() => {
    const onState = (e: Event) => {
      const d = (e as CustomEvent).detail as YourModuleState;
      setDetected(true);
      setRunning(d.running ?? false);
      setStatus(d.statusText ?? "");
    };
    // Probe until userscript responds (handles mount-before-script race)
    const onReady = () => { setDetected(true); if (probeRef.current) { clearInterval(probeRef.current); probeRef.current = null; } };
    document.addEventListener("xbot:yourmodule:state", onState);
    document.addEventListener("xbot:yourmodule:ready", onReady, { once: true });
    dispatch("xbot:yourmodule:getState");
    probeRef.current = setInterval(() => dispatch("xbot:yourmodule:getState"), 1000);
    const probe = probeRef.current;
    return () => {
      document.removeEventListener("xbot:yourmodule:state", onState);
      document.removeEventListener("xbot:yourmodule:ready", onReady);
      clearInterval(probe);
    };
  }, []);

  return { running, status, detected };
}

export function YourModuleView({ visible, onBack }: { visible: boolean; onBack: () => void }): React.ReactElement {
  const [tab, setTab] = useState<Tab>("main");
  const [settings, setSettings] = useState<YourModuleSettings>(loadSettings);
  const refreshSettings = useCallback(() => setSettings(loadSettings()), []);
  const { running, status, detected } = useModuleState();
  const handleRun = useCallback(() => dispatch("xbot:yourmodule:run"), []);

  const tabBtn = (t: Tab, label: string) => (
    <button
      className={`btn${tab===t?" btn-save btn-save--saved":" btn-ghost"}`}
      style={{ fontSize:11, padding:"5px 0", flex:1 }}
      onClick={() => setTab(t)}>{label}</button>
  );

  return (
    <div className={`cfg-view${visible?" in":""}`} style={{ display:visible?"flex":"none" }}>
      <div className="cfg-header">
        <button className="back-btn" onClick={onBack}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M9 2L4 7l5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <span className="cfg-icon">🔧</span>
        <div className="cfg-header-text">
          <span className="cfg-title">Your Module</span>
          <span className="cfg-subtitle">
            {running ? (status||"running…") : detected ? "ready" : "waiting for userscript…"}
          </span>
        </div>
        {running && <span className="live-pip" style={{ marginLeft:"auto", marginRight:4 }}/>}
      </div>
      <div className="cfg-section" style={{ paddingBottom:0, flexShrink:0 }}>
        <div style={{ display:"flex", gap:3, padding:"8px 14px 0" }}>
          {tabBtn("main","📋 Main")}
          {tabBtn("settings","⚙️ Settings")}
        </div>
      </div>
      {tab==="main"     && <MainTab running={running} status={status} detected={detected} onRun={handleRun}/>}
      {tab==="settings" && <SettingsTab onSaved={refreshSettings}/>}
    </div>
  );
}
```

### Settings pattern (shared between JS and TSX)

Settings are stored in `localStorage` under a module-specific key. Both the userscript and the React panel read/write the same key independently — no sync needed since the userscript calls `loadSettings()` at the start of each run.

**Migration pattern** (JS side):
```javascript
if (typeof s.newField === "undefined") s.newField = defaultValue;
```

**Default pattern** (TSX side):
```typescript
const DEFAULT_SETTINGS = { existingField: value, newField: defaultValue };
// loadSettings spreads defaults first, then stored values — new fields always get defaults
return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
```

---

## Event Bridge Reference (Balancer)

The WH Balancer uses these events as a reference for how to structure the bridge:

| Direction | Event | Payload |
|-----------|-------|---------|
| JS → React | `xbot:balancer:state` | `{ running, statusText, cleanLinks, summary, villageLookup, clusterMap, ppPlans }` |
| JS → React | `xbot:balancer:locks` | `{ coordLocks: [...], ppLocks: [...] }` |
| JS → React | `xbot:balancer:hqResults` | `{ loading?, progress?, total?, skipped?, results?, cached?, ageMin?, error? }` |
| React → JS | `xbot:balancer:run` | — |
| React → JS | `xbot:balancer:send` | `{ src, tgt, wood, stone, iron, idx }` |
| React → JS | `xbot:balancer:hqCheck` | — |
| React → JS | `xbot:balancer:getLocks` | — |
| React → JS | `xbot:balancer:setCoordLock` | `{ coords, wood, stone, iron, comment }` |
| React → JS | `xbot:balancer:clearCoordLock` | `{ coords }` |
| React → JS | `xbot:balancer:clearPpLocks` | — |

**Naming convention:** `xbot:MODULE_NAME:EVENT_NAME`

---

## WH Balancer — Algorithm Summary

For context when building related modules:

### Core flow (`runComputationAndRender`)
1. Fetch `overview_villages&mode=prod` → village stocks, WH capacity, merchants, farm, points
2. Fetch `overview_villages&mode=trader&type=inc` → incoming resources per village
3. Apply per-village reserve subtraction (skip low-pts villages)
4. Filter expired `pendingSends`, subtract from donors, credit to receivers
5. Compute convergent averages (iterative cap loop, order-independent)
6. `computeExcessShortage` → excess/shortage arrays per village per resource (1000-unit granularity)
7. `applyManualCoordLocks` → zero locked resources
8. `applyPpResourceLock` → zero PP-locked resources
9. If `hqPriorityEnabled`: fetch HQ data per village (or use 30min cache) → `applyHqBuildPriority`
10. `assignMerchantsAndBuildLinks` → route resources from donors to receivers
11. `removeCircularRoutes`, `addDistanceToLinks`, `normalizeAndCombineLinks`
12. PP plan builder (Merchant Exchange suggestions)
13. Dispatch state to React panel

### Key algorithm rules
- **Convergent average:** iteratively removes villages that are already above average × `needsMorePercentage` until stable. Prevents order-dependency.
- **Low-points villages** (`< lowPoints`): priority receivers, never donors (unless build queue > `lowPointsLongQueueHours`)
- **High-points/high-farm villages** (`> highPoints` or farm `> highFarm`): donate all but `builtOutPercentage` of WH
- **HQ boost:** villages with empty queue + next building → shortage raised to building cost shortfall; excess capped to `stock - buildingCost`; villages with queue > `hqNormalQueueMaxHours` are skipped from boost
- **pendingSends:** track sent shipments for 2h (or travel time) to prevent duplicate routes on re-run
- **Clusters:** geographic grid partitioning; intra-cluster donors preferred; cross-cluster as fallback

### Data structures
```javascript
// villagesData entry
{ id, name, points, url, wood, stone, iron, warehouseCapacity,
  availableMerchants, totalMerchants, farmSpaceUsed, farmSpaceTotal }

// incomingRes
{ [villageId]: { wood, stone, iron } }

// cleanLinks entry
{ source, target, wood, stone, iron, distance, isHqBoost, isCrossCluster,
  sourceUrl, targetUrl, sourceId, targetId }

// hqData entry (Map<villageId, ...>)
{ villageId, buildingName, buildingId, queueEndsSec,
  costWood, costStone, costIron, prodWoodPerHr, prodStonePerHr, prodIronPerHr }
```

---

## File Structure

```
tw-extension/
├── src/
│   ├── overlay/
│   │   ├── Overlay.tsx          # Main overlay shell, tab/view routing
│   │   ├── overlay-css.ts       # All Shadow DOM CSS (template literal)
│   │   └── views/
│   │       ├── BalancerView.tsx # WH Balancer React panel (~990 lines)
│   │       └── YourView.tsx     # New module React panel
└── modules/
    ├── wh_balancer.user.js      # WH Balancer userscript (~4400 lines)
    └── your_module.user.js      # New module userscript
```

---

## Development Notes

- **Shadow DOM isolation:** React components can't use `window` for cross-world access. All data must flow through `CustomEvent`. Module-level variables (not `window`) are fine for caching within the isolated world.
- **Resource icons:** Use direct CDN URLs — TW CSS class icons don't work inside Shadow DOM. URL pattern: `https://dspt.innogamescdn.com/asset/b2fb8d33/graphic/{holz|lehm|eisen}.png`
- **Sitter mode:** Always check `game_data.player.sitter > 0` and add `t=player.id` param to overview URLs.
- **Rate limiting:** When fetching per-village pages sequentially, add `await new Promise(res => setTimeout(res, 300))` between requests to avoid triggering anti-bot measures.
- **Settings sync:** The userscript calls `loadSettings()` at the start of every `runHeadless()` — it always reads the latest saved values. No need to push settings from React to JS.
- **`whenReady` pattern:** The userscript must wait for `$`, `TribalWars`, `UI`, `Dialog` to be available before doing anything. Poll every 100ms up to 300 tries.
- **`runHeadless` vs `run`:** `runHeadless` is called by the React panel (no jQuery dialog), `run` opens the legacy jQuery dialog. Both reinitialise `state` from scratch and call `runComputationAndRender`. Do NOT carry over stale state fields — only `pendingSends` is preserved across runs.
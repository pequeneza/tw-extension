# TW Suite — Chrome Extension

> Chrome MV3 extension for TribalWars PT automation.
> React + TypeScript popup · 10 userscript modules · Per-module settings via popup.

---

## Quick start

```bash
npm install
npm run build        # → dist/
```

Then in Chrome:
1. Open `chrome://extensions`
2. Enable **Developer mode** (top-right)
3. **Load unpacked** → select `dist/`

---

## Project structure

```
src/
├── manifest.json                  Chrome MV3 manifest
│
├── types/
│   ├── modules.ts                 ModuleId type + MODULE_CONFIGS (10 entries)
│   └── config-schemas.ts         Field definitions + defaults for 8 modules
│
├── lib/
│   ├── storage.ts                 chrome.storage.sync: enable/disable per module
│   └── module-config.ts           chrome.storage.sync: per-module config load/save/reset
│
├── background/
│   └── service-worker.ts         MV3 service worker — install defaults, message bus
│
├── content/
│   ├── router.ts                  Reads storage → exposes window.__TW_SUITE_CFG__
│   │                              → injects matching userscripts
│   └── overlay.entry.tsx          Reserved for future React in-page overlays
│
├── modules/
│   └── tw-suite-config-bridge.js  window.__twSuiteCfg(id) helper,
│                                  prepended to every userscript at build time
│
├── popup/
│   ├── popup.html / popup.tsx     React entry point
│   ├── App.tsx                    Full UI: module list + sliding config panel
│   ├── ConfigPanel.tsx            Renders typed fields for any module's schema
│   ├── useModuleSettings.ts       Hook: enabled/disabled toggle state
│   ├── useModuleConfig.ts         Hook: per-module config values + save/reset
│   └── useActiveTabModules.ts     Hook: which modules fire on the active TW tab
│
└── icons/
    └── icon.svg                   Source SVG icon (castle shield)
    (icon16.png / icon48.png / icon128.png — place real PNGs here before building)

*.user.js                          Original userscripts (patched, copied to dist/modules/)
vite.config.ts                     Build: bundles React, copies scripts + manifest + icons
```

---

## Modules

| # | ID | Label | Match pattern | Has settings |
|---|---|---|---|---|
| 1 | `auto_mint` | Auto Mint | `screen=snob` | ✓ |
| 2 | `extended_profile` | Extended Profile | `screen=info_player` | — |
| 3 | `fakes` | Fake Sender | `screen=place` | ✓ |
| 4 | `mano_de_deus` | Mão de Deus | `screen=place.*try=confirm` | ✓ |
| 5 | `mass_label_delay` | Mass Label Delay | `screen=overview_villages.*mode=incomings` | ✓ |
| 6 | `noble_sender_trainer` | Noble Sender | `screen=snob` (no coin) | ✓ |
| 7 | `renamer_bito` | Renamer (BITO) | incomings or place | — |
| 8 | `resource_buyer` | Resource Buyer | `screen=market.*mode=exchange` | ✓ |
| 9 | `tw_snipe_scheduler` | Snipe Scheduler | `screen=overview\|place` | ✓ |
| 10 | `wh_balancer` | WH Balancer | any TW page | ✓ |

---

## How config flows from popup → userscript

```
Popup ──[chrome.storage.sync]──► Content Router
                                      │
                          window.__TW_SUITE_CFG__ = { fakes: {...}, ... }
                                      │
                          <script src="modules/fakes_user.js">
                                      │
                          window.__twSuiteCfg('fakes')  ← bridge helper
                                      │
                          merges into DEFAULT_CONFIG / DEFAULT_SETTINGS
```

Each patched userscript:
- Calls `window.__twSuiteCfg('module_id')` (returns `{}` if no config saved)
- Merges returned values over its own hardcoded defaults
- Falls back gracefully — the script still works with zero config saved

---

## Adding a new module

1. Add `*.user.js` to the project root.
2. Add an entry to `USERSCRIPT_MAP` in `vite.config.ts`.
3. Add a `ModuleConfig` entry to `MODULE_CONFIGS` in `src/types/modules.ts`.
4. Optionally add a `ModuleConfigSchema` to `src/types/config-schemas.ts`.
5. Optionally read `window.__twSuiteCfg('your_id')` at the top of the script.
6. `npm run build`.

---

## Scripts

| Command | Description |
|---|---|
| `npm run build` | Production build → `dist/` |
| `npm run dev` | Watch build (reload extension after changes) |
| `npm run typecheck` | Type-check without emitting |
| `npm run clean` | Delete `dist/` |

---

## Icons

Place `icon16.png`, `icon48.png`, `icon128.png` in `src/icons/` and rebuild.
If absent, gold 1×1 placeholder PNGs are generated automatically.
The source SVG is at `src/icons/icon.svg`.

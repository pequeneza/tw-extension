---
name: WH Balancer Two-Entry Architecture
description: Documents the old xBalancer button path (dead code) vs new React overlay path in wh_balancer.user.js
type: project
---

wh_balancer.user.js has two entry paths:

OLD PATH (dead for essentially all users):
- `injectLauncherButton()` (line 229) → button click → `window.TM_WH_BALANCER.run()` (line 261/4544)
- `run()` (line 4514) initializes state then calls `showMainDialog()` (line 4540) which renders a TW `Dialog.show()` popup
- `Ctrl+Shift+B` keyboard shortcut (line 30-35) also calls `run()`
- All three are wired in the outer `whenReady()` call at line 26

NEW PATH (React overlay, current standard):
- React BalancerView dispatches `xbot:balancer:run` → `runHeadless()` (line 4082)
- `runHeadless()` initializes state (no `showMainDialog`) then calls `runComputationAndRender()`
- State is sent to React via `document.dispatchEvent(new CustomEvent('xbot:balancer:state', ...))`

**Why:** showMainDialog / run() can be fully removed along with injectLauncherButton(), injectCssOnce(), the keydown listener, and the `run` export in the public API.

Key files: tw-suite-extension/modules/wh_balancer.user.js, src/content/overlay/BalancerView.tsx

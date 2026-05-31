# Snipe Cancel (Recall Trick) — Session Handoff

## What this feature does

A "snipe cancel" (recall trick) snipes a defended village when the attack is **< 20 min away** —
too short for a normal snipe. Instead of sending troops to land in the gap, you:

1. Send a **support** from the defended village to a nearby own village.
2. Cancel it partway through travel.
3. Troops return home. TW rule: **return time = sentAt + 2 × cancelMs** (cancelMs in whole seconds),
   so **return ms = send ms**. The return lands inside the gap between two incoming attacks.

### Key TW timing facts (verified)
- You can only cancel a command **within the first 10 minutes** of sending → trick only works when
  the attack arrives in **< 20 min**.
- `return = sentAt + 2 × round(elapsed/1000)×1000`. Elapsed is rounded to whole seconds, so
  **return ms always equals sentAt ms**. `cancelMs` MUST be whole seconds.
- Travel time uses planeador's formula: `Math.round(distance × BASE_SEC[unit] / (gameSpeed × unitSpeed)) × 1000`
  (round to whole seconds FIRST, then ×1000 — preserves ms).

## Files changed

| File | Role |
|------|------|
| `src/content/overlay/SnipeView.tsx` | Snipe Cancel tab UI (auto-detect dest, troop card, gap candidates) |
| `tw-suite-extension/modules/auto_sender.user.js` | Sends support + **handles cancel phase itself** (no desviador dep) |
| `tw-suite-extension/modules/tw_snipe_scheduler.user.js` | Noble filter removed (detects all attacks) |
| `src/content/overlay/Overlay.tsx` | Trigger timer now uses `getServerNowMs()` to match confirm overlay |

## SnipeView.tsx — "🔄 Snipe Cancel" tab (3rd tab)

- **All-attack detection**: removed `if (!label.includes("nobre"))` filter; added `nobleOnly` toggle
  checkbox (Auto tab only).
- **World speed**: `fetchWorldSpeed()` mirrors planeador's `fetchServerConfig` — `game_data.speed`/
  `unit_speed` first, falls back to `/page/settings`. Fetched once on first open (`speedFetchedRef`),
  shared across all tabs. Defaults now 1.0/1.0.
- **Destination auto-detected**: closest own village (from loaded `troops`) to the defended village.
- **Troop card**: same `snipe-unitbox` grid as Auto tab — icons, available counts, select-all.
- **`computeRecallCandidates()`**: per gap computes `sendMs = midMs − N×1000` where N is the largest
  **even** integer satisfying: cancel window (N ≤ 1180 ≈ 9m50s×2), troops-in-flight (N < 2×tripSec),
  and time-to-gap. Even N → `cancelAfterMs = N/2 × 1000` is whole seconds. `returnMs = midMs` always.
- **`queueGap()`**: recomputes launch at click time with **25s lookahead** (`midMs − N×1000`,
  N from `(midMs − now − 25000)`). Dispatches `CustomEvent("xbot:autosender:run", {action:"addToQueue", entry})`.
  Note = `[SC] Cancelar às HH:MM:SS` (no ms — cancel ms is irrelevant).
- Cancel time in gap cards displays `HH:MM:SS` only.

## auto_sender.user.js — the engine (self-contained, NO desviador dependency)

Module runs on all pages (`matchPattern: /.*/`). Constants:
- `SS_SC_ACTIVE = 'xbot_snipe_cancel_active'` — sessionStorage flag set just before confirm click.
- `SC_PENDING_PFX = 'xbot_snipe_cancel_pending_'` — localStorage cancel state.

### Cross-world bridge
Overlay (isolated world) can't call `window.xbot_addToQueue`. Added `addToQueue` action to the
`xbot:autosender:run` event listener; overlay dispatches CustomEvents.

### Queue entry extra fields
`addToQueue` + watcher `active` object propagate: `cancelAfterMs`, `gapAfterMs`, `gapBeforeMs`, `travelMs`.

### handleConfirmPage (cancel branch)
After the confirm click succeeds, if `cmd.gapAfterMs && cmd.gapBeforeMs`:
- Computes `_cancelMs = max(2000, round((midGap − sentAt) / 2 / 1000) × 1000)` — ALWAYS the
  proper value regardless of ms check.
- Ms check (`_msOk`) only used for the status message colour (green vs amber), NOT to decide
  `_cancelMs`.
- Writes `SC_PENDING_PFX+cancelCmdId` to localStorage + `SS_SC_ACTIVE` flag to sessionStorage
  **BEFORE** anything else, clears `LS_ACTIVE` (so handlePlacePage won't refill).
- **TW redirects naturally to `screen=place` after confirm** — no manual navigate.

### Boot dispatch
On `screen=place` (no `try=confirm`): check `sessionStorage[SS_SC_ACTIVE]`. If set and pending exists →
consume flag, call `handleSnipeCancel(pending)`. Else `handlePlacePage()`.

### handleSnipeCancel(p) — restructured to read actual ms from DOM

Key insight: **do not trust `sentAt % 1000`** — read the actual ms TW recorded for the support
from the DOM. TW shows it as `<span class="grey small">686</span>` inside the time cell.

**Flow:**
1. Show overlay with `A aguardar comando…` while polling for the cancel link.
2. `_initFromDOM(attempt)` polls every 3s, up to 3 retries (9s total).
3. When cancel link found:
   - Find row: `links[0].closest('tr')`
   - Read actual ms: `row.querySelector('span.grey.small').textContent` → `actualMs`
   - **Ms check (wraparound-aware)**:
     ```js
     var _msOk = _gapLo < _gapHi
       ? (actualMs > _gapLo && actualMs <= _gapHi)
       : (actualMs > _gapLo || actualMs <= _gapHi); // handles gaps crossing second boundary
     ```
   - **If ms ok**: rename command (via quickedit-out widget — see below), then compute:
     ```js
     var _sentSec    = Math.floor(p.sentAt / 1000) * 1000;
     var _sentWithMs = _sentSec + actualMs;
     var _cancelMs   = max(2000, round((midGap − _sentWithMs) / 2 / 1000) × 1000);
     cancelAt = _sentWithMs + _cancelMs;  // cancel CLICK time = half-point
     ```
     ⚠️ `cancelAt = sentAt + _cancelMs` (NOT `+ 2 × _cancelMs`). `+ 2×` would give the
     return time, not the cancel click time.
   - **If ms bad**: `_retrying = true`, `cancelAt = Date.now() + 2000` (cancel immediately).
4. Fallback `_applyEstimate()` if link never appears or DOM ms unreadable: uses `p.sentAt`
   estimate. Same `cancelAt = p.sentAt + _est` (NOT `+ 2×`).

### Rename via TW quickedit-out widget
`ajax=label_unit` works for incoming but NOT for outgoing. Outgoing commands use:
```html
<span class="quickedit-out" data-id="...">
  <a class="rename-icon" href="#" data-title="Renomear"></a>
</span>
```
Rename approach:
```js
renameBtn.click();          // opens inline input
setTimeout(function() {
  inp.value = p.note;
  inp.dispatchEvent(new Event('input', { bubbles: true }));
  var confirm = qeSpan.querySelector('a.rename-confirm, a[data-type="confirm"], a.quickedit-btn-confirm');
  if (confirm) confirm.click();
  else inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
}, 400);
```
Only fires when ms is ok (not on retry path).

### doCancel — reload fix + retry ms alignment
- **Reload fix**: before `location.reload()`, re-set `SS_SC_ACTIVE`:
  ```js
  try { sessionStorage.setItem(SS_SC_ACTIVE, p.cmdId); } catch(e) {}
  location.reload();
  ```
- **Retry ms alignment**: when `_retrying && p.retryEntry`, the launch time is adjusted so its
  ms component equals `_gapMid % 1000` — guarantees the retry support is sent at the correct
  ms for the return to land at midGap:
  ```js
  var _rl = _expectedReturn + 10000;
  var _targetMs = _gapMid % 1000;
  _rl += (_targetMs - (_rl % 1000) + 1000) % 1000;  // ms alignment
  var _ncm = round((_gapMid - _rl) / 2 / 1000) × 1000;
  ```
  Since `(_gapMid - _rl)` is now an exact multiple of 1000ms, `_ncm` is exact and
  `_rl + 2×_ncm = _gapMid` precisely.

### Confirmed TW DOM structure (screen=place, outgoing commands)
```html
<tr class="command-row">
  <td>
    <span class="quickedit-out" data-id="CMD_ID">
      <span class="quickedit-content">
        <a href="/game.php?...&id=CMD_ID&type=own">...</a>
        <a class="rename-icon" href="#" data-title="Renomear"></a>
      </span>
    </span>
  </td>
  <td>amanhã às HH:MM:SS:<span class="grey small">686</span></td>
  <td>
    <span data-endtime="...">countdown</span>
    <a class="command-cancel" data-id="CMD_ID" data-home="VILLAGE_ID" href="...?id=CMD_ID&h=CSRF">
      <img ...>
    </a>
  </td>
</tr>
```
Key selectors:
- Cancel link: `a.command-cancel[data-home="VILLAGE_ID"]`
- Actual ms: `row.querySelector('span.grey.small')`
- Rename button: `row.querySelector('a.rename-icon')`
- Quickedit widget: `row.querySelector('span.quickedit-out')`

### Other fix
- `_openTabDelaySec` now always = `lookahead` (deprecated `openTabDelay` was a stale `15` in
  localStorage overriding it). Default 40s.

## Earlier bug fixes still in place (desviador.user.js)
- Double-window guard: `getPending(cmdId)` check before window.open in both `delay≤0` branch and
  fire-timer callback.
- Infinite cancel reload: 3-retry counter + 30s expiry guard in `doScheduleCancel`/`executCancel`.
- desviador still has its own snipe-cancel-ish code but the **active path is now auto_sender**.

## mass_label_renamer.user.js (unrelated earlier fix)
`isSupport()` checks `[data-command-type="support"]` first (Kumin gluer injects an `<img>` that broke
the old `img:eq(0)` check). Support rows skipped on `screen=info_village`.

## Build / test
```
cd tw-extension && npm run typecheck && npm run build
```
Reload extension at chrome://extensions after build. Branch: `feature/snipeCancel`.

## Open / untested
- Rename confirm button selector (`a.rename-confirm`, `a[data-type="confirm"]`, `a.quickedit-btn-confirm`)
  not yet verified live — fallback to Enter keypress. Check console for `Renomeado (quickedit)` vs
  `Renomeado via Enter`.
- End-to-end live test of success path (ms ok → correct cancel timing → troops return at midGap).
- Retry path with ms alignment verified via console logs but not confirmed in-game.

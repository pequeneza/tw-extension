# auto_sender

**File:** `tw-suite-extension/modules/auto_sender.user.js`  
**Version:** 2.0.0  
**Trigger page:** Any `game.php`  
**Re-entry guard:** `window.__twAutoSenderRunning`

## What it does

Precision attack scheduler. Reads a command queue from `localStorage` (`xbot_autosender_queue`) and fires each attack at exactly the right server time. Designed as a self-contained replacement for the Kumin autosender dependency.

## Architecture

```
Queue watcher (every page load)
  ├─ Reads xbot_autosender_queue
  ├─ Picks commands due within _openTabDelaySec seconds
  ├─ Derives server-time offset from #serverDate/#serverTime DOM
  └─ Opens screen=place tab, writes command to sessionStorage

screen=place handler (same script, different branch)
  ├─ Reads xbot_autosender_confirming from sessionStorage
  ├─ Fills unit inputs (spear…snob)
  ├─ Fills target coords in autocomplete input
  └─ Clicks attack button → navigates to confirm page

screen=place?try=confirm handler
  ├─ Busy-waits using performance.now for sub-100ms precision
  ├─ Applies timingOffset + autoTimingOffset (measured ping × multiplier)
  └─ Clicks #troop_confirm_submit at exact computed launch time
```

## Server time

Derives `_serverDateDiff` from `#serverDate` + `#serverTime` DOM elements, same approach as Kumin's `calculateTimezoneDifference()`. For Portugal players (same timezone as server) this is ~0. Falls back to 0 if DOM elements are absent.

`getEffectiveServerNowMs()` = `Date.now() - _serverDateDiff`

## Key functions

| Function | Purpose |
|----------|---------|
| `computeServerDateDiff()` | Parses #serverDate/#serverTime, computes local−server delta. |
| `loadSettings()` | Reads `xbot_autosender_settings` from localStorage. |
| `watchQueue()` | Picks commands due soon and opens place tabs. |
| `handlePlacePage()` | Fills unit inputs + target coord, clicks attack. |
| `handleConfirmPage()` | Busy-waits to click confirm at the exact launch time. |
| `measurePing()` | XHR round-trip to compute network offset (autoTimingOffset). |

## Settings (localStorage `xbot_autosender_settings`)

| Setting | Default | Description |
|---------|---------|-------------|
| `lookahead` | 40 s | Seconds before launch to open the place tab. |
| `openTabDelay` | null | Override for lookahead (seconds). |
| `clickOffset` | 0 ms | Legacy: click earlier by N ms. |
| `timingOffset` | 0 ms | Static offset (positive = click later, compensates network). |
| `autoTimingOffset` | false | Measure round-trip ping and apply as offset. |
| `timingOffsetMultiplier` | 0.25 | Multiply measured ping (matches Kumin default). |
| `autoSendNobles` | true | Auto-expand noble train on confirm page. |
| `autoClose` | true | Close place tab after confirm. |

## Queue entry format (localStorage `xbot_autosender_queue`)

```json
{
  "id": "unique-string",
  "src": { "villageId": 12345, "x": 491, "y": 592 },
  "tgt": { "x": 493, "y": 591 },
  "launch": 1716000000000,
  "arrival": 1716003600000,
  "units": { "axe": 100, "spy": 10 },
  "ntTemplate": null,
  "sigilPct": 0,
  "leaveHome": false
}
```

## localStorage / sessionStorage keys

| Key | Type | Purpose |
|-----|------|---------|
| `xbot_autosender_queue` | localStorage | JSON array of pending command objects. |
| `xbot_autosender_active` | localStorage | Master on/off switch. |
| `xbot_autosender_settings` | localStorage | User settings (see table above). |
| `xbot_autosender_confirming` | sessionStorage | Command being confirmed (per-tab, not shared). |
| `xbot_autosender_paused` | sessionStorage | Pause flag (per-tab). |

## Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `CMD_TTL` | 90 000 ms | Command is considered stale after this time post-launch. |
| `UNIT_IDS` | 12 unit names | All TribalWars unit types the script can fill. |

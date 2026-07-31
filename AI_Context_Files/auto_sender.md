# auto_sender

**File:** `tw-suite-extension/modules/auto_sender.user.js`  
**Version:** 2.1.0  
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

## Noble Train (NT) support

Contrary to earlier versions, this module **does** fill noble-train unit counts on the confirm page — it isn't limited to plain attacks/support.

- `NT_COUNT` (`auto_sender.user.js:28-36`) maps each Kumin NT template key (`noNT`, `twoNoblesSame`, `secondNobleWithRest`, `firstNobleRedNT`, etc. — noble counts taken directly from Kumin's `ntTemplates` object) to the number of nobles it expands to.
- `startNT(cmd)` (line ~699, comment: "mirrors Kumin's startNT") — entry point on the confirm page; runs when `cmd.ntTemplate` is set or the `autoSendNobles` setting is on, and schedules `fillNT(nt)` ~1.2s later.
- `fillNT(nt)` (line ~740) — fills the actual noble-count input(s) for the resolved NT template.
- `cmd.catapultTarget`, when set, selects the catapult building target on the confirm page before the NT/attack fields are filled.

## Snipe-cancel / gap-retry

`cancelAfterMs`, `gapAfterMs`, and `gapBeforeMs` on a queue entry drive a recall/gap-retry flow (session keys `xbot_snipe_cancel_active` / `xbot_snipe_cancel_pending_*`) that can cancel a sent command and re-queue a retry aimed at the midpoint of a noble-train gap. This is the same feature documented in full in `snipe_cancel_session.md` — see that file for the mechanism; this doc only lists the fields so the queue-entry schema above isn't misleading about what they're for.

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

`addToQueue()` (`auto_sender.user.js:221-243`) normalizes entries to this shape:

```json
{
  "id": "unique-string",
  "src": "491|592",
  "tgt": "493|591",
  "srcVillageId": 12345,
  "tgtVillageId": 67890,
  "type": "attack",
  "launch": 1716000000000,
  "arrival": 1716003600000,
  "units": { "axe": 100, "spy": 10 },
  "note": "",
  "catapultTarget": null,
  "ntTemplate": null,
  "sigilPct": 0,
  "randomOffset": null,
  "randomOffsetTime": null,
  "cancelAfterMs": null,
  "gapAfterMs": null,
  "gapBeforeMs": null,
  "travelMs": null,
  "status": "pending",
  "createdAt": 1716000000000
}
```

| Field | Description |
|-------|-------------|
| `type` | `"attack"` or `"support"` (lower-cased, defaults to `"attack"`). |
| `catapultTarget` | Building target for catapult fire, if set. |
| `ntTemplate` | Kumin noble-train template key (see NT support below) — `null` disables NT expansion for this entry. |
| `randomOffset` / `randomOffsetTime` | Optional randomized-arrival jitter fields. |
| `cancelAfterMs` / `gapAfterMs` / `gapBeforeMs` / `travelMs` | Snipe-cancel/gap-retry fields — see "Snipe-cancel / gap-retry" below. |
| `status` | `"pending"` until the command is sent or cancelled. |

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

---

## ⚠ Timing contract — DO NOT MODIFY

The confirm-page flow in `handleConfirmPage()` mirrors Kumin's `setupAttack → prepareToSend` exactly. **Do not change any of the following without first reviewing the Kumin source:**

| Element | Value | Kumin equivalent |
|---------|-------|-----------------|
| Pre-scheduling delay | **3000 ms** `setTimeout` before `scheduleClickAtMs` | `setTimeout(prepareToSend, 3000)` in `setupAttack` |
| Ping start timing | Inside the 3000 ms delay | `_0x1e1de0.start()` inside `prepareToSend` |
| Coarse-wait formula | `targetMs - getEffectiveServerNowMs() - 2000` | `launchMs - (Timing.getCurrentServerTime() - serverDateDiff) - 2000` |
| Fine-phase formula | `remaining = targetMs + offset - getEffectiveServerNowMs()` | `remaining = launchMs + timingOffset - (Timing.getCurrentServerTime() - serverDateDiff)` |
| Busy-wait mechanism | `performance.now()` spin loop | `while (performance.now() - perfStart < remaining) {}` |
| Server clock reference | `Timing.getCurrentServerTime() - _serverDateDiff` | `Timing.getCurrentServerTime() - serverDateDiff` |

These values are **not arbitrary**. They encode timing behaviour validated against Kumin over multiple releases. Changing the 3000 ms constant, the busy-wait approach, or the server-time formula will break precision firing.

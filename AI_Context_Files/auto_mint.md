# auto_mint

**File:** `tw-suite-extension/modules/auto_mint.user.js`  
**Version:** 1.3.0  
**Trigger page:** `screen=snob` (any noble page with a Cunhar/mint button; NOT coin mode)  
**Re-entry guard:** `window.__twAutoMintRunning`

## What it does

Automatically mints coins (noble prerequisite) as soon as the mint button becomes available. On each cycle it:

1. Clicks `#coin_mint_fill_max` to fill the maximum quantity.
2. After 500 ms looks for `input[type="submit"][value="Cunhar"]`.
3. If the button exists and is not disabled → clicks it.
4. If the button is missing or disabled (cooldown / no resources) → arms a page-refresh timer so the page reloads after the cooldown ends.
5. Repeats every **45 seconds**.

## Key functions

| Function | Purpose |
|----------|---------|
| `ensureUI()` | Creates/returns the fixed overlay panel. |
| `setUI({status, lastCheck, nextInMs, autoRefreshText})` | Updates the overlay display. |
| `mintCoins(manual)` | Main mint attempt: fill → click → schedule next. |
| `findMintButtonStrict()` | Returns the Cunhar submit button or `null`. |
| `safeRefresh(reason)` | Reloads the page, rate-limited by `MIN_REFRESH_GAP_MS`. |
| `armRefreshBecauseMintMissing()` | Schedules a page reload in 10 s if no mint button. |
| `scheduleNext(msFromNow)` | Persists next run timestamp to localStorage. |
| `startTicker()` | Runs every 250 ms to update the countdown display. |
| `stopAll()` | Clears all timers; called by the Stop button. |
| `init()` | Entry point: restores next-run from localStorage, starts ticker + interval. |

## UI (fixed top-right panel)

- **Next check in** — countdown MM:SS.
- **Last check** — timestamp of last attempt.
- **Status** — current state (`idle`, `minting…`, `mint disabled (cooldown/resources)`, `mint button not visible`, `stopped`).
- **Auto-refresh** — `armed` / `will refresh in Ns` / `off`.
- Buttons: **Run now**, **Refresh**, **Stop**.

## localStorage keys

| Key | Purpose |
|-----|---------|
| `tw_auto_mint_next_run_at` | Timestamp (ms) of next scheduled run — survives page reload. |
| `tw_auto_mint_last_refresh_at` | Timestamp of last page refresh — enforces 60 s minimum gap between reloads. |

## Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `INTERVAL` | 45 000 ms | Interval between automatic mint attempts. |
| `MINT_CLICK_DELAY` | 500 ms | Delay between fill-max click and mint click. |
| `REFRESH_ON_MISSING_AFTER_MS` | 10 000 ms | Delay before auto-refresh when mint button is absent. |
| `MIN_REFRESH_GAP_MS` | 60 000 ms | Minimum time between page reloads. |

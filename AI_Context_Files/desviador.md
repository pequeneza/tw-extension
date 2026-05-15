# desviador

**File:** `tw-suite-extension/modules/desviador.user.js`  
**Version:** 3.0.0  
**Trigger page:** Any `game.php`  
**Re-entry guard:** `window.__twDesviadorRunning`

## What it does

**Desviador** ("dodger") schedules automatic troop retreats from incoming attacks. The user selects an incoming on the incomings overview, sets how many seconds before the attack to cancel, and the script opens a rally-point tab at exactly the right moment and auto-submits the retreat.

## Page branches

| Page condition | Behaviour |
|---------------|-----------|
| `screen=overview_villages&mode=incomings&subtype=attacks` | Shows schedule/cancel controls next to each incoming row. Writes `PENDING_PREFIX + cmdId` to localStorage. |
| `screen=place` (not confirm, `?__desv=<cmdId>`) | Fills the rally-point form (retreat all troops to a safe village) and submits. |
| `screen=place&try=confirm` (same tab) | Auto-confirms the retreat at the scheduled fire time. |

## Isolation model

Each concurrent dodge tab is isolated by a per-command `cmdId`:

- `sessionStorage twDesviador_tabCmdId` — bound to a specific `cmdId` for the lifetime of that browser tab.
- `localStorage twDesviador_pending_<cmdId>` — state shared between the incomings page and the retreat tab.
- Two concurrent tabs processing different commands never share state.

## Key functions

| Function | Purpose |
|----------|---------|
| `whenReady(cb)` | Polls until `$` and `TribalWars` are available, then calls `cb`. |
| `getPending(cmdId)` | Reads `localStorage twDesviador_pending_<cmdId>`. |
| `setPending(data)` | Writes pending state keyed by `data.cmdId`. |
| `clearPending(cmdId)` | Removes the pending entry after completion. |
| `resolveTabCmdId()` | Reads/writes `sessionStorage TAB_CMD_KEY` to bind this tab to a cmdId. |

## localStorage keys

| Key | Purpose |
|-----|---------|
| `twDesviador_pending_<cmdId>` | Pending state for that specific command (target coords, timing, units). |
| `twDesviador_sched_<cmdId>` | Scheduled fire timestamp (ms) for that command. |
| `twDesviador_active` | Global on/off switch. |
| `twDesviador_cancelSec` | Seconds before the attack to cancel (user-configurable). |
| `twDesviador_alertSec` | Seconds before action to show a visual alert. |
| `twDesviador_lastCancel` | Cross-tab cancel signal (broadcast). |

## sessionStorage keys

| Key | Purpose |
|-----|---------|
| `twDesviador_tabCmdId` | Binds this browser tab to a specific `cmdId`. |

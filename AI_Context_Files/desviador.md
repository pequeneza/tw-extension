# desviador

**File:** `tw-suite-extension/modules/desviador.user.js`
**Version:** 3.5.0
**Trigger page:** Any `game.php`
**Re-entry guard:** `window.__twDesviadorRunning`

## What it does

**Desviador** ("dodger") auto-schedules troop retreats ("support-swap") from incoming attacks. On the incomings overview it scans rows for a `[Desviar]`-tagged quickedit label (configurable via blacklist/whitelist), computes each attack's arrival time, and — ~35–40s before arrival — opens a background rally-point tab that sends a support command to another own village, then cancels that support just before it would land, effectively emptying the attacked village's garrison and refilling it right after the hit.

## Page branches

| Page condition | Behaviour |
|---|---|
| `screen=overview_villages&mode=incomings&subtype=attacks` | Scans rows, schedules fires, renders React state (`initIncomings`). |
| `screen=place` (no `try` param) | Send phase: picks the "Desviar" troop template, selects a target own-village, submits support (`doSendSupport` → `tryOwnVillage` → `proceedWithTarget`). Then cancel phase: shows a countdown overlay and clicks the cancel link at the right moment (`doScheduleCancel`). |
| `screen=place&try=confirm` | Confirms the support submission (`handleConfirm`), then hands off to the cancel phase. |

## Isolation model

Each concurrent dodge tab is isolated by a per-command `cmdId`:

- `sessionStorage twDesviador_tabCmdId` — bound to a specific `cmdId` for the lifetime of that browser tab, resolved once via `resolveTabCmdId()`.
- `sessionStorage twDesviador_pendingHandoff` — one-shot `{cmdId, ts}` payload, set right before `window.open()` so the newly opened tab (which inherits the opener's sessionStorage, same-origin only) can recover its `cmdId` before it has a `TAB_CMD_KEY` of its own. TTL 30s (`HANDOFF_TTL_MS`).
- `localStorage twDesviador_pending_<cmdId>` — state shared between the incomings page and the place/confirm tab for that command.
- Two concurrent tabs processing different commands never share state.

Newly opened place tabs are pinned + unfocused via the background service worker: `openPlaceTab()` dispatches `xbot:tabs:armNextTab`, waits for the ack (`xbot:tabs:armed`) from `router.ts`, then calls `window.open()` (200ms fallback if the ack never arrives, in which case the tab opens focused/unpinned).

## Tag filtering

- `twDesviador_blacklist` (default `"[Desviar]"`) — comma-separated tags; a quickedit label must contain at least one to be acted on, unless `allCommands` is set.
- `twDesviador_whitelist` (default `""`) — comma-separated tags; a label containing any of these is skipped entirely, even if `allCommands` is set.
- `twDesviador_allCommands` — `"1"` ignores the blacklist requirement (still respects the whitelist).

## Dedup / rate-limiting (per `scanAndSchedule` pass)

1. Rows are grouped by destination village (`destVillage`). Multiple attacks landing on the same village within one cancel window only need one support — later ones are skipped if an already-scheduled entry's cancel window (`fireAt + cancelMs`) still covers their arrival.
2. Each new entry's natural fire time = `arrivalMs - 35s - random(0,5s)`.
3. A rate limiter caps popup-tab bursts at 8 fires per rolling 45s window (`RATE_WINDOW_MS` / `MAX_PER_WINDOW`): entries are walked latest-first, and any that would exceed the cap in their natural window get pulled backward into an earlier window, extending their `cancelMs` by the same amount so the cancel still lands after the attack's arrival. Entries pulled back to within 30s of arrival (`CANCEL_SAFETY_MS`) are dropped instead — not enough time to fill and submit the form.

`recoverMissedFires()` runs on every non-place/confirm page load and just **deletes** stale/expired `SCHED_PREFIX` entries (past `arrivalMs` or `fireAt`). It intentionally does not re-fire missed schedules — an earlier version that treated any past-due entry as "missed" and re-opened a tab for it caused dozens of tabs to fire in a single burst when a backlog piled up.

## Recall trick (cancel timing)

TribalWars computes the support's return time as `sentAt + 2*cancelMs` (whole seconds). Since `return % 1000 === sentAt % 1000`, `doScheduleCancel` checks whether `sentAt`'s millisecond remainder falls inside a configured gap window (`p.gapAfterMs`/`p.gapBeforeMs`, if the caller supplied them). If it's outside the window, it cancels early (~2s) and — if `p.retryEntry` and a global `window.xbot_addToQueue` are present — re-queues the command to try again at the midpoint of the gap, computing a new whole-second `cancelMs` so the retry's ms-alignment works out.

## Auto-rename on send

If `p.note` is set, once the outgoing command appears in the village's command list, `doScheduleCancel` renames it via `POST screen=place&ajax=label_unit` (retries up to 8× at 1s intervals while the row isn't visible yet).

## Alerts & feedback

- `playBeep()` — 3-tone oscillator beep, unless `twDesviador_muteSound` is `"1"`.
- Browser `Notification` — requested on first start or via the UI's notification badge; fired `alertSec` before each scheduled send.
- `xbot:desviador:canceled` — broadcast cross-tab via a `storage` event on `twDesviador_lastCancel` (the place tab writes it, the incomings tab's `storage` listener re-dispatches it as a CustomEvent for the React toast).
- `twDesviador_history` — last 50 fired commands (48h expiry), shown in the UI's history panel.
- Document title shows a live countdown to the next fire while active (`updateTitle`), and `⛔ NÃO FECHAR — <countdown>` on the cancel-wait dialog.

## Key functions

| Function | Purpose |
|---|---|
| `whenReady(cb)` | Polls until `$` and `TribalWars` are available, then calls `cb`. |
| `getPending(cmdId)` / `setPending(data)` / `clearPending(cmdId)` | Read/write/remove `localStorage twDesviador_pending_<cmdId>`. |
| `resolveTabCmdId()` | Reads/writes `sessionStorage TAB_CMD_KEY`, recovering from `HANDOFF_KEY` on a fresh tab. |
| `openPlaceTab(destVillage, cmdId)` | Hands off `cmdId` via sessionStorage, arms tab pin/unfocus, then `window.open()`s the place screen. |
| `scanAndSchedule()` | Main incomings-page loop: scans rows, dedups by destination, rate-limits, schedules timers. Re-runs itself every ~15s (jittered). |
| `doSendSupport(p)` / `tryOwnVillage(p, tried)` / `proceedWithTarget(pick, p, tried)` | Send phase: pick template, iterate own-village popup rows (closest-first) until one isn't "Alvo inválido", submit. |
| `handleConfirm()` | Confirms the support at `try=confirm`, transitions pending state to `phase: 'cancel'` with `sentAt`. |
| `doScheduleCancel(p)` | Cancel-phase countdown overlay + recall-trick check + cancel-link click + optional retry re-queue. |
| `jitter(baseMs, spreadMs)` | Adds random spread to fixed UI-automation delays so timing isn't mechanically identical run-to-run. Not used for the recall trick's `sentAt`-derived math, which needs ms-level fidelity. |

## localStorage keys

| Key | Purpose |
|---|---|
| `twDesviador_pending_<cmdId>` | Pending state for that specific command (phase, target village, timing, units, retry data). |
| `twDesviador_sched_<cmdId>` | Scheduled fire timestamp (ms) for that command. |
| `twDesviador_active` | Global on/off switch. |
| `twDesviador_cancelSec` | Seconds before the attack to cancel the support (user-configurable, 60–600). |
| `twDesviador_alertSec` | Seconds before firing to show a visual/audio alert (user-configurable, 5–300). |
| `twDesviador_lastCancel` | Cross-tab cancel signal (broadcast via `storage` event). |
| `twDesviador_muteSound` | `"1"` mutes the alert beep. |
| `twDesviador_allCommands` | `"1"` ignores the blacklist tag filter (whitelist still applies). |
| `twDesviador_blacklist` | Comma-separated tags that trigger a dodge (default `[Desviar]`). |
| `twDesviador_whitelist` | Comma-separated tags that block a dodge even if blacklisted/allCommands. |
| `twDesviador_history` | Last 50 fired commands, 48h expiry. |

## sessionStorage keys

| Key | Purpose |
|---|---|
| `twDesviador_tabCmdId` | Binds this browser tab to a specific `cmdId`. |
| `twDesviador_pendingHandoff` | One-shot `{cmdId, ts}` carried into a freshly opened place tab (30s TTL). |

## React panel (`DesviadorView.tsx`)

Two-way bridge with the userscript via CustomEvents, matching the keys/events above 1:1:

| Direction | Event | Payload |
|---|---|---|
| Userscript → React | `xbot:desviador:state` | `{ active, scheduled[], notifPermission, muted, allCommands, blacklist, whitelist }` |
| Userscript → React | `xbot:desviador:canceled` | `{ village, ts }` — drives the toast |
| React → Userscript | `xbot:desviador:cmd` | `{ type: "start" \| "stop" \| "requestNotif" \| "toggleMute" \| "setAllCommands" \| "setBlacklist" \| "setWhitelist", value? }` |

Notes on the panel:
- `cancelSec`/`alertSec` are read/written directly to `localStorage` by the view (no round trip through the userscript); their number inputs use separate draft state so the user can freely retype a value below the min without the field snapping back mid-keystroke — clamping (60–600 / 5–300) happens on blur/Enter, not on every keystroke.
- Blacklist/whitelist/mute/allCommands/start/stop instead go through `xbot:desviador:cmd`, which is only listened for inside `initIncomings()` — i.e. **only while on the incomings page**. Off that page the panel shows a "Navega para os ataques recebidos…" warning in the config panel, but the Start/Stop button itself isn't disabled, so pressing it elsewhere silently does nothing.
- Tag chips (`TagInput`) commit on Enter, comma, or blur; Backspace on an empty draft pops the last tag.

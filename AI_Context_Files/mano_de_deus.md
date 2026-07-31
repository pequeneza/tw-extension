# mano_de_deus

**File:** `tw-suite-extension/modules/mano_de_deus.user.js`  
**Version:** 2.4.2  
**Trigger page:** `screen=place&try=confirm`  
**Re-entry guard:** None (page-specific; only one confirm page at a time)

## What it does

**Precision attack scheduler** for the confirm page. After the user sets an arrival datetime and clicks "Confirmar (agendado)", the script fires `#troop_confirm_submit` at exactly the right server time to achieve the desired arrival.

## Timer architecture (coarse + fine hybrid)

```
scheduleClickAtServerMs(targetServerMs, fineOffsetMs, clickFn)
  │
  ├─ Coarse phase
  │    setTimeout(finePhase, diff - 1500ms)  [or 4500ms if tab hidden]
  │
  └─ Fine phase (starts ~1.5s before target)
       ├─ Freeze DOM: stop status updates + banner countdown
       ├─ Timing.resetTickHandlers()  — stop TW's own JS tickers
       ├─ setInterval(10ms) until diff ≤ 400ms
       └─ requestAnimationFrame loop until diff ≤ 0 → doClick()
```

### Why DOM freeze matters

DOM writes (status text, banner countdown) trigger style recalculation and reflow, stealing 5–20 ms from the JS thread at the worst moment. All DOM updates are stopped before the fine phase begins.

## Latency compensation formula

```
target = arrivalMs - durationMs + fineOffsetMs - (twLatencyMs × latencyMultiplier)
```

- `twLatencyMs` — from `window.Timing.getEstimatedLatency()` (TW's own WebSocket latency estimate).
- `latencyMultiplier` — user-configurable (default 0.25, matches Kumin's default).
- `fineOffsetMs` — manual calibration field.
- `durationMs` — parsed from the "Duração:" cell in `#command-data-form`.

## UI injected into `#command-data-form`

| Control | Description |
|---------|-------------|
| **Chegada** `<input type="datetime-local" step="0.001">` | Target arrival time. Pre-filled with `serverNow + travelDuration`. |
| **Offset (ms)** | Manual fine offset. Persisted in `localStorage CS.offsetFineMs`. |
| **Multiplicador latência** | 0–2. Default 0.25. Persisted. |
| **Alerta** checkboxes | Som / Flash (aba+ícone) / Notificação. |
| **T- N ms** | How many ms before target to fire the alert. |
| **Testar alerta** button | Fires the alert immediately (also unlocks Web Audio). |
| **Confirmar (agendado)** button | Arms the scheduled click. |
| **Status** div | Live countdown `enviar às HH:MM:SS.mmm | T-agora: MM:SS.mmm`. |

## Alert system (fires once at T - alertLeadMs)

1. **Sound**: 4 beeps via Web Audio API (880 → 880 → 988 → 1175 Hz). Requires prior user interaction to unlock audio context — the **Testar alerta** button performs that unlock.
2. **Tab/favicon flash**: alternates tab title and favicon colour at 400 ms interval.
3. **Desktop notification**: `new Notification(...)` — requests permission if not yet granted.
4. **Banner**: red fixed banner `#CS_send_banner` with live countdown.

## Key functions

| Function | Purpose |
|----------|---------|
| `parseDurationToMs(text)` | Parses "HH:MM:SS" duration string to milliseconds. |
| `readDurationMsFromForm()` | Finds "Duração:" label in form, delegates to `parseDurationToMs`. |
| `getServerNowMs()` | Returns `Timing.getCurrentServerTime()` or `Date.now() + storedOffset`. |
| `updateServerOffsetEstimate()` | Refreshes stored server–client delta. |
| `scheduleClickAtServerMs(target, offset, clickFn, statusEl, attentionCfg)` | Main scheduler — coarse+fine timer. Returns `stopAll()`. |
| `csScheduleAlert(target, leadMs, sound, flash, notify)` | Arms the alert; returns `freeze()` fn. |
| `csBeep(freq, ms, vol)` | Plays a single tone via Web Audio API. |
| `boot()` | Entry point: reads duration, calls `injectOrUpgradeUI`. |

## localStorage keys

| Key | Default | Description |
|-----|---------|-------------|
| `CS.offsetFineMs` | 0 | Manual fine offset (ms). |
| `CS.latencyMultiplier` | 0.25 | Latency compensation multiplier. |
| `CS.serverOffsetMs` | 0 | Computed server–client clock delta (ms). |
| `CS.alertLeadMs` | 10 000 | Alert lead time before target (ms). |
| `CS.alertSoundEnabled` | true | Play beep sequence. |
| `CS.alertFlashEnabled` | true | Flash tab title + favicon. |
| `CS.alertNotifyEnabled` | true | Desktop notification. |
| `CS.audioUnlocked` | false | Whether Web Audio context was unlocked via user click. |

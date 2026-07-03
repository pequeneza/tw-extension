# microapoios_enhanced

**File:** `microapoios_enhanced.user.js` (standalone Tampermonkey script, not in the extension module map)  
**Version:** 2.0.7 (enhanced)  
**Trigger pages:**
- `screen=place&mode=call` (mass support page — main UI)
- `screen=place&try=confirm` (confirm page — auto-clicks confirm if batch is running)

**Re-entry guard:** `window.__mapoiosRunning`

---

## What it does

**Support Sender** — sends support troops from multiple owned villages to one or more target coordinates. Two modes:

- **Manual** — user sets quantities in the "Enviar" row, clicks "Preencher" to distribute across villages, then submits manually.
- **Batch** — user adds a list of target coordinates, selects a template, and the script automatically navigates to each target, fills troops, and submits in sequence across page reloads.

---

## Page detection

```js
const isMassPage = _p.get('screen') === 'place' && _p.get('mode') === 'call' && !_p.get('try');
const isConfirm  = _p.get('screen') === 'place' && _p.get('try') === 'confirm';
```

Detection is order-independent via `URLSearchParams`. If neither condition is true the script exits immediately.

---

## localStorage keys (all world-scoped via `W = game_data.world`)

| Key | Content |
|-----|---------|
| `W + '_mapoios_batch_v1'` | Running batch state object (see Batch State below) |
| `W + '_mapoios_templates_v1'` | `{ name: { unit: kAmount, ... }, ... }` — named templates |
| `W + 'support_sender_settings2'` | `[[checkboxValues], [inputValues]]` — saved UI state of the Tropas tab |
| `W + '_mapoios_group'` | Last used group ID string |
| `W + '_mapoios_pop_v1'` | `{ unit: popWeight }` — configurable pop cost per unit |
| `W + '_mapoios_unitsel_v1'` | `{ unit: bool }` — which units are enabled for sending |
| `supportSenderTheme` | Theme map (not world-scoped) |
| `W + 'speedWorld'` | `{ worldSpeed, unitSpeed }` — cached from `/interface.php?func=get_config` |

---

## Batch state machine

The batch runs across page reloads by persisting state to `W + '_mapoios_batch_v1'`:

```js
{
  running:   bool,
  finished:  bool,
  state:     'selecting' | 'filling',
  targets:   ['491|643', '494|643', ...],
  index:     number,          // next target to process
  template:  { unit: kAmount },
  group:     string,
  delay:     ms,
  totalSent: { unit: totalTroops },  // accumulated across all sends
  log:       ['HH:MM:SS — message', ...]  // persisted log lines
}
```

### State transitions

```
Page load (state='selecting')
  └─ runBatchHandler → navigateToTarget(targets[index])
       ├─ Already on right coord? → set state='filling', autoFillAndSend()
       ├─ Autocomplete found     → set state='filling', click item
       │    └─ page reloads OR fallback fires at 2.5s → autoFillAndSend()
       └─ Autocomplete timeout   → _urlNavigate() [sets state='filling' first]

Page load (state='filling')
  └─ runBatchHandler → autoFillAndSend() after 2s
       └─ inner timeout (1.5s):
            re-read fresh batch from localStorage (guard vs double-exec)
            → log entry saved to batch.log + DOM
            → increment index, set state='selecting'
            → setBatch(), click submit
            → page reloads → next iteration

Page load (state='selecting', batch.running=false)
  └─ runBatchHandler returns early
```

### Key guards

- `_urlNavigate(coord, group, batch)` — sets `batch.state = 'filling'` and saves **before** navigating, so the new page goes straight to fill mode and doesn't re-run autocomplete for the same coord.
- `navigateToTarget` — checks `getCurrentTargetCoord()` at entry; if it already matches the requested coord, skips clearing/re-navigating and calls `autoFillAndSend` directly.
- `autoFillAndSend` inner timeout — re-reads `getBatch()` from localStorage and bails if `state !== 'filling'`, preventing stale-closure double-execution.

---

## autoFillAndSend

```
1. Verify template is non-empty
2. Click #place_call_select_all
3. Zero all #village_troup_list input[type=number]
4. For each row in #village_troup_list tbody:
     amount = Math.round(parseFloat(tpl[unit]) * 1000)   // k → actual
     avail  = parseInt(availEl.textContent.replace(/\D/g,''))
     input.value = Math.min(amount, avail)
5. Collect sentTotals from filled inputs (for logging)
6. setTimeout 1.5s:
     re-read fresh batch (guard)
     find submit button (4 selector fallbacks)
     log '[index/total] coord → unit:N | unit:N'
     accumulate batch.totalSent
     index++, state='selecting'
     setBatch, click submit
```

Template values are stored in **thousands** (e.g. `0.1` = 100 troops). `Math.round(parseFloat(...) * 1000)` handles fractional values correctly.

---

## Unit selection

A **"Usar"** checkbox row sits above the "Total" row in the Tropas tab. Each checkbox:
- Controls whether its column's "Enviar" input is enabled/editable
- Excludes disabled units from `getTemplateFromSendRow()` (and thus from saved templates and batch sends)
- State persisted per world in `W + '_mapoios_unitsel_v1'`

---

## Pop weights

A collapsible **"⚙ Pesos de Pop"** row (toggled by a button between "Reserva" and the time-window row) lets the user set a pop cost per unit.

Defaults: all units = 1, heavy = 4, catapult = 2.  
Stored in `W + '_mapoios_pop_v1'`. Used in:
- `countTotalTroops` → `packets_total` field
- `addEvents` → `packets_send` live update when editing the "Enviar" row

---

## Template system

- **Save** — reads "Enviar" row values (respects unit selection), saves as `{ unit: kAmount }` under a user-supplied name.
- **Load** — writes values back to "Enviar" inputs and calls `countTotalTroops`.
- **Preview** — shown below the select as `name: unit:Nk | unit:Nk`.
- Both `#tmpl_select` (Templates tab) and `#batch_tmpl` (Batch tab) are refreshed together.

Fractional amounts (e.g. `0.1`) are handled throughout with `parseFloat` (not `parseInt`).

---

## Chip coordinate input

Batch target coordinates are entered in a custom chip-input widget (`createChipInput`):
- Type a coord and press **Enter** or **,** to add a chip; **Backspace** on empty field removes the last chip.
- **Paste** support: splits clipboard text on `\n`, `\r`, or `,`, validates each against `/^\d+\|\d+$/`, silently skips invalids, adds all valid coords as chips in one operation.

---

## Batch log persistence

`logBatch(msg)` writes each line both to the DOM (`#batch_log`) and to `batch.log[]` in localStorage. On every page reload during a running batch, `initBatchTab` reads `batch.log` and re-renders the full history, so the user sees the complete log from batch start through the current target.

---

## Confirm-page handler

```js
if (isConfirm) {
    var _cb = getBatch();
    if (_cb && _cb.running) {
        setTimeout(() => {
            var btn = document.querySelector('#place_call_form_submit, .btn-confirm-yes, input[value="Enviar apoio"]');
            if (btn) btn.click();
        }, 1500);
    }
    return;  // no UI built on confirm page
}
```

---

## Known DOM selectors (mass support page)

| Element | Selector |
|---------|----------|
| Select-all checkbox | `#place_call_select_all` |
| Village rows | `#village_troup_list tbody tr` |
| Unit available count | `[data-unit='UNIT']` inside row |
| Unit fill input | `.call-unit-box-UNIT` inside row |
| Submit button | `#place_call_form_submit` (primary), then 3 fallbacks |
| Autocomplete input | `input.target-input-field`, `.target-input-autocomplete`, `.ui-autocomplete-input` |
| Autocomplete result | `.target-select-autocomplete .village-item` |
| Current target label | `.village-name`, `#target_name` |
| Delete target button | `img.village-delete` |
| Coord inputs (mobile) | `#inputx`, `#inputy` |

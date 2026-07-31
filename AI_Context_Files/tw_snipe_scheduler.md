# tw_snipe_scheduler

**File:** `tw-suite-extension/modules/tw_snipe_scheduler.user.js`  
**Version:** 1.7.1  
**Trigger page:** `screen=place*` on `pt111.tribalwars.com.pt` only  
**Re-entry guard:** None — checks `window.jQuery` is present, then runs only when the `screen` query param is `place`

## What it does

**Place-page automator for the Gap Snipe Planner.** This module no longer contains any gap-detection, travel-time, or auto/manual scheduling logic itself — all of that now lives in `src/content/overlay/SnipeView.tsx`, which computes the plan and writes it to `localStorage`. This file's only job is to read that plan on `screen=place` and finish the send:

1. If `#CStime` is present on the page (the noble-train confirm screen), write `midGapArrivalMs` into it and click "Confirmar" (`fillCStimeAndConfirm`).
2. Otherwise, fill the target coordinate field (`fillTargetOnPlace`) and unit amount fields (`fillUnitsOnPlace`), then click the support submit button (`submitSupportOnPlace`) after a short jittered delay.

> For the actual gap-midpoint computation, travel-time/speed formulas, and Auto/Manual mode selection, see `SnipeView.tsx` — none of that lives in this userscript anymore.

## Key functions

| Function | Purpose |
|----------|---------|
| `loadPlan()` | Reads and validates the plan from `localStorage` (`tw_gap_snipe_plan_v12`); discards it if older than the 5 min TTL. |
| `clearPlan()` | Deletes the plan from `localStorage`. |
| `fillTargetOnPlace(plan)` | Writes target coords into `input.target-input-field`. |
| `fillUnitsOnPlace(plan)` | Zeroes all `input.unitsInput` fields, then sets amounts from `plan.unitsToSend`. |
| `submitSupportOnPlace()` | Clicks the support submit button (`input[name="suport"]` / `button[name="suport"]`). |
| `fillCStimeAndConfirm(plan)` | Writes `midGapArrivalMs` into `#CStime` and clicks "Confirmar" (used on the noble-train confirm screen). |
| `runPlaceAutomationIfNeeded()` | Entry point — loads the plan, validates required fields, dispatches to the confirm-screen or target/unit-fill path. |
| `jitter(baseMs, spreadMs)` | Adds random spread to a fixed delay so automation timing isn't mechanically identical run-to-run. |
| `toDatetimeLocalMs(ms)` | Formats a timestamp for a `datetime-local` input with millisecond precision. |
| `getQueryParam(name)` | Reads a single query-string parameter from `location.search`. |

## Plan object (stored in `tw_gap_snipe_plan_v12`)

```json
{
  "target": { "x": 123, "y": 456 },
  "sourceVillageId": "12345",
  "unitsToSend": { "spy": 1, "light": 50 },
  "midGapArrivalMs": 1716000000000,
  "createdAt": 1716000000000
}
```

`runPlaceAutomationIfNeeded()` requires `target`, `sourceVillageId`, `unitsToSend`, and `midGapArrivalMs` to all be present before it does anything.

## localStorage keys

| Key | Content |
|-----|---------|
| `tw_gap_snipe_plan_v12` | Active snipe plan (expires after 5 min TTL). Read and written by this file. |

> `tw_snipe_manual_timings_v1` (manual target/timing entries) belongs to `SnipeView.tsx`, not this file — this module never reads or writes it.

## Unit name validation

`UNIT_MIN_PER_FIELD` in this file is just a set of known unit names used by `fillUnitsOnPlace()` to zero out recognized input fields before filling — it is **not** used for any travel-time or speed math here (that logic moved to `SnipeView.tsx`).

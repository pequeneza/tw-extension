# mass_label_renamer

**File:** `tw-suite-extension/modules/mass_label_renamer.user.js`  
**Version:** 4.2.0  
**Module ID:** `mass_label_renamer`  
**Trigger page:** `screen=overview_villages&mode=incomings`, `screen=overview`  
**Re-entry guard:** `window.__twMassRenamerLoaded`

## What it does

Adds **BITO colour-coded label buttons** to every row in the incomings table. Clicking a button renames the incoming command with a coloured tag and paints the entire row (or column) with a two-tone gradient matching the tag colour.

## Tag palette (BITO labels)

| Tag | Button label | Colour key | Two-tone (light / dark) |
|-----|-------------|------------|------------------------|
| `[Morto]` | M | green | `#31c908` / `#1f8a03` |
| `[Desviado]` | D! | orange | `#ef8b10` / `#a85c06` |
| `[Desviar]` | D | purple | `#9232a8` / `#611870` |
| `[Reconquistar]` | R | gray | `#adb6c6` / `#717b8a` |
| `[Reconquistado]` | RR | white | `#ffffff` / `#c8c8c8` (black text) |
| `[Retirar]` | Re | teal | `#0d9488` / `#0a7a6e` |
| `[Fake]` | F | yellow | `#ffd91c` / `#c9a808` |
| `[OFF]` | O | blue | `#1a8fe3` / `#0d5fa3` |
| … (configurable) | … | … | … |

## Highlight modes

| Mode | Effect |
|------|--------|
| `'coluna'` | Paints only the label column cell. |
| `'full'` | Paints the entire table row. |

## Config (from `window.__twSuiteCfg('mass_label_renamer')`)

| Field | Default | Description |
|-------|---------|-------------|
| `minDelaySeconds` | 120 | Minimum seconds between label API calls (rate limiting). |
| `randomExtraMax` | 30 | Additional random seconds on top of the minimum delay. |
| `highlightMode` | `'coluna'` | Row paint mode (`'coluna'` or `'full'`). |
| `kbEnabled` | true | Enable keyboard shortcuts for labelling. |
| `originBadgeEnabled` | true | Show a badge showing the origin village on each row. |
| `autoFakeEnabled` | false | Automatically send a fake on a specific label action. |
| `autoFakeWindowSec` | 10 | Time window (seconds) for the auto-fake trigger. |

## Key functions

| Function | Purpose |
|----------|---------|
| `attachButtons(row)` | Injects BITO buttons into an incoming row. |
| `paintRow(row, colorKey)` | Applies two-tone background gradient to a row or column cell. |
| `renameCommand(cmdId, tag)` | Calls the TW API to rename the command label. |
| `applyRateLimit()` | Enforces minimum delay between rename API calls. |

# mass_label_renamer

**File:** `tw-suite-extension/modules/mass_label_renamer.user.js`  
**Version:** 4.2.0  
**Module ID:** `mass_label_renamer`  
**Trigger page:** `screen=overview_villages&mode=incomings`, `screen=overview`  
**Re-entry guard:** `window.__twMassRenamerLoaded`

## What it does

Adds **BITO colour-coded label buttons** to every row in the incomings table. Clicking a button renames the incoming command with a coloured tag and paints the entire row (or column) with a two-tone gradient matching the tag colour.

## Tag palette (BITO labels)

15 tags, defined in the `TAGS` array (`mass_label_renamer.user.js:145-162`). Each maps to a `PALETTE` colour key with a `[bg, priorityBg]` pair (`lines 123-140`); the 4 priority tags (marked ★) render with the darker `priorityBg` shade, all others use `bg`.

| Tag | Button label | Colour key | bg / priorityBg |
|-----|-------------|------------|------------------|
| `[Morto]` ★ | M | green | `#CDEFCF` / `#B5DFBA` |
| `[Desviado]` | D! | orange | `#F6D4A7` |
| `[Desviar]` | D | purple | `#DCCEF6` |
| `[Reconquistar]` | R | gray | `#E7E7E7` |
| `[Reconquistado]` | RR | white | `#EEF0F5` |
| `[Snipado]` | S! | lblue | `#CFEFF5` |
| `[Snipar]` | S | blue | `#CFE2FF` |
| `[Fubar]` | FU | dgreen | `#CEEED8` |
| `[Snipe Cancel]` | SC | red | `#F2CACA` |
| `[Fake]` | FA | Pink | `#F5D5E5` |
| `[Possível Full]` ★ | PV | dblue | `#C8D4F5` / `#B5C4F0` |
| `[Reforçar]` | RF | black | `#C8C8C8` |
| ` \| Retirar` ★ | R! | teal | `#C0EAE7` / `#A8DDE0` |
| ` \| Vigiar` ★ | V! | yellow | `#F8E8A6` / `#F0DA80` |
| ` \| ✓` | ✓ | lgreen | `#D5EFCA` |

The last three (`Retirar`, `Vigiar`, `✓`) are appended with a leading `" | "` rather than replacing the base tag, so they can stack alongside one of the other 12 tags.

## Highlight modes

| Mode | Effect |
|------|--------|
| `'coluna'` | Paints only the label column cell (default). |
| `'linha'` | Paints the entire table row. |

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

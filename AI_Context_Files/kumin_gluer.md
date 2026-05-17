# kumin_gluer

**File:** `tw-suite-extension/modules/kumin_gluer.user.js`  
**Version:** 1.1.0  
**Trigger page:** Any `game.php` (active branches: `screen=info_village`, `screen=memo`)  
**Re-entry guard:** `window.__twKuminGluerRunning`

## What it does

Adds **click-to-schedule** buttons to incoming attack rows on the village info page. Clicking a row opens a scheduling panel where the user picks a noble-train (NT) template and the script writes the command to the Kumin autosender queue. On `screen=memo` it acts as the watcher that processes those queued commands.

## Page branches

| Page | Behaviour |
|------|-----------|
| `screen=info_village` | Attaches click handlers to incoming attack rows. Shows a panel with NT type selector, computed launch time, and "Schedule" button. Also fetches troop templates from the rally-point. |
| `screen=memo` | Watcher loop — polls `twKuminGluer_queue`, fires due commands by opening a place tab. |

## Noble Train (NT) configurations

Maps template name → number of nobles in the train:

| Template name | Nobles |
|--------------|--------|
| `noNT` | 1 |
| `twoNoblesSame` | 2 |
| `threeNoblesSame` | 3 |
| `fourNoblesSame` | 4 |
| `fiveNoblesSame` | 5 |
| `secondNobleWithRest` | 2 |
| `thirdNobleWithRest` | 3 |
| `fourNobleWithRest` | 4 |
| `fiveNobleWithRest` | 5 |
| `splitSecondThirdNobleNT` | 2 |
| `secondNobleBuffNT` | 2 |
| `thirdNobleBuffNT` | 3 |
| `secondNobleBuffWith5NoblesNT` | 5 |
| `secondNobleBuffWith2NoblesNT` | 2 |
| `firstNobleRedNT` | 1 |
| `secondNobleRedNT` | 2 |
| `thirdNobleRedNT` | 3 |
| `fourthNobleRedNT` | 4 |
| `firstNobleRed5NT` | 1 |
| `secondNobleRed5NT` | 2 |
| `thirdNobleRed5NT` | 3 |

## Key functions

| Function | Purpose |
|----------|---------|
| `initVillage()` | Attaches click handlers to incoming rows on info_village. |
| `readPageCoords()` | Parses village coordinates from the "Coordenadas:" table row. |
| `loadSettings()` / `saveSettings()` | Read/write user preferences from localStorage. |
| `setUnitsInEditor(entry)` | Fills the Kumin editor form with unit counts AND sets `#popupSigil`. |

## Sigil support

`setUnitsInEditor()` now fills the `#popupSigil` input in the Kumin editor:

```js
const sigilEl = document.getElementById('popupSigil');
if (sigilEl && entry.sigilPct != null) {
    nativeSet(sigilEl, String(entry.sigilPct));
}
```

`sigilPct` is passed in via `kuminEntry` from planeador. If planeador did not supply it, the field is left unchanged (Kumin's own default applies).

**Sigil semantics (applies to Kumin too):**
- Support commands: sigil reduces travel time by `sigilPct%` — same arrival, earlier departure stored in Kumin queue.
- Attacks: sigil has no effect — departure time is unchanged.

## localStorage keys

| Key | Content |
|-----|---------|
| `twKuminGluer_queue` | JSON array of scheduled glue commands. |
| `twKuminGluer_commandCache` | Cached command data (target coords, timings). |
| `twKuminGluer_settings` | User preferences (e.g. default NT type). |

---
name: Overlay trigger stack patterns
description: Naming conventions, sizing rules, and tooltip style for the .trigger-stack floating button column
type: project
---

The `.trigger-stack` is a fixed column of 28×28px buttons on the left edge of the game page (top: 108px). Rules established here:

**Badge counts:** Both Snipe and Desviador count badges use the single shared class `.trigger-badge-count` (red pill, 9px bold, absolute top-right). The old separate `.trigger-snipe-count` and `.trigger-desviador-count` classes were merged in May 2026 — do not re-introduce split classes for these badges.

**Image-icon sizing:** `.trigger-icon-img` is 18×18px. This was chosen so raster icons (e.g. Kumin Gluer's `colatudo.png`) have the same visual weight as emoji glyphs rendered at 13px font-size in a 28px button. Do not drop below 18px.

**Tooltip (title) pattern:** Short module name only — `"Module Name"` or `"Module Name — state hint"` for buttons that show live state. Do not use instructional sentences in titles (the panel itself explains usage on open).

**Tooltip examples:**
- xBot toggle: `"xBot"`
- Snipe: `` `${count} gap(s) — open snipe planner` ``
- Kumin Gluer: `"Kumin Gluer"` (no instruction sentence)
- Desviador: `"Desviador"` / `` `Desviador — ${count} programado(s)` ``
- WH Balancer: `"WH Balancer"`

**Planeador has no trigger button** — it injects its own floating panel directly into the TW page via `planeador.user.js` and intentionally lives outside the overlay stack. Do not add a Planeador entry to the stack.

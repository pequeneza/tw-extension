---
name: TribalWars PT native UI design tokens (game page DOM)
description: Hard-coded color and sizing values used by the TribalWars PT game's own UI — relevant when reviewing userscript-injected elements that must blend with the game's native style
type: project
---

TribalWars PT uses a medieval brown/parchment theme. These values govern how injected UI elements should look to blend natively:

**Colors**
- Table header background: `#603000` (dark maroon-brown)
- Table header text: `#f4e4bc` (warm parchment)
- Table row backgrounds: alternating `#f4e4bc` / `#e8d5a0`
- Native button background: `#c0a050`, border `#9b7c3a` — gold gradient used on LIGHT backgrounds only
- `.quest` native icon button: `background-color: #E9D0A9`, `border: 1px solid #603000`, `width: 25px; height: 25px`

**Native icon sizing**
- Command icons from `graphic/command/*.webp`: 18–24px is the natural range
- Using 14px makes icons and any overlay effects (forbidden slash) too small to read clearly

**Key rule for injected buttons in header cells**
- The gold gradient (`#f0dfa0` → `#c8a040`) is appropriate on parchment-row backgrounds, NOT on dark `#603000` headers
- For buttons inserted into dark headers, use flat `#e9d0a9` (the `.quest` background) with `border: 1px solid #603000`
- Active/suppressed state: use `background: #d4b8a0` + `border-color: #8b3a3a` to signal "something is being filtered" without using the inverted gradient convention (which reads as "button is physically pressed" not "state is on")

**Why:** The gold gradient reads as a foreign/intrusive element against the dark header background. The `.quest` pattern is the game's own answer to "small icon button in a table context."

**How to apply:** Any time a userscript injects a button into a table header cell, use the `.quest`-derived palette, not the gold gradient. Reserve the gold gradient for buttons placed on parchment/light-background rows.

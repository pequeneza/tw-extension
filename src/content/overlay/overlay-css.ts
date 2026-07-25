// AUTO-GENERATED — do not edit by hand.
export const OVERLAY_CSS = `/* TW Suite Overlay — control-panel aesthetic, semantic color system */

@import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,300&family=DM+Mono:wght@400;500&display=swap');

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:host {
  all: initial;
  font-family: 'DM Sans', -apple-system, sans-serif;
  font-size: 13px;
  line-height: 1.45;
  -webkit-font-smoothing: antialiased;
  color-scheme: light;
}

/* ── Tokens ──────────────────────────────────────────────────────────────── */
:host {
  /* Neutral scale */
  --n0:   #ffffff;
  --n50:  #f9fafb;
  --n100: #f3f4f6;
  --n150: #eaecf0;
  --n200: #d1d5db;
  --n300: #9ca3af;
  --n400: #6b7280;
  --n500: #4b5563;
  --n600: #374151;
  --n700: #1f2937;
  --n800: #111827;
  --n900: #0d1117;

  /* Semantic green — enabled / live / success */
  --g400: #22c55e;
  --g500: #16a34a;
  --g600: #15803d;
  --g-bg: #f0fdf4;
  --g-br: #bbf7d0;

  /* Semantic amber — dirty / warning */
  --a400: #f59e0b;
  --a500: #d97706;
  --a-bg: #fffbeb;
  --a-br: #fde68a;

  /* Semantic red — danger / destructive */
  --r400: #f87171;
  --r500: #ef4444;
  --r-bg: #fef2f2;
  --r-br: #fecaca;

  /* Semantic blue — focus / interactive */
  --b400: #60a5fa;
  --b500: #3b82f6;
  --b-bg: #eff6ff;
  --b-br: #bfdbfe;

  /* Layout */
  --w: 340px;
  --w-snipe: 440px;
  --w-balancer: 580px;
  --ease: 0.14s ease;
  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);

  /* Typography */
  --mono: 'DM Mono', monospace;

  /* Backgrounds */
  --bg: var(--n0);

  /* Elevation */
  --shadow-md: 0 4px 6px -1px rgba(0,0,0,.08), 0 2px 4px -2px rgba(0,0,0,.06);
  --shadow-xl: 0 20px 40px -8px rgba(0,0,0,.16), 0 8px 16px -4px rgba(0,0,0,.08);
}

/* ── Dark / Tactical mode ────────────────────────────────────────────────── */
:host([data-theme="dark"]) {
  color-scheme: dark;
  --bg:   #0f1117;
  --n900: #f0f2f7;
  --n800: #e8eaf0;
  --n700: #c4c8d4;
  --n600: #a8adb8;
  --n500: #9ca3af;
  --n400: #6b7280;
  --n300: #4b5563;
  --n200: #2a2d3a;
  --n150: #2a2d3a;
  --n100: #1e2130;
  --n50:  #161922;
  --n0:   #1a1d27;
  --bg-card: #1a1d27;
  --shadow-md: 0 4px 6px -1px rgba(0,0,0,.32), 0 2px 4px -2px rgba(0,0,0,.24);
  --shadow-xl: 0 20px 40px -8px rgba(0,0,0,.56), 0 8px 16px -4px rgba(0,0,0,.32);
}
:host([data-theme="dark"]) .panel,
:host([data-theme="dark"]) .panel-header,
:host([data-theme="dark"]) .cfg-view,
:host([data-theme="dark"]) .cfg-header,
:host([data-theme="dark"]) .cfg-footer { background: #0f1117; }
:host([data-theme="dark"]) .search-wrap { background: #12161f; }
:host([data-theme="dark"]) .search-input { background: #1a1d27; color: var(--n900); }
:host([data-theme="dark"]) .card { background: #1a1d27; border-color: #2a2d3a; }
:host([data-theme="dark"]) .card:hover { background: #1e2130; }
:host([data-theme="dark"]) .card--on  { background: color-mix(in srgb, var(--g600) 10%, #1a1d27); }
:host([data-theme="dark"]) .card--live { background: color-mix(in srgb, var(--g500) 12%, #1a1d27); }
:host([data-theme="dark"]) .trigger { background: #1a1d27; border-color: #2a2d3a; color: var(--n500); }
:host([data-theme="dark"]) .trigger:hover { background: #1e2130; color: var(--n900); }
:host([data-theme="dark"]) .panel-footer,
:host([data-theme="dark"]) .cfg-section-checks { background: #12161f; }
:host([data-theme="dark"]) .stats-bar { background: #12161f; }
:host([data-theme="dark"]) .snipe-gap-pill { background: #1a1d27; border-color: #2a2d3a; }
:host([data-theme="dark"]) .snipe-card { background: #1a1d27; border-color: #2a2d3a; }
:host([data-theme="dark"]) .snipe-sticky-bar { background: #0f1117; border-bottom-color: #2a2d3a; }
:host([data-theme="dark"]) .close-btn,
:host([data-theme="dark"]) .back-btn { background: #1e2130; border-color: #2a2d3a; }
:host([data-theme="dark"]) .input { background: #1a1d27; border-color: #2a2d3a; color: var(--n900); }
:host([data-theme="dark"]) .footer-btn { background: #1a1d27; border-color: #2a2d3a; color: var(--n500); }
:host([data-theme="dark"]) .footer-btn:hover { background: #1e2130; color: var(--n900); }
:host([data-theme="dark"]) .backdrop { background: rgba(0,0,0,0.55); }

/* ── Stats bar ───────────────────────────────────────────────────────────── */
.stats-bar {
  display: flex;
  align-items: center;
  height: 24px;
  background: var(--b-bg);
  border-bottom: 1px solid var(--b-br);
  flex-shrink: 0;
  padding: 0 12px;
  gap: 0;
}
.stat-cell {
  display: flex;
  align-items: center;
  gap: 5px;
  flex: 1;
  min-width: 0;
}
.stat-cell + .stat-cell {
  border-left: 1px solid var(--b-br);
  padding-left: 10px;
  margin-left: 10px;
}
:host([data-theme="dark"]) .stat-cell + .stat-cell {
  border-left-color: #2a2d3a;
}
.stat-label {
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--n300);
  white-space: nowrap;
}
.stat-value {
  font-family: 'DM Mono', monospace;
  font-size: 11px;
  font-weight: 500;
  color: var(--b500);
  white-space: nowrap;
  flex-shrink: 0;
}

/* ── Theme toggle button ─────────────────────────────────────────────────── */
.theme-btn {
  width: 28px; height: 28px;
  border-radius: 6px;
  border: 1px solid var(--n150);
  background: var(--n50);
  color: var(--n400);
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
  transition: all var(--ease);
  font-family: inherit;
  font-size: 14px;
  line-height: 1;
}
.theme-btn:hover { background: var(--n100); border-color: var(--n200); color: var(--n700); }

/* ── Trigger ─────────────────────────────────────────────────────────────── */
.trigger-stack {
  position: fixed;
  left: 0;
  top: 108px;
  z-index: 2147483640;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.trigger {
  position: relative;
  left: unset;
  top: unset;
  z-index: 2147483640;
  width: 28px;
  height: 28px;
  border-radius: 0 6px 6px 0;
  border: 1px solid var(--n200);
  border-left: none;
  background: var(--n0);
  color: var(--n400);
  font-size: 13px;
  font-weight: 700;
  letter-spacing: -0.02em;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: var(--shadow-md);
  transition: width var(--ease), color var(--ease), background var(--ease),
              border-color var(--ease), box-shadow var(--ease);
}
.trigger:hover {
  width: 34px;
  color: var(--n700);
  background: var(--n50);
  box-shadow: var(--shadow-xl);
}
.trigger--open {
  width: 32px;
  background: var(--b-bg);
  border-color: var(--b-br);
  color: var(--b500);
  box-shadow: 0 0 0 2px rgba(59,130,246,0.30), var(--shadow-md);
}

.trigger--snipe  { 
  position: relative; 
  top: unset; 
}

.trigger-badge-count {
  position: absolute;
  top: -5px;
  right: -5px;
  background: var(--r500);
  color: #fff;
  font-size: 9px;
  font-weight: 700;
  line-height: 1;
  padding: 2px 3px;
  border-radius: 6px;
  pointer-events: none;
}

.trigger--balancer   { position: relative; top: unset; }
.trigger--buyer      { position: relative; top: unset; }
.trigger--desviador  { position: relative; top: unset; }
.trigger--autosender {
  position: relative;
  top: unset;
  height: auto;
  min-height: 28px;
  flex-direction: column;
  gap: 1px;
  padding: 3px 0;
}
.trigger-timer {
  font-size: 8px;
  font-family: 'DM Mono', 'Courier New', monospace;
  font-variant-numeric: tabular-nums;
  color: var(--a500);
  line-height: 1;
  letter-spacing: 0.03em;
  pointer-events: none;
}

/* ── Backdrop ────────────────────────────────────────────────────────────── */
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 2147483641;
  background: rgba(17,24,39,0.2);
  animation: fade-in 0.18s ease;
}
@keyframes fade-in { from { opacity: 0 } to { opacity: 1 } }

/* ── Drawer ──────────────────────────────────────────────────────────────── */
.drawer {
  position: fixed;
  left: 0; top: 0; bottom: 0;
  width: var(--w);
  z-index: 2147483642;
  transform: translateX(-100%);
  transition: transform 0.24s cubic-bezier(0.4, 0, 0.2, 1);
  pointer-events: none;
}
.drawer--open {
  transform: translateX(0);
  pointer-events: all;
}
/* Snipe view gets a wider drawer */
.drawer--snipe {
  width: var(--w-snipe);
}

/* ── Panel shell ─────────────────────────────────────────────────────────── */
.panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--n0);
  border-right: 1px solid var(--n150);
  box-shadow: var(--shadow-xl);
  overflow: hidden;
  opacity: 0;
  transform: translateX(-8px);
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.panel.in {
  opacity: 1;
  transform: translateX(0);
}

/* ── Drawer resize handle ─────────────────────────────────────────────────── */
.drawer-resize-handle {
  position: absolute;
  top: 0;
  right: -4px;
  width: 8px;
  height: 100%;
  cursor: col-resize;
  z-index: 2147483643;
  background: transparent;
  transition: background 0.15s;
}
.drawer-resize-handle:hover {
  background: rgba(59, 130, 246, 0.25);
}
.drawer-resize-handle--dragging {
  background: rgba(59, 130, 246, 0.45);
}

/* ── Panel header ────────────────────────────────────────────────────────── */
.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 14px 12px;
  border-bottom: 1px solid var(--n150);
  background: var(--n0);
  flex-shrink: 0;
}
.panel-header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}
.panel-logo {
  font-size: 20px;
  line-height: 1;
  flex-shrink: 0;
}
.panel-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--n900);
  letter-spacing: -0.01em;
  line-height: 1.2;
}
.panel-license {
  font-size: 10.5px;
  color: var(--n400);
  margin-top: 2px;
}
.panel-license--warn { color: var(--r500); font-weight: 500; }
.panel-meta {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-top: 3px;
}
.meta-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 1px 7px;
  border-radius: 20px;
  font-size: 10.5px;
  font-weight: 500;
}
.meta-on {
  background: var(--g-bg);
  color: var(--g600);
  border: 1px solid var(--g-br);
}
.meta-live {
  background: var(--g-bg);
  color: var(--g600);
  border: 1px solid var(--g400);
}

.close-btn {
  width: 28px; height: 28px;
  border-radius: 6px;
  border: 1px solid var(--n150);
  background: var(--n50);
  color: var(--n400);
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
  transition: all var(--ease);
  font-family: inherit;
}
.close-btn:hover { background: var(--r-bg); border-color: var(--r-br); color: var(--r500); }

/* ── Search ──────────────────────────────────────────────────────────────── */
.search-wrap {
  position: relative;
  padding: 10px 12px;
  background: var(--n50);
  border-bottom: 1px solid var(--n150);
  flex-shrink: 0;
}
.search-icon {
  position: absolute;
  left: 22px; top: 50%;
  transform: translateY(-50%);
  color: var(--n300);
  pointer-events: none;
}
.search-input {
  width: 100%;
  padding: 7px 28px 7px 32px;
  background: var(--n0);
  border: 1px solid var(--n200);
  border-radius: 7px;
  color: var(--n900);
  font-family: 'DM Sans', sans-serif;
  font-size: 12.5px;
  outline: none;
  transition: border-color var(--ease), box-shadow var(--ease);
}
.search-input:focus {
  border-color: var(--b400);
  box-shadow: 0 0 0 3px rgba(59,130,246,0.1);
}
.search-input::placeholder { color: var(--n300); }
.search-clear {
  position: absolute;
  right: 20px; top: 50%;
  transform: translateY(-50%);
  background: none; border: none;
  color: var(--n300); font-size: 16px;
  cursor: pointer; line-height: 1;
  padding: 2px;
  border-radius: 3px;
  font-family: inherit;
  transition: color var(--ease);
}
.search-clear:hover { color: var(--n500); }

/* ── Live banner ─────────────────────────────────────────────────────────── */
.live-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 14px;
  background: var(--g-bg);
  border-bottom: 1px solid var(--g-br);
  font-size: 11.5px;
  font-weight: 500;
  color: var(--g600);
  flex-shrink: 0;
}

/* ── Live pip ────────────────────────────────────────────────────────────── */
.live-pip {
  width: 7px; height: 7px;
  border-radius: 50%;
  background: var(--g400);
  flex-shrink: 0;
  animation: pip-pulse 2s ease-in-out infinite;
}
.live-pip--sm { width: 5px; height: 5px; }
@keyframes pip-pulse { 0%,100%{opacity:1} 50%{opacity:.25} }

/* ── Card list ───────────────────────────────────────────────────────────── */
.card-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 3px;
  scrollbar-width: thin;
  scrollbar-color: var(--n200) transparent;
}
.card-list::-webkit-scrollbar { width: 4px; }
.card-list::-webkit-scrollbar-thumb { background: var(--n200); border-radius: 2px; }

/* ── Module card ─────────────────────────────────────────────────────────── */
.card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 10px;
  border: 1px solid var(--n150);
  border-radius: 8px;
  background: var(--n0);
  position: relative;
  overflow: hidden;
  transition: background var(--ease), border-color var(--ease), transform 0.1s ease;
  animation: card-in 0.22s ease both;
}
@keyframes card-in {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* State strip on left edge */
.card::before {
  content: '';
  position: absolute;
  left: 0; top: 0; bottom: 0;
  width: 2.5px;
  background: transparent;
  transition: background var(--ease);
}

.card:hover { background: var(--n50); border-color: var(--n200); }
.card:active { transform: scale(0.995); }

/* enabled */
.card--on { background: var(--g-bg); border-color: var(--g-br); }
.card--on::before { background: var(--g500); }
.card--on:hover { border-color: var(--g400); }

/* live (subset of on — stronger */
.card--live { background: var(--g-bg); border-color: var(--g400); }
.card--live::before {
  background: var(--g400);
  animation: border-glow 2s ease-in-out infinite;
}
@keyframes border-glow {
  0%,100% { opacity: 1; box-shadow: 0 0 6px 1px var(--g400); }
  50%      { opacity: .4; box-shadow: none; }
}

.card-icon {
  font-size: 17px;
  width: 22px;
  text-align: center;
  flex-shrink: 0;
  line-height: 1;
  opacity: 0.3;
  transition: opacity var(--ease);
}
.card--on .card-icon,
.card--live .card-icon { opacity: 1; }

.card-body {
  flex: 1;
  min-width: 0;
  cursor: pointer;
  -webkit-user-select: none;
  user-select: none;
}
.card-name {
  font-size: 12.5px;
  font-weight: 500;
  color: var(--n500);
  line-height: 1.25;
  transition: color var(--ease);
}
.card--on .card-name,
.card--live .card-name { color: var(--n900); font-weight: 600; }
.card-desc {
  font-size: 11px;
  color: var(--n300);
  margin-top: 2px;
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.card--on .card-desc { color: var(--n400); }

.card-actions {
  display: flex; align-items: center; gap: 6px; flex-shrink: 0;
}

/* Gear button — amber on hover signals "this has settings" */
.cfg-btn {
  width: 26px; height: 26px;
  background: var(--n50); border: 1px solid var(--n150);
  border-radius: 6px; color: var(--n300);
  cursor: pointer; display: flex; align-items: center; justify-content: center;
  transition: all var(--ease); flex-shrink: 0;
  font-family: inherit;
}
.cfg-btn:hover {
  background: var(--a-bg);
  border-color: var(--a-br);
  color: var(--a500);
  transform: rotate(30deg);
}

/* ── Toggle ──────────────────────────────────────────────────────────────── */
.toggle {
  position: relative;
  width: 34px; height: 18px;
  flex-shrink: 0;
  display: inline-block;
  cursor: pointer;
}
.toggle input { opacity: 0; width: 0; height: 0; position: absolute; }
.toggle-thumb {
  position: absolute; inset: 0;
  background: var(--n200);
  border-radius: 9px;
  transition: background 0.18s ease;
}
.toggle-thumb::after {
  content: '';
  position: absolute;
  top: 3px; left: 3px;
  width: 12px; height: 12px;
  background: var(--n0);
  border-radius: 50%;
  transition: left 0.18s ease, box-shadow 0.18s ease;
  box-shadow: 0 1px 3px rgba(0,0,0,0.2);
}
.toggle input:checked + .toggle-thumb { background: var(--g400); }
.toggle input:checked + .toggle-thumb::after { left: 19px; }
.toggle input:focus-visible + .toggle-thumb {
  outline: 2px solid var(--b400);
  outline-offset: 2px;
}

/* ── Panel footer ────────────────────────────────────────────────────────── */
.panel-footer {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 9px 12px;
  background: var(--n50);
  border-top: 1px solid var(--n150);
  flex-shrink: 0;
}
.footer-btn {
  padding: 5px 12px;
  border-radius: 6px;
  border: 1px solid var(--n200);
  background: var(--n0);
  color: var(--n500);
  font-family: 'DM Sans', sans-serif;
  font-size: 11.5px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--ease);
}
.footer-btn:hover { background: var(--n100); border-color: var(--n300); color: var(--n700); }
.footer-btn--danger:hover { background: var(--r-bg); border-color: var(--r-br); color: var(--r500); }
.footer-btn--key { margin-left: auto; padding: 5px 8px; }
.footer-ver {
  margin-left: auto;
  font-size: 10.5px;
  color: var(--n300);
  font-family: 'DM Mono', monospace;
}

/* ── State messages ──────────────────────────────────────────────────────── */
.state-msg {
  display: flex; align-items: center; justify-content: center; gap: 8px;
  padding: 32px 16px;
  color: var(--n300);
  font-size: 12px;
}
.spinner {
  width: 14px; height: 14px;
  border: 2px solid var(--n200);
  border-top-color: var(--b400);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
  flex-shrink: 0;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* ───────────────────────────────────────────────────────────────────────────
   CONFIG VIEW
──────────────────────────────────────────────────────────────────────────── */
.cfg-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--n0);
  overflow: hidden;
  opacity: 0;
  transform: translateX(16px);
  transition: opacity 0.18s ease, transform 0.18s ease;
}
.cfg-view.in { opacity: 1; transform: translateX(0); }

/* Config header */
.cfg-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 13px 14px 11px;
  border-bottom: 1px solid var(--n150);
  flex-shrink: 0;
  background: var(--n0);
}
.back-btn {
  width: 28px; height: 28px;
  background: var(--n50); border: 1px solid var(--n150);
  border-radius: 6px; color: var(--n400);
  cursor: pointer; display: flex; align-items: center; justify-content: center;
  flex-shrink: 0; transition: all var(--ease);
  font-family: inherit;
}
.back-btn:hover { background: var(--n100); border-color: var(--n200); color: var(--n700); }
.back-btn--active { background: var(--b-bg); border-color: var(--b-br); color: var(--b500); }
.gluer-settings-btn { font-size: 16px; color: var(--n600); }
.gluer-settings-btn:hover { color: var(--n900); }
.gluer-settings-btn.back-btn--active { color: var(--b500); }
.cfg-icon { font-size: 18px; flex-shrink: 0; line-height: 1; }
.cfg-header-text { flex: 1; min-width: 0; }
.cfg-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--n900);
  line-height: 1.2;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.cfg-subtitle {
  font-size: 10.5px;
  color: var(--n300);
  margin-top: 1px;
  display: block;
}

/* Status dot: neutral → amber (dirty) → green (saved) */
.cfg-status-dot {
  width: 7px; height: 7px;
  border-radius: 50%;
  background: var(--n200);
  flex-shrink: 0;
  transition: background 0.2s ease;
}
.cfg-status-dot[data-dirty="true"]  { background: var(--a400); }
.cfg-status-dot[data-saved="true"]  { background: var(--g400); }

/* Config body */
.cfg-body {
  flex: 1;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--n200) transparent;
}
.cfg-body::-webkit-scrollbar { width: 4px; }
.cfg-body::-webkit-scrollbar-thumb { background: var(--n200); border-radius: 2px; }

/* Sections */
.cfg-section {
  padding: 4px 0;
  border-bottom: 1px solid var(--n100);
}
.cfg-section:last-child { border-bottom: none; }
.cfg-section-checks { background: var(--n50); }
.section-label {
  padding: 8px 14px 4px;
  font-size: 10.5px;
  font-weight: 600;
  color: var(--n300);
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

/* ── Fields ──────────────────────────────────────────────────────────────── */
.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--n100);
}
.field:last-child { border-bottom: none; }

.field-top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}
.field-label {
  font-size: 12.5px;
  font-weight: 500;
  color: var(--n700);
  line-height: 1.2;
}
.field-range {
  font-size: 10.5px;
  color: var(--n300);
  font-family: 'DM Mono', monospace;
  white-space: nowrap;
  flex-shrink: 0;
}
.field-help {
  font-size: 11px;
  color: var(--n400);
  line-height: 1.4;
}

/* Inputs */
.input {
  width: 100%;
  padding: 7px 10px;
  background: var(--n0);
  border: 1px solid var(--n200);
  border-radius: 6px;
  color: var(--n900);
  font-family: 'DM Sans', sans-serif;
  font-size: 12.5px;
  outline: none;
  transition: border-color var(--ease), box-shadow var(--ease);
  -webkit-appearance: none;
  appearance: none;
}
.input:focus {
  border-color: var(--b400);
  box-shadow: 0 0 0 3px rgba(96,165,250,0.15);
}
.input[type=number] { -moz-appearance: textfield; }
.input[type=number]::-webkit-outer-spin-button,
.input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; }
.input[type=time] { font-family: 'DM Mono', monospace; font-size: 12px; }

select.input {
  cursor: pointer;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%239ca3af'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 10px center;
  padding-right: 28px;
}

.input-ta {
  font-family: 'DM Mono', monospace;
  font-size: 11px;
  line-height: 1.6;
  resize: vertical;
  min-height: 90px;
}

/* Number with inline hint */
.field-num-wrap { display: flex; align-items: center; gap: 8px; }
.field-num-wrap .input { flex: 1; max-width: 130px; }

/* Checkbox field */
.field-check {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-bottom: 1px solid var(--n100);
  cursor: pointer;
  transition: background var(--ease);
  gap: 12px;
}
.field-check:last-child { border-bottom: none; }
.field-check:hover { background: var(--n50); }
.field-check-text { flex: 1; min-width: 0; }

/* ── License status ──────────────────────────────────────────────────────── */
.lic-status {
  font-size: 11.5px;
  color: var(--n400);
  padding: 4px 2px;
}
.lic-status--ok  { color: var(--g600); }
.lic-status--err { color: var(--r500); }

/* ── Config footer ───────────────────────────────────────────────────────── */
.cfg-footer {
  display: flex;
  gap: 8px;
  padding: 10px 14px;
  background: var(--n50);
  border-top: 1px solid var(--n150);
  flex-shrink: 0;
}

.btn {
  flex: 1;
  padding: 8px 14px;
  border-radius: 7px;
  font-family: 'DM Sans', sans-serif;
  font-size: 12.5px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid;
  transition: all var(--ease);
  display: flex; align-items: center; justify-content: center; gap: 4px;
}
.btn:disabled { opacity: 0.4; cursor: default; pointer-events: none; }

.btn-ghost {
  background: var(--n0); border-color: var(--n200); color: var(--n500);
}
.btn-ghost:hover { background: var(--r-bg); border-color: var(--r-br); color: var(--r500); }

/* Save: neutral → amber dirty → green saved */
.btn-save {
  background: var(--n100); border-color: var(--n200); color: var(--n300);
}
.btn-save--dirty {
  background: var(--a-bg); border-color: var(--a-br); color: var(--a500);
}
.btn-save--dirty:hover {
  background: var(--a500); border-color: var(--a500); color: #fff;
}
.btn-save--saved {
  background: var(--g-bg); border-color: var(--g-br); color: var(--g600);
  animation: save-pop 0.3s var(--ease-spring);
}
@keyframes save-pop {
  0%   { transform: scale(1); }
  40%  { transform: scale(1.04); }
  100% { transform: scale(1); }
}

/* ── Fake Sender badges ──────────────────────────────────────────────────── */
.fake-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 8px;
  border-radius: 20px;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
  flex-shrink: 0;
}
.fake-badge--ok {
  background: var(--g-bg);
  color: var(--g600);
  border: 1px solid var(--g-br);
}
.fake-badge--warn {
  background: var(--a-bg);
  color: var(--a500);
  border: 1px solid var(--a-br);
}

/* ── Snipe Scheduler ─────────────────────────────────────────────────────── */
/* Light blue body background for the snipe panel */
.snipe-body {
  background: var(--b-bg);
}
.snipe-body .cfg-section {
  border-bottom-color: var(--b-br);
}
.snipe-body .section-label {
  color: var(--b500);
}
.snipe-speed-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.snipe-speed-label {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--n400);
  white-space: nowrap;
}
.snipe-speed-input {
  width: 52px !important;
}

.snipe-summary-row {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  font-size: 12px;
  color: var(--n400);
}
.snipe-summary-item strong {
  color: var(--n600);
  font-weight: 600;
}

.snipe-error {
  font-size: 12px;
  color: var(--r500);
  background: var(--r-bg);
  border: 1px solid var(--r-br);
  border-radius: 8px;
  padding: 8px 10px;
}

.snipe-gap-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.snipe-gap-pill {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border-radius: 8px;
  border: 1px solid var(--b-br);
  background: var(--n0);
  cursor: pointer;
  text-align: left;
  font-size: 12px;
  color: var(--n500);
  transition: border-color 0.12s, background 0.12s;
}
.snipe-gap-pill:hover {
  border-color: var(--b-br);
  background: var(--b-bg);
}
.snipe-gap-pill--selected {
  border-color: var(--b400);
  background: var(--b-bg);
  color: var(--b500);
}
.snipe-gap-label {
  font-weight: 600;
  min-width: 44px;
}
.snipe-gap-time {
  font-family: var(--mono);
  flex: 1;
}
.snipe-gap-width {
  font-size: 11px;
  color: var(--n300);
  white-space: nowrap;
}

.snipe-candidate-meta {
  font-weight: 400;
  color: var(--n300);
  font-size: 11px;
}

.snipe-card {
  border: 1px solid var(--b-br);
  border-radius: 10px;
  padding: 6px 8px;
  margin-bottom: 5px;
  background: var(--n0);
}
.snipe-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 4px;
}
.snipe-card-coord {
  font-weight: 700;
  font-size: 13px;
  color: var(--n600);
  font-family: var(--mono);
}
.gluer-map-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  color: var(--n400);
  flex-shrink: 0;
  transition: color var(--ease);
}
.gluer-map-btn:hover { color: var(--b500); }
.snipe-card-meta {
  font-size: 11px;
  color: var(--n400);
}
.snipe-card-meta strong {
  color: var(--n600);
}

.snipe-card-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 5px;
}

/* Timer toggle switch — Gluer-only, styled after the shared friend-provided mockup */
.gluer-toggle {
  width: 34px;
  height: 19px;
  border-radius: 999px;
  border: none;
  padding: 0;
  background: var(--g600);
  position: relative;
  cursor: pointer;
  flex-shrink: 0;
  transition: background var(--ease);
}
.gluer-toggle--off { background: var(--n200); }
.gluer-toggle-knob {
  position: absolute;
  top: 2px;
  left: 17px;
  width: 15px;
  height: 15px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 2px rgba(0,0,0,0.25);
  transition: left var(--ease);
}
.gluer-toggle--off .gluer-toggle-knob { left: 2px; }

/* Population fill bar */
.gluer-pop-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
.gluer-pop-bar { flex: 1; accent-color: var(--g600); }
.gluer-pop-total {
  font-family: var(--mono);
  font-size: 11px;
  font-weight: 700;
  min-width: 40px;
  text-align: right;
}
.snipe-timer-btn {
  min-width: 52px;
}
.snipe-timer-btn--icon {
  min-width: 0;
  width: 26px;
  height: 26px;
  padding: 0;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  line-height: 1;
}
.snipe-countdown {
  font-family: var(--mono);
  font-size: 13px;
  font-weight: 600;
  color: var(--g600);
  min-width: 96px;
}
.snipe-countdown--past {
  color: var(--r500);
}

.snipe-units {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  align-items: flex-start;
}
.snipe-unitbox {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  width: 46px;
  padding: 3px 3px;
  border-radius: 7px;
  border: 1px solid var(--n150);
  background: var(--bg);
  transition: border-color 0.1s, background 0.1s;
}
.snipe-unitbox--on {
  border-color: var(--g-br);
  background: var(--g-bg);
}
.snipe-unitbox--disabled {
  opacity: 0.28;
  pointer-events: none;
  border-color: var(--n200);
  background: var(--n100);
}
.snipe-unit-icon {
  width: 16px;
  height: 16px;
  cursor: pointer;
  border-radius: 3px;
  transition: filter 0.1s;
}
.snipe-unitbox--on .snipe-unit-icon {
  filter: drop-shadow(0 0 3px var(--g500));
}
.snipe-unit-avail {
  font-size: 10px;
  color: var(--n400);
  line-height: 1;
}
.snipe-unit-input {
  width: 40px;
  padding: 1px 2px;
  font-size: 10px;
  text-align: center;
  border-radius: 5px;
  border: 1px solid var(--n150);
  background: var(--bg);
  color: var(--n600);
  font-family: var(--mono);
  -moz-appearance: textfield;
}
.snipe-unit-input::-webkit-outer-spin-button,
.snipe-unit-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
.snipe-unit-input:focus {
  outline: none;
  border-color: var(--b400);
}

/* Status badges */
.snipe-status {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 1px 6px;
  border-radius: 10px;
  font-size: 10px;
  font-weight: 600;
  flex-shrink: 0;
}
.snipe-status--ready   { background: var(--g-bg); border: 1px solid var(--g-br); color: var(--g600); }
.snipe-status--queued  { background: var(--b-bg); border: 1px solid var(--b-br); color: var(--b500); }
.snipe-status--past    { background: var(--r-bg); border: 1px solid var(--r-br); color: var(--r500); }
.snipe-status--missing { background: var(--a-bg); border: 1px solid var(--a-br); color: var(--a500); }

/* Sticky action bar */
.snipe-sticky-bar {
  position: sticky;
  top: 0;
  z-index: 10;
  background: var(--n0);
  border-bottom: 1px solid var(--b-br);
  padding: 6px 14px;
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.snipe-metrics-row {
  display: flex;
  gap: 14px;
  font-size: 11px;
  color: var(--n400);
  flex: 1;
  flex-wrap: wrap;
}
.snipe-metrics-row strong { color: var(--n700); }

/* Gap width color coding */
.snipe-gap-pill--tight  { border-color: var(--r400) !important; }
.snipe-gap-pill--tight  .snipe-gap-width { color: var(--r500); font-weight: 600; }
.snipe-gap-pill--narrow { border-color: var(--a400) !important; }
.snipe-gap-pill--narrow .snipe-gap-width { color: var(--a500); font-weight: 600; }

/* Send time row inside card */
.snipe-send-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--n400);
  flex-wrap: wrap;
}
.snipe-send-time {
  font-family: var(--mono);
  font-size: 11px;
  color: var(--n600);
  font-weight: 600;
}
.snipe-relative-time {
  font-size: 10px;
  color: var(--n300);
}

/* Card header left group (checkbox + coord + unit + badge) */
.snipe-card-hdr-left {
  display: flex;
  align-items: center;
  gap: 5px;
  flex: 1;
  min-width: 0;
}
.snipe-card-checkbox {
  width: 14px;
  height: 14px;
  cursor: pointer;
  flex-shrink: 0;
  accent-color: var(--b500);
}

/* ── WH Balancer ─────────────────────────────────────────────────────────── */
.drawer--balancer { width: var(--w-balancer); }
 
/* Summary */
.bal-summary { padding: 6px 14px 10px; display: flex; flex-direction: column; gap: 5px; }
.bal-summary-row { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
.bal-summary-label { font-size: 10.5px; font-weight: 600; color: var(--n300); text-transform: uppercase; letter-spacing: 0.04em; white-space: nowrap; flex-shrink: 0; }
.bal-summary-val   { font-size: 11.5px; color: var(--n700); font-family: var(--mono); text-align: right; }

/* Badges */
.bal-badge        { display: inline-flex; align-items: center; padding: 1px 5px; border-radius: 4px; font-size: 10px; font-weight: 700; flex-shrink: 0; }
.bal-badge--hq    { background: #fff3b0; border: 1px solid #c8a800; color: #7a6000; }
.bal-badge--cc    { background: var(--b-bg); border: 1px solid #991e43; color: var(--n500); }
 
/* Section header with inline button */
.bal-section-header { display: flex; align-items: center; justify-content: space-between; padding: 8px 14px 4px; }
 
/* Lock rows */
.bal-lock-row                { display: flex; align-items: center; gap: 10px; padding: 8px 14px; border-bottom: 1px solid var(--n100); }
.bal-lock-row:last-child     { border-bottom: none; }
.bal-lock-coord              { flex: 1; font-family: var(--mono); font-size: 12px; color: var(--n700); }
.bal-lock-res                { display: flex; gap: 5px; flex-shrink: 0; align-items: center; }
 
/* HQ rows */
.bal-hq-row              { padding: 8px 14px; border-bottom: 1px solid var(--n100); }
.bal-hq-row:last-child   { border-bottom: none; }
.bal-hq-row--warn        { background: var(--a-bg); }
.bal-hq-top              { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.bal-hq-name             { font-size: 12px; font-weight: 600; color: var(--b500); text-decoration: none; white-space: nowrap; }
.bal-hq-name:hover       { text-decoration: underline; }
.bal-hq-building         { font-size: 11px; color: var(--n400); flex: 1; min-width: 0; }
.bal-hq-eta              { font-size: 11px; color: var(--n300); font-family: var(--mono); white-space: nowrap; }
.bal-hq-status           { font-size: 11px; font-weight: 600; color: var(--g600); white-space: nowrap; }
.bal-hq-status--warn     { color: var(--r500); }
.bal-hq-shortfall        { display: flex; gap: 10px; margin-top: 5px; flex-wrap: wrap; align-items: center; }
.bal-hq-shortfall-eta   { margin-left: auto; font-size: 10.5px; color: var(--n400); font-family: var(--mono); white-space: nowrap; }
.bal-hq-row--skipped { background: var(--n50); opacity: 0.75; }
.bal-hq-status--skipped { font-size: 11px; font-weight: 600; color: var(--n300); white-space: nowrap; }
 
 
/* Send table */
.bal-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
.bal-thead-tr {
  background: var(--n50);
  border-bottom: 2px solid var(--n150);
}
.bal-th {
  padding: 6px 8px;
  font-size: 10.5px;
  font-weight: 600;
  color: var(--n500);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  text-align: left;
  white-space: nowrap;
}
.bal-th-village { min-width: 80px; }
.bal-th-dist    { text-align: center; color: var(--n500); }
.bal-th-res     { text-align: right; min-width: 72px; }
 
.bal-tr {
  border-bottom: 1px solid var(--n100);
  transition: background var(--ease);
}
.bal-tr:last-child { border-bottom: none; }
.bal-tr:hover { background: var(--n50); }
.bal-tr--sent { opacity: 0.35; }
 
.bal-td {
  padding: 7px 8px;
  vertical-align: middle;
}
.bal-td-badges { width: 40px; white-space: nowrap; }
.bal-td-village { max-width: 130px; }
.bal-td-arrow   { color: var(--n200); font-size: 11px; padding: 0 2px; }
.bal-td-dist    { text-align: center; font-size: 10.5px; color: var(--n300); font-family: var(--mono); white-space: nowrap; }
.bal-td-res     { text-align: right; white-space: nowrap; }
.bal-td-action  { text-align: right; white-space: nowrap; width: 60px; }
 
/* Village link + tooltip */
.bal-vil-wrap {
  position: relative;
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
  max-width: 100%;
}
.bal-vil-link {
  font-size: 12px;
  font-weight: 600;
  color: var(--b500);
  text-decoration: none;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 70px;
  display: inline-block;
}
.bal-vil-link:hover { text-decoration: underline; }
.bal-vil-link--nourl { color: var(--n700); cursor: default; }
.bal-vil-coords {
  font-size: 10px;
  color: var(--n300);
  font-family: var(--mono);
  white-space: nowrap;
}
.bal-vil-tooltip {
  position: absolute;
  bottom: calc(100% + 6px);
  left: 0;
  z-index: 999;
  background: var(--n900);
  color: var(--n0);
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 11px;
  white-space: nowrap;
  box-shadow: var(--shadow-xl);
  pointer-events: none;
}
.bal-vil-tooltip::after {
  content: "";
  position: absolute;
  top: 100%;
  left: 12px;
  border: 5px solid transparent;
  border-top-color: var(--n900);
}
.bal-vil-tooltip-name {
  font-weight: 600;
  color: var(--n0);
}
 
.bal-vil-tooltip-stats {
  margin-top: 6px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 11px;
  min-width: 200px;
}
.bal-vil-tooltip-res {
  display: flex;
  gap: 10px;
  align-items: center;
}
.bal-vil-tooltip-res span {
  display: flex;
  align-items: center;
  gap: 3px;
  color: var(--n0);
  font-family: var(--mono);
}
.bal-vil-tooltip-reserve {
  font-size: 10px;
  color: rgba(255,255,255,0.5);
  margin-top: 1px;
}
.bal-vil-tooltip-meta {
  font-size: 11px;
  color: rgba(255,255,255,0.8);
  margin-top: 2px;
  border-top: 1px solid rgba(255,255,255,0.15);
  padding-top: 4px;
}
.bal-vil-tooltip-meta strong {
  color: var(--n0);
}
/* PP thead — distinct from normal thead */
.bal-thead-tr--pp {
  background: var(--b-br);
}
.bal-thead-tr--pp .bal-th {
  color: var(--b500);
}
 
/* ── PP Plans ────────────────────────────────────────────────────────────── */
.bal-pp-plan {
  background: var(--b-bg);
  border-left: 3px solid var(--b400);
}
.bal-pp-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px 6px;
  flex-wrap: wrap;
}
/* PP badge — blue */
.bal-pp-badge {
  background: var(--b-bg);
  border: 1px solid var(--b-br);
  color: var(--b500);
  font-size: 10px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 4px;
  white-space: nowrap;
  flex-shrink: 0;
}
/* ⚡ NOW badge — amber, more urgent */
.bal-pp-badge--now {
  background: var(--a-bg);
  border: 1px solid var(--a-br);
  color: var(--a500);
  font-size: 10px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 4px;
  white-space: nowrap;
  flex-shrink: 0;
}
.bal-pp-desc {
  font-size: 12px;
  color: var(--n700);
  line-height: 1.4;
  flex: 1;
  display: flex;
  align-items: center;
  gap: 3px;
  flex-wrap: wrap;
}
/* Market link */
.bal-pp-market-link {
  font-size: 11px;
  font-weight: 600;
  color: var(--b500);
  text-decoration: none;
  border: 1px solid var(--b-br);
  background: var(--b-bg);
  padding: 2px 8px;
  border-radius: 5px;
  white-space: nowrap;
  flex-shrink: 0;
  transition: background var(--ease), border-color var(--ease);
}
.bal-pp-market-link:hover {
  background: var(--b500);
  color: #fff;
  border-color: var(--b500);
}
/* ETA row */
.bal-pp-eta {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 14px 8px;
}
.bal-pp-eta-label {
  font-size: 10.5px;
  color: var(--n300);
}
.bal-pp-eta-val {
  font-size: 11px;
  font-weight: 600;
  font-family: var(--mono);
  color: var(--n500);
}
.bal-pp-eta-val--ready {
  color: var(--g600);
}
/* PP shipment rows — subtle blue tint */
.bal-tr--pp {
  background: color-mix(in srgb, var(--b500) 4%, var(--n0));
}
.bal-tr--pp:hover {
  background: color-mix(in srgb, var(--b500) 8%, var(--n0));
}

/* ── Desviador ───────────────────────────────────────────────────────────── */
.desv-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--n0);
  overflow: hidden;
  opacity: 0;
  transform: translateX(16px);
  transition: opacity 0.18s ease, transform 0.18s ease;
}
.desv-view.in { opacity: 1; transform: translateX(0); }

.desv-toggle-btn {
  padding: 5px 14px;
  border: 1px solid var(--g-br);
  border-radius: 6px;
  background: var(--g-bg);
  color: var(--g600);
  font-family: 'DM Sans', sans-serif;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  transition: all var(--ease);
}
.desv-toggle-btn:hover { filter: brightness(0.97); }
.desv-toggle-btn--stop { border-color: var(--r-br); background: var(--r-bg); color: var(--r500); }

.desv-controls {
  padding: 10px 14px;
  border-bottom: 1px solid var(--n150);
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.desv-input-row { display: flex; align-items: center; gap: 7px; }
.desv-row-label { font-size: 12px; color: var(--n500); white-space: nowrap; min-width: 82px; }
.desv-row-unit  { font-size: 12px; color: var(--n400); white-space: nowrap; }
.desv-num-input { width: 62px !important; padding: 4px 8px !important; font-size: 12px !important; text-align: right; }

.desv-notif-badge {
  margin-left: auto;
  font-size: 10px;
  padding: 2px 8px;
  border-radius: 20px;
  font-weight: 500;
  white-space: nowrap;
  flex-shrink: 0;
  cursor: default;
  border: 1px solid transparent;
}
.desv-notif-badge--default { background: var(--n100); color: var(--n400); border-color: var(--n200); cursor: pointer; }
.desv-notif-badge--granted { background: var(--g-bg); color: var(--g600); border-color: var(--g-br); }
.desv-notif-badge--denied  { background: var(--r-bg); color: var(--r500); border-color: var(--r-br); }

.desv-mute-btn { padding: 2px 6px; font-size: 12px; line-height: 1.4; background: var(--n100); border: 1px solid var(--n200); border-radius: 4px; color: var(--n500); cursor: pointer; transition: background var(--ease); white-space: nowrap; }
.desv-mute-btn:hover { background: var(--n200); }
.desv-mute-btn--muted { background: var(--r-bg); border-color: var(--r-br); color: var(--r500); }

.desv-cfg-btn { padding: 3px 7px; font-size: 13px; background: var(--n100); border: 1px solid var(--n200); border-radius: 4px; color: var(--n500); cursor: pointer; transition: background var(--ease); }
.desv-cfg-btn:hover { background: var(--n200); }
.desv-cfg-btn--open { background: var(--b-bg); border-color: var(--b-br); color: var(--b500); }

.desv-tag-section { display: flex; flex-direction: column; gap: 4px; }
.desv-tag-section-header { display: flex; align-items: center; gap: 6px; }
.desv-tag-section-label { font-size: 11px; font-weight: 600; padding: 1px 6px; border-radius: 10px; }
.desv-tag-section-label--black { background: var(--b-bg); color: var(--b500); border: 1px solid var(--b-br); }
.desv-tag-section-label--white { background: var(--r-bg); color: var(--r500); border: 1px solid var(--r-br); }
.desv-tag-section-hint { font-size: 11px; color: var(--n400); }

.desv-tag-input { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; min-height: 28px; padding: 3px 6px; background: var(--n50); border: 1px solid var(--n200); border-radius: 6px; cursor: text; }
.desv-tag-input:focus-within { border-color: var(--b400); }
.desv-tag-input--black .desv-tag-chip { background: var(--b-bg); border-color: var(--b-br); color: var(--b500); }
.desv-tag-input--white .desv-tag-chip { background: var(--r-bg); border-color: var(--r-br); color: var(--r500); }
.desv-tag-chip { display: inline-flex; align-items: center; gap: 3px; font-size: 11px; padding: 1px 6px; border-radius: 10px; border: 1px solid transparent; font-weight: 500; }
.desv-tag-chip-x { background: none; border: none; padding: 0 0 0 2px; cursor: pointer; font-size: 13px; line-height: 1; opacity: 0.6; color: inherit; }
.desv-tag-chip-x:hover { opacity: 1; }
.desv-tag-draft { flex: 1; min-width: 80px; background: transparent; border: none; outline: none; font-size: 12px; color: var(--n700); padding: 0 2px; }

.desv-page-warn {
  font-size: 11px;
  color: var(--a500);
  background: var(--a-bg);
  border: 1px solid var(--a-br);
  border-radius: 6px;
  padding: 5px 10px;
}

.desv-toasts {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 0 12px 6px;
}
.desv-toast {
  background: var(--g600);
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  padding: 6px 10px;
  border-radius: 6px;
  animation: desv-toast-in 0.2s ease;
}
@keyframes desv-toast-in {
  from { opacity: 0; transform: translateY(-4px); }
  to   { opacity: 1; transform: translateY(0); }
}

.desv-body {
  flex: 1;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--n200) transparent;
}
.desv-body::-webkit-scrollbar { width: 4px; }
.desv-body::-webkit-scrollbar-thumb { background: var(--n200); border-radius: 2px; }

.desv-empty { padding: 32px 16px; text-align: center; color: var(--n300); font-size: 12px; }

.desv-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
.desv-th {
  padding: 5px 8px;
  background: var(--n50);
  border-bottom: 1px solid var(--n150);
  color: var(--n300);
  font-size: 10px;
  font-weight: 500;
  text-align: left;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  white-space: nowrap;
  position: sticky;
  top: 0;
  z-index: 1;
}
.desv-th--dot { width: 26px; padding-left: 14px; }

.desv-row { border-bottom: 1px solid var(--n100); transition: background var(--ease); }
.desv-row:last-child { border-bottom: none; }
.desv-row:hover { background: var(--n50); }

.desv-td { padding: 6px 8px; font-size: 12px; color: var(--n700); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.desv-td--dot     { width: 26px; padding-left: 14px; }
.desv-td--label   { max-width: 100px; }
.desv-td--village { color: var(--b500); max-width: 90px; }

.desv-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: var(--g400); border: 1px solid var(--g-br); vertical-align: middle; }
.desv-dot--fired     { background: var(--a500); border-color: var(--a-br); }
.desv-dot--recovered { background: var(--r500); border-color: var(--r-br); }

.desv-mono { font-family: var(--mono); font-size: 12px; font-variant-numeric: tabular-nums; color: var(--g600); }
.desv-mono--fired { color: var(--a500); }
.desv-mono--muted { color: var(--n400); }

.desv-hist-panel { border-top: 1px solid var(--n150); background: var(--n50); max-height: 200px; overflow-y: auto; flex-shrink: 0; }
.desv-hist-panel::-webkit-scrollbar { width: 4px; }
.desv-hist-panel::-webkit-scrollbar-thumb { background: var(--n200); border-radius: 2px; }
.desv-hist-head { display: flex; align-items: center; justify-content: space-between; padding: 6px 14px 4px; }
.desv-hist-title { font-size: 11px; font-weight: 600; color: var(--n400); text-transform: uppercase; letter-spacing: 0.05em; }
.desv-hist-clear { font-size: 11px; color: var(--r500); background: none; border: none; cursor: pointer; padding: 0; }
.desv-hist-clear:hover { text-decoration: underline; }
.desv-hist-badge { display: inline-block; font-size: 10px; padding: 0 4px; border-radius: 8px; background: var(--r-bg); color: var(--r500); border: 1px solid var(--r-br); margin-left: 4px; font-weight: 600; vertical-align: middle; }

/* ── Kumin Gluer ─────────────────────────────────────────────────────────── */
.gluer-view {
  background: var(--n0);
}
/* Whole-panel accent matching the selected command type — inset so it survives overflow:hidden */
.gluer-view--attack  { box-shadow: inset 0 0 0 2px var(--r500); }
.gluer-view--support { box-shadow: inset 0 0 0 2px var(--b500); }

.gluer-cfg-note {
  font-size: 10px;
  color: var(--n300);
  font-style: italic;
  padding: 0 2px;
}
.gluer-cfg-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.gluer-cfg-note--inline {
  white-space: nowrap;
}
.gluer-cfg-note--inline em { font-style: normal; opacity: 0.75; }

.gluer-type-toggle {
  display: flex;
  gap: 4px;
}
.gluer-type-btn {
  width: 30px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid transparent;
  border-radius: 5px;
  background: var(--n50);
  cursor: pointer;
  padding: 2px;
  transition: all var(--ease);
}
.gluer-type-btn img { width: 18px; height: 18px; display: block; }
.gluer-type-btn:hover { background: var(--n100); }
.gluer-type-btn--active[data-type="Attack"] {
  border-color: var(--r500);
  background: color-mix(in srgb, var(--r500) 12%, var(--n0));
}
.gluer-type-btn--active[data-type="Support"] {
  border-color: var(--b500);
  background: color-mix(in srgb, var(--b500) 12%, var(--n0));
}

.gluer-queue-badge {
  background: var(--a500);
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 10px;
  flex-shrink: 0;
  line-height: 1.4;
}

.gluer-attack-section {
  background: var(--b-bg);
}
.gluer-attack-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 14px;
  flex-wrap: wrap;
}
.gluer-attack-label {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--n900);
}
.gluer-attack-time-input {
  background: transparent;
  border: none;
  border-bottom: 1px dashed var(--n300);
  color: var(--n700);
  font-size: 11px;
  font-family: var(--mono);
  padding: 1px 2px;
  width: 170px;
  outline: none;
  cursor: text;
}
.gluer-attack-time-input:focus {
  border-bottom-color: var(--b500);
  background: color-mix(in srgb, var(--b500) 6%, var(--n0));
}
.gluer-attack-coord {
  font-family: var(--mono);
  font-size: 12px;
  font-weight: 600;
  color: var(--n700);
}
.gluer-nudge-box {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  margin-left: auto;
}
.gluer-nudge-btn {
  padding: 1px 6px;
  font-size: 13px;
  font-weight: 700;
  line-height: 1;
  min-width: 22px;
}
.gluer-nudge-input {
  width: 52px;
  font-size: 11px;
  font-family: var(--mono);
  padding: 1px 4px;
  text-align: center;
}

.gluer-unit-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.gluer-queue-list {
  display: flex;
  flex-direction: column;
}
.gluer-queue-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 14px;
  border-bottom: 1px solid var(--n100);
}
.gluer-queue-row:last-child { border-bottom: none; }
.gluer-queue-row--stack {
  flex-direction: column;
  align-items: stretch;
  gap: 2px;
}
.gluer-queue-line1 {
  display: flex;
  align-items: center;
  gap: 6px;
}
.gluer-card--queued { border-color: var(--g600); background: color-mix(in srgb, var(--g600) 8%, var(--n0)); }

/* ETA badge — 4-state, token-driven (replaces hand-rolled rgba colors) */
.gluer-eta-badge {
  font-family: var(--mono);
  font-size: 10px;
  font-weight: 700;
  border-radius: 4px;
  padding: 1px 5px;
  flex-shrink: 0;
  border: 1px solid transparent;
}
.gluer-eta-badge--ok     { background: var(--g-bg); border-color: var(--g-br); color: var(--g600); }
.gluer-eta-badge--soon   { background: var(--a-bg); border-color: var(--a-br); color: var(--a500); }
.gluer-eta-badge--urgent { background: var(--r-bg); border-color: var(--r-br); color: var(--r500); }
.gluer-eta-badge--sent   { background: var(--n100); border-color: var(--n200); color: var(--n400); }

.gluer-quickbtn { flex: none; font-size: 10px; padding: 1px 7px; }
.gluer-preset-btn--active {
  border-color: var(--b500);
  background: color-mix(in srgb, var(--b500) 12%, var(--n0));
  color: var(--b500);
}

/* Gluer-only compact unit box — SnipeView keeps the full-size .snipe-unitbox */
.gluer-unitbox--compact { width: 44px; }
.gluer-unitbox--compact .snipe-unit-icon { width: 15px; height: 15px; }
.gluer-unitbox--compact .snipe-unit-input { width: 38px; }

.gluer-unit-filter {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 6px 14px 10px;
}
.gluer-filter-box {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  border: 1px solid var(--n200);
  background: var(--n100);
  cursor: pointer;
  opacity: 0.35;
  transition: opacity .15s, border-color .15s, background .15s;
}
.gluer-filter-box:hover { opacity: 0.65; }
.gluer-filter-box--on {
  opacity: 1;
  border-color: var(--b500);
  background: color-mix(in srgb, var(--b500) 12%, var(--n0));
}
.gluer-queue-info {
  display: flex;
  align-items: center;
  gap: 5px;
  flex: 1;
  min-width: 0;
  flex-wrap: nowrap;
  overflow: hidden;
}
.gluer-queue-idx {
  font-size: 10px;
  color: var(--n300);
  font-family: var(--mono);
  min-width: 18px;
}
.gluer-queue-src, .gluer-queue-tgt {
  font-family: var(--mono);
  font-size: 11px;
  font-weight: 600;
  color: var(--n700);
  white-space: nowrap;
}

.trigger--gluer    { position: relative; top: unset; }
.trigger--twutils  { position: relative; top: unset; }
.trigger--telegram { position: relative; top: unset; }

/* Image icons (module cards, config headers, triggers) */
.card-icon-img {
  width: 20px;
  height: 20px;
  object-fit: contain;
  display: block;
  margin: auto;
  border-radius: 3px;
}
.cfg-icon-img {
  width: 20px;
  height: 20px;
  object-fit: contain;
  display: block;
  border-radius: 3px;
}
.trigger-icon-img {
  width: 18px;
  height: 18px;
  object-fit: contain;
  display: block;
  border-radius: 2px;
}

/* ── Label + Renamer view ────────────────────────────────────────────────── */
.trigger--label { position: relative; top: unset; }
.trigger--mapsel { position: relative; top: unset; }

.label-tag-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  padding: 8px 14px 10px;
}
.label-tag-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 8px 3px 6px;
  border-radius: 5px;
  border: 1px solid var(--n150);
  background: var(--n0);
  font-size: 11px;
  color: var(--n700);
  line-height: 1;
}
.label-tag-pill-name {
  font-weight: 500;
}
.label-tag-count {
  background: var(--n100);
  color: var(--n500);
  font-size: 10px;
  font-weight: 700;
  padding: 1px 5px;
  border-radius: 8px;
}

.label-eta-bar-wrap {
  padding: 4px 14px 10px;
}
.label-eta-text {
  font-size: 11.5px;
  font-family: var(--mono);
  font-weight: 600;
  color: var(--a500);
  margin-bottom: 5px;
}
.label-eta-track {
  height: 4px;
  background: var(--a-bg);
  border: 1px solid var(--a-br);
  border-radius: 2px;
  overflow: hidden;
}
.label-eta-fill {
  height: 100%;
  background: var(--a400);
  border-radius: 2px;
  transition: width 0.5s linear;
}

.label-action-help {
  font-size: 10.5px;
  color: var(--n300);
  padding: 4px 14px 8px;
}

.label-footer-note {
  padding: 10px 14px;
  font-size: 10.5px;
  color: var(--n300);
  text-align: center;
  border-top: 1px solid var(--n150);
  flex-shrink: 0;
}

`;

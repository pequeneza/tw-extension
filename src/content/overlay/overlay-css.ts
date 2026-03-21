// Generated from overlay.css — edit overlay.css, then rebuild
export const OVERLAY_CSS = `
/* overlay.css — modern, semantic, shadow-DOM scoped */

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:host {
  all: initial;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 13px;
  line-height: 1.45;
  -webkit-font-smoothing: antialiased;
}

:host {
  /* surfaces */
  --bg:        #ffffff;
  --bg-sub:    #f5f5f5;
  --bg-hover:  #f0f0f0;
  --bg-press:  #e8e8e8;

  /* borders */
  --br:        #e0e0e0;
  --br-focus:  #3b82f6;

  /* text */
  --tx:        #111111;
  --tx-2:      #555555;
  --tx-3:      #999999;

  /* semantic — green: enabled / live / saved */
  --grn:       #16a34a;
  --grn-bg:    #f0fdf4;
  --grn-br:    #bbf7d0;
  --grn-tx:    #15803d;

  /* semantic — amber: unsaved / configurable */
  --amb:       #d97706;
  --amb-bg:    #fffbeb;
  --amb-br:    #fde68a;
  --amb-tx:    #92400e;

  /* semantic — blue: interactive / focus */
  --blu:       #3b82f6;
  --blu-bg:    #eff6ff;
  --blu-br:    #bfdbfe;

  /* semantic — red: destructive */
  --red:       #dc2626;
  --red-bg:    #fef2f2;
  --red-br:    #fecaca;

  /* disabled */
  --dis:       #d4d4d4;
  --dis-tx:    #a3a3a3;

  --ease:      0.12s ease;
  --r:         8px;
  --r-sm:      5px;
  --w:         340px;

  /* shadow */
  --sh:        0 4px 6px -1px rgba(0,0,0,.07), 0 2px 4px -2px rgba(0,0,0,.05);
  --sh-lg:     0 10px 25px -5px rgba(0,0,0,.12), 0 4px 10px -6px rgba(0,0,0,.08);
}

/* ── Trigger ─────────────────────────────────────────────────────────────────── */
.ov-trigger {
  position: fixed;
  left: 0;
  top: 108px;
  z-index: 2147483640;
  width: 28px;
  height: 28px;
  border-radius: 0 var(--r-sm) var(--r-sm) 0;
  border: 1px solid var(--br);
  border-left: none;
  background: var(--bg);
  color: var(--tx-2);
  font-size: 13px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: var(--sh);
  transition: width var(--ease), background var(--ease), color var(--ease), box-shadow var(--ease);
}
.ov-trigger:hover {
  width: 32px;
  background: var(--bg-sub);
  color: var(--tx);
  box-shadow: var(--sh-lg);
}
.ov-trigger-open {
  width: 32px;
  background: var(--blu-bg);
  border-color: var(--blu-br);
  color: var(--blu);
  box-shadow: var(--sh-lg);
}

/* ── Backdrop ────────────────────────────────────────────────────────────────── */
.ov-backdrop {
  position: fixed;
  inset: 0;
  z-index: 2147483641;
  background: rgba(0,0,0,0.25);
  animation: ov-fade 0.15s ease;
}
@keyframes ov-fade { from { opacity: 0 } to { opacity: 1 } }

/* ── Drawer ──────────────────────────────────────────────────────────────────── */
.ov-drawer {
  position: fixed;
  left: 0; top: 0; bottom: 0;
  width: var(--w);
  z-index: 2147483642;
  transform: translateX(-100%);
  transition: transform 0.22s cubic-bezier(0.4,0,0.2,1);
  pointer-events: none;
}
.ov-drawer-open {
  transform: translateX(0);
  pointer-events: all;
}

/* ── Panel ───────────────────────────────────────────────────────────────────── */
.ov-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg);
  border-right: 1px solid var(--br);
  box-shadow: var(--sh-lg);
  overflow: hidden;
}

/* ── Header ──────────────────────────────────────────────────────────────────── */
.ov-hdr {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 14px 12px;
  background: var(--bg);
  border-bottom: 1px solid var(--br);
  flex-shrink: 0;
}
.ov-hdr-icon {
  font-size: 18px;
  flex-shrink: 0;
  line-height: 1;
}
.ov-hdr-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--tx);
  letter-spacing: -0.01em;
}
.ov-hdr-sub {
  font-size: 11px;
  color: var(--tx-3);
  margin-top: 1px;
}
.ov-hdr-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--tx);
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ov-back {
  display: flex;
  align-items: center;
  gap: 4px;
  background: none;
  border: 1px solid var(--br);
  border-radius: var(--r-sm);
  color: var(--tx-2);
  font-size: 11.5px;
  font-family: inherit;
  padding: 4px 9px;
  cursor: pointer;
  transition: all var(--ease);
  flex-shrink: 0;
}
.ov-back:hover { background: var(--bg-hover); border-color: #ccc; color: var(--tx); }

.ov-close {
  margin-left: auto;
  flex-shrink: 0;
  background: none;
  border: 1px solid transparent;
  border-radius: var(--r-sm);
  color: var(--tx-3);
  padding: 4px 8px;
  font-size: 12px;
  cursor: pointer;
  transition: all var(--ease);
  font-family: inherit;
}
.ov-close:hover { background: var(--red-bg); border-color: var(--red-br); color: var(--red); }

/* ── Search ──────────────────────────────────────────────────────────────────── */
.ov-srch-wrap {
  padding: 10px;
  background: var(--bg-sub);
  border-bottom: 1px solid var(--br);
  flex-shrink: 0;
}
.ov-srch {
  width: 100%;
  padding: 7px 10px;
  background: var(--bg);
  border: 1px solid var(--br);
  border-radius: var(--r-sm);
  color: var(--tx);
  font-family: inherit;
  font-size: 12.5px;
  outline: none;
  transition: border-color var(--ease), box-shadow var(--ease);
}
.ov-srch:focus {
  border-color: var(--br-focus);
  box-shadow: 0 0 0 3px rgba(59,130,246,0.12);
}
.ov-srch::placeholder { color: var(--tx-3); }

/* ── Live strip ──────────────────────────────────────────────────────────────── */
.ov-live-strip {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 6px 12px;
  background: var(--grn-bg);
  border-bottom: 1px solid var(--grn-br);
  font-size: 11px;
  font-weight: 600;
  color: var(--grn-tx);
  flex-shrink: 0;
}
.ov-live-dot {
  width: 6px; height: 6px;
  border-radius: 50%;
  background: var(--grn);
  flex-shrink: 0;
  animation: ov-pulse 2s ease-in-out infinite;
}
@keyframes ov-pulse { 0%,100%{opacity:1} 50%{opacity:.3} }

/* ── Module list ─────────────────────────────────────────────────────────────── */
.ov-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 3px;
  scrollbar-width: thin;
  scrollbar-color: var(--br) transparent;
}
.ov-list::-webkit-scrollbar { width: 4px; }
.ov-list::-webkit-scrollbar-thumb { background: var(--br); border-radius: 2px; }

/* ── Module card ─────────────────────────────────────────────────────────────── */
.ov-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 10px;
  background: var(--bg);
  border: 1px solid var(--br);
  border-radius: var(--r);
  position: relative;
  overflow: hidden;
  transition: background var(--ease), border-color var(--ease);
  user-select: none;
}

/* enabled state — green left bar */
.ov-card::before {
  content: '';
  position: absolute;
  left: 0; top: 0; bottom: 0;
  width: 3px;
  background: transparent;
  transition: background var(--ease);
}
.ov-card.on { background: var(--grn-bg); border-color: var(--grn-br); }
.ov-card.on::before { background: var(--grn); }

/* live state — stronger green + badge */
.ov-card.live { background: var(--grn-bg); border-color: var(--grn); }
.ov-card.live::before { background: var(--grn); }
.ov-card.live::after {
  content: 'LIVE';
  position: absolute;
  top: 5px; right: 8px;
  font-size: 8px;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: var(--grn);
  opacity: 0.75;
}

.ov-card:hover { border-color: #ccc; background: var(--bg-sub); }
.ov-card.on:hover  { border-color: var(--grn); }
.ov-card.live:hover { border-color: var(--grn); }

.ov-card-ico {
  font-size: 17px;
  width: 22px;
  text-align: center;
  flex-shrink: 0;
  line-height: 1;
  opacity: 0.35;
  transition: opacity var(--ease);
}
.ov-card.on .ov-card-ico,
.ov-card.live .ov-card-ico { opacity: 1; }

.ov-card-body { flex: 1; min-width: 0; cursor: pointer; }
.ov-card-name {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--tx-2);
  line-height: 1.2;
  transition: color var(--ease);
}
.ov-card.on .ov-card-name,
.ov-card.live .ov-card-name { color: var(--tx); }
.ov-card-desc {
  font-size: 11px;
  color: var(--tx-3);
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ov-card-acts {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

/* Gear — amber tint when card has config */
.ov-gear {
  width: 26px; height: 26px;
  background: var(--bg-sub);
  border: 1px solid var(--br);
  border-radius: var(--r-sm);
  color: var(--tx-3);
  font-size: 12px;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: all var(--ease);
  flex-shrink: 0;
  font-family: inherit;
}
.ov-gear:hover {
  background: var(--amb-bg);
  border-color: var(--amb-br);
  color: var(--amb);
}

/* ── Toggle ──────────────────────────────────────────────────────────────────── */
.ov-tog {
  position: relative;
  width: 34px; height: 18px;
  flex-shrink: 0;
  display: inline-block;
}
.ov-tog input { opacity: 0; width: 0; height: 0; position: absolute; }
.ov-tog-track {
  position: absolute; inset: 0;
  background: var(--dis);
  border-radius: 9px;
  cursor: pointer;
  transition: background 0.18s ease;
}
.ov-tog-track::after {
  content: '';
  position: absolute;
  top: 3px; left: 3px;
  width: 12px; height: 12px;
  background: #fff;
  border-radius: 50%;
  transition: left 0.18s ease;
  box-shadow: 0 1px 3px rgba(0,0,0,0.2);
}
.ov-tog input:checked + .ov-tog-track { background: var(--grn); }
.ov-tog input:checked + .ov-tog-track::after { left: 19px; }

/* ── Empty / loading ─────────────────────────────────────────────────────────── */
.ov-state {
  text-align: center;
  padding: 32px 16px;
  color: var(--tx-3);
  font-size: 12px;
}

/* ────────────────────────────────────────────────────────────────────────────
   CONFIG VIEW
──────────────────────────────────────────────────────────────────────────── */
.ov-fields {
  flex: 1;
  overflow-y: auto;
  padding: 0;
  display: flex;
  flex-direction: column;
  scrollbar-width: thin;
  scrollbar-color: var(--br) transparent;
}
.ov-fields::-webkit-scrollbar { width: 4px; }
.ov-fields::-webkit-scrollbar-thumb { background: var(--br); border-radius: 2px; }

/* Field row */
.ov-f-row {
  padding: 12px 14px;
  border-bottom: 1px solid var(--br);
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.ov-f-row:last-child { border-bottom: none; }

.ov-f-lbl {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--tx);
  line-height: 1.2;
}
.ov-f-help {
  font-size: 11px;
  color: var(--tx-3);
  line-height: 1.4;
  margin-top: -2px;
}

/* Text / number / select inputs */
.ov-f-inp {
  width: 100%;
  padding: 7px 10px;
  background: var(--bg);
  border: 1px solid var(--br);
  border-radius: var(--r-sm);
  color: var(--tx);
  font-family: inherit;
  font-size: 12.5px;
  outline: none;
  transition: border-color var(--ease), box-shadow var(--ease);
}
.ov-f-inp:focus {
  border-color: var(--br-focus);
  box-shadow: 0 0 0 3px rgba(59,130,246,0.12);
}
.ov-f-inp[type=number] { -moz-appearance: textfield; }
.ov-f-inp[type=number]::-webkit-outer-spin-button,
.ov-f-inp[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; }

/* Number field with a value + range hint */
.ov-f-num-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
}
.ov-f-num-wrap .ov-f-inp {
  flex: 1;
  max-width: 120px;
}
.ov-f-hint {
  font-size: 11px;
  color: var(--tx-3);
}

/* Select */
select.ov-f-inp {
  appearance: none;
  -webkit-appearance: none;
  cursor: pointer;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23999'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 10px center;
  padding-right: 28px;
}

/* Textarea */
.ov-f-ta {
  width: 100%;
  padding: 8px 10px;
  background: var(--bg);
  border: 1px solid var(--br);
  border-radius: var(--r-sm);
  color: var(--tx);
  font-family: 'SFMono-Regular', 'Consolas', monospace;
  font-size: 11px;
  line-height: 1.55;
  outline: none;
  resize: vertical;
  min-height: 90px;
  transition: border-color var(--ease), box-shadow var(--ease);
}
.ov-f-ta:focus {
  border-color: var(--br-focus);
  box-shadow: 0 0 0 3px rgba(59,130,246,0.12);
}

/* Checkbox row */
.ov-f-check { flex-direction: row; align-items: flex-start; gap: 10px; }
.ov-f-chk-lbl {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  cursor: pointer;
  width: 100%;
}

/* ── Config action bar ───────────────────────────────────────────────────────── */
.ov-cfg-acts {
  display: flex;
  gap: 8px;
  padding: 10px 14px;
  background: var(--bg-sub);
  border-top: 1px solid var(--br);
  flex-shrink: 0;
}
.ov-btn {
  flex: 1;
  padding: 8px 14px;
  border-radius: var(--r-sm);
  font-family: inherit;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid;
  transition: all var(--ease);
  text-align: center;
}

/* Reset — red semantic */
.ov-btn-rst {
  background: var(--bg);
  border-color: var(--br);
  color: var(--tx-2);
}
.ov-btn-rst:hover {
  background: var(--red-bg);
  border-color: var(--red-br);
  color: var(--red);
}

/* Save — neutral → amber (dirty) → green (saved) */
.ov-btn-sav {
  background: var(--bg-sub);
  border-color: var(--br);
  color: var(--dis-tx);
}
.ov-btn-sav.dirty {
  background: var(--amb-bg);
  border-color: var(--amb-br);
  color: var(--amb);
}
.ov-btn-sav.dirty:hover {
  background: var(--amb);
  border-color: var(--amb);
  color: #fff;
}
.ov-btn-sav.saved {
  background: var(--grn-bg);
  border-color: var(--grn-br);
  color: var(--grn-tx);
}
.ov-btn-sav:disabled { opacity: 0.45; cursor: default; }

`;

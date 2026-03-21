import React, { useState } from "react";
import { MODULE_CONFIGS, ModuleConfig, ModuleId } from "../types/modules";
import { MODULE_CONFIG_SCHEMAS } from "../types/config-schemas";
import { useModuleSettings } from "./useModuleSettings";
import { useActiveTabModules } from "./useActiveTabModules";
import { ConfigPanel } from "./ConfigPanel";

/* ─── Global CSS ─────────────────────────────────────────────────────────── */
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=Crimson+Pro:ital,wght@0,300;0,400;0,600;1,300&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg0:         #09070304;
    --bg1:         #0d0a06;
    --bg2:         #141008;
    --bg3:         #1b1409;
    --bg4:         #21190a;
    --bg-hover:    #261d0b;
    --br:          #352a14;
    --br-lit:      #56422a;
    --br-gold:     #7a5c2a;
    --gold:        #c8902a;
    --gold-hi:     #e8b84b;
    --gold-lo:     #6b4e1a;
    --gold-glow:   rgba(200,144,42,0.12);
    --gold-glow2:  rgba(200,144,42,0.22);
    --text:        #ddc99a;
    --text-2:      #8a7050;
    --text-3:      #4a3c28;
    --green:       #4a9c5a;
    --green-lo:    #2a5a34;
    --green-glow:  rgba(74,156,90,0.20);
    --red-lo:      #5a2a2a;
    --red-text:    #c06060;
    --page-w:      390px;
    --page-h:      580px;
    --r:           6px;
    --ease:        0.18s ease;
  }

  html, body {
    width: var(--page-w);
    height: var(--page-h);
    overflow: hidden;
    background: var(--bg1);
    color: var(--text);
    font-family: 'Crimson Pro', Georgia, serif;
    font-size: 13px;
    line-height: 1.35;
  }

  /* ── Shell ──────────────────────────────────────────────────────────── */
  .shell {
    display: flex;
    flex-direction: column;
    width: var(--page-w);
    height: var(--page-h);
    overflow: hidden;
  }

  /* ── Sliding view strip ──────────────────────────────────────────────── */
  .views {
    display: flex;
    flex: 1;
    min-height: 0;
    width: calc(var(--page-w) * 2);
    transition: transform 0.22s cubic-bezier(0.4, 0, 0.2, 1);
  }
  .views.at-cfg { transform: translateX(calc(var(--page-w) * -1)); }

  .view {
    width: var(--page-w);
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-height: 0;
  }

  /* ── Header ──────────────────────────────────────────────────────────── */
  .hdr {
    background: linear-gradient(170deg, #201608 0%, var(--bg1) 100%);
    border-bottom: 1px solid var(--br-gold);
    padding: 12px 15px 10px;
    flex-shrink: 0;
    position: relative;
    overflow: hidden;
  }
  .hdr::after {
    content: '';
    position: absolute;
    bottom: 0; left: 10%; right: 10%;
    height: 1px;
    background: linear-gradient(90deg, transparent, var(--gold-lo), transparent);
  }
  .hdr-row { display: flex; align-items: center; gap: 10px; }
  .hdr-crest {
    font-size: 26px; line-height: 1; flex-shrink: 0;
    filter: drop-shadow(0 0 10px rgba(200,144,42,0.45));
  }
  .hdr-title {
    font-family: 'Cinzel', serif;
    font-size: 17px; font-weight: 700;
    color: var(--gold-hi);
    letter-spacing: 0.10em;
    text-shadow: 0 0 22px rgba(232,184,75,0.30);
    line-height: 1;
  }
  .hdr-sub {
    font-size: 10px; color: var(--text-2);
    font-style: italic; letter-spacing: 0.07em;
    margin-top: 2px;
  }
  .hdr-badge {
    margin-left: auto; flex-shrink: 0;
    font-family: 'Cinzel', serif; font-size: 9px;
    color: var(--gold-lo); border: 1px solid var(--gold-lo);
    padding: 2px 7px; border-radius: 2px; letter-spacing: 0.07em;
  }

  /* ── Tab pill for active page ─────────────────────────────────────────── */
  .hdr-page-pill {
    display: flex; align-items: center; gap: 5px;
    font-size: 9.5px; color: var(--text-2);
    font-style: italic; margin-top: 5px;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .hdr-page-dot {
    width: 5px; height: 5px; border-radius: 50%;
    background: var(--green); flex-shrink: 0;
    box-shadow: 0 0 5px var(--green-glow);
    animation: blink 2s ease-in-out infinite;
  }

  /* ── Toolbar ─────────────────────────────────────────────────────────── */
  .toolbar {
    display: flex; align-items: center; gap: 6px;
    padding: 8px 10px;
    background: var(--bg2); border-bottom: 1px solid var(--br);
    flex-shrink: 0;
  }
  .srch { flex: 1; position: relative; }
  .srch-ico {
    position: absolute; left: 9px; top: 50%;
    transform: translateY(-50%);
    font-size: 11.5px; color: var(--text-3);
    pointer-events: none; line-height: 1;
  }
  .srch-inp {
    width: 100%; padding: 6px 8px 6px 27px;
    background: var(--bg1); border: 1px solid var(--br);
    border-radius: var(--r); color: var(--text);
    font-family: inherit; font-size: 12px;
    outline: none; transition: border-color var(--ease);
  }
  .srch-inp:focus { border-color: var(--gold-lo); }
  .srch-inp::placeholder { color: var(--text-3); }

  .pill {
    font-family: 'Cinzel', serif; font-size: 9px;
    letter-spacing: 0.06em; color: var(--text-2);
    background: var(--bg1); border: 1px solid var(--br);
    border-radius: 4px; padding: 5px 9px;
    cursor: pointer; white-space: nowrap;
    transition: all var(--ease); flex-shrink: 0;
  }
  .pill:hover { border-color: var(--br-gold); color: var(--gold); }

  /* ── Stats strip ─────────────────────────────────────────────────────── */
  .strip {
    display: flex; align-items: center;
    justify-content: space-between;
    padding: 4px 13px;
    background: var(--bg1); border-bottom: 1px solid var(--br);
    flex-shrink: 0;
  }
  .strip-l { font-size: 9.5px; color: var(--text-3); font-style: italic; }
  .strip-r { display: flex; align-items: center; gap: 6px; }
  .strip-n { font-family: 'Cinzel', serif; font-size: 9.5px; color: var(--gold-lo); letter-spacing: .05em; }
  .pulse-dot {
    width: 5px; height: 5px; border-radius: 50%;
    background: var(--green); flex-shrink: 0;
    box-shadow: 0 0 5px var(--green-glow);
    animation: blink 2.2s ease-in-out infinite;
  }
  @keyframes blink { 0%,100%{opacity:1} 50%{opacity:.2} }

  /* ── Module list ─────────────────────────────────────────────────────── */
  .mlist {
    flex: 1; overflow-y: auto; padding: 6px 8px;
    display: flex; flex-direction: column; gap: 3px;
    scrollbar-width: thin; scrollbar-color: var(--br) transparent;
  }
  .mlist::-webkit-scrollbar { width: 3px; }
  .mlist::-webkit-scrollbar-thumb { background: var(--br); border-radius: 2px; }

  /* ── Module card ─────────────────────────────────────────────────────── */
  .card {
    display: flex; align-items: center; gap: 9px;
    padding: 8px 10px;
    background: var(--bg3); border: 1px solid var(--br);
    border-radius: var(--r);
    position: relative; overflow: hidden;
    transition: background var(--ease), border-color var(--ease);
    cursor: default;
  }
  /* left accent bar */
  .card::before {
    content: ''; position: absolute;
    left: 0; top: 0; bottom: 0; width: 3px;
    background: transparent;
    transition: background var(--ease);
  }
  .card.on { background: var(--bg4); border-color: var(--br-lit); }
  .card.on::before { background: var(--gold); }
  .card:hover { background: var(--bg-hover); }

  /* "fires on this page" ring */
  .card.live {
    box-shadow: 0 0 0 1px var(--gold-lo) inset;
  }
  .card.live::after {
    content: 'LIVE';
    position: absolute; top: 4px; right: 7px;
    font-family: 'Cinzel', serif; font-size: 7.5px;
    letter-spacing: 0.08em; color: var(--gold-lo);
    opacity: 0.8;
  }

  .card-ico {
    font-size: 18px; width: 26px; text-align: center;
    flex-shrink: 0; line-height: 1;
    filter: grayscale(.5) opacity(.6);
    transition: filter var(--ease);
  }
  .card.on .card-ico { filter: none; }
  .card.live .card-ico { filter: none drop-shadow(0 0 4px rgba(200,144,42,0.4)); }

  .card-body { flex: 1; min-width: 0; cursor: pointer; }
  .card-name {
    font-family: 'Cinzel', serif; font-size: 11px; font-weight: 600;
    color: var(--text-2); letter-spacing: .04em; line-height: 1.15;
    transition: color var(--ease);
  }
  .card.on .card-name,
  .card.live .card-name { color: var(--gold-hi); }
  .card-desc {
    font-size: 10px; color: var(--text-3);
    margin-top: 2px; line-height: 1.3;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .card:hover .card-desc { color: var(--text-2); }

  .card-acts { display: flex; align-items: center; gap: 5px; flex-shrink: 0; }

  /* gear config button */
  .gear {
    background: none; border: 1px solid var(--br);
    border-radius: 4px; color: var(--text-3);
    padding: 3px 6px; font-size: 11px; line-height: 1;
    cursor: pointer; transition: all var(--ease);
  }
  .gear:hover { border-color: var(--br-gold); color: var(--gold); }

  /* toggle switch */
  .tog { position: relative; width: 34px; height: 18px; flex-shrink: 0; }
  .tog input { opacity: 0; width: 0; height: 0; position: absolute; }
  .tog-track {
    position: absolute; inset: 0;
    background: var(--bg1); border: 1px solid var(--br);
    border-radius: 9px; cursor: pointer;
    transition: all .22s ease;
  }
  .tog-track::after {
    content: ''; position: absolute;
    top: 2px; left: 2px; width: 12px; height: 12px;
    background: var(--text-3); border-radius: 50%;
    transition: all .22s ease;
  }
  .tog input:checked + .tog-track {
    background: var(--green); border-color: var(--green-lo);
    box-shadow: 0 0 7px var(--green-glow);
  }
  .tog input:checked + .tog-track::after { left: 18px; background: #fff; }

  /* ── Footer ─────────────────────────────────────────────────────────── */
  .ftr {
    display: flex; align-items: center;
    justify-content: space-between;
    padding: 6px 13px;
    background: var(--bg1); border-top: 1px solid var(--br);
    flex-shrink: 0;
  }
  .ftr-l { font-size: 9px; color: var(--text-3); font-style: italic; }
  .ftr-r { display: flex; align-items: center; gap: 8px; }
  .ftr-link {
    font-family: 'Cinzel', serif; font-size: 9px;
    color: var(--gold-lo); letter-spacing: .05em;
    cursor: pointer; background: none; border: none;
    transition: color var(--ease); padding: 0;
  }
  .ftr-link:hover { color: var(--gold); }

  /* ── States ──────────────────────────────────────────────────────────── */
  .state-loading {
    text-align: center; padding: 48px 20px;
    font-family: 'Cinzel', serif; font-size: 11px;
    letter-spacing: .12em; color: var(--text-2);
    animation: fade 1.5s ease-in-out infinite;
  }
  .state-empty {
    text-align: center; padding: 36px 20px;
    color: var(--text-3); font-style: italic; font-size: 12px;
  }
  @keyframes fade { 0%,100%{opacity:.35} 50%{opacity:1} }

  /* ══════════════════════════════════════════════════════════════════════
     CONFIG PANEL
  ══════════════════════════════════════════════════════════════════════ */
  .cfg-view {
    display: flex; flex-direction: column;
    height: 100%; overflow: hidden;
  }

  /* config header */
  .cfg-hdr {
    display: flex; align-items: center; gap: 9px;
    padding: 10px 13px;
    background: var(--bg2); border-bottom: 1px solid var(--br-gold);
    flex-shrink: 0;
  }
  .cfg-back {
    font-family: 'Cinzel', serif; font-size: 9.5px;
    letter-spacing: .06em; color: var(--gold-lo);
    background: none; border: 1px solid var(--br-gold);
    border-radius: 3px; padding: 4px 9px;
    cursor: pointer; transition: all var(--ease); white-space: nowrap;
  }
  .cfg-back:hover { color: var(--gold); border-color: var(--gold); }
  .cfg-hdr-ico { font-size: 17px; line-height: 1; flex-shrink: 0; }
  .cfg-hdr-name {
    font-family: 'Cinzel', serif; font-size: 13px; font-weight: 600;
    color: var(--gold-hi); letter-spacing: .07em;
    flex: 1; min-width: 0;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }

  /* config fields scroll area */
  .cfg-fields {
    flex: 1; overflow-y: auto; padding: 10px 13px;
    display: flex; flex-direction: column; gap: 11px;
    scrollbar-width: thin; scrollbar-color: var(--br) transparent;
  }
  .cfg-fields::-webkit-scrollbar { width: 3px; }
  .cfg-fields::-webkit-scrollbar-thumb { background: var(--br); border-radius: 2px; }

  /* field rows */
  .f-row { display: flex; flex-direction: column; gap: 3px; }
  .f-row-check { flex-direction: row; align-items: flex-start; gap: 0; }
  .f-check-label {
    display: flex; align-items: flex-start; gap: 10px;
    cursor: pointer; width: 100%;
  }
  .f-lbl {
    font-family: 'Cinzel', serif; font-size: 10px;
    letter-spacing: .05em; color: var(--text-2); font-weight: 600;
  }
  .f-help {
    font-size: 9.5px; color: var(--text-3);
    font-style: italic; line-height: 1.35; margin-top: 1px;
  }

  /* inputs */
  .f-inp, .f-sel {
    background: var(--bg1); border: 1px solid var(--br);
    border-radius: 4px; color: var(--text);
    font-family: inherit; font-size: 12px;
    padding: 5px 8px; outline: none; width: 100%;
    transition: border-color var(--ease);
  }
  .f-inp:focus, .f-sel:focus { border-color: var(--gold-lo); }
  .f-inp[type=number] { -moz-appearance: textfield; }
  .f-inp[type=number]::-webkit-outer-spin-button,
  .f-inp[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; }

  .f-ta {
    background: var(--bg1); border: 1px solid var(--br);
    border-radius: 4px; color: var(--text);
    font-family: 'Courier New', monospace; font-size: 10.5px;
    padding: 7px 8px; outline: none; resize: vertical; width: 100%;
    transition: border-color var(--ease); line-height: 1.5;
  }
  .f-ta:focus { border-color: var(--gold-lo); }

  /* mini toggle (inside cfg fields) */
  .f-tog { position: relative; width: 34px; height: 18px; flex-shrink: 0; margin-top: 1px; }
  .f-tog input { opacity: 0; width: 0; height: 0; position: absolute; }
  .f-tog-track {
    position: absolute; inset: 0;
    background: var(--bg1); border: 1px solid var(--br);
    border-radius: 9px; cursor: pointer; transition: all .22s ease;
  }
  .f-tog-track::after {
    content: ''; position: absolute;
    top: 2px; left: 2px; width: 12px; height: 12px;
    background: var(--text-3); border-radius: 50%; transition: all .22s;
  }
  .f-tog input:checked + .f-tog-track { background: var(--green); border-color: var(--green-lo); }
  .f-tog input:checked + .f-tog-track::after { left: 18px; background: #fff; }

  /* config action bar */
  .cfg-acts {
    display: flex; gap: 8px; padding: 10px 13px;
    background: var(--bg2); border-top: 1px solid var(--br);
    flex-shrink: 0;
  }
  .cfg-btn {
    flex: 1; font-family: 'Cinzel', serif; font-size: 10px;
    letter-spacing: .07em; padding: 7px 12px;
    border-radius: 4px; cursor: pointer;
    transition: all var(--ease); border: 1px solid;
  }
  .cfg-rst { background: transparent; border-color: var(--br); color: var(--text-3); }
  .cfg-rst:hover { border-color: var(--red-lo); color: var(--red-text); }

  .cfg-sav { background: var(--bg1); border-color: var(--br); color: var(--text-3); }
  .cfg-sav.dirty { border-color: var(--gold-lo); color: var(--gold); background: var(--gold-glow); }
  .cfg-sav.saved { border-color: var(--green-lo); color: var(--green); background: var(--green-glow); }
  .cfg-sav:disabled { opacity: .4; cursor: default; }

  /* config panel states */
  .cfg-none {
    flex: 1; display: flex; align-items: center; justify-content: center;
    padding: 30px; text-align: center;
    color: var(--text-3); font-style: italic; font-size: 12px;
  }
  .cfg-loading {
    text-align: center; padding: 30px;
    font-family: 'Cinzel', serif; font-size: 11px;
    letter-spacing: .10em; color: var(--text-2);
    animation: fade 1.5s ease-in-out infinite;
  }

  /* section divider inside cfg-fields */
  .f-divider {
    height: 1px; background: var(--br); margin: 4px 0;
  }
`;

/* ─── ModuleCard ──────────────────────────────────────────────────────────── */
interface CardProps {
  mod: ModuleConfig;
  enabled: boolean;
  live: boolean;          // fires on active TW tab?
  hasConfig: boolean;
  onToggle: () => void;
  onConfigure: () => void;
}

function ModuleCard({ mod, enabled, live, hasConfig, onToggle, onConfigure }: CardProps) {
  const cls = ["card", enabled ? "on" : "", live ? "live" : ""].filter(Boolean).join(" ");
  return (
    <div className={cls}>
      <span className="card-ico">{mod.icon}</span>

      <div className="card-body" onClick={onToggle} role="button" tabIndex={0}
           onKeyDown={(e) => e.key === "Enter" && onToggle()}>
        <div className="card-name">{mod.label}</div>
        <div className="card-desc">{mod.description}</div>
      </div>

      <div className="card-acts">
        {hasConfig && (
          <button
            className="gear"
            title="Configure settings"
            onClick={(e) => { e.stopPropagation(); onConfigure(); }}
            aria-label={`Configure ${mod.label}`}
          >
            ⚙
          </button>
        )}
        <label className="tog" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={enabled}
            onChange={onToggle}
            aria-label={`Toggle ${mod.label}`}
          />
          <span className="tog-track" />
        </label>
      </div>
    </div>
  );
}

/* ─── App ─────────────────────────────────────────────────────────────────── */
export function App() {
  const { loading, toggle, isEnabled } = useModuleSettings();
  const { url, activeIds }             = useActiveTabModules();
  const [search, setSearch]            = useState("");
  const [configId, setConfigId]        = useState<ModuleId | null>(null);

  /* filtered list */
  const q = search.toLowerCase();
  const filtered = MODULE_CONFIGS.filter(
    (m) => m.label.toLowerCase().includes(q) || m.description.toLowerCase().includes(q)
  );

  /* stats */
  const enabledCount = MODULE_CONFIGS.filter((m) => isEnabled(m.id)).length;
  const liveCount    = Array.from(activeIds).filter((id) =>
    isEnabled(id)
  ).length;

  /* active config target */
  const configMod = configId ? MODULE_CONFIGS.find((m) => m.id === configId) : null;

  /* bulk actions */
  const enableAll  = () => MODULE_CONFIGS.forEach((m) => { if (!isEnabled(m.id)) toggle(m.id); });
  const disableAll = () => MODULE_CONFIGS.forEach((m) => { if (isEnabled(m.id))  toggle(m.id); });

  /* page label */
  const pageLabel = url
    ? url.split("game.php")[1]?.replace(/^\?/, "").slice(0, 48) ?? url.slice(0, 48)
    : null;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <div className="shell">
        {/* ── Header (always visible) ──────────────────────────────── */}
        <div className="hdr">
          <div className="hdr-row">
            <span className="hdr-crest">🏰</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="hdr-title">TW Suite</div>
              <div className="hdr-sub">TribalWars Automation · PT</div>
            </div>
            <span className="hdr-badge">v1.0</span>
          </div>
          {pageLabel && (
            <div className="hdr-page-pill">
              <span className="hdr-page-dot" />
              <span title={url ?? ""}>
                {liveCount > 0
                  ? `${liveCount} module${liveCount > 1 ? "s" : ""} active · ${pageLabel}`
                  : `No modules match · ${pageLabel}`}
              </span>
            </div>
          )}
        </div>

        {/* ── Sliding views ─────────────────────────────────────────── */}
        <div className={`views${configId ? " at-cfg" : ""}`}>

          {/* ══ VIEW 1 — Module list ══════════════════════════════════ */}
          <div className="view">
            {/* Toolbar */}
            <div className="toolbar">
              <div className="srch">
                <span className="srch-ico">🔍</span>
                <input
                  className="srch-inp"
                  type="text"
                  placeholder="Search modules…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  aria-label="Search modules"
                />
              </div>
              <button className="pill" onClick={enableAll}  aria-label="Enable all">All on</button>
              <button className="pill" onClick={disableAll} aria-label="Disable all">All off</button>
            </div>

            {/* Stats strip */}
            <div className="strip">
              <span className="strip-l">
                {enabledCount}/{MODULE_CONFIGS.length} enabled
                {activeIds.size > 0 && ` · ${activeIds.size} match this page`}
              </span>
              <div className="strip-r">
                {filtered.length !== MODULE_CONFIGS.length && (
                  <span className="strip-n">{filtered.length} shown</span>
                )}
                <div className="pulse-dot" />
              </div>
            </div>

            {/* Module list */}
            <div className="mlist" role="list">
              {loading ? (
                <div className="state-loading">Loading modules…</div>
              ) : filtered.length === 0 ? (
                <div className="state-empty">No modules match "{search}"</div>
              ) : (
                filtered.map((mod) => (
                  <ModuleCard
                    key={mod.id}
                    mod={mod}
                    enabled={isEnabled(mod.id)}
                    live={activeIds.has(mod.id)}
                    hasConfig={Boolean(MODULE_CONFIG_SCHEMAS[mod.id])}
                    onToggle={() => toggle(mod.id)}
                    onConfigure={() => setConfigId(mod.id)}
                  />
                ))
              )}
            </div>

            {/* Footer */}
            <div className="ftr">
              <span className="ftr-l">Scripts injected on matching TW game pages</span>
              <div className="ftr-r">
                <button
                  className="ftr-link"
                  onClick={enableAll}
                  title="Enable all modules"
                >
                  All on
                </button>
                <span style={{ color: "var(--br)", fontSize: 10 }}>|</span>
                <button
                  className="ftr-link"
                  onClick={disableAll}
                  title="Disable all modules"
                >
                  All off
                </button>
              </div>
            </div>
          </div>

          {/* ══ VIEW 2 — Config panel ══════════════════════════════════ */}
          <div className="view">
            {configId ? (
              <div className="cfg-view">
                {/* Config header */}
                <div className="cfg-hdr">
                  <button className="cfg-back" onClick={() => setConfigId(null)}>
                    ← Back
                  </button>
                  <span className="cfg-hdr-ico">{configMod?.icon}</span>
                  <span className="cfg-hdr-name">{configMod?.label}</span>
                </div>

                {/* Config fields */}
                <ConfigPanel id={configId} onClose={() => setConfigId(null)} />
              </div>
            ) : (
              <div className="cfg-none">Select a module ⚙ to configure.</div>
            )}
          </div>

        </div>
      </div>
    </>
  );
}

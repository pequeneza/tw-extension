/**
 * LabelView — in-overlay panel for the Mass Label + Renamer module.
 *
 * Two tabs, same shell as FakeSenderView: Status (incoming tag overview) and
 * Settings (persisted config via chrome.storage.sync, same schema ConfigView
 * used to render before this module got its own dedicated view). The
 * pin-to-overlay toggle lives in the shared header so it stays reachable
 * regardless of tab — previously it only lived here while the module card's
 * own button routed to a separate, disconnected ConfigView with no pin
 * control at all.
 *
 * The Live overview totals (total/untagged/nobles/tagCounts) are fetched
 * on demand only (Refresh button), walking every incomings page — not a
 * continuous per-second snapshot of whatever page the userscript's own tick
 * loop happens to be looking at. Only the auto-label countdown is still a
 * live tick, polled from sessionStorage["mlr_etiqueta_deadline_v1"].
 */

import React, { useCallback, useEffect, useState } from "react";
import { MODULE_CONFIG_SCHEMAS, FieldDef } from "../../types/config-schemas";
import { TriggerVisibilityToggle } from "./TriggerVisibilityToggle";

const SNOB_ICON = "https://dspt.innogamescdn.com/asset/b2fb8d33/graphic/unit/unit_snob.webp";

/* ─── Data types ──────────────────────────────────────────────────────────── */
interface MlrStats {
  total: number;
  untagged: number;
  nobles: number;
  tagCounts: Record<string, number>;
}

const DEFAULT_STATS: MlrStats = {
  total: 0,
  untagged: 0,
  nobles: 0,
  tagCounts: {},
};

/* ─── Full-account stats fetch — on demand only, walks every incomings page ── */
// Same tag list as the userscript's TAGS array (order matters for singleTagIndex parity).
const TAGS = [
  "[Morto]", "[Desviado]", "[Desviar]", "[Reconquistar]", "[Reconquistado]",
  "[Snipado]", "[Snipar]", "[Fubar]", "[Snipe Cancel]", "[Fake]",
  "[Possível Full]", "[Reforçar]", " | Retirar", " | Vigiar", " | ✓",
];

function jitter(baseMs: number, spreadMs: number): number {
  return Math.max(0, Math.round(baseMs + (Math.random() * 2 - 1) * spreadMs));
}
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function singleTagIndex(name: string): number {
  for (let i = 0; i < TAGS.length; i++) if (name.indexOf(TAGS[i]!) !== -1) return i;
  return -1;
}
function hasDualTag(name: string): boolean {
  for (let i = 0; i < TAGS.length; i++) {
    for (let j = 0; j < TAGS.length; j++) {
      if (i !== j && name.indexOf(TAGS[i]! + TAGS[j]!) !== -1) return true;
    }
  }
  return false;
}
function rowLabel(row: Element): string {
  const lbl = row.querySelector("td:first-child .quickedit-label");
  const text = lbl ? lbl.textContent : row.querySelector("td:first-child")?.textContent;
  return (text ?? "").trim();
}
function isNobleRow(row: Element): boolean {
  const imgs = row.querySelectorAll("img");
  for (const img of Array.from(imgs)) {
    const src = (img.getAttribute("src") ?? "").toLowerCase();
    if (src.includes("snob") || src.includes("nobre")) return true;
  }
  return rowLabel(row).toLowerCase().includes("nobre");
}

/** Same URL formula as mass_label_renamer.user.js's buildIncomingsUrl — the
 * incomings overview is per-village, so paging without a village id in the
 * query string leaves the server to guess at which village's list to page. */
function buildIncomingsUrl(page: number): string {
  const gd = (window as Window & { game_data?: { village?: { id?: number } } }).game_data;
  const vid = gd?.village?.id ?? "";
  return `${location.origin}/game.php?village=${vid}` +
         `&screen=overview_villages&mode=incomings&subtype=attacks&group=0&page=${page}`;
}

/** Same redirect-detection the userscript's own paged auto-label run uses:
 * requesting a page past the last real one doesn't error, it silently
 * re-renders an earlier page — so the header's row-count total can't be
 * trusted as a stop signal (worse, it visibly drifts on a live account as
 * attacks land between fetches). Reading the pagination widget's own
 * <strong> tag tells us which page TW actually rendered; once that stops
 * matching the page we asked for, we've looped back and should stop. */
function getRenderedPage(doc: Document): number {
  const items = doc.querySelectorAll(".paged-nav-item");
  if (!items.length) return -1;
  const td = items[0]?.closest("td");
  if (!td) return -1;
  const text = (td.querySelector("strong")?.textContent ?? "").replace(/[^0-9]/g, "");
  const n = parseInt(text, 10);
  return isNaN(n) ? -1 : n - 1; // TW shows 1-indexed; convert to 0-indexed
}

/** Walks every incomings page (subtype=attacks), tallying labels client-side —
 * avoids the account's own "Com nobre"/"Etiqueta de comando" filters, which are
 * session-persisted POSTs rather than something a plain GET can apply. */
async function fetchFullLabelStats(): Promise<MlrStats> {
  const MAX_PAGES = 25;
  let untagged = 0, nobles = 0, rowsSeen = 0;
  const tagCounts: Record<string, number> = {};

  for (let page = 0; page < MAX_PAGES; page++) {
    await sleep(jitter(350, 200));
    const html = await fetch(buildIncomingsUrl(page), { credentials: "include" }).then((r) => r.text());
    const doc = new DOMParser().parseFromString(html, "text/html");

    const rows = Array.from(doc.querySelectorAll("#incomings_table tr.nowrap"));
    if (!rows.length) break;

    // No pagination widget at all (-1) means it's a single page — fine.
    // Otherwise, if TW rendered a different page than requested, we've been
    // redirected back to already-counted content — stop before double-counting.
    const rendered = getRenderedPage(doc);
    if (rendered !== -1 && rendered !== page) break;

    rows.forEach((row) => {
      if (isNobleRow(row)) nobles++;
      const name = rowLabel(row);
      const idx = singleTagIndex(name);
      if (idx === -1 && !hasDualTag(name)) {
        untagged++;
      } else if (idx !== -1) {
        const key = TAGS[idx]!;
        tagCounts[key] = (tagCounts[key] ?? 0) + 1;
      }
    });

    rowsSeen += rows.length;
    if (rendered === -1) break; // single page, nothing more to walk
  }

  return { total: rowsSeen, untagged, nobles, tagCounts };
}

const LIVE_STATS_KEY = "mlr_live_stats_v1";
function loadCachedStats(): MlrStats {
  try {
    const raw = JSON.parse(localStorage.getItem(LIVE_STATS_KEY) ?? "null");
    if (raw && typeof raw.total === "number") return raw as MlrStats;
  } catch { /* ignore parse errors */ }
  return DEFAULT_STATS;
}
function saveCachedStats(stats: MlrStats) {
  try { localStorage.setItem(LIVE_STATS_KEY, JSON.stringify(stats)); } catch { /* ignore */ }
}

/* ─── Tag colour palette (matches userscript PALETTE) ────────────────────── */
const TAG_COLORS: Record<string, string> = {
  "[Morto]":         "#31c908",
  "[Desviado]":      "#ef8b10",
  "[Desviar]":       "#9232a8",
  "[Reconquistar]":  "#adb6c6",
  "[Reconquistado]": "#ffffff",
  "[Snipado]":       "#22e5db",
  "[Snipar]":        "#0d83dd",
  "[Fubar]":         "#004c00",
  "[Snipe Cancel]":  "#e20606",
  "[Fake]":          "#FFC0CB",
  "[Possível Full]": "#00007f",
  "[Reforçar]":      "#000000",
  " | Retirar":      "#0d9488",
  " | Vigiar":       "#ffd91c",
  " | ✓":            "#93cf82",
};

/** Strip surrounding brackets/pipes and trim for a short display name. */
function shortTagName(tag: string): string {
  return tag.replace(/^\[|\]$/g, "").replace(/^\s*\|\s*/, "").trim();
}

/* ─── Storage helpers (mirrors FakeSenderView) ───────────────────────────── */
function storageGet(keys: string[]): Promise<Record<string, unknown>> {
  return new Promise((res) =>
    chrome.storage.sync.get(keys, (r) => res(r as Record<string, unknown>))
  );
}
function storageSet(data: Record<string, unknown>): Promise<void> {
  return new Promise((res) => chrome.storage.sync.set(data, res));
}

type Tab = "status" | "settings";
type CfgValues = Record<string, string | number | boolean>;

const SCHEMA = MODULE_CONFIG_SCHEMAS["mass_label_renamer"]!;

/* ─── useLabelCfg — chrome.storage.sync for settings ─────────────────────── */
function useLabelCfg(active: boolean) {
  const defaults: CfgValues = Object.fromEntries(
    SCHEMA.fields.map((f: FieldDef) => [f.key, f.default])
  );
  const [vals, setVals]   = useState<CfgValues>(defaults);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!active) return;
    storageGet([SCHEMA.storageKey]).then((r) => {
      const synced = (r[SCHEMA.storageKey] as CfgValues) ?? {};
      setVals({ ...defaults, ...synced });
      setDirty(false);
      setSaved(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const set = useCallback((key: string, val: string | number | boolean) => {
    setVals((p) => ({ ...p, [key]: val }));
    setDirty(true);
    setSaved(false);
  }, []);

  const save = useCallback(async () => {
    await storageSet({ [SCHEMA.storageKey]: vals });
    setDirty(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2200);
  }, [vals]);

  const reset = useCallback(async () => {
    await storageSet({ [SCHEMA.storageKey]: defaults });
    setVals(defaults);
    setDirty(false);
    setSaved(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { vals, dirty, saved, set, save, reset };
}

/* ─── useMountAnim ────────────────────────────────────────────────────────── */
function useMountAnim(trigger: boolean) {
  const [anim, setAnim] = useState(false);
  useEffect(() => {
    if (trigger) requestAnimationFrame(() => setAnim(true));
    else setAnim(false);
  }, [trigger]);
  return anim;
}

/* ─── SettingsField ───────────────────────────────────────────────────────── */
function SettingsField({ f, val, set }: {
  f: FieldDef;
  val: unknown;
  set: (k: string, v: string | number | boolean) => void;
}) {
  const v = val !== undefined ? val : f.default;

  if (f.type === "checkbox") return (
    <label className="field-check">
      <span className="field-check-text">
        <span className="field-label">{f.label}</span>
        {f.help && <span className="field-help">{f.help}</span>}
      </span>
      <span className="toggle" onClick={(e) => e.stopPropagation()}>
        <input type="checkbox" checked={Boolean(v)}
          onChange={(e) => set(f.key, e.target.checked)} />
        <span className="toggle-thumb" />
      </span>
    </label>
  );

  if (f.type === "select" && f.options) return (
    <div className="field">
      <span className="field-label">{f.label}</span>
      {f.help && <span className="field-help">{f.help}</span>}
      <select className="input" value={String(v)}
        onChange={(e) => set(f.key, e.target.value)}>
        {f.options.map((o: { value: string; label: string }) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );

  const isNum = f.type === "number";
  const rangeHint = isNum && f.min !== undefined && f.max !== undefined
    ? `${f.min}–${f.max}`
    : "";

  return (
    <div className="field">
      <div className="field-top">
        <span className="field-label">{f.label}</span>
        {rangeHint && <span className="field-range">{rangeHint}</span>}
      </div>
      {f.help && <span className="field-help">{f.help}</span>}
      <input
        className="input"
        type={f.type}
        value={String(v)}
        min={f.min} max={f.max} step={f.step}
        onChange={(e) => {
          if (isNum) {
            const n = parseFloat(e.target.value);
            set(f.key, Number.isFinite(n) ? n : f.default as number);
          } else {
            set(f.key, e.target.value);
          }
        }}
      />
    </div>
  );
}

/* ─── SettingsTab ─────────────────────────────────────────────────────────── */
function SettingsTab({ vals, set }: {
  vals: CfgValues;
  set: (k: string, v: string | number | boolean) => void;
}) {
  const checks = SCHEMA.fields.filter((f: FieldDef) => f.type === "checkbox");
  const inputs = SCHEMA.fields.filter((f: FieldDef) => f.type !== "checkbox");

  return (
    <div className="cfg-body">
      <div className="cfg-section">
        {inputs.map((f: FieldDef) => (
          <SettingsField key={f.key} f={f} val={vals[f.key]} set={set} />
        ))}
      </div>
      {checks.length > 0 && (
        <div className="cfg-section cfg-section-checks">
          <div className="section-label">Options</div>
          {checks.map((f: FieldDef) => (
            <SettingsField key={f.key} f={f} val={vals[f.key]} set={set} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── StatusTab ───────────────────────────────────────────────────────────── */
function StatusTab({
  stats, etiquetaDeadline, onBulkFake, onRefresh, refreshing, refreshError,
}: {
  stats: MlrStats;
  etiquetaDeadline: number | null;
  onBulkFake: () => void;
  onRefresh: () => void;
  refreshing: boolean;
  refreshError: boolean;
}) {
  const { total, untagged, nobles, tagCounts } = stats;
  const labeled = total - untagged;

  const activeTags = Object.entries(tagCounts).filter(([, count]) => count > 0);

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (etiquetaDeadline === null) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [etiquetaDeadline]);

  function renderCountdown() {
    if (etiquetaDeadline === null) return null;
    const remaining = Math.max(0, Math.ceil((etiquetaDeadline - now) / 1000));

    // Estimate start: deadline minus a representative total window (minDelay + maxExtra/2)
    // Since we only store the deadline we derive an approximate elapsed fraction.
    // Use a fixed representative window of 135 s (120 min + 30/2 extra) as fallback.
    const representativeWindow = 135 * 1000;
    const elapsed = Math.max(0, representativeWindow - (etiquetaDeadline - now));
    const fillPct = Math.min(100, Math.round((elapsed / representativeWindow) * 100));

    return (
      <div className="cfg-section">
        <div className="section-label">Auto-label</div>
        <div className="label-eta-bar-wrap">
          <div className="label-eta-text">{remaining}s remaining</div>
          <div className="label-eta-track">
            <div className="label-eta-fill" style={{ width: `${fillPct}%` }} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="cfg-body">

      {/* Section 1 — Live overview */}
      <div className="cfg-section">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingRight: 10 }}>
          <div className="section-label" style={{ padding: "8px 14px 4px" }}>Live overview</div>
          <button
            className="stat-refresh-btn"
            onClick={onRefresh}
            disabled={refreshing}
            title={refreshError ? "Falhou — clica para tentar de novo" : "Verificar todas as páginas de incomings (pede dados à Tribal Wars)"}
          >
            {refreshing ? <span className="spinner" /> : refreshError ? "⚠" : "↻"}
          </button>
        </div>
        <div className="stats-bar" style={{ height: "auto", padding: "8px 12px" }}>
          <div className="stat-cell">
            <span className="stat-label">Total</span>
            <span className="stat-value">{total}</span>
          </div>
          <div className="stat-cell">
            <span className="stat-label">Labeled</span>
            <span className="stat-value" style={{ color: "var(--g500)" }}>{labeled}</span>
          </div>
          <div className="stat-cell">
            <span className="stat-label">Untagged</span>
            <span
              className="stat-value"
              style={{ color: untagged === 0 ? "var(--g500)" : "var(--a500)" }}
            >
              {untagged}
            </span>
          </div>
          <div className="stat-cell">
            <span className="stat-label">
              <img src={SNOB_ICON} alt="Nobre" style={{ width: 14, height: 14, verticalAlign: "middle", marginRight: 2 }} />
            </span>
            <span
              className="stat-value"
              style={{ color: nobles > 0 ? "var(--r500)" : "var(--n300)" }}
            >
              {nobles}
            </span>
          </div>
        </div>
      </div>

      {/* Section 2 — Tag breakdown */}
      {activeTags.length > 0 && (
        <div className="cfg-section">
          <div className="section-label">Active tags</div>
          <div className="label-tag-pills">
            {activeTags.map(([tag, count]) => {
              const color = TAG_COLORS[tag] ?? "#9ca3af";
              return (
                <span
                  key={tag}
                  className="label-tag-pill"
                  style={{ borderLeft: `3px solid ${color}` }}
                >
                  <span className="label-tag-pill-name">{shortTagName(tag)}</span>
                  <span className="label-tag-count">{count}</span>
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Section 3 — Auto-label countdown */}
      {renderCountdown()}

      {/* Section 4 — Quick actions */}
      <div className="cfg-section">
        <div className="section-label">Quick actions</div>
        <div style={{ padding: "8px 14px 4px" }}>
          <button
            className={`btn btn-save${untagged > 0 ? " btn-save--dirty" : ""}`}
            style={{ width: "100%" }}
            onClick={onBulkFake}
            disabled={untagged === 0}
          >
            Mark all untagged as [Fake]
          </button>
        </div>
        <div className="label-action-help">
          Applies [Fake] to all red (untagged) rows on the current page.
        </div>
      </div>

    </div>
  );
}

/* ─── TabButton helper (mirrors FakeSenderView) ──────────────────────────── */
function TabButton({ active, onClick, children }: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1,
        padding: "8px 12px",
        background: "none",
        border: "none",
        borderBottom: active ? "2px solid var(--b500)" : "2px solid transparent",
        color: active ? "var(--b500)" : "var(--n400)",
        fontFamily: "inherit",
        fontSize: 12.5,
        fontWeight: active ? 600 : 400,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 4,
        transition: "color 0.14s ease, border-color 0.14s ease",
      }}
    >
      {children}
    </button>
  );
}

/* ─── LabelView ───────────────────────────────────────────────────────────── */
export function LabelView({
  visible,
  onBack,
  onClose,
}: {
  visible: boolean;
  onBack: () => void;
  onClose: () => void;
}) {
  const anim = useMountAnim(visible);
  const [tab, setTab] = useState<Tab>("status");

  const [stats, setStats] = useState<MlrStats>(loadCachedStats);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState(false);
  const [etiquetaDeadline, setEtiquetaDeadline] = useState<number | null>(null);
  const { vals, dirty, saved, set, save, reset } = useLabelCfg(visible && tab === "settings");

  // Reset to status tab when closed, so it feels fresh on re-open
  useEffect(() => {
    if (!visible) setTab("status");
  }, [visible]);

  /* Auto-label countdown is the only thing still ticking live — poll it
   * from sessionStorage while visible. The Live overview totals below are
   * fetched only when the user hits Refresh (see refreshStats). */
  useEffect(() => {
    if (!visible) return;
    const read = () => {
      try {
        const raw = sessionStorage.getItem("mlr_etiqueta_deadline_v1");
        setEtiquetaDeadline(raw ? (JSON.parse(raw) as number | null) : null);
      } catch { /* ignore parse errors */ }
    };
    read();
    const id = setInterval(read, 500);
    return () => clearInterval(id);
  }, [visible]);

  const refreshStats = useCallback(async () => {
    setRefreshing(true);
    setRefreshError(false);
    try {
      const fresh = await fetchFullLabelStats();
      setStats(fresh);
      saveCachedStats(fresh);
    } catch (err) {
      console.error("[LabelView] refreshStats:", err);
      setRefreshError(true);
    } finally {
      setRefreshing(false);
    }
  }, []);

  function handleBulkFake() {
    document.dispatchEvent(new CustomEvent("xbot:labelrenamer:bulk_fake"));
  }

  return (
    <div
      className={`cfg-view${anim ? " in" : ""}`}
      style={{ display: visible ? "flex" : "none" }}
    >
      {/* ── Header ── */}
      <div className="cfg-header">
        <button className="back-btn" onClick={onBack} aria-label="Back">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M9 2L4 7l5 5" stroke="currentColor" strokeWidth="1.8"
              strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <span className="cfg-icon">🏷️</span>
        <div className="cfg-header-text">
          <span className="cfg-title">Label + Renamer</span>
          <span className="cfg-subtitle">Live incoming tag overview</span>
        </div>
        {tab === "settings" && (
          <span className="cfg-status-dot"
            data-dirty={String(dirty)} data-saved={String(saved)} />
        )}
        <TriggerVisibilityToggle moduleId="mass_label_renamer" />
        <button className="close-btn" onClick={onClose} aria-label="Close">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M2 2l10 10M12 2L2 12" stroke="currentColor"
              strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* ── Tab bar ── */}
      <div style={{
        display: "flex",
        borderBottom: "1px solid var(--n150)",
        background: "var(--n50)",
        flexShrink: 0,
      }}>
        <TabButton active={tab === "status"} onClick={() => setTab("status")}>
          Status
        </TabButton>
        <TabButton active={tab === "settings"} onClick={() => setTab("settings")}>
          Settings
          {dirty && (
            <span className="meta-chip" style={{
              marginLeft: 5, fontSize: 10,
              background: "var(--a-bg)", color: "var(--a500)", border: "1px solid var(--a-br)"
            }}>●</span>
          )}
        </TabButton>
      </div>

      {/* ── Tab content ── */}
      {tab === "status" && (
        <StatusTab
          stats={stats}
          etiquetaDeadline={etiquetaDeadline}
          onBulkFake={handleBulkFake}
          onRefresh={refreshStats}
          refreshing={refreshing}
          refreshError={refreshError}
        />
      )}
      {tab === "settings" && <SettingsTab vals={vals} set={set} />}

      {/* ── Footer — context-sensitive ── */}
      <div className="cfg-footer">
        {tab === "status" ? (
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onBack}>← Back</button>
        ) : (
          <>
            <button className="btn btn-ghost" onClick={reset}>Reset</button>
            <button
              className={`btn btn-save${dirty ? " btn-save--dirty" : ""}${saved ? " btn-save--saved" : ""}`}
              onClick={save}
              disabled={!dirty && !saved}
            >
              {saved ? <>✓ Saved</> : dirty ? "Save changes" : "Saved"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

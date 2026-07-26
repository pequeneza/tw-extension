/**
 * FakeSenderView — in-overlay control panel for the Fake Sender module.
 *
 * Design contract:
 *  - Uses exclusively CSS classes from overlay.css (no inline styles except layout necessities)
 *  - Slides in as a cfg-view (same animation + shell as ConfigView)
 *  - Two tabs: STATUS (live runtime) and SETTINGS (persisted config via chrome.storage.sync)
 *  - Runtime state polled from sessionStorage/localStorage every 500 ms (bridge to the
 *    injected fakes.user.js which writes these keys)
 *  - Config changes written to chrome.storage.sync → fakes.user.js picks them up on next
 *    cycle via window.__twSuiteCfg('fakes') integration already present in the script
 */

import React, {
  useCallback, useEffect, useRef, useState,
} from "react";
import { MODULE_CONFIG_SCHEMAS, FieldDef } from "../../types/config-schemas";
import { TriggerVisibilityToggle } from "./TriggerVisibilityToggle";

/* ─── Storage helpers (mirrors Overlay.tsx) ───────────────────────────────── */
function storageGet(keys: string[]): Promise<Record<string, unknown>> {
  return new Promise((res) =>
    chrome.storage.sync.get(keys, (r) => res(r as Record<string, unknown>))
  );
}
function storageSet(data: Record<string, unknown>): Promise<void> {
  return new Promise((res) => chrome.storage.sync.set(data, res));
}

/* ─── Types ───────────────────────────────────────────────────────────────── */
type Tab = "status" | "settings";
type LogLevel = "info" | "warn" | "err";
interface LogEntry { ts: string; message: string; level: LogLevel; }
type CfgValues = Record<string, string | number | boolean>;

/* ─── Runtime state (read from sessionStorage / localStorage) ─────────────── */
interface FakeRuntime {
  paused: boolean;
  sent: number;
  total: number;
  runId: string;
  index: number;
  pendingTarget: string;
  log: LogEntry[];
}

const SS_PAUSED        = "fake_paused";        // volatile – sessionStorage only
const LS_SENT          = "fake_sent_v1";       // persistent
const LS_LOG           = "fake_ui_log_v1";     // persistent
const LS_TOTAL         = "fake_total_coords_v1"; // persistent
const LS_PENDING       = "fake_pending_target_v1"; // persistent
const LS_RUN_ID        = "fake_run_id_v1";
const LS_TARGET_PLAN   = "fake_target_plan_v1";
const COOKIE_INDEX     = "fake_index";

// Legacy sessionStorage keys written by fakes.user.js — we read both
// so the overlay stays live during an active tab session.
const SS_SENT    = "fake_sent";
const SS_LOG     = "fake_ui_log";
const SS_TOTAL   = "fake_total_coords";
const SS_PENDING = "fake_pending_target";

function parseSafe<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

function getCookieValue(name: string): string {
  const m = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
  return m ? decodeURIComponent(m[1] ?? "") : "0";
}

function readRuntime(): FakeRuntime {
  // Prefer the live sessionStorage value (written by the injected script each cycle)
  // but fall back to the persisted localStorage copy so data survives tab closes.
  const sentRaw   = sessionStorage.getItem(SS_SENT)    ?? localStorage.getItem(LS_SENT)    ?? "0";
  const totalRaw  = sessionStorage.getItem(SS_TOTAL)   ?? localStorage.getItem(LS_TOTAL)   ?? "0";
  const pendRaw   = sessionStorage.getItem(SS_PENDING) ?? localStorage.getItem(LS_PENDING) ?? "—";
  const logRaw    = sessionStorage.getItem(SS_LOG)     ?? localStorage.getItem(LS_LOG)     ?? "[]";

  // Mirror live sessionStorage values into localStorage so next session has them
  if (sessionStorage.getItem(SS_SENT)    !== null) localStorage.setItem(LS_SENT,    sentRaw);
  if (sessionStorage.getItem(SS_TOTAL)   !== null) localStorage.setItem(LS_TOTAL,   totalRaw);
  if (sessionStorage.getItem(SS_PENDING) !== null) localStorage.setItem(LS_PENDING, pendRaw);
  if (sessionStorage.getItem(SS_LOG)     !== null) localStorage.setItem(LS_LOG,     logRaw);

  return {
    paused:        sessionStorage.getItem(SS_PAUSED) === "1",
    sent:          parseInt(sentRaw, 10) || 0,
    total:         parseInt(totalRaw, 10) || 0,
    runId:         localStorage.getItem(LS_RUN_ID) || "—",
    index:         parseInt(getCookieValue(COOKIE_INDEX), 10) || 0,
    pendingTarget: pendRaw || "—",
    log:           parseSafe<LogEntry[]>(logRaw, []),
  };
}

/* ─── useFakeRuntime — polls sessionStorage every 500 ms ─────────────────── */
function useFakeRuntime(active: boolean) {
  const [rt, setRt] = useState<FakeRuntime>(readRuntime);

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setRt(readRuntime()), 500);
    return () => clearInterval(id);
  }, [active]);

  /** Pause / resume by writing the sessionStorage flag the script reads */
  const setPaused = useCallback((next: boolean) => {
    sessionStorage.setItem(SS_PAUSED, next ? "1" : "0");
    setRt((prev) => ({ ...prev, paused: next }));
  }, []);

  /** Start a new run: bump runId + reset sent/index */
  const newRun = useCallback(() => {
    const id = String(Date.now());
    localStorage.setItem(LS_RUN_ID, id);
    // Clear both live and persistent copies
    sessionStorage.setItem(SS_SENT, "0");
    localStorage.setItem(LS_SENT, "0");
    sessionStorage.removeItem(SS_PENDING);
    localStorage.removeItem(LS_PENDING);
    localStorage.removeItem(LS_TARGET_PLAN);
    // Reset index cookie
    const expires = new Date(Date.now() + 10 * 365 * 86400 * 1000).toUTCString();
    document.cookie = `fake_index=0;expires=${expires};path=/`;
    setRt(readRuntime());
  }, []);

  const clearLog = useCallback(() => {
    sessionStorage.setItem(SS_LOG, "[]");
    localStorage.setItem(LS_LOG, "[]");
    setRt((prev) => ({ ...prev, log: [] }));
  }, []);

  return { rt, setPaused, newRun, clearLog };
}

/* ─── useFakeCfg — chrome.storage.sync for settings ─────────────────────── */
const SCHEMA = MODULE_CONFIG_SCHEMAS["fakes"]!;

function useFakeCfg(active: boolean) {
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

      // If chrome.storage.sync has no coords saved yet, pull them from the
      // localStorage config written by fakes.user.js ("fake_sender_config_v1").
      // This covers first-run and cases where coords were only ever set in the
      // userscript DEFAULT_CONFIG or via a direct localStorage save.
      if (!synced.coords) {
        try {
          const lsRaw = localStorage.getItem("fake_sender_config_v1");
          if (lsRaw) {
            const lsCfg = JSON.parse(lsRaw) as CfgValues;
            if (lsCfg.coords && String(lsCfg.coords).trim()) synced.coords = lsCfg.coords;
          }
        } catch {}
        // Final fallback: live mirror the script writes each cycle
        if (!synced.coords) {
          try {
            const liveRaw = sessionStorage.getItem("xbot_live_cfg_fakes");
            if (liveRaw) {
              const live = JSON.parse(liveRaw) as CfgValues;
              if (live.coords && String(live.coords).trim()) synced.coords = live.coords;
            }
          } catch {}
        }
      }

      const merged = { ...defaults, ...synced };
      setVals(merged);
      // Seed the live sessionStorage mirror so the script is up-to-date
      try { sessionStorage.setItem("xbot_live_cfg_fakes", JSON.stringify(merged)); } catch {}
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
    // Mirror to sessionStorage so fakes.user.js can pick up changes
    // without a page reload (it reads 'xbot_live_cfg_fakes' each cycle)
    try { sessionStorage.setItem("xbot_live_cfg_fakes", JSON.stringify(vals)); } catch {}
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

/* ─── StatusTab ───────────────────────────────────────────────────────────── */
function StatusTab({ rt, setPaused, newRun, clearLog }: {
  rt: FakeRuntime;
  setPaused: (v: boolean) => void;
  newRun: () => void;
  clearLog: () => void;
}) {
  // Newest entries render at the top (reversed), so no auto-scroll needed

  return (
    <div className="cfg-body">

      {/* ── Live stats ── */}
      <div className="cfg-section">
        <div className="section-label">Live stats</div>

        <StatRow label="Status">
          {rt.paused
            ? <span className="fake-badge fake-badge--warn">⏸ Paused</span>
            : <span className="fake-badge fake-badge--ok"><span className="live-pip live-pip--sm" /> Running</span>
          }
        </StatRow>
        <StatRow label="Sent this session">
          <span style={{ fontVariantNumeric: "tabular-nums" }}>
            {rt.sent}{rt.total > 0 ? ` / ${rt.total}` : ""}
          </span>
        </StatRow>
        {rt.total > 0 && (
          <div style={{ padding: "0 14px 10px" }}>
            <div style={{
              height: 6, borderRadius: 999,
              background: "var(--n150)",
              overflow: "hidden",
            }}>
              <div style={{
                height: "100%",
                width: `${Math.min(100, Math.round((rt.sent / rt.total) * 100))}%`,
                background: rt.sent >= rt.total
                  ? "var(--g500)"
                  : "linear-gradient(90deg, var(--g400), var(--b500))",
                borderRadius: 999,
                transition: "width 0.4s ease",
              }} />
            </div>
            <div style={{
              display: "flex", justifyContent: "space-between",
              marginTop: 3, fontSize: 10.5,
              color: "var(--n300)", fontFamily: "'DM Mono', monospace",
            }}>
              <span>{Math.min(100, Math.round((rt.sent / rt.total) * 100))}%</span>
              <span>{Math.max(0, rt.total - rt.sent)} remaining</span>
            </div>
          </div>
        )}
        <StatRow label="Current target">{rt.pendingTarget}</StatRow>
        <StatRow label="Coord index">{rt.index}</StatRow>
        <StatRow label="Run ID">
          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10.5 }}>{rt.runId}</span>
        </StatRow>
      </div>

      {/* ── Actions ── */}
      <div className="cfg-section cfg-section-checks">
        <div className="section-label">Controls</div>
        <div style={{ display: "flex", gap: 8, padding: "10px 14px" }}>
          <button
            className={`btn ${rt.paused ? "btn-save btn-save--dirty" : "btn-ghost"}`}
            style={{ flex: 1 }}
            onClick={() => setPaused(!rt.paused)}
          >
            {rt.paused ? "▶ Resume" : "⏸ Pause"}
          </button>
          <button
            className="btn btn-ghost"
            style={{ flex: 1 }}
            onClick={newRun}
            title="Resets sent counters and starts a fresh run"
          >
            ↺ New run
          </button>
        </div>
      </div>

      {/* ── Log ── */}
      <div className="cfg-section">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 14px 4px" }}>
          <div className="section-label" style={{ padding: 0 }}>Log</div>
          <button
            className="cfg-btn"
            title="Clear log"
            onClick={clearLog}
            style={{ width: 22, height: 22, fontSize: 11 }}
          >
            ✕
          </button>
        </div>
        <div
          style={{
            maxHeight: 220,
            overflowY: "auto",
            padding: "4px 0 6px",
            scrollbarWidth: "thin",
          }}
        >
          {rt.log.length === 0
            ? <div className="state-msg" style={{ padding: "16px" }}>No log entries yet.</div>
            : rt.log.map((entry, i) => (
              <LogLine key={i} entry={entry} />
            ))
          }
        </div>
      </div>
    </div>
  );
}

function StatRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "9px 14px",
      borderBottom: "1px solid var(--n100)",
      gap: 12,
    }}>
      <span className="field-label" style={{ color: "var(--n400)", fontWeight: 400 }}>{label}</span>
      <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--n700)", textAlign: "right" }}>
        {children}
      </span>
    </div>
  );
}

function LogLine({ entry }: { entry: LogEntry }) {
  const color =
    entry.level === "err"  ? "var(--r500)" :
    entry.level === "warn" ? "var(--a500)" :
    "var(--n500)";

  // Split "[VillageName (491|592)] rest of message" into label + body
  const labelMatch = entry.message.match(/^\[([^\]]+)\]\s*(.*)/s);
  const label   = labelMatch ? labelMatch[1] : null;
  const body    = labelMatch ? labelMatch[2] : entry.message;

  return (
    <div style={{ display: "flex", gap: 8, padding: "3px 14px", alignItems: "flex-start" }}>
      <span style={{
        fontFamily: "'DM Mono', monospace", fontSize: 10,
        color: "var(--n300)", whiteSpace: "nowrap", flexShrink: 0, paddingTop: 1,
      }}>
        {entry.ts}
      </span>
      <span style={{ fontSize: 11.5, color, lineHeight: 1.35, minWidth: 0 }}>
        {label && (
          <span style={{
            display: "inline-block",
            fontFamily: "'DM Mono', monospace",
            fontSize: 10,
            fontWeight: 500,
            color: "var(--b500)",
            background: "var(--b-bg)",
            border: "1px solid var(--b-br)",
            borderRadius: 4,
            padding: "0px 4px",
            marginRight: 5,
            verticalAlign: "middle",
            whiteSpace: "nowrap",
          }}>
            {label}
          </span>
        )}
        {body}
      </span>
    </div>
  );
}

/* ─── SettingsTab ─────────────────────────────────────────────────────────── */
function SettingsTab({ vals, set }: {
  vals: CfgValues;
  set: (k: string, v: string | number | boolean) => void;
}) {
  // Group fields by section
  const timing   = SCHEMA.fields.filter((f: FieldDef) => ["attackDelay","attackRandom","confirmDelay","confirmRandom","switchDelay","switchRandom"].includes(f.key));
  const caps     = SCHEMA.fields.filter((f: FieldDef) => ["fakesPerVillage","maxAttacksPerCoord","multiHitAttacks","multiHitChance"].includes(f.key));
  const troops   = SCHEMA.fields.filter((f: FieldDef) => ["maxCatapults","maxScouts","maxInfantry","maxCavalry"].includes(f.key));
  const arrival  = SCHEMA.fields.filter((f: FieldDef) => ["arrivalStart","arrivalEnd","stopAtEnd"].includes(f.key));
  const coordsF  = SCHEMA.fields.filter((f: FieldDef) => f.key === "coords");

  return (
    <div className="cfg-body">
      <SettingsSection label="Timings" fields={timing} vals={vals} set={set} />
      <SettingsSection label="Caps &amp; Plan" fields={caps} vals={vals} set={set} />
      <SettingsSection label="Troop limits" fields={troops} vals={vals} set={set} />
      <SettingsSection label="Arrival window" fields={arrival} vals={vals} set={set} />
      <SettingsSection label="Target coords" fields={coordsF} vals={vals} set={set} />
    </div>
  );
}

/** Keys that should be rendered as an inline pair (side by side). */
const INLINE_PAIRS: [string, string][] = [
  ["attackDelay",  "attackRandom"],
  ["confirmDelay", "confirmRandom"],
  ["switchDelay",  "switchRandom"],
];

function isPaired(key: string) {
  return INLINE_PAIRS.some(([a, b]) => a === key || b === key);
}

function SettingsSection({ label, fields, vals, set }: {
  label: string;
  fields: FieldDef[];
  vals: CfgValues;
  set: (k: string, v: string | number | boolean) => void;
}) {
  if (!fields.length) return null;

  const checks = fields.filter((f) => f.type === "checkbox");
  const inputs = fields.filter((f) => f.type !== "checkbox");

  // Render inputs, collapsing paired keys into a single row
  const rendered: React.ReactNode[] = [];
  const consumed = new Set<string>();
  for (const f of inputs) {
    if (consumed.has(f.key)) continue;
    const pair = INLINE_PAIRS.find(([a]) => a === f.key);
    if (pair) {
      const sibling = inputs.find((s) => s.key === pair[1]);
      if (sibling) {
        rendered.push(
          <FieldPairRow key={f.key} left={f} right={sibling} vals={vals} set={set} />
        );
        consumed.add(f.key);
        consumed.add(sibling.key);
        continue;
      }
    }
    if (!isPaired(f.key) || !consumed.has(f.key)) {
      rendered.push(<SettingsField key={f.key} f={f} val={vals[f.key]} set={set} />);
      consumed.add(f.key);
    }
  }

  return (
    <div className="cfg-section">
      <div className="section-label" dangerouslySetInnerHTML={{ __html: label }} />
      {rendered}
      {checks.length > 0 && (
        <div className="cfg-section-checks" style={{ borderBottom: "none" }}>
          {checks.map((f) => <SettingsField key={f.key} f={f} val={vals[f.key]} set={set} />)}
        </div>
      )}
    </div>
  );
}

function FieldPairRow({ left, right, vals, set }: {
  left: FieldDef;
  right: FieldDef;
  vals: CfgValues;
  set: (k: string, v: string | number | boolean) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 8, padding: "0 14px 2px", alignItems: "flex-start" }}>
      <div style={{ flex: 1 }}>
        <SettingsField f={left}  val={vals[left.key]}  set={set} inline />
      </div>
      <div style={{ flex: 1 }}>
        <SettingsField f={right} val={vals[right.key]} set={set} inline />
      </div>
    </div>
  );
}

function SettingsField({ f, val, set, inline = false }: {
  f: FieldDef;
  val: unknown;
  set: (k: string, v: string | number | boolean) => void;
  inline?: boolean;
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

  if (f.type === "textarea") return (
    <div className="field">
      <span className="field-label">{f.label}</span>
      {f.help && <span className="field-help">{f.help}</span>}
      <textarea className="input input-ta" rows={f.rows ?? 5}
        value={String(v)} spellCheck={false}
        onChange={(e) => set(f.key, e.target.value)} />
    </div>
  );

  const isNum = f.type === "number";
  const rangeHint = isNum
    ? [f.min !== undefined && f.max !== undefined ? `${f.min}–${f.max}` : "",
       f.step !== undefined && f.step !== 1 ? `step ${f.step}` : ""]
        .filter(Boolean).join(", ")
    : "";

  return (
    <div className="field" style={inline ? { padding: "6px 0" } : undefined}>
      <div className="field-top">
        <span className="field-label">{f.label}</span>
        {rangeHint && <span className="field-range">{rangeHint}</span>}
      </div>
      {f.help && !inline && <span className="field-help">{f.help}</span>}
      <input
        className="input"
        type={f.type === "time" ? "time" : f.type}
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

/* ─── FakeSenderView — the full panel ────────────────────────────────────── */
export function FakeSenderView({ visible, onBack }: {
  visible: boolean;
  onBack: () => void;
}) {
  const [tab, setTab] = useState<Tab>("status");
  const anim = useMountAnim(visible);

  const { rt, setPaused, newRun, clearLog } = useFakeRuntime(visible);
  const { vals, dirty, saved, set, save, reset } = useFakeCfg(visible && tab === "settings");

  // Reset to status tab when closed, so it feels fresh on re-open
  useEffect(() => {
    if (!visible) setTab("status");
  }, [visible]);

  const isLive = /screen=place/.test(window.location.href);

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
              strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <span className="cfg-icon">⚔️</span>
        <div className="cfg-header-text">
          <span className="cfg-title">Fake Sender</span>
          <span className="cfg-subtitle">
            {isLive
              ? <><span className="live-pip live-pip--sm" style={{ display: "inline-block", marginRight: 4 }} />LIVE — screen=place</>
              : "Smart fake automation"
            }
          </span>
        </div>
        {/* Status dot only relevant in settings tab */}
        {tab === "settings" && (
          <span className="cfg-status-dot"
            data-dirty={String(dirty)} data-saved={String(saved)} />
        )}
        {/* Paused indicator in status tab */}
        {tab === "status" && rt.paused && (
          <span className="fake-badge fake-badge--warn" style={{ fontSize: 10, padding: "2px 6px" }}>PAUSED</span>
        )}
        <TriggerVisibilityToggle moduleId="fakes" />
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
          {rt.sent > 0 && (
            <span className="meta-chip meta-on" style={{ marginLeft: 5, fontSize: 10 }}>
              {rt.sent}
            </span>
          )}
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
        <StatusTab rt={rt} setPaused={setPaused} newRun={newRun} clearLog={clearLog} />
      )}
      {tab === "settings" && (
        <SettingsTab vals={vals} set={set} />
      )}

      {/* ── Footer — context-sensitive ── */}
      <div className="cfg-footer">
        {tab === "status" ? (
          <>
            <button className="btn btn-ghost" onClick={onBack}>← Back</button>
            <button
              className={`btn ${rt.paused ? "btn-save btn-save--dirty" : "btn-ghost"}`}
              onClick={() => setPaused(!rt.paused)}
              style={{ flex: 2 }}
            >
              {rt.paused ? "▶ Resume" : "⏸ Pause"}
            </button>
          </>
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

/* ─── TabButton helper ────────────────────────────────────────────────────── */
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
/**
 * AttackGeneratorView — in-overlay control panel for the Attack Generator module.
 *
 * Structurally cloned from FakeSenderView.tsx:
 *  - Runtime state polled from sessionStorage/localStorage every 500 ms (bridge to the
 *    injected attack_generator.user.js, which mirrors the same "fake_*"-style keys under
 *    an "attackgen_*" prefix)
 *  - Config changes written to chrome.storage.sync → attack_generator.user.js picks them
 *    up on next cycle via window.__twSuiteCfg('attack_generator')
 *  - Adds: attack-type selector (+ custom unit-count picker), target-mode selector
 *    (manual coords vs auto player/tribe/continent/points filters with a one-shot
 *    "Generate coords" bridge), and execution-mode selector (sequential send-now vs
 *    timed queue-to-Autosender)
 */

import React, {
  useCallback, useEffect, useState,
} from "react";
import { MODULE_CONFIG_SCHEMAS, FieldDef } from "../../types/config-schemas";
import { TriggerVisibilityToggle } from "./TriggerVisibilityToggle";

/* ─── Storage helpers ─────────────────────────────────────────────────────── */
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

/* ─── Runtime state ───────────────────────────────────────────────────────── */
interface AtkGenRuntime {
  active: boolean;
  paused: boolean;
  sent: number;
  total: number;
  runId: string;
  index: number;
  pendingTarget: string;
  log: LogEntry[];
}

const SS_ACTIVE   = "attackgen_active";
const SS_PAUSED   = "attackgen_paused";
const LS_SENT     = "attackgen_sent_v1";
const LS_LOG      = "attackgen_ui_log_v1";
const LS_TOTAL    = "attackgen_total_coords_v1";
const LS_PENDING  = "attackgen_pending_target_v1";
const LS_RUN_ID   = "attackgen_run_id_v1";
const LS_TARGET_PLAN = "attackgen_target_plan_v1";
const COOKIE_INDEX   = "attackgen_index";

const SS_SENT    = "attackgen_sent";
const SS_LOG     = "attackgen_ui_log";
const SS_TOTAL   = "attackgen_total_coords";
const SS_PENDING = "attackgen_pending_target";
const SS_GENERATED_COORDS = "attackgen_generated_coords";

function parseSafe<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

function getCookieValue(name: string): string {
  const m = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
  return m ? decodeURIComponent(m[1] ?? "") : "0";
}

function readRuntime(): AtkGenRuntime {
  const sentRaw  = sessionStorage.getItem(SS_SENT)    ?? localStorage.getItem(LS_SENT)    ?? "0";
  const totalRaw = sessionStorage.getItem(SS_TOTAL)   ?? localStorage.getItem(LS_TOTAL)   ?? "0";
  const pendRaw  = sessionStorage.getItem(SS_PENDING) ?? localStorage.getItem(LS_PENDING) ?? "—";
  const logRaw   = sessionStorage.getItem(SS_LOG)     ?? localStorage.getItem(LS_LOG)     ?? "[]";

  if (sessionStorage.getItem(SS_SENT)    !== null) localStorage.setItem(LS_SENT,    sentRaw);
  if (sessionStorage.getItem(SS_TOTAL)   !== null) localStorage.setItem(LS_TOTAL,   totalRaw);
  if (sessionStorage.getItem(SS_PENDING) !== null) localStorage.setItem(LS_PENDING, pendRaw);
  if (sessionStorage.getItem(SS_LOG)     !== null) localStorage.setItem(LS_LOG,     logRaw);

  return {
    active:        sessionStorage.getItem(SS_ACTIVE) === "1",
    paused:        sessionStorage.getItem(SS_PAUSED) === "1",
    sent:          parseInt(sentRaw, 10) || 0,
    total:         parseInt(totalRaw, 10) || 0,
    runId:         localStorage.getItem(LS_RUN_ID) || "—",
    index:         parseInt(getCookieValue(COOKIE_INDEX), 10) || 0,
    pendingTarget: pendRaw || "—",
    log:           parseSafe<LogEntry[]>(logRaw, []),
  };
}

function useAtkGenRuntime(active: boolean) {
  const [rt, setRt] = useState<AtkGenRuntime>(readRuntime);

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setRt(readRuntime()), 500);
    return () => clearInterval(id);
  }, [active]);

  // Attack Generator never starts on its own — these dispatch the manual-start
  // bridge events that attack_generator.user.js listens for.
  const start = useCallback(() => {
    document.dispatchEvent(new CustomEvent("xbot:attackgen:start"));
    setRt((prev) => ({ ...prev, active: true, paused: false }));
  }, []);

  const stop = useCallback(() => {
    document.dispatchEvent(new CustomEvent("xbot:attackgen:stop"));
    setRt((prev) => ({ ...prev, paused: true }));
  }, []);

  const newRun = useCallback(() => {
    const id = String(Date.now());
    localStorage.setItem(LS_RUN_ID, id);
    sessionStorage.setItem(SS_SENT, "0");
    localStorage.setItem(LS_SENT, "0");
    sessionStorage.removeItem(SS_PENDING);
    localStorage.removeItem(LS_PENDING);
    localStorage.removeItem(LS_TARGET_PLAN);
    const expires = new Date(Date.now() + 10 * 365 * 86400 * 1000).toUTCString();
    document.cookie = `${COOKIE_INDEX}=0;expires=${expires};path=/`;
    setRt(readRuntime());
  }, []);

  const clearLog = useCallback(() => {
    sessionStorage.setItem(SS_LOG, "[]");
    localStorage.setItem(LS_LOG, "[]");
    setRt((prev) => ({ ...prev, log: [] }));
  }, []);

  return { rt, start, stop, newRun, clearLog };
}

/* ─── useAtkGenCfg — chrome.storage.sync for settings ────────────────────── */
const SCHEMA = MODULE_CONFIG_SCHEMAS["attack_generator"]!;

function useAtkGenCfg(active: boolean) {
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
      const merged = { ...defaults, ...synced };
      setVals(merged);
      try { sessionStorage.setItem("xbot_live_cfg_attack_generator", JSON.stringify(merged)); } catch {}
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
    try { sessionStorage.setItem("xbot_live_cfg_attack_generator", JSON.stringify(vals)); } catch {}
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
function StatusTab({ rt, start, stop, newRun, clearLog }: {
  rt: AtkGenRuntime;
  start: () => void;
  stop: () => void;
  newRun: () => void;
  clearLog: () => void;
}) {
  return (
    <div className="cfg-body">
      <div className="cfg-section">
        <div className="section-label">Live stats</div>

        <StatRow label="Status">
          {!rt.active
            ? <span className="fake-badge">⏹ Idle</span>
            : rt.paused
              ? <span className="fake-badge fake-badge--warn">⏸ Stopping…</span>
              : <span className="fake-badge fake-badge--ok"><span className="live-pip live-pip--sm" /> Running</span>
          }
        </StatRow>
        <StatRow label="Sent / queued this session">
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

      <div className="cfg-section cfg-section-checks">
        <div className="section-label">Controls</div>
        <div style={{ display: "flex", gap: 8, padding: "10px 14px" }}>
          {!rt.active ? (
            <button
              className="btn btn-save btn-save--dirty"
              style={{ flex: 1 }}
              onClick={start}
            >
              ▶ Start
            </button>
          ) : (
            <button
              className="btn btn-ghost"
              style={{ flex: 1 }}
              onClick={stop}
              disabled={rt.paused}
            >
              ⏹ Stop
            </button>
          )}
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

  const labelMatch = entry.message.match(/^\[([^\]]+)\]\s*(.*)/s);
  const label = labelMatch ? labelMatch[1] : null;
  const body  = labelMatch ? labelMatch[2] : entry.message;

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

/* ─── Custom unit-count picker (attackType === "custom") ─────────────────── */
const CUSTOM_UNIT_KEYS = ["spear","sword","axe","archer","spy","light","marcher","heavy","ram","catapult"];
const UNIT_LABELS: Record<string, string> = {
  spear: "Spear", sword: "Sword", axe: "Axe", archer: "Archer", spy: "Scout",
  light: "Light cav", marcher: "Marcher", heavy: "Heavy cav", ram: "Ram", catapult: "Catapult",
};

function CustomUnitsEditor({ vals, set }: {
  vals: CfgValues;
  set: (k: string, v: string | number | boolean) => void;
}) {
  let parsed: Record<string, number> = {};
  try { parsed = JSON.parse(String(vals.customUnits || "{}")); } catch { /* ignore */ }

  function updateUnit(unit: string, n: number) {
    const next = { ...parsed, [unit]: Math.max(0, Math.floor(n) || 0) };
    set("customUnits", JSON.stringify(next));
  }

  return (
    <div className="cfg-section">
      <div className="section-label">Custom unit counts</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 10px", padding: "6px 14px 12px" }}>
        {CUSTOM_UNIT_KEYS.map((unit) => (
          <div key={unit} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <span className="field-label" style={{ fontWeight: 400 }}>{UNIT_LABELS[unit]}</span>
            <input
              className="input"
              type="number"
              min={0}
              style={{ width: 72 }}
              value={parsed[unit] ?? 0}
              onChange={(e) => updateUnit(unit, parseInt(e.target.value, 10) || 0)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── SettingsTab ─────────────────────────────────────────────────────────── */
type GenState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; count: number }
  | { status: "error"; error: string };

function SettingsTab({ vals, set, isLive }: {
  vals: CfgValues;
  set: (k: string, v: string | number | boolean) => void;
  isLive: boolean;
}) {
  const [genState, setGenState] = useState<GenState>({ status: "idle" });

  const attackType   = String(vals.attackType   ?? "fake");
  const targetMode    = String(vals.targetMode   ?? "manual");
  const executionMode = String(vals.executionMode ?? "sequential");

  const attackTypeF  = SCHEMA.fields.filter((f: FieldDef) => f.key === "attackType");
  const garrisonF    = SCHEMA.fields.filter((f: FieldDef) => f.key === "garrisonReservePct");
  const targetModeF  = SCHEMA.fields.filter((f: FieldDef) => f.key === "targetMode");
  const autoF        = SCHEMA.fields.filter((f: FieldDef) =>
    ["autoPlayers","autoTribes","autoContinents","autoMinPoints","autoMaxPoints","autoMinX","autoMaxX","autoMinY","autoMaxY"].includes(f.key));
  const coordsF       = SCHEMA.fields.filter((f: FieldDef) => f.key === "coords");
  const executionF    = SCHEMA.fields.filter((f: FieldDef) => f.key === "executionMode");
  const timedF         = SCHEMA.fields.filter((f: FieldDef) => ["timedArrivalMode","timedTargetArrival"].includes(f.key));
  const timing         = SCHEMA.fields.filter((f: FieldDef) =>
    ["attackDelay","attackRandom","confirmDelay","confirmRandom","switchDelay","switchRandom"].includes(f.key));
  const caps           = SCHEMA.fields.filter((f: FieldDef) =>
    ["attacksPerVillage","maxAttacksPerCoord","multiHitAttacks","multiHitChance"].includes(f.key));
  const troops         = SCHEMA.fields.filter((f: FieldDef) =>
    ["maxCatapults","maxRams","maxScouts","maxInfantry","maxCavalry"].includes(f.key));
  const arrival         = SCHEMA.fields.filter((f: FieldDef) =>
    ["arrivalStart","arrivalEnd","stopAtEnd"].includes(f.key));

  function generateCoords() {
    if (!isLive) { setGenState({ status: "error", error: "Open a screen=place tab first." }); return; }
    sessionStorage.removeItem(SS_GENERATED_COORDS);
    setGenState({ status: "loading" });

    document.dispatchEvent(new CustomEvent("xbot:attackgen:generateCoords", {
      detail: {
        autoPlayers: vals.autoPlayers,
        autoTribes: vals.autoTribes,
        autoContinents: vals.autoContinents,
        autoMinPoints: vals.autoMinPoints,
        autoMaxPoints: vals.autoMaxPoints,
        autoMinX: vals.autoMinX,
        autoMaxX: vals.autoMaxX,
        autoMinY: vals.autoMinY,
        autoMaxY: vals.autoMaxY,
      },
    }));

    let attempts = 0;
    const poll = setInterval(() => {
      attempts++;
      const raw = sessionStorage.getItem(SS_GENERATED_COORDS);
      if (raw) {
        clearInterval(poll);
        const result = parseSafe<{ coords?: string[]; count?: number; error?: string }>(raw, {});
        if (result.error) {
          setGenState({ status: "error", error: result.error });
        } else {
          set("coords", (result.coords ?? []).join(" "));
          setGenState({ status: "done", count: result.count ?? 0 });
        }
        return;
      }
      if (attempts > 60) {
        clearInterval(poll);
        setGenState({ status: "error", error: "Timed out waiting for the page script." });
      }
    }, 300);
  }

  return (
    <div className="cfg-body">
      <SettingsSection label="Attack type" fields={attackTypeF} vals={vals} set={set} />
      {attackType === "custom" && <CustomUnitsEditor vals={vals} set={set} />}
      {attackType === "send_all" && (
        <SettingsSection label="Garrison" fields={garrisonF} vals={vals} set={set} />
      )}

      <SettingsSection label="Target mode" fields={targetModeF} vals={vals} set={set} />
      {targetMode === "auto" && (
        <div className="cfg-section">
          <div className="section-label">Auto filters</div>
          {autoF.map((f) => <SettingsField key={f.key} f={f} val={vals[f.key]} set={set} />)}
          <div style={{ padding: "6px 14px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
            <button
              className="btn btn-ghost"
              onClick={generateCoords}
              disabled={genState.status === "loading"}
            >
              {genState.status === "loading" ? "Generating…" : "Generate coords"}
            </button>
            {genState.status === "done" && (
              <span className="state-msg">Generated {genState.count} coord(s) into Target coords below.</span>
            )}
            {genState.status === "error" && (
              <span className="state-msg" style={{ color: "var(--r500)" }}>{genState.error}</span>
            )}
          </div>
        </div>
      )}
      <SettingsSection label="Target coords" fields={coordsF} vals={vals} set={set} />

      <SettingsSection label="Execution mode" fields={executionF} vals={vals} set={set} />
      {executionMode === "timed" && (
        <SettingsSection label="Timed landing" fields={timedF} vals={vals} set={set} />
      )}

      <SettingsSection label="Timings" fields={timing} vals={vals} set={set} />
      <SettingsSection label="Caps &amp; Plan" fields={caps} vals={vals} set={set} />
      <SettingsSection label="Troop limits" fields={troops} vals={vals} set={set} />
      <SettingsSection label="Arrival window" fields={arrival} vals={vals} set={set} />
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

  if (f.type === "select" && f.options) return (
    <div className="field">
      <span className="field-label">{f.label}</span>
      {f.help && <span className="field-help">{f.help}</span>}
      <select className="input" value={String(v)}
        onChange={(e) => set(f.key, e.target.value)}>
        {f.options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
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

/* ─── AttackGeneratorView — the full panel ───────────────────────────────── */
export function AttackGeneratorView({ visible, onBack }: {
  visible: boolean;
  onBack: () => void;
}) {
  const [tab, setTab] = useState<Tab>("status");
  const anim = useMountAnim(visible);

  const { rt, start, stop, newRun, clearLog } = useAtkGenRuntime(visible);
  const { vals, dirty, saved, set, save, reset } = useAtkGenCfg(visible && tab === "settings");

  useEffect(() => {
    if (!visible) setTab("status");
  }, [visible]);

  const isLive = /screen=place/.test(window.location.href);

  return (
    <div
      className={`cfg-view${anim ? " in" : ""}`}
      style={{ display: visible ? "flex" : "none" }}
    >
      <div className="cfg-header">
        <button className="back-btn" onClick={onBack} aria-label="Back">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M9 2L4 7l5 5" stroke="currentColor" strokeWidth="1.8"
              strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <span className="cfg-icon">🗡️</span>
        <div className="cfg-header-text">
          <span className="cfg-title">Attack Generator</span>
          <span className="cfg-subtitle">
            {isLive
              ? <><span className="live-pip live-pip--sm" style={{ display: "inline-block", marginRight: 4 }} />LIVE — screen=place</>
              : "Flexible attack command generator"
            }
          </span>
        </div>
        {tab === "settings" && (
          <span className="cfg-status-dot"
            data-dirty={String(dirty)} data-saved={String(saved)} />
        )}
        {tab === "status" && !rt.active && (
          <span className="fake-badge" style={{ fontSize: 10, padding: "2px 6px" }}>IDLE</span>
        )}
        <TriggerVisibilityToggle moduleId="attack_generator" />
      </div>

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

      {tab === "status" && (
        <StatusTab rt={rt} start={start} stop={stop} newRun={newRun} clearLog={clearLog} />
      )}
      {tab === "settings" && (
        <SettingsTab vals={vals} set={set} isLive={isLive} />
      )}

      <div className="cfg-footer">
        {tab === "status" ? (
          <>
            <button className="btn btn-ghost" onClick={onBack}>← Back</button>
            {!rt.active ? (
              <button className="btn btn-save btn-save--dirty" onClick={start} style={{ flex: 2 }}>
                ▶ Start
              </button>
            ) : (
              <button className="btn btn-ghost" onClick={stop} disabled={rt.paused} style={{ flex: 2 }}>
                ⏹ Stop
              </button>
            )}
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

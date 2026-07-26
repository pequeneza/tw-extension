import React, {
  useCallback, useEffect, useRef, useState,
} from "react";
import {
  MODULE_CONFIGS, ModuleId, STORAGE_KEY, ModuleSettings,
  LICENSE_STORAGE_KEY, LICENSE_CACHE_KEY,
} from "../../types/modules";
import {
  MODULE_CONFIG_SCHEMAS, FieldDef, ModuleConfigSchema,
} from "../../types/config-schemas";
import { FakeSenderView }  from "./FakeSenderView";
import { SnipeView }      from "./SnipeView";
import { BalancerView }   from "./BalancerView";
import { DesviadorView }  from "./DesviadorView";
import { GluerView }           from "./GluerView";
import { ResourceBuyerView }  from "./ResourceBuyerView";
import { LabelView }         from "./LabelView";
import { AutoSenderView }   from "./AutoSenderView";
import { TwUtilsView }     from "./TwUtilsView";
import { TelegramView }   from "./TelegramView";

/* ─── Helpers ─────────────────────────────────────────────────────────────── */
function _p2(n: number) { return String(n).padStart(2, "0"); }
function getServerNowMs(): number {
  try {
    const w = window as Window & { Timing?: { getCurrentServerTime?: () => number } };
    if (w.Timing?.getCurrentServerTime) return w.Timing.getCurrentServerTime();
  } catch { /* */ }
  return Date.now();
}
function fmtTriggerTimer(diffMs: number): string {
  const h = Math.floor(diffMs / 3_600_000);
  const m = Math.floor((diffMs % 3_600_000) / 60_000);
  const s = Math.floor((diffMs % 60_000) / 1_000);
  if (h > 0) return `${_p2(h)}:${_p2(m)}`;
  return `${_p2(m)}:${_p2(s)}`;
}

/* ─── Live account stats — fetched on demand only (see StatsBar) ────────────── */

/** Reads the "Comando (N)" total from the outgoing commands overview for a given type. */
async function fetchCommandCountPage(type: string, page: number): Promise<number> {
  const html = await fetch(
    `${location.origin}/game.php?screen=overview_villages&mode=commands&type=${type}&page=${page}`,
    { credentials: "include" }
  ).then(r => r.text());
  const m = html.match(/Comando\s*\(\s*(\d+)\s*\)/i);
  return m ? parseInt(m[1]!, 10) : 0;
}

/** Total outgoing attack commands. TW's per-page count can undercount past 1000, so page 1 is added in too. */
async function fetchAttackCommandCount(): Promise<number> {
  const page0 = await fetchCommandCountPage("attack", 0);
  if (page0 > 1000) {
    const page1 = await fetchCommandCountPage("attack", 1);
    return page0 + page1;
  }
  return page0;
}

/**
 * Count of incoming attacks carrying a noble. The incomings overview's own filter panel
 * (screen=overview_villages&mode=incomings) has a purpose-built "Com nobre" checkbox —
 * `filter_icon[2]=2` — keyed to the noble icon itself, which is far more reliable than
 * matching on the command's free-text comment/label. Applied as a plain query-string
 * filter on a GET request (TW's overview tables read filters from the query string on
 * each load, falling back to the account's saved defaults when absent) — no CSRF, no
 * save/restore round-trip, and it never touches the account's saved filter settings.
 */
async function fetchIncomingNobleCount(): Promise<number> {
  const url = `${location.origin}/game.php?screen=overview_villages&mode=incomings&subtype=attacks&filter_icon%5B2%5D=2`;
  const html = await fetch(url, { credentials: "include" }).then(r => r.text());
  const headerMatch = html.match(/Ataques?\s*\(\s*(\d+)\s*\)/i);
  if (headerMatch) return parseInt(headerMatch[1]!, 10);
  const doc = new DOMParser().parseFromString(html, "text/html");
  return doc.querySelectorAll("#incomings_table tbody tr").length;
}

/** Caches the last successful Attacks/Nobles fetch so the stats bar shows real
 * data immediately on mount (overlay reopen, page navigation, etc.) instead of
 * resetting to "—" — they only change again once the user hits refresh. */
const LIVE_STATS_KEY = "xbot_live_stats_v1";
function loadLiveStats(): { attacks: string; nobles: string } {
  try {
    const raw = JSON.parse(localStorage.getItem(LIVE_STATS_KEY) ?? "{}");
    return { attacks: typeof raw.attacks === "string" ? raw.attacks : "—",
             nobles:  typeof raw.nobles  === "string" ? raw.nobles  : "—" };
  } catch { return { attacks: "—", nobles: "—" }; }
}
function saveLiveStats(attacks: string, nobles: string) {
  try { localStorage.setItem(LIVE_STATS_KEY, JSON.stringify({ attacks, nobles })); } catch { /* */ }
}

/* ─── Storage ─────────────────────────────────────────────────────────────── */
function storageGet(keys: string[]): Promise<Record<string, unknown>> {
  return new Promise((res) =>
    chrome.storage.sync.get(keys, (r) => res(r as Record<string, unknown>))
  );
}
function storageSet(data: Record<string, unknown>): Promise<void> {
  return new Promise((res) => chrome.storage.sync.set(data, res));
}

type CfgValues = Record<string, string | number | boolean>;
type View = { type: "list" } |
            { type: "config"; id: ModuleId } |
            { type: "fakes" } |
            { type: "snipe" } |
            { type: "balancer" } |
            { type: "desviador" } |
            { type: "gluer" } |
            { type: "buyer" } |
            { type: "label" } |
            { type: "autosender" } |
            { type: "twutils" } |
            { type: "telegram" } |
            { type: "license" };

/* ─── useSettings — lives in OverlayRoot, never unmounts ─────────────────── */
function useSettings() {
  const [s, setS] = useState<ModuleSettings>({});
  const [ready, setReady] = useState(false);

  // Load once on mount — never re-runs, so never clobbers state
  useEffect(() => {
    storageGet([STORAGE_KEY]).then((r) => {
      setS((r[STORAGE_KEY] as ModuleSettings) ?? {});
      setReady(true);
    });
  }, []);

  // Ref mirrors state so toggle always writes the latest values,
  // even if called multiple times before React re-renders
  const sRef = useRef(s);
  useEffect(() => { sRef.current = s; }, [s]);

  const toggle = useCallback(async (id: ModuleId) => {
    const next = sRef.current[id] !== true;
    const updated = { ...sRef.current, [id]: next };
    sRef.current = updated;   // update ref immediately so rapid calls stack correctly
    setS(updated);            // trigger re-render with new state
    await storageSet({ [STORAGE_KEY]: updated });
  }, []);

  // isOn reads reactive state s — not the ref — so cards re-render correctly
  const isOn = useCallback((id: ModuleId) => s[id] === true, [s]);

  return { s, ready, isOn, toggle };
}

/* ─── useModuleCfg ────────────────────────────────────────────────────────── */
function useModuleCfg(id: ModuleId | null) {
  const schema: ModuleConfigSchema | undefined = id ? MODULE_CONFIG_SCHEMAS[id] : undefined;
  const [vals, setVals] = useState<CfgValues>({});
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!schema || !id) return;
    const defs: CfgValues = Object.fromEntries(
      schema.fields.map((f: FieldDef) => [f.key, f.default])
    );
    storageGet([schema.storageKey]).then((r) => {
      setVals({ ...defs, ...((r[schema.storageKey] as CfgValues) ?? {}) });
      setDirty(false); setSaved(false);
    });
  }, [id]);

  const set = useCallback((key: string, val: string | number | boolean) => {
    setVals((p) => ({ ...p, [key]: val }));
    setDirty(true); setSaved(false);
  }, []);

  const save = useCallback(async () => {
    if (!schema) return;
    await storageSet({ [schema.storageKey]: vals });
    setDirty(false); setSaved(true);
    setTimeout(() => setSaved(false), 2200);
  }, [schema, vals]);

  const reset = useCallback(async () => {
    if (!schema || !id) return;
    const defs: CfgValues = Object.fromEntries(
      schema.fields.map((f: FieldDef) => [f.key, f.default])
    );
    await storageSet({ [schema.storageKey]: defs });
    setVals(defs); setDirty(false);
  }, [schema, id]);

  return { schema, vals, dirty, saved, set, save, reset };
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

/* ─── Field ───────────────────────────────────────────────────────────────── */
function Field({ f, val, onChange }: {
  f: FieldDef;
  val: unknown;
  onChange: (k: string, v: string | number | boolean) => void;
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
          onChange={(e) => onChange(f.key, e.target.checked)} />
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
        onChange={(e) => onChange(f.key, e.target.value)} />
    </div>
  );

  if (f.type === "select" && f.options) return (
    <div className="field">
      <span className="field-label">{f.label}</span>
      {f.help && <span className="field-help">{f.help}</span>}
      <select className="input" value={String(v)}
        onChange={(e) => onChange(f.key, e.target.value)}>
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

  // ── Number / text input: hold a string draft so the box can be cleared
  //    without immediately snapping back to default. Commit to parent only
  //    when the value is valid (on every keystroke for text, on blur for number).
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [draft, setDraft] = useState<string>(String(v));
  // Keep draft in sync when the parent value changes from outside (e.g. Reset)
  const prevV = useRef<unknown>(v);
  if (prevV.current !== v) {
    prevV.current = v;
    // Only update draft when parent drove the change (not when we caused it)
    if (draft !== String(v)) setDraft(String(v));
  }

  const commitNum = (raw: string) => {
    const n = parseFloat(raw);
    if (Number.isFinite(n)) onChange(f.key, n);
    // if not finite (empty / "-") leave parent value unchanged — don't snap
  };

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
        value={draft}
        min={f.min} max={f.max} step={f.step}
        onChange={(e) => {
          const raw = e.target.value;
          setDraft(raw);
          if (!isNum) {
            onChange(f.key, raw);
          } else {
            // commit immediately if valid so live preview updates
            const n = parseFloat(raw);
            if (Number.isFinite(n)) onChange(f.key, n);
          }
        }}
        onBlur={() => {
          if (isNum) {
            const n = parseFloat(draft);
            if (!Number.isFinite(n)) {
              // restore to last known good value on blur if still empty
              setDraft(String(v));
            } else {
              commitNum(draft);
            }
          }
        }}
      />
    </div>
  );
}

/* ─── LicenseView ─────────────────────────────────────────────────────────── */
function LicenseView({ visible, onBack, onClose }: {
  visible: boolean; onBack: () => void; onClose: () => void;
}) {
  const [keyInput, setKeyInput] = useState("");
  const [savedKey, setSavedKey] = useState("");
  const [status, setStatus] = useState<"idle" | "checking" | "invalid" | "error" | "saved">("idle");
  const anim = useMountAnim(visible);

  useEffect(() => {
    if (!visible) return;
    storageGet([LICENSE_STORAGE_KEY]).then((r) => {
      const k = (r[LICENSE_STORAGE_KEY] as string) ?? "";
      setSavedKey(k);
      setKeyInput(k);
      setStatus("idle");
    });
  }, [visible]);

  async function save() {
    const key = keyInput.trim().toUpperCase();
    if (!key) return;
    setStatus("checking");
    let expiresAt: string | null = null;
    try {
      const result = await new Promise<{ valid: boolean; expiresAt: string | null }>((res, rej) =>
        chrome.runtime.sendMessage({ type: "VALIDATE_LICENSE", key }, (r) =>
          chrome.runtime.lastError ? rej(chrome.runtime.lastError) : res(r)
        )
      );
      if (!result.valid) { setStatus("invalid"); return; }
      expiresAt = result.expiresAt;
    } catch {
      setStatus("error"); return;
    }
    await new Promise<void>((res) => chrome.storage.sync.set({ [LICENSE_STORAGE_KEY]: key }, res));
    await new Promise<void>((res) =>
      chrome.storage.local.set({ [LICENSE_CACHE_KEY]: { valid: true, expiresAt, ts: Date.now() } }, res)
    );
    setSavedKey(key);
    setStatus("saved");
  }

  const dirty = keyInput.trim().toUpperCase() !== savedKey;

  return (
    <div className={`cfg-view${anim ? " in" : ""}`}
         style={{ display: visible ? "flex" : "none" }}>
      <div className="cfg-header">
        <button className="back-btn" onClick={onBack}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M9 2L4 7l5 5" stroke="currentColor" strokeWidth="1.8"
              strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <span className="cfg-icon">🔑</span>
        <div className="cfg-header-text">
          <span className="cfg-title">License Key</span>
          <span className="cfg-subtitle">Activate xBot</span>
        </div>
        <button className="close-btn" onClick={onClose} aria-label="Close">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M2 2l10 10M12 2L2 12" stroke="currentColor"
              strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
        </button>
      </div>

      <div className="cfg-body">
        <div className="cfg-section">
          <div className="field">
            <span className="field-label">Your key</span>
            <input
              className="input"
              type="text"
              placeholder="XXXX-XXXX-XXXX-XXXX"
              value={keyInput}
              spellCheck={false}
              style={{ fontFamily: "'DM Mono', monospace", letterSpacing: "0.06em" }}
              onChange={(e) => { setKeyInput(e.target.value.toUpperCase()); setStatus("idle"); }}
            />
          </div>
          {status === "checking" && <div className="lic-status">Checking…</div>}
          {status === "saved"    && <div className="lic-status lic-status--ok">✓ Saved &amp; validated</div>}
          {status === "invalid"  && <div className="lic-status lic-status--err">Invalid or revoked key</div>}
          {status === "error"    && <div className="lic-status lic-status--err">Could not reach license server</div>}
        </div>
      </div>

      <div className="cfg-footer">
        <button
          className={`btn btn-save${dirty ? " btn-save--dirty" : ""}${status === "saved" ? " btn-save--saved" : ""}`}
          onClick={save}
          disabled={!dirty || status === "checking"}
        >
          {status === "checking" ? "Checking…" : status === "saved" ? "✓ Saved" : dirty ? "Save & validate" : "No changes"}
        </button>
      </div>
    </div>
  );
}

/* ─── ConfigView ──────────────────────────────────────────────────────────── */
function ConfigView({ id, visible, onBack, onClose }: {
  id: ModuleId; visible: boolean; onBack: () => void; onClose: () => void;
}) {
  const mod = MODULE_CONFIGS.find((m) => m.id === id)!;
  const { schema, vals, dirty, saved, set, save, reset } = useModuleCfg(visible ? id : null);
  const anim = useMountAnim(visible);

  if (!schema) return null;

  const checks = schema.fields.filter((f: FieldDef) => f.type === "checkbox");
  const inputs = schema.fields.filter((f: FieldDef) => f.type !== "checkbox");

  return (
    <div className={`cfg-view${anim ? " in" : ""}`}
         style={{ display: visible ? "flex" : "none" }}>
      <div className="cfg-header">
        <button className="back-btn" onClick={onBack}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M9 2L4 7l5 5" stroke="currentColor" strokeWidth="1.8"
              strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <span className="cfg-icon">
          {mod.iconImg
            ? <img src={chrome.runtime.getURL(`icons/${mod.iconImg}`)}
                   className="cfg-icon-img" alt={mod.label} />
            : mod.icon}
        </span>
        <div className="cfg-header-text">
          <span className="cfg-title">{mod.label}</span>
          <span className="cfg-subtitle">{schema.fields.length} settings</span>
        </div>
        <span className="cfg-status-dot"
          data-dirty={String(dirty)} data-saved={String(saved)} />
        <button className="close-btn" onClick={onClose} aria-label="Close">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M2 2l10 10M12 2L2 12" stroke="currentColor"
              strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
        </button>
      </div>

      <div className="cfg-body">
        <div className="cfg-section">
          {inputs.map((f: FieldDef) => (
            <Field key={f.key} f={f} val={vals[f.key]} onChange={set} />
          ))}
        </div>
        {checks.length > 0 && (
          <div className="cfg-section cfg-section-checks">
            <div className="section-label">Options</div>
            {checks.map((f: FieldDef) => (
              <Field key={f.key} f={f} val={vals[f.key]} onChange={set} />
            ))}
          </div>
        )}
      </div>

      <div className="cfg-footer">
        <button className="btn btn-ghost" onClick={reset}>Reset</button>
        <button
          className={`btn btn-save${dirty ? " btn-save--dirty" : ""}${saved ? " btn-save--saved" : ""}`}
          onClick={save} disabled={!dirty && !saved}>
          {saved ? <>✓ Saved</> : dirty ? "Save changes" : "Saved"}
        </button>
      </div>
    </div>
  );
}

/* ─── ModuleCard ──────────────────────────────────────────────────────────── */
function ModuleCard({ mod, isOn, isLive, hasCfg, onToggle, onCfg, index }: {
  mod: typeof MODULE_CONFIGS[0];
  isOn: boolean; isLive: boolean; hasCfg: boolean;
  onToggle: () => void; onCfg: () => void; index: number;
}) {
  return (
    <div className={`card${isOn ? " card--on" : ""}${isLive ? " card--live" : ""}`}
         style={{ animationDelay: `${index * 28}ms` }}>
      <div className="card-icon">
        {mod.iconImg
          ? <img src={chrome.runtime.getURL(`icons/${mod.iconImg}`)}
                 className="card-icon-img" alt={mod.label} />
          : mod.icon}
      </div>
      <div className="card-body" onClick={onToggle}>
        <div className="card-name">{mod.label}</div>
        <div className="card-desc">{mod.description}</div>
      </div>
      <div className="card-actions">
        {isLive && <span className="live-pip" />}
        {hasCfg && (
          <button className="cfg-btn"
            onClick={(e) => { e.stopPropagation(); onCfg(); }} title="Configure">
            <svg width="13" height="13" viewBox="0 0 20 20" fill="none">
              <path d="M10 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z"
                stroke="currentColor" strokeWidth="1.6"/>
              <path d="M16.2 10c0-.3 0-.6-.1-.9l1.9-1.5-1.8-3.1-2.2.9c-.5-.4-1-.7-1.6-.9L12 2H8l-.4 2.5c-.6.2-1.1.5-1.6.9l-2.2-.9L2 7.6l1.9 1.5c-.1.3-.1.6-.1.9s0 .6.1.9L2 12.4l1.8 3.1 2.2-.9c.5.4 1 .7 1.6.9L8 18h4l.4-2.5c.6-.2 1.1-.5 1.6-.9l2.2.9 1.8-3.1-1.9-1.5c.1-.3.1-.6.1-.9Z"
                stroke="currentColor" strokeWidth="1.6"/>
            </svg>
          </button>
        )}
        <label className="toggle" onClick={(e) => e.stopPropagation()}>
          <input type="checkbox" checked={isOn} onChange={onToggle} />
          <span className="toggle-thumb" />
        </label>
      </div>
    </div>
  );
}

/* ─── StatsBar ────────────────────────────────────────────────────────────── */
function StatsBar() {
  // Live account stats — require HTTP round-trips to the game server, so they only
  // update on manual refresh, not on a timer. Seeded from the last successful fetch
  // (persisted in localStorage) so they don't reset to "—" on every remount.
  const [attacks,   setAttacks]   = useState(() => loadLiveStats().attacks);
  const [nobles,    setNobles]    = useState(() => loadLiveStats().nobles);
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveError,   setLiveError]   = useState(false);

  const refreshLiveStats = useCallback(async () => {
    setLiveLoading(true);
    setLiveError(false);
    try {
      const [a, n] = await Promise.all([fetchAttackCommandCount(), fetchIncomingNobleCount()]);
      const aStr = String(a), nStr = String(n);
      setAttacks(aStr);
      setNobles(nStr);
      saveLiveStats(aStr, nStr);
    } catch (err) {
      console.error("[StatsBar] refreshLiveStats:", err);
      setLiveError(true);
    } finally {
      setLiveLoading(false);
    }
  }, []);

  return (
    <div className="stats-bar">
      <div className="stat-cell">
        <span className="stat-label">Comandos</span>
        <span className="stat-value">{attacks}</span>
      </div>
      <div className="stat-cell">
        <span className="stat-label">Nobres</span>
        <span className="stat-value">{nobles}</span>
      </div>
      <button className="stat-refresh-btn"
        onClick={refreshLiveStats}
        disabled={liveLoading}
        title={liveError ? "Falhou — clica para tentar de novo" : "Atualizar Attacks/Nobles inc. (pede dados à Tribal Wars)"}>
        {liveLoading ? <span className="spinner" /> : liveError ? "⚠" : "↻"}
      </button>
    </div>
  );
}

/* ─── Panel ───────────────────────────────────────────────────────────────── */
function Panel({
  visible, onClose, s, ready, isOn, toggle, view, setViewP, theme, onToggleTheme,
  onTwUtilsDrawerChange, licenseExpiresAt,
}: {
  visible: boolean;
  onClose: () => void;
  s: ModuleSettings;
  ready: boolean;
  isOn: (id: ModuleId) => boolean;
  toggle: (id: ModuleId) => void;
  view: View;
  setViewP: (v: View) => void;
  theme: "light" | "dark";
  onToggleTheme: () => void;
  onTwUtilsDrawerChange: (v: boolean) => void;
  licenseExpiresAt: string | null;
}) {
  const [search, setSearch] = useState("");
  const searchRef           = useRef<HTMLInputElement>(null);
  const anim                = useMountAnim(visible);

  const currentUrl = window.location.href;
  const liveIds    = new Set(
    MODULE_CONFIGS.filter((m) => m.matchPattern.test(currentUrl)).map((m) => m.id)
  );
  // Derive counts directly from reactive s — never stale
  const onCount   = MODULE_CONFIGS.filter((m) => s[m.id] === true).length;
  const liveCount = liveIds.size;

  const q        = search.toLowerCase();
  const filtered = MODULE_CONFIGS.filter((m) =>
    m.label.toLowerCase().includes(q) || m.description.toLowerCase().includes(q)
  );

  // Focus search when opening
  useEffect(() => {
    if (visible) {
      const t = setTimeout(() => searchRef.current?.focus(), 260);
      return () => clearTimeout(t);
    }
  }, [visible]);

  const cfgId = view.type === "config" ? view.id : null;

  const licenseDaysLeft = licenseExpiresAt
    ? Math.ceil((new Date(`${licenseExpiresAt}T00:00:00`).getTime() - Date.now()) / 86_400_000)
    : null;

  return (
    <div className={`panel${anim ? " in" : ""}`}
         style={{ display: visible ? "flex" : "none" }}>

      {/* List view — always rendered, hidden when in config */}
      <div style={{ display: view.type === "list" ? "contents" : "none" }}>
        <div className="panel-header">
          <div className="panel-header-left">
            <span className="panel-logo">⚡</span>
            <div>
              <div className="panel-title">xBot</div>
              {licenseExpiresAt && licenseDaysLeft !== null && (
                <div className={`panel-license${licenseDaysLeft <= 7 ? " panel-license--warn" : ""}`}>
                  Expires {licenseExpiresAt} · {licenseDaysLeft > 0
                    ? `${licenseDaysLeft} day${licenseDaysLeft !== 1 ? "s" : ""} left`
                    : "expired"}
                </div>
              )}
              <div className="panel-meta">
                <span className="meta-chip meta-on">{onCount} enabled</span>
                {liveCount > 0 && (
                  <span className="meta-chip meta-live">
                    <span className="live-pip live-pip--sm" />
                    {liveCount} live
                  </span>
                )}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <button className="theme-btn" onClick={onToggleTheme}
              aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              title={theme === "dark" ? "Light mode" : "Dark mode"}>
              {theme === "dark" ? "☀" : "☾"}
            </button>
            <button className="close-btn" onClick={onClose} aria-label="Close">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M2 2l10 10M12 2L2 12" stroke="currentColor"
                  strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
        </div>

        {onCount > 0 && <StatsBar />}

        <div className="search-wrap">
          <svg className="search-icon" width="14" height="14" viewBox="0 0 20 20" fill="none">
            <circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" strokeWidth="1.8"/>
            <path d="M14.5 14.5L18 18" stroke="currentColor"
              strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
          <input ref={searchRef} className="search-input" type="text"
            placeholder="Search modules…" value={search}
            onChange={(e) => setSearch(e.target.value)} />
          {search && (
            <button className="search-clear" onClick={() => setSearch("")}>×</button>
          )}
        </div>

        {liveCount > 0 && !search && (
          <div className="live-banner">
            <span className="live-pip" />
            {liveCount} module{liveCount !== 1 ? "s" : ""} running on this page
          </div>
        )}

        <div className="card-list">
          {!ready ? (
            <div className="state-msg">
              <span className="spinner" />Loading…
            </div>
          ) : filtered.length === 0 ? (
            <div className="state-msg">No modules match "{search}"</div>
          ) : (
            filtered.map((mod, i) => (
              <ModuleCard
                key={mod.id}
                mod={mod}
                isOn={isOn(mod.id)}
                isLive={liveIds.has(mod.id)}
                hasCfg={Boolean(MODULE_CONFIG_SCHEMAS[mod.id])}
                onToggle={() => toggle(mod.id)}
                onCfg={() => {
                  if (mod.id === "fakes") {
                    setViewP({ type: "fakes" });
                  } else if (mod.id === "tw_snipe_scheduler") {
                    setViewP({ type: "snipe" });
                  } else if (mod.id === "wh_balancer") {
                    setViewP({ type: "balancer" });
                  } else if (mod.id === "kumin_gluer") {
                    setViewP({ type: "gluer" });
                  } else if (mod.id === "resource_buyer") {
                    setViewP({ type: "buyer" });
                  } else if (mod.id === "auto_sender") {
                    setViewP({ type: "autosender" });
                  } else if (mod.id === "tw_utils") {
                    setViewP({ type: "twutils" });
                  } else {
                    setViewP({ type: "config", id: mod.id });
                  }
                }}
                index={i}
              />
            ))
          )}
        </div>

        <div className="panel-footer">
          <button className="footer-btn"
            onClick={() => MODULE_CONFIGS.forEach((m) => {
              if (s[m.id] !== true) toggle(m.id);
            })}>All on</button>
          <button className="footer-btn footer-btn--danger"
            onClick={() => MODULE_CONFIGS.forEach((m) => {
              if (s[m.id] === true) toggle(m.id);
            })}>All off</button>
          <span className="footer-ver">v1.0</span>
          <button className="footer-btn footer-btn--key"
            onClick={() => setViewP({ type: "license" })}
            title="License key">🔑</button>
        </div>
      </div>

      {/* Config view — one per possible cfgId, shown/hidden */}
      {MODULE_CONFIGS.filter((m) => Boolean(MODULE_CONFIG_SCHEMAS[m.id]) && m.id !== "fakes").map((m) => (
        <ConfigView key={m.id} id={m.id}
          visible={view.type === "config" && view.id === m.id}
          onBack={() => setViewP({ type: "list" })}
          onClose={onClose} />
      ))}

      {/* Fake Sender — dedicated panel with Status + Settings tabs */}
      <FakeSenderView
        visible={view.type === "fakes"}
        onBack={() => setViewP({ type: "list" })}
      />

      {/* Snipe Scheduler — dedicated panel with gap/candidate UI */}
      <SnipeView
        visible={view.type === "snipe"}
        onBack={() => setViewP({ type: "list" })}
      />
      <BalancerView
        visible={view.type === "balancer"}
        onBack={() => setViewP({ type: "list" })}
      />
      <DesviadorView
        visible={view.type === "desviador"}
        onBack={() => setViewP({ type: "list" })}
      />
      <GluerView
        visible={view.type === "gluer"}
        onBack={() => setViewP({ type: "list" })}
      />
      <ResourceBuyerView
        visible={view.type === "buyer"}
        onBack={() => setViewP({ type: "list" })}
      />
      <LabelView
        visible={view.type === "label"}
        onBack={() => setViewP({ type: "list" })}
        onClose={onClose}
      />
      <AutoSenderView
        visible={view.type === "autosender"}
        onBack={() => setViewP({ type: "list" })}
      />
      <TwUtilsView
        visible={view.type === "twutils"}
        onBack={() => setViewP({ type: "list" })}
        onShowDrawerChange={onTwUtilsDrawerChange}
      />
      <TelegramView
        visible={view.type === "telegram"}
        onBack={() => setViewP({ type: "list" })}
      />
      <LicenseView
        visible={view.type === "license"}
        onBack={() => setViewP({ type: "list" })}
        onClose={onClose}
      />
    </div>
  );
}

/* ─── OverlayRoot ─────────────────────────────────────────────────────────── */
export function OverlayRoot({ shadowHost }: { shadowHost: Element }) {
  // Persist open/closed across page navigations (place→confirm→place loop)
  const [open, setOpenRaw] = useState(() =>
    sessionStorage.getItem("xbot_overlay_open") === "1"
  );
  const setOpen = (next: boolean | ((p: boolean) => boolean)) => {
    setOpenRaw((prev) => {
      const val = typeof next === "function" ? next(prev) : next;
      sessionStorage.setItem("xbot_overlay_open", val ? "1" : "0");
      return val;
    });
  };

  // Dark / light theme — read sessionStorage on mount, apply to shadow host
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    return (sessionStorage.getItem("xbot_theme") as "light" | "dark") ?? "light";
  });
  // Sync theme attribute to shadow host element on every change
  useEffect(() => {
    if (theme === "dark") {
      (shadowHost as HTMLElement).dataset.theme = "dark";
    } else {
      delete (shadowHost as HTMLElement).dataset.theme;
    }
    sessionStorage.setItem("xbot_theme", theme);
  }, [theme, shadowHost]);

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === "dark" ? "light" : "dark"));
  }, []);

  // Settings live HERE — never unmount, never reset on close
  const { s, ready, isOn, toggle } = useSettings();

  // License expiry — read the validation cache written by router.ts / LicenseView,
  // and stay in sync when either revalidates (fresh save, cache refresh on nav).
  const [licenseExpiresAt, setLicenseExpiresAt] = useState<string | null>(null);
  useEffect(() => {
    const read = () => {
      chrome.storage.local.get(LICENSE_CACHE_KEY, (r) => {
        const cache = r[LICENSE_CACHE_KEY] as { expiresAt?: string | null } | undefined;
        setLicenseExpiresAt(cache?.expiresAt ?? null);
      });
    };
    read();
    const onChange = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === "local" && changes[LICENSE_CACHE_KEY]) read();
    };
    chrome.storage.onChanged.addListener(onChange);
    return () => chrome.storage.onChanged.removeListener(onChange);
  }, []);

  // tw_utils: whether to show the ⚙️ drawer trigger button
  const [twUtilsShowDrawer, setTwUtilsShowDrawer] = useState(true);
  useEffect(() => {
    storageGet(["tw_suite_cfg_tw_utils"]).then((r) => {
      const cfg = (r["tw_suite_cfg_tw_utils"] as Record<string, unknown>) ?? {};
      setTwUtilsShowDrawer(cfg["showDrawer"] !== false);
    });
  }, []);

  // Desviador state — updated by listening to the userscript's state events
  const [desvActive, setDesvActive] = useState(false);
  const [desvCount,  setDesvCount]  = useState(0);
  useEffect(() => {
    const handler = (e: Event) => {
      const d = (e as CustomEvent).detail as { active: boolean; scheduled: unknown[] };
      setDesvActive(d.active);
      setDesvCount(d.scheduled.length);
    };
    document.addEventListener("xbot:desviador:state", handler);
    return () => document.removeEventListener("xbot:desviador:state", handler);
  }, []);

  // Auto Sender queue count + next launch time — poll localStorage
  const [asQueueCount,  setAsQueueCount]  = useState(0);
  const [asNextLaunch,  setAsNextLaunch]  = useState<number | null>(null);
  const [asNow,         setAsNow]         = useState(() => getServerNowMs());
  useEffect(() => {
    const update = () => {
      try {
        const q = JSON.parse(localStorage.getItem("xbot_autosender_queue") ?? "[]") as
          Array<{ status?: string; launch?: number }>;
        if (Array.isArray(q)) {
          const pending = q.filter(e => e.status === "pending");
          setAsQueueCount(pending.length);
          const ts = pending.map(e => e.launch ?? 0).filter(t => t > 0);
          setAsNextLaunch(ts.length > 0 ? Math.min(...ts) : null);
        } else {
          setAsQueueCount(0);
          setAsNextLaunch(null);
        }
      } catch { setAsQueueCount(0); setAsNextLaunch(null); }
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, []);

  // Countdown ticker using server time — matches auto_sender confirm overlay
  useEffect(() => {
    if (asNextLaunch === null) return;
    const id = setInterval(() => setAsNow(getServerNowMs()), 200);
    return () => clearInterval(id);
  }, [asNextLaunch]);

  // Resource Buyer next action countdown — polls localStorage written by userscript
  const [buyerNextAt, setBuyerNextAt] = useState<number | null>(null);
  const [buyerNow,    setBuyerNow]    = useState(() => Date.now());
  useEffect(() => {
    const update = () => {
      const v = parseInt(localStorage.getItem("tw_buyer_next_action_at") ?? "", 10);
      setBuyerNextAt(!isNaN(v) && v > Date.now() ? v : null);
    };
    update();
    const id = setInterval(update, 500);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (buyerNextAt === null) return;
    const id = setInterval(() => setBuyerNow(Date.now()), 200);
    return () => clearInterval(id);
  }, [buyerNextAt]);

  const isIncomingsPage = /screen=overview_villages.*mode=incomings.*subtype=attacks/.test(
    window.location.href
  );
  const isMapPage = /screen=map/.test(window.location.href);

  // Count gaps from live DOM — poll every 2 s so the button appears/disappears
  // as the user navigates or the incomings table updates.
  const [gapCount, setGapCount] = useState(0);
  useEffect(() => {
    const count = () => {
      const wrap = document.querySelector("#commands_incomings");
      if (!wrap) { setGapCount(0); return; }
      let attacks = 0;
      wrap.querySelectorAll<HTMLElement>("tr.command-row").forEach((tr) => {
        if (tr.querySelector('img[src*="attack"]')) attacks++;
      });
      setGapCount(Math.max(0, attacks - 1));
    };
    count();
    const id = setInterval(count, 2000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, []);

  // View state lifted here so the drawer width can react to it
  const [view, setView] = useState<View>(() => {
    const v = sessionStorage.getItem("xbot_panel_view");
    if (v === "fakes")     return { type: "fakes" };
    if (v === "snipe")     return { type: "snipe" };
    if (v === "balancer")  return { type: "balancer" };
    if (v === "desviador") return { type: "desviador" };
    if (v === "gluer")      return { type: "gluer" };
    if (v === "buyer")      return { type: "buyer" };
    if (v === "autosender") return { type: "autosender" };
    if (v === "twutils")    return { type: "twutils" };
    if (v === "telegram")   return { type: "telegram" };
    if (v === "license")    return { type: "license" };
    return { type: "list" };
  });
  const setViewP = (v: View) => {
    sessionStorage.setItem("xbot_panel_view", v.type);
    setView(v);
  };

  // Open drawer directly to snipe view
  const openSnipe = () => {
    setViewP({ type: "snipe" });
    setOpen(true);
  };

  // Open drawer directly to desviador view
  const openDesviador = () => {
    setViewP({ type: "desviador" });
    setOpen(true);
  };

  // Auto-open gluer panel when the userscript selects an attack
  useEffect(() => {
    const h = () => { setViewP({ type: "gluer" }); setOpen(true); };
    document.addEventListener("xbot:gluer:select", h);
    return () => document.removeEventListener("xbot:gluer:select", h);
  }, []);

  const isSnipe        = view.type === "snipe";
  const isBalancer     = view.type === "balancer";
  const isGluer        = view.type === "gluer";
  const isInfoVillage  = /screen=info_village/.test(window.location.href);
  const isExchangePage = /screen=market.*mode=exchange/.test(window.location.href);
  const isLabelPage    = /screen=overview_villages.*mode=incomings/.test(window.location.href);

  // Resizable drawer — custom width persists in sessionStorage
  const [drawerWidth, setDrawerWidth] = useState<number | null>(() => {
    const saved = sessionStorage.getItem("xbot_drawer_width");
    return saved ? Number(saved) : null;
  });
  const [resizing, setResizing] = useState(false);
  const draggingRef = useRef(false);

  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    setResizing(true);
    const startX = e.clientX;
    const drawerEl = (e.currentTarget as HTMLElement).parentElement;
    const startWidth = drawerEl
      ? drawerEl.getBoundingClientRect().width
      : (drawerWidth ?? 340);

    const onMove = (ev: MouseEvent) => {
      if (!draggingRef.current) return;
      const newWidth = Math.max(240, Math.min(900, startWidth + ev.clientX - startX));
      setDrawerWidth(newWidth);
    };
    const onUp = () => {
      draggingRef.current = false;
      setResizing(false);
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      setDrawerWidth((w) => {
        if (w !== null) sessionStorage.setItem("xbot_drawer_width", String(Math.round(w)));
        return w;
      });
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [drawerWidth]);

  return (
    <>
      <div className="trigger-stack">
        <button className={`trigger${open ? " trigger--open" : ""}`}
          onClick={() => setOpen((o) => !o)} title="xBot" aria-label="xBot">⚡</button>

        {gapCount > 0 && isOn("tw_snipe_scheduler") && (
          <button className="trigger trigger--snipe" onClick={openSnipe}
            title={`${gapCount} gap${gapCount !== 1 ? "s" : ""} — open snipe planner`}
            aria-label="Snipe planner">
            🏹<span className="trigger-badge-count">{gapCount}</span>
          </button>
        )}

        {isInfoVillage && isOn("kumin_gluer") && (
          <button className="trigger trigger--gluer"
            onClick={() => { setViewP({ type: "gluer" }); setOpen(true); }}
            title="Kumin Gluer"
            aria-label="Kumin Gluer">
            <img src={chrome.runtime.getURL("icons/colatudo.png")}
                 alt="Kumin Gluer" className="trigger-icon-img" />
          </button>
        )}

        {(isIncomingsPage || desvActive) && (
          <button className="trigger trigger--desviador" onClick={openDesviador}
            title={desvActive ? `Desviador — ${desvCount} programado(s)` : "Desviador"}
            aria-label="Desviador">
            🔀
            {desvActive && desvCount > 0 && (
              <span className="trigger-badge-count">{desvCount}</span>
            )}
          </button>
        )}

        <button className="trigger trigger--balancer"
          onClick={() => { setViewP({ type: "balancer" }); setOpen(true); }}
          title="WH Balancer" aria-label="WH Balancer">⚖️</button>

        {isOn("auto_sender") && (
          <button className="trigger trigger--autosender"
            onClick={() => { setViewP({ type: "autosender" }); setOpen(true); }}
            title={asQueueCount > 0 ? `Auto Sender — ${asQueueCount} na fila` : "Auto Sender"}
            aria-label="Auto Sender">
            🚀
            {asQueueCount > 0 && <span className="trigger-badge-count">{asQueueCount}</span>}
            {asNextLaunch !== null && (
              <span className="trigger-timer">
                {fmtTriggerTimer(Math.max(0, asNextLaunch - asNow))}
              </span>
            )}
          </button>
        )}

        {isExchangePage && isOn("resource_buyer") && (
          <button className="trigger trigger--buyer"
            onClick={() => { setViewP({ type: "buyer" }); setOpen(true); }}
            title="Resource Buyer" aria-label="Resource Buyer">
            🛒
            {buyerNextAt !== null && (
              <span className="trigger-timer">
                {fmtTriggerTimer(Math.max(0, buyerNextAt - buyerNow))}
              </span>
            )}
          </button>
        )}

        {isLabelPage && isOn("mass_label_renamer") && (
          <button className="trigger trigger--label"
            onClick={() => { setViewP({ type: "label" }); setOpen(true); }}
            title="Label + Renamer" aria-label="Label + Renamer">🏷️</button>
        )}

        {isOn("tw_utils") && twUtilsShowDrawer && (
          <button className="trigger trigger--twutils"
            onClick={() => { setViewP({ type: "twutils" }); setOpen(true); }}
            title="TW Tweaks" aria-label="TW Tweaks">⚙️</button>
        )}

        {isMapPage && isOn("tw_utils") && twUtilsShowDrawer && (
          <button className="trigger trigger--mapsel"
            onClick={() => { setViewP({ type: "twutils" }); setOpen(true); }}
            title="Map Draw Select" aria-label="Map Draw Select">⚙️</button>
        )}

        {isOn("telegram_notifier") && (
          <button className="trigger trigger--telegram"
            onClick={() => { setViewP({ type: "telegram" }); setOpen(true); }}
            title="Telegram Notifier" aria-label="Telegram Notifier">🔔</button>
        )}
      </div>
      {/* Backdrop only shown when open */}
      <div className="backdrop" style={{ display: open ? "block" : "none" }}
           onClick={() => setOpen(false)} />

      {/* Drawer — wider when snipe view is active; right edge is draggable to resize */}
      <div className={`drawer${open ? " drawer--open" : ""}
        ${isSnipe ? " drawer--snipe" : ""}
        ${isBalancer ? " drawer--balancer" : ""}
        ${isGluer ? " drawer--snipe" : ""}`}
        style={drawerWidth !== null ? { width: `${drawerWidth}px` } : undefined}>
        <div
          className={`drawer-resize-handle${resizing ? " drawer-resize-handle--dragging" : ""}`}
          onMouseDown={handleResizeMouseDown}
        />
        <Panel
          visible={open}
          onClose={() => setOpen(false)}
          s={s} ready={ready} isOn={isOn} toggle={toggle}
          view={view} setViewP={setViewP}
          theme={theme} onToggleTheme={toggleTheme}
          onTwUtilsDrawerChange={setTwUtilsShowDrawer}
          licenseExpiresAt={licenseExpiresAt}
        />
      </div>
    </>
  );
}
import React, {
  useCallback, useEffect, useRef, useState, createContext, useContext,
} from "react";
import {
  MODULE_CONFIGS, ModuleId, STORAGE_KEY, ModuleSettings,
} from "../../types/modules";
import {
  MODULE_CONFIG_SCHEMAS, FieldDef, ModuleConfigSchema,
} from "../../types/config-schemas";

/* ─── Storage ─────────────────────────────────────────────────────────────── */
function storageGet(keys: string[]): Promise<Record<string, unknown>> {
  return new Promise((res) =>
    chrome.storage.sync.get(
      keys.reduce<Record<string, undefined>>((a, k) => { a[k] = undefined; return a; }, {}),
      (r) => res(r as Record<string, unknown>)
    )
  );
}
function storageSet(data: Record<string, unknown>): Promise<void> {
  return new Promise((res) => chrome.storage.sync.set(data, res));
}

/* ─── Types ───────────────────────────────────────────────────────────────── */
type CfgValues = Record<string, string | number | boolean>;
type View = { type: "list" } | { type: "config"; id: ModuleId };

/* ─── Hooks ───────────────────────────────────────────────────────────────── */
function useSettings() {
  const [s, setS] = useState<ModuleSettings>({});
  const [ready, setReady] = useState(false);

  useEffect(() => {
    storageGet([STORAGE_KEY]).then((r) => {
      setS((r[STORAGE_KEY] as ModuleSettings) ?? {});
      setReady(true);
    });
  }, []);

  const toggle = useCallback(async (id: ModuleId) => {
    const next = !(s[id] !== false);
    const updated = { ...s, [id]: next };
    setS(updated);
    await storageSet({ [STORAGE_KEY]: updated });
  }, [s]);

  const isOn = useCallback((id: ModuleId) => s[id] !== false, [s]);
  return { ready, isOn, toggle };
}

function useModuleCfg(id: ModuleId | null) {
  const schema: ModuleConfigSchema | undefined = id ? MODULE_CONFIG_SCHEMAS[id] : undefined;
  const [vals, setVals] = useState<CfgValues>({});
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!schema || !id) return;
    const defs: CfgValues = Object.fromEntries(schema.fields.map((f: FieldDef) => [f.key, f.default]));
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
    const defs: CfgValues = Object.fromEntries(schema.fields.map((f: FieldDef) => [f.key, f.default]));
    await storageSet({ [schema.storageKey]: defs });
    setVals(defs); setDirty(false);
  }, [schema, id]);

  return { schema, vals, dirty, saved, set, save, reset };
}

/* ─── Animated mount helper ──────────────────────────────────────────────── */
function useMountAnim() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { requestAnimationFrame(() => setMounted(true)); }, []);
  return mounted;
}

/* ─── Config field ────────────────────────────────────────────────────────── */
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

  // number / text / time
  const isNum = f.type === "number";
  const rangeParts: string[] = [];
  if (isNum && f.min !== undefined) rangeParts.push(`${f.min}–`);
  if (isNum && f.max !== undefined) rangeParts[0] = rangeParts[0]
    ? `${f.min}–${f.max}` : `–${f.max}`;
  if (isNum && f.step !== undefined && f.step !== 1) rangeParts.push(`step ${f.step}`);
  const rangeHint = rangeParts.filter(Boolean).join(", ");

  return (
    <div className="field">
      <div className="field-top">
        <span className="field-label">{f.label}</span>
        {rangeHint && <span className="field-range">{rangeHint}</span>}
      </div>
      {f.help && <span className="field-help">{f.help}</span>}
      <input className="input" type={f.type} value={String(v)}
        min={f.min} max={f.max} step={f.step}
        onChange={(e) => {
          if (isNum) {
            const n = parseFloat(e.target.value);
            onChange(f.key, Number.isFinite(n) ? n : f.default as number);
          } else onChange(f.key, e.target.value);
        }} />
    </div>
  );
}

/* ─── Config view ─────────────────────────────────────────────────────────── */
function ConfigView({ id, onBack }: { id: ModuleId; onBack: () => void }) {
  const mod = MODULE_CONFIGS.find((m) => m.id === id)!;
  const { schema, vals, dirty, saved, set, save, reset } = useModuleCfg(id);
  const mounted = useMountAnim();

  if (!schema) return null;

  // Group fields: checkboxes at bottom, rest on top
  const checks = schema.fields.filter((f: FieldDef) => f.type === "checkbox");
  const inputs = schema.fields.filter((f: FieldDef) => f.type !== "checkbox");

  return (
    <div className={`cfg-view${mounted ? " in" : ""}`}>
      <div className="cfg-header">
        <button className="back-btn" onClick={onBack}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M9 2L4 7l5 5" stroke="currentColor" strokeWidth="1.8"
              strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <span className="cfg-icon">{mod.icon}</span>
        <div className="cfg-header-text">
          <span className="cfg-title">{mod.label}</span>
          <span className="cfg-subtitle">{schema.fields.length} settings</span>
        </div>
        <div className="cfg-status-dot" data-dirty={dirty} data-saved={saved} />
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
          onClick={save}
          disabled={!dirty && !saved}
        >
          {saved
            ? <><Checkmark /> Saved</>
            : dirty ? "Save changes" : "Saved"
          }
        </button>
      </div>
    </div>
  );
}

/* ─── Module card ─────────────────────────────────────────────────────────── */
function ModuleCard({
  mod, isOn, isLive, hasCfg, onToggle, onCfg, index,
}: {
  mod: typeof MODULE_CONFIGS[0];
  isOn: boolean;
  isLive: boolean;
  hasCfg: boolean;
  onToggle: () => void;
  onCfg: () => void;
  index: number;
}) {
  return (
    <div
      className={`card${isOn ? " card--on" : ""}${isLive ? " card--live" : ""}`}
      style={{ animationDelay: `${index * 28}ms` }}
    >
      <div className="card-icon">{mod.icon}</div>
      <div className="card-body" onClick={onToggle}>
        <div className="card-name">{mod.label}</div>
        <div className="card-desc">{mod.description}</div>
      </div>
      <div className="card-actions">
        {isLive && <span className="live-pip" />}
        {hasCfg && (
          <button className="cfg-btn" onClick={(e) => { e.stopPropagation(); onCfg(); }}
            title="Configure">
            <svg width="13" height="13" viewBox="0 0 20 20" fill="none">
              <path d="M10 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" stroke="currentColor" strokeWidth="1.6"/>
              <path d="M16.2 10c0-.3 0-.6-.1-.9l1.9-1.5-1.8-3.1-2.2.9c-.5-.4-1-.7-1.6-.9L12 2H8l-.4 2.5c-.6.2-1.1.5-1.6.9l-2.2-.9L2 7.6l1.9 1.5c-.1.3-.1.6-.1.9s0 .6.1.9L2 12.4l1.8 3.1 2.2-.9c.5.4 1 .7 1.6.9L8 18h4l.4-2.5c.6-.2 1.1-.5 1.6-.9l2.2.9 1.8-3.1-1.9-1.5c.1-.3.1-.6.1-.9Z" stroke="currentColor" strokeWidth="1.6"/>
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

/* ─── Small icons ─────────────────────────────────────────────────────────── */
function Checkmark() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{marginRight:4}}>
      <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8"
        strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

/* ─── Panel ───────────────────────────────────────────────────────────────── */
function Panel({ onClose }: { onClose: () => void }) {
  const { ready, isOn, toggle } = useSettings();
  const [view, setView]         = useState<View>({ type: "list" });
  const [search, setSearch]     = useState("");
  const searchRef               = useRef<HTMLInputElement>(null);
  const mounted                 = useMountAnim();

  const currentUrl = window.location.href;
  const liveIds    = new Set(MODULE_CONFIGS.filter((m) => m.matchPattern.test(currentUrl)).map((m) => m.id));
  const onCount    = MODULE_CONFIGS.filter((m) => isOn(m.id)).length;
  const liveCount  = liveIds.size;

  const q        = search.toLowerCase();
  const filtered = MODULE_CONFIGS.filter((m) =>
    m.label.toLowerCase().includes(q) || m.description.toLowerCase().includes(q)
  );

  // Focus search on open
  useEffect(() => {
    const t = setTimeout(() => searchRef.current?.focus(), 260);
    return () => clearTimeout(t);
  }, []);

  if (view.type === "config") return (
    <ConfigView id={view.id} onBack={() => setView({ type: "list" })} />
  );

  return (
    <div className={`panel${mounted ? " in" : ""}`}>

      {/* Header */}
      <div className="panel-header">
        <div className="panel-header-left">
          <span className="panel-logo">⚡</span>
          <div>
            <div className="panel-title">TW Suite</div>
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
        <button className="close-btn" onClick={onClose} aria-label="Close">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M2 2l10 10M12 2L2 12" stroke="currentColor"
              strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
        </button>
      </div>

      {/* Search */}
      <div className="search-wrap">
        <svg className="search-icon" width="14" height="14" viewBox="0 0 20 20" fill="none">
          <circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" strokeWidth="1.8"/>
          <path d="M14.5 14.5L18 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
        </svg>
        <input ref={searchRef} className="search-input" type="text"
          placeholder="Search modules…" value={search}
          onChange={(e) => setSearch(e.target.value)} />
        {search && (
          <button className="search-clear" onClick={() => setSearch("")}>×</button>
        )}
      </div>

      {/* Live banner */}
      {liveCount > 0 && !search && (
        <div className="live-banner">
          <span className="live-pip" />
          <span>{liveCount} module{liveCount !== 1 ? "s" : ""} running on this page</span>
        </div>
      )}

      {/* List */}
      <div className="card-list">
        {!ready ? (
          <div className="state-msg">
            <span className="spinner" />
            Loading…
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
              onCfg={() => setView({ type: "config", id: mod.id })}
              index={i}
            />
          ))
        )}
      </div>

      {/* Footer */}
      <div className="panel-footer">
        <button className="footer-btn" onClick={() => {
          MODULE_CONFIGS.forEach((m) => { if (!isOn(m.id)) toggle(m.id); });
        }}>All on</button>
        <button className="footer-btn footer-btn--danger" onClick={() => {
          MODULE_CONFIGS.forEach((m) => { if (isOn(m.id)) toggle(m.id); });
        }}>All off</button>
        <span className="footer-ver">v1.0</span>
      </div>
    </div>
  );
}

/* ─── Root ────────────────────────────────────────────────────────────────── */
export function OverlayRoot() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, []);

  return (
    <>
      <button
        className={`trigger${open ? " trigger--open" : ""}`}
        onClick={() => setOpen((o) => !o)}
        title="TW Suite"
        aria-label="TW Suite"
      >⚡</button>

      {open && <div className="backdrop" onClick={() => setOpen(false)} />}

      <div className={`drawer${open ? " drawer--open" : ""}`}>
        {open && <Panel onClose={() => setOpen(false)} />}
      </div>
    </>
  );
}

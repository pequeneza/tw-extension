import React, { useCallback, useEffect, useState } from "react";
import {
  MODULE_CONFIGS,
  ModuleId,
  STORAGE_KEY,
  ModuleSettings,
} from "../../types/modules";
import {
  MODULE_CONFIG_SCHEMAS,
  FieldDef,
  ModuleConfigSchema,
} from "../../types/config-schemas";

/* ── Storage helpers ─────────────────────────────────────────────────────────── */

function storageGet(keys: string[]): Promise<Record<string, unknown>> {
  return new Promise((resolve) =>
    chrome.storage.sync.get(
      keys.reduce<Record<string, undefined>>((acc, k) => { acc[k] = undefined; return acc; }, {}),
      (res) => resolve(res as Record<string, unknown>)
    )
  );
}
function storageSet(data: Record<string, unknown>): Promise<void> {
  return new Promise((resolve) => chrome.storage.sync.set(data, resolve));
}

type CfgValues = Record<string, string | number | boolean>;

/* ── Hooks ───────────────────────────────────────────────────────────────────── */

function useSettings() {
  const [settings, setSettings] = useState<ModuleSettings>({});
  const [ready, setReady] = useState(false);

  useEffect(() => {
    storageGet([STORAGE_KEY]).then((r) => {
      setSettings((r[STORAGE_KEY] as ModuleSettings) ?? {});
      setReady(true);
    });
  }, []);

  const toggle = useCallback(async (id: ModuleId) => {
    const next = !(settings[id] !== false);
    const updated = { ...settings, [id]: next };
    setSettings(updated);
    await storageSet({ [STORAGE_KEY]: updated });
  }, [settings]);

  const isEnabled = useCallback((id: ModuleId) => settings[id] !== false, [settings]);
  return { ready, isEnabled, toggle };
}

function useModuleCfg(id: ModuleId | null) {
  const schema: ModuleConfigSchema | undefined = id ? MODULE_CONFIG_SCHEMAS[id] : undefined;
  const [values, setValues] = useState<CfgValues>({});
  const [dirty,  setDirty]  = useState(false);
  const [saved,  setSaved]  = useState(false);

  useEffect(() => {
    if (!schema || !id) return;
    const defaults: CfgValues = Object.fromEntries(schema.fields.map((f: FieldDef) => [f.key, f.default]));
    storageGet([schema.storageKey]).then((r) => {
      setValues({ ...defaults, ...((r[schema.storageKey] as CfgValues) ?? {}) });
      setDirty(false);
    });
  }, [id]);

  const set = useCallback((key: string, val: string | number | boolean) => {
    setValues((p) => ({ ...p, [key]: val }));
    setDirty(true);
    setSaved(false);
  }, []);

  const save = useCallback(async () => {
    if (!schema) return;
    await storageSet({ [schema.storageKey]: values });
    setDirty(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [schema, values]);

  const reset = useCallback(async () => {
    if (!schema || !id) return;
    const defaults: CfgValues = Object.fromEntries(schema.fields.map((f: FieldDef) => [f.key, f.default]));
    await storageSet({ [schema.storageKey]: defaults });
    setValues(defaults);
    setDirty(false);
  }, [schema, id]);

  return { schema, values, dirty, saved, set, save, reset };
}

/* ── Config field ────────────────────────────────────────────────────────────── */

interface CfgFieldProps {
  f: FieldDef;
  val: unknown;
  set: (k: string, v: string | number | boolean) => void;
}

function CfgField({ f, val, set }: CfgFieldProps) {
  const v = val !== undefined ? val : f.default;

  if (f.type === "checkbox") return (
    <div className="ov-f-row ov-f-check">
      <label className="ov-f-chk-lbl">
        <span className="ov-tog" onClick={(e) => e.stopPropagation()}>
          <input type="checkbox" checked={Boolean(v)}
            onChange={(e) => set(f.key, e.target.checked)} />
          <span className="ov-tog-track" />
        </span>
        <div>
          <div className="ov-f-lbl">{f.label}</div>
          {f.help && <div className="ov-f-help">{f.help}</div>}
        </div>
      </label>
    </div>
  );

  if (f.type === "textarea") return (
    <div className="ov-f-row">
      <div className="ov-f-lbl">{f.label}</div>
      {f.help && <div className="ov-f-help">{f.help}</div>}
      <textarea className="ov-f-ta" rows={f.rows ?? 5}
        value={String(v)} onChange={(e) => set(f.key, e.target.value)}
        spellCheck={false} />
    </div>
  );

  if (f.type === "select" && f.options) return (
    <div className="ov-f-row">
      <div className="ov-f-lbl">{f.label}</div>
      {f.help && <div className="ov-f-help">{f.help}</div>}
      <select className="ov-f-inp" value={String(v)}
        onChange={(e) => set(f.key, e.target.value)}>
        {f.options.map((o: { value: string; label: string }) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );

  if (f.type === "number") {
    const hint = [
      f.min  !== undefined ? `min ${f.min}`  : "",
      f.max  !== undefined ? `max ${f.max}`  : "",
      f.step !== undefined ? `step ${f.step}` : "",
    ].filter(Boolean).join(" · ");

    return (
      <div className="ov-f-row">
        <div className="ov-f-lbl">{f.label}</div>
        {f.help && <div className="ov-f-help">{f.help}</div>}
        <div className="ov-f-num-wrap">
          <input className="ov-f-inp" type="number"
            value={String(v)} min={f.min} max={f.max} step={f.step}
            onChange={(e) => {
              const n = parseFloat(e.target.value);
              set(f.key, Number.isFinite(n) ? n : (f.default as number));
            }} />
          {hint && <span className="ov-f-hint">{hint}</span>}
        </div>
      </div>
    );
  }

  return (
    <div className="ov-f-row">
      <div className="ov-f-lbl">{f.label}</div>
      {f.help && <div className="ov-f-help">{f.help}</div>}
      <input className="ov-f-inp" type={f.type} value={String(v)}
        onChange={(e) => set(f.key, e.target.value)} />
    </div>
  );
}

/* ── Panel ───────────────────────────────────────────────────────────────────── */

function OverlayPanel({ onClose }: { onClose: () => void }) {
  const { ready, isEnabled, toggle } = useSettings();
  const [search, setSearch]          = useState("");
  const [cfgId, setCfgId]            = useState<ModuleId | null>(null);
  const { schema: cfgSchema, values, dirty, saved, set, save, reset } = useModuleCfg(cfgId);

  const currentUrl   = window.location.href;
  const liveIds      = new Set(MODULE_CONFIGS.filter((m) => m.matchPattern.test(currentUrl)).map((m) => m.id));
  const enabledCount = MODULE_CONFIGS.filter((m) => isEnabled(m.id)).length;
  const cfgMod       = cfgId ? MODULE_CONFIGS.find((m) => m.id === cfgId) : null;

  const q        = search.toLowerCase();
  const filtered = MODULE_CONFIGS.filter((m) =>
    m.label.toLowerCase().includes(q) || m.description.toLowerCase().includes(q)
  );

  return (
    <div className="ov-panel">

      {/* Header */}
      <div className="ov-hdr">
        {cfgId ? (
          <>
            <button className="ov-back" onClick={() => setCfgId(null)}>← Back</button>
            <span className="ov-hdr-icon">{cfgMod?.icon}</span>
            <span className="ov-hdr-name">{cfgMod?.label}</span>
          </>
        ) : (
          <>
            <span className="ov-hdr-icon">⚡</span>
            <div>
              <div className="ov-hdr-title">TW Suite</div>
              <div className="ov-hdr-sub">{enabledCount} of {MODULE_CONFIGS.length} enabled</div>
            </div>
          </>
        )}
        <button className="ov-close" onClick={onClose}>✕</button>
      </div>

      {cfgId && cfgSchema ? (
        /* Config view */
        <>
          <div className="ov-fields">
            {cfgSchema.fields.map((f: FieldDef) => (
              <CfgField key={f.key} f={f} val={values[f.key]} set={set} />
            ))}
          </div>
          <div className="ov-cfg-acts">
            <button className="ov-btn ov-btn-rst" onClick={reset}>Reset to defaults</button>
            <button
              className={`ov-btn ov-btn-sav${dirty ? " dirty" : ""}${saved ? " saved" : ""}`}
              onClick={save}
              disabled={!dirty && !saved}
            >
              {saved ? "✓ Saved" : "Save changes"}
            </button>
          </div>
        </>
      ) : (
        /* Module list */
        <>
          <div className="ov-srch-wrap">
            <input className="ov-srch" type="text" placeholder="Search modules…"
              value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>

          {liveIds.size > 0 && (
            <div className="ov-live-strip">
              <span className="ov-live-dot" />
              {liveIds.size} module{liveIds.size !== 1 ? "s" : ""} running on this page
            </div>
          )}

          <div className="ov-list">
            {!ready ? (
              <div className="ov-state">Loading…</div>
            ) : filtered.length === 0 ? (
              <div className="ov-state">No modules match "{search}"</div>
            ) : (
              filtered.map((mod) => {
                const enabled = isEnabled(mod.id);
                const live    = liveIds.has(mod.id);
                const hasCfg  = Boolean(MODULE_CONFIG_SCHEMAS[mod.id]);
                return (
                  <div key={mod.id}
                    className={`ov-card${enabled ? " on" : ""}${live ? " live" : ""}`}>
                    <span className="ov-card-ico">{mod.icon}</span>
                    <div className="ov-card-body" onClick={() => toggle(mod.id)}>
                      <div className="ov-card-name">{mod.label}</div>
                      <div className="ov-card-desc">{mod.description}</div>
                    </div>
                    <div className="ov-card-acts">
                      {hasCfg && (
                        <button className="ov-gear" title="Settings"
                          onClick={(e) => { e.stopPropagation(); setCfgId(mod.id); }}>
                          ⚙
                        </button>
                      )}
                      <label className="ov-tog" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={enabled}
                          onChange={() => toggle(mod.id)} />
                        <span className="ov-tog-track" />
                      </label>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </>
      )}
    </div>
  );
}

/* ── Root ────────────────────────────────────────────────────────────────────── */

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
        className={`ov-trigger${open ? " ov-trigger-open" : ""}`}
        onClick={() => setOpen((o) => !o)}
        title="TW Suite"
        aria-label="Open TW Suite"
      >⚡</button>

      {open && <div className="ov-backdrop" onClick={() => setOpen(false)} />}

      <div className={`ov-drawer${open ? " ov-drawer-open" : ""}`}>
        {open && <OverlayPanel onClose={() => setOpen(false)} />}
      </div>
    </>
  );
}

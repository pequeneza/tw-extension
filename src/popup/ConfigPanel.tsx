import React from "react";
import { ModuleId } from "../types/modules";
import { MODULE_CONFIG_SCHEMAS, FieldDef } from "../types/config-schemas";
import { useModuleConfig } from "./useModuleConfig";

interface Props {
  id: ModuleId;
  onClose: () => void;
}

export function ConfigPanel({ id, onClose }: Props) {
  const schema = MODULE_CONFIG_SCHEMAS[id];
  const { values, loading, dirty, saved, set, save, reset } = useModuleConfig(id);

  if (!schema) {
    return (
      <div className="cfg-none">
        This module has no configurable settings.
      </div>
    );
  }

  function renderField(f: FieldDef) {
    const val = values[f.key];
    const valStr = val !== undefined ? String(val) : String(f.default);

    /* ── Checkbox ── */
    if (f.type === "checkbox") {
      return (
        <div key={f.key} className="f-row f-row-check">
          <label className="f-check-label">
            <span className="f-tog">
              <input
                type="checkbox"
                checked={Boolean(val ?? f.default)}
                onChange={(e) => set(f.key, e.target.checked)}
              />
              <span className="f-tog-track" />
            </span>
            <div>
              <div className="f-lbl">{f.label}</div>
              {f.help && <div className="f-help">{f.help}</div>}
            </div>
          </label>
        </div>
      );
    }

    /* ── Textarea ── */
    if (f.type === "textarea") {
      return (
        <div key={f.key} className="f-row">
          <div className="f-lbl">{f.label}</div>
          {f.help && <div className="f-help">{f.help}</div>}
          <textarea
            className="f-ta"
            rows={f.rows ?? 4}
            value={valStr}
            onChange={(e) => set(f.key, e.target.value)}
            spellCheck={false}
          />
        </div>
      );
    }

    /* ── Select ── */
    if (f.type === "select" && f.options) {
      return (
        <div key={f.key} className="f-row">
          <div className="f-lbl">{f.label}</div>
          {f.help && <div className="f-help">{f.help}</div>}
          <select
            className="f-sel"
            value={valStr}
            onChange={(e) => set(f.key, e.target.value)}
          >
            {f.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      );
    }

    /* ── Number / text / time ── */
    return (
      <div key={f.key} className="f-row">
        <div className="f-lbl">{f.label}</div>
        {f.help && <div className="f-help">{f.help}</div>}
        <input
          className="f-inp"
          type={f.type}
          value={valStr}
          min={f.min}
          max={f.max}
          step={f.step}
          onChange={(e) => {
            if (f.type === "number") {
              const n = parseFloat(e.target.value);
              set(f.key, Number.isFinite(n) ? n : (f.default as number));
            } else {
              set(f.key, e.target.value);
            }
          }}
        />
      </div>
    );
  }

  return (
    <>
      {/* Fields */}
      <div className="cfg-fields">
        {loading ? (
          <div className="cfg-loading">Loading…</div>
        ) : (
          schema.fields.map((f) => renderField(f))
        )}
      </div>

      {/* Action bar */}
      <div className="cfg-acts">
        <button className="cfg-btn cfg-rst" onClick={reset} type="button">
          Reset defaults
        </button>
        <button
          className={`cfg-btn cfg-sav${dirty ? " dirty" : ""}${saved ? " saved" : ""}`}
          onClick={save}
          disabled={!dirty && !saved}
          type="button"
        >
          {saved ? "✓ Saved" : "Save"}
        </button>
      </div>
    </>
  );
}

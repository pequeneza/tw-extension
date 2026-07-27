import React, { useCallback, useEffect, useState } from "react";
import { TriggerVisibilityToggle } from "./TriggerVisibilityToggle";

/* ─── Types ───────────────────────────────────────────────────────────────── */
interface TwUtilsCfg {
  villageSwitcher: boolean;
  incomingFilter: boolean;
  quickbarCollapse: boolean;
  bulkCancel: boolean;
  bcDelayMin: number;
  bcDelayMax: number;
}

const STORAGE_KEY    = "tw_suite_cfg_tw_utils";
const TEMPLATE_KEY   = "tw_umax_template_v1"; // shared with userscript via sessionStorage

const TEMPLATE_UNITS: Array<{ id: string; label: string }> = [
  { id: "axe",      label: "Viking"     },
  { id: "light",    label: "Cav. Leve"  },
  { id: "heavy",    label: "Cav. Pesada"},
  { id: "spy",      label: "Batedor"    },
  { id: "ram",      label: "Aríete"     },
  { id: "catapult", label: "Catapulta"  },
  { id: "snob",     label: "Nobre"      },
  { id: "spear",    label: "Lanceiro"   },
  { id: "sword",    label: "Espadachim" },
];
// Special key stored alongside unit counts
const WALL_KEY = "__wall__";

type AttackTemplate = Record<string, number>;

const DEFAULTS: TwUtilsCfg = {
  villageSwitcher: true,
  incomingFilter:  true,
  quickbarCollapse: true,
  bulkCancel:      true,
  bcDelayMin:      100,
  bcDelayMax:      200,
};

const FEATURES: Array<{ key: keyof TwUtilsCfg; label: string; help: string }> = [
  { key: "villageSwitcher",  label: "Village Switcher",   help: "Botão no mapa para trocar para aldeia própria selecionada." },
  { key: "incomingFilter",   label: "Incoming Filter",    help: "Ocultar/mostrar apoios nas tabelas de incomings." },
  { key: "quickbarCollapse", label: "Quickbar Collapse",  help: "Minimizar/expandir quickbar com botão –/+." },
  { key: "bulkCancel",       label: "Bulk Cancel",        help: "Botão fixo em screen=place para cancelar todos os comandos." },
];

/* ─── Helpers ─────────────────────────────────────────────────────────────── */
function useMountAnim(trigger: boolean) {
  const [anim, setAnim] = useState(false);
  useEffect(() => {
    if (trigger) requestAnimationFrame(() => setAnim(true));
    else setAnim(false);
  }, [trigger]);
  return anim;
}

function storageGet(keys: string[]) {
  return new Promise<Record<string, unknown>>((res) =>
    chrome.storage.sync.get(keys, (r) => res(r as Record<string, unknown>))
  );
}
function storageSet(data: Record<string, unknown>) {
  return new Promise<void>((res) => chrome.storage.sync.set(data, res));
}

/* ─── TwUtilsView ─────────────────────────────────────────────────────────── */
export function TwUtilsView({
  visible, onBack,
}: {
  visible: boolean;
  onBack: () => void;
}) {
  const [cfg, setCfg] = useState<TwUtilsCfg>(DEFAULTS);
  const [template, setTemplate] = useState<AttackTemplate>({});
  const [templateSaved, setTemplateSaved] = useState(false);
  const [mapSelActive, setMapSelActive] = useState(false);
  const [mapSelCount,  setMapSelCount]  = useState(0);
  const [mapSelOutput, setMapSelOutput] = useState("");
  const anim = useMountAnim(visible);

  const screenParam = new URLSearchParams(window.location.search).get("screen");
  const isBulkCancelPage = ["place", "overview", "info_village"].includes(screenParam ?? "") &&
                           !(screenParam === "place" && window.location.href.includes("try=confirm"));
  const isMapPage   = /screen=map/.test(window.location.href);

  useEffect(() => {
    if (!visible) return;
    storageGet([STORAGE_KEY, TEMPLATE_KEY]).then((r) => {
      const saved = (r[STORAGE_KEY] as Partial<TwUtilsCfg>) ?? {};
      setCfg({ ...DEFAULTS, ...saved });
      const tpl = (r[TEMPLATE_KEY] as AttackTemplate) ?? {};
      setTemplate(tpl);
      // Sync to sessionStorage so the userscript can read it
      try { sessionStorage.setItem(TEMPLATE_KEY, JSON.stringify(tpl)); } catch (_) {}
    });
  }, [visible]);

  const saveTemplate = useCallback(async (tpl: AttackTemplate) => {
    setTemplate(tpl);
    await storageSet({ [TEMPLATE_KEY]: tpl });
    try { sessionStorage.setItem(TEMPLATE_KEY, JSON.stringify(tpl)); } catch (_) {}
    setTemplateSaved(true);
    setTimeout(() => setTemplateSaved(false), 1500);
  }, []);

  // Sync map-draw-select state from userscript
  useEffect(() => {
    const h = (e: Event) => {
      const d = (e as CustomEvent).detail as { active: boolean; count: number; output: string };
      setMapSelActive(d.active);
      setMapSelCount(d.count);
      setMapSelOutput(d.output);
    };
    document.addEventListener("xbot:mapsel:state", h);
    return () => document.removeEventListener("xbot:mapsel:state", h);
  }, []);

  const toggleMapSel = useCallback(() => {
    document.dispatchEvent(new CustomEvent(mapSelActive ? "xbot:mapsel:disable" : "xbot:mapsel:enable"));
  }, [mapSelActive]);

  const clearMapSel = useCallback(() => {
    document.dispatchEvent(new CustomEvent("xbot:mapsel:clear"));
  }, []);

  const toggle = useCallback(async (key: keyof TwUtilsCfg) => {
    const next = { ...cfg, [key]: !cfg[key] };
    setCfg(next);
    await storageSet({ [STORAGE_KEY]: next });
    if (key === "bulkCancel") {
      const fixed = document.getElementById("tw-bc-fixed");
      if (next.bulkCancel) {
        if (fixed) fixed.style.display = "";
      } else {
        if (fixed) fixed.style.display = "none";
        document.querySelectorAll(".tw-bc-btn, .tw-bc-counter").forEach(el => el.remove());
      }
    }
  }, [cfg]);

  const setNumField = useCallback(async (key: keyof TwUtilsCfg, value: number) => {
    const next = { ...cfg, [key]: value };
    setCfg(next);
    await storageSet({ [STORAGE_KEY]: next });
  }, [cfg]);

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
        <span className="cfg-icon">⚙️</span>
        <div className="cfg-header-text">
          <span className="cfg-title">TW Tweaks</span>
          <span className="cfg-subtitle">Activate / deactivate features</span>
        </div>
        <TriggerVisibilityToggle moduleId="tw_utils" />
      </div>

      <div className="cfg-body">
        <div className="cfg-section cfg-section-checks">
          <div className="section-label">Features</div>
          {FEATURES.map(({ key, label, help }) => (
            <label key={key} className="field-check">
              <span className="field-check-text">
                <span className="field-label">{label}</span>
                <span className="field-help">{help}</span>
              </span>
              <span className="toggle" onClick={(e) => e.stopPropagation()}>
                <input type="checkbox" checked={cfg[key]}
                  onChange={() => toggle(key)} />
                <span className="toggle-thumb" />
              </span>
            </label>
          ))}
        </div>

        {isMapPage && (
          <div className="cfg-section">
            <div className="section-label">Map Draw Select</div>
            <div style={{ padding: "8px 14px", display: "flex", flexDirection: "column", gap: "6px" }}>
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <button
                  className={`btn btn-save${mapSelActive ? "" : " btn-save--dirty"}`}
                  style={{ flex: 1, justifyContent: "center" }}
                  onClick={toggleMapSel}
                >
                  {mapSelActive ? "Desactivar" : "Activar"}
                </button>
                <button
                  className="btn btn-ghost"
                  style={{ minWidth: 0, padding: "4px 10px" }}
                  disabled={mapSelCount === 0}
                  onClick={clearMapSel}
                >
                  Limpar
                </button>
              </div>
              {mapSelActive && (
                <>
                  <span style={{ fontSize: "10px", color: "var(--n400)" }}>
                    {mapSelCount} aldeia(s) · Shift+arrasta ou clica individualmente
                  </span>
                  {mapSelCount > 0 && (
                    <textarea
                      readOnly
                      rows={4}
                      value={mapSelOutput}
                      style={{
                        width: "100%", fontSize: "11px", resize: "vertical",
                        background: "var(--n50)", border: "1px solid var(--n200)",
                        borderRadius: "3px", padding: "4px",
                        color: "var(--n700)", fontFamily: "'DM Mono', monospace",
                      }}
                      onClick={(e) => (e.target as HTMLTextAreaElement).select()}
                    />
                  )}
                </>
              )}
            </div>
          </div>
        )}

        <div className="cfg-section">
          <div className="section-label">Modelo de Ataque (Simular)</div>
          <div style={{ padding: "8px 14px 4px", display: "grid",
                        gridTemplateColumns: "1fr 1fr", gap: "4px 12px" }}>
            {TEMPLATE_UNITS.map(({ id, label }) => (
              <label key={id} style={{ display: "flex", alignItems: "center",
                                       gap: "6px", fontSize: "11px" }}>
                <span style={{ flex: 1, color: "var(--n500)" }}>{label}</span>
                <input
                  type="number" min="0" step="1"
                  value={template[id] ?? ""}
                  placeholder="0"
                  onChange={(e) => {
                    const v = Math.max(0, parseInt(e.target.value, 10) || 0);
                    setTemplate(prev => ({ ...prev, [id]: v }));
                  }}
                  style={{ width: "60px", padding: "2px 4px", fontSize: "11px",
                           border: "1px solid var(--n200)", borderRadius: "3px",
                           background: "var(--n0)", color: "var(--n700)",
                           textAlign: "right" }}
                />
              </label>
            ))}
            <label style={{ display: "flex", alignItems: "center", gap: "6px",
                            fontSize: "11px", gridColumn: "1 / -1",
                            borderTop: "1px solid var(--n150)", paddingTop: "4px", marginTop: "2px" }}>
              <span style={{ flex: 1, color: "var(--n500)" }}>Muralha (nível)</span>
              <input
                type="number" min="0" max="25" step="1"
                value={template[WALL_KEY] ?? ""}
                placeholder="0"
                onChange={(e) => {
                  const v = Math.max(0, Math.min(25, parseInt(e.target.value, 10) || 0));
                  setTemplate(prev => ({ ...prev, [WALL_KEY]: v }));
                }}
                style={{ width: "60px", padding: "2px 4px", fontSize: "11px",
                         border: "1px solid var(--n200)", borderRadius: "3px",
                         background: "var(--n0)", color: "var(--n700)",
                         textAlign: "right" }}
              />
            </label>
          </div>
          <div style={{ padding: "4px 14px 8px", display: "flex",
                        justifyContent: "flex-end", gap: "8px", alignItems: "center" }}>
            {templateSaved && (
              <span style={{ fontSize: "10px", color: "var(--g600)" }}>Guardado</span>
            )}
            <button
              className="btn btn-save btn-save--dirty"
              style={{ minWidth: 0, padding: "3px 10px" }}
              onClick={() => saveTemplate(template)}
            >
              Guardar modelo
            </button>
          </div>
        </div>

        <div className="cfg-section">
          <div className="section-label">Ferramentas</div>
          <div style={{ padding: "8px 14px" }}>
            <button
              className="btn btn-save"
              style={{ width: "100%", justifyContent: "center" }}
              onClick={() => {
                const vid = new URLSearchParams(window.location.search).get("village") ?? "";
                window.location.href = `/game.php?village=${vid}&screen=place&mode=sim`;
              }}
            >
              Simulador
            </button>
          </div>
        </div>

        {isBulkCancelPage && (
          <div className="cfg-section">
            <div className="section-label">Bulk Cancel</div>
            <div style={{ padding: "8px 14px" }}>
              <span style={{ fontSize: "11px", color: "var(--n400)" }}>
                Use o ícone 🗑️ junto à tabela de comandos para cancelar tudo.
              </span>
            </div>
            <div style={{ display: "flex", gap: "12px", padding: "4px 14px 8px",
                          alignItems: "center" }}>
              {(["bcDelayMin", "bcDelayMax"] as const).map((key, i) => (
                <label key={key} style={{ display: "flex", alignItems: "center",
                                          gap: "6px", fontSize: "11px", flex: 1 }}>
                  <span style={{ color: "var(--n500)", whiteSpace: "nowrap" }}>
                    {i === 0 ? "Min delay (ms)" : "Max delay (ms)"}
                  </span>
                  <input
                    type="number" min="50" max="5000" step="10"
                    value={cfg[key]}
                    onChange={(e) => setNumField(key, Math.max(50, parseInt(e.target.value, 10) || 50))}
                    style={{ width: "60px", padding: "2px 4px", fontSize: "11px",
                             border: "1px solid var(--n200)", borderRadius: "3px",
                             background: "var(--n0)", color: "var(--n700)",
                             textAlign: "right" }}
                  />
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="cfg-footer" style={{ justifyContent: "center" }}>
        <span style={{ fontSize: "11px", color: "var(--n300)" }}>
          Feature toggles take effect on next page load
        </span>
      </div>
    </div>
  );
}

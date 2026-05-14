import React, { useCallback, useEffect, useState } from "react";

/* ─── Types ───────────────────────────────────────────────────────────────── */
interface TwUtilsCfg {
  villageSwitcher: boolean;
  incomingFilter: boolean;
  quickbarCollapse: boolean;
  bulkCancel: boolean;
  showDrawer: boolean;
}

const STORAGE_KEY = "tw_suite_cfg_tw_utils";
const DEFAULTS: TwUtilsCfg = {
  villageSwitcher: true,
  incomingFilter:  true,
  quickbarCollapse: true,
  bulkCancel:      true,
  showDrawer:      true,
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
  visible, onBack, onShowDrawerChange,
}: {
  visible: boolean;
  onBack: () => void;
  onShowDrawerChange: (v: boolean) => void;
}) {
  const [cfg, setCfg] = useState<TwUtilsCfg>(DEFAULTS);
  const [cancelCount, setCancelCount] = useState(0);
  const [cancelling, setCancelling] = useState(false);
  const anim = useMountAnim(visible);

  const isPlacePage = /screen=place/.test(window.location.href) &&
                      !window.location.href.includes("try=confirm");

  useEffect(() => {
    if (!visible) return;
    storageGet([STORAGE_KEY]).then((r) => {
      const saved = (r[STORAGE_KEY] as Partial<TwUtilsCfg>) ?? {};
      setCfg({ ...DEFAULTS, ...saved });
    });
  }, [visible]);

  // Poll cancel-link count so the button reflects live state
  useEffect(() => {
    if (!visible || !isPlacePage) return;
    const update = () =>
      setCancelCount(document.querySelectorAll("a.command-cancel[href]").length);
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [visible, isPlacePage]);

  const toggle = useCallback(async (key: keyof TwUtilsCfg) => {
    const next = { ...cfg, [key]: !cfg[key] };
    setCfg(next);
    await storageSet({ [STORAGE_KEY]: next });
    if (key === "bulkCancel") {
      const fixed = document.getElementById("tw-bc-fixed");
      if (fixed) fixed.style.display = next.bulkCancel ? "" : "none";
    }
    if (key === "showDrawer") {
      onShowDrawerChange(next.showDrawer);
    }
  }, [cfg, onShowDrawerChange]);

  const triggerCancelAll = useCallback(() => {
    if (!cancelCount || cancelling) return;
    setCancelling(true);
    document.dispatchEvent(new CustomEvent("xbot:twutils:cancelAll"));
    // Reset after page would reload; guard in case it didn't
    setTimeout(() => setCancelling(false), 5000);
  }, [cancelCount, cancelling]);

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
      </div>

      <div className="cfg-body">
        <div className="cfg-section cfg-section-checks">
          <div className="section-label">Overlay</div>
          <label className="field-check">
            <span className="field-check-text">
              <span className="field-label">Show ⚙️ drawer button</span>
              <span className="field-help">Hide this trigger from the overlay stack to reduce clutter.</span>
            </span>
            <span className="toggle" onClick={(e) => e.stopPropagation()}>
              <input type="checkbox" checked={cfg.showDrawer}
                onChange={() => toggle("showDrawer")} />
              <span className="toggle-thumb" />
            </span>
          </label>
        </div>

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

        {isPlacePage && (
          <div className="cfg-section">
            <div className="section-label">Bulk Cancel</div>
            <div style={{ display: "flex", alignItems: "center",
                          justifyContent: "space-between", gap: "8px",
                          padding: "8px 14px" }}>
              <span style={{ fontSize: "12px", color: "var(--n400)" }}>
                {cancelCount > 0
                  ? `${cancelCount} command${cancelCount !== 1 ? "s" : ""} queued`
                  : "No outgoing commands"}
              </span>
              <button
                className={`btn btn-save${cancelCount > 0 && !cancelling ? " btn-save--dirty" : ""}`}
                style={{ minWidth: 0, padding: "4px 10px", flexShrink: 0 }}
                onClick={triggerCancelAll}
                disabled={cancelCount === 0 || cancelling}
              >
                {cancelling ? "Cancelling…" : "Cancel All"}
              </button>
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

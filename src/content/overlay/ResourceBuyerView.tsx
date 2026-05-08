/**
 * ResourceBuyerView — in-overlay panel for the Resource Buyer.
 * Communicates via CustomEvents (isolated ↔ main world bridge).
 *
 * Userscript  →  React : xbot:buyer:state   { running, config }
 * React  →  Userscript : xbot:buyer:start
 *                        xbot:buyer:stop
 *                        xbot:buyer:save    { config }
 */
import React, { useCallback, useEffect, useRef, useState } from "react";

/* ─── Types ──────────────────────────────────────────────────────────────── */
interface BuyerConfig {
  ENABLED: boolean;
  buy_wood: boolean;
  buy_stone: boolean;
  buy_iron: boolean;
  priority: Array<"wood" | "stone" | "iron">;
  MAX_PREMIUM_POINTS: number;
  PREMIUM_POINTS_TIMEOUT: number;   // ms
  PURCHASE_PERCENTAGE: number;      // 0–1
  MIN_STOCK_THRESHOLD: number;
  PAGE_RELOAD_INTERVAL: number;     // ms
}

interface BuyerState {
  running: boolean;
  config: BuyerConfig;
}

const DEFAULT_CONFIG: BuyerConfig = {
  ENABLED: true,
  buy_wood: true,
  buy_stone: true,
  buy_iron: true,
  priority: ["wood", "stone", "iron"],
  MAX_PREMIUM_POINTS: 5000,
  PREMIUM_POINTS_TIMEOUT: 600000,
  PURCHASE_PERCENTAGE: 0.70,
  MIN_STOCK_THRESHOLD: 50,
  PAGE_RELOAD_INTERVAL: 10000,
};

/* ─── Helpers ────────────────────────────────────────────────────────────── */
function dispatch(name: string, detail?: unknown) {
  document.dispatchEvent(
    new CustomEvent(name, detail !== undefined ? { detail } : undefined)
  );
}

const RES_ICON_URLS: Record<string, string> = {
  wood:  "https://dspt.innogamescdn.com/asset/b2fb8d33/graphic/holz.png",
  stone: "https://dspt.innogamescdn.com/asset/b2fb8d33/graphic/lehm.png",
  iron:  "https://dspt.innogamescdn.com/asset/b2fb8d33/graphic/eisen.png",
};
function ResIcon({ res }: { res: "wood" | "stone" | "iron" }): React.ReactElement {
  return (
    <img
      src={RES_ICON_URLS[res]}
      alt={res}
      title={res}
      style={{ width: 14, height: 14, verticalAlign: "middle",
               flexShrink: 0, display: "inline-block" }}
    />
  );
}

/* ─── Tip ────────────────────────────────────────────────────────────────── */
function Tip({ text }: { text: string }) {
  const [show, setShow] = useState(false);
  return (
    <span style={{ position: "relative", display: "inline-block", marginLeft: 4 }}>
      <span
        style={{ display: "inline-flex", alignItems: "center", justifyContent: "center",
                 width: 14, height: 14, borderRadius: "50%", background: "var(--b-bg)",
                 border: "1px solid var(--b-br)", color: "var(--b500)", fontSize: 9,
                 fontWeight: 700, cursor: "help", userSelect: "none", flexShrink: 0 }}
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}>?</span>
      {show && (
        <div style={{ position: "absolute", bottom: "calc(100% + 6px)", left: "50%",
                      transform: "translateX(-50%)", zIndex: 999, background: "var(--n900)",
                      color: "var(--n0)", padding: "8px 10px", borderRadius: 6, fontSize: 11,
                      lineHeight: 1.45, whiteSpace: "normal", width: 260,
                      boxShadow: "var(--shadow-xl)", pointerEvents: "none" }}>
          {text}
          <div style={{ position: "absolute", top: "100%", left: "50%",
                        transform: "translateX(-50%)", border: "5px solid transparent",
                        borderTopColor: "var(--n900)" }}/>
        </div>
      )}
    </span>
  );
}

/* ─── useBuyerState ──────────────────────────────────────────────────────── */
function useBuyerState() {
  const [state, setState] = useState<BuyerState>({
    running: false,
    config: { ...DEFAULT_CONFIG },
  });
  const [detected, setDetected] = useState(false);

  useEffect(() => {
    const onState = (e: Event) => {
      const d = (e as CustomEvent).detail as BuyerState;
      setDetected(true);
      setState(d);
    };
    document.addEventListener("xbot:buyer:state", onState);
    // probe — ask userscript to broadcast its state
    dispatch("xbot:buyer:getState");
    const probe = setInterval(() => dispatch("xbot:buyer:getState"), 1500);
    return () => {
      document.removeEventListener("xbot:buyer:state", onState);
      clearInterval(probe);
    };
  }, []);

  return { state, detected };
}

/* ─── PriorityList ───────────────────────────────────────────────────────── */
function PriorityList({
  priority,
  onChange,
}: {
  priority: Array<"wood" | "stone" | "iron">;
  onChange: (p: Array<"wood" | "stone" | "iron">) => void;
}) {
  const move = (idx: number, dir: -1 | 1) => {
    const next = [...priority];
    const swap = idx + dir;
    if (swap < 0 || swap >= next.length) return;
    [next[idx], next[swap]] = [next[swap]!, next[idx]!];
    onChange(next);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {priority.map((res, i) => (
        <div
          key={res}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            background: "var(--n800)", borderRadius: 4, padding: "4px 8px",
          }}
        >
          <span style={{ width: 16, fontSize: 11, color: "var(--n400)" }}>
            {i + 1}.
          </span>
          <span style={{ flex: 1, fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
            <ResIcon res={res} />
          </span>
          <button
            className="btn btn-ghost"
            style={{ padding: "1px 7px", fontSize: 11 }}
            disabled={i === 0}
            onClick={() => move(i, -1)}
          >↑</button>
          <button
            className="btn btn-ghost"
            style={{ padding: "1px 7px", fontSize: 11 }}
            disabled={i === priority.length - 1}
            onClick={() => move(i, 1)}
          >↓</button>
        </div>
      ))}
    </div>
  );
}

/* ─── ResourceBuyerView ──────────────────────────────────────────────────── */
export function ResourceBuyerView({
  visible,
  onBack,
}: {
  visible: boolean;
  onBack: () => void;
}): React.ReactElement {
  const { state, detected } = useBuyerState();
  const [cfg, setCfg] = useState<BuyerConfig>({ ...DEFAULT_CONFIG });
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const syncedRef = useRef(false);

  // Reset sync guard when panel closes so it re-syncs fresh on next open
  useEffect(() => {
    if (!visible) syncedRef.current = false;
  }, [visible]);

  // Sync cfg from userscript state only on first detection — never overwrite dirty form
  useEffect(() => {
    if (detected && !syncedRef.current) {
      syncedRef.current = true;
      setCfg({ ...state.config });
      setDirty(false);
    }
  }, [detected, state.config]);

  const set = useCallback(<K extends keyof BuyerConfig>(key: K, val: BuyerConfig[K]) => {
    setCfg((p) => ({ ...p, [key]: val }));
    setDirty(true);
    setSaved(false);
  }, []);

  const handleSave = () => {
    dispatch("xbot:buyer:save", { config: cfg });
    setDirty(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2200);
  };

  const handleStart = () => dispatch("xbot:buyer:start");
  const handleStop  = () => dispatch("xbot:buyer:stop");

  const isOnExchangePage = /screen=market.*mode=exchange|screen=market&mode=exchange/.test(
    window.location.href
  );

  return (
    <div
      className={`cfg-view${visible ? " in" : ""}`}
      style={{ display: visible ? "flex" : "none" }}
    >
      {/* Header */}
      <div className="cfg-header">
        <button className="back-btn" onClick={onBack}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M9 2L4 7l5 5" stroke="currentColor" strokeWidth="1.8"
              strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <span className="cfg-icon">🛒</span>
        <div className="cfg-header-text">
          <span className="cfg-title">Resource Buyer</span>
          <span className="cfg-subtitle">
            {!detected
              ? "waiting for userscript…"
              : state.running
                ? "🟢 Running"
                : "⏹ Stopped"}
          </span>
        </div>
        {state.running && (
          <span className="live-pip" style={{ marginLeft: "auto", marginRight: 4 }} />
        )}
      </div>

      {/* Start / Stop */}
      <div className="cfg-section">
        {!isOnExchangePage && (
          <div className="field-help" style={{ color: "var(--a500)", padding: "8px 14px 0" }}>
            ⚠ Navigate to the Premium Exchange market to use this module.
          </div>
        )}
        <div style={{ display: "flex", gap: 6, padding: "10px 14px" }}>
          <button
            className="btn btn-save btn-save--dirty"
            style={{
              flex: 1,
              background: state.running ? "var(--n700)" : "var(--g600)",
              borderColor: state.running ? "var(--n600)" : "var(--g600)",
              opacity: (!detected || state.running) ? 0.5 : 1,
            }}
            disabled={!detected || state.running || !isOnExchangePage}
            onClick={handleStart}
          >
            ▶ Start
          </button>
          <button
            className="btn btn-ghost"
            style={{ flex: 1, opacity: (!detected || !state.running) ? 0.5 : 1 }}
            disabled={!detected || !state.running}
            onClick={handleStop}
          >
            ■ Stop
          </button>
        </div>
        {!detected && (
          <div className="state-msg">
            Userscript not detected — ensure resource_buyer is enabled and you are on the exchange page.
          </div>
        )}
      </div>

      {/* Resources to buy */}
      <div className="cfg-section">
        <div className="section-label">Resources</div>
        {(["buy_wood", "buy_stone", "buy_iron"] as const).map((key) => {
          const res = key.replace("buy_", "") as "wood" | "stone" | "iron";
          return (
            <label key={key} className="field-check">
              <span className="field-check-text">
                <span className="field-label" style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <ResIcon res={res} />
                </span>
              </span>
              <span className="toggle" onClick={(e) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={Boolean(cfg[key])}
                  onChange={(e) => set(key, e.target.checked)}
                />
                <span className="toggle-thumb" />
              </span>
            </label>
          );
        })}
      </div>

      {/* Priority order */}
      <div className="cfg-section">
        <div className="section-label">Buy priority</div>
        <div style={{ padding: "4px 14px 10px" }}>
          <PriorityList
            priority={cfg.priority}
            onChange={(p) => set("priority", p)}
          />
        </div>
      </div>

      {/* Numeric settings */}
      <div className="cfg-section">
        <div className="section-label">Settings</div>

        {([
          { key: "MAX_PREMIUM_POINTS",     label: "Max PP to spend",    step: 100,   tip: "Pause buying when PP exceeds this value" },
          { key: "PURCHASE_PERCENTAGE",    label: "Fill target (0–1)",  step: 0.05,  tip: "Buy until village reaches this fraction of storage. E.g. 0.7 = 70%" },
          { key: "MIN_STOCK_THRESHOLD",    label: "Min market stock",   step: 10,    tip: "Skip a resource if the exchange has less than this amount available" },
          { key: "PREMIUM_POINTS_TIMEOUT", label: "PP cooldown (ms)",   step: 60000, tip: "How long to wait before retrying when PP is above max" },
          { key: "PAGE_RELOAD_INTERVAL",   label: "Safety reload (ms)", step: 1000,  tip: "Reloads the page periodically while running to prevent stale state" },
        ] as { key: keyof BuyerConfig; label: string; step: number; tip: string }[]).map(({ key, label, step, tip }) => (
          <div className="field" key={key}>
            <div className="field-top">
              <span className="field-label">{label}<Tip text={tip} /></span>
            </div>
            <input
              className="input"
              type="number"
              step={step}
              value={cfg[key] as number}
              onChange={(e) => {
                const n = parseFloat(e.target.value);
                if (Number.isFinite(n)) set(key, n as BuyerConfig[typeof key]);
              }}
            />
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="cfg-footer">
        <button
          className={`btn btn-save${dirty ? " btn-save--dirty" : ""}${saved ? " btn-save--saved" : ""}`}
          onClick={handleSave}
          disabled={!dirty && !saved}
        >
          {saved ? "✓ Saved" : dirty ? "Save settings" : "No changes"}
        </button>
      </div>
    </div>
  );
}

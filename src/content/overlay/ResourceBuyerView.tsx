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
import { TriggerVisibilityToggle } from "./TriggerVisibilityToggle";

/* ─── useMountAnim ───────────────────────────────────────────────────────── */
function useMountAnim(trigger: boolean) {
  const [anim, setAnim] = useState(false);
  useEffect(() => {
    if (trigger) requestAnimationFrame(() => setAnim(true));
    else setAnim(false);
  }, [trigger]);
  return anim;
}

/* ─── Types ──────────────────────────────────────────────────────────────── */
interface BuyerConfig {
  ENABLED: boolean;
  buy_wood: boolean;
  buy_stone: boolean;
  buy_iron: boolean;
  priority: Array<"wood" | "stone" | "iron">;
  MIN_PP_TO_BUY: number;
  PURCHASE_PERCENTAGE: number;      // 0–1
  MIN_STOCK_THRESHOLD: number;
  PAGE_RELOAD_INTERVAL: number;     // ms
}

interface BuyerStats {
  ppSpent: number;
  wood: number;
  stone: number;
  iron: number;
}

interface BuyerState {
  running: boolean;
  config: BuyerConfig;
  stats: BuyerStats;
  minTrade?: { wood?: number | null; stone?: number | null; iron?: number | null };
}

const DEFAULT_STATS: BuyerStats = { ppSpent: 0, wood: 0, stone: 0, iron: 0 };

const DEFAULT_CONFIG: BuyerConfig = {
  ENABLED: true,
  buy_wood: true,
  buy_stone: true,
  buy_iron: true,
  priority: ["wood", "stone", "iron"],
  MIN_PP_TO_BUY: 100,
  PURCHASE_PERCENTAGE: 0.70,
  MIN_STOCK_THRESHOLD: 50,
  PAGE_RELOAD_INTERVAL: 30000,
};

const RES_LABEL: Record<string, string> = { wood: "Madeira", stone: "Barro", iron: "Ferro" };

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
    stats: { ...DEFAULT_STATS },
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
            display: "flex", alignItems: "center", gap: 8,
            background: "var(--n50)", border: "1px solid var(--n150)",
            borderRadius: 6, padding: "5px 8px",
          }}
        >
          <span style={{ width: 14, fontSize: 10, color: "var(--n300)", fontFamily: "var(--mono)", flexShrink: 0 }}>
            {i + 1}
          </span>
          <ResIcon res={res} />
          <span style={{ flex: 1, fontSize: 12, color: "var(--n700)" }}>
            {RES_LABEL[res] ?? res}
          </span>
          <button
            className="btn btn-ghost"
            style={{ padding: "1px 7px", fontSize: 11, flex: "none" }}
            disabled={i === 0}
            onClick={() => move(i, -1)}
          >↑</button>
          <button
            className="btn btn-ghost"
            style={{ padding: "1px 7px", fontSize: 11, flex: "none" }}
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
  const anim = useMountAnim(visible);

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

  const subtitleText = !detected
    ? "a aguardar userscript…"
    : state.running
      ? "A comprar recursos"
      : "Parado";

  return (
    <div
      className={`cfg-view${anim ? " in" : ""}`}
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
          <span className="cfg-subtitle">{subtitleText}</span>
        </div>
        {state.running && (
          <span className="live-pip" style={{ marginLeft: "auto", marginRight: 4 }} />
        )}
        <TriggerVisibilityToggle moduleId="resource_buyer" />
      </div>

      {/* Start / Stop — always visible, not in scroll area */}
      <div className="cfg-section" style={{ flexShrink: 0 }}>
        {!isOnExchangePage && (
          <div className="desv-page-warn" style={{ margin: "8px 14px 0" }}>
            Navega para o mercado (Troca Premium) para usar este modulo.
          </div>
        )}
        <div style={{ display: "flex", gap: 6, padding: "10px 14px" }}>
          <button
            className={`btn btn-save${!state.running && detected && isOnExchangePage ? " btn-save--dirty" : ""}`}
            style={{ flex: 1 }}
            disabled={!detected || state.running || !isOnExchangePage}
            onClick={handleStart}
          >
            Start
          </button>
          <button
            className="btn btn-ghost"
            style={{ flex: 1 }}
            disabled={!detected || !state.running}
            onClick={handleStop}
          >
            Stop
          </button>
        </div>
        {!detected && (
          <div className="state-msg" style={{ flexDirection: "column", gap: 6, paddingTop: 4, paddingBottom: 12 }}>
            <span className="spinner" />
            <span style={{ textAlign: "center" }}>
              Userscript nao detetado. Ativa o modulo e vai para a pagina de troca.
            </span>
          </div>
        )}
      </div>

      {/* Scrollable config area */}
      <div className="cfg-body">
        {/* Resources to buy */}
        <div className="cfg-section cfg-section-checks">
          <div className="section-label">Recursos</div>
          {(["buy_wood", "buy_stone", "buy_iron"] as const).map((key) => {
            const res = key.replace("buy_", "") as "wood" | "stone" | "iron";
            return (
              <label key={key} className="field-check">
                <span className="field-check-text">
                  <span className="field-label" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <ResIcon res={res} />
                    <span>{RES_LABEL[res]}</span>
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
          <div className="section-label">Prioridade de compra</div>
          <div style={{ padding: "4px 14px 10px" }}>
            <PriorityList
              priority={cfg.priority}
              onChange={(p) => set("priority", p)}
            />
          </div>
        </div>

        {/* Numeric settings */}
        <div className="cfg-section">
          <div className="section-label">Configuracao</div>
          {([
            { key: "MIN_PP_TO_BUY",          label: "PP mínimos para comprar", step: 50,    tip: "Não compra se tiveres menos PP do que este valor. Usa 0 para desativar a verificação." },
            { key: "PURCHASE_PERCENTAGE",    label: "Objetivo de enchimento",  step: 0.05,  tip: "Compra ate a aldeia atingir esta fracao do armazem. Ex: 0.7 = 70%." },
            { key: "MIN_STOCK_THRESHOLD",    label: "Stock minimo no mercado", step: 10,    tip: "Ignora um recurso se o mercado tiver menos do que este valor disponivel." },
            { key: "PAGE_RELOAD_INTERVAL",   label: "Espera sem compras (ms)", step: 5000,  tip: "Aguarda este tempo antes de recarregar a página quando não há nada a comprar. Padrão: 30 000 ms (30 s)." },
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
        {/* Current exchange rates */}
        {state.minTrade && (
          <div className="cfg-section">
            <div className="section-label">Taxas actuais (por 1 PP)</div>
            <div style={{ display: "flex", gap: 16, padding: "6px 14px 10px" }}>
              {(["wood", "stone", "iron"] as const).map((res) => (
                <span key={res} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12 }}>
                  <ResIcon res={res} />
                  <span style={{ color: "var(--n700)", fontFamily: "var(--mono)" }}>
                    {state.minTrade![res] ?? "—"}
                  </span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Session stats */}
        <div className="cfg-section">
          <div className="section-label">Sessão</div>
          <div style={{ padding: "6px 14px 10px", display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
              <span style={{ color: "var(--n500)" }}>PP gastos</span>
              <span style={{ color: "var(--n900)", fontFamily: "var(--mono)" }}>{state.stats.ppSpent}</span>
            </div>
            {(["wood", "stone", "iron"] as const).map((res) => (
              <div key={res} style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 5, color: "var(--n500)" }}>
                  <ResIcon res={res} />{RES_LABEL[res]}
                </span>
                <span style={{ color: "var(--n900)", fontFamily: "var(--mono)" }}>{state.stats[res] ?? 0}</span>
              </div>
            ))}
            <button
              className="btn btn-ghost"
              style={{ marginTop: 4, fontSize: 11 }}
              onClick={() => dispatch("xbot:buyer:resetStats")}
            >
              Resetar estatísticas
            </button>
          </div>
        </div>
      </div>{/* end cfg-body */}

      {/* Footer */}
      <div className="cfg-footer">
        <button
          className={`btn btn-save${dirty ? " btn-save--dirty" : ""}${saved ? " btn-save--saved" : ""}`}
          onClick={handleSave}
          disabled={!dirty && !saved}
        >
          {saved ? "✓ Guardado" : dirty ? "Guardar" : "Sem alteracoes"}
        </button>
      </div>
    </div>
  );
}

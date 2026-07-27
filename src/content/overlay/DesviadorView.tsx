import React, { useCallback, useEffect, useRef, useState } from "react";
import { TriggerVisibilityToggle } from "./TriggerVisibilityToggle";

const CANCEL_SEC_KEY    = "twDesviador_cancelSec";
const ALERT_SEC_KEY     = "twDesviador_alertSec";
const MUTE_KEY          = "twDesviador_muteSound";
const ALL_COMMANDS_KEY  = "twDesviador_allCommands";
const BLACKLIST_KEY     = "twDesviador_blacklist";
const WHITELIST_KEY     = "twDesviador_whitelist";
const HISTORY_KEY       = "twDesviador_history";

interface ScheduledEntry {
  cmdId: string;
  label: string;
  villageName: string;
  arrivalMs: number;
  fireAt: number;
  fired: boolean;
}

interface DesvState {
  active: boolean;
  scheduled: ScheduledEntry[];
  notifPermission: "granted" | "denied" | "default";
  muted: boolean;
  allCommands: boolean;
  blacklist: string;
  whitelist: string;
}

interface HistoryEntry {
  cmdId: string;
  label?: string;
  villageName?: string;
  village: string;
  arrivalMs?: number;
  firedAt: number;
  recovered?: boolean;
}

interface CancelToast {
  id: number;
  village: string;
}

function useMountAnim(trigger: boolean) {
  const [anim, setAnim] = useState(false);
  useEffect(() => {
    if (trigger) requestAnimationFrame(() => setAnim(true));
    else setAnim(false);
  }, [trigger]);
  return anim;
}

function pad2(n: number) { return String(n).padStart(2, "0"); }

function fmtTime(ms: number) {
  const d = new Date(ms);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

function fmtCountdown(ms: number) {
  if (ms <= 0) return "00:00";
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${pad2(m)}:${pad2(s)}` : `${pad2(m)}:${pad2(s)}`;
}

function parseTags(raw: string): string[] {
  return raw.split(",").map(t => t.trim()).filter(Boolean);
}

function serializeTags(tags: string[]): string {
  return tags.join(",");
}

/* ─── TagInput ── chip-based tag editor ─────────────────────────────────── */
function TagInput({
  tags,
  placeholder,
  variant,
  onChange,
}: {
  tags: string[];
  placeholder: string;
  variant: "black" | "white";
  onChange: (tags: string[]) => void;
}) {
  const [draft, setDraft] = useState("");

  const commit = () => {
    const t = draft.trim();
    if (t && !tags.includes(t)) onChange([...tags, t]);
    setDraft("");
  };

  return (
    <div className={`desv-tag-input desv-tag-input--${variant}`}>
      {tags.map(tag => (
        <span key={tag} className="desv-tag-chip">
          {tag}
          <button
            className="desv-tag-chip-x"
            onClick={() => onChange(tags.filter(x => x !== tag))}
          >×</button>
        </span>
      ))}
      <input
        className="desv-tag-draft"
        value={draft}
        placeholder={tags.length === 0 ? placeholder : ""}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => {
          if (e.key === "Enter" || e.key === ",") { e.preventDefault(); commit(); }
          if (e.key === "Backspace" && draft === "" && tags.length > 0)
            onChange(tags.slice(0, -1));
        }}
        onBlur={commit}
      />
    </div>
  );
}

/* ─── DesviadorView ───────────────────────────────────────────────────────── */
export function DesviadorView({
  visible,
  onBack,
}: {
  visible: boolean;
  onBack: () => void;
}) {
  const anim = useMountAnim(visible);

  const [desvState, setDesvState] = useState<DesvState>(() => ({
    active: false,
    scheduled: [],
    notifPermission: "default",
    muted: localStorage.getItem(MUTE_KEY) === "1",
    allCommands: localStorage.getItem(ALL_COMMANDS_KEY) === "1",
    blacklist: localStorage.getItem(BLACKLIST_KEY) ?? "[Desviar]",
    whitelist: localStorage.getItem(WHITELIST_KEY) ?? "",
  }));

  const [cancelSec, setCancelSec] = useState(() =>
    parseInt(localStorage.getItem(CANCEL_SEC_KEY) || "300", 10)
  );
  const [alertSec, setAlertSec] = useState(() =>
    parseInt(localStorage.getItem(ALERT_SEC_KEY) || "60", 10)
  );
  const [history, setHistory] = useState<HistoryEntry[]>(() => {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]"); } catch { return []; }
  });
  const [showCfg, setShowCfg] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [toasts, setToasts] = useState<CancelToast[]>([]);
  const toastIdRef = useRef(0);

  useEffect(() => {
    if (!visible) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [visible]);

  useEffect(() => {
    const handler = (e: Event) => {
      setDesvState((e as CustomEvent<DesvState>).detail);
      try { setHistory(JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]")); } catch {}
    };
    document.addEventListener("xbot:desviador:state", handler);
    return () => document.removeEventListener("xbot:desviador:state", handler);
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const { village } = (e as CustomEvent<{ village: string }>).detail;
      const id = ++toastIdRef.current;
      setToasts(t => [...t, { id, village }]);
      setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4000);
    };
    document.addEventListener("xbot:desviador:canceled", handler);
    return () => document.removeEventListener("xbot:desviador:canceled", handler);
  }, []);

  const sendCmd = useCallback((detail: Record<string, unknown>) => {
    document.dispatchEvent(new CustomEvent("xbot:desviador:cmd", { detail }));
  }, []);

  const clearHistory = useCallback(() => {
    localStorage.removeItem(HISTORY_KEY);
    setHistory([]);
  }, []);

  const handleCancelSec = (raw: string) => {
    const v = parseInt(raw, 10);
    if (!Number.isFinite(v) || v < 60) return;
    setCancelSec(v);
    localStorage.setItem(CANCEL_SEC_KEY, String(v));
  };

  const handleAlertSec = (raw: string) => {
    const v = parseInt(raw, 10);
    if (!Number.isFinite(v) || v < 5) return;
    setAlertSec(v);
    localStorage.setItem(ALERT_SEC_KEY, String(v));
  };

  const handleBlacklistChange = (tags: string[]) => {
    const value = serializeTags(tags);
    sendCmd({ type: "setBlacklist", value });
  };

  const handleWhitelistChange = (tags: string[]) => {
    const value = serializeTags(tags);
    sendCmd({ type: "setWhitelist", value });
  };

  const sorted = [...desvState.scheduled].sort((a, b) => {
    if (a.fired !== b.fired) return a.fired ? 1 : -1;
    return a.fireAt - b.fireAt;
  });

  const isOnIncomings = /screen=overview_villages.*mode=incomings.*subtype=attacks/.test(
    window.location.href
  );

  const blacklistTags = parseTags(desvState.blacklist);
  const whitelistTags = parseTags(desvState.whitelist);

  return (
    <div
      className={`desv-view${anim ? " in" : ""}`}
      style={{ display: visible ? "flex" : "none" }}
    >
      {/* ── Header ── */}
      <div className="cfg-header">
        <button className="back-btn" onClick={onBack}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path
              d="M9 2L4 7l5 5"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <span className="cfg-icon">🔀</span>
        <div className="cfg-header-text">
          <span className="cfg-title">Desviador</span>
          <span className="cfg-subtitle">
            {desvState.active
              ? `${sorted.length} ataque(s) programado(s)`
              : "Parado"}
          </span>
        </div>
        <button
          className={`desv-cfg-btn${showHistory ? " desv-cfg-btn--open" : ""}`}
          onClick={() => setShowHistory(v => !v)}
          title="Histórico"
        >⏱</button>
        <button
          className={`desv-cfg-btn${showCfg ? " desv-cfg-btn--open" : ""}`}
          onClick={() => setShowCfg(v => !v)}
          title="Configurações"
        >⚙</button>
        <button
          className={`desv-toggle-btn${desvState.active ? " desv-toggle-btn--stop" : ""}`}
          onClick={() => sendCmd({ type: desvState.active ? "stop" : "start" })}
        >
          {desvState.active ? "■ Parar" : "▶ Desviar"}
        </button>
        <TriggerVisibilityToggle moduleId="desviador" />
      </div>

      {/* ── Config panel ── */}
      {showCfg && (
        <div className="desv-controls">
          <div className="desv-input-row">
            <span className="desv-row-label">Cancelar após</span>
            <input
              className="input desv-num-input"
              type="number"
              value={cancelSec}
              min={60}
              max={600}
              onChange={e => handleCancelSec(e.target.value)}
            />
            <span className="desv-row-unit">seg</span>
          </div>

          <div className="desv-input-row">
            <span className="desv-row-label">Alertar</span>
            <input
              className="input desv-num-input"
              type="number"
              value={alertSec}
              min={5}
              max={300}
              onChange={e => handleAlertSec(e.target.value)}
            />
            <span className="desv-row-unit">seg antes</span>
            <span
              className={`desv-notif-badge desv-notif-badge--${desvState.notifPermission}`}
              onClick={() =>
                desvState.notifPermission === "default" &&
                sendCmd({ type: "requestNotif" })
              }
            >
              {desvState.notifPermission === "granted"
                ? "🔔 ativo"
                : desvState.notifPermission === "denied"
                ? "🔕 bloqueado"
                : "sem permissão"}
            </span>
            <button
              className={`desv-mute-btn${desvState.muted ? " desv-mute-btn--muted" : ""}`}
              onClick={() => sendCmd({ type: "toggleMute" })}
              title={desvState.muted ? "Ativar som" : "Silenciar"}
            >
              {desvState.muted ? "🔇" : "🔊"}
            </button>
          </div>

          <div className="desv-input-row">
            <span className="desv-row-label">Todos os ataques</span>
            <input
              type="checkbox"
              checked={desvState.allCommands}
              onChange={e => sendCmd({ type: "setAllCommands", value: e.target.checked })}
            />
            <span className="desv-row-unit">ignorar filtro de tags</span>
          </div>

          {/* Blacklist */}
          <div className="desv-tag-section">
            <div className="desv-tag-section-header">
              <span className="desv-tag-section-label desv-tag-section-label--black">
                Agir sobre
              </span>
              <span className="desv-tag-section-hint">
                etiquetas que ativam o desvio
              </span>
            </div>
            <TagInput
              tags={blacklistTags}
              placeholder="ex: [Desviar]"
              variant="black"
              onChange={handleBlacklistChange}
            />
          </div>

          {/* Whitelist */}
          <div className="desv-tag-section">
            <div className="desv-tag-section-header">
              <span className="desv-tag-section-label desv-tag-section-label--white">
                Ignorar
              </span>
              <span className="desv-tag-section-hint">
                etiquetas que bloqueiam o desvio
              </span>
            </div>
            <TagInput
              tags={whitelistTags}
              placeholder="ex: [Morto]"
              variant="white"
              onChange={handleWhitelistChange}
            />
          </div>

          {!isOnIncomings && (
            <div className="desv-page-warn">
              Navega para os ataques recebidos para usar o Desviador.
            </div>
          )}
        </div>
      )}

      {/* ── Cancel toasts ── */}
      {toasts.length > 0 && (
        <div className="desv-toasts">
          {toasts.map(t => (
            <div key={t.id} className="desv-toast">
              ✓ Apoio cancelado — aldeia {t.village}
            </div>
          ))}
        </div>
      )}

      {/* ── Attack list ── */}
      <div className="desv-body">
        {sorted.length === 0 ? (
          <div className="desv-empty">Nenhum ataque programado.</div>
        ) : (
          <table className="desv-table">
            <thead>
              <tr>
                <th className="desv-th desv-th--dot" />
                <th className="desv-th">Ataque</th>
                <th className="desv-th">Aldeia</th>
                <th className="desv-th">Envia em</th>
                <th className="desv-th">Chega</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(d => (
                <tr key={d.cmdId} className="desv-row">
                  <td className="desv-td desv-td--dot">
                    <span className={`desv-dot${d.fired ? " desv-dot--fired" : ""}`} />
                  </td>
                  <td className="desv-td desv-td--label" title={d.label}>{d.label}</td>
                  <td className="desv-td desv-td--village">{d.villageName}</td>
                  <td className={`desv-td desv-mono${d.fired ? " desv-mono--fired" : ""}`}>
                    {d.fired ? "—" : fmtCountdown(d.fireAt - now)}
                  </td>
                  <td className="desv-td desv-mono desv-mono--muted">
                    {fmtCountdown(d.arrivalMs - now)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── History panel ── */}
      {showHistory && (
        <div className="desv-hist-panel">
          <div className="desv-hist-head">
            <span className="desv-hist-title">Histórico de envios</span>
            {history.length > 0 && (
              <button className="desv-hist-clear" onClick={clearHistory}>Limpar</button>
            )}
          </div>
          {history.length === 0 ? (
            <div className="desv-empty" style={{ padding: "12px 14px" }}>Sem histórico.</div>
          ) : (
            <table className="desv-table">
              <tbody>
                {[...history].reverse().slice(0, 20).map(h => (
                  <tr key={h.cmdId + h.firedAt} className="desv-row">
                    <td className="desv-td desv-td--dot">
                      <span className={`desv-dot${h.recovered ? " desv-dot--recovered" : " desv-dot--fired"}`} />
                    </td>
                    <td className="desv-td desv-td--label" title={h.label}>
                      {h.label || h.cmdId}
                      {h.recovered && <span className="desv-hist-badge">cache</span>}
                    </td>
                    <td className="desv-td desv-td--village">{h.villageName || h.village}</td>
                    <td className="desv-td desv-mono desv-mono--muted">{fmtTime(h.firedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

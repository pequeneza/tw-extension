/**
 * DesviadorView — in-overlay panel for the Desviador userscript.
 *
 * Communication with the main-world userscript uses CustomEvents:
 *   xbot:desviador:state  (userscript → React)  — pushes active state every ~1 s
 *   xbot:desviador:cmd    (React → userscript)  — start / stop / requestNotif
 *
 * Config values (cancelSec, alertSec) are persisted in localStorage and read
 * directly by the userscript; no need to send them via CustomEvent.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";

/* ─── Storage keys (must match desviador.user.js) ────────────────────────── */
const CANCEL_SEC_KEY = "twDesviador_cancelSec";
const ALERT_SEC_KEY  = "twDesviador_alertSec";

/* ─── Types ───────────────────────────────────────────────────────────────── */
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
}

interface CancelToast {
  id: number;
  village: string;
}

/* ─── Helpers ─────────────────────────────────────────────────────────────── */
function useMountAnim(trigger: boolean) {
  const [anim, setAnim] = useState(false);
  useEffect(() => {
    if (trigger) requestAnimationFrame(() => setAnim(true));
    else setAnim(false);
  }, [trigger]);
  return anim;
}

function pad2(n: number) { return String(n).padStart(2, "0"); }

function fmtCountdown(ms: number) {
  if (ms <= 0) return "00:00";
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${pad2(m)}:${pad2(s)}` : `${pad2(m)}:${pad2(s)}`;
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

  const [desvState, setDesvState] = useState<DesvState>({
    active: false,
    scheduled: [],
    notifPermission: "default",
  });

  const [cancelSec, setCancelSec] = useState(() =>
    parseInt(localStorage.getItem(CANCEL_SEC_KEY) || "300", 10)
  );
  const [alertSec, setAlertSec] = useState(() =>
    parseInt(localStorage.getItem(ALERT_SEC_KEY) || "60", 10)
  );
  const [now, setNow] = useState(Date.now());
  const [toasts, setToasts] = useState<CancelToast[]>([]);
  const toastIdRef = useRef(0);

  /* Clock tick for countdown columns */
  useEffect(() => {
    if (!visible) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [visible]);

  /* Receive state from the userscript */
  useEffect(() => {
    const handler = (e: Event) =>
      setDesvState((e as CustomEvent<DesvState>).detail);
    document.addEventListener("xbot:desviador:state", handler);
    return () => document.removeEventListener("xbot:desviador:state", handler);
  }, []);

  /* Cancel confirmation toasts */
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

  /* Send command to the userscript */
  const sendCmd = useCallback((detail: Record<string, unknown>) => {
    document.dispatchEvent(new CustomEvent("xbot:desviador:cmd", { detail }));
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

  /* Unfired entries sorted by fireAt (next to fire first), fired entries at the bottom */
  const sorted = [...desvState.scheduled].sort((a, b) => {
    if (a.fired !== b.fired) return a.fired ? 1 : -1;
    return a.fireAt - b.fireAt;
  });

  const isOnIncomings = /screen=overview_villages.*mode=incomings.*subtype=attacks/.test(
    window.location.href
  );

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
          className={`desv-toggle-btn${desvState.active ? " desv-toggle-btn--stop" : ""}`}
          onClick={() =>
            sendCmd({ type: desvState.active ? "stop" : "start" })
          }
        >
          {desvState.active ? "■ Parar" : "▶ Desviar"}
        </button>
      </div>

      {/* ── Controls ── */}
      <div className="desv-controls">
        <div className="desv-input-row">
          <span className="desv-row-label">Cancelar após</span>
          <input
            className="input desv-num-input"
            type="number"
            value={cancelSec}
            min={60}
            max={3600}
            onChange={(e) => handleCancelSec(e.target.value)}
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
            onChange={(e) => handleAlertSec(e.target.value)}
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
        </div>

        {!isOnIncomings && (
          <div className="desv-page-warn">
            Navega para os ataques recebidos para usar o Desviador.
          </div>
        )}
      </div>

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
              {sorted.map((d) => (
                <tr key={d.cmdId} className="desv-row">
                  <td className="desv-td desv-td--dot">
                    <span
                      className={`desv-dot${d.fired ? " desv-dot--fired" : ""}`}
                    />
                  </td>
                  <td className="desv-td desv-td--label" title={d.label}>
                    {d.label}
                  </td>
                  <td className="desv-td desv-td--village">{d.villageName}</td>
                  <td
                    className={`desv-td desv-mono${
                      d.fired ? " desv-mono--fired" : ""
                    }`}
                  >
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
    </div>
  );
}

/**
 * TelegramView — in-overlay panel for the Telegram Notifier.
 * Communicates via CustomEvents (isolated ↔ main world bridge).
 *
 * Userscript  →  React : xbot:telegram:state  { active, botToken, chatId, notifyOnCaptcha, cooldownMs, lastSentAt, captchaDetected }
 * React  →  Userscript : xbot:telegram:getState
 *                        xbot:telegram:save    { settings }
 *                        xbot:telegram:test
 */
import React, { useCallback, useEffect, useRef, useState } from "react";

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
interface TelegramSettings {
  active: boolean;
  botToken: string;
  chatId: string;
  notifyOnCaptcha: boolean;
  notifyOnSend: boolean;
  cooldownMs: number;
}

interface TelegramState extends TelegramSettings {
  lastSentAt: Record<string, number>;
  captchaDetected: boolean;
}

const DEFAULT_SETTINGS: TelegramSettings = {
  active: false,
  botToken: "",
  chatId: "",
  notifyOnCaptcha: true,
  notifyOnSend: true,
  cooldownMs: 5 * 60 * 1000,
};

/* ─── Helpers ────────────────────────────────────────────────────────────── */
function dispatch(name: string, detail?: unknown) {
  document.dispatchEvent(
    new CustomEvent(name, detail !== undefined ? { detail } : undefined)
  );
}

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("pt-PT");
}

/* ─── useTelegramState ───────────────────────────────────────────────────── */
function useTelegramState() {
  const [state, setState] = useState<TelegramState>({
    ...DEFAULT_SETTINGS,
    lastSentAt: {},
    captchaDetected: false,
  });
  const [detected, setDetected] = useState(false);

  useEffect(() => {
    const onState = (e: Event) => {
      const d = (e as CustomEvent).detail as TelegramState;
      setDetected(true);
      setState(d);
    };
    document.addEventListener("xbot:telegram:state", onState);
    dispatch("xbot:telegram:getState");
    const probe = setInterval(() => dispatch("xbot:telegram:getState"), 1500);
    return () => {
      document.removeEventListener("xbot:telegram:state", onState);
      clearInterval(probe);
    };
  }, []);

  return { state, detected };
}

/* ─── Tip ────────────────────────────────────────────────────────────────── */
function Tip({ text }: { text: string }) {
  const [show, setShow] = useState(false);
  return (
    <span style={{ position: "relative", display: "inline-block", marginLeft: 4 }}>
      <span
        style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          width: 14, height: 14, borderRadius: "50%", background: "var(--b-bg)",
          border: "1px solid var(--b-br)", color: "var(--b500)", fontSize: 9,
          fontWeight: 700, cursor: "help", userSelect: "none", flexShrink: 0,
        }}
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}>?</span>
      {show && (
        <div style={{
          position: "absolute", bottom: "calc(100% + 6px)", left: "50%",
          transform: "translateX(-50%)", zIndex: 999, background: "var(--n900)",
          color: "var(--n0)", padding: "8px 10px", borderRadius: 6, fontSize: 11,
          lineHeight: 1.45, whiteSpace: "normal", width: 240,
          boxShadow: "var(--shadow-xl)", pointerEvents: "none",
        }}>
          {text}
          <div style={{
            position: "absolute", top: "100%", left: "50%",
            transform: "translateX(-50%)", border: "5px solid transparent",
            borderTopColor: "var(--n900)",
          }} />
        </div>
      )}
    </span>
  );
}

/* ─── MainTab ────────────────────────────────────────────────────────────── */
function MainTab({
  state,
  detected,
  onToggleActive,
  onTest,
}: {
  state: TelegramState;
  detected: boolean;
  onToggleActive: () => void;
  onTest: () => void;
}) {
  const lastCaptcha = state.lastSentAt["captcha"];

  const statusText = state.captchaDetected
    ? "Captcha detetado!"
    : state.active
      ? "A monitorizar…"
      : "Inativo";

  const statusColor = state.captchaDetected
    ? "var(--r500)"
    : state.active
      ? "var(--g600)"
      : "var(--n300)";

  return (
    <div className="cfg-body">
      {!detected && (
        <div className="state-msg" style={{ flexDirection: "column", gap: 6, padding: "20px 14px" }}>
          <span className="spinner" />
          <span style={{ textAlign: "center", fontSize: 12 }}>
            A aguardar userscript…
          </span>
        </div>
      )}

      {detected && (
        <>
          {/* Active toggle */}
          <div className="cfg-section">
            <label className="field-check">
              <span className="field-check-text">
                <span className="field-label">Notificações ativas</span>
                <span className="field-help">Ativa o envio de alertas para o Telegram</span>
              </span>
              <span className="toggle" onClick={(e) => e.stopPropagation()}>
                <input type="checkbox" checked={state.active} onChange={onToggleActive} />
                <span className="toggle-thumb" />
              </span>
            </label>
          </div>

          {/* Status */}
          <div className="cfg-section">
            <div className="section-label">Estado</div>
            <div style={{ padding: "8px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{
                  display: "inline-block", width: 8, height: 8, borderRadius: "50%",
                  background: statusColor, flexShrink: 0,
                }} />
                <span style={{ fontSize: 12, color: statusColor, fontWeight: 600 }}>
                  {statusText}
                </span>
              </div>
              {lastCaptcha && (
                <div style={{ fontSize: 11, color: "var(--n400)" }}>
                  Último alerta de captcha: {fmtTime(lastCaptcha)}
                </div>
              )}
            </div>
          </div>

          {/* Test button */}
          <div className="cfg-section">
            <div style={{ padding: "4px 14px 12px" }}>
              <button
                className="btn btn-ghost"
                style={{ width: "100%" }}
                disabled={!state.botToken || !state.chatId}
                onClick={onTest}
                title={!state.botToken || !state.chatId ? "Configura o bot token e chat ID primeiro" : ""}
              >
                📨 Enviar mensagem de teste
              </button>
              {(!state.botToken || !state.chatId) && (
                <div style={{ fontSize: 11, color: "var(--n400)", marginTop: 6, textAlign: "center" }}>
                  Configura o Bot Token e Chat ID no separador Definições.
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ─── SettingsTab ────────────────────────────────────────────────────────── */
function SettingsTab({
  settings,
  onChange,
  onSave,
  dirty,
  saved,
}: {
  settings: TelegramSettings;
  onChange: <K extends keyof TelegramSettings>(key: K, val: TelegramSettings[K]) => void;
  onSave: () => void;
  dirty: boolean;
  saved: boolean;
}) {
  const [showToken, setShowToken] = useState(false);

  return (
    <>
      <div className="cfg-body">
        <div className="cfg-section">
          <div className="section-label">Telegram Bot</div>

          <div className="field">
            <div className="field-top">
              <span className="field-label">
                Bot Token
                <Tip text="O token do teu bot Telegram. Obtém-no em @BotFather." />
              </span>
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              <input
                className="input"
                type={showToken ? "text" : "password"}
                value={settings.botToken}
                placeholder="123456:ABC-DEF..."
                onChange={(e) => onChange("botToken", e.target.value)}
                style={{ flex: 1 }}
              />
              <button
                className="btn btn-ghost"
                style={{ padding: "0 8px", fontSize: 13, flexShrink: 0 }}
                onClick={() => setShowToken((s) => !s)}
                title={showToken ? "Ocultar" : "Mostrar"}
              >{showToken ? "🙈" : "👁"}</button>
            </div>
          </div>

          <div className="field">
            <div className="field-top">
              <span className="field-label">
                Chat ID
                <Tip text="O ID do chat ou canal para onde enviar as mensagens. Podes obtê-lo em @userinfobot." />
              </span>
            </div>
            <input
              className="input"
              type="text"
              value={settings.chatId}
              placeholder="-1001234567890"
              onChange={(e) => onChange("chatId", e.target.value)}
            />
          </div>
        </div>

        <div className="cfg-section">
          <div className="section-label">Eventos</div>
          <label className="field-check">
            <span className="field-check-text">
              <span className="field-label">Captcha detetado</span>
              <span className="field-help">Envia alerta quando o jogo mostrar um captcha</span>
            </span>
            <span className="toggle" onClick={(e) => e.stopPropagation()}>
              <input
                type="checkbox"
                checked={settings.notifyOnCaptcha}
                onChange={(e) => onChange("notifyOnCaptcha", e.target.checked)}
              />
              <span className="toggle-thumb" />
            </span>
          </label>
          <label className="field-check">
            <span className="field-check-text">
              <span className="field-label">Comando enviado (Autosender)</span>
              <span className="field-help">Notifica quando o Autosender disparar um ataque, suporte ou snipe</span>
            </span>
            <span className="toggle" onClick={(e) => e.stopPropagation()}>
              <input
                type="checkbox"
                checked={settings.notifyOnSend ?? true}
                onChange={(e) => onChange("notifyOnSend", e.target.checked)}
              />
              <span className="toggle-thumb" />
            </span>
          </label>
        </div>

        <div className="cfg-section">
          <div className="section-label">Configuração</div>
          <div className="field">
            <div className="field-top">
              <span className="field-label">
                Cooldown (minutos)
                <Tip text="Tempo mínimo entre alertas do mesmo tipo, para evitar spam." />
              </span>
            </div>
            <input
              className="input"
              type="number"
              min={1}
              step={1}
              value={Math.round(settings.cooldownMs / 60000)}
              onChange={(e) => {
                const n = parseInt(e.target.value, 10);
                if (Number.isFinite(n) && n >= 1) onChange("cooldownMs", n * 60000);
              }}
            />
          </div>
        </div>
      </div>

      <div className="cfg-footer">
        <button
          className={`btn btn-save${dirty ? " btn-save--dirty" : ""}${saved ? " btn-save--saved" : ""}`}
          onClick={onSave}
          disabled={!dirty && !saved}
        >
          {saved ? "✓ Guardado" : dirty ? "Guardar" : "Sem alterações"}
        </button>
      </div>
    </>
  );
}

/* ─── TelegramView ───────────────────────────────────────────────────────── */
export function TelegramView({
  visible,
  onBack,
}: {
  visible: boolean;
  onBack: () => void;
}): React.ReactElement {
  const { state, detected } = useTelegramState();
  const [tab, setTab] = useState<"main" | "settings">("main");
  const [cfg, setCfg] = useState<TelegramSettings>({ ...DEFAULT_SETTINGS });
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const syncedRef = useRef(false);
  const anim = useMountAnim(visible);

  useEffect(() => {
    if (!visible) syncedRef.current = false;
  }, [visible]);

  // Sync settings from userscript on first detection only
  useEffect(() => {
    if (detected && !syncedRef.current) {
      syncedRef.current = true;
      setCfg({
        active: state.active,
        botToken: state.botToken,
        chatId: state.chatId,
        notifyOnCaptcha: state.notifyOnCaptcha,
        notifyOnSend: state.notifyOnSend ?? true,
        cooldownMs: state.cooldownMs,
      });
      setDirty(false);
    }
  }, [detected, state]);

  const set = useCallback(<K extends keyof TelegramSettings>(key: K, val: TelegramSettings[K]) => {
    setCfg((p) => ({ ...p, [key]: val }));
    setDirty(true);
    setSaved(false);
  }, []);

  const handleSave = () => {
    dispatch("xbot:telegram:save", { settings: cfg });
    setDirty(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2200);
  };

  // Toggle active directly without waiting for save
  const handleToggleActive = () => {
    const next = !state.active;
    setCfg((p) => ({ ...p, active: next }));
    dispatch("xbot:telegram:save", { settings: { ...cfg, active: next } });
  };

  const handleTest = () => dispatch("xbot:telegram:test");

  const subtitleText = !detected
    ? "a aguardar userscript…"
    : state.captchaDetected
      ? "⚠️ Captcha detetado!"
      : state.active
        ? "A monitorizar"
        : "Inativo";

  const tabBtn = (t: "main" | "settings", label: string) => (
    <button
      className={`btn${tab === t ? " btn-save btn-save--saved" : " btn-ghost"}`}
      style={{ fontSize: 11, padding: "5px 0", flex: 1 }}
      onClick={() => setTab(t)}
    >{label}</button>
  );

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
        <span className="cfg-icon">🔔</span>
        <div className="cfg-header-text">
          <span className="cfg-title">Telegram Notifier</span>
          <span className="cfg-subtitle">{subtitleText}</span>
        </div>
        {state.active && detected && (
          <span className="live-pip" style={{ marginLeft: "auto", marginRight: 4 }} />
        )}
      </div>

      {/* Tab bar */}
      <div className="cfg-section" style={{ paddingBottom: 0, flexShrink: 0 }}>
        <div style={{ display: "flex", gap: 3, padding: "8px 14px 0" }}>
          {tabBtn("main", "🔔 Principal")}
          {tabBtn("settings", "⚙️ Definições")}
        </div>
      </div>

      {tab === "main" && (
        <MainTab
          state={state}
          detected={detected}
          onToggleActive={handleToggleActive}
          onTest={handleTest}
        />
      )}
      {tab === "settings" && (
        <SettingsTab
          settings={cfg}
          onChange={set}
          onSave={handleSave}
          dirty={dirty}
          saved={saved}
        />
      )}
    </div>
  );
}

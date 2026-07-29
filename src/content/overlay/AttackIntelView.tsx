/**
 * AttackIntelView — in-overlay panel for the Attack Intel module.
 * Status/settings surface only: the advisory badges themselves are injected
 * into the game's incomings table by the userscript, not rendered here.
 *
 * Userscript  →  React : xbot:attackintel:state    { serverOnline, trackedThisSession, lastSyncMs, licenseStatus }
 *   licenseStatus: null (not checked yet) | "ok" | "missing" | "invalid" | "unreachable" —
 *   server-attack-intel requires a valid xBot license on every request (reuses
 *   license.vivaomadeira.com/validate); serverOnline stays true even when this
 *   isn't "ok", since a 401/403/503 from the license gate still means the
 *   server was reached, just that the request was rejected.
 * React  →  Userscript : xbot:attackintel:getState
 * React  →  Userscript : xbot:attackintel:syncNow   — requests one sync pass now, regardless of mode
 *
 * Settings live in localStorage under ATTACK_INTEL_SETTINGS_KEY and are read
 * independently by the userscript — no round-trip needed. syncMode gates
 * whether the userscript ever syncs on its own ("manual" = only on
 * syncNow; "automatic" = also on a timer, floored at 5 minutes regardless
 * of autoSyncMinutes — see MIN_AUTO_SYNC_MINUTES in the userscript).
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
interface AttackIntelSettings {
  enabled: boolean;
  serverUrl: string;
  windowHours: number;
  syncMode: "manual" | "automatic";
  autoSyncMinutes: number;
  keepTracking: boolean;
  licenseKey: string;
}

const MIN_AUTO_SYNC_MINUTES = 5;

type LicenseStatus = null | "ok" | "missing" | "invalid" | "unreachable";

interface AttackIntelState {
  serverOnline: boolean;
  trackedThisSession: number;
  lastSyncMs: number | null;
  licenseStatus: LicenseStatus;
}

const SETTINGS_KEY = "attack_intel_settings_v1";

const DEFAULT_SETTINGS: AttackIntelSettings = {
  enabled: true,
  serverUrl: "http://localhost:3742",
  windowHours: 12,
  syncMode: "manual",
  autoSyncMinutes: 5,
  keepTracking: false,
  licenseKey: "",
};

/* ─── Helpers ────────────────────────────────────────────────────────────── */
function loadSettings(): AttackIntelSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<AttackIntelSettings>) };
  } catch { return { ...DEFAULT_SETTINGS }; }
}
function saveSettings(s: AttackIntelSettings) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* */ }
}

function dispatch(name: string, detail?: unknown) {
  document.dispatchEvent(
    new CustomEvent(name, detail !== undefined ? { detail } : undefined)
  );
}

function fmtAgo(ts: number): string {
  const diff = Math.max(0, Date.now() - ts);
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
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

/* ─── useAttackIntelState ────────────────────────────────────────────────── */
function useAttackIntelState() {
  const [state, setState] = useState<AttackIntelState>({
    serverOnline: false,
    trackedThisSession: 0,
    lastSyncMs: null,
    licenseStatus: null,
  });
  const [detected, setDetected] = useState(false);

  useEffect(() => {
    const onState = (e: Event) => {
      const d = (e as CustomEvent).detail as AttackIntelState;
      setDetected(true);
      setState(d);
    };
    document.addEventListener("xbot:attackintel:state", onState);
    dispatch("xbot:attackintel:getState");
    const probe = setInterval(() => dispatch("xbot:attackintel:getState"), 2000);
    return () => {
      document.removeEventListener("xbot:attackintel:state", onState);
      clearInterval(probe);
    };
  }, []);

  return { state, detected };
}

/* ─── MainTab ────────────────────────────────────────────────────────────── */
function MainTab({
  state,
  detected,
  settings,
}: {
  state: AttackIntelState;
  detected: boolean;
  settings: AttackIntelSettings;
}) {
  const { serverUrl, enabled, syncMode, autoSyncMinutes } = settings;

  // Re-render on a timer so the "last sync Xs ago" label keeps counting up
  // between state pushes from the userscript.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const [justSynced, setJustSynced] = useState(false);
  const handleSyncNow = useCallback(() => {
    dispatch("xbot:attackintel:syncNow");
    setJustSynced(true);
    setTimeout(() => setJustSynced(false), 2000);
  }, []);

  if (!detected) {
    return (
      <div className="cfg-body">
        <div className="state-msg" style={{ flexDirection: "column", gap: 6, padding: "20px 14px" }}>
          <span className="spinner" />
          <span style={{ textAlign: "center", fontSize: 12 }}>
            Waiting for userscript…
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="cfg-body">
      {/* Connection status */}
      <div className="cfg-section">
        <div className="section-label">Database</div>
        <div style={{ padding: "8px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
          {state.serverOnline ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span className="live-pip" />
              <span style={{ fontSize: 12, color: "var(--g600)", fontWeight: 600 }}>
                Server online
              </span>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
              <span style={{
                display: "inline-block", width: 8, height: 8, borderRadius: "50%",
                background: "var(--a500)", flexShrink: 0, marginTop: 4,
              }} />
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <span style={{ fontSize: 12, color: "var(--a500)", fontWeight: 600 }}>
                  Server offline — start it locally to enable tracking
                </span>
                <span style={{ fontSize: 11, color: "var(--n400)", lineHeight: 1.45 }}>
                  Nothing is recorded or shared while the local database at{" "}
                  <span style={{ fontFamily: "var(--mono)", color: "var(--n700)" }}>{serverUrl}</span>{" "}
                  is unreachable.
                </span>
              </div>
            </div>
          )}

          {state.serverOnline && state.licenseStatus && state.licenseStatus !== "ok" && (
            <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
              <span style={{
                display: "inline-block", width: 8, height: 8, borderRadius: "50%",
                background: "var(--r500)", flexShrink: 0, marginTop: 4,
              }} />
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <span style={{ fontSize: 12, color: "var(--r500)", fontWeight: 600 }}>
                  {state.licenseStatus === "missing" && "No license key configured"}
                  {state.licenseStatus === "invalid" && "License key rejected"}
                  {state.licenseStatus === "unreachable" && "Could not confirm license right now"}
                </span>
                <span style={{ fontSize: 11, color: "var(--n400)", lineHeight: 1.45 }}>
                  {state.licenseStatus === "missing" &&
                    "The server is reachable but every request needs a valid license key. Add one in Settings."}
                  {state.licenseStatus === "invalid" &&
                    "The configured key was rejected as invalid or expired. Nothing is being recorded or shared."}
                  {state.licenseStatus === "unreachable" &&
                    "License validation itself couldn't be reached — requests are being rejected until it can be confirmed again."}
                </span>
              </div>
            </div>
          )}

          <div style={{ fontSize: 11, color: "var(--n400)", fontFamily: "var(--mono)" }}>
            {state.trackedThisSession} tracked this session
            {state.serverOnline && state.lastSyncMs !== null && (
              <> · last sync {fmtAgo(state.lastSyncMs)}</>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              className={`btn${justSynced ? " btn-save btn-save--saved" : ""}`}
              style={{ fontSize: 11, padding: "6px 12px" }}
              disabled={!enabled || justSynced}
              onClick={handleSyncNow}
            >
              {justSynced ? "✓ Sync requested" : "🔄 Sync now"}
            </button>
            <span style={{ fontSize: 11, color: "var(--n400)" }}>
              {syncMode === "automatic"
                ? `Automatic — also syncs every ${autoSyncMinutes}m`
                : "Manual — nothing syncs until you click this"}
            </span>
          </div>
        </div>
      </div>

      {/* What this does */}
      <div className="cfg-section">
        <div className="section-label">How it works</div>
        <div style={{ padding: "6px 14px 12px", fontSize: 11, color: "var(--n500)", lineHeight: 1.5 }}>
          Size classifications you set on the incomings overview are shared through the
          local database. When another player confirms a large wave from a source village,
          your still-unresolved attacks from that same village get an advisory badge
          directly in the incomings table. In manual mode (default) this only happens when
          you click Sync now; in automatic mode it also happens on a timer, never faster
          than every {MIN_AUTO_SYNC_MINUTES} minutes.
        </div>
      </div>
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
  settings: AttackIntelSettings;
  onChange: <K extends keyof AttackIntelSettings>(key: K, val: AttackIntelSettings[K]) => void;
  onSave: () => void;
  dirty: boolean;
  saved: boolean;
}) {
  return (
    <>
      <div className="cfg-body">
        <div className="cfg-section cfg-section-checks">
          <label className="field-check">
            <span className="field-check-text">
              <span className="field-label">Tracking enabled</span>
              <span className="field-help">Record and look up attack size classifications</span>
            </span>
            <span className="toggle" onClick={(e) => e.stopPropagation()}>
              <input
                type="checkbox"
                checked={settings.enabled}
                onChange={(e) => onChange("enabled", e.target.checked)}
              />
              <span className="toggle-thumb" />
            </span>
          </label>
        </div>

        <div className="cfg-section">
          <div className="section-label">Connection</div>
          <div className="field">
            <div className="field-top">
              <span className="field-label">
                Server URL
                <Tip text="Address of the local attack-intel database. You have to start this server yourself — the module stays idle while it is unreachable." />
              </span>
            </div>
            <input
              className="input"
              type="text"
              spellCheck={false}
              value={settings.serverUrl}
              placeholder={DEFAULT_SETTINGS.serverUrl}
              onChange={(e) => onChange("serverUrl", e.target.value)}
            />
          </div>
          <div className="field">
            <div className="field-top">
              <span className="field-label">
                License key
                <Tip text="server-attack-intel requires a valid xBot license on every request. Under this extension it's supplied automatically from your existing license — this field only matters if you're running attack_intel.user.js standalone (e.g. via Tampermonkey, without the extension installed)." />
              </span>
            </div>
            <input
              className="input"
              type="text"
              spellCheck={false}
              autoComplete="off"
              value={settings.licenseKey}
              placeholder="only needed for a standalone (non-extension) install"
              onChange={(e) => onChange("licenseKey", e.target.value)}
            />
            <span className="field-help">
              Ignored when the real xBot extension is installed — it already supplies your license automatically.
            </span>
          </div>
        </div>

        <div className="cfg-section">
          <div className="section-label">
            Sync
            <Tip text="Manual: nothing is sent to or fetched from the local database until you click Sync now. Automatic: also syncs on a timer, which can never run faster than every 5 minutes." />
          </div>
          <div style={{ display: "flex", gap: 3, padding: "0 14px 8px" }}>
            <button
              className={`btn${settings.syncMode === "manual" ? " btn-save btn-save--saved" : " btn-ghost"}`}
              style={{ fontSize: 11, padding: "6px 0", flex: 1 }}
              onClick={() => onChange("syncMode", "manual")}
            >Manual</button>
            <button
              className={`btn${settings.syncMode === "automatic" ? " btn-save btn-save--saved" : " btn-ghost"}`}
              style={{ fontSize: 11, padding: "6px 0", flex: 1 }}
              onClick={() => onChange("syncMode", "automatic")}
            >Automatic</button>
          </div>
          {settings.syncMode === "automatic" && (
            <div className="field" style={{ padding: "0 14px 8px" }}>
              <div className="field-top">
                <span className="field-label">Sync every (minutes)</span>
                <span className="field-range">{MIN_AUTO_SYNC_MINUTES}+</span>
              </div>
              <span className="field-help">
                Never runs faster than {MIN_AUTO_SYNC_MINUTES} minutes, even if set lower.
              </span>
              <input
                className="input"
                type="number"
                min={MIN_AUTO_SYNC_MINUTES}
                step={1}
                value={settings.autoSyncMinutes}
                onChange={(e) => {
                  const n = parseInt(e.target.value, 10);
                  if (Number.isFinite(n)) onChange("autoSyncMinutes", Math.max(MIN_AUTO_SYNC_MINUTES, n));
                }}
              />
            </div>
          )}
          <label className="field-check" style={{ padding: "6px 14px 8px" }}>
            <span className="field-check-text">
              <span className="field-label">
                Keep tracking
                <Tip text="Shows the advisory column on the incomings table the instant it loads, instead of waiting for a sync. Purely visual — doesn't send or fetch anything by itself; actual data still only comes from a manual or automatic sync." />
              </span>
              <span className="field-help">Show the advisory column immediately on page load, before any sync runs</span>
            </span>
            <span className="toggle" onClick={(e) => e.stopPropagation()}>
              <input
                type="checkbox"
                checked={settings.keepTracking}
                onChange={(e) => onChange("keepTracking", e.target.checked)}
              />
              <span className="toggle-thumb" />
            </span>
          </label>
        </div>

        <div className="cfg-section">
          <div className="section-label">Advisory</div>
          <div className="field">
            <div className="field-top">
              <span className="field-label">Window (hours)</span>
              <span className="field-range">1–48</span>
            </div>
            <span className="field-help">
              How many hours around a confirmed large attack's arrival time to flag other
              unresolved attacks from the same village as advisory
            </span>
            <input
              className="input"
              type="number"
              min={1}
              max={48}
              step={1}
              value={settings.windowHours}
              onChange={(e) => {
                const n = parseInt(e.target.value, 10);
                if (Number.isFinite(n)) onChange("windowHours", Math.min(48, Math.max(1, n)));
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
          {saved ? "✓ Saved" : dirty ? "Save changes" : "No changes"}
        </button>
      </div>
    </>
  );
}

/* ─── AttackIntelView ────────────────────────────────────────────────────── */
export function AttackIntelView({
  visible,
  onBack,
}: {
  visible: boolean;
  onBack: () => void;
}): React.ReactElement {
  const { state, detected } = useAttackIntelState();
  const [tab, setTab] = useState<"main" | "settings">("main");
  const [cfg, setCfg] = useState<AttackIntelSettings>(loadSettings);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const anim = useMountAnim(visible);

  // Re-read from localStorage on each open so another tab's save is picked up,
  // but never while the form is dirty.
  const dirtyRef = useRef(dirty);
  useEffect(() => { dirtyRef.current = dirty; }, [dirty]);
  useEffect(() => {
    if (visible && !dirtyRef.current) setCfg(loadSettings());
  }, [visible]);

  const set = useCallback(<K extends keyof AttackIntelSettings>(
    key: K, val: AttackIntelSettings[K],
  ) => {
    setCfg((p) => ({ ...p, [key]: val }));
    setDirty(true);
    setSaved(false);
  }, []);

  const handleSave = () => {
    saveSettings(cfg);
    setDirty(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2200);
  };

  const subtitleText = !detected
    ? "waiting for userscript…"
    : state.serverOnline
      ? `${state.trackedThisSession} tracked this session`
      : "server offline";

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
        <span className="cfg-icon">🛰️</span>
        <div className="cfg-header-text">
          <span className="cfg-title">Attack Intel</span>
          <span className="cfg-subtitle">{subtitleText}</span>
        </div>
        {detected && state.serverOnline && (
          <span className="live-pip" style={{ marginLeft: "auto", marginRight: 4 }} />
        )}
        <TriggerVisibilityToggle moduleId="attack_intel" />
      </div>

      {/* Tab bar */}
      <div className="cfg-section" style={{ paddingBottom: 0, flexShrink: 0 }}>
        <div style={{ display: "flex", gap: 3, padding: "8px 14px 0" }}>
          {tabBtn("main", "🛰️ Status")}
          {tabBtn("settings", "⚙️ Settings")}
        </div>
      </div>

      {tab === "main" && (
        <MainTab state={state} detected={detected} settings={cfg} />
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

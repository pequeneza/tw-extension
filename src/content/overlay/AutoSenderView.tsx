import React, { useCallback, useEffect, useRef, useState } from "react";

/* ─── Types ───────────────────────────────────────────────────────────────── */
interface QueueEntry {
  id: string;
  src: string;
  tgt: string;
  srcVillageId: string;
  tgtVillageId: string | null;
  launch: number;
  arrival: number;
  units: Record<string, number>;
  note: string;
  status: string;
  createdAt: number;
  type?: "attack" | "support";
  catapultTarget?: string | null;
  ntTemplate?: string | null;
  randomOffset?: number | null;
  randomOffsetTime?: number | null;
}

interface ASSettings {
  lookahead: number;              // seconds before launch to open place tab
  clickOffset: number;            // ms to click early (positive = earlier, legacy)
  timingOffset: number;           // ms to click late (positive = later, network compensation)
  autoTimingOffset: boolean;      // use measured round-trip ping as offset
  timingOffsetMultiplier: number; // multiply measured ping by this factor (0.1–2.0)
  autoSendNobles: boolean;        // auto-expand noble train on confirm page
  autoClose: boolean;             // close tab after sending
}

type Tab = "queue" | "config";

/* ─── Constants ───────────────────────────────────────────────────────────── */
const UNIT_ORDER     = ["spear","sword","axe","archer","spy","light","marcher","heavy","ram","catapult","snob","knight"];
const SETTINGS_KEY   = "xbot_autosender_settings";
const DEFAULT_SETTINGS: ASSettings = {
  lookahead: 40,
  clickOffset: 0,
  timingOffset: 0,
  autoTimingOffset: false,
  timingOffsetMultiplier: 0.25,
  autoSendNobles: true,
  autoClose: true,
};

function unitIconUrl(unit: string) {
  return `https://dspt.innogamescdn.com/asset/b2fb8d33/graphic/unit/unit_${unit}.webp`;
}

/* ─── Helpers ─────────────────────────────────────────────────────────────── */
function pad2(n: number) { return String(n).padStart(2, "0"); }
function pad3(n: number) { return String(n).padStart(3, "0"); }

function fmtCountdown(diffMs: number): string {
  const sign = diffMs < 0 ? "-" : "";
  const abs  = Math.abs(diffMs);
  const h    = Math.floor(abs / 3_600_000);
  const m    = Math.floor((abs % 3_600_000) / 60_000);
  const s    = Math.round((abs % 60_000) / 1000);
  return `${sign}${pad2(h)}:${pad2(m)}:${pad2(s)}`;
}

function getServerNowMs(): number {
  try {
    const w = window as Window & { Timing?: { getCurrentServerTime?: () => number } };
    if (w.Timing?.getCurrentServerTime) return w.Timing.getCurrentServerTime();
  } catch { /* */ }
  return Date.now();
}

function fmtPtDate(ms: number): string {
  const now    = new Date(getServerNowMs());
  const d      = new Date(ms);
  const nowDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dDay   = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff   = Math.round((dDay - nowDay) / 86_400_000);
  const time   = `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}.${pad3(d.getMilliseconds())}`;
  if (diff === 0) return `hoje às ${time}`;
  if (diff === 1) return `amanhã às ${time}`;
  return `a ${pad2(d.getDate())}.${pad2(d.getMonth()+1)}. às ${time}`;
}

function statusLabel(entry: QueueEntry, now: number): string {
  if (entry.status === "sent")      return "enviado";
  if (entry.status === "failed")    return "falhou";
  if (entry.status === "launching") return "a lançar…";
  if (entry.status === "submitted") return "confirmando…";
  const diff = entry.launch - now;
  if (diff <= 0) return "atrasado!";
  return fmtCountdown(diff);
}

function statusColors(entry: QueueEntry, now: number): [string, string] {
  if (entry.status === "failed")    return ["var(--r500)", "rgba(220,30,30,.12)"];
  if (entry.status === "sent")      return ["var(--n400)", "rgba(128,128,128,.12)"];
  if (entry.status === "launching" || entry.status === "submitted")
    return ["var(--a500)", "rgba(255,140,0,.12)"];
  const diff = entry.launch - now;
  if (diff > 3_600_000) return ["var(--g600)", "rgba(0,180,0,.12)"];
  if (diff > 600_000)   return ["var(--a500)", "rgba(255,140,0,.12)"];
  return ["var(--r500)", "rgba(220,30,30,.12)"];
}

/* ─── Settings helpers ────────────────────────────────────────────────────── */
function loadSettings(): ASSettings {
  try { return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}") }; }
  catch { return { ...DEFAULT_SETTINGS }; }
}
function persistSettings(s: ASSettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  document.dispatchEvent(new CustomEvent("xbot:autosender:run", { detail: { action: "applySettings", settings: s } }));
}

/* ─── Ping measurer ───────────────────────────────────────────────────────── */
async function measureHalfRtt(): Promise<number> {
  const samples: number[] = [];
  for (let i = 0; i < 5; i++) {
    const t0 = performance.now();
    try { await fetch(location.origin + "/game.php", { method: "HEAD", credentials: "include", cache: "no-store" }); }
    catch { /* ignore */ }
    samples.push(performance.now() - t0);
  }
  samples.sort((a, b) => a - b);
  return Math.round((samples[Math.floor(samples.length / 2)] ?? 0) / 2);
}

/* ─── useMountAnim ────────────────────────────────────────────────────────── */
function useMountAnim(trigger: boolean) {
  const [anim, setAnim] = useState(false);
  const prevRef = useRef(false);
  useEffect(() => {
    if (trigger && !prevRef.current) requestAnimationFrame(() => setAnim(true));
    else if (!trigger) setAnim(false);
    prevRef.current = trigger;
  }, [trigger]);
  return anim;
}

/* ─── TabButton ───────────────────────────────────────────────────────────── */
function TabButton({ active, onClick, children }: {
  active: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} style={{
      flex: 1, padding: "8px 12px", background: "none", border: "none",
      borderBottom: active ? "2px solid var(--b500)" : "2px solid transparent",
      color: active ? "var(--b500)" : "var(--n400)",
      fontWeight: active ? 600 : 400, fontSize: 12, cursor: "pointer",
      transition: "color 0.15s, border-color 0.15s",
    }}>
      {children}
    </button>
  );
}

/* ─── QueueTab ────────────────────────────────────────────────────────────── */
function QueueTab({ queue, paused, active, now, onSend, onRemove, onPauseToggle, onClear }: {
  queue: QueueEntry[];
  paused: boolean;
  active: boolean;
  now: number;
  onSend: (action: string, extra?: Record<string, unknown>) => void;
  onRemove: (id: string) => void;
  onPauseToggle: () => void;
  onClear: () => void;
}) {
  const pendingCount = queue.filter(e => e.status === "pending" || e.status === "launching" || e.status === "submitted").length;

  return (
    <>
      <div className="cfg-body">
        {queue.length === 0 ? (
          <div className="cfg-section">
            <div className="state-msg" style={{ flexDirection: "column", gap: 6, textAlign: "center" }}>
              <span style={{ fontSize: 22 }}>🚀</span>
              <span>
                Fila vazia. Adiciona ataques via <strong>Planeador</strong> (+ Autosend)
                ou <strong>Kumin Gluer</strong> (🚀 Autosend).
              </span>
            </div>
          </div>
        ) : (
          <div className="cfg-section">
            <div className="section-label" style={{
              display: "flex", justifyContent: "space-between", alignItems: "center", paddingRight: 14,
            }}>
              <span>Fila ({queue.length}) · {pendingCount} pendente{pendingCount !== 1 ? "s" : ""}</span>
              {active && <span className="live-pip" />}
              {paused && (
                <span style={{ fontSize: 10, color: "var(--a500)", fontWeight: 700, letterSpacing: "0.04em" }}>
                  ⏸ PAUSADO
                </span>
              )}
            </div>

            <div style={{ padding: "0 14px" }}>
              {queue.map(entry => {
                const [badgeColor, badgeBg] = statusColors(entry, now);
                const label    = statusLabel(entry, now);
                const unitList = UNIT_ORDER.filter(u => (entry.units[u] ?? 0) > 0);
                const isFinal  = entry.status === "sent" || entry.status === "failed";

                return (
                  <div key={entry.id} className="gluer-queue-row"
                    style={{ flexDirection: "column", alignItems: "stretch", gap: 0,
                      opacity: isFinal ? 0.6 : 1 }}>

                    {/* Row 1: src → tgt + status + delete */}
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span className="gluer-queue-src">{entry.src}</span>
                      <span style={{ color: "var(--n300)", fontSize: 11 }}>→</span>
                      <span className="gluer-queue-tgt">{entry.tgt}</span>
                      {entry.note && (
                        <span style={{ fontSize: 10, color: "var(--n400)", marginLeft: 4,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 90 }}>
                          {entry.note}
                        </span>
                      )}
                      <button className="btn btn-ghost"
                        style={{ marginLeft: "auto", flex: "none", padding: "1px 6px", fontSize: 11, color: "var(--r500)" }}
                        onClick={() => onRemove(entry.id)}>
                        ✕
                      </button>
                    </div>

                    {/* Row 2: departure time + countdown badge */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, paddingBottom: 2 }}>
                      <span style={{ fontSize: 11, color: "var(--n400)", fontFamily: "var(--mono)" }}>
                        {fmtPtDate(entry.launch)}
                      </span>
                      <span style={{
                        fontSize: 10, fontFamily: "var(--mono)", fontWeight: 700,
                        color: badgeColor, background: badgeBg,
                        border: `1px solid ${badgeColor}`, borderRadius: 4,
                        padding: "1px 5px", flexShrink: 0,
                      }}>
                        {label}
                      </span>
                    </div>

                    {/* Row 3: unit icons */}
                    {unitList.length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, paddingBottom: 6 }}>
                        {unitList.map(u => (
                          <span key={u} style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
                            <img src={unitIconUrl(u)} alt={u} style={{ width: 16, height: 16 }} />
                            <span style={{ fontSize: 11, color: "var(--n200)" }}>{entry.units[u]}</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="cfg-footer" style={{ gap: 6 }}>
        <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onPauseToggle}>
          {paused ? "▶ Retomar" : "⏸ Pausar"}
        </button>
        <button className="btn btn-ghost"
          style={{ flex: 1, color: queue.length ? "var(--r500)" : undefined }}
          disabled={!queue.length}
          onClick={onClear}>
          🗑 Limpar fila
        </button>
      </div>
    </>
  );
}

/* ─── ConfigTab ───────────────────────────────────────────────────────────── */
function ConfigTab() {
  const [settings, setSettings]   = useState<ASSettings>(() => loadSettings());
  const [drafts,   setDrafts]     = useState(() => {
    const s = loadSettings();
    return {
      lookahead:               String(s.lookahead),
      clickOffset:             String(s.clickOffset),
      timingOffset:            String(s.timingOffset),
      timingOffsetMultiplier:  String(s.timingOffsetMultiplier),
    };
  });
  const [dirty,    setDirty]      = useState(false);
  const [saved,    setSaved]      = useState(false);
  const [pinging,  setPinging]    = useState(false);
  const [pingResult, setPingResult] = useState<number | null>(null);

  const update = useCallback(<K extends keyof ASSettings>(key: K, val: ASSettings[K]) => {
    setSettings(s => ({ ...s, [key]: val }));
    setDirty(true);
    setSaved(false);
  }, []);

  const save = useCallback(() => {
    persistSettings(settings);
    setDirty(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2200);
  }, [settings]);

  const reset = useCallback(() => {
    setSettings({ ...DEFAULT_SETTINGS });
    setDrafts({
      lookahead:              String(DEFAULT_SETTINGS.lookahead),
      clickOffset:            String(DEFAULT_SETTINGS.clickOffset),
      timingOffset:           String(DEFAULT_SETTINGS.timingOffset),
      timingOffsetMultiplier: String(DEFAULT_SETTINGS.timingOffsetMultiplier),
    });
    setDirty(true);
    setSaved(false);
  }, []);

  async function runMeasurePing() {
    setPinging(true);
    setPingResult(null);
    try {
      const halfRtt = await measureHalfRtt();
      setPingResult(halfRtt);
    } finally {
      setPinging(false);
    }
  }

  function applyPing() {
    if (pingResult === null) return;
    const next = String(pingResult);
    setDrafts(d => ({ ...d, timingOffset: next }));
    update("timingOffset", pingResult);
  }

  return (
    <>
      <div className="cfg-body">

        {/* Timing */}
        <div className="cfg-section">
          <div className="section-label">Temporização</div>

          {/* Lookahead */}
          <div className="field" style={{ padding: "0 14px 8px" }}>
            <div className="field-top">
              <span className="field-label">Abrir separador antes da partida (s)</span>
              <span className="field-range">20–120</span>
            </div>
            <span className="field-help">
              Quantos segundos antes da partida o formulário de envio é aberto.
            </span>
            <input className="input" type="number" min={20} max={120} step={1}
              value={drafts.lookahead}
              onChange={e => {
                setDrafts(d => ({ ...d, lookahead: e.target.value }));
                const n = parseInt(e.target.value, 10);
                if (Number.isFinite(n) && n >= 20 && n <= 120) update("lookahead", n);
              }}
              onBlur={() => {
                const n = parseInt(drafts.lookahead, 10);
                const clamped = Number.isFinite(n) ? Math.max(20, Math.min(120, n)) : DEFAULT_SETTINGS.lookahead;
                setDrafts(d => ({ ...d, lookahead: String(clamped) }));
                update("lookahead", clamped);
              }}
            />
          </div>

          {/* Auto timing offset toggle */}
          <label className="field-check" style={{ padding: "0 14px 8px" }}>
            <span className="field-check-text">
              <span className="field-label">Offset automático (ping)</span>
              <span className="field-help">
                Mede o RTT durante a contagem e aplica-o como offset no envio — igual ao Kumin.
                Desliga para usar um valor fixo.
              </span>
            </span>
            <span className="toggle" onClick={e => e.stopPropagation()}>
              <input type="checkbox" checked={settings.autoTimingOffset}
                onChange={e => update("autoTimingOffset", e.target.checked)} />
              <span className="toggle-thumb" />
            </span>
          </label>

          {/* timingOffsetMultiplier — shown when autoTimingOffset ON */}
          {settings.autoTimingOffset && (
            <div className="field" style={{ padding: "0 14px 8px" }}>
              <div className="field-top">
                <span className="field-label">Multiplicador de ping</span>
                <span className="field-range">0–5</span>
              </div>
              <span className="field-help">
                Multiplica o RTT medido por este factor antes de o usar como offset.
                0.25 = ¼ do RTT (padrão Kumin).
              </span>
              <input className="input" type="number" min={0} max={5} step={0.05}
                value={drafts.timingOffsetMultiplier}
                onChange={e => {
                  setDrafts(d => ({ ...d, timingOffsetMultiplier: e.target.value }));
                  const n = parseFloat(e.target.value);
                  if (Number.isFinite(n) && n >= 0 && n <= 5) update("timingOffsetMultiplier", n);
                }}
                onBlur={() => {
                  const n = parseFloat(drafts.timingOffsetMultiplier);
                  const clamped = Number.isFinite(n) ? Math.max(0, Math.min(5, n)) : DEFAULT_SETTINGS.timingOffsetMultiplier;
                  setDrafts(d => ({ ...d, timingOffsetMultiplier: String(clamped) }));
                  update("timingOffsetMultiplier", clamped);
                }}
              />
            </div>
          )}

          {/* timingOffset — shown when autoTimingOffset OFF */}
          {!settings.autoTimingOffset && (
            <div className="field" style={{ padding: "0 14px 8px" }}>
              <div className="field-top">
                <span className="field-label">Offset fixo (ms)</span>
                <span className="field-range">-500 – 500</span>
              </div>
              <span className="field-help">
                Compensa latência de rede: valor positivo = clica após o horário alvo
                (o ataque chega a tempo). Equivalente ao <em>timing_offset</em> do Kumin.
              </span>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input className="input" type="number" min={-500} max={500} step={1}
                  value={drafts.timingOffset}
                  style={{ flex: 1 }}
                  onChange={e => {
                    setDrafts(d => ({ ...d, timingOffset: e.target.value }));
                    const n = parseInt(e.target.value, 10);
                    if (Number.isFinite(n)) update("timingOffset", n);
                  }}
                  onBlur={() => {
                    const n = parseInt(drafts.timingOffset, 10);
                    const clamped = Number.isFinite(n) ? Math.max(-500, Math.min(500, n)) : DEFAULT_SETTINGS.timingOffset;
                    setDrafts(d => ({ ...d, timingOffset: String(clamped) }));
                    update("timingOffset", clamped);
                  }}
                />
                <button className="btn btn-ghost" style={{ flex: "none", whiteSpace: "nowrap" }}
                  onClick={runMeasurePing} disabled={pinging}>
                  {pinging ? "A medir…" : "🔍 Medir"}
                </button>
              </div>
              {pingResult !== null && (
                <div style={{ marginTop: 6, fontSize: 11, color: "var(--n500)", display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span>Latência estimada: <strong>{pingResult} ms</strong></span>
                    <button className="btn btn-ghost" style={{ padding: "1px 8px", fontSize: 10 }} onClick={applyPing}>
                      Usar como offset fixo
                    </button>
                  </div>
                  <span style={{ fontSize: 10, color: "var(--n300)" }}>
                    Estimativa — o motor usa medição automática do ping se "Offset automático" estiver ativo.
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Legacy clickOffset — always visible, small */}
          <div className="field" style={{ padding: "0 14px 8px" }}>
            <div className="field-top">
              <span className="field-label" style={{ color: "var(--n400)" }}>Adiantar clique (ms, legado)</span>
              <span className="field-range">-500 – 500</span>
            </div>
            <span className="field-help" style={{ color: "var(--n300)" }}>
              Positivo = clica mais cedo. Subtrai-se ao offset acima. Manter em 0 se usar offset automático.
            </span>
            <input className="input" type="number" min={-500} max={500} step={1}
              value={drafts.clickOffset}
              onChange={e => {
                setDrafts(d => ({ ...d, clickOffset: e.target.value }));
                const n = parseInt(e.target.value, 10);
                if (Number.isFinite(n)) update("clickOffset", n);
              }}
              onBlur={() => {
                const n = parseInt(drafts.clickOffset, 10);
                const clamped = Number.isFinite(n) ? Math.max(-500, Math.min(500, n)) : DEFAULT_SETTINGS.clickOffset;
                setDrafts(d => ({ ...d, clickOffset: String(clamped) }));
                update("clickOffset", clamped);
              }}
            />
          </div>
        </div>

        {/* Behaviour */}
        <div className="cfg-section cfg-section-checks">
          <div className="section-label">Comportamento</div>

          <label className="field-check">
            <span className="field-check-text">
              <span className="field-label">Auto Send Nobles</span>
              <span className="field-help">
                Expande automaticamente o trem de nobres na página de confirmação
                (clica em #troop_confirm_train o nº de nobres−1 vezes). Igual ao Kumin.
              </span>
            </span>
            <span className="toggle" onClick={e => e.stopPropagation()}>
              <input type="checkbox" checked={settings.autoSendNobles}
                onChange={e => update("autoSendNobles", e.target.checked)} />
              <span className="toggle-thumb" />
            </span>
          </label>

          <label className="field-check">
            <span className="field-check-text">
              <span className="field-label">Fechar separador após envio</span>
              <span className="field-help">
                Fecha automaticamente o separador de confirmação depois de o ataque ser enviado.
              </span>
            </span>
            <span className="toggle" onClick={e => e.stopPropagation()}>
              <input type="checkbox" checked={settings.autoClose}
                onChange={e => update("autoClose", e.target.checked)} />
              <span className="toggle-thumb" />
            </span>
          </label>
        </div>

      </div>

      <div className="cfg-footer">
        <button className="btn btn-ghost" onClick={reset}>Reset</button>
        <button
          className={`btn btn-save${dirty ? " btn-save--dirty" : ""}${saved ? " btn-save--saved" : ""}`}
          onClick={save} disabled={!dirty && !saved}>
          {saved ? "✓ Guardado" : dirty ? "Guardar" : "Guardado"}
        </button>
      </div>
    </>
  );
}

/* ─── AutoSenderView ──────────────────────────────────────────────────────── */
export function AutoSenderView({ visible, onBack }: { visible: boolean; onBack: () => void }) {
  const anim = useMountAnim(visible);
  const [tab,    setTab]    = useState<Tab>("queue");
  const [queue,  setQueue]  = useState<QueueEntry[]>([]);
  const [paused, setPaused] = useState(false);
  const [active, setActive] = useState(false);
  const [now,    setNow]    = useState(() => getServerNowMs());

  // Reset to queue tab on close
  useEffect(() => { if (!visible) setTab("queue"); }, [visible]);

  // Listen to state events from userscript
  useEffect(() => {
    const h = (e: Event) => {
      const d = (e as CustomEvent).detail as { queue: QueueEntry[]; paused: boolean; active: boolean };
      setQueue(d.queue ?? []);
      setPaused(d.paused ?? false);
      setActive(d.active ?? false);
    };
    document.addEventListener("xbot:autosender:state", h);
    return () => document.removeEventListener("xbot:autosender:state", h);
  }, []);

  // Poll localStorage for resilience
  useEffect(() => {
    if (!visible) return;
    const poll = () => {
      try {
        const q = JSON.parse(localStorage.getItem("xbot_autosender_queue") ?? "[]");
        if (Array.isArray(q)) setQueue(q);
      } catch { /* */ }
    };
    poll();
    const id = setInterval(poll, 2000);
    return () => clearInterval(id);
  }, [visible]);

  // Countdown ticker
  useEffect(() => {
    if (!visible) return;
    const id = setInterval(() => setNow(getServerNowMs()), 500);
    return () => clearInterval(id);
  }, [visible]);

  // Probe state from userscript on open
  useEffect(() => {
    if (!visible) return;
    document.dispatchEvent(new CustomEvent("xbot:autosender:run", { detail: { action: "getState" } }));
  }, [visible]);

  function send(action: string, extra?: Record<string, unknown>) {
    document.dispatchEvent(new CustomEvent("xbot:autosender:run", { detail: { action, ...extra } }));
  }

  const pendingCount = queue.filter(e =>
    e.status === "pending" || e.status === "launching" || e.status === "submitted"
  ).length;

  return (
    <div className={`cfg-view${anim ? " in" : ""}`} style={{ display: visible ? "flex" : "none" }}>

      {/* Header */}
      <div className="cfg-header">
        <button className="back-btn" onClick={onBack}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M9 2L4 7l5 5" stroke="currentColor" strokeWidth="1.8"
              strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <span className="cfg-icon">🚀</span>
        <div className="cfg-header-text">
          <span className="cfg-title">Auto Sender</span>
          <span className="cfg-subtitle">
            {pendingCount} pendente{pendingCount !== 1 ? "s" : ""}
            {paused ? " · pausado" : ""}
          </span>
        </div>
        {active && <span className="live-pip" style={{ marginLeft: "auto", marginRight: 8 }} />}
      </div>

      {/* Tab bar */}
      <div style={{
        display: "flex", borderBottom: "1px solid var(--n150)",
        background: "var(--n50)", flexShrink: 0,
      }}>
        <TabButton active={tab === "queue"} onClick={() => setTab("queue")}>
          Fila
          {pendingCount > 0 && (
            <span className="meta-chip meta-on" style={{ marginLeft: 5, fontSize: 10 }}>
              {pendingCount}
            </span>
          )}
        </TabButton>
        <TabButton active={tab === "config"} onClick={() => setTab("config")}>
          Configuração
        </TabButton>
      </div>

      {tab === "queue" && (
        <QueueTab
          queue={queue}
          paused={paused}
          active={active}
          now={now}
          onSend={send}
          onRemove={id => send("remove", { id })}
          onPauseToggle={() => send(paused ? "resume" : "pause")}
          onClear={() => { if (window.confirm("Limpar toda a fila?")) send("clear"); }}
        />
      )}

      {tab === "config" && <ConfigTab />}
    </div>
  );
}

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TriggerVisibilityToggle } from "./TriggerVisibilityToggle";

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
  travelMs?: number | null;
  sigilPct?: number;
}

interface EntryDraft {
  type: "attack" | "support";
  note: string;
  arrival: number;
  launch: number;
  travelMs: number;
  baseTravelMs: number; // travelMs without sigil — stable reference for sigil recalculation
  sigilPct: number;
  ntTemplate: string | null;
  units: Record<string, number>;
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

type Tab = "queue" | "kumin" | "config";

/* ─── Constants ───────────────────────────────────────────────────────────── */
const UNIT_ORDER     = ["spear","sword","axe","archer","spy","light","marcher","heavy","ram","catapult","snob","knight"];
const SETTINGS_KEY   = "xbot_autosender_settings";
const CMD_TTL        = 90_000;

const NT_COUNT: Record<string, number> = {
  noNT: 1,
  twoNoblesSame: 2, threeNoblesSame: 3, fourNoblesSame: 4, fiveNoblesSame: 5,
  secondNobleWithRest: 2, thirdNobleWithRest: 3, fourNobleWithRest: 4, fiveNobleWithRest: 5,
  splitSecondThirdNobleNT: 4, secondNobleBuffNT: 4, thirdNobleBuffNT: 4,
  secondNobleBuffWith5NoblesNT: 5, secondNobleBuffWith2NoblesNT: 2,
  firstNobleRedNT: 4, secondNobleRedNT: 4, thirdNobleRedNT: 4, fourthNobleRedNT: 4,
  firstNobleRed5NT: 5, secondNobleRed5NT: 5, thirdNobleRed5NT: 5,
};

const NT_LABEL: Record<string, string> = {
  splitSecondThirdNobleNT:      "Split in 2nd&3rd Noble NT",
  secondNobleBuffNT:            "2nd Noble Buff NT",
  thirdNobleBuffNT:             "3rd Noble Buff NT",
  secondNobleBuffWith5NoblesNT: "2nd Noble Buff With 5 Nobles NT",
  secondNobleBuffWith2NoblesNT: "2nd Noble Buff With 2 Nobles NT",
  secondNobleWithRest:          "2 Nobles Selected/Rest",
  thirdNobleWithRest:           "3 Nobles Selected/Rest",
  fourNobleWithRest:            "4 Nobles Selected/Rest",
  fiveNobleWithRest:            "5 Nobles Selected/Rest",
  twoNoblesSame:                "2 Commands Same of Selected",
  threeNoblesSame:              "3 Commands Same of Selected",
  fourNoblesSame:               "4 Commands Same of Selected",
  fiveNoblesSame:               "5 Commands Same of Selected",
  firstNobleRedNT:              "1st Noble Red NT",
  secondNobleRedNT:             "2nd Noble Red NT",
  thirdNobleRedNT:              "3rd Noble Red NT",
  fourthNobleRedNT:             "4th Noble Red NT",
  firstNobleRed5NT:             "1st Noble Red 5NT",
  secondNobleRed5NT:            "2nd Noble Red 5NT",
  thirdNobleRed5NT:             "3rd Noble Red 5NT",
  noNT:                         "no NT",
};

const BASE_SEC: Record<string, number> = {
  spear: 1080, sword: 1320, axe: 1080, archer: 1080,
  spy: 540,   light: 600,  marcher: 600, heavy: 660,
  ram: 1800,  catapult: 1800, snob: 2100, knight: 600,
};

function slowestUnitOf(units: Record<string, number>): string | null {
  let slowest: string | null = null;
  let maxSec = 0;
  for (const u of UNIT_ORDER) {
    const sec = BASE_SEC[u] ?? 0;
    if ((units[u] ?? 0) > 0 && sec > maxSec) { maxSec = sec; slowest = u; }
  }
  return slowest;
}

function msToInput(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}.${pad3(d.getMilliseconds())}`;
}
function inputToMs(val: string): number {
  // Parse manually to force local-time interpretation, avoiding new Date(string) UTC ambiguity.
  // datetime-local format: YYYY-MM-DDTHH:MM:SS.mmm
  const m = val.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/);
  if (!m) return 0;
  const ms = m[7] ? parseInt(m[7].padEnd(3, "0"), 10) : 0;
  const d  = new Date(
    parseInt(m[1] ?? "0", 10), parseInt(m[2] ?? "1", 10) - 1, parseInt(m[3] ?? "1", 10),
    parseInt(m[4] ?? "0", 10), parseInt(m[5] ?? "0", 10),      parseInt(m[6] ?? "0", 10), ms
  );
  return isNaN(d.getTime()) ? 0 : d.getTime();
}

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

                    {/* Row 1: src → tgt + type badge + note + delete */}
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span className="gluer-queue-src">{entry.src}</span>
                      <span style={{ color: "var(--n300)", fontSize: 11 }}>→</span>
                      {entry.tgtVillageId ? (
                        <a
                          className="gluer-queue-tgt"
                          href={`${location.origin}/game.php?village=${entry.srcVillageId}&screen=info_village&id=${entry.tgtVillageId}`}
                          target="_blank" rel="noopener noreferrer"
                          style={{ color: "var(--b500)", textDecoration: "underline" }}
                        >{entry.tgt}</a>
                      ) : (
                        <span className="gluer-queue-tgt">{entry.tgt}</span>
                      )}
                      <span style={{
                        fontSize: 9, fontWeight: 700, padding: "1px 4px",
                        borderRadius: 3, flexShrink: 0, whiteSpace: "nowrap",
                        color: entry.type === "support" ? "var(--b500)" : "var(--r500)",
                        background: entry.type === "support"
                          ? "rgba(59,130,246,.10)" : "rgba(220,38,38,.10)",
                        border: `1px solid ${entry.type === "support"
                          ? "rgba(59,130,246,.25)" : "rgba(220,38,38,.20)"}`,
                      }}>
                        {entry.type === "support" ? "🛡 apoio" : "⚔ ataque"}
                      </span>
                      {entry.note && (
                        <span style={{ fontSize: 10, color: "var(--n400)",
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 80 }}>
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

/* ─── KuminV2Tab ──────────────────────────────────────────────────────────── */
function KuminV2Tab({ queue, now, onSend, onRemove }: {
  queue: QueueEntry[];
  now: number;
  onSend: (action: string, extra?: Record<string, unknown>) => void;
  onRemove: (id: string) => void;
}) {
  const [selected,  setSelected]  = useState<Set<string>>(new Set());
  const [fType,     setFType]     = useState("all");
  const [fSource,   setFSource]   = useState("all");
  const [fTarget,   setFTarget]   = useState("all");
  const [fStatus,   setFStatus]   = useState("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft,     setDraft]     = useState<EntryDraft | null>(null);

  const sources = useMemo(
    () => ["all", ...[...new Set(queue.map(e => e.src).filter(Boolean))]],
    [queue]
  );
  const targets = useMemo(
    () => ["all", ...[...new Set(queue.map(e => e.tgt).filter(Boolean))]],
    [queue]
  );

  const filtered = useMemo(() => queue.filter(e => {
    if (fType   !== "all" && (e.type ?? "attack") !== fType)  return false;
    if (fSource !== "all" && e.src !== fSource)               return false;
    if (fTarget !== "all" && e.tgt !== fTarget)               return false;
    if (fStatus === "pending" && e.status !== "pending")      return false;
    if (fStatus === "done" && e.status !== "sent" && e.status !== "failed") return false;
    return true;
  }), [queue, fType, fSource, fTarget, fStatus]);

  const allChecked = filtered.length > 0 && filtered.every(e => selected.has(e.id));
  function toggleAll() {
    setSelected(allChecked ? new Set() : new Set(filtered.map(e => e.id)));
  }
  function toggle(id: string) {
    setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  const selCount = filtered.filter(e => selected.has(e.id)).length;

  function startEdit(entry: QueueEntry) {
    setEditingId(entry.id);
    const travelMs = entry.travelMs != null && entry.travelMs > 0
      ? entry.travelMs
      : entry.arrival > entry.launch ? entry.arrival - entry.launch : 0;
    const arrival = entry.arrival > 0
      ? entry.arrival
      : travelMs > 0 ? entry.launch + travelMs : 0;
    const sigilPct = entry.sigilPct ?? 0;
    // Recover base travel time (no sigil) so sigil edits don't drift on repeated changes
    const baseTravelMs = travelMs > 0 && sigilPct > 0 && (entry.type ?? "attack") === "support"
      ? Math.round(travelMs * (1 + sigilPct / 100))
      : travelMs;
    setDraft({ type: entry.type ?? "attack", note: entry.note ?? "",
               arrival, launch: entry.launch, travelMs, baseTravelMs,
               sigilPct, ntTemplate: entry.ntTemplate ?? null,
               units: { ...entry.units } });
  }
  function cancelEdit() { setEditingId(null); setDraft(null); }
  function saveEdit(entryId: string) {
    if (!draft) return;
    onSend("updateEntry", { id: entryId, patch: { ...draft } });
    setEditingId(null);
    setDraft(null);
  }
  function onArrivalChange(ms: number) {
    setDraft(d => !d ? d : { ...d, arrival: ms, launch: d.travelMs > 0 ? ms - d.travelMs : d.launch });
  }
  function onLaunchChange(ms: number) {
    setDraft(d => !d ? d : { ...d, launch: ms, arrival: d.travelMs > 0 ? ms + d.travelMs : d.arrival });
  }
  function onSigilChange(newSigil: number) {
    setDraft(d => {
      if (!d) return d;
      // Sigil only affects support commands
      if (d.type !== "support" || d.baseTravelMs <= 0) return { ...d, sigilPct: newSigil };
      const newTravelMs = newSigil > 0
        ? Math.round(d.baseTravelMs / (1 + newSigil / 100))
        : d.baseTravelMs;
      const newLaunch = d.arrival > 0 ? d.arrival - newTravelMs : d.launch;
      return { ...d, sigilPct: newSigil, travelMs: newTravelMs, launch: newLaunch };
    });
  }

  const selStyle: React.CSSProperties = {
    flex: 1, minWidth: 0, fontSize: 10, padding: "2px 4px", height: 24,
    background: "var(--n0)", border: "1px solid var(--n200)",
    borderRadius: 5, color: "var(--n600)", cursor: "pointer",
  };
  const inpStyle: React.CSSProperties = {
    width: "100%", fontSize: 10, padding: "3px 6px",
    background: "var(--n0)", border: "1px solid var(--n200)",
    borderRadius: 5, color: "var(--n700)", fontFamily: "var(--mono)",
  };

  const COL = 10;

  return (
    <>
      {/* Filter bar */}
      <div style={{
        padding: "6px 8px", borderBottom: "1px solid var(--n150)",
        display: "flex", gap: 4, background: "var(--n50)", flexShrink: 0,
      }}>
        <select style={selStyle} value={fType} onChange={e => setFType(e.target.value)}>
          <option value="all">Tipo ▾</option>
          <option value="attack">⚔ Ataque</option>
          <option value="support">🛡 Apoio</option>
        </select>
        <select style={selStyle} value={fSource} onChange={e => setFSource(e.target.value)}>
          {sources.map(s => <option key={s} value={s}>{s === "all" ? "Origem ▾" : s}</option>)}
        </select>
        <select style={selStyle} value={fTarget} onChange={e => setFTarget(e.target.value)}>
          {targets.map(t => <option key={t} value={t}>{t === "all" ? "Alvo ▾" : t}</option>)}
        </select>
        <select style={selStyle} value={fStatus} onChange={e => setFStatus(e.target.value)}>
          <option value="all">Estado ▾</option>
          <option value="pending">Pendente</option>
          <option value="done">Terminado</option>
        </select>
      </div>

      {/* Table */}
      <div className="cfg-body" style={{ overflowX: "auto", padding: 0 }}>
        {filtered.length === 0 ? (
          <div className="state-msg" style={{ flexDirection: "column", gap: 6, textAlign: "center" }}>
            <span style={{ fontSize: 22 }}>🚀</span>
            <span>
              {queue.length === 0
                ? "Fila vazia. Adiciona ataques via Planeador ou Kumin Gluer."
                : "Nenhum resultado para os filtros aplicados."}
            </span>
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
            <thead>
              <tr style={{ borderBottom: "2px solid var(--n200)", background: "var(--n100)" }}>
                <th style={{ padding: "5px 6px", width: 24 }}>
                  <input type="checkbox" checked={allChecked} onChange={toggleAll}
                    style={{ cursor: "pointer" }} />
                </th>
                <th style={{ padding: "5px 4px", width: 20 }} />
                <th style={{ padding: "5px 6px", textAlign: "left", color: "var(--n500)", fontWeight: 600, whiteSpace: "nowrap" }}>Nome</th>
                <th style={{ padding: "5px 6px", textAlign: "left", color: "var(--n500)", fontWeight: 600, whiteSpace: "nowrap" }}>Origem</th>
                <th style={{ padding: "5px 6px", textAlign: "left", color: "var(--n500)", fontWeight: 600, whiteSpace: "nowrap" }}>Alvo</th>
                <th style={{ padding: "5px 6px", textAlign: "left", color: "var(--n500)", fontWeight: 600, whiteSpace: "nowrap" }}>Partida</th>
                <th style={{ padding: "5px 6px", textAlign: "left", color: "var(--n500)", fontWeight: 600, whiteSpace: "nowrap" }}>Chegada</th>
                <th style={{ padding: "5px 4px", width: 20 }} title="Unidade mais lenta" />
                <th style={{ padding: "5px 6px", width: 54 }} />
                <th style={{ padding: "5px 4px", width: 46 }} />
              </tr>
            </thead>
            <tbody>
              {filtered.map((entry, i) => {
                const [badgeColor, badgeBg] = statusColors(entry, now);
                const label     = statusLabel(entry, now);
                const slow      = slowestUnitOf(entry.units);
                const isFinal   = entry.status === "sent" || entry.status === "failed";
                const isChecked = selected.has(entry.id);
                const isEditing = editingId === entry.id;

                return (
                  <React.Fragment key={entry.id}>
                    {/* ── Data row ── */}
                    <tr style={{
                      background: isEditing
                        ? "rgba(59,130,246,.06)"
                        : isChecked
                          ? "rgba(59,130,246,.08)"
                          : i % 2 === 0 ? "transparent" : "var(--n50)",
                      opacity: isFinal ? 0.55 : 1,
                      borderBottom: isEditing ? "none" : "1px solid var(--n100)",
                    }}>
                      <td style={{ padding: "4px 6px", textAlign: "center" }}>
                        <input type="checkbox" checked={isChecked} onChange={() => toggle(entry.id)}
                          style={{ cursor: "pointer" }} />
                      </td>
                      <td style={{ padding: "4px 4px", textAlign: "center" }}>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
                          <img
                            src={entry.type === "support"
                              ? "https://dspt.innogamescdn.com/asset/b2fb8d33/graphic/command/support.png"
                              : "https://dspt.innogamescdn.com/asset/b2fb8d33/graphic/command/attack.png"}
                            alt={entry.type ?? "attack"}
                            style={{ width: 14, height: 14, display: "block" }}
                          />
                          {entry.ntTemplate && entry.ntTemplate !== "noNT" && (
                            <span
                              title={`NT: ${NT_LABEL[entry.ntTemplate] ?? entry.ntTemplate} · ${NT_COUNT[entry.ntTemplate] ?? "?"} nobles`}
                              style={{ fontSize: 8, fontWeight: 700, color: "var(--b500)", cursor: "default", lineHeight: 1 }}>
                              NT{NT_COUNT[entry.ntTemplate] ?? ""}
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={{
                        padding: "4px 6px", maxWidth: 80,
                        overflow: "hidden", textOverflow: "ellipsis",
                        whiteSpace: "nowrap", color: "var(--n600)",
                      }} title={entry.note || undefined}>
                        {entry.note || <span style={{ color: "var(--n300)" }}>—</span>}
                      </td>
                      <td style={{ padding: "4px 6px", fontFamily: "var(--mono)", fontSize: 10, whiteSpace: "nowrap" }}>
                        {entry.srcVillageId ? (
                          <a href={`${location.origin}/game.php?village=${entry.srcVillageId}&screen=info_village&id=${entry.srcVillageId}`}
                            target="_blank" rel="noopener noreferrer"
                            style={{ color: "var(--b500)", textDecoration: "underline" }}>
                            {entry.src}
                          </a>
                        ) : entry.src}
                      </td>
                      <td style={{ padding: "4px 6px", fontFamily: "var(--mono)", fontSize: 10, whiteSpace: "nowrap" }}>
                        {entry.tgtVillageId ? (
                          <a href={`${location.origin}/game.php?village=${entry.srcVillageId}&screen=info_village&id=${entry.tgtVillageId}`}
                            target="_blank" rel="noopener noreferrer"
                            style={{ color: "var(--b500)", textDecoration: "underline" }}>
                            {entry.tgt}
                          </a>
                        ) : entry.tgt}
                      </td>
                      <td style={{ padding: "4px 6px", whiteSpace: "nowrap" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                          <span style={{ fontSize: 10, color: "var(--n400)", fontFamily: "var(--mono)" }}>
                            {fmtPtDate(entry.launch)}
                          </span>
                          <span style={{
                            fontSize: 9, fontFamily: "var(--mono)", fontWeight: 700,
                            color: badgeColor, background: badgeBg,
                            border: `1px solid ${badgeColor}`, borderRadius: 3,
                            padding: "0 3px", display: "inline-block",
                          }}>
                            {label}
                          </span>
                        </div>
                      </td>
                      <td style={{ padding: "4px 6px", whiteSpace: "nowrap" }}>
                        {entry.arrival > 0 ? (
                          <span style={{ fontSize: 10, color: "var(--n400)", fontFamily: "var(--mono)" }}>
                            {fmtPtDate(entry.arrival)}
                          </span>
                        ) : (
                          <span style={{ color: "var(--n300)" }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: "4px 4px", textAlign: "center" }}>
                        {slow && (
                          <img src={unitIconUrl(slow)} alt={slow} title={slow}
                            style={{ width: 16, height: 16, display: "block", margin: "0 auto" }} />
                        )}
                      </td>
                      <td style={{ padding: "4px 4px", textAlign: "center" }}>
                        {!isFinal && (
                          <button className="btn btn-ghost"
                            style={{ padding: "2px 5px", fontSize: 10, whiteSpace: "nowrap" }}
                            onClick={() => onSend("sendNow", { id: entry.id })}>
                            ▶ Send
                          </button>
                        )}
                      </td>
                      <td style={{ padding: "4px 4px", textAlign: "center", whiteSpace: "nowrap" }}>
                        <button className="btn btn-ghost"
                          style={{ padding: "1px 5px", fontSize: 12,
                            color: isEditing ? "var(--r500)" : "var(--b500)" }}
                          title={isEditing ? "Cancelar edição" : "Editar"}
                          onClick={() => isEditing ? cancelEdit() : startEdit(entry)}>
                          {isEditing ? "✕" : "✎"}
                        </button>
                        {!isEditing && (
                          <button className="btn btn-ghost"
                            style={{ padding: "1px 5px", fontSize: 12, color: "var(--r500)", marginLeft: 2 }}
                            title="Apagar"
                            onClick={() => onRemove(entry.id)}>
                            🗑
                          </button>
                        )}
                      </td>
                    </tr>

                    {/* ── Inline editor ── */}
                    {isEditing && draft && (
                      <tr style={{ borderBottom: "2px solid var(--b500)" }}>
                        <td colSpan={COL} style={{ padding: "10px 12px", background: "rgba(59,130,246,.04)" }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>

                            {/* Type + Note */}
                            <div style={{ display: "flex", gap: 6 }}>
                              <div style={{ flex: "0 0 110px" }}>
                                <div style={{ fontSize: 10, color: "var(--n400)", marginBottom: 3 }}>Tipo</div>
                                <select style={{ ...inpStyle, fontFamily: "inherit" }}
                                  value={draft.type}
                                  onChange={e => setDraft(d => d ? { ...d, type: e.target.value as "attack" | "support" } : d)}>
                                  <option value="attack">⚔ Ataque</option>
                                  <option value="support">🛡 Apoio</option>
                                </select>
                              </div>
                              <div style={{ flex: "0 0 72px" }}>
                                <div style={{ fontSize: 10, color: "var(--n400)", marginBottom: 3 }}>Sigil %</div>
                                <input type="number" min={0} max={100} step={1}
                                  style={{ ...inpStyle, padding: "3px 4px" }}
                                  value={draft.sigilPct}
                                  onChange={e => {
                                    const v = Math.max(0, Math.min(100, parseInt(e.target.value, 10) || 0));
                                    onSigilChange(v);
                                  }} />
                              </div>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 10, color: "var(--n400)", marginBottom: 3 }}>Nome / Nota</div>
                                <input type="text" style={inpStyle} placeholder="—"
                                  value={draft.note}
                                  onChange={e => setDraft(d => d ? { ...d, note: e.target.value } : d)} />
                              </div>
                            </div>

                            {/* NT Template */}
                            <div>
                              <div style={{ fontSize: 10, color: "var(--n400)", marginBottom: 3 }}>NT Template</div>
                              <select style={{ ...inpStyle, fontFamily: "inherit" }}
                                value={draft.ntTemplate ?? "noNT"}
                                onChange={e => setDraft(d => d ? { ...d, ntTemplate: e.target.value === "noNT" ? null : e.target.value } : d)}>
                                {Object.entries(NT_LABEL).map(([k, lbl]) => (
                                  <option key={k} value={k}>{lbl}{NT_COUNT[k] && NT_COUNT[k] > 1 ? ` (${NT_COUNT[k]} nobles)` : ""}</option>
                                ))}
                              </select>
                            </div>

                            {/* Arrival + Launch */}
                            <div style={{ display: "flex", gap: 6 }}>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 10, color: "var(--n400)", marginBottom: 3 }}>
                                  Chegada
                                  {draft.travelMs > 0 && (
                                    <span style={{ color: "var(--n300)", marginLeft: 4 }}>↺ partida</span>
                                  )}
                                </div>
                                <input type="datetime-local" step="0.001" style={inpStyle}
                                  value={draft.arrival > 0 ? msToInput(draft.arrival) : ""}
                                  onChange={e => { const ms = inputToMs(e.target.value); if (ms) onArrivalChange(ms); }} />
                              </div>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 10, color: "var(--n400)", marginBottom: 3 }}>
                                  Partida
                                  {draft.travelMs > 0 && (
                                    <span style={{ color: "var(--n300)", marginLeft: 4 }}>↺ chegada</span>
                                  )}
                                </div>
                                <input type="datetime-local" step="0.001" style={inpStyle}
                                  value={msToInput(draft.launch)}
                                  onChange={e => { const ms = inputToMs(e.target.value); if (ms) onLaunchChange(ms); }} />
                              </div>
                            </div>

                            {/* Unit grid */}
                            <div>
                              <div style={{ fontSize: 10, color: "var(--n400)", marginBottom: 5 }}>Tropas</div>
                              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4 }}>
                                {UNIT_ORDER.map(u => (
                                  <div key={u} style={{ display: "flex", alignItems: "center", gap: 3 }}>
                                    <img src={unitIconUrl(u)} alt={u} title={u}
                                      style={{ width: 16, height: 16, flexShrink: 0 }} />
                                    <input type="number" min={0} step={1}
                                      style={{ ...inpStyle, padding: "2px 4px" }}
                                      value={draft.units[u] ?? 0}
                                      onChange={e => {
                                        const v = Math.max(0, parseInt(e.target.value, 10) || 0);
                                        setDraft(d => d ? { ...d, units: { ...d.units, [u]: v } } : d);
                                      }} />
                                  </div>
                                ))}
                              </div>
                            </div>

                            {/* Save / Cancel */}
                            <div style={{ display: "flex", gap: 6 }}>
                              <button className="btn btn-ghost" style={{ flex: 1, fontSize: 11 }}
                                onClick={cancelEdit}>Cancelar</button>
                              <button className="btn btn-save btn-save--dirty" style={{ flex: 2, fontSize: 11 }}
                                onClick={() => saveEdit(entry.id)}>Guardar</button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer */}
      <div className="cfg-footer" style={{ flexDirection: "column", gap: 6, padding: "8px 10px" }}>
        {selCount > 0 && (
          <div style={{ display: "flex", gap: 6 }}>
            <button className="btn btn-ghost" style={{ flex: 1, fontSize: 11 }}
              onClick={() => {
                filtered.filter(e => selected.has(e.id) && e.status === "pending")
                        .forEach(e => onSend("sendNow", { id: e.id }));
                setSelected(new Set());
              }}>
              ▶ Enviar selecionados ({selCount})
            </button>
            <button className="btn btn-ghost"
              style={{ flex: 1, fontSize: 11, color: "var(--r500)" }}
              onClick={() => {
                filtered.filter(e => selected.has(e.id)).forEach(e => onRemove(e.id));
                setSelected(new Set());
              }}>
              ✕ Apagar selecionados
            </button>
          </div>
        )}
        <div style={{ display: "flex", gap: 6 }}>
          <button className="btn btn-ghost" style={{ flex: 1, fontSize: 11 }}
            onClick={() => queue.filter(e => e.launch < now - CMD_TTL).forEach(e => onRemove(e.id))}>
            🗑 Apagar antigos
          </button>
          <button className="btn btn-ghost" style={{ flex: 1, fontSize: 11 }}
            onClick={() => queue.filter(e => e.status === "sent" || e.status === "failed").forEach(e => onRemove(e.id))}>
            🗑 Apagar terminados
          </button>
        </div>
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
      setQueue((d.queue ?? []).slice().sort((a, b) => a.launch - b.launch));
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
        if (Array.isArray(q)) setQueue(q.slice().sort((a: QueueEntry, b: QueueEntry) => a.launch - b.launch));
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
        <TriggerVisibilityToggle moduleId="auto_sender" />
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
        <TabButton active={tab === "kumin"} onClick={() => setTab("kumin")}>
          Kumin v2
        </TabButton>
        <TabButton active={tab === "config"} onClick={() => setTab("config")}>
          Config
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

      {tab === "kumin" && (
        <KuminV2Tab
          queue={queue}
          now={now}
          onSend={send}
          onRemove={id => send("remove", { id })}
        />
      )}

      {tab === "config" && <ConfigTab />}
    </div>
  );
}

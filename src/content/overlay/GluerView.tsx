/**
 * GluerView — Kumin Gluer panel.
 *
 * Flow:
 *  1. User clicks an incoming attack row on screen=info_village
 *  2. Userscript dispatches xbot:gluer:select → panel opens with attack details
 *  3. User loads troops; system shows all viable units per candidate village
 *  4. User sets unit amounts (like SnipeView) and clicks "Queue"
 *  5. "Open Kumin" opens screen=memo in a new tab
 *  6. Userscript on screen=memo fills the quickAdd form, clicks ➕ (quickAddEdit),
 *     selects the slowest unit in the editor, and clicks "Create New"
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

/* ─── Constants ───────────────────────────────────────────────────────────── */
const QUEUE_KEY    = "twKuminGluer_queue";
const SETTINGS_KEY = "twKuminGluer_settings";

const NT_OPTIONS: Array<[string, string]> = [
  ["noNT",                         "Sem NT (×1)"],
  ["twoNoblesSame",                "2 iguais (×2)"],
  ["threeNoblesSame",              "3 iguais (×3)"],
  ["fourNoblesSame",               "4 iguais (×4)"],
  ["fiveNoblesSame",               "5 iguais (×5)"],
  ["secondNobleWithRest",          "2 c/ resto (×2)"],
  ["thirdNobleWithRest",           "3 c/ resto (×3)"],
  ["fourNobleWithRest",            "4 c/ resto (×4)"],
  ["fiveNobleWithRest",            "5 c/ resto (×5)"],
  ["splitSecondThirdNobleNT",      "Split 2+3 nobre (×2)"],
  ["secondNobleBuffNT",            "2º nobre buff (×2)"],
  ["thirdNobleBuffNT",             "3º nobre buff (×3)"],
  ["secondNobleBuffWith2NoblesNT", "2º buff 2 nobres (×2)"],
  ["secondNobleBuffWith5NoblesNT", "2º buff 5 nobres (×5)"],
  ["secondNobleRedNT",             "2º nobre red (×2)"],
  ["thirdNobleRedNT",              "3º nobre red (×3)"],
  ["fourthNobleRedNT",             "4º nobre red (×4)"],
];

function loadGluerSettings(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}") ?? {}; } catch { return {}; }
}
function saveGluerSettings(s: Record<string, string>) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

const UNIT_MIN_PER_FIELD: Record<string, number> = {
  spear: 18, sword: 22, axe: 18, archer: 18, spy: 9,
  light: 10, marcher: 10, heavy: 11, ram: 30, catapult: 30,
  snob: 35, knight: 10,
};

// Slowest → fastest (for display / candidate ordering)
const UNIT_ORDER_SLOW_TO_FAST: string[] = [
  "snob", "catapult", "ram", "sword", "spear", "axe", "archer",
  "heavy", "knight", "marcher", "light", "spy",
];

/* ─── Types ───────────────────────────────────────────────────────────────── */
interface Coord { x: number; y: number; }

interface VillageTroops {
  villageId: string | null;
  name: string;
  coord: Coord;
  troops: Record<string, number>;
}

interface SelectedAttack {
  arrivalMs: number;
  ms: number;
  label: string;
  unit: string;
  cmdId: string;
  targetX: number;
  targetY: number;
  villageId: string;
}

interface GluerCandidate {
  src: VillageTroops;
  /** Slowest viable unit — drives departure time and Kumin scheduling */
  primaryUnit: string;
  /** Departure time based on the primary (slowest) unit */
  sendMs: number;
  /** All units (slowest→fastest) that can arrive in time — for user selection */
  allowedUnits: string[];
  /** Per-unit departure time (each has a different travel speed) */
  sendMsPerUnit: Record<string, number>;
}

interface QueueEntry {
  id: string;
  name: string;
  source: string;
  target: string;
  /** datetime-local string for Kumin's quickAddDate field */
  date: string;
  commandType: "Attack" | "Support";
  /** Slowest unit chosen — used to select in Kumin editor after ➕ */
  slowestUnit: string;
  /** Unit amounts chosen by the user — sent to the Kumin editor */
  units: Record<string, number>;
  /** Epoch ms of the departure — for display and countdown */
  sendMs: number;
  /** Epoch ms of arrival — used in BB string output */
  arrivalMs: number;
}

/* ─── Helpers ─────────────────────────────────────────────────────────────── */
function pad2(n: number) { return String(n).padStart(2, "0"); }
function pad3(n: number) { return String(n).padStart(3, "0"); }

function fmtDate(ms: number) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())} `
       + `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}.${pad3(d.getMilliseconds())}`;
}

function toDatetimeLocal(ms: number) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`
       + `T${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
       + `.${pad3(d.getMilliseconds())}`;
}

/** Parse "YYYY-MM-DD HH:MM:SS.mmm" back to epoch ms (null if invalid). */
function parseArrivalInput(s: string): number | null {
  const m = s.trim().match(/^(\d{4})-(\d{2})-(\d{2})[\sT](\d{2}):(\d{2}):(\d{2})\.(\d{1,3})$/);
  if (!m) return null;
  const d = new Date(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!, +m[6]!, +m[7]!.padEnd(3, "0"));
  return Number.isNaN(d.getTime()) ? null : d.getTime();
}

function fmtCountdown(diffMs: number) {
  const sign = diffMs < 0 ? "-" : "";
  const abs  = Math.abs(diffMs);
  const h    = Math.floor(abs / 3_600_000);
  const m    = Math.floor((abs % 3_600_000) / 60_000);
  const s    = Math.floor((abs % 60_000) / 1000);
  const ms   = abs % 1000;
  return `${sign}${pad2(h)}:${pad2(m)}:${pad2(s)}.${pad3(ms)}`;
}

function euclidean(a: Coord, b: Coord) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function travelMs(unit: string, from: Coord, to: Coord, speedFactor: number) {
  const mpf = UNIT_MIN_PER_FIELD[unit] ?? UNIT_MIN_PER_FIELD["spear"]!;
  return mpf * euclidean(from, to) * speedFactor * 60 * 1000;
}

function getServerNowMs(): number {
  try {
    const w = window as Window & { Timing?: { getCurrentServerTime?: () => number } };
    if (w.Timing?.getCurrentServerTime) return w.Timing.getCurrentServerTime();
  } catch { /* */ }
  return Date.now();
}

function makeId() {
  return `${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function loadQueue(): QueueEntry[] {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]") ?? []; }
  catch { return []; }
}

function saveQueue(q: QueueEntry[]) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
}

function unitIconUrl(unit: string) {
  return `https://dspt.innogamescdn.com/asset/b2fb8d33/graphic/unit/unit_${unit}.webp`;
}

function clampInt(n: number, lo: number, hi: number) {
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, Math.trunc(n)));
}

/* ─── Kumin BB string (no template) ──────────────────────────────────────── */
function toKuminString(e: QueueEntry, idx: number): string {
  const d    = new Date(e.arrivalMs);
  const date = `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
  const time = `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}.${pad3(d.getMilliseconds())}`;
  return `#${idx+1} | ${e.slowestUnit} [b][color=#ff0000]${e.name}[/color][/b] | ${date} [b]${time}[/b] | ${e.source} -> ${e.target}`;
}

/* ─── Candidate computation ───────────────────────────────────────────────── */
function computeCandidates(
  attack: SelectedAttack,
  troops: VillageTroops[],
  speedFactor: number,
  enabledUnits: Set<string>,
): GluerCandidate[] {
  const target: Coord    = { x: attack.targetX, y: attack.targetY };
  const nowMs            = getServerNowMs();
  // Noble mode: every enabled unit must be viable in a village for it to qualify.
  // Without noble, a village qualifies if it has any one viable enabled unit.
  const nobleMode        = enabledUnits.has("snob");
  const out: GluerCandidate[] = [];

  for (const src of troops) {
    const viable: Array<{ unit: string; sendMs: number }> = [];

    for (const unit of UNIT_ORDER_SLOW_TO_FAST) {
      if (!enabledUnits.has(unit)) continue;
      if ((src.troops[unit] ?? 0) === 0) continue;
      const tMs    = travelMs(unit, src.coord, target, speedFactor);
      const sendMs = attack.arrivalMs - tMs;
      if (sendMs <= nowMs + 5000) continue;
      viable.push({ unit, sendMs });
    }

    if (!viable.length) continue;

    // Noble mode: ALL enabled units must be viable (present + can arrive in time).
    // A unit in enabledUnits that has 0 troops or can't arrive fails the check.
    if (nobleMode) {
      const viableSet = new Set(viable.map(v => v.unit));
      const allPresent = [...enabledUnits].every(u => viableSet.has(u));
      if (!allPresent) continue;
    }

    // Primary = slowest viable unit (earliest send, most planning time)
    const primary = viable[0]!;
    const sendMsPerUnit: Record<string, number> = {};
    viable.forEach(v => { sendMsPerUnit[v.unit] = v.sendMs; });

    out.push({
      src,
      primaryUnit: primary.unit,
      sendMs: primary.sendMs,
      allowedUnits: viable.map(v => v.unit),
      sendMsPerUnit,
    });
  }

  return out.sort((a, b) => a.sendMs - b.sendMs);
}

/* ─── fetchOwnHomeTroops ──────────────────────────────────────────────────── */
async function fetchOwnHomeTroops(villageId: string): Promise<VillageTroops[]> {
  const url = `${location.origin}/game.php?village=${encodeURIComponent(villageId)}&screen=overview_villages&mode=units&type=own_home`;
  const html = await fetch(url, { credentials: "include" }).then(r => r.text());
  const doc  = new DOMParser().parseFromString(html, "text/html");

  const table = [...doc.querySelectorAll<HTMLTableElement>("table.vis")]
    .find(t => t.querySelector("thead img[src*='/graphic/unit/unit_']"));
  if (!table) return [];

  const headerUnits: string[] = [];
  table.querySelectorAll("thead th").forEach(th => {
    const img = th.querySelector<HTMLImageElement>("img");
    if (!img) return;
    const m = (img.getAttribute("src") ?? "").match(/\/unit_([a-z0-9_]+)\./i);
    if (!m) return;
    const raw = m[1]!.toLowerCase();
    if (raw === "militia" || !(raw in UNIT_MIN_PER_FIELD)) return;
    headerUnits.push(raw);
  });

  const out: VillageTroops[] = [];
  doc.querySelectorAll<HTMLTableRowElement>("table.vis tbody tr").forEach(tr => {
    const label   = tr.querySelector<HTMLElement>(".quickedit-label");
    const text    = label?.textContent ?? tr.textContent ?? "";
    const coordM  = text.match(/(\d{3})\|(\d{3})/);
    if (!coordM) return;
    const coord: Coord = { x: +coordM[1]!, y: +coordM[2]! };
    const a       = tr.querySelector<HTMLAnchorElement>("a[href*='village=']");
    const idMatch = (a?.getAttribute("href") ?? "").match(/[?&]village=(\d+)/);
    const vId     = idMatch ? idMatch[1]! : null;
    const tds     = [...tr.querySelectorAll<HTMLElement>("td.unit-item")];
    if (!tds.length) return;
    const troops: Record<string, number> = {};
    headerUnits.forEach((unit, i) => {
      const raw = (tds[i]?.textContent ?? "").replace(/[^\d]/g, "");
      troops[unit] = raw ? parseInt(raw, 10) : 0;
    });
    const name = label?.textContent?.trim() ?? `${coord.x}|${coord.y}`;
    out.push({ villageId: vId, name, coord, troops });
  });

  return out;
}

/* ─── useCountdown ────────────────────────────────────────────────────────── */
function useCountdown(sendMs: number, active: boolean) {
  const [display, setDisplay] = useState(() => fmtCountdown(sendMs - getServerNowMs()));
  const [past,    setPast]    = useState(false);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => {
      const diff = sendMs - getServerNowMs();
      setDisplay(fmtCountdown(diff));
      setPast(diff < 0);
    }, 50);
    return () => clearInterval(id);
  }, [sendMs, active]);
  return { display, past };
}

/* ─── GluerCandidateCard ──────────────────────────────────────────────────── */
function GluerCandidateCard({ cand, target, arrivalMs, commandType, onQueue, queued, enabledUnits, committed }: {
  cand: GluerCandidate;
  target: Coord;
  arrivalMs: number;
  commandType: "Attack" | "Support";
  onQueue: (entry: Omit<QueueEntry, "id">) => void;
  queued: boolean;
  enabledUnits: Set<string>;
  committed: Record<string, number>;
}) {
  const allowedSet = useMemo(() => new Set(cand.allowedUnits), [cand.allowedUnits]);

  const [amounts, setAmounts] = useState<Record<string, number>>(() =>
    Object.fromEntries(cand.allowedUnits.map(u => [u, 0]))
  );
  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(cand.allowedUnits.map(u => [u, "0"]))
  );
  const [timerActive, setTimerActive] = useState(false);

  // Slowest selected unit determines the effective departure time
  const slowestSelected = UNIT_ORDER_SLOW_TO_FAST.find(u => (amounts[u] ?? 0) > 0) ?? cand.primaryUnit;
  const effectiveSendMs = cand.sendMsPerUnit[slowestSelected] ?? cand.sendMs;

  const { display, past } = useCountdown(effectiveSendMs, timerActive);

  // Reset when candidate or allowedUnits change
  const allowedKey = cand.allowedUnits.join(",");
  useEffect(() => {
    setAmounts(Object.fromEntries(cand.allowedUnits.map(u => [u, 0])));
    setDrafts(Object.fromEntries(cand.allowedUnits.map(u => [u, "0"])));
    setTimerActive(false);
  }, [cand.src.villageId, allowedKey]);

  // Effective available = raw troops minus already-queued amounts
  function effAvail(unit: string) {
    return Math.max(0, (cand.src.troops[unit] ?? 0) - (committed[unit] ?? 0));
  }

  const toggleUnit = useCallback((unit: string) => {
    const avail = effAvail(unit);
    const next = (amounts[unit] ?? 0) > 0 ? 0 : avail;
    setAmounts(p => ({ ...p, [unit]: next }));
    setDrafts(p => ({ ...p, [unit]: String(next) }));
  }, [cand, amounts, committed]);

  const selectAll = useCallback(() => {
    const next = Object.fromEntries(cand.allowedUnits.map(u => [u, effAvail(u)]));
    setAmounts(next);
    setDrafts(Object.fromEntries(Object.entries(next).map(([k, v]) => [k, String(v)])));
  }, [cand, committed]);

  function handleQueue() {
    const activeUnits = Object.fromEntries(
      Object.entries(amounts).filter(([, v]) => v > 0)
    );
    const { x, y } = cand.src.coord;
    const labelTime = new Date(effectiveSendMs).toLocaleTimeString("pt-PT");
    onQueue({
      name: `Glue ${labelTime}`,
      source: `${x}|${y}`,
      target: `${target.x}|${target.y}`,
      date: toDatetimeLocal(arrivalMs),
      commandType,
      slowestUnit: slowestSelected,
      units: activeUnits,
      sendMs: effectiveSendMs,
      arrivalMs,
    });
    // Reset card after queuing
    setAmounts(Object.fromEntries(cand.allowedUnits.map(u => [u, 0])));
    setDrafts(Object.fromEntries(cand.allowedUnits.map(u => [u, "0"])));
  }

  const { x, y } = cand.src.coord;
  const hasSelection = Object.values(amounts).some(v => v > 0);
  // All units to display: enabled units that are in UNIT_ORDER_SLOW_TO_FAST
  const displayUnits = UNIT_ORDER_SLOW_TO_FAST.filter(u => enabledUnits.has(u));

  return (
    <div className={`snipe-card${queued ? " gluer-card--queued" : ""}`}>
      <div className="snipe-card-header">
        <span className="snipe-card-coord">{x}|{y}</span>
        <span className="snipe-card-meta">
          slowest: <strong>{slowestSelected}</strong>
          &nbsp;·&nbsp;saída: <strong>{fmtDate(effectiveSendMs).split(" ")[1]}</strong>
        </span>
      </div>

      <div className="snipe-card-row">
        <button className="btn btn-ghost snipe-timer-btn"
          onClick={() => setTimerActive(t => !t)}>
          {timerActive ? "Stop" : "Timer"}
        </button>
        {timerActive && (
          <span className={`snipe-countdown${past ? " snipe-countdown--past" : ""}`}>
            {display}
          </span>
        )}
        <button className="btn btn-ghost" onClick={selectAll}>Selec. tudo</button>
        <button
          className={`btn${queued ? " btn-save btn-save--saved" : " btn-save btn-save--dirty"}`}
          onClick={handleQueue}
          disabled={past || !hasSelection}
        >
          {queued ? "+ Queue" : "+ Queue"}
        </button>
      </div>

      <div className="snipe-units">
        {displayUnits.map(unit => {
          const rawAvail = cand.src.troops[unit] ?? 0;
          const avail    = effAvail(unit);
          const viable   = allowedSet.has(unit);
          const val      = viable ? (amounts[unit] ?? 0) : 0;
          const sendAtThisUnit = cand.sendMsPerUnit[unit];

          if (!viable) {
            // Show greyed-out — can't arrive in time or 0 troops
            return (
              <div key={unit}
                className="snipe-unitbox snipe-unitbox--disabled"
                title={rawAvail > 0 ? `${unit}: não chega a tempo` : `${unit}: sem tropas`}>
                <img src={unitIconUrl(unit)} alt={unit} className="snipe-unit-icon" />
                <div className="snipe-unit-avail">{rawAvail}</div>
              </div>
            );
          }

          return (
            <div key={unit}
              className={`snipe-unitbox${val > 0 ? " snipe-unitbox--on" : ""}`}
              title={sendAtThisUnit ? `Saída: ${fmtDate(sendAtThisUnit).split(" ")[1]}` : unit}>
              <img src={unitIconUrl(unit)} alt={unit} className="snipe-unit-icon"
                onClick={() => toggleUnit(unit)} />
              <div className="snipe-unit-avail">{avail}</div>
              <input
                className="snipe-unit-input"
                type="number" min={0} max={avail} step={1}
                value={drafts[unit] ?? String(val)}
                onChange={e => {
                  const raw = e.target.value;
                  setDrafts(p => ({ ...p, [unit]: raw }));
                  const n = clampInt(parseInt(raw, 10), 0, avail);
                  if (Number.isFinite(n)) setAmounts(p => ({ ...p, [unit]: n }));
                }}
                onBlur={() => {
                  const n = parseInt(drafts[unit] ?? "0", 10);
                  const clamped = Number.isFinite(n) ? clampInt(n, 0, avail) : val;
                  setAmounts(p => ({ ...p, [unit]: clamped }));
                  setDrafts(p => ({ ...p, [unit]: String(clamped) }));
                }}
              />
            </div>
          );
        })}
      </div>

      {!hasSelection && (
        <div style={{ fontSize: 11, color: "var(--n300)", padding: "4px 0 2px", textAlign: "center" }}>
          Clica num ícone ou "Selec. tudo" para selecionar tropas
        </div>
      )}
    </div>
  );
}

/* ─── GluerView ───────────────────────────────────────────────────────────── */
export function GluerView({ visible, onBack }: { visible: boolean; onBack: () => void }) {
  const [attack,      setAttack]      = useState<SelectedAttack | null>(null);
  const [troops,      setTroops]      = useState<VillageTroops[]>([]);
  const [loadingTrp,  setLoadingTrp]  = useState(false);
  const [troopsErr,   setTroopsErr]   = useState<string | null>(null);
  const [gameSpeed,   setGameSpeed]   = useState(1.4);
  const [unitSpeed,   setUnitSpeed]   = useState(0.75);
  const [sigil,       setSigil]       = useState(0);
  const [gsDraft,     setGsDraft]     = useState("1.4");
  const [usDraft,     setUsDraft]     = useState("0.75");
  const [sigilDraft,  setSigilDraft]  = useState("0");
  const [ntTemplate,         setNtTemplate]         = useState<string>(() => loadGluerSettings().ntTemplate ?? "noNT");
  const [commandType,        setCommandType]        = useState<"Attack"|"Support">("Attack");
  const [enabledUnits,       setEnabledUnits]       = useState<Set<string>>(() => new Set(UNIT_ORDER_SLOW_TO_FAST));
  const [attackTimeDraft,    setAttackTimeDraft]    = useState("");
  const [attackTimeOverride, setAttackTimeOverride] = useState<number | null>(null);
  const [queue,              setQueueState]         = useState<QueueEntry[]>(() => loadQueue());
  const [copied,             setCopied]             = useState(false);
  const [now,                setNow]                = useState(() => getServerNowMs());

  useEffect(() => {
    if (!visible) return;
    const id = setInterval(() => setNow(getServerNowMs()), 1000);
    return () => clearInterval(id);
  }, [visible]);

  useEffect(() => {
    const h = (e: Event) => {
      const detail = (e as CustomEvent<SelectedAttack>).detail;
      setAttack(detail);
      setAttackTimeDraft(fmtDate(detail.arrivalMs));
      setAttackTimeOverride(null);
    };
    document.addEventListener("xbot:gluer:select", h);
    return () => document.removeEventListener("xbot:gluer:select", h);
  }, []);

  const effectiveArrivalMs = attackTimeOverride ?? attack?.arrivalMs ?? 0;
  const effectiveAttack    = attack ? { ...attack, arrivalMs: effectiveArrivalMs } : null;

  const speedFactor = 1 / (gameSpeed * unitSpeed * (1 + sigil / 100));
  const candidates  = effectiveAttack ? computeCandidates(effectiveAttack, troops, speedFactor, enabledUnits) : [];
  const target: Coord | null = attack ? { x: attack.targetX, y: attack.targetY } : null;

  // Per-village committed amounts (derived from queue)
  const committed = useMemo(() => {
    const m = new Map<string, Record<string, number>>();
    for (const entry of queue) {
      const existing = m.get(entry.source) ?? {};
      for (const [unit, amt] of Object.entries(entry.units)) {
        existing[unit] = (existing[unit] ?? 0) + (amt as number);
      }
      m.set(entry.source, { ...existing });
    }
    return m;
  }, [queue]);

  // Identify queued entries by source coords
  const queuedSources = new Set(queue.map(q => q.source));

  const loadTroops = useCallback(async () => {
    const vid = attack?.villageId
      ?? window.location.search.match(/[?&]village=(\d+)/)?.[1]
      ?? null;
    if (!vid) { setTroopsErr("Could not detect village id."); return; }
    setLoadingTrp(true); setTroopsErr(null);
    try { setTroops(await fetchOwnHomeTroops(vid)); }
    catch (e) { setTroopsErr(`Erro: ${(e as Error).message}`); }
    finally { setLoadingTrp(false); }
  }, [attack]);

  function addToQueue(entry: Omit<QueueEntry, "id">) {
    const newEntry: QueueEntry = { ...entry, id: makeId() };
    const next = [...queue, newEntry];
    setQueueState(next);
    saveQueue(next);
  }

  function removeFromQueue(id: string) {
    const next = queue.filter(q => q.id !== id);
    setQueueState(next);
    saveQueue(next);
  }

  function clearQueue() {
    setQueueState([]);
    saveQueue([]);
  }

  function bbStrings() {
    return queue.map((e, i) => toKuminString(e, i)).join("\n");
  }

  async function copyStrings() {
    try {
      await navigator.clipboard.writeText(bbStrings());
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
      // Clear queue — user is exporting manually; localStorage not needed
      clearQueue();
    } catch { /* clipboard denied */ }
  }

  async function openKumin() {
    // Copy BB string too (same behaviour as Copy BB)
    try { await navigator.clipboard.writeText(bbStrings()); } catch { /* */ }
    // Open Kumin — localStorage kept so the memo script can process the queue
    const villageId = attack?.villageId
      ?? window.location.search.match(/[?&]village=(\d+)/)?.[1];
    const url = villageId
      ? `${location.origin}/game.php?village=${villageId}&screen=memo`
      : `${location.origin}/game.php?screen=memo`;
    window.open(url, "_blank", "noopener,noreferrer");
    // Clear React state — memo script will clear localStorage when it finishes
    setQueueState([]);
  }

  return (
    <div className={`cfg-view gluer-view${visible ? " in" : ""}`}
         style={{ display: visible ? "flex" : "none" }}>

      {/* Header */}
      <div className="cfg-header">
        <button className="back-btn" onClick={onBack}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M9 2L4 7l5 5" stroke="currentColor" strokeWidth="1.8"
              strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <span className="cfg-icon">
          <img src={chrome.runtime.getURL("icons/colatudo.png")}
               className="cfg-icon-img" alt="Kumin Gluer"
               onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
        </span>
        <div className="cfg-header-text">
          <span className="cfg-title">Kumin Gluer</span>
          <span className="cfg-subtitle">
            {attack
              ? `${attack.label} → ${attack.targetX}|${attack.targetY}`
              : "Clica num ataque para começar"}
          </span>
        </div>
        {queue.length > 0 && (
          <span className="gluer-queue-badge">{queue.length}</span>
        )}
      </div>

      <div className="cfg-body snipe-body">

        {/* No attack selected */}
        {!attack && (
          <div className="cfg-section">
            <div className="state-msg" style={{ flexDirection: "column", gap: 6, textAlign: "center" }}>
              <span style={{ fontSize: 22 }}>⚔️</span>
              <span>Clica num ataque na página <strong>info_village</strong> para selecionar o alvo.</span>
            </div>
          </div>
        )}

        {/* Selected attack */}
        {attack && (
          <div className="cfg-section gluer-attack-section">
            <div className="section-label">Ataque selecionado</div>
            <div className="gluer-attack-row">
              <span className="gluer-attack-label">{attack.label}</span>
              <input
                className="gluer-attack-time-input"
                value={attackTimeDraft}
                title="Edita para ajustar o tempo de chegada"
                onChange={e => {
                  setAttackTimeDraft(e.target.value);
                  const parsed = parseArrivalInput(e.target.value);
                  setAttackTimeOverride(parsed);
                }}
                onBlur={() => {
                  // If invalid, revert to effective value
                  if (attackTimeOverride === null && attack)
                    setAttackTimeDraft(fmtDate(attack.arrivalMs));
                }}
              />
            </div>
            <div className="gluer-attack-row">
              <span style={{ fontSize: 11, color: "var(--n400)" }}>Alvo:</span>
              <span className="gluer-attack-coord">{attack.targetX}|{attack.targetY}</span>
              <span style={{ fontSize: 11, color: "var(--n400)", marginLeft: "auto" }}>
                Chega em: <strong style={{ fontFamily: "var(--mono)" }}>
                  {fmtCountdown(effectiveArrivalMs - now)}
                </strong>
              </span>
            </div>
          </div>
        )}

        {/* Speed + type */}
        <div className="cfg-section">
          <div className="section-label">Configuração</div>
          <div style={{ padding: "6px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
            <div className="snipe-speed-row">
              <label className="snipe-speed-label">
                Jogo
                <input className="input snipe-speed-input" type="number" step={0.01} min={0.1} max={10}
                  value={gsDraft}
                  onChange={e => { setGsDraft(e.target.value); const n = parseFloat(e.target.value); if (Number.isFinite(n) && n > 0) setGameSpeed(n); }}
                  onBlur={() => { const n = parseFloat(gsDraft); if (!Number.isFinite(n) || n <= 0) setGsDraft(String(gameSpeed)); }}
                />
              </label>
              <label className="snipe-speed-label">
                Tropa
                <input className="input snipe-speed-input" type="number" step={0.01} min={0.1} max={2}
                  value={usDraft}
                  onChange={e => { setUsDraft(e.target.value); const n = parseFloat(e.target.value); if (Number.isFinite(n) && n > 0) setUnitSpeed(n); }}
                  onBlur={() => { const n = parseFloat(usDraft); if (!Number.isFinite(n) || n <= 0) setUsDraft(String(unitSpeed)); }}
                />
              </label>
              <label className="snipe-speed-label">
                Sígilia %
                <input className="input snipe-speed-input" type="number" step={1} min={0} max={100}
                  value={sigilDraft}
                  onChange={e => { setSigilDraft(e.target.value); const n = parseFloat(e.target.value); if (Number.isFinite(n) && n >= 0) setSigil(n); }}
                  onBlur={() => { const n = parseFloat(sigilDraft); if (!Number.isFinite(n) || n < 0) setSigilDraft(String(sigil)); }}
                />
              </label>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ fontSize: 12, color: "var(--n500)", minWidth: 44 }}>Tipo</span>
              <select className="input" style={{ flex: 1, fontSize: 12 }}
                value={commandType}
                onChange={e => setCommandType(e.target.value as "Attack" | "Support")}>
                <option value="Attack">Ataque</option>
                <option value="Support">Apoio</option>
              </select>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ fontSize: 12, color: "var(--n500)", minWidth: 44 }}>NT</span>
              <select className="input" style={{ flex: 1, fontSize: 12 }}
                value={ntTemplate}
                onChange={e => {
                  setNtTemplate(e.target.value);
                  const s = loadGluerSettings();
                  s.ntTemplate = e.target.value;
                  saveGluerSettings(s);
                }}>
                {NT_OPTIONS.map(([val, lbl]) => (
                  <option key={val} value={val}>{lbl}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Unit filter */}
        <div className="cfg-section">
          <div className="section-label" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingRight: 14 }}>
            <span>Tropas a considerar</span>
            <span style={{ display: "flex", gap: 4 }}>
              <button className="btn btn-ghost" style={{ fontSize: 10, padding: "1px 7px" }}
                onClick={() => setEnabledUnits(new Set(UNIT_ORDER_SLOW_TO_FAST))}>
                Todas
              </button>
              <button className="btn btn-ghost" style={{ fontSize: 10, padding: "1px 7px" }}
                disabled={troops.length === 0}
                title={troops.length === 0 ? "Carrega as tropas primeiro" : "Seleciona apenas unidades com tropas disponíveis"}
                onClick={() => {
                  const present = new Set(
                    UNIT_ORDER_SLOW_TO_FAST.filter(u => troops.some(v => (v.troops[u] ?? 0) > 0))
                  );
                  setEnabledUnits(present);
                }}>
                Com tropas
              </button>
              <button className="btn btn-ghost" style={{ fontSize: 10, padding: "1px 7px" }}
                onClick={() => setEnabledUnits(new Set())}>
                Nenhuma
              </button>
            </span>
          </div>
          <div className="gluer-unit-filter">
            {UNIT_ORDER_SLOW_TO_FAST.map(unit => {
              const on = enabledUnits.has(unit);
              return (
                <div key={unit}
                  className={`gluer-filter-box${on ? " gluer-filter-box--on" : ""}`}
                  title={unit}
                  onClick={() => setEnabledUnits(prev => {
                    const next = new Set(prev);
                    if (next.has(unit)) next.delete(unit); else next.add(unit);
                    return next;
                  })}>
                  <img src={unitIconUrl(unit)} alt={unit} className="snipe-unit-icon" />
                </div>
              );
            })}
          </div>
        </div>

        {/* Troops */}
        <div className="cfg-section">
          <div style={{ padding: "6px 14px" }}>
            <div className="snipe-summary-row">
              <span className="snipe-summary-item">
                Aldeias carregadas: <strong>{troops.length}</strong>
              </span>
            </div>
            {troopsErr && (
              <div className="snipe-error" style={{ marginTop: 4, marginBottom: 6 }}>{troopsErr}</div>
            )}
            <button className="btn btn-save btn-save--dirty"
              onClick={loadTroops} disabled={loadingTrp} style={{ marginTop: 6 }}>
              {loadingTrp
                ? <><span className="spinner" /> A carregar…</>
                : troops.length ? `↺ Recarregar (${troops.length})` : "Carregar tropas"}
            </button>
          </div>
        </div>

        {/* Candidates */}
        {attack && target && (
          <div className="cfg-section">
            <div className="section-label">
              Candidatos → {target.x}|{target.y}
              {candidates.length > 0 && (
                <span className="snipe-candidate-meta">
                  &nbsp;·&nbsp;{candidates.length} aldeia{candidates.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>
            <div style={{ padding: "0 14px" }}>
              {troops.length === 0 && !loadingTrp && (
                <div className="state-msg" style={{ paddingTop: 14, paddingBottom: 14 }}>
                  Carrega as tropas para ver candidatos.
                </div>
              )}
              {troops.length > 0 && candidates.length === 0 && (
                <div className="state-msg" style={{ paddingTop: 14, paddingBottom: 14 }}>
                  Nenhuma aldeia consegue chegar a tempo.
                </div>
              )}
              {candidates.map(cand => {
                const key = `${cand.src.coord.x}|${cand.src.coord.y}`;
                return (
                  <GluerCandidateCard
                    key={key}
                    cand={cand}
                    target={target}
                    arrivalMs={effectiveArrivalMs}
                    commandType={commandType}
                    onQueue={addToQueue}
                    queued={queuedSources.has(key)}
                    enabledUnits={enabledUnits}
                    committed={committed.get(key) ?? {}}
                  />
                );
              })}
            </div>
          </div>
        )}

        {/* Queue */}
        {queue.length > 0 && (
          <div className="cfg-section">
            <div className="section-label"
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingRight: 14 }}>
              <span>Fila de envio ({queue.length})</span>
              <button className="btn btn-ghost"
                style={{ flex: "none", fontSize: 10, padding: "1px 8px", color: "var(--r500)" }}
                onClick={clearQueue}>
                Limpar
              </button>
            </div>
            <div className="gluer-queue-list">
              {queue.map((e, i) => (
                <div key={e.id} className="gluer-queue-row">
                  <div className="gluer-queue-info">
                    <span className="gluer-queue-idx">#{i+1}</span>
                    <img src={unitIconUrl(e.slowestUnit)} alt={e.slowestUnit} className="gluer-unit-icon" />
                    <span className="gluer-queue-src">{e.source}</span>
                    <span style={{ color: "var(--n300)", fontSize: 11 }}>→</span>
                    <span className="gluer-queue-tgt">{e.target}</span>
                    <span className="gluer-queue-time">{fmtDate(e.sendMs).split(" ")[1]}</span>
                  </div>
                  <button
                    className="btn btn-ghost"
                    style={{ flex: "none", padding: "1px 6px", fontSize: 11, color: "var(--r500)" }}
                    onClick={() => removeFromQueue(e.id)}
                  >✕</button>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>

      {/* Footer */}
      <div className="cfg-footer" style={{ gap: 6 }}>
        <button className="btn btn-ghost" onClick={copyStrings}
          disabled={!queue.length} style={{ flex: 1 }}>
          {copied ? "✓ Copiado" : "📋 Copiar BB"}
        </button>
        <button className="btn btn-save btn-save--dirty" onClick={openKumin}
          disabled={!queue.length} style={{ flex: 1 }}>
          🚀 Abrir Kumin
        </button>
      </div>
    </div>
  );
}

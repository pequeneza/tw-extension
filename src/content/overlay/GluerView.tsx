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
import { computeScheduledByVillage, fetchWorldSpeed } from "./queue-utils";

/* ─── Constants ───────────────────────────────────────────────────────────── */
const QUEUE_KEY    = "twKuminGluer_queue";
const SETTINGS_KEY = "twKuminGluer_settings";

const NT_OPTIONS: Array<[string, string]> = [
  ["splitSecondThirdNobleNT",      "Split in 2nd&3rd Noble NT"],
  ["secondNobleBuffNT",            "2nd Noble Buff NT"],
  ["thirdNobleBuffNT",             "3rd Noble Buff NT"],
  ["secondNobleBuffWith5NoblesNT", "2nd Noble Buff With 5 Nobles NT"],
  ["secondNobleBuffWith2NoblesNT", "2nd Noble Buff With 2 Nobles NT"],
  ["secondNobleWithRest",          "2 Nobles Selected/Rest"],
  ["thirdNobleWithRest",           "3 Nobles Selected/Rest"],
  ["fourNobleWithRest",            "4 Nobles Selected/Rest"],
  ["fiveNobleWithRest",            "5 Nobles Selected/Rest"],
  ["twoNoblesSame",                "2 Commands Same of Selected"],
  ["threeNoblesSame",              "3 Commands Same of Selected"],
  ["fourNoblesSame",               "4 Commands Same of Selected"],
  ["fiveNoblesSame",               "5 Commands Same of Selected"],
  ["firstNobleRedNT",              "1st Noble Red NT"],
  ["secondNobleRedNT",             "2nd Noble Red NT"],
  ["thirdNobleRedNT",              "3rd Noble Red NT"],
  ["fourthNobleRedNT",             "4th Noble Red NT"],
  ["firstNobleRed5NT",             "1st Noble Red 5NT"],
  ["secondNobleRed5NT",            "2nd Noble Red 5NT"],
  ["thirdNobleRed5NT",             "3rd Noble Red 5NT"],
  ["noNT",                         "no NT"],
];

const CMD_ICON: Record<"Attack" | "Support", string> = {
  Attack:  "https://dspt.innogamescdn.com/asset/48a2d4fb/graphic/command/attack.webp",
  Support: "https://dspt.innogamescdn.com/asset/48a2d4fb/graphic/command/support.webp",
};

function sitterPrefix(): string {
  const t = new URLSearchParams(window.location.search).get("t");
  return t ? `t=${t}&` : "";
}

function loadGluerSettings(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}") ?? {}; } catch { return {}; }
}
function saveGluerSettings(s: Record<string, string>) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

/* ─── Troop presets — named unit-visibility + minimum-troop combos ───────── */
const PRESETS_KEY = "twKuminGluer_presets";

interface GluerPreset {
  id: string;
  name: string;
  /** Units considered/toggleable when this preset is applied. Empty = all units. */
  visibleUnits: string[];
  /** Per-unit minimum troop count a village must have to qualify as a candidate. 0/absent = no requirement. */
  minTroops: Record<string, number>;
}

function loadPresets(): GluerPreset[] {
  try { return JSON.parse(localStorage.getItem(PRESETS_KEY) ?? "[]") ?? []; } catch { return []; }
}
function savePresets(p: GluerPreset[]) {
  localStorage.setItem(PRESETS_KEY, JSON.stringify(p));
}

const UNIT_MIN_PER_FIELD: Record<string, number> = {
  spear: 18, sword: 22, axe: 18, archer: 18, spy: 9,
  light: 10, marcher: 10, heavy: 11, ram: 30, catapult: 30,
  snob: 35, knight: 10,
};

// Slowest → fastest — algorithmic use only (candidate computation, departure ordering)
const UNIT_ORDER_SLOW_TO_FAST: string[] = [
  "snob", "catapult", "ram", "sword", "spear", "axe", "archer",
  "heavy", "knight", "marcher", "light", "spy",
];

// Standard TW display order — matches every game screen (training, overview, rally point)
const UNIT_ORDER_DISPLAY: string[] = [
  "spear", "sword", "axe", "archer", "spy", "light", "marcher",
  "heavy", "ram", "catapult", "snob", "knight",
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
  /** Village ID of the source — needed when sending to Auto Sender */
  srcVillageId?: string | null;
  /** Village ID of the target — used for info_village link */
  tgtVillageId?: string | null;
  /** Sigil reduction % (1–100). Undefined means no sigil — leave Kumin's field unchanged. */
  sigilPct?: number;
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

/** Same as fmtCountdown but without the ms component — used by .snipe-countdown displays. */
function fmtCountdownShort(diffMs: number) {
  const sign = diffMs < 0 ? "-" : "";
  const abs  = Math.abs(diffMs);
  const h    = Math.floor(abs / 3_600_000);
  const m    = Math.floor((abs % 3_600_000) / 60_000);
  const s    = Math.floor((abs % 60_000) / 1000);
  return `${sign}${pad2(h)}:${pad2(m)}:${pad2(s)}`;
}

function fmtPtDate(ms: number): string {
  const now    = new Date(getServerNowMs());
  const d      = new Date(ms);
  const nowDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dDay   = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff   = Math.round((dDay - nowDay) / 86_400_000);
  const time   = `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}:${pad3(d.getMilliseconds())}`;
  if (diff === 0) return `hoje às ${time}`;
  if (diff === 1) return `amanhã às ${time}`;
  return `a ${pad2(d.getDate())}.${pad2(d.getMonth()+1)}. às ${time}`;
}

function euclidean(a: Coord, b: Coord) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function travelMs(unit: string, from: Coord, to: Coord, speedFactor: number) {
  const mpf = UNIT_MIN_PER_FIELD[unit] ?? UNIT_MIN_PER_FIELD["spear"]!;
  const rawMs = mpf * euclidean(from, to) * speedFactor * 60 * 1000;
  return Math.round(rawMs / 1000) * 1000; // TW travel times are integer seconds
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
  minTroops: Record<string, number> = {},
): GluerCandidate[] {
  const target: Coord    = { x: attack.targetX, y: attack.targetY };
  const nowMs            = getServerNowMs();
  // Noble mode: every enabled unit must be viable in a village for it to qualify.
  // Without noble, a village qualifies if it has any one viable enabled unit.
  const nobleMode        = enabledUnits.has("snob");
  const out: GluerCandidate[] = [];

  for (const src of troops) {
    // Preset minimum-troops gate — village must own at least this many of each
    // specified unit (independent of which units end up used to send).
    let passesMinTroops = true;
    for (const [unit, minAmt] of Object.entries(minTroops)) {
      if (minAmt > 0 && (src.troops[unit] ?? 0) < minAmt) { passesMinTroops = false; break; }
    }
    if (!passesMinTroops) continue;

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
/** Result also carries `worldUnits` — the units this world actually trains (from the
 * overview_villages table header), so the filter can drop e.g. archer/knight on worlds
 * without them without relying on window.gameData (only reliably populated on screen=place). */
async function fetchOwnHomeTroops(villageId: string): Promise<{ villages: VillageTroops[]; worldUnits: string[] }> {
  const out: VillageTroops[] = [];
  const headerUnits: string[] = [];
  const seenCoords = new Set<string>();
  let page = 0;

  while (true) {
    const url = `${location.origin}/game.php?${sitterPrefix()}village=${encodeURIComponent(villageId)}`
              + `&screen=overview_villages&mode=units&type=own_home&group=0&page=${page}`;
    const html = await fetch(url, { credentials: "include" }).then(r => r.text());
    const doc  = new DOMParser().parseFromString(html, "text/html");

    const table = [...doc.querySelectorAll<HTMLTableElement>("table.vis")]
      .find(t => t.querySelector("thead img[src*='/graphic/unit/unit_']"));
    if (!table) break;

    if (page === 0) {
      // No trailing `\.` anchor — retina asset filenames insert `@2x` between
      // the unit name and the extension (unit_spear@2x.webp), which would
      // otherwise make this regex fail to match entirely.
      table.querySelectorAll<HTMLImageElement>("thead img[src*='/graphic/unit/unit_']").forEach(img => {
        const m = (img.getAttribute("src") ?? "").match(/\/unit_([a-z0-9_]+)/i);
        if (!m) return;
        const raw = m[1]!.toLowerCase();
        if (raw === "militia" || !(raw in UNIT_MIN_PER_FIELD)) return;
        headerUnits.push(raw);
      });
    }

    const rows = [...table.querySelectorAll<HTMLTableRowElement>("tbody tr")];
    let addedThisPage = 0;

    rows.forEach(tr => {
      const label   = tr.querySelector<HTMLElement>(".quickedit-label");
      const text    = label?.textContent ?? tr.textContent ?? "";
      const coordM  = text.match(/(\d{3})\|(\d{3})/);
      if (!coordM) return;
      const coord: Coord = { x: +coordM[1]!, y: +coordM[2]! };
      const key = `${coord.x}|${coord.y}`;
      if (seenCoords.has(key)) return;
      seenCoords.add(key);
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
      addedThisPage++;
    });

    if (addedThisPage === 0) break;
    page++;
  }

  return { villages: out, worldUnits: headerUnits };
}

/* ─── useCountdown ────────────────────────────────────────────────────────── */
function useCountdown(sendMs: number, active: boolean) {
  const [display, setDisplay] = useState(() => fmtCountdownShort(sendMs - getServerNowMs()));
  const [past,    setPast]    = useState(false);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => {
      const diff = sendMs - getServerNowMs();
      setDisplay(fmtCountdownShort(diff));
      setPast(diff < 0);
    }, 50);
    return () => clearInterval(id);
  }, [sendMs, active]);
  return { display, past };
}

/* ─── GluerCandidateCard ──────────────────────────────────────────────────── */
function GluerCandidateCard({ cand, target, tgtVillageId, arrivalMs, commandType, onQueue, queued, enabledUnits, committed, sigilPct }: {
  cand: GluerCandidate;
  target: Coord;
  tgtVillageId: string | null;
  arrivalMs: number;
  commandType: "Attack" | "Support";
  onQueue: (entry: Omit<QueueEntry, "id">) => void;
  queued: boolean;
  enabledUnits: Set<string>;
  committed: Record<string, number>;
  sigilPct: number;
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
      srcVillageId: cand.src.villageId,
      tgtVillageId,
      sigilPct: sigilPct > 0 ? sigilPct : undefined,
    });
    // Reset card after queuing
    setAmounts(Object.fromEntries(cand.allowedUnits.map(u => [u, 0])));
    setDrafts(Object.fromEntries(cand.allowedUnits.map(u => [u, "0"])));
  }

  const { x, y } = cand.src.coord;
  const hasSelection = Object.values(amounts).some(v => v > 0);
  // All units to display: enabled units in standard TW display order
  const displayUnits = UNIT_ORDER_DISPLAY.filter(u => enabledUnits.has(u));

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
        <button className="btn btn-ghost snipe-timer-btn snipe-timer-btn--icon"
          title={timerActive ? "Parar" : "Iniciar timer"}
          onClick={() => setTimerActive(t => !t)}>
          {timerActive ? "⏹" : "⏱️"}
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
          + Queue
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
                className="snipe-unitbox snipe-unitbox--disabled gluer-unitbox--compact"
                title={rawAvail > 0 ? `${unit}: não chega a tempo` : `${unit}: sem tropas`}>
                <img src={unitIconUrl(unit)} alt={unit} className="snipe-unit-icon" />
                <div className="snipe-unit-avail">{rawAvail}</div>
              </div>
            );
          }

          return (
            <div key={unit}
              className={`snipe-unitbox gluer-unitbox--compact${val > 0 ? " snipe-unitbox--on" : ""}`}
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
  const [sigilDraft,  setSigilDraft]  = useState("0");
  const [ntTemplate,         setNtTemplate]         = useState<string>(() => loadGluerSettings().ntTemplate ?? "noNT");
  const [ntEnabled,          setNtEnabled]          = useState<boolean>(() => (loadGluerSettings().ntTemplate ?? "noNT") !== "noNT");
  const [commandType,        setCommandType]        = useState<"Attack"|"Support">("Attack");
  const [enabledUnits,       setEnabledUnits]       = useState<Set<string>>(() => new Set(UNIT_ORDER_SLOW_TO_FAST));
  const [tab,                setTab]                = useState<"main" | "presets">("main");
  const [presets,            setPresets]            = useState<GluerPreset[]>(() => loadPresets());
  const [activePresetId,     setActivePresetId]     = useState<string | null>(null);
  const [minTroops,          setMinTroops]          = useState<Record<string, number>>({});
  const [editingPresetId,    setEditingPresetId]    = useState<string | null>(null);
  const [formName,           setFormName]           = useState("");
  const [formVisible,        setFormVisible]        = useState<Set<string>>(() => new Set(UNIT_ORDER_SLOW_TO_FAST));
  const [formMinDrafts,      setFormMinDrafts]      = useState<Record<string, string>>(() =>
    Object.fromEntries(UNIT_ORDER_DISPLAY.map(u => [u, "0"]))
  );
  const [attackTimeDraft,    setAttackTimeDraft]    = useState("");
  const [attackTimeOverride, setAttackTimeOverride] = useState<number | null>(null);
  const [nudgeMs,            setNudgeMs]            = useState(100);
  const [nudgeDraft,         setNudgeDraft]         = useState("100");
  const [queue,              setQueueState]         = useState<QueueEntry[]>(() => loadQueue());
  const [copied,             setCopied]             = useState(false);
  const [now,                setNow]                = useState(() => getServerNowMs());

  useEffect(() => {
    if (!visible) return;
    const id = setInterval(() => setNow(getServerNowMs()), 1000);
    return () => clearInterval(id);
  }, [visible]);

  // Auto-load game/unit speed from the world config once, like planeador.fetchServerConfig
  useEffect(() => {
    fetchWorldSpeed().then(({ gameSpeed: gs, unitSpeed: us }) => {
      setGameSpeed(gs);
      setUnitSpeed(us);
    });
  }, []);

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
  const candidates  = effectiveAttack ? computeCandidates(effectiveAttack, troops, speedFactor, enabledUnits, minTroops) : [];
  const target: Coord | null = attack ? { x: attack.targetX, y: attack.targetY } : null;

  // Per-village committed amounts — aggregated across all three scheduling queues
  const committed = useMemo(() => computeScheduledByVillage(), [queue]);

  // Identify queued entries by source coords
  const queuedSources = new Set(queue.map(q => q.source));

  const loadTroops = useCallback(async () => {
    const vid = attack?.villageId
      ?? window.location.search.match(/[?&]village=(\d+)/)?.[1]
      ?? null;
    if (!vid) { setTroopsErr("Could not detect village id."); return; }
    setLoadingTrp(true); setTroopsErr(null);
    try {
      const { villages, worldUnits } = await fetchOwnHomeTroops(vid);
      setTroops(villages);
      // Auto-narrow the filter: world-available units ∩ units actually present in troops.
      // Skipped when a preset is active — the preset's explicit visible-units choice wins.
      if (!activePresetId) {
        const worldSet = new Set(worldUnits);
        const present = new Set(
          UNIT_ORDER_SLOW_TO_FAST.filter(u => worldSet.has(u) && villages.some(v => (v.troops[u] ?? 0) > 0))
        );
        setEnabledUnits(present.size ? present : new Set(worldUnits.filter(u => UNIT_ORDER_SLOW_TO_FAST.includes(u))));
      }
    }
    catch (e) { setTroopsErr(`Erro: ${(e as Error).message}`); }
    finally { setLoadingTrp(false); }
  }, [attack, activePresetId]);

  // Presets — clicking the active preset again clears it back to defaults (all units, no minimums)
  function applyPreset(p: GluerPreset) {
    if (activePresetId === p.id) {
      setActivePresetId(null);
      setEnabledUnits(new Set(UNIT_ORDER_SLOW_TO_FAST));
      setMinTroops({});
      return;
    }
    setActivePresetId(p.id);
    setEnabledUnits(new Set(p.visibleUnits.length ? p.visibleUnits : UNIT_ORDER_SLOW_TO_FAST));
    setMinTroops(p.minTroops);
  }

  function resetPresetForm() {
    setEditingPresetId(null);
    setFormName("");
    setFormVisible(new Set(UNIT_ORDER_SLOW_TO_FAST));
    setFormMinDrafts(Object.fromEntries(UNIT_ORDER_DISPLAY.map(u => [u, "0"])));
  }

  function startEditPreset(p: GluerPreset) {
    setEditingPresetId(p.id);
    setFormName(p.name);
    setFormVisible(new Set(p.visibleUnits.length ? p.visibleUnits : UNIT_ORDER_SLOW_TO_FAST));
    setFormMinDrafts(Object.fromEntries(UNIT_ORDER_DISPLAY.map(u => [u, String(p.minTroops[u] ?? 0)])));
  }

  function savePresetForm() {
    const name = formName.trim();
    if (!name) return;
    const minTroopsOut: Record<string, number> = {};
    for (const u of UNIT_ORDER_DISPLAY) {
      const n = parseInt(formMinDrafts[u] ?? "0", 10);
      if (Number.isFinite(n) && n > 0) minTroopsOut[u] = n;
    }
    const preset: GluerPreset = {
      id: editingPresetId ?? makeId(),
      name,
      visibleUnits: [...formVisible],
      minTroops: minTroopsOut,
    };
    const next = editingPresetId
      ? presets.map(p => p.id === editingPresetId ? preset : p)
      : [...presets, preset];
    setPresets(next);
    savePresets(next);
    resetPresetForm();
  }

  function deletePreset(id: string) {
    const next = presets.filter(p => p.id !== id);
    setPresets(next);
    savePresets(next);
    if (activePresetId === id) { setActivePresetId(null); setEnabledUnits(new Set(UNIT_ORDER_SLOW_TO_FAST)); setMinTroops({}); }
    if (editingPresetId === id) resetPresetForm();
  }

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
    try { await navigator.clipboard.writeText(bbStrings()); } catch { /* */ }
    const villageId = attack?.villageId
      ?? window.location.search.match(/[?&]village=(\d+)/)?.[1];
    const url = villageId
      ? `${location.origin}/game.php?${sitterPrefix()}village=${villageId}&screen=memo`
      : `${location.origin}/game.php?${sitterPrefix()}screen=memo`;
    window.open(url, "_blank", "width=1000,height=600,noopener,noreferrer");
    setQueueState([]);
  }

  function sendToAutosender() {
    if (!queue.length) return;
    try {
      const existing: unknown[] = JSON.parse(localStorage.getItem("xbot_autosender_queue") ?? "[]");
      const additions = queue.map(e => ({
        id: e.id,
        src: e.source,
        tgt: e.target,
        srcVillageId: e.srcVillageId ?? null,
        tgtVillageId: e.tgtVillageId ?? null,
        type: e.commandType.toLowerCase() as "attack" | "support",
        launch: e.sendMs,
        arrival: e.arrivalMs,
        units: e.units,
        sigilPct: e.sigilPct,
        ntTemplate: ntTemplate !== "noNT" ? ntTemplate : null,
        note: e.name,
        status: "pending",
        createdAt: Date.now(),
      }));
      localStorage.setItem("xbot_autosender_queue", JSON.stringify([...existing, ...additions]));
      document.dispatchEvent(new CustomEvent("xbot:autosender:run", { detail: { action: "getState" } }));
      clearQueue();
    } catch (err) {
      console.error("[GluerView] sendToAutosender:", err);
    }
  }

  return (
    <div className={`cfg-view gluer-view${visible ? " in" : ""}`
         + (commandType === "Attack" ? " gluer-view--attack" : " gluer-view--support")}
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
            {tab === "presets"
              ? "presets de tropas"
              : attack
              ? `${attack.label} → ${attack.targetX}|${attack.targetY}`
              : "Clica num ataque para começar"}
          </span>
        </div>
        {queue.length > 0 && (
          <span className="gluer-queue-badge">{queue.length}</span>
        )}
      </div>

      <div className="cfg-body snipe-body">

        {/* Tab bar — main gluer flow vs. troop presets */}
        <div className="cfg-section" style={{ paddingBottom: 0 }}>
          <div style={{ display: "flex", gap: 4 }}>
            <button className={`btn${tab === "main" ? " btn-save" : " btn-ghost"}`}
              onClick={() => setTab("main")}>🧲 Gluer</button>
            <button className={`btn${tab === "presets" ? " btn-save" : " btn-ghost"}`}
              onClick={() => setTab("presets")}>⚙ Presets</button>
          </div>
        </div>

        {tab === "presets" && (
          <>
            <div className="cfg-section">
              <div className="section-label">Presets guardados</div>
              {presets.length === 0 && (
                <div className="state-msg" style={{ paddingTop: 10, paddingBottom: 10 }}>
                  Nenhum preset criado ainda.
                </div>
              )}
              {presets.map(p => {
                const minCount = Object.values(p.minTroops).filter(v => v > 0).length;
                return (
                  <div key={p.id} className="gluer-queue-line1" style={{ padding: "5px 14px", borderBottom: "1px solid var(--n100)" }}>
                    <div className="gluer-queue-info">
                      <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--n900)" }}>{p.name}</span>
                      <span className="gluer-cfg-note gluer-cfg-note--inline">
                        &nbsp;·&nbsp;{p.visibleUnits.length || UNIT_ORDER_DISPLAY.length} unidades
                        {minCount > 0 ? ` · ${minCount} mínimo${minCount !== 1 ? "s" : ""}` : ""}
                      </span>
                    </div>
                    <button className="btn btn-ghost gluer-quickbtn" onClick={() => startEditPreset(p)}>✎</button>
                    <button className="btn btn-ghost gluer-quickbtn" style={{ color: "var(--r500)" }}
                      onClick={() => deletePreset(p.id)}>✕</button>
                  </div>
                );
              })}
            </div>

            <div className="cfg-section">
              <div className="section-label">{editingPresetId ? "Editar preset" : "Novo preset"}</div>
              <div style={{ padding: "6px 14px" }}>
                <input className="input" placeholder='Nome (ex: "Quick Recon")'
                  value={formName} onChange={e => setFormName(e.target.value)} />
              </div>
              <div className="gluer-cfg-note" style={{ padding: "0 14px 4px" }}>
                Clica no ícone para incluir/excluir a unidade; o número define o mínimo de tropas exigido (0 = sem mínimo).
              </div>
              <div className="snipe-units" style={{ padding: "4px 14px 8px" }}>
                {UNIT_ORDER_DISPLAY.map(unit => (
                  <div key={unit} className={`snipe-unitbox${formVisible.has(unit) ? " snipe-unitbox--on" : ""}`}>
                    <img src={unitIconUrl(unit)} alt={unit} className="snipe-unit-icon"
                      onClick={() => setFormVisible(prev => {
                        const next = new Set(prev);
                        if (next.has(unit)) next.delete(unit); else next.add(unit);
                        return next;
                      })} />
                    <input
                      className="snipe-unit-input"
                      type="number" min={0} step={1}
                      value={formMinDrafts[unit] ?? "0"}
                      onChange={e => setFormMinDrafts(p => ({ ...p, [unit]: e.target.value }))}
                      onBlur={() => {
                        const n = parseInt(formMinDrafts[unit] ?? "0", 10);
                        setFormMinDrafts(p => ({ ...p, [unit]: String(Number.isFinite(n) && n >= 0 ? n : 0) }));
                      }}
                    />
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: 8, padding: "6px 14px" }}>
                <button className="btn btn-save btn-save--dirty" disabled={!formName.trim()} onClick={savePresetForm}>
                  {editingPresetId ? "Guardar alterações" : "Criar preset"}
                </button>
                {editingPresetId && (
                  <button className="btn btn-ghost" onClick={resetPresetForm}>Cancelar</button>
                )}
              </div>
            </div>
          </>
        )}

        {tab === "main" && (
        <>
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
                  if (attackTimeOverride === null && attack)
                    setAttackTimeDraft(fmtDate(attack.arrivalMs));
                }}
              />
              <div className="gluer-nudge-box">
                <button className="btn btn-ghost gluer-nudge-btn"
                  title={`−${nudgeMs} ms`}
                  onClick={() => {
                    const next = effectiveArrivalMs - nudgeMs;
                    setAttackTimeOverride(next);
                    setAttackTimeDraft(fmtDate(next));
                  }}>−</button>
                <input
                  className="input gluer-nudge-input"
                  type="number" min={1} step={1}
                  value={nudgeDraft}
                  title="Ajuste em ms"
                  onChange={e => {
                    setNudgeDraft(e.target.value);
                    const n = parseInt(e.target.value, 10);
                    if (Number.isFinite(n) && n > 0) setNudgeMs(n);
                  }}
                  onBlur={() => {
                    const n = parseInt(nudgeDraft, 10);
                    if (!Number.isFinite(n) || n <= 0) setNudgeDraft(String(nudgeMs));
                  }}
                />
                <span style={{ fontSize: 10, color: "var(--n400)" }}>ms</span>
                <button className="btn btn-ghost gluer-nudge-btn"
                  title={`+${nudgeMs} ms`}
                  onClick={() => {
                    const next = effectiveArrivalMs + nudgeMs;
                    setAttackTimeOverride(next);
                    setAttackTimeDraft(fmtDate(next));
                  }}>+</button>
              </div>
            </div>
            <div className="gluer-attack-row">
              <span className="gluer-attack-coord">{attack.targetX}|{attack.targetY}</span>
              <span
                className={`snipe-countdown${(effectiveArrivalMs - now) < 0 ? " snipe-countdown--past" : ""}`}
                style={{ marginLeft: "auto", fontSize: 13, minWidth: 0 }}>
                {fmtCountdownShort(effectiveArrivalMs - now)}
              </span>
            </div>
          </div>
        )}

        {/* Speed + type */}
        <div className="cfg-section">
          <div className="section-label">
            Configuração
            <span className="snipe-candidate-meta">
              &nbsp;·&nbsp;Jogo {gameSpeed}x · Tropa {unitSpeed}x
            </span>
          </div>
          <div className="gluer-cfg-row" style={{ padding: "6px 14px" }}>
            <div className="gluer-type-toggle">
              {(["Attack", "Support"] as const).map(t => (
                <button key={t} type="button"
                  className={`gluer-type-btn${commandType === t ? " gluer-type-btn--active" : ""}`}
                  data-type={t}
                  title={t === "Attack" ? "Ataque" : "Apoio"}
                  onClick={() => setCommandType(t)}>
                  <img src={CMD_ICON[t]} alt={t} />
                </button>
              ))}
            </div>
            <label className="snipe-speed-label">
              Sígilia %
              <input className="input snipe-speed-input" type="number" step={1} min={0} max={100}
                value={sigilDraft}
                onChange={e => { setSigilDraft(e.target.value); const n = parseFloat(e.target.value); if (Number.isFinite(n) && n >= 0) setSigil(n); }}
                onBlur={() => { const n = parseFloat(sigilDraft); if (!Number.isFinite(n) || n < 0) setSigilDraft(String(sigil)); }}
              />
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--n500)", cursor: "pointer", userSelect: "none", flex: "none" }}>
              <input type="checkbox" checked={ntEnabled}
                onChange={e => {
                  const checked = e.target.checked;
                  setNtEnabled(checked);
                  const s = loadGluerSettings();
                  if (!checked) {
                    setNtTemplate("noNT");
                    s.ntTemplate = "noNT";
                  } else if (ntTemplate === "noNT") {
                    const first = NT_OPTIONS.find(([val]) => val !== "noNT")![0];
                    setNtTemplate(first);
                    s.ntTemplate = first;
                  }
                  saveGluerSettings(s);
                }} />
              NT
            </label>
            {ntEnabled && (
              <select className="input" style={{ flex: 1, fontSize: 12 }}
                value={ntTemplate}
                onChange={e => {
                  setNtTemplate(e.target.value);
                  const s = loadGluerSettings();
                  s.ntTemplate = e.target.value;
                  saveGluerSettings(s);
                }}>
                {NT_OPTIONS.filter(([val]) => val !== "noNT").map(([val, lbl]) => (
                  <option key={val} value={val}>{lbl}</option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Unit filter */}
        <div className="cfg-section">
          <div className="section-label" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingRight: 14 }}>
            <span>Tropas a considerar</span>
            <span style={{ display: "flex", gap: 4 }}>
              <button className="btn btn-ghost gluer-quickbtn"
                onClick={() => { setActivePresetId(null); setMinTroops({}); setEnabledUnits(new Set(UNIT_ORDER_SLOW_TO_FAST)); }}>
                Todas
              </button>
              <button className="btn btn-ghost gluer-quickbtn"
                onClick={() => { setActivePresetId(null); setMinTroops({}); setEnabledUnits(new Set()); }}>
                Nenhuma
              </button>
            </span>
          </div>
          {presets.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, padding: "0 14px 4px" }}>
              {presets.map(p => (
                <button key={p.id}
                  className={`btn btn-ghost gluer-quickbtn${activePresetId === p.id ? " gluer-preset-btn--active" : ""}`}
                  title={Object.keys(p.minTroops).length ? "Também filtra aldeias abaixo dos mínimos definidos" : undefined}
                  onClick={() => applyPreset(p)}>
                  {p.name}
                </button>
              ))}
            </div>
          )}
          {troops.length > 0 && (
            <div className="gluer-cfg-note" style={{ padding: "0 14px 4px" }}>
              Ajustado automaticamente às unidades deste mundo e às tropas carregadas.
            </div>
          )}
          <div className="gluer-unit-filter">
            {UNIT_ORDER_DISPLAY.map(unit => {
              const on = enabledUnits.has(unit);
              return (
                <div key={unit}
                  className={`gluer-filter-box${on ? " gluer-filter-box--on" : ""}`}
                  title={unit}
                  onClick={() => {
                    setActivePresetId(null);
                    setEnabledUnits(prev => {
                      const next = new Set(prev);
                      if (next.has(unit)) next.delete(unit); else next.add(unit);
                      return next;
                    });
                  }}>
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
            <button className="btn btn-save btn-save--dirty gluer-reload-btn"
              onClick={loadTroops} disabled={loadingTrp}>
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
              {candidates.length > 0 && (
                <div style={{ fontSize: 11, color: "var(--n300)", padding: "2px 0 6px", textAlign: "center" }}>
                  Clica num ícone ou "Selec. tudo" para selecionar tropas
                </div>
              )}
              {candidates.map(cand => {
                const key = `${cand.src.coord.x}|${cand.src.coord.y}`;
                return (
                  <GluerCandidateCard
                    key={key}
                    cand={cand}
                    target={target}
                    tgtVillageId={attack?.villageId ?? null}
                    arrivalMs={effectiveArrivalMs}
                    commandType={commandType}
                    onQueue={addToQueue}
                    queued={queuedSources.has(key)}
                    enabledUnits={enabledUnits}
                    committed={committed.get(key) ?? {}}
                    sigilPct={sigil}
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
              {queue.map((e, i) => {
                const diff      = e.sendMs - now;
                const sent      = diff <= 0;
                const etaState  = sent ? "sent" : diff > 3_600_000 ? "ok" : diff > 600_000 ? "soon" : "urgent";
                const unitList  = UNIT_ORDER_DISPLAY.filter(u => (e.units[u] ?? 0) > 0);
                return (
                  <div key={e.id} className="gluer-queue-row gluer-queue-row--stack">
                    <div className="gluer-queue-line1">
                      <div className="gluer-queue-info">
                        <span className="gluer-queue-idx">#{i+1}</span>
                        <img src={unitIconUrl(e.slowestUnit)} alt={e.slowestUnit} className="gluer-unit-icon" />
                        <span className="gluer-queue-src">{e.source}</span>
                        <span style={{ color: "var(--n300)", fontSize: 11 }}>→</span>
                        {e.tgtVillageId && e.srcVillageId ? (
                          <a
                            className="gluer-queue-tgt"
                            href={`${location.origin}/game.php?village=${e.srcVillageId}&screen=info_village&id=${e.tgtVillageId}`}
                            target="_blank" rel="noopener noreferrer"
                            style={{ color: "var(--b500)", textDecoration: "underline" }}
                          >{e.target}</a>
                        ) : (
                          <span className="gluer-queue-tgt">{e.target}</span>
                        )}
                      </div>
                      <span className={`gluer-eta-badge gluer-eta-badge--${etaState}`} title={fmtPtDate(e.sendMs)}>
                        {sent ? "enviado" : fmtCountdown(diff)}
                      </span>
                      <button
                        className="btn btn-ghost"
                        style={{ flex: "none", padding: "1px 6px", fontSize: 11, color: "var(--r500)" }}
                        onClick={() => removeFromQueue(e.id)}
                      >✕</button>
                    </div>
                    {unitList.length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, paddingLeft: 24, paddingBottom: 4 }}>
                        {unitList.map(u => (
                          <span key={u} style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
                            <img src={unitIconUrl(u)} alt={u} style={{ width: 16, height: 16 }} />
                            <span style={{ fontSize: 11, color: "var(--n200)" }}>{e.units[u]}</span>
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
        </>
        )}

      </div>

      {/* Footer */}
      <div className="cfg-footer" style={{ gap: 6, flexWrap: "wrap" }}>
        <button className="btn btn-ghost" onClick={copyStrings}
          disabled={!queue.length} style={{ flex: 1 }}>
          {copied ? "✓ Copiado" : "📋 Copiar BB"}
        </button>
        <button className="btn btn-ghost" onClick={openKumin}
          disabled={!queue.length} style={{ flex: 1 }}>
          📜 Kumin
        </button>
        <button className="btn btn-ghost" onClick={sendToAutosender}
          disabled={!queue.length} style={{ flex: 1 }}
          title="Enviar para Auto Sender (xBot)">
          🚀 Autosend
        </button>
      </div>
    </div>
  );
}

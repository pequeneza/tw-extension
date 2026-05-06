/**
 * SnipeView — in-overlay panel for the Gap Snipe Scheduler.
 *
 * Two tabs:
 *   Auto   — reads Nobre-labelled incomings from DOM (fetches coords via info_command)
 *   Manual — user enters target coords + attack timings for teammate support
 *
 * The place-page automator stays in tw_snipe_scheduler.user.js.
 * Manual timings persist in localStorage under STORAGE_KEY_MANUAL.
 */

import React, {
  useCallback, useEffect, useRef, useState,
} from "react";

/* ─── Constants ───────────────────────────────────────────────────────────── */
const STORAGE_KEY_PLAN   = "tw_gap_snipe_plan_v12";
const STORAGE_KEY_MANUAL = "tw_snipe_manual_timings_v1";
const SNIPE_QUEUE_KEY    = "tw_snipe_queue_v1";

const UNIT_MIN_PER_FIELD: Record<string, number> = {
  spear: 18, sword: 22, axe: 18, archer: 18, spy: 9,
  light: 10, marcher: 10, heavy: 11, ram: 30, catapult: 30,
  snob: 35, knight: 10,
};

const UNIT_ORDER_FAST_TO_SLOW: string[] = [
  "spy", "light", "knight", "marcher", "heavy",
  "spear", "axe", "archer", "sword", "ram", "catapult", "snob",
].filter((u) => u in UNIT_MIN_PER_FIELD);

// Standard TW display order — matches every game screen (training, overview, rally point)
const UNIT_ORDER_DISPLAY: string[] = [
  "spear", "sword", "axe", "archer", "spy", "light", "marcher",
  "heavy", "ram", "catapult", "snob", "knight",
];

/* ─── Types ───────────────────────────────────────────────────────────────── */
interface Incoming { arrivalMs: number; label: string; target: Coord; }
interface Coord    { x: number; y: number; }

interface VillageTroops {
  villageId: string | null;
  coord: Coord;
  troops: Record<string, number>;
}

interface Candidate {
  src: VillageTroops;
  chosenSlowestUnit: string;
  sendMs: number;
  arrivalMs: number;
  allowedUnits: string[];
}

interface TimingRow { id: string; dt: string; ms: number; }

interface ManualState {
  target: string;
  timings: Array<{ dt: string; ms: number }>;
}

interface SnipeQueueEntry {
  id: string;
  label: string;
  source: string;
  sourceVillageId: string | null;
  target: Coord;
  chosenSlowestUnit: string;
  units: Record<string, number>;
  sendMs: number;
  arrivalMs: number;
  midGapArrivalMs: number;
}

type Tab = "auto" | "manual";

/* ─── Helpers ─────────────────────────────────────────────────────────────── */
function pad2(n: number) { return String(n).padStart(2, "0"); }
function pad3(n: number) { return String(n).padStart(3, "0"); }

function fmtDateMs(ms: number) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} `
       + `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}.${pad3(d.getMilliseconds())}`;
}

function fmtCountdown(diffMs: number) {
  const sign = diffMs < 0 ? "-" : "";
  const abs  = Math.abs(diffMs);
  const ms   = Math.floor(abs % 1000);
  const s    = Math.floor(abs / 1000);
  const hh   = Math.floor(s / 3600);
  const mm   = Math.floor((s % 3600) / 60);
  const ss   = s % 60;
  return `${sign}${pad2(hh)}:${pad2(mm)}:${pad2(ss)}.${pad3(ms)}`;
}

function toDatetimeLocalMs(ms: number) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
       + `T${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
       + `.${pad3(d.getMilliseconds())}`;
}

function parseCoord(str: string): Coord | null {
  const m = str.match(/(\d{3})\|(\d{3})/);
  return m ? { x: +m[1]!, y: +m[2]! } : null;
}

function euclidean(a: Coord, b: Coord) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function travelMs(unit: string, from: Coord, to: Coord, speedFactor: number) {
  const mpf = UNIT_MIN_PER_FIELD[unit] ?? UNIT_MIN_PER_FIELD["spear"]!;
  return mpf * euclidean(from, to) * speedFactor * 60 * 1000;
}

function clampInt(n: number, lo: number, hi: number) {
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, Math.trunc(n)));
}

function getServerNowMs(): number {
  try {
    const w = window as Window & { Timing?: { getCurrentServerTime?: () => number } };
    if (w.Timing?.getCurrentServerTime) return w.Timing.getCurrentServerTime();
  } catch { /* */ }
  return Date.now();
}

function unitIconUrl(unit: string) {
  return `https://dspt.innogamescdn.com/asset/b2fb8d33/graphic/unit/unit_${unit}.webp`;
}

function makeId() {
  return `${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function loadSnipeQueue(): SnipeQueueEntry[] {
  try { return JSON.parse(localStorage.getItem(SNIPE_QUEUE_KEY) ?? "[]") ?? []; }
  catch { return []; }
}
function saveSnipeQueue(q: SnipeQueueEntry[]) { localStorage.setItem(SNIPE_QUEUE_KEY, JSON.stringify(q)); }

function toSnipeBBString(e: SnipeQueueEntry, idx: number): string {
  const d    = new Date(e.arrivalMs);
  const date = `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
  const time = `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}.${pad3(d.getMilliseconds())}`;
  const send = fmtDateMs(e.sendMs).split(" ")[1];
  return `#${idx+1} [b][color=#ff0000]${e.label}[/color][/b] | ${date} [b]${time}[/b] | ${e.source} → ${e.target.x}|${e.target.y} | envio: ${send}`;
}

/**
 * Parse a block of pasted text into {dt, ms} timing rows.
 *
 * Recognised formats (PT locale + plain):
 *   hoje às HH:MM:SS[.mmm]          → today
 *   amanhã às HH:MM:SS[.mmm]        → tomorrow
 *   DD.MM. às HH:MM:SS[.mmm]        → specific date (current year assumed)
 *   HH:MM:SS[.mmm]                  → today (bare time)
 *
 * Returns an array of { dt: string, ms: number } — ready to create TimingRows.
 */
function parsePastedTimings(text: string): Array<{ dt: string; ms: number }> {
  const now   = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // Normalise common unicode spaces and dashes
  const norm = text
    .replace(/\u00a0/g, " ")   // non-breaking space
    .replace(/às/g, "as");      // normalise PT preposition

  const results: Array<{ dt: string; ms: number }> = [];

  // Regex: optional prefix (hoje/amanhã/DD.MM.), optional "as", HH:MM:SS[.mmm]
  const re =
    /(?:(hoje|amanha|amanh[aã])|(\d{1,2})\.(\d{1,2})\.)?\s*(?:as\s+)?(\d{1,2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?/gi;

  let m: RegExpExecArray | null;
  while ((m = re.exec(norm)) !== null) {
    const [, todayKw, dayStr, monStr, hh, mm, ss, msStr] = m;

    const hours   = parseInt(hh!,  10);
    const minutes = parseInt(mm!,  10);
    const seconds = parseInt(ss!,  10);
    const millis  = msStr ? parseInt(msStr.padEnd(3, "0"), 10) : 0;

    let base: Date;
    if (todayKw) {
      // "hoje" or "amanhã/amanha"
      const isT = /hoje/i.test(todayKw);
      base = new Date(today);
      if (!isT) base.setDate(base.getDate() + 1);
    } else if (dayStr && monStr) {
      // DD.MM.
      const day   = parseInt(dayStr, 10);
      const month = parseInt(monStr, 10) - 1; // 0-based
      base = new Date(now.getFullYear(), month, day);
      // If the resulting date is in the past by more than 12h, assume next year
      if (base.getTime() < now.getTime() - 12 * 3_600_000) {
        base.setFullYear(base.getFullYear() + 1);
      }
    } else {
      // Bare HH:MM:SS — assume today, roll to tomorrow if already past
      base = new Date(today);
      const candidate = new Date(today.getFullYear(), today.getMonth(), today.getDate(), hours, minutes, seconds, millis);
      if (candidate.getTime() < now.getTime() - 2_000) {
        base.setDate(base.getDate() + 1);
      }
    }

    base.setHours(hours, minutes, seconds, 0);
    const ms = millis;

    results.push({ dt: toDatetimeLocalMs(base.getTime()), ms });
  }

  // Deduplicate by dt+ms
  const seen = new Set<string>();
  return results.filter(({ dt, ms }) => {
    const key = `${dt}+${ms}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}


/* ─── localStorage helpers ────────────────────────────────────────────────── */
function loadManualState(): ManualState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_MANUAL);
    if (!raw) return { target: "", timings: [] };
    return JSON.parse(raw) as ManualState;
  } catch { return { target: "", timings: [] }; }
}

function saveManualState(s: ManualState) {
  localStorage.setItem(STORAGE_KEY_MANUAL, JSON.stringify(s));
}

/* ─── DOM readers ─────────────────────────────────────────────────────────── */
function readCurrentVillageId(): string | null {
  const el = document.querySelector<HTMLElement>("#commands_incomings");
  const dv = el?.getAttribute("data-village");
  if (dv && /^\d+$/.test(dv)) return dv;
  const m = window.location.search.match(/[?&]village=(\d+)/);
  if (m) return m[1]!;
  const gd = (window as Window & { game_data?: { village?: { id?: number } } }).game_data?.village?.id;
  if (gd) return String(gd);
  return null;
}

function getRowLabel(tr: HTMLElement): string {
  const ql = tr.querySelector<HTMLElement>(".quickedit-label");
  if (ql) return ql.textContent?.trim() ?? "";
  return tr.querySelector("td")?.textContent?.trim() ?? "";
}

function getRowTargetCoord(tr: HTMLElement): Coord | null {
  let found: Coord | null = null;
  tr.querySelectorAll<HTMLElement>("b.nowrap").forEach((el) => {
    if (found) return;
    const c = parseCoord(el.textContent ?? "");
    if (c) found = c;
  });
  if (found) return found;
  tr.querySelectorAll<HTMLAnchorElement>("a[href*='info_village']").forEach((a) => {
    if (found) return;
    const c = parseCoord(a.textContent ?? "") ?? parseCoord(a.getAttribute("href") ?? "");
    if (c) found = c;
  });
  return found;
}

async function fetchCoordFromInfoCommand(commandId: string, villageId: string): Promise<Coord | null> {
  const url = `${location.origin}/game.php?village=${villageId}&screen=info_command&id=${commandId}&type=other`;
  const html = await fetch(url, { credentials: "include" }).then((r) => r.text());
  const doc = new DOMParser().parseFromString(html, "text/html");
  let coord: Coord | null = null;
  doc.querySelectorAll<HTMLElement>("b.nowrap").forEach((el) => {
    if (!coord) coord = parseCoord(el.textContent ?? "");
  });
  if (!coord) {
    doc.querySelectorAll<HTMLAnchorElement>("a[href*='info_village']").forEach((a) => {
      if (!coord) coord = parseCoord(a.textContent ?? "") ?? parseCoord(a.getAttribute("href") ?? "");
    });
  }
  return coord;
}

async function readIncomingsFromDOM(): Promise<Incoming[]> {
  const rows: HTMLElement[] = [];
  const cmdWrap  = document.querySelector("#commands_incomings");
  const incTable = document.querySelector("#incomings_table");

  if (cmdWrap) {
    cmdWrap.querySelectorAll<HTMLElement>("tr.command-row").forEach((tr) => rows.push(tr));
  } else if (incTable) {
    const nowrap = incTable.querySelectorAll<HTMLElement>("tr.nowrap");
    const source = nowrap.length > 0 ? nowrap : incTable.querySelectorAll<HTMLElement>("tbody tr");
    source.forEach((tr) => rows.push(tr));
  }

  const villageId = readCurrentVillageId();
  const list: Incoming[] = [];

  for (const tr of rows) {
    const cmdType = (
      tr.getAttribute("data-command-type") ??
      tr.querySelector("[data-command-type]")?.getAttribute("data-command-type") ?? ""
    ).toLowerCase();
    if (cmdType === "support") continue;

    const label = getRowLabel(tr);
    if (!label.toLowerCase().includes("nobre")) continue;

    const endSpan = tr.querySelector<HTMLElement>("span[data-endtime]");
    const endSec  = parseInt(endSpan?.getAttribute("data-endtime") ?? "", 10);
    if (!endSec) continue;

    const greyEl = tr.querySelector<HTMLElement>("span.grey.small");
    const ms     = clampInt(parseInt(greyEl?.textContent?.trim() ?? "0", 10), 0, 999);

    let target = getRowTargetCoord(tr);

    if (!target && villageId) {
      const commandId =
        tr.querySelector<HTMLElement>("span.quickedit[data-id]")?.getAttribute("data-id") ??
        (() => {
          const href = tr.querySelector<HTMLAnchorElement>("a[href*='info_command']")?.getAttribute("href") ?? "";
          const match = href.match(/[?&]id=(\d+)/);
          return match ? match[1] ?? null : null;
        })();
      if (commandId) {
        target = await fetchCoordFromInfoCommand(commandId, villageId);
      }
    }

    if (!target) continue;
    list.push({ arrivalMs: endSec * 1000 + ms, label, target });
  }

  list.sort((a, b) => a.arrivalMs - b.arrivalMs);
  return list;
}

async function fetchOwnHomeTroops(villageId: string): Promise<VillageTroops[]> {
  const url = `${location.origin}/game.php?village=${encodeURIComponent(villageId)}&screen=overview_villages&mode=units&type=own_home`;
  const html = await fetch(url, { credentials: "include" }).then((r) => r.text());
  const doc  = new DOMParser().parseFromString(html, "text/html");

  const table = [...doc.querySelectorAll<HTMLTableElement>("table.vis")]
    .find((t) => t.querySelector('thead img[src*="/graphic/unit/unit_"]'));
  if (!table) return [];

  const headerUnits: string[] = [];
  table.querySelectorAll("thead th").forEach((th) => {
    const img = th.querySelector<HTMLImageElement>("img");
    if (!img) return;
    const m = (img.getAttribute("src") ?? "").match(/\/unit_([a-z0-9_]+)\./i);
    if (!m) return;
    const raw = m[1]!.toLowerCase();
    if (raw === "militia" || !(raw in UNIT_MIN_PER_FIELD)) return;
    headerUnits.push(raw);
  });

  const out: VillageTroops[] = [];
  doc.querySelectorAll<HTMLTableRowElement>("table.vis tbody tr").forEach((tr) => {
    const label   = tr.querySelector<HTMLElement>(".quickedit-label");
    const coord   = parseCoord(label?.textContent ?? tr.textContent ?? "");
    if (!coord) return;
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
    out.push({ villageId: vId, coord, troops });
  });

  return out;
}

/* ─── Candidate computation ───────────────────────────────────────────────── */
function computeCandidates(
  incomings: Incoming[],
  gapIdx: number,
  troops: VillageTroops[],
  target: Coord,
  speedFactor: number,
): Candidate[] {
  const a = incomings[gapIdx];
  const b = incomings[gapIdx + 1];
  if (!a || !b) return [];

  const afterMs  = a.arrivalMs;
  const beforeMs = b.arrivalMs;
  const midMs    = Math.floor((afterMs + beforeMs) / 2);
  const nowMs    = getServerNowMs();
  const out: Candidate[] = [];

  for (const src of troops) {
    let chosen: { unit: string; sendMs: number; arrivalMs: number } | null = null;
    for (const unit of [...UNIT_ORDER_FAST_TO_SLOW].reverse()) {
      const avail = src.troops[unit] ?? 0;
      if (!avail) continue;
      const tMs          = travelMs(unit, src.coord, target, speedFactor);
      const earliestSend = (afterMs  + 1) - tMs;
      const latestSend   = (beforeMs - 1) - tMs;
      if (earliestSend > latestSend) continue;
      if (latestSend < nowMs) continue;
      const sendForMid = midMs - tMs;
      const sendMs     = Math.min(latestSend, Math.max(earliestSend, sendForMid));
      const arrMs      = sendMs + tMs;
      if (!(arrMs > afterMs && arrMs < beforeMs)) continue;
      if (sendMs < nowMs) continue;
      chosen = { unit, sendMs, arrivalMs: arrMs };
      break;
    }
    if (!chosen) continue;
    const chosenMpf    = UNIT_MIN_PER_FIELD[chosen.unit]!;
    const allowedUnits = UNIT_ORDER_FAST_TO_SLOW
      .filter((u) => UNIT_MIN_PER_FIELD[u]! <= chosenMpf)
      .filter((u) => (src.troops[u] ?? 0) > 0);
    out.push({ src, chosenSlowestUnit: chosen.unit, sendMs: chosen.sendMs, arrivalMs: chosen.arrivalMs, allowedUnits });
  }

  out.sort((x, y) => x.sendMs - y.sendMs);
  return out.slice(0, 15);
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

/* ─── CandidateCard ───────────────────────────────────────────────────────── */
function CandidateCard({ candidate, target, midGapArrivalMs, gapLabel, onQueue, queued }: {
  candidate: Candidate; target: Coord; midGapArrivalMs: number;
  gapLabel: string;
  onQueue: (entry: SnipeQueueEntry) => void;
  queued: boolean;
}) {
  const [amounts, setAmounts] = useState<Record<string, number>>(() =>
    Object.fromEntries(candidate.allowedUnits.map((u) => [u, 0]))
  );
  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(candidate.allowedUnits.map((u) => [u, "0"]))
  );
  const [timerActive, setTimerActive] = useState(false);
  const { display, past } = useCountdown(candidate.sendMs, timerActive);

  useEffect(() => {
    setAmounts(Object.fromEntries(candidate.allowedUnits.map((u) => [u, 0])));
    setDrafts(Object.fromEntries(candidate.allowedUnits.map((u) => [u, "0"])));
    setTimerActive(false);
  }, [candidate.src.villageId, candidate.sendMs]);

  const toggleUnit = useCallback((unit: string) => {
    const next = (amounts[unit] ?? 0) > 0 ? 0 : (candidate.src.troops[unit] ?? 0);
    setAmounts((p) => ({ ...p, [unit]: next }));
    setDrafts((p) => ({ ...p, [unit]: String(next) }));
  }, [candidate, amounts]);

  const selectAll = useCallback(() => {
    const next = Object.fromEntries(candidate.allowedUnits.map((u) => [u, candidate.src.troops[u] ?? 0]));
    setAmounts(next);
    setDrafts(Object.fromEntries(Object.entries(next).map(([k, v]) => [k, String(v)])));
  }, [candidate]);

  const openSupport = useCallback(() => {
    if (!candidate.src.villageId) { alert("Cannot open support: villageId missing."); return; }
    const units = Object.fromEntries(Object.entries(amounts).filter(([, v]) => v > 0));
    if (!Object.keys(units).length) { alert("Select at least one unit amount (> 0)."); return; }
    localStorage.setItem(STORAGE_KEY_PLAN, JSON.stringify({
      createdAt: Date.now(),
      sourceVillageId: candidate.src.villageId,
      target, unitsToSend: units, midGapArrivalMs,
    }));
    window.open(
      `${location.origin}/game.php?village=${encodeURIComponent(candidate.src.villageId!)}&screen=place`,
      "_blank", "noopener,noreferrer"
    );
  }, [candidate, amounts, target, midGapArrivalMs]);

  const hasSelection = Object.values(amounts).some((v) => v > 0);

  const handleQueue = useCallback(() => {
    const units = Object.fromEntries(Object.entries(amounts).filter(([, v]) => v > 0));
    if (!Object.keys(units).length) return;
    const { x, y } = candidate.src.coord;
    onQueue({
      id: makeId(),
      label: gapLabel || `Snipe ${fmtDateMs(candidate.arrivalMs).split(" ")[1]}`,
      source: `${x}|${y}`,
      sourceVillageId: candidate.src.villageId,
      target,
      chosenSlowestUnit: candidate.chosenSlowestUnit,
      units,
      sendMs: candidate.sendMs,
      arrivalMs: candidate.arrivalMs,
      midGapArrivalMs,
    });
    setAmounts(Object.fromEntries(candidate.allowedUnits.map((u) => [u, 0])));
    setDrafts(Object.fromEntries(candidate.allowedUnits.map((u) => [u, "0"])));
  }, [candidate, amounts, target, gapLabel, midGapArrivalMs, onQueue]);

  const allowedSet   = new Set(candidate.allowedUnits);
  // Render in standard TW display order, not in algorithmic fast-to-slow order
  const displayUnits = UNIT_ORDER_DISPLAY.filter(u => allowedSet.has(u));

  const { x, y } = candidate.src.coord;
  return (
    <div className="snipe-card">
      <div className="snipe-card-header">
        <span className="snipe-card-coord">{x}|{y}</span>
        <span className="snipe-card-meta">
          slowest: <strong>{candidate.chosenSlowestUnit}</strong>
          &nbsp;·&nbsp;send: <strong>{fmtDateMs(candidate.sendMs)}</strong>
        </span>
      </div>
      <div className="snipe-card-row">
        <button className="btn btn-ghost snipe-timer-btn" onClick={() => setTimerActive((t) => !t)}>
          {timerActive ? "Stop" : "Timer"}
        </button>
        {timerActive && (
          <span className={`snipe-countdown${past ? " snipe-countdown--past" : ""}`}>{display}</span>
        )}
        <button className="btn btn-ghost" onClick={selectAll}>Select all</button>
        <button className="btn btn-save btn-save--dirty" onClick={openSupport}>Open support</button>
        <button
          className={`btn${queued ? " btn-save btn-save--saved" : " btn-save btn-save--dirty"}`}
          onClick={handleQueue}
          disabled={past || !hasSelection}
        >🎯 Queue</button>
      </div>
      <div className="snipe-units">
        {displayUnits.map((unit) => {
          const avail = candidate.src.troops[unit] ?? 0;
          const val   = amounts[unit] ?? 0;
          return (
            <div key={unit} className={`snipe-unitbox${val > 0 ? " snipe-unitbox--on" : ""}`}>
              <img src={unitIconUrl(unit)} alt={unit} className="snipe-unit-icon"
                   onClick={() => toggleUnit(unit)} title={`Click to toggle all ${unit}`} />
              <div className="snipe-unit-avail">{avail}</div>
              <input
                className="snipe-unit-input"
                type="number" min={0} max={avail} step={1}
                value={drafts[unit] ?? String(val)}
                onChange={(e) => {
                  const raw = e.target.value;
                  setDrafts((p) => ({ ...p, [unit]: raw }));
                  const n = clampInt(parseInt(raw, 10), 0, avail);
                  if (Number.isFinite(n)) setAmounts((p) => ({ ...p, [unit]: n }));
                }}
                onBlur={() => {
                  const n = parseInt(drafts[unit] ?? "0", 10);
                  const clamped = Number.isFinite(n) ? clampInt(n, 0, avail) : val;
                  setAmounts((p) => ({ ...p, [unit]: clamped }));
                  setDrafts((p) => ({ ...p, [unit]: String(clamped) }));
                }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── GapPill ─────────────────────────────────────────────────────────────── */
function GapPill({ idx, label, afterMs, beforeMs, selected, onClick }: {
  idx: number; label: string; afterMs: number; beforeMs: number;
  selected: boolean; onClick: () => void;
}) {
  return (
    <button
      className={`snipe-gap-pill${selected ? " snipe-gap-pill--selected" : ""}`}
      onClick={onClick}
    >
      <span className="snipe-gap-label">{label || `Gap #${idx + 1}`}</span>
      <span className="snipe-gap-time">
        {fmtDateMs(afterMs).split(" ")[1]} → {fmtDateMs(beforeMs).split(" ")[1]}
      </span>
      <span className="snipe-gap-width">{((beforeMs - afterMs) / 1000).toFixed(1)}s</span>
    </button>
  );
}

/* ─── ManualTab ───────────────────────────────────────────────────────────── */
function ManualTab({ troops, loadingTroops, onLoadTroops, speedFactor, onQueue, queuedSources }: {
  troops: VillageTroops[];
  loadingTroops: boolean;
  onLoadTroops: () => void;
  speedFactor: number;
  onQueue: (entry: SnipeQueueEntry) => void;
  queuedSources: Set<string>;
}) {
  const saved = loadManualState();

  const [targetStr,    setTargetStr]    = useState(saved.target ?? "");
  const [rows,         setRows]         = useState<TimingRow[]>(() => {
    const t = saved.timings ?? [];
    if (!t.length) return [{ id: makeId(), dt: toDatetimeLocalMs(Date.now() + 3_600_000), ms: 0 }];
    return t.map((r) => ({ id: makeId(), dt: r.dt, ms: r.ms }));
  });
  const [incomings,    setIncomings]    = useState<Incoming[]>([]);
  const [gapIdx,       setGapIdx]       = useState(0);
  const [computed,     setComputed]     = useState(false);
  const [computeError, setComputeError] = useState<string | null>(null);

  // Persist to localStorage on any change (debounced)
  const persistRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (persistRef.current) clearTimeout(persistRef.current);
    persistRef.current = setTimeout(() => {
      saveManualState({ target: targetStr, timings: rows.map((r) => ({ dt: r.dt, ms: r.ms })) });
    }, 300);
    return () => { if (persistRef.current) clearTimeout(persistRef.current); };
  }, [targetStr, rows]);

  function addRow() {
    setRows((p) => [...p, { id: makeId(), dt: toDatetimeLocalMs(Date.now() + 3_600_000), ms: 0 }]);
    setComputed(false);
  }
  function delRow(id: string) {
    setRows((p) => p.filter((r) => r.id !== id));
    setComputed(false);
  }
  function setDt(id: string, dt: string) {
    setRows((p) => p.map((r) => r.id === id ? { ...r, dt } : r));
    setComputed(false);
  }
  function setMs(id: string, ms: number) {
    setRows((p) => p.map((r) => r.id === id ? { ...r, ms: clampInt(ms, 0, 999) } : r));
    setComputed(false);
  }

  const [pasteError, setPasteError] = useState<string | null>(null);

  async function handlePaste() {
    setPasteError(null);
    try {
      const text = await navigator.clipboard.readText();
      const parsed = parsePastedTimings(text);
      if (!parsed.length) {
        setPasteError("No recognisable timings found. Copy attack arrival times (e.g. 22:32:14 or hoje às 22:32:14).");
        return;
      }
      setRows((prev) => {
        const existing = new Set(prev.map((r) => `${r.dt}+${r.ms}`));
        const toAdd = parsed.filter((p) => !existing.has(`${p.dt}+${p.ms}`));
        if (!toAdd.length) {
          setPasteError("All pasted timings are already in the list.");
          return prev;
        }
        return [...prev, ...toAdd.map((p) => ({ id: makeId(), dt: p.dt, ms: p.ms }))];
      });
      setComputed(false);
    } catch {
      setPasteError("Clipboard access denied — please paste manually.");
    }
  }

  function compute() {
    setComputeError(null); setComputed(false);
    const target = parseCoord(targetStr);
    if (!target) { setComputeError("Invalid target coords — use format 451|601."); return; }
    const list: Incoming[] = [];
    for (const row of rows) {
      if (!row.dt) continue;
      const baseMs = new Date(row.dt).getTime();
      if (isNaN(baseMs)) continue;
      list.push({ arrivalMs: baseMs + (row.ms || 0), label: "", target });
    }
    list.sort((a, b) => a.arrivalMs - b.arrivalMs);
    if (list.length < 2) { setComputeError("Need at least 2 timings to form a gap."); return; }
    setIncomings(list);
    setGapIdx(0);
    setComputed(true);
    if (!troops.length && !loadingTroops) onLoadTroops();
  }

  const target     = parseCoord(targetStr);
  const gapCount   = computed ? Math.max(0, incomings.length - 1) : 0;
  const gapA       = incomings[gapIdx];
  const gapB       = incomings[gapIdx + 1];
  const midGapMs   = gapA && gapB ? Math.floor((gapA.arrivalMs + gapB.arrivalMs) / 2) : 0;
  const candidates = computed && target && gapA && gapB
    ? computeCandidates(incomings, gapIdx, troops, target, speedFactor)
    : [];

  return (
    <div>
      {/* Target */}
      <div className="cfg-section">
        <div className="section-label">Target village</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            className="input"
            type="text"
            placeholder="451|601"
            value={targetStr}
            style={{ width: 110, fontFamily: "monospace" }}
            onChange={(e) => { setTargetStr(e.target.value); setComputed(false); }}
          />
          <span style={{ fontSize: 11, color: "#6b7280" }}>village your teammate is nobling</span>
        </div>
      </div>

      {/* Timings */}
      <div className="cfg-section">
        <div className="section-label">
          Attack timings
          <span style={{ fontSize: 11, color: "#6b7280", fontWeight: 400, marginLeft: 8 }}>
            arrival time of each attack at the target
          </span>
        </div>
        {rows.map((row, idx) => (
          <div key={row.id} style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4 }}>
            <span style={{ fontSize: 11, color: "#6b7280", minWidth: 18 }}>{idx + 1}.</span>
            <input
              className="input"
              type="datetime-local"
              step="0.001"
              value={row.dt}
              style={{ fontFamily: "monospace", fontSize: 12 }}
              onChange={(e) => setDt(row.id, e.target.value)}
            />
            <span style={{ fontSize: 11, color: "#6b7280" }}>+ms:</span>
            <input
              className="input"
              type="number"
              min={0} max={999} step={1}
              value={row.ms}
              style={{ width: 52, fontSize: 12 }}
              onChange={(e) => setMs(row.id, parseInt(e.target.value, 10) || 0)}
            />
            <button
              className="btn btn-ghost"
              style={{ fontSize: 11, padding: "1px 6px", color: "#ef4444" }}
              onClick={() => delRow(row.id)}
              disabled={rows.length <= 1}
            >✕</button>
          </div>
        ))}
        <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
          <button className="btn btn-ghost" onClick={addRow}>+ Add timing</button>
          <button
            className="btn btn-ghost"
            title="Paste attack arrival times from clipboard. Supports plain HH:MM:SS or PT locale (hoje às HH:MM:SS, amanhã às …, DD.MM. às …)"
            onClick={handlePaste}
          >📋 Paste timings</button>
          <button
            className="btn btn-ghost"
            style={{ color: "#ef4444" }}
            onClick={() => {
              setRows([{ id: makeId(), dt: toDatetimeLocalMs(Date.now() + 3_600_000), ms: 0 }]);
              setComputed(false); setComputeError(null); setPasteError(null);
            }}
          >Clear all</button>
        </div>
        {pasteError && (
          <div className="snipe-error" style={{ marginTop: 4, fontSize: 11 }}>{pasteError}</div>
        )}
      </div>

      {/* Compute */}
      <div className="cfg-section">
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button className="btn btn-save btn-save--dirty" onClick={compute} disabled={loadingTroops}>
            Compute gaps
          </button>
          {!troops.length && !loadingTroops && (
            <button className="btn btn-ghost" onClick={onLoadTroops}>Load troops first</button>
          )}
        </div>
        {computeError && (
          <div className="snipe-error" style={{ marginTop: 6 }}>{computeError}</div>
        )}
      </div>

      {/* Gap pills */}
      {computed && gapCount > 0 && (
        <div className="cfg-section">
          <div className="section-label">Gaps ({gapCount})</div>
          <div className="snipe-gap-list">
            {incomings.slice(0, -1).map((inc, i) => (
              <GapPill
                key={i} idx={i} label={`Gap #${i + 1}`}
                afterMs={inc.arrivalMs}
                beforeMs={incomings[i + 1]!.arrivalMs}
                selected={gapIdx === i}
                onClick={() => setGapIdx(i)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Candidates */}
      {computed && target && gapA && gapB && (
        <div className="cfg-section">
          <div className="section-label">
            Gap #{gapIdx + 1} candidates
            {candidates.length > 0 && (
              <span className="snipe-candidate-meta">
                &nbsp;·&nbsp;mid-gap: {fmtDateMs(midGapMs).split(" ")[1]}
                &nbsp;·&nbsp;{candidates.length} village{candidates.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>
          {troops.length === 0 && (
            <div className="state-msg">Press "Load troops" to compute candidates.</div>
          )}
          {troops.length > 0 && candidates.length === 0 && (
            <div className="state-msg">No feasible candidates for this gap.</div>
          )}
          {candidates.map((c, i) => {
            const srcKey = `${c.src.coord.x}|${c.src.coord.y}`;
            return (
              <CandidateCard
                key={`${c.src.villageId ?? i}-${c.sendMs}`}
                candidate={c} target={target} midGapArrivalMs={midGapMs}
                gapLabel={`Gap #${gapIdx + 1}`}
                onQueue={onQueue}
                queued={queuedSources.has(srcKey)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─── SnipeView ───────────────────────────────────────────────────────────── */
export function SnipeView({ visible, onBack }: {
  visible: boolean; onBack: () => void;
}) {
  const [tab, setTab] = useState<Tab>("auto");

  const [gameSpeed,      setGameSpeed]      = useState(1.4);
  const [unitSpeed,      setUnitSpeed]      = useState(0.75);
  const [gameSpeedDraft, setGameSpeedDraft] = useState("1.4");
  const [unitSpeedDraft, setUnitSpeedDraft] = useState("0.75");
  const [sigil,          setSigil]          = useState(0);
  const [sigilDraft,     setSigilDraft]     = useState("0");

  // Troops shared between both tabs
  const [troops,        setTroops]        = useState<VillageTroops[]>([]);
  const [loadingTroops, setLoadingTroops] = useState(false);
  const [troopsError,   setTroopsError]   = useState<string | null>(null);

  // Auto tab state
  const [autoError,  setAutoError]  = useState<string | null>(null);
  const [incomings,  setIncomings]  = useState<Incoming[]>([]);
  const [gapIdx,     setGapIdx]     = useState(0);

  // Snipe queue
  const [snipeQueue, setSnipeQueue] = useState<SnipeQueueEntry[]>(() => loadSnipeQueue());
  const [bbCopied,   setBbCopied]   = useState(false);

  function addToSnipeQueue(entry: SnipeQueueEntry) {
    const next = [...snipeQueue, entry];
    setSnipeQueue(next);
    saveSnipeQueue(next);
  }
  function removeFromSnipeQueue(id: string) {
    const next = snipeQueue.filter((e) => e.id !== id);
    setSnipeQueue(next);
    saveSnipeQueue(next);
  }
  function clearSnipeQueue() {
    setSnipeQueue([]);
    saveSnipeQueue([]);
  }
  function openQueueEntry(entry: SnipeQueueEntry) {
    if (!entry.sourceVillageId) { alert("Village ID ausente — não é possível abrir."); return; }
    localStorage.setItem(STORAGE_KEY_PLAN, JSON.stringify({
      createdAt: Date.now(),
      sourceVillageId: entry.sourceVillageId,
      target: entry.target,
      unitsToSend: entry.units,
      midGapArrivalMs: entry.midGapArrivalMs,
    }));
    window.open(
      `${location.origin}/game.php?village=${encodeURIComponent(entry.sourceVillageId)}&screen=place`,
      "_blank", "noopener,noreferrer"
    );
  }
  async function copySnipeBB() {
    try {
      await navigator.clipboard.writeText(snipeQueue.map((e, i) => toSnipeBBString(e, i)).join("\n"));
      setBbCopied(true);
      setTimeout(() => setBbCopied(false), 2200);
    } catch { /* clipboard denied */ }
  }

  async function openInKumin() {
    try { await navigator.clipboard.writeText(snipeQueue.map((e, i) => toSnipeBBString(e, i)).join("\n")); } catch { /* */ }
    const kuminEntries = snipeQueue.map((e) => ({
      name: e.label,
      source: e.source,
      target: `${e.target.x}|${e.target.y}`,
      date: toDatetimeLocalMs(e.arrivalMs),
      commandType: "Support",
      slowestUnit: e.chosenSlowestUnit,
      units: e.units,
    }));
    localStorage.setItem("twKuminGluer_queue", JSON.stringify(kuminEntries));
    const vid = readCurrentVillageId();
    const url = vid
      ? `${location.origin}/game.php?village=${vid}&screen=memo`
      : `${location.origin}/game.php?screen=memo`;
    window.open(url, "_blank", "noopener,noreferrer");
    setSnipeQueue([]);
    saveSnipeQueue([]);
  }

  const queuedSources = new Set(snipeQueue.map((e) => e.source));

  const coordKey = (c: Coord) => `${c.x}|${c.y}`;

  const target: Coord | null = (() => {
    if (!incomings.length) return null;
    const tally: Record<string, number> = {};
    for (const inc of incomings) { const k = coordKey(inc.target); tally[k] = (tally[k] ?? 0) + 1; }
    const best = Object.entries(tally).sort((a, b) => b[1] - a[1])[0];
    return best ? incomings.find((i) => coordKey(i.target) === best[0])!.target : null;
  })();

  const filteredIncomings = target
    ? incomings.filter((i) => coordKey(i.target) === coordKey(target))
    : incomings;

  const sigilRatio  = 1 + sigil / 100;
  const speedFactor = 1 / (gameSpeed * unitSpeed * sigilRatio);
  const candidates  = target && filteredIncomings.length >= 2
    ? computeCandidates(filteredIncomings, gapIdx, troops, target, speedFactor)
    : [];

  const gapA     = filteredIncomings[gapIdx];
  const gapB     = filteredIncomings[gapIdx + 1];
  const midGapMs = gapA && gapB ? Math.floor((gapA.arrivalMs + gapB.arrivalMs) / 2) : 0;

  const loadIncomings = useCallback(() => {
    setIncomings([]); setGapIdx(0); setAutoError(null);
    readIncomingsFromDOM().then(setIncomings).catch((e) =>
      setAutoError(`Failed to read incomings: ${(e as Error).message}`)
    );
  }, []);

  useEffect(() => { if (!visible) return; loadIncomings(); }, [visible]);

  const loadTroops = useCallback(async () => {
    const vid = readCurrentVillageId();
    if (!vid) { setTroopsError("Could not detect current village id."); return; }
    setLoadingTroops(true); setTroopsError(null);
    try { setTroops(await fetchOwnHomeTroops(vid)); }
    catch (e) { setTroopsError(`Failed to fetch troops: ${(e as Error).message}`); }
    finally { setLoadingTroops(false); }
  }, []);

  const isOverview = Boolean(document.querySelector("#commands_incomings"));

  return (
    <div className={`cfg-view${visible ? " in" : ""}`} style={{ display: visible ? "flex" : "none" }}>

      <div className="cfg-header">
        <button className="back-btn" onClick={onBack}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M9 2L4 7l5 5" stroke="currentColor" strokeWidth="1.8"
              strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <span className="cfg-icon">🏹</span>
        <div className="cfg-header-text">
          <span className="cfg-title">Snipe Scheduler</span>
          <span className="cfg-subtitle">
            {tab === "manual" ? "teammate support" :
             target ? `target ${target.x}|${target.y}` : "gap snipe planner"}
          </span>
        </div>
      </div>

      <div className="cfg-body snipe-body">

        {/* ── Tab bar — uses existing btn classes only, no new CSS ── */}
        <div className="cfg-section" style={{ paddingBottom: 0 }}>
          <div style={{ display: "flex", gap: 4 }}>
            <button
              className={`btn${tab === "auto" ? " btn-save" : " btn-ghost"}`}
              onClick={() => setTab("auto")}
            >🏹 Auto</button>
            <button
              className={`btn${tab === "manual" ? " btn-save" : " btn-ghost"}`}
              onClick={() => setTab("manual")}
            >✏️ Manual</button>
          </div>
        </div>

        {/* ── Speed settings — shared ── */}
        <div className="cfg-section">
          <div className="section-label">Speed settings</div>
          <div className="snipe-speed-row">
            <label className="snipe-speed-label">
              Game speed
              <input className="input snipe-speed-input" type="number" step={0.01} min={0.1} max={10}
                value={gameSpeedDraft}
                onChange={(e) => { setGameSpeedDraft(e.target.value); const n = parseFloat(e.target.value); if (Number.isFinite(n) && n > 0) setGameSpeed(n); }}
                onBlur={() => { const n = parseFloat(gameSpeedDraft); if (!Number.isFinite(n) || n <= 0) setGameSpeedDraft(String(gameSpeed)); }}
              />
            </label>
            <label className="snipe-speed-label">
              Unit speed
              <input className="input snipe-speed-input" type="number" step={0.01} min={0.1} max={2}
                value={unitSpeedDraft}
                onChange={(e) => { setUnitSpeedDraft(e.target.value); const n = parseFloat(e.target.value); if (Number.isFinite(n) && n > 0) setUnitSpeed(n); }}
                onBlur={() => { const n = parseFloat(unitSpeedDraft); if (!Number.isFinite(n) || n <= 0) setUnitSpeedDraft(String(unitSpeed)); }}
              />
            </label>
            <label className="snipe-speed-label">
              Sigil %
              <input className="input snipe-speed-input" type="number" step={1} min={0} max={100}
                title="Sigil item bonus — reduces troop travel time (e.g. 20 = 20% faster)"
                value={sigilDraft}
                onChange={(e) => { setSigilDraft(e.target.value); const n = parseFloat(e.target.value); if (Number.isFinite(n) && n >= 0) setSigil(n); }}
                onBlur={() => { const n = parseFloat(sigilDraft); if (!Number.isFinite(n) || n < 0) setSigilDraft(String(sigil)); }}
              />
            </label>
            {tab === "auto" && (
              <button className="btn btn-ghost" onClick={loadIncomings}>↺ Refresh</button>
            )}
          </div>
        </div>

        {/* ── Troops — shared ── */}
        <div className="cfg-section">
          <div className="snipe-summary-row">
            <span className="snipe-summary-item">Villages loaded: <strong>{troops.length}</strong></span>
          </div>
          {troopsError && <div className="snipe-error" style={{ marginTop: 4 }}>{troopsError}</div>}
          <button
            className="btn btn-save btn-save--dirty"
            onClick={loadTroops}
            disabled={loadingTroops}
            style={{ marginTop: 6 }}
          >
            {loadingTroops
              ? <><span className="spinner" /> Loading troops…</>
              : troops.length ? "↺ Reload troops" : "Load troops"}
          </button>
        </div>

        {/* ── AUTO TAB ── */}
        {tab === "auto" && (
          <>
            {!isOverview && (
              <div className="cfg-section">
                <div className="state-msg">Navigate to an overview page with incomings to use this tab.</div>
              </div>
            )}
            {isOverview && (
              <>
                {autoError && <div className="cfg-section"><div className="snipe-error">{autoError}</div></div>}

                <div className="cfg-section">
                  <div className="snipe-summary-row">
                    <span className="snipe-summary-item">
                      Target: <strong>{target ? `${target.x}|${target.y}` : "—"}</strong>
                    </span>
                    <span className="snipe-summary-item">
                      Incomings: <strong>{filteredIncomings.length}</strong>
                    </span>
                  </div>
                </div>

                {filteredIncomings.length >= 2 && (
                  <div className="cfg-section">
                    <div className="section-label">Gaps ({filteredIncomings.length - 1})</div>
                    <div className="snipe-gap-list">
                      {filteredIncomings.slice(0, -1).map((inc, i) => (
                        <GapPill
                          key={i} idx={i}
                          label={filteredIncomings[i + 1]!.label || `Gap #${i + 1}`}
                          afterMs={inc.arrivalMs}
                          beforeMs={filteredIncomings[i + 1]!.arrivalMs}
                          selected={gapIdx === i}
                          onClick={() => setGapIdx(i)}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {incomings.length === 0 && (
                  <div className="cfg-section">
                    <div className="state-msg">Loading incomings…</div>
                  </div>
                )}
                {incomings.length > 0 && filteredIncomings.length < 2 && (
                  <div className="cfg-section">
                    <div className="state-msg">Need at least 2 "Nobre" incomings to the same target.</div>
                  </div>
                )}

                {filteredIncomings.length >= 2 && gapA && gapB && (
                  <div className="cfg-section">
                    <div className="section-label">
                      {filteredIncomings[gapIdx + 1]?.label || `Gap #${gapIdx + 1}`} candidates
                      {candidates.length > 0 && (
                        <span className="snipe-candidate-meta">
                          &nbsp;·&nbsp;mid-gap: {fmtDateMs(midGapMs).split(" ")[1]}
                          &nbsp;·&nbsp;{candidates.length} village{candidates.length !== 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                    {troops.length === 0 && (
                      <div className="state-msg">Press "Load troops" to compute candidates.</div>
                    )}
                    {troops.length > 0 && candidates.length === 0 && (
                      <div className="state-msg">No feasible commands for this gap.</div>
                    )}
                    {candidates.map((c, i) => {
                      const srcKey = `${c.src.coord.x}|${c.src.coord.y}`;
                      return (
                        <CandidateCard
                          key={`${c.src.villageId ?? i}-${c.sendMs}`}
                          candidate={c} target={target!} midGapArrivalMs={midGapMs}
                          gapLabel={filteredIncomings[gapIdx + 1]?.label || `Gap #${gapIdx + 1}`}
                          onQueue={addToSnipeQueue}
                          queued={queuedSources.has(srcKey)}
                        />
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* ── MANUAL TAB ── */}
        {tab === "manual" && (
          <ManualTab
            troops={troops}
            loadingTroops={loadingTroops}
            onLoadTroops={loadTroops}
            speedFactor={speedFactor}
            onQueue={addToSnipeQueue}
            queuedSources={queuedSources}
          />
        )}

        {/* Snipe queue */}
        {snipeQueue.length > 0 && (
          <div className="cfg-section">
            <div className="section-label"
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingRight: 14 }}>
              <span>Fila de snipes ({snipeQueue.length})</span>
              <button className="btn btn-ghost"
                style={{ flex: "none", fontSize: 10, padding: "1px 8px", color: "var(--r500)" }}
                onClick={clearSnipeQueue}>
                Limpar
              </button>
            </div>
            <div style={{ padding: "0 14px" }}>
              {snipeQueue.map((e, i) => (
                <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, fontSize: 12 }}>
                  <span style={{ color: "var(--n400)", minWidth: 18 }}>#{i + 1}</span>
                  <span style={{ fontFamily: "var(--mono)", flex: 1 }}>{e.source} → {e.target.x}|{e.target.y}</span>
                  <span style={{ color: "var(--n400)", fontFamily: "var(--mono)", fontSize: 11 }}>{fmtDateMs(e.sendMs).split(" ")[1]}</span>
                  <button className="btn btn-save btn-save--dirty"
                    style={{ fontSize: 11, padding: "1px 8px" }}
                    onClick={() => openQueueEntry(e)}>
                    Abrir
                  </button>
                  <button className="btn btn-ghost"
                    style={{ fontSize: 11, padding: "1px 6px", color: "var(--r500)" }}
                    onClick={() => removeFromSnipeQueue(e.id)}>
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>

      {snipeQueue.length > 0 && (
        <div className="cfg-footer" style={{ gap: 6 }}>
          <button className="btn btn-ghost" onClick={copySnipeBB} style={{ flex: 1 }}>
            {bbCopied ? "✓ Copiado" : "📋 Copiar BB"}
          </button>
          <button className="btn btn-save btn-save--dirty" onClick={openInKumin} style={{ flex: 1 }}>
            🚀 Abrir no Kumin
          </button>
        </div>
      )}
    </div>
  );
}
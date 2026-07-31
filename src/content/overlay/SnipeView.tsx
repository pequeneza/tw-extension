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
  useCallback, useEffect, useMemo, useRef, useState,
} from "react";
import { computeScheduledByVillage, subtractScheduled, openTabPinned } from "./queue-utils";
import { TriggerVisibilityToggle } from "./TriggerVisibilityToggle";

/* ─── Constants ───────────────────────────────────────────────────────────── */
const STORAGE_KEY_PLAN     = "tw_gap_snipe_plan_v12";
const STORAGE_KEY_MANUAL   = "tw_snipe_manual_timings_v1";
const SNIPE_QUEUE_KEY      = "tw_snipe_queue_v1";
const STORAGE_KEY_SETTINGS = "tw_snipe_settings_v1";

interface SnipeSettings {
  gameSpeed: number;
  unitSpeed: number;
  sigil: number;
  maxVillages: number;
  unitMinTroops: Record<string, number>;
}

const DEFAULT_SNIPE_SETTINGS: SnipeSettings = {
  gameSpeed: 1.0, unitSpeed: 1.0, sigil: 0, maxVillages: 15, unitMinTroops: {},
};

function loadSnipeSettings(): SnipeSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SETTINGS);
    if (!raw) return { ...DEFAULT_SNIPE_SETTINGS };
    return { ...DEFAULT_SNIPE_SETTINGS, ...(JSON.parse(raw) as Partial<SnipeSettings>) };
  } catch { return { ...DEFAULT_SNIPE_SETTINGS }; }
}
function saveSnipeSettings(s: SnipeSettings) {
  localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(s));
}

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

interface RecallGapCandidate {
  gapIdx: number;
  gapAfterMs: number;
  gapBeforeMs: number;
  sendMs: number;
  cancelAtMs: number;
  cancelAfterMs: number;
  returnMs: number;
  tripMs: number;
  feasible: boolean;
  reason?: string;
}

type Tab = "auto" | "manual" | "recall" | "settings";

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
  return Math.round(mpf * euclidean(from, to) * speedFactor * 60 * 1000 / 1000) * 1000;
}

function clampInt(n: number, lo: number, hi: number) {
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, Math.trunc(n)));
}

async function fetchWorldSpeed(): Promise<{ gameSpeed: number; unitSpeed: number }> {
  const gd = (window as Window & { game_data?: { speed?: number; unit_speed?: number } }).game_data;
  if (gd?.speed != null && gd?.unit_speed != null) {
    return { gameSpeed: gd.speed, unitSpeed: gd.unit_speed };
  }
  try {
    const html = await fetch(
      `${location.origin}/page/settings`,
      { credentials: "include" }
    ).then(r => r.text());
    const doc = new DOMParser().parseFromString(html, "text/html");
    let gameSpeed = 1, unitSpeed = 1;
    for (const s of doc.querySelectorAll("script")) {
      const t = s.textContent ?? "";
      let m = t.match(/"speed"\s*:\s*([\d.]+)/);
      if (m) gameSpeed = parseFloat(m[1]!);
      m = t.match(/"unit_speed"\s*:\s*([\d.]+)/);
      if (m) unitSpeed = parseFloat(m[1]!);
    }
    if (gameSpeed === 1) {
      doc.querySelectorAll("tr").forEach(tr => {
        const tds = tr.querySelectorAll("td");
        if (tds.length < 2) return;
        const label = tds[0]!.textContent?.toLowerCase() ?? "";
        const val   = parseFloat((tds[1]!.textContent ?? "").replace(",", "."));
        if (!isNaN(val)) {
          if (label.includes("velocidade do jogo"))      gameSpeed = val;
          if (label.includes("velocidade das unidades")) unitSpeed = val;
        }
      });
    }
    return { gameSpeed, unitSpeed };
  } catch {
    return { gameSpeed: 1, unitSpeed: 1 };
  }
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

/** Deep link to the in-game map screen centered on a coordinate, e.g. #470;637. */
function mapUrl(x: number, y: number): string {
  const vid = window.location.search.match(/[?&]village=(\d+)/)?.[1] ?? "";
  return `${location.origin}/game.php?village=${vid}&screen=map&xbot_sender=1#${x};${y}`;
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
function sitterPrefix(): string {
  const t = new URLSearchParams(window.location.search).get("t");
  return t ? `t=${t}&` : "";
}

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
  const url = `${location.origin}/game.php?${sitterPrefix()}village=${villageId}&screen=info_command&id=${commandId}&type=other`;
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
    if (!tr.querySelector('img[src*="attack"]')) continue;

    const label = getRowLabel(tr);

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
  const out: VillageTroops[] = [];
  // One entry per td.unit-item column — `null` for columns we don't track (e.g. militia),
  // so unrecognized columns still consume a slot and later units stay aligned with their td.
  const headerUnits: (string | null)[] = [];
  const seenCoords = new Set<string>();
  let page = 0;

  while (true) {
    const url = `${location.origin}/game.php?${sitterPrefix()}village=${encodeURIComponent(villageId)}`
              + `&screen=overview_villages&mode=units&type=own_home&group=0&page=${page}`;
    const html = await fetch(url, { credentials: "include" }).then((r) => r.text());
    const doc  = new DOMParser().parseFromString(html, "text/html");

    const table = [...doc.querySelectorAll<HTMLTableElement>("table.vis")]
      .find((t) => t.querySelector('thead img[src*="/graphic/unit/unit_"]'));
    if (!table) break;

    if (page === 0) {
      // Collect unit icons directly (not per-<th>) — some worlds group multiple
      // unit columns under one <th colspan>, which would undercount if we only
      // looked at the first <img> per <th>. This stays aligned with td.unit-item
      // columns regardless of how a given world's markup groups the header cells.
      table.querySelectorAll<HTMLImageElement>('thead img[src*="/graphic/unit/unit_"]').forEach((img) => {
        // No trailing `\.` anchor — retina asset filenames insert `@2x` between
        // the unit name and the extension (unit_spear@2x.webp), which would
        // otherwise make this regex fail to match entirely.
        const m = (img.getAttribute("src") ?? "").match(/\/unit_([a-z0-9_]+)/i);
        if (!m) { headerUnits.push(null); return; }
        const raw = m[1]!.toLowerCase();
        headerUnits.push(raw === "militia" || !(raw in UNIT_MIN_PER_FIELD) ? null : raw);
      });
    }

    const rows = [...table.querySelectorAll<HTMLTableRowElement>("tbody tr")];
    let addedThisPage = 0;

    rows.forEach((tr) => {
      const label   = tr.querySelector<HTMLElement>(".quickedit-label");
      const coord   = parseCoord(label?.textContent ?? tr.textContent ?? "");
      if (!coord) return;
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
        if (!unit) return;
        const raw = (tds[i]?.textContent ?? "").replace(/[^\d]/g, "");
        troops[unit] = raw ? parseInt(raw, 10) : 0;
      });
      out.push({ villageId: vId, coord, troops });
      addedThisPage++;
    });

    if (addedThisPage === 0) break;
    page++;
  }

  return out;
}

/* ─── Candidate computation ───────────────────────────────────────────────── */
function computeCandidates(
  incomings: Incoming[],
  gapIdx: number,
  troops: VillageTroops[],
  target: Coord,
  speedFactor: number,
  maxCandidates = 15,
  unitMinTroops: Record<string, number> = {},
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
    {
      let passesFilter = true;
      for (const [unit, minAmt] of Object.entries(unitMinTroops)) {
        if (minAmt > 0 && (src.troops[unit] ?? 0) < minAmt) { passesFilter = false; break; }
      }
      if (!passesFilter) continue;
    }
    out.push({ src, chosenSlowestUnit: chosen.unit, sendMs: chosen.sendMs, arrivalMs: chosen.arrivalMs, allowedUnits });
  }

  out.sort((x, y) => x.sendMs - y.sendMs);
  return out.slice(0, maxCandidates);
}

/* ─── Recall computation ──────────────────────────────────────────────────── */
function computeRecallCandidates(
  incomings: Incoming[],
  srcCoord: Coord,
  dstCoord: Coord,
  unit: string,
  speedFactor: number,
): RecallGapCandidate[] {
  // TW return rule: return = sentAt + 2×cancelMs, where cancelMs must be whole seconds.
  // So return%1000 = sentAt%1000 always.
  // For return%1000 = midMs%1000 (in gap), sendMs must also share that ms:
  //   sendMs = midMs − N×1000  (any integer N preserves the ms component)
  // Cancel window: cancelMs = N/2 × 1000 ≤ 10 min → N ≤ 1200.
  //   N must be EVEN so that cancelMs is a whole number of seconds.
  // Troops must be in flight at cancel: cancelMs < tripMs.
  const CANCEL_WINDOW_S = 590; // 9m50s — leaves buffer under the strict 10-min limit
  const SEND_BUFFER_MS  = 30_000; // 30 s for auto_sender to open and fill the place screen
  const now    = getServerNowMs();
  const tripMs = Math.round(travelMs(unit, srcCoord, dstCoord, speedFactor) / 1000) * 1000;
  const result: RecallGapCandidate[] = [];

  for (let i = 0; i < incomings.length - 1; i++) {
    const a = incomings[i]!;
    const b = incomings[i + 1]!;
    const gapAfterMs  = a.arrivalMs;
    const gapBeforeMs = b.arrivalMs;
    const midMs       = Math.floor((gapAfterMs + gapBeforeMs) / 2);

    // Largest even N satisfying all constraints
    const maxNByWindow = CANCEL_WINDOW_S * 2;                      // cancel window
    const maxNByTrip   = Math.floor(tripMs / 1000) * 2 - 2;        // troops in flight
    const maxNByTime   = Math.floor((midMs - now - SEND_BUFFER_MS) / 1000); // sendMs in future
    const N = Math.floor(Math.min(maxNByWindow, maxNByTrip, maxNByTime) / 2) * 2; // largest even N

    const sendMs        = midMs - N * 1000;
    const cancelAfterMs = (N / 2) * 1000;          // whole seconds; return = sendMs + N*1000 = midMs ✓
    const cancelAtMs    = sendMs + cancelAfterMs;
    const returnMs      = midMs;

    let feasible = true;
    let reason: string | undefined;
    if (midMs <= now) {
      feasible = false; reason = "Janela já passou";
    } else if (N < 2) {
      feasible = false; reason = "Ataque demasiado próximo — sem tempo para cancelar";
    } else if (cancelAfterMs >= tripMs) {
      feasible = false; reason = `Destino demasiado perto (tropas: ${Math.round(tripMs/60000)}min, cancelar: ${Math.round(cancelAfterMs/60000)}min)`;
    }

    result.push({ gapIdx: i, gapAfterMs, gapBeforeMs, sendMs, cancelAtMs, cancelAfterMs, returnMs, tripMs, feasible, reason });
  }
  return result;
}

/* ─── RecallTab ───────────────────────────────────────────────────────────── */
function RecallTab({
  incomings,
  speedFactor,
  srcVillageId,
  srcCoord,
  troops,
  loadingTroops,
  onLoadTroops,
}: {
  incomings: Incoming[];
  speedFactor: number;
  srcVillageId: string | null;
  srcCoord: Coord | null;
  troops: VillageTroops[];
  loadingTroops: boolean;
  onLoadTroops: () => void;
}) {
  const [queued, setQueued] = useState<Set<number>>(new Set());
  const [error,  setError]  = useState<string | null>(null);

  // Source village troops (match by id or coord)
  const srcVillageTroops = troops.find(
    v => srcVillageId ? v.villageId === srcVillageId
                      : srcCoord ? v.coord.x === srcCoord.x && v.coord.y === srcCoord.y : false
  ) ?? null;

  // Closest own village (excluding source) as destination.
  // Exclude by both ID and coord: if villageId is null (parse failed on overview link),
  // the ID check alone would not exclude it and distance-0 source would win the sort.
  const dstVillage = srcCoord
    ? [...troops]
        .filter(v => {
          if (srcVillageId && v.villageId === srcVillageId) return false;
          if (v.coord.x === srcCoord.x && v.coord.y === srcCoord.y) return false;
          return true;
        })
        .sort((a, b) => euclidean(a.coord, srcCoord) - euclidean(b.coord, srcCoord))[0] ?? null
    : null;
  const dstCoord = dstVillage?.coord ?? null;

  // Unit selection state
  const displayUnits = srcVillageTroops
    ? UNIT_ORDER_DISPLAY.filter(u => (srcVillageTroops.troops[u] ?? 0) > 0)
    : [];

  const [amounts, setAmounts] = useState<Record<string, number>>({});
  const [drafts,  setDrafts]  = useState<Record<string, string>>({});

  useEffect(() => {
    if (!srcVillageTroops) return;
    setAmounts(Object.fromEntries(displayUnits.map(u => [u, 0])));
    setDrafts(Object.fromEntries(displayUnits.map(u => [u, "0"])));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [srcVillageTroops?.villageId]);

  const toggleUnit = useCallback((unit: string) => {
    const avail = srcVillageTroops?.troops[unit] ?? 0;
    const next  = (amounts[unit] ?? 0) > 0 ? 0 : avail;
    setAmounts(p => ({ ...p, [unit]: next }));
    setDrafts(p  => ({ ...p, [unit]: String(next) }));
  }, [amounts, srcVillageTroops]);

  const selectAll = useCallback(() => {
    if (!srcVillageTroops) return;
    const next = Object.fromEntries(displayUnits.map(u => [u, srcVillageTroops.troops[u] ?? 0]));
    setAmounts(next);
    setDrafts(Object.fromEntries(Object.entries(next).map(([k, v]) => [k, String(v)])));
  }, [srcVillageTroops, displayUnits]);

  // Slowest selected unit determines travel time
  const slowestUnit = [...UNIT_ORDER_FAST_TO_SLOW].reverse().find(u => (amounts[u] ?? 0) > 0) ?? null;
  const hasSelection = Object.values(amounts).some(v => v > 0);

  const candidates = srcCoord && dstCoord && slowestUnit && incomings.length >= 2
    ? computeRecallCandidates(incomings, srcCoord, dstCoord, slowestUnit, speedFactor)
    : [];

  function queueGap(c: RecallGapCandidate) {
    if (!srcVillageId || !srcCoord || !dstCoord) return;
    const units = Object.fromEntries(Object.entries(amounts).filter(([, v]) => v > 0));

    // Recompute launch at click time — render-time sendMs may be stale
    const clickNow   = getServerNowMs();
    const midMs      = Math.floor((c.gapAfterMs + c.gapBeforeMs) / 2);
    const maxN = Math.floor(Math.min(
      1180,
      Math.floor(c.tripMs / 1000) * 2 - 2,
      Math.floor((midMs - clickNow - 25_000) / 1000), // 25s lookahead to auto_sender
    ) / 2) * 2;
    const launch        = maxN > 0 ? midMs - maxN * 1000 : midMs - 2000;
    const cancelAfterMs = maxN > 0 ? (maxN / 2) * 1000   : 1000;
    // Cancel time on the second — ms doesn't matter for the cancel click
    const cancelAtSec = new Date(launch + cancelAfterMs);
    const cancelLabel = `${pad2(cancelAtSec.getHours())}:${pad2(cancelAtSec.getMinutes())}:${pad2(cancelAtSec.getSeconds())}`;

    const sitterT = new URLSearchParams(window.location.search).get("t") || null;
    const entry = {
      src:           `${srcCoord.x}|${srcCoord.y}`,
      tgt:           `${dstCoord.x}|${dstCoord.y}`,
      srcVillageId,
      type:          "support",
      launch,
      arrival:       c.returnMs,
      units,
      note:          `[SC] Cancelar às ${cancelLabel}`,
      cancelAfterMs,
      gapAfterMs:    c.gapAfterMs,
      gapBeforeMs:   c.gapBeforeMs,
      sitterT,
    };
    document.dispatchEvent(new CustomEvent("xbot:autosender:run", { detail: { action: "addToQueue", entry } }));
    setQueued(s => new Set([...s, c.gapIdx]));
  }

  return (
    <div>
      {/* Explanation */}
      <div className="cfg-section">
        <div className="gluer-cfg-note" style={{ padding: "6px 14px", fontStyle: "normal" }}>
          Envia um apoio para a tua aldeia própria mais próxima e cancela-o a meio caminho —
          o retorno chega mesmo na janela entre dois ataques recebidos, "limpando" a fila sem gastar tropas de verdade.
        </div>
      </div>

      {/* Source */}
      <div className="cfg-section">
        <div className="section-label">Origem (aldeia defendida)</div>
        {srcCoord ? (
          <div style={{ fontSize: 12, fontFamily: "var(--mono)", color: "var(--n400)" }}>
            {srcCoord.x}|{srcCoord.y}
            {srcVillageId && <span style={{ color: "var(--n500)", marginLeft: 6 }}>id:{srcVillageId}</span>}
          </div>
        ) : (
          <div className="state-msg">Navega para os ataques recebidos de uma aldeia.</div>
        )}
      </div>

      {/* Destination (auto-detected) */}
      {srcCoord && (
        <div className="cfg-section">
          <div className="section-label">Destino (aldeia própria mais próxima)</div>
          {dstVillage ? (
            <div style={{ fontSize: 12, fontFamily: "var(--mono)", color: "var(--n400)" }}>
              {dstCoord!.x}|{dstCoord!.y}
              <span style={{ color: "var(--n500)", marginLeft: 6 }}>
                ({(Math.round(euclidean(srcCoord, dstCoord!) * 10) / 10).toFixed(1)} fields)
              </span>
            </div>
          ) : troops.length === 0 ? (
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button className="btn btn-save btn-save--dirty" onClick={onLoadTroops} disabled={loadingTroops}>
                {loadingTroops ? <><span className="spinner" /> A carregar…</> : "Carregar tropas"}
              </button>
              <span style={{ fontSize: 11, color: "var(--n500)" }}>necessário para detectar destino</span>
            </div>
          ) : (
            <div className="state-msg">Sem outras aldeias próprias disponíveis.</div>
          )}
        </div>
      )}

      {/* Source village troops card */}
      {srcCoord && (
        <div className="cfg-section">
          <div className="section-label">Tropas na aldeia defendida</div>
          {!srcVillageTroops && troops.length === 0 ? (
            <div className="state-msg">Carrega as tropas para ver as unidades disponíveis.</div>
          ) : !srcVillageTroops ? (
            <div className="state-msg">Aldeia de origem não encontrada na lista de tropas.</div>
          ) : (
            <div className="snipe-card">
              <div className="snipe-card-row">
                <button className="btn btn-ghost" onClick={selectAll}>Todos</button>
                {slowestUnit && (
                  <span style={{ fontSize: 11, color: "var(--n500)" }}>
                    slowest: <strong>{slowestUnit}</strong>
                  </span>
                )}
              </div>
              <div className="snipe-units">
                {displayUnits.map(unit => {
                  const avail = srcVillageTroops.troops[unit] ?? 0;
                  const val   = amounts[unit] ?? 0;
                  return (
                    <div key={unit} className={`snipe-unitbox gluer-unitbox--compact${val > 0 ? " snipe-unitbox--on" : ""}`}>
                      <img src={unitIconUrl(unit)} alt={unit} className="snipe-unit-icon"
                           onClick={() => toggleUnit(unit)} title={`Clica para alternar todas as ${unit}`} />
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
          )}
        </div>
      )}

      {/* Gap candidates */}
      {srcCoord && dstCoord && hasSelection && incomings.length >= 2 && (
        <div className="cfg-section">
          <div className="section-label">Janelas de snipe cancel ({candidates.length})</div>
          {candidates.map(c => (
            <div key={c.gapIdx} style={{
              marginBottom: 8, padding: "8px 10px", borderRadius: 8,
              background: c.feasible ? "rgba(13,148,136,0.08)" : "rgba(80,80,80,0.06)",
              border: `1px solid ${c.feasible ? "rgba(13,148,136,0.3)" : "rgba(100,100,100,0.18)"}`,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2, fontSize: 12 }}>
                <strong>Janela #{c.gapIdx + 1}</strong>
                {!c.feasible && <span style={{ color: "var(--r500)", fontSize: 11 }}>{c.reason}</span>}
                {c.feasible && queued.has(c.gapIdx) && <span style={{ color: "var(--g600)", fontSize: 11 }}>✓ Na fila</span>}
              </div>
              <div style={{ fontSize: 10.5, color: "var(--n400)", marginBottom: 6 }}>
                entre os ataques das <strong>{fmtDateMs(c.gapAfterMs).split(" ")[1]?.split(".")[0]}</strong> e das <strong>{fmtDateMs(c.gapBeforeMs).split(" ")[1]?.split(".")[0]}</strong>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "60px 1fr", gap: "2px 6px", fontFamily: "var(--mono)", fontSize: 11, color: "var(--n300)" }}>
                <span>Enviar:</span>   <span>{fmtDateMs(c.sendMs).split(" ")[1]}</span>
                <span>Cancelar:</span><span>{(fmtDateMs(c.cancelAtMs).split(" ")[1] ?? "").split(".")[0]}</span>
                <span>Retorno:</span> <span>{fmtDateMs(c.returnMs).split(" ")[1]}</span>
                <span>Viagem:</span>  <span>{Math.floor(c.tripMs / 60000)}m{Math.round((c.tripMs % 60000) / 1000)}s</span>
              </div>
              {c.feasible && !queued.has(c.gapIdx) && (
                <button
                  className="btn btn-ghost"
                  style={{ marginTop: 6, width: "100%", fontSize: 12 }}
                  onClick={() => queueGap(c)}
                >⚡ Adicionar ao Auto Sender</button>
              )}
            </div>
          ))}
        </div>
      )}
      {srcCoord && dstCoord && !hasSelection && incomings.length >= 2 && (
        <div className="cfg-section"><div className="state-msg">Seleciona tropas para calcular as janelas.</div></div>
      )}
      {srcCoord && dstCoord && incomings.length < 2 && (
        <div className="cfg-section"><div className="state-msg">Precisas de pelo menos 2 ataques recebidos.</div></div>
      )}
      {error && <div className="cfg-section"><div className="snipe-error">{error}</div></div>}
    </div>
  );
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
function CandidateCard({ candidate, target, midGapArrivalMs, gapLabel, onQueue, queued,
                         gapAfterMs, gapBeforeMs, speedFactor }: {
  candidate: Candidate; target: Coord; midGapArrivalMs: number;
  gapLabel: string;
  onQueue: (entry: SnipeQueueEntry) => void;
  queued: boolean;
  gapAfterMs: number;
  gapBeforeMs: number;
  speedFactor: number;
}) {
  const [amounts, setAmounts] = useState<Record<string, number>>(() =>
    Object.fromEntries(candidate.allowedUnits.map((u) => [u, 0]))
  );
  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(candidate.allowedUnits.map((u) => [u, "0"]))
  );
  const [timerActive, setTimerActive] = useState(false);
  const [showPopulation, setShowPopulation] = useState(false);
  const [fillPct, setFillPct] = useState(0);
  // Units the user has set by hand (icon toggle or typing) — the Population bar
  // leaves these alone and only scales the remaining, non-overridden units.
  const [overriddenUnits, setOverriddenUnits] = useState<Set<string>>(new Set());

  const effectiveSlowest = [...UNIT_ORDER_FAST_TO_SLOW].reverse().find((u) => (amounts[u] ?? 0) > 0) ?? null;
  const timingMismatch   = effectiveSlowest !== null && effectiveSlowest !== candidate.chosenSlowestUnit;

  const recomputedTiming = useMemo(() => {
    if (!effectiveSlowest || effectiveSlowest === candidate.chosenSlowestUnit) return null;
    const tMs      = travelMs(effectiveSlowest, candidate.src.coord, target, speedFactor);
    const earliest = (gapAfterMs  + 1) - tMs;
    const latest   = (gapBeforeMs - 1) - tMs;
    if (earliest > latest) return null;
    const sendForMid = midGapArrivalMs - tMs;
    const send       = Math.min(latest, Math.max(earliest, sendForMid));
    const arrival    = send + tMs;
    if (!(arrival > gapAfterMs && arrival < gapBeforeMs)) return null;
    if (send < getServerNowMs()) return null;
    return { sendMs: send, arrivalMs: arrival };
  }, [effectiveSlowest, candidate.src.coord, candidate.chosenSlowestUnit,
      target, speedFactor, gapAfterMs, gapBeforeMs, midGapArrivalMs]);

  const activeSendMs    = recomputedTiming?.sendMs    ?? candidate.sendMs;
  const activeArrivalMs = recomputedTiming?.arrivalMs ?? candidate.arrivalMs;

  const { display, past } = useCountdown(activeSendMs, timerActive);

  useEffect(() => {
    setAmounts(Object.fromEntries(candidate.allowedUnits.map((u) => [u, 0])));
    setDrafts(Object.fromEntries(candidate.allowedUnits.map((u) => [u, "0"])));
    setTimerActive(false);
    setOverriddenUnits(new Set());
  }, [candidate.src.villageId, candidate.sendMs]);

  const toggleUnit = useCallback((unit: string) => {
    const next = (amounts[unit] ?? 0) > 0 ? 0 : (candidate.src.troops[unit] ?? 0);
    setAmounts((p) => ({ ...p, [unit]: next }));
    setDrafts((p) => ({ ...p, [unit]: String(next) }));
    setOverriddenUnits((p) => new Set(p).add(unit));
  }, [candidate, amounts]);

  // "Todos" is a fresh bulk fill, not a per-unit override — clears any locks
  // so the Population bar can immediately act on every unit again afterward.
  const selectAll = useCallback(() => {
    const next = Object.fromEntries(candidate.allowedUnits.map((u) => [u, candidate.src.troops[u] ?? 0]));
    setAmounts(next);
    setDrafts(Object.fromEntries(Object.entries(next).map(([k, v]) => [k, String(v)])));
    setOverriddenUnits(new Set());
  }, [candidate]);

  // Population bar — scales every non-overridden viable unit to pct% of its own
  // troop count at once (already the effective/available amount — see effectiveTroops
  // in the parent, which pre-subtracts anything already queued elsewhere).
  const applyFillPct = useCallback((pct: number) => {
    setFillPct(pct);
    const next: Record<string, number> = { ...amounts };
    for (const u of candidate.allowedUnits) {
      if (overriddenUnits.has(u)) continue;
      next[u] = Math.round((candidate.src.troops[u] ?? 0) * pct / 100);
    }
    setAmounts(next);
    setDrafts(prev => {
      const nd = { ...prev };
      for (const u of candidate.allowedUnits) if (!overriddenUnits.has(u)) nd[u] = String(next[u]);
      return nd;
    });
  }, [candidate, amounts, overriddenUnits]);

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
      chosenSlowestUnit: effectiveSlowest ?? candidate.chosenSlowestUnit,
      units,
      sendMs: activeSendMs,
      arrivalMs: activeArrivalMs,
      midGapArrivalMs,
    });
    setAmounts(Object.fromEntries(candidate.allowedUnits.map((u) => [u, 0])));
    setDrafts(Object.fromEntries(candidate.allowedUnits.map((u) => [u, "0"])));
  }, [candidate, amounts, target, gapLabel, midGapArrivalMs, onQueue,
      activeSendMs, activeArrivalMs, effectiveSlowest]);

  const allowedSet   = new Set(candidate.allowedUnits);
  // Render in standard TW display order, not in algorithmic fast-to-slow order
  const displayUnits = UNIT_ORDER_DISPLAY.filter(u => allowedSet.has(u));

  const populationTotal = candidate.allowedUnits.reduce((sum, u) => sum + (amounts[u] ?? 0), 0);
  const populationColor = populationTotal < 1000 ? "var(--g600)"
    : populationTotal <= 5000 ? "var(--a500)"
    : "var(--r500)";

  const { x, y } = candidate.src.coord;
  return (
    <div className="snipe-card">
      <div className="snipe-card-header">
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <button className="gluer-map-btn"
            onClick={() => window.open(mapUrl(x, y), "_blank", "noopener,noreferrer")}
            title="Ver localização no mapa" aria-label="Ver localização no mapa">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C7.86 2 4.5 5.36 4.5 9.5c0 5.5 6.5 12 7 12.5.28.28.72.28 1 0 .5-.5 7-7 7-12.5C19.5 5.36 16.14 2 12 2zm0 10.25a2.75 2.75 0 1 1 0-5.5 2.75 2.75 0 0 1 0 5.5z"/>
            </svg>
          </button>
          <span className="snipe-card-coord">{x}|{y}</span>
        </span>
        <span className="snipe-card-meta">
          slowest: <strong>{effectiveSlowest ?? candidate.chosenSlowestUnit}</strong>
          &nbsp;·&nbsp;saída: <strong>{fmtDateMs(activeSendMs)}</strong>
        </span>
      </div>
      <div className="snipe-card-row">
        <button type="button"
          className={`gluer-toggle${timerActive ? "" : " gluer-toggle--off"}`}
          onClick={() => setTimerActive((t) => !t)}
          role="switch" aria-checked={timerActive} aria-label="Timer"
          title={timerActive ? "Parar" : "Iniciar timer"}>
          <span className="gluer-toggle-knob" />
        </button>
        {timerActive && (
          <span className={`snipe-countdown${past ? " snipe-countdown--past" : ""}`}>{display}</span>
        )}
        <div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
          <button className="btn btn-ghost snipe-timer-btn--icon"
            onClick={() => setShowPopulation(s => !s)}
            title="Preencher por população" aria-pressed={showPopulation}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </button>
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={selectAll}>Todos</button>
          <button
            className={`btn${queued ? " btn-save btn-save--saved" : " btn-save btn-save--dirty"}`}
            style={{ flex: 1 }}
            onClick={handleQueue}
            disabled={past || !hasSelection || (timingMismatch && !recomputedTiming)}
          >Queue</button>
        </div>
      </div>

      {showPopulation && (
        <div className="gluer-pop-row">
          <input type="range" min={0} max={100} value={fillPct}
            className="gluer-pop-bar" style={{ accentColor: populationColor }}
            onChange={e => applyFillPct(Number(e.target.value))} />
          <span className="gluer-pop-total" style={{ color: populationColor }}>
            {populationTotal.toLocaleString("pt-PT")}
          </span>
        </div>
      )}

      <div className="snipe-units">
        {displayUnits.map((unit) => {
          const avail = candidate.src.troops[unit] ?? 0;
          const val   = amounts[unit] ?? 0;
          const locked = showPopulation && overriddenUnits.has(unit);
          return (
            <div key={unit}
              className={`snipe-unitbox gluer-unitbox--compact${val > 0 ? " snipe-unitbox--on" : ""}${locked ? " gluer-unitbox--locked" : ""}`}
              title={locked ? `${unit}: fixado — a barra de população não altera esta unidade` : unit}>
              <img src={unitIconUrl(unit)} alt={unit} className="snipe-unit-icon"
                   onClick={() => toggleUnit(unit)} />
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
                  setOverriddenUnits((p) => new Set(p).add(unit));
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
      {timingMismatch && (
        recomputedTiming ? (
          <div style={{
            marginTop: 6, padding: "4px 8px", borderRadius: 5, fontSize: 11,
            color: "var(--n300)", background: "rgba(13,148,136,0.08)",
            border: "1px solid rgba(13,148,136,0.25)",
          }}>
            ↻ Send time recomputed for <strong>{effectiveSlowest}</strong>: <strong>{fmtDateMs(recomputedTiming.sendMs).split(" ")[1]}</strong>
          </div>
        ) : (
          <div style={{
            marginTop: 6, padding: "4px 8px", borderRadius: 5, fontSize: 11,
            color: "var(--r500)", background: "rgba(198,40,40,0.08)",
            border: "1px solid rgba(198,40,40,0.3)",
          }}>
            ⚠ <strong>{effectiveSlowest}</strong> cannot fit in this gap — include <strong>{candidate.chosenSlowestUnit}</strong> or select different units.
          </div>
        )
      )}
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
function ManualTab({ troops, loadingTroops, onLoadTroops, speedFactor, onQueue, queuedSources,
                     maxVillages, unitMinTroops }: {
  troops: VillageTroops[];
  loadingTroops: boolean;
  onLoadTroops: () => void;
  speedFactor: number;
  onQueue: (entry: SnipeQueueEntry) => void;
  queuedSources: Set<string>;
  maxVillages: number;
  unitMinTroops: Record<string, number>;
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
    ? computeCandidates(incomings, gapIdx, troops, target, speedFactor, maxVillages, unitMinTroops)
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
          <span style={{ fontSize: 11, color: "var(--n400)" }}>village your teammate is nobling</span>
        </div>
      </div>

      {/* Timings */}
      <div className="cfg-section">
        <div className="section-label">
          Attack timings
          <span style={{ fontSize: 11, color: "var(--n400)", fontWeight: 400, marginLeft: 8 }}>
            arrival time of each attack at the target
          </span>
        </div>
        {rows.map((row, idx) => (
          <div key={row.id} style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4 }}>
            <span style={{ fontSize: 11, color: "var(--n400)", minWidth: 18 }}>{idx + 1}.</span>
            <input
              className="input"
              type="datetime-local"
              step="0.001"
              value={row.dt}
              style={{ fontFamily: "monospace", fontSize: 12 }}
              onChange={(e) => setDt(row.id, e.target.value)}
            />
            <span style={{ fontSize: 11, color: "var(--n400)" }}>+ms:</span>
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
              style={{ fontSize: 11, padding: "1px 6px", color: "var(--r500)" }}
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
            style={{ color: "var(--r500)" }}
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
                gapAfterMs={gapA!.arrivalMs}
                gapBeforeMs={gapB!.arrivalMs}
                speedFactor={speedFactor}
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
  const [now, setNow] = useState(() => getServerNowMs());

  useEffect(() => {
    if (!visible) return;
    const id = setInterval(() => setNow(getServerNowMs()), 1000);
    return () => clearInterval(id);
  }, [visible]);

  const [nobleOnly, setNobleOnly] = useState(false);

  const [settings, setSettings] = useState<SnipeSettings>(loadSnipeSettings);

  function updateSettings(partial: Partial<SnipeSettings>) {
    const next = { ...settings, ...partial };
    setSettings(next);
    saveSnipeSettings(next);
  }

  const [gsD,  setGsD]  = useState(() => String(settings.gameSpeed));
  const [usD,  setUsD]  = useState(() => String(settings.unitSpeed));
  const [sigD, setSigD] = useState(() => String(settings.sigil));
  const [mvD,  setMvD]  = useState(() => String(settings.maxVillages));
  const [unitMinDrafts, setUnitMinDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(UNIT_ORDER_DISPLAY.map(u => [u, String(settings.unitMinTroops[u] ?? 0)]))
  );

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
      `${location.origin}/game.php?${sitterPrefix()}village=${encodeURIComponent(entry.sourceVillageId)}&screen=place`,
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

  function sendToAutosender() {
    if (!snipeQueue.length) return;
    const sitterT = new URLSearchParams(window.location.search).get("t") || null;
    for (const e of snipeQueue) {
      document.dispatchEvent(new CustomEvent("xbot:autosender:run", { detail: {
        action: "addToQueue",
        entry: {
          src: e.source,
          tgt: `${e.target.x}|${e.target.y}`,
          srcVillageId: e.sourceVillageId ?? null,
          type: "support",
          launch: e.sendMs,
          arrival: e.arrivalMs,
          units: e.units,
          note: e.label,
          sigilPct: settings.sigil,
          sitterT,
        },
      }}));
    }
    clearSnipeQueue();
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
      sigilPct: settings.sigil > 0 ? settings.sigil : undefined,
    }));
    localStorage.setItem("twKuminGluer_queue", JSON.stringify(kuminEntries));
    const vid = readCurrentVillageId();
    const url = vid
      ? `${location.origin}/game.php?${sitterPrefix()}village=${vid}&screen=memo`
      : `${location.origin}/game.php?${sitterPrefix()}screen=memo`;
    openTabPinned(url);
    setSnipeQueue([]);
    saveSnipeQueue([]);
  }

  const queuedSources = new Set(snipeQueue.map((e) => e.source));

  const scheduledMap = useMemo(() => computeScheduledByVillage(), [snipeQueue, troops]);

  const effectiveTroops = useMemo(
    () => troops.map((v) => ({
      ...v,
      troops: subtractScheduled(v.troops, scheduledMap.get(`${v.coord.x}|${v.coord.y}`) ?? {}),
    })),
    [troops, scheduledMap],
  );

  const coordKey = (c: Coord) => `${c.x}|${c.y}`;

  const target: Coord | null = (() => {
    if (!incomings.length) return null;
    const tally: Record<string, number> = {};
    for (const inc of incomings) { const k = coordKey(inc.target); tally[k] = (tally[k] ?? 0) + 1; }
    const best = Object.entries(tally).sort((a, b) => b[1] - a[1])[0];
    return best ? incomings.find((i) => coordKey(i.target) === best[0])!.target : null;
  })();

  const filteredIncomings = (
    target ? incomings.filter((i) => coordKey(i.target) === coordKey(target)) : incomings
  ).filter((i) => !nobleOnly || i.label.toLowerCase().includes("nobre"));

  const currentVillageId = readCurrentVillageId();
  const srcCoord: Coord | null = filteredIncomings[0]?.target ?? incomings[0]?.target ?? null;

  const sigilRatio  = 1 + settings.sigil / 100;
  const speedFactor = 1 / (settings.gameSpeed * settings.unitSpeed * sigilRatio);
  const candidates  = target && filteredIncomings.length >= 2
    ? computeCandidates(filteredIncomings, gapIdx, effectiveTroops, target, speedFactor, settings.maxVillages, settings.unitMinTroops)
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

  // Fetch world speed once on first open — same logic as planeador.fetchServerConfig
  const speedFetchedRef = useRef(false);
  useEffect(() => {
    if (!visible || speedFetchedRef.current) return;
    speedFetchedRef.current = true;
    fetchWorldSpeed().then(({ gameSpeed: gs, unitSpeed: us }) => {
      updateSettings({ gameSpeed: gs, unitSpeed: us });
      setGsD(String(gs));
      setUsD(String(us));
    });
  }, [visible]);

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
            {tab === "settings" ? "configuration" :
             tab === "recall" ? "snipe cancel" :
             tab === "manual" ? "teammate support" :
             target ? `target ${target.x}|${target.y}` : "gap snipe planner"}
          </span>
        </div>
        <TriggerVisibilityToggle moduleId="tw_snipe_scheduler" />
      </div>

      <div className="cfg-body snipe-body">

        {/* ── Tab bar ── */}
        <div className="cfg-section" style={{ paddingBottom: 0 }}>
          <div style={{ display: "flex", gap: 4 }}>
            <button
              className={`btn snipe-tab-btn${tab === "auto" ? " btn-save" : " btn-ghost"}`}
              onClick={() => setTab("auto")}
            >🏹 Auto</button>
            <button
              className={`btn snipe-tab-btn${tab === "manual" ? " btn-save" : " btn-ghost"}`}
              onClick={() => setTab("manual")}
            >✏️ Manual</button>
            <button
              className={`btn snipe-tab-btn${tab === "recall" ? " btn-save" : " btn-ghost"}`}
              onClick={() => setTab("recall")}
            >🔄 Snipe Cancel</button>
            <button
              className={`btn snipe-tab-btn${tab === "settings" ? " btn-save" : " btn-ghost"}`}
              onClick={() => setTab("settings")}
            >⚙ Settings</button>
          </div>
        </div>

        {/* ── Shared slim strip: Sigil + (auto only) Refresh + Nobre only ── */}
        <div className="cfg-section" style={{ paddingBottom: 4 }}>
          <div className="snipe-speed-row">
            <label className="snipe-speed-label">
              Sigil %
              <input className="input snipe-speed-input" type="number" step={1} min={0} max={100}
                title="Sigil item bonus — reduces troop travel time (e.g. 20 = 20% faster)"
                value={sigD}
                onChange={(e) => { setSigD(e.target.value); const n = parseFloat(e.target.value); if (Number.isFinite(n) && n >= 0) updateSettings({ sigil: n }); }}
                onBlur={() => { const n = parseFloat(sigD); if (!Number.isFinite(n) || n < 0) setSigD(String(settings.sigil)); }}
              />
            </label>
            {tab === "auto" && (
              <>
                <button className="btn btn-ghost"
                  style={{ fontSize: 11, padding: "2px 8px" }}
                  onClick={loadIncomings}>↺ Refresh</button>
                <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, cursor: "pointer", userSelect: "none" }}>
                  <input type="checkbox" checked={nobleOnly} onChange={(e) => setNobleOnly(e.target.checked)} />
                  Nobre only
                </label>
              </>
            )}
          </div>
        </div>

        {/* ── Troops — shared ── */}
        <div className="cfg-section">
          <div className="snipe-summary-row" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button className="btn btn-ghost snipe-timer-btn--icon"
              onClick={loadTroops} disabled={loadingTroops}
              title={troops.length ? "Recarregar tropas" : "Carregar tropas"}>
              {loadingTroops ? <span className="spinner" /> : "↺"}
            </button>
            <span className="snipe-summary-item">Aldeias carregadas: <strong>{troops.length}</strong></span>
          </div>
          {troopsError && <div className="snipe-error" style={{ marginTop: 4 }}>{troopsError}</div>}
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
                    <div className="state-msg">
                      {nobleOnly
                        ? 'Need at least 2 "Nobre" incomings. Disable "Nobre only" to see all attacks.'
                        : "Need at least 2 incomings to the same target."}
                    </div>
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
                          gapAfterMs={gapA!.arrivalMs}
                          gapBeforeMs={gapB!.arrivalMs}
                          speedFactor={speedFactor}
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
            troops={effectiveTroops}
            loadingTroops={loadingTroops}
            onLoadTroops={loadTroops}
            speedFactor={speedFactor}
            onQueue={addToSnipeQueue}
            queuedSources={queuedSources}
            maxVillages={settings.maxVillages}
            unitMinTroops={settings.unitMinTroops}
          />
        )}

        {/* ── RECALL TAB ── */}
        {tab === "recall" && (
          <RecallTab
            incomings={filteredIncomings.length >= 2 ? filteredIncomings : incomings}
            speedFactor={speedFactor}
            srcVillageId={currentVillageId}
            srcCoord={srcCoord}
            troops={effectiveTroops}
            loadingTroops={loadingTroops}
            onLoadTroops={loadTroops}
          />
        )}

        {/* ── SETTINGS TAB ── */}
        {tab === "settings" && (
          <>
            <div className="cfg-section">
              <div className="section-label">Speed &amp; timing</div>
              <div className="snipe-speed-row">
                <label className="snipe-speed-label">
                  Game speed
                  <input className="input snipe-speed-input" type="number" step={0.01} min={0.1} max={10}
                    value={gsD}
                    onChange={(e) => { setGsD(e.target.value); const n = parseFloat(e.target.value); if (Number.isFinite(n) && n > 0) updateSettings({ gameSpeed: n }); }}
                    onBlur={() => { const n = parseFloat(gsD); if (!Number.isFinite(n) || n <= 0) setGsD(String(settings.gameSpeed)); }}
                  />
                </label>
                <label className="snipe-speed-label">
                  Unit speed
                  <input className="input snipe-speed-input" type="number" step={0.01} min={0.1} max={2}
                    value={usD}
                    onChange={(e) => { setUsD(e.target.value); const n = parseFloat(e.target.value); if (Number.isFinite(n) && n > 0) updateSettings({ unitSpeed: n }); }}
                    onBlur={() => { const n = parseFloat(usD); if (!Number.isFinite(n) || n <= 0) setUsD(String(settings.unitSpeed)); }}
                  />
                </label>
              </div>
            </div>

            <div className="cfg-section">
              <div className="section-label">Filters</div>
              <div className="snipe-speed-row">
                <label className="snipe-speed-label">
                  Max villages
                  <input className="input snipe-speed-input" type="number" step={1} min={1} max={200}
                    title="Maximum number of candidate villages to show per gap"
                    value={mvD}
                    onChange={(e) => { setMvD(e.target.value); const n = parseInt(e.target.value, 10); if (Number.isFinite(n) && n >= 1) updateSettings({ maxVillages: n }); }}
                    onBlur={() => { const n = parseInt(mvD, 10); if (!Number.isFinite(n) || n < 1) setMvD(String(settings.maxVillages)); }}
                  />
                </label>
              </div>
            </div>

            <div className="cfg-section">
              <div className="section-label">
                Min troops per unit
                <span style={{ fontSize: 10, fontWeight: 400, marginLeft: 6, color: "var(--n400)", textTransform: "none" }}>
                  villages below these minimums are hidden (0 = no filter)
                </span>
              </div>
              <div className="snipe-units" style={{ padding: "4px 14px 8px" }}>
                {UNIT_ORDER_DISPLAY.map(unit => (
                  <div key={unit} className={`snipe-unitbox${(settings.unitMinTroops[unit] ?? 0) > 0 ? " snipe-unitbox--on" : ""}`}>
                    <img src={unitIconUrl(unit)} alt={unit} className="snipe-unit-icon"
                      onClick={() => {
                        const cur = settings.unitMinTroops[unit] ?? 0;
                        const next = cur > 0 ? 0 : 1;
                        setUnitMinDrafts(p => ({ ...p, [unit]: String(next) }));
                        updateSettings({ unitMinTroops: { ...settings.unitMinTroops, [unit]: next } });
                      }}
                    />
                    <input
                      className="snipe-unit-input"
                      type="number" min={0} step={1}
                      value={unitMinDrafts[unit] ?? "0"}
                      onChange={e => {
                        const raw = e.target.value;
                        setUnitMinDrafts(p => ({ ...p, [unit]: raw }));
                        const n = parseInt(raw, 10);
                        if (Number.isFinite(n) && n >= 0)
                          updateSettings({ unitMinTroops: { ...settings.unitMinTroops, [unit]: n } });
                      }}
                      onBlur={() => {
                        const n = parseInt(unitMinDrafts[unit] ?? "0", 10);
                        const val = Number.isFinite(n) && n >= 0 ? n : 0;
                        setUnitMinDrafts(p => ({ ...p, [unit]: String(val) }));
                        updateSettings({ unitMinTroops: { ...settings.unitMinTroops, [unit]: val } });
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
          </>
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
              {snipeQueue.map((e, i) => {
                const diff     = e.sendMs - now;
                const sent     = diff <= 0;
                const etaState = sent ? "sent" : diff > 3_600_000 ? "ok" : diff > 600_000 ? "soon" : "urgent";
                return (
                  <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, fontSize: 12 }}>
                    <span style={{ color: "var(--n400)", minWidth: 18 }}>#{i + 1}</span>
                    <span style={{ fontFamily: "var(--mono)", flex: 1 }}>{e.source} → {e.target.x}|{e.target.y}</span>
                    <span className={`gluer-eta-badge gluer-eta-badge--${etaState}`} title={fmtDateMs(e.sendMs)}>
                      {sent ? "enviado" : fmtCountdown(diff).split(".")[0]}
                    </span>
                    <button className="btn btn-ghost"
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
                );
              })}
            </div>
          </div>
        )}

      </div>

      {snipeQueue.length > 0 && (
        <div className="cfg-footer" style={{ gap: 6, flexWrap: "wrap" }}>
          <button className="btn btn-ghost" onClick={copySnipeBB} style={{ flex: 1 }}>
            {bbCopied ? "✓ Copiado" : "📋 Copiar BB"}
          </button>
          <button className="btn btn-ghost" onClick={openInKumin} style={{ flex: 1 }}>
            📜 Kumin
          </button>
          <button className="btn btn-ghost" onClick={sendToAutosender}
            style={{ flex: 1 }}
            title="Enviar para Auto Sender (xBot)">
            🚀 Autosend
          </button>
        </div>
      )}
    </div>
  );
}
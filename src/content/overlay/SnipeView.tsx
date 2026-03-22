/**
 * SnipeView — in-overlay panel for the Gap Snipe Scheduler.
 *
 * Option 2 architecture: mounted inside the existing overlay drawer as a
 * dedicated view (same slide-in shell as FakeSenderView / ConfigView).
 * All logic reads from the live TW DOM through `document` (Shadow DOM
 * content scripts share the same `document` as the page).
 *
 * The place-page automator stays in the userscript (tw_snipe_scheduler.user.js).
 * This panel only handles: gap reading, troop fetching, candidate computation,
 * countdowns, unit selection, and writing the plan to localStorage.
 *
 * Guard: if the current page doesn't have #commands_incomings the panel
 * shows a "not on overview" message instead of crashing.
 */

import React, {
  useCallback, useEffect, useState,
} from "react";

/* ─── Constants ───────────────────────────────────────────────────────────── */
const STORAGE_KEY_PLAN = "tw_gap_snipe_plan_v12";

const UNIT_MIN_PER_FIELD: Record<string, number> = {
  spear: 18, sword: 22, axe: 18, archer: 18, spy: 9,
  light: 10, marcher: 10, heavy: 11, ram: 30, catapult: 30,
  snob: 35, knight: 10,
};

// fastest → slowest (for candidate selection — we want the slowest feasible)
const UNIT_ORDER_FAST_TO_SLOW: string[] = [
  "spy", "light", "knight", "marcher", "heavy",
  "spear", "axe", "archer", "sword", "ram", "catapult", "snob",
].filter((u) => u in UNIT_MIN_PER_FIELD);

/* ─── Types ───────────────────────────────────────────────────────────────── */
interface Incoming { arrivalMs: number; }
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
  /** units with mpf <= chosenSlowest that this village actually has */
  allowedUnits: string[];
}

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

/* ─── DOM readers (run against document — same as the TW page) ────────────── */
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

function readTargetCoord(): Coord | null {
  let found: Coord | null = null;
  document.querySelectorAll<HTMLElement>("b.nowrap").forEach((el) => {
    if (found) return;
    const c = parseCoord(el.textContent ?? "");
    if (c) found = c;
  });
  return found;
}

function readIncomingsFromDOM(): Incoming[] {
  const wrap = document.querySelector("#commands_incomings");
  if (!wrap) return [];

  const list: Incoming[] = [];
  wrap.querySelectorAll<HTMLElement>("tr.command-row").forEach((tr) => {
    // skip supports
    const cmdType = (
      tr.getAttribute("data-command-type") ??
      tr.querySelector("[data-command-type]")?.getAttribute("data-command-type") ??
      ""
    ).toLowerCase();
    if (cmdType === "support") return;

    const endSpan = tr.querySelector<HTMLElement>("span[data-endtime]");
    const endSec  = parseInt(endSpan?.getAttribute("data-endtime") ?? "", 10);
    if (!endSec) return;

    const greyEl  = tr.querySelector<HTMLElement>("span.grey.small");
    const ms      = clampInt(parseInt(greyEl?.textContent?.trim() ?? "0", 10), 0, 999);
    list.push({ arrivalMs: endSec * 1000 + ms });
  });

  list.sort((a, b) => a.arrivalMs - b.arrivalMs);
  return list;
}

async function fetchOwnHomeTroops(villageId: string): Promise<VillageTroops[]> {
  const url = `game.php?village=${encodeURIComponent(villageId)}&screen=overview_villages&mode=units&type=own_home`;
  const html = await fetch(url, { credentials: "include" }).then((r) => r.text());
  const doc  = new DOMParser().parseFromString(html, "text/html");

  const table = [...doc.querySelectorAll<HTMLTableElement>("table.vis")]
    .find((t) => t.querySelector('thead img[src*="/graphic/unit/unit_"]'));
  if (!table) return [];

  // build header → unit mapping
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
    const label  = tr.querySelector<HTMLElement>(".quickedit-label");
    const coord  = parseCoord(label?.textContent ?? tr.textContent ?? "");
    if (!coord) return;

    const a      = tr.querySelector<HTMLAnchorElement>("a[href*='village=']");
    const idMatch = (a?.getAttribute("href") ?? "").match(/[?&]village=(\d+)/);
    const vId    = idMatch ? idMatch[1]! : null;

    const tds    = [...tr.querySelectorAll<HTMLElement>("td.unit-item")];
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

/* ─── Candidate computation (pure) ───────────────────────────────────────── */
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

  const candidates: Candidate[] = [];

  for (const src of troops) {
    let chosen: { unit: string; sendMs: number; arrivalMs: number } | null = null;

    // iterate slowest→fastest: first match wins (slowest feasible unit)
    for (const unit of [...UNIT_ORDER_FAST_TO_SLOW].reverse()) {
      const avail = src.troops[unit] ?? 0;
      if (!avail) continue;

      const tMs           = travelMs(unit, src.coord, target, speedFactor);
      const earliestSend  = (afterMs  + 1) - tMs;
      const latestSend    = (beforeMs - 1) - tMs;
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

    candidates.push({ src, chosenSlowestUnit: chosen.unit, sendMs: chosen.sendMs, arrivalMs: chosen.arrivalMs, allowedUnits });
  }

  candidates.sort((x, y) => x.sendMs - y.sendMs);
  return candidates.slice(0, 15);
}

/* ─── useCountdown — per-candidate live timer ────────────────────────────── */
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
function CandidateCard({
  candidate, gapIdx, target, midGapArrivalMs,
}: {
  candidate: Candidate;
  gapIdx: number;
  target: Coord;
  midGapArrivalMs: number;
}) {
  const [amounts, setAmounts] = useState<Record<string, number>>(() =>
    Object.fromEntries(candidate.allowedUnits.map((u) => [u, 0]))
  );
  const [timerActive, setTimerActive] = useState(false);
  const { display, past } = useCountdown(candidate.sendMs, timerActive);

  // reset amounts when candidate changes
  useEffect(() => {
    setAmounts(Object.fromEntries(candidate.allowedUnits.map((u) => [u, 0])));
    setTimerActive(false);
  }, [candidate.src.villageId, candidate.sendMs]);

  const toggleUnit = useCallback((unit: string) => {
    const next = (amounts[unit] ?? 0) > 0 ? 0 : (candidate.src.troops[unit] ?? 0);
    setAmounts((prev) => ({ ...prev, [unit]: next }));
    setDrafts((prev) => ({ ...prev, [unit]: String(next) }));
  }, [candidate, amounts]);

  const selectAll = useCallback(() => {
    const next = Object.fromEntries(
      candidate.allowedUnits.map((u) => [u, candidate.src.troops[u] ?? 0])
    );
    setAmounts(next);
    setDrafts(Object.fromEntries(Object.entries(next).map(([k, v]) => [k, String(v)])));
  }, [candidate]);

  const openSupport = useCallback(() => {
    if (!candidate.src.villageId) {
      alert("Cannot open support: villageId missing from troops list.");
      return;
    }
    const units = Object.fromEntries(
      Object.entries(amounts).filter(([, v]) => v > 0)
    );
    if (!Object.keys(units).length) {
      alert("Select at least one unit amount (> 0).");
      return;
    }
    const plan = {
      createdAt: Date.now(),
      sourceVillageId: candidate.src.villageId,
      target,
      unitsToSend: units,
      midGapArrivalMs,
    };
    localStorage.setItem(STORAGE_KEY_PLAN, JSON.stringify(plan));
    const url = `game.php?village=${encodeURIComponent(candidate.src.villageId)}&screen=place`;
    window.open(url, "_blank", "noopener,noreferrer");
  }, [candidate, amounts, target, midGapArrivalMs]);

  const { x, y } = candidate.src.coord;

  // Draft strings for unit inputs — allows clearing the box without snap-back
  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(candidate.allowedUnits.map((u) => [u, "0"]))
  );
  // Keep drafts in sync when amounts reset (candidate change)
  useEffect(() => {
    setDrafts(Object.fromEntries(candidate.allowedUnits.map((u) => [u, "0"])));
  }, [candidate.src.villageId, candidate.sendMs]);

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
        {/* Countdown timer */}
        <button
          className="btn btn-ghost snipe-timer-btn"
          onClick={() => setTimerActive((t) => !t)}
        >
          {timerActive ? "Stop" : "Timer"}
        </button>
        {timerActive && (
          <span className={`snipe-countdown${past ? " snipe-countdown--past" : ""}`}>
            {display}
          </span>
        )}
        <button className="btn btn-ghost" onClick={selectAll}>
          Select all
        </button>
        <button className="btn btn-save btn-save--dirty" onClick={openSupport}>
          Open support
        </button>
      </div>

      {/* Unit pickers */}
      <div className="snipe-units">
        {candidate.allowedUnits.map((unit) => {
          const avail = candidate.src.troops[unit] ?? 0;
          const val   = amounts[unit] ?? 0;
          const on    = val > 0;
          return (
            <div key={unit} className={`snipe-unitbox${on ? " snipe-unitbox--on" : ""}`}>
              <img
                src={unitIconUrl(unit)}
                alt={unit}
                className="snipe-unit-icon"
                onClick={() => toggleUnit(unit)}
                title={`Click to toggle all ${unit}`}
              />
              <div className="snipe-unit-avail">{avail}</div>
              <input
                className="snipe-unit-input"
                type="number"
                min={0}
                max={avail}
                step={1}
                value={drafts[unit] ?? String(val)}
                onChange={(e) => {
                  const raw = e.target.value;
                  setDrafts((prev) => ({ ...prev, [unit]: raw }));
                  const n = clampInt(parseInt(raw, 10), 0, avail);
                  if (Number.isFinite(n)) setAmounts((prev) => ({ ...prev, [unit]: n }));
                }}
                onBlur={() => {
                  const n = parseInt(drafts[unit] ?? "0", 10);
                  const clamped = Number.isFinite(n) ? clampInt(n, 0, avail) : val;
                  setAmounts((prev) => ({ ...prev, [unit]: clamped }));
                  setDrafts((prev) => ({ ...prev, [unit]: String(clamped) }));
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
function GapPill({
  idx, afterMs, beforeMs, selected, onClick,
}: {
  idx: number; afterMs: number; beforeMs: number;
  selected: boolean; onClick: () => void;
}) {
  const gapMs = beforeMs - afterMs;
  return (
    <button
      className={`snipe-gap-pill${selected ? " snipe-gap-pill--selected" : ""}`}
      onClick={onClick}
    >
      <span className="snipe-gap-label">Gap #{idx + 1}</span>
      <span className="snipe-gap-time">
        {fmtDateMs(afterMs).split(" ")[1]} → {fmtDateMs(beforeMs).split(" ")[1]}
      </span>
      <span className="snipe-gap-width">{(gapMs / 1000).toFixed(1)}s</span>
    </button>
  );
}

/* ─── SnipeView ───────────────────────────────────────────────────────────── */
export function SnipeView({ visible, onBack }: {
  visible: boolean;
  onBack: () => void;
}) {
  const [gameSpeed, setGameSpeed] = useState(1.4);
  const [unitSpeed, setUnitSpeed] = useState(0.75);
  // Draft strings so inputs can be cleared without snapping back
  const [gameSpeedDraft, setGameSpeedDraft] = useState("1.4");
  const [unitSpeedDraft, setUnitSpeedDraft] = useState("0.75");

  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const [target,    setTarget]    = useState<Coord | null>(null);
  const [incomings, setIncomings] = useState<Incoming[]>([]);
  const [troops,    setTroops]    = useState<VillageTroops[]>([]);
  const [gapIdx,    setGapIdx]    = useState(0);

  const speedFactor  = 1 / (gameSpeed * unitSpeed);
  const candidates   = target && incomings.length >= 2
    ? computeCandidates(incomings, gapIdx, troops, target, speedFactor)
    : [];

  const gapA         = incomings[gapIdx];
  const gapB         = incomings[gapIdx + 1];
  const midGapMs     = gapA && gapB
    ? Math.floor((gapA.arrivalMs + gapB.arrivalMs) / 2) : 0;

  // On visibility — auto-load incomings from DOM (cheap, no fetch)
  useEffect(() => {
    if (!visible) return;
    const inc  = readIncomingsFromDOM();
    const tgt  = readTargetCoord();
    setIncomings(inc);
    setTarget(tgt);
    setGapIdx(0);
    setTroops([]);
    setError(null);
  }, [visible]);

  // When speed params change and we have troops, candidates recompute automatically
  // (they're derived synchronously from state, no need to re-fetch)

  const load = useCallback(async () => {
    const vid = readCurrentVillageId();
    if (!vid) { setError("Could not detect current village id."); return; }
    setLoading(true); setError(null);
    try {
      const t = await fetchOwnHomeTroops(vid);
      setTroops(t);
    } catch (e) {
      setError(`Failed to fetch troops: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  const reload = useCallback(() => {
    const inc = readIncomingsFromDOM();
    const tgt = readTargetCoord();
    setIncomings(inc);
    setTarget(tgt);
    setGapIdx(0);
    setTroops([]);
    setError(null);
  }, []);

  const isOverview = Boolean(document.querySelector("#commands_incomings"));

  return (
    <div className={`cfg-view${visible ? " in" : ""}`}
         style={{ display: visible ? "flex" : "none" }}>

      {/* Header — same pattern as FakeSenderView */}
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
            {target ? `target ${target.x}|${target.y}` : "gap snipe planner"}
          </span>
        </div>
      </div>

      <div className="cfg-body snipe-body">

        {/* ── Not on overview guard ── */}
        {!isOverview && (
          <div className="cfg-section">
            <div className="state-msg">
              Navigate to an overview page with incomings to use this panel.
            </div>
          </div>
        )}

        {isOverview && (
          <>
            {/* ── Speed settings ── */}
            <div className="cfg-section">
              <div className="section-label">Speed settings</div>
              <div className="snipe-speed-row">
                <label className="snipe-speed-label">
                  Game speed
                  <input
                    className="input snipe-speed-input"
                    type="number" step={0.01} min={0.1} max={10}
                    value={gameSpeedDraft}
                    onChange={(e) => {
                      setGameSpeedDraft(e.target.value);
                      const n = parseFloat(e.target.value);
                      if (Number.isFinite(n) && n > 0) setGameSpeed(n);
                    }}
                    onBlur={() => {
                      const n = parseFloat(gameSpeedDraft);
                      if (!Number.isFinite(n) || n <= 0) setGameSpeedDraft(String(gameSpeed));
                    }}
                  />
                </label>
                <label className="snipe-speed-label">
                  Unit speed
                  <input
                    className="input snipe-speed-input"
                    type="number" step={0.01} min={0.1} max={2}
                    value={unitSpeedDraft}
                    onChange={(e) => {
                      setUnitSpeedDraft(e.target.value);
                      const n = parseFloat(e.target.value);
                      if (Number.isFinite(n) && n > 0) setUnitSpeed(n);
                    }}
                    onBlur={() => {
                      const n = parseFloat(unitSpeedDraft);
                      if (!Number.isFinite(n) || n <= 0) setUnitSpeedDraft(String(unitSpeed));
                    }}
                  />
                </label>
                <button className="btn btn-ghost" onClick={reload}>↺ Refresh</button>
              </div>
            </div>

            {/* ── Status line ── */}
            {error && (
              <div className="cfg-section">
                <div className="snipe-error">{error}</div>
              </div>
            )}

            {/* ── Target + incoming summary ── */}
            <div className="cfg-section">
              <div className="snipe-summary-row">
                <span className="snipe-summary-item">
                  Target: <strong>{target ? `${target.x}|${target.y}` : "—"}</strong>
                </span>
                <span className="snipe-summary-item">
                  Incomings: <strong>{incomings.length}</strong>
                </span>
                <span className="snipe-summary-item">
                  Villages loaded: <strong>{troops.length}</strong>
                </span>
              </div>
              <button
                className="btn btn-save btn-save--dirty"
                onClick={load}
                disabled={loading}
                style={{ marginTop: 8 }}
              >
                {loading ? <><span className="spinner" /> Loading troops…</> : "Load troops"}
              </button>
            </div>

            {/* ── Gap list ── */}
            {incomings.length >= 2 && (
              <div className="cfg-section">
                <div className="section-label">
                  Gaps ({incomings.length - 1})
                </div>
                <div className="snipe-gap-list">
                  {incomings.slice(0, -1).map((inc, i) => (
                    <GapPill
                      key={i}
                      idx={i}
                      afterMs={inc.arrivalMs}
                      beforeMs={incomings[i + 1]!.arrivalMs}
                      selected={gapIdx === i}
                      onClick={() => setGapIdx(i)}
                    />
                  ))}
                </div>
              </div>
            )}

            {incomings.length < 2 && (
              <div className="cfg-section">
                <div className="state-msg">Need at least 2 incomings to compute gaps.</div>
              </div>
            )}

            {/* ── Candidates ── */}
            {incomings.length >= 2 && gapA && gapB && (
              <div className="cfg-section">
                <div className="section-label">
                  Gap #{gapIdx + 1} candidates
                  {candidates.length > 0 && (
                    <span className="snipe-candidate-meta">
                      &nbsp;·&nbsp;
                      mid-gap: {fmtDateMs(midGapMs).split(" ")[1]}
                      &nbsp;·&nbsp;
                      {candidates.length} village{candidates.length !== 1 ? "s" : ""}
                    </span>
                  )}
                </div>

                {troops.length === 0 && (
                  <div className="state-msg">Press "Load troops" to compute candidates.</div>
                )}

                {troops.length > 0 && candidates.length === 0 && (
                  <div className="state-msg">
                    No feasible commands for this gap — try another gap or check speed settings.
                  </div>
                )}

                {candidates.map((c, i) => (
                  <CandidateCard
                    key={`${c.src.villageId ?? i}-${c.sendMs}`}
                    candidate={c}
                    gapIdx={gapIdx}
                    target={target!}
                    midGapArrivalMs={midGapMs}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
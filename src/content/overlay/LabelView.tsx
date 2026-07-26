/**
 * LabelView — in-overlay panel for the Mass Label + Renamer module.
 *
 * Data contract: the userscript writes sessionStorage["mlr_stats_v1"] every 500 ms.
 * This component reads that key at the same interval and renders live stats,
 * tag breakdown pills, an auto-label countdown, and a bulk-fake quick action.
 */

import React, { useEffect, useState } from "react";
import { TriggerVisibilityToggle } from "./TriggerVisibilityToggle";

const SNOB_ICON = "https://dspt.innogamescdn.com/asset/b2fb8d33/graphic/unit/unit_snob.webp";

/* ─── Data types ──────────────────────────────────────────────────────────── */
interface MlrStats {
  total: number;
  untagged: number;
  nobles: number;
  tagCounts: Record<string, number>;
  etiquetaDeadline: number | null;
}

const DEFAULT_STATS: MlrStats = {
  total: 0,
  untagged: 0,
  nobles: 0,
  tagCounts: {},
  etiquetaDeadline: null,
};

/* ─── Tag colour palette (matches userscript PALETTE) ────────────────────── */
const TAG_COLORS: Record<string, string> = {
  "[Morto]":         "#31c908",
  "[Desviado]":      "#ef8b10",
  "[Desviar]":       "#9232a8",
  "[Reconquistar]":  "#adb6c6",
  "[Reconquistado]": "#ffffff",
  "[Snipado]":       "#22e5db",
  "[Snipar]":        "#0d83dd",
  "[Fubar]":         "#004c00",
  "[Snipe Cancel]":  "#e20606",
  "[Fake]":          "#FFC0CB",
  "[Possível Full]": "#00007f",
  "[Reforçar]":      "#000000",
  " | Retirar":      "#0d9488",
  " | Vigiar":       "#ffd91c",
  " | ✓":            "#93cf82",
};

/** Strip surrounding brackets/pipes and trim for a short display name. */
function shortTagName(tag: string): string {
  return tag.replace(/^\[|\]$/g, "").replace(/^\s*\|\s*/, "").trim();
}

/* ─── useMountAnim ────────────────────────────────────────────────────────── */
function useMountAnim(trigger: boolean) {
  const [anim, setAnim] = useState(false);
  useEffect(() => {
    if (trigger) requestAnimationFrame(() => setAnim(true));
    else setAnim(false);
  }, [trigger]);
  return anim;
}

/* ─── LabelView ───────────────────────────────────────────────────────────── */
export function LabelView({
  visible,
  onBack,
  onClose,
}: {
  visible: boolean;
  onBack: () => void;
  onClose: () => void;
}) {
  const anim = useMountAnim(visible);

  const [stats, setStats] = useState<MlrStats>(DEFAULT_STATS);

  /* Poll sessionStorage["mlr_stats_v1"] every 500 ms while visible */
  useEffect(() => {
    if (!visible) return;
    const read = () => {
      try {
        const raw = sessionStorage.getItem("mlr_stats_v1");
        if (raw) setStats(JSON.parse(raw) as MlrStats);
      } catch { /* ignore parse errors */ }
    };
    read();
    const id = setInterval(read, 500);
    return () => clearInterval(id);
  }, [visible]);

  const { total, untagged, nobles, tagCounts, etiquetaDeadline } = stats;
  const labeled = total - untagged;

  /* Active tags (count > 0) */
  const activeTags = Object.entries(tagCounts).filter(([, count]) => count > 0);

  /* Auto-label countdown */
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!visible || etiquetaDeadline === null) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [visible, etiquetaDeadline]);

  function renderCountdown() {
    if (etiquetaDeadline === null) return null;
    const remaining = Math.max(0, Math.ceil((etiquetaDeadline - now) / 1000));

    // Estimate start: deadline minus a representative total window (minDelay + maxExtra/2)
    // Since we only store the deadline we derive an approximate elapsed fraction.
    // Use a fixed representative window of 135 s (120 min + 30/2 extra) as fallback.
    const representativeWindow = 135 * 1000;
    const elapsed = Math.max(0, representativeWindow - (etiquetaDeadline - now));
    const fillPct = Math.min(100, Math.round((elapsed / representativeWindow) * 100));

    return (
      <div className="cfg-section">
        <div className="section-label">Auto-label</div>
        <div className="label-eta-bar-wrap">
          <div className="label-eta-text">{remaining}s remaining</div>
          <div className="label-eta-track">
            <div className="label-eta-fill" style={{ width: `${fillPct}%` }} />
          </div>
        </div>
      </div>
    );
  }

  function handleBulkFake() {
    document.dispatchEvent(new CustomEvent("xbot:labelrenamer:bulk_fake"));
  }

  return (
    <div
      className={`cfg-view${anim ? " in" : ""}`}
      style={{ display: visible ? "flex" : "none" }}
    >
      {/* ── Header ── */}
      <div className="cfg-header">
        <button className="back-btn" onClick={onBack} aria-label="Back">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M9 2L4 7l5 5" stroke="currentColor" strokeWidth="1.8"
              strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <span className="cfg-icon">🏷️</span>
        <div className="cfg-header-text">
          <span className="cfg-title">Label + Renamer</span>
          <span className="cfg-subtitle">Live incoming tag overview</span>
        </div>
        <TriggerVisibilityToggle moduleId="mass_label_renamer" />
        <button className="close-btn" onClick={onClose} aria-label="Close">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M2 2l10 10M12 2L2 12" stroke="currentColor"
              strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* ── Body ── */}
      <div className="cfg-body">

        {/* Section 1 — Live overview */}
        <div className="cfg-section">
          <div className="section-label">Live overview</div>
          <div className="stats-bar" style={{ height: "auto", padding: "8px 12px" }}>
            <div className="stat-cell">
              <span className="stat-label">Total</span>
              <span className="stat-value">{total}</span>
            </div>
            <div className="stat-cell">
              <span className="stat-label">Labeled</span>
              <span className="stat-value" style={{ color: "var(--g500)" }}>{labeled}</span>
            </div>
            <div className="stat-cell">
              <span className="stat-label">Untagged</span>
              <span
                className="stat-value"
                style={{ color: untagged === 0 ? "var(--g500)" : "var(--a500)" }}
              >
                {untagged}
              </span>
            </div>
            <div className="stat-cell">
              <span className="stat-label">
                <img src={SNOB_ICON} alt="Nobre" style={{ width: 14, height: 14, verticalAlign: "middle", marginRight: 2 }} />
              </span>
              <span
                className="stat-value"
                style={{ color: nobles > 0 ? "var(--r500)" : "var(--n300)" }}
              >
                {nobles}
              </span>
            </div>
          </div>
        </div>

        {/* Section 2 — Tag breakdown */}
        {activeTags.length > 0 && (
          <div className="cfg-section">
            <div className="section-label">Active tags</div>
            <div className="label-tag-pills">
              {activeTags.map(([tag, count]) => {
                const color = TAG_COLORS[tag] ?? "#9ca3af";
                return (
                  <span
                    key={tag}
                    className="label-tag-pill"
                    style={{ borderLeft: `3px solid ${color}` }}
                  >
                    <span className="label-tag-pill-name">{shortTagName(tag)}</span>
                    <span className="label-tag-count">{count}</span>
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {/* Section 3 — Auto-label countdown */}
        {renderCountdown()}

        {/* Section 4 — Quick actions */}
        <div className="cfg-section">
          <div className="section-label">Quick actions</div>
          <div style={{ padding: "8px 14px 4px" }}>
            <button
              className={`btn btn-save${untagged > 0 ? " btn-save--dirty" : ""}`}
              style={{ width: "100%" }}
              onClick={handleBulkFake}
              disabled={untagged === 0}
            >
              Mark all untagged as [Fake]
            </button>
          </div>
          <div className="label-action-help">
            Applies [Fake] to all red (untagged) rows on the current page.
          </div>
        </div>

      </div>

      {/* ── Footer note (no save button — config lives in gear/ConfigView) ── */}
      <div className="label-footer-note cfg-subtitle">
        Settings via the gear icon on the module card.
      </div>
    </div>
  );
}

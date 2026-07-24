const TERMINAL = new Set(["sent", "failed"]);

/**
 * Aggregates pending units per source coord across all three scheduling queues:
 * xbot_autosender_queue, tw_snipe_queue_v1, twKuminGluer_queue.
 * Entries with status "sent" or "failed" in the autosender queue are excluded.
 */
export function computeScheduledByVillage(): Map<string, Record<string, number>> {
  const m = new Map<string, Record<string, number>>();

  function add(coord: string, units: Record<string, number>) {
    const ex = m.get(coord) ?? {};
    for (const [u, n] of Object.entries(units)) ex[u] = (ex[u] ?? 0) + (n as number);
    m.set(coord, ex);
  }

  try {
    const q: Array<{ src?: string; units?: Record<string, number>; status?: string }> =
      JSON.parse(localStorage.getItem("xbot_autosender_queue") ?? "[]") ?? [];
    for (const e of q) {
      if (e.src && e.units && !TERMINAL.has(e.status ?? "")) add(e.src, e.units);
    }
  } catch { /**/ }

  for (const [key, field] of [["tw_snipe_queue_v1", "source"], ["twKuminGluer_queue", "source"]] as const) {
    try {
      const q: Array<Record<string, unknown>> =
        JSON.parse(localStorage.getItem(key) ?? "[]") ?? [];
      for (const e of q) {
        const coord = e[field] as string | undefined;
        const units = e.units as Record<string, number> | undefined;
        if (coord && units) add(coord, units);
      }
    } catch { /**/ }
  }

  return m;
}

/** Returns a copy of `troops` with `scheduled` amounts subtracted, floored at 0. */
export function subtractScheduled(
  troops: Record<string, number>,
  scheduled: Record<string, number>,
): Record<string, number> {
  const out: Record<string, number> = { ...troops };
  for (const [u, n] of Object.entries(scheduled)) {
    out[u] = Math.max(0, (out[u] ?? 0) - n);
  }
  return out;
}

/** Reads world game/unit speed — game_data first, /page/settings HTML fallback. Same logic as planeador.fetchServerConfig. */
export async function fetchWorldSpeed(): Promise<{ gameSpeed: number; unitSpeed: number }> {
  const gd = (window as Window & { game_data?: { speed?: number; unit_speed?: number } }).game_data;
  if (gd?.speed != null && gd?.unit_speed != null) {
    return { gameSpeed: gd.speed, unitSpeed: gd.unit_speed };
  }
  try {
    const html = await fetch(`${location.origin}/page/settings`, { credentials: "include" }).then(r => r.text());
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

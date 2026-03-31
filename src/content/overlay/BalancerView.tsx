/**
 * BalancerView — in-overlay panel for the WH Balancer.
 * Communicates via CustomEvents (isolated ↔ main world bridge).
 */
import React, { useCallback, useEffect, useRef, useState } from "react";

/* ─── Types ─────────────────────────────────────────────────────────────── */
interface BalancerSettings {
  isMinting: boolean; lowPoints: number; highPoints: number; highFarm: number;
  builtOutPercentage: number; needsMorePercentage: number; reservePerVillage: number;
  maxDistance: number; hqPriorityEnabled: boolean; maxedOutPoints: number;
  lowPointsLongQueueHours: number; sendAllEnabled: boolean; sendAllIntervalMs: number;
  useClusters: boolean; numClusters: number; debugMode: boolean;
  premiumInstantEnabled: boolean; premiumStagingStrategy: string; premiumThreshold: number;
  premiumMinTradeAmount: number; premiumMoveAmount: number;
  premiumMaxDistance: number; premiumMaxTargetFillPct: number;
  premiumMaxPlansHardCap: number;
  premiumDonorKeepPct: number; premiumDonorKeepMin: number; premiumDonorMinExcess: number;
}
interface SendLink {
  source: string; target: string; distance: number;
  wood: number; stone: number; iron: number;
  sourceUrl?: string; targetUrl?: string;
  sourceId?: string; targetId?: string;
  isHqBoost?: boolean; isCrossCluster?: boolean;
}
interface BalancerSummary {
  totalWood: number; totalStone: number; totalIron: number;
  woodAverage: number; stoneAverage: number; ironAverage: number;
  links: number; merchants: number; avgDist: string;
}
interface CoordLock {
  key: string; wood: boolean; stone: boolean; iron: boolean;
  comment?: string | null; villageName?: string | null; villageUrl?: string | null;
}
interface PpLock { villageId: string; res: string; villageName?: string | null; remainingSec?: number | null; }
interface PpShipment {
  source: string; target: string; sourceName: string; targetName: string;
  sourceUrl?: string; targetUrl?: string;
  distance: number; wood: number; stone: number; iron: number;
}
interface PpPlan {
  id: string; payRes: string; neededRes: string;
  targetVillageName: string; targetVillageId: string;
  tradeAmount: number; instant: boolean;
  marketUrl?: string; remainingSec?: number | null;
  lastArrivalEtaSec?: number | null; lastArrivalMsAtFetch?: number | null;
  shipments: PpShipment[];
}
interface HqResult {
  villageName: string; villageUrl: string; villagePoints: number;
  buildingName: string; queueEndsSec: number;
  costWood: number; costStone: number; costIron: number;
  shortWood: number; shortStone: number; shortIron: number;
  hasShortfall: boolean;
}
type Tab = "sendlist" | "settings" | "locks" | "hq";

/* ─── Constants ──────────────────────────────────────────────────────────── */
const SETTINGS_KEY = "tm_whbalancer_settings";
const DEFAULT_SETTINGS: BalancerSettings = {
  isMinting: false, lowPoints: 3000, highPoints: 7000, highFarm: 23000,
  builtOutPercentage: 0.26, needsMorePercentage: 0.7, reservePerVillage: 0,
  maxDistance: 9999, hqPriorityEnabled: false, maxedOutPoints: 10471,
  lowPointsLongQueueHours: 3, sendAllEnabled: false, sendAllIntervalMs: 500,
  useClusters: false, numClusters: 1, debugMode: false,
  premiumInstantEnabled: false, premiumStagingStrategy: "weighted", premiumThreshold: 50000,
  premiumMinTradeAmount: 70000, premiumMoveAmount: 300000,
  premiumMaxDistance: 18, premiumMaxTargetFillPct: 0.90,
  premiumMaxPlansHardCap: 12,
  premiumDonorKeepPct: 0.10, premiumDonorKeepMin: 20000, premiumDonorMinExcess: 5000,
};

/* ─── Helpers ────────────────────────────────────────────────────────────── */
function dispatch(name: string, detail?: unknown) {
  document.dispatchEvent(new CustomEvent(name, detail !== undefined ? { detail } : undefined));
}

// Module-level cache updated on every xbot:balancer:state event.
// VillageLink reads from here — avoids cross-world window access.
type VillageData = {
  wood:number; stone:number; iron:number;
  rawWood:number|null; rawStone:number|null; rawIron:number|null; reserve:number;
  warehouseCapacity:number; availableMerchants:number; totalMerchants:number; points:number;
  farmSpaceUsed:number|null; farmSpaceTotal:number|null;
};
let _villageLookup: Record<string, VillageData> = {};
function getVillageData(id?: string): VillageData | null {
  if (!id) return null;
  return _villageLookup[id] ?? null;
}
function loadSettings(): BalancerSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<BalancerSettings>) };
  } catch { return { ...DEFAULT_SETTINGS }; }
}
function saveSettings(s: BalancerSettings) { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); }
function fmtNum(n: number) { return n.toLocaleString("de-DE"); }
function fmtHMS(totalSec: number) {
  const h = Math.floor(totalSec / 3600), m = Math.floor((totalSec % 3600) / 60), s = totalSec % 60;
  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
}

/* ─── TW resource icon — direct CDN image URLs (works inside Shadow DOM) ─── */
const RES_ICON_URLS: Record<string, string> = {
  wood:  "https://dspt.innogamescdn.com/asset/b2fb8d33/graphic/holz.png",
  stone: "https://dspt.innogamescdn.com/asset/b2fb8d33/graphic/lehm.png",
  iron:  "https://dspt.innogamescdn.com/asset/b2fb8d33/graphic/eisen.png",
};
function ResIcon({ res, dim }: { res: "wood"|"stone"|"iron"; dim?: boolean }): React.ReactElement {
  return (
    <img
      src={RES_ICON_URLS[res]}
      alt={res}
      title={res}
      style={{ width:14, height:14, verticalAlign:"middle",
               flexShrink:0, opacity: dim ? 0.25 : 1,
               display:"inline-block" }}
    />
  );
}

/* ─── useBalancerState ───────────────────────────────────────────────────── */
function useBalancerState() {
  const [links, setLinks]       = useState<SendLink[]>([]);
  const [summary, setSummary]   = useState<BalancerSummary | null>(null);
  const [running, setRunning]   = useState(false);
  const [status, setStatus]     = useState("");
  const [detected, setDetected] = useState(false);
  const [clusterMap, setClusterMap] = useState<{svg:string;legend:string;numClusters:number}|null>(null);
  const [ppPlans, setPpPlans] = useState<PpPlan[]>([]);
  const probeRef = useRef<ReturnType<typeof setInterval>|null>(null);
  useEffect(() => {
    const onState = (e: Event) => {
      const d = (e as CustomEvent).detail as { cleanLinks: SendLink[]; summary: BalancerSummary|null; running: boolean; statusText: string };
      setDetected(true);
      setLinks(d.cleanLinks ?? []); setSummary(d.summary ?? null);
      setRunning(d.running ?? false); setStatus(d.statusText ?? "");
      setClusterMap((d as any).clusterMap ?? null);
      setPpPlans((d as any).ppPlans ?? []);
      if ((d as any).villageLookup) _villageLookup = (d as any).villageLookup;
    };
    const onLocks = () => { setDetected(true); if (probeRef.current) { clearInterval(probeRef.current); probeRef.current = null; } };
    document.addEventListener("xbot:balancer:state", onState);
    document.addEventListener("xbot:balancer:locks", onLocks, { once: true });

    // Probe every second until the userscript responds — handles the race
    // where the content script mounts before the userscript listener is ready.
    dispatch("xbot:balancer:getLocks");
    probeRef.current = setInterval(() => dispatch("xbot:balancer:getLocks"), 1000);
    const probe = probeRef.current;

    return () => {
      document.removeEventListener("xbot:balancer:state", onState);
      document.removeEventListener("xbot:balancer:locks", onLocks);
      clearInterval(probe);
    };
  }, []);
  return { links, summary, running, status, detected, clusterMap, ppPlans };
}

/* ─── useLocksState ──────────────────────────────────────────────────────── */
function useLocksState() {
  const [coordLocks, setCoordLocks] = useState<CoordLock[]>([]);
  const [ppLocks, setPpLocks]       = useState<PpLock[]>([]);
  const refresh = useCallback(() => {
    const onLocks = (e: Event) => {
      const { coordLocks: raw, ppLocks: pp } = (e as CustomEvent).detail as {
        coordLocks: any; ppLocks: PpLock[];
      };
      // coordLocks is now an enriched array from the bridge
      const locks = Array.isArray(raw)
        ? raw.map((l: any) => ({
            key: l.key, wood: Boolean(l.wood), stone: Boolean(l.stone), iron: Boolean(l.iron),
            comment: l.comment ?? null, villageName: l.villageName ?? null, villageUrl: l.villageUrl ?? null,
          }))
        : Object.entries(raw as Record<string,any>).map(([key,lock]: [string,any]) => ({
            key, wood: Boolean(lock.wood), stone: Boolean(lock.stone), iron: Boolean(lock.iron),
            comment: null, villageName: null, villageUrl: null,
          }));
      setCoordLocks(locks);
      setPpLocks(pp ?? []);
    };
    document.addEventListener("xbot:balancer:locks", onLocks, { once: true });
    dispatch("xbot:balancer:getLocks");
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  return { coordLocks, ppLocks, refresh };
}

/* ─── VillageLink — clickable name with hover tooltip ────────────────────── */
function VillageLink({ name, url, villageId }: { name: string; url?: string; villageId?: string }) {
  const [hovered, setHovered] = useState(false);
  const coords    = name.match(/\((\d+\|\d+)\)/)?.[1] ?? null;
  const shortName = name.split(" ")[0] ?? name;

  const vData = getVillageData(villageId);

  return (
    <span className="bal-vil-wrap"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}>
      {url
        ? <a className="bal-vil-link" href={url} target="_self">{shortName}</a>
        : <span className="bal-vil-link bal-vil-link--nourl">{shortName}</span>
      }
      {coords && <span className="bal-vil-coords">{coords}</span>}
      {hovered && (
        <div className="bal-vil-tooltip">
          <div className="bal-vil-tooltip-name">{name}</div>
          {vData ? (
            <div className="bal-vil-tooltip-stats">
              <div className="bal-vil-tooltip-res">
                <span><ResIcon res="wood"/>  {fmtNum(vData.rawWood ?? vData.wood)}</span>
                <span><ResIcon res="stone"/> {fmtNum(vData.rawStone ?? vData.stone)}</span>
                <span><ResIcon res="iron"/>  {fmtNum(vData.rawIron ?? vData.iron)}</span>
              </div>
              {vData.reserve > 0 && (
                <div className="bal-vil-tooltip-reserve">
                  Reserve {fmtNum(vData.reserve)} → available:{" "}
                  {fmtNum(vData.wood)} / {fmtNum(vData.stone)} / {fmtNum(vData.iron)}
                </div>
              )}
              <div className="bal-vil-tooltip-meta">
                WH: <strong>{fmtNum(vData.warehouseCapacity)}</strong>
                {" · "}Merch: <strong>{vData.availableMerchants}/{vData.totalMerchants}</strong>
                {" · "}Pts: <strong>{fmtNum(vData.points)}</strong>
              </div>
              {vData.farmSpaceUsed != null && (
                <div className="bal-vil-tooltip-meta">
                  Farm: <strong>{vData.farmSpaceUsed}/{vData.farmSpaceTotal}</strong>
                </div>
              )}
            </div>
          ) : (
            <div className="bal-vil-tooltip-reserve">No data — run balancer first</div>
          )}
        </div>
      )}
    </span>
  );
}

/* ─── SendRow ────────────────────────────────────────────────────────────── */
function SendRow({ link, idx, sent, onSent }: { link: SendLink; idx: number; sent: boolean; onSent:(i:number)=>void }) {
  const handleSend = () => {
    if (sent) return;
    const srcId = link.sourceUrl?.match(/village=(\d+)/)?.[1] ?? link.source;
    const tgtId = link.targetUrl?.match(/village=(\d+)/)?.[1] ?? link.target;
    dispatch("xbot:balancer:send", { src:srcId, tgt:tgtId, wood:link.wood, stone:link.stone, iron:link.iron, idx });
    onSent(idx);
  };
  if (sent) return null;
  return (
    <tr className="bal-tr">
      <td className="bal-td bal-td-badges">
        {link.isHqBoost      && <span className="bal-badge bal-badge--hq">HQ</span>}
        {link.isCrossCluster && <span className="bal-badge bal-badge--cc">CC</span>}
      </td>
      <td className="bal-td bal-td-village">
        <VillageLink name={link.source} url={link.sourceUrl} villageId={link.sourceId} />
      </td>
      <td className="bal-td bal-td-arrow">→</td>
      <td className="bal-td bal-td-village">
        <VillageLink name={link.target} url={link.targetUrl} villageId={link.targetId} />
      </td>
      <td className="bal-td bal-td-dist">{link.distance}</td>
      <td className="bal-td bal-td-res">
        {link.wood  > 0 && <span className="bal-res"><ResIcon res="wood"  /> {fmtNum(link.wood)}</span>}
      </td>
      <td className="bal-td bal-td-res">
        {link.stone > 0 && <span className="bal-res"><ResIcon res="stone" /> {fmtNum(link.stone)}</span>}
      </td>
      <td className="bal-td bal-td-res">
        {link.iron  > 0 && <span className="bal-res"><ResIcon res="iron"  /> {fmtNum(link.iron)}</span>}
      </td>
      <td className="bal-td bal-td-action">
        <button className="btn btn-save btn-save--dirty"
          style={{ padding:"4px 10px", fontSize:11, whiteSpace:"nowrap" }}
          onClick={handleSend}>
          Send
        </button>
      </td>
    </tr>
  );
}

/* ─── useCountdown — live ticking ETA from anchor ───────────────────────── */
function useCountdown(etaSec: number | null | undefined, msAtFetch: number | null | undefined): number | null {
  const [remaining, setRemaining] = useState<number | null>(() => {
    if (etaSec == null || msAtFetch == null) return null;
    return Math.max(0, Math.floor(etaSec) - Math.floor((Date.now() - msAtFetch) / 1000));
  });
  useEffect(() => {
    if (etaSec == null || msAtFetch == null) { setRemaining(null); return; }
    const tick = () => setRemaining(Math.max(0, Math.floor(etaSec) - Math.floor((Date.now() - msAtFetch) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [etaSec, msAtFetch]);
  return remaining;
}

/* ─── PpPlanItem — single PP plan with live countdown ───────────────────── */
function PpPlanItem({ plan, onSent }: { plan: PpPlan; onSent: (src:string,tgt:string,w:number,s:number,i:number)=>void }) {
  const remaining = useCountdown(plan.lastArrivalEtaSec, plan.lastArrivalMsAtFetch);
  return (
    <div className="cfg-section bal-pp-plan">
      <div className="bal-pp-header">
        <span className={`bal-badge ${plan.instant ? "bal-pp-badge--now" : "bal-pp-badge"}`}>
          {plan.instant ? "⚡ NOW" : "PP"}
        </span>
        <span className="bal-pp-desc">
          {plan.instant
            ? <><strong>{plan.targetVillageName}</strong> already has{" "}
                <strong>{fmtNum(plan.tradeAmount)}</strong> <ResIcon res={plan.payRes as any}/>{" "}
                — trade for <ResIcon res={plan.neededRes as any}/> (10pp)</>
            : <>Move <strong>{fmtNum(plan.tradeAmount)}</strong> <ResIcon res={plan.payRes as any}/>{" "}
                → <strong>{plan.targetVillageName}</strong>, trade for <ResIcon res={plan.neededRes as any}/> (10pp)</>
          }
        </span>
        {plan.instant && plan.marketUrl && (
          <a className="bal-pp-market-link" href={plan.marketUrl} target="_self" title="Open market">
            🏪 Trade
          </a>
        )}
      </div>
      {!plan.instant && remaining != null && (
        <div className="bal-pp-eta">
          <span className="bal-pp-eta-label">Last merchant arrives in:</span>
          <span className={`bal-pp-eta-val${remaining <= 0 ? " bal-pp-eta-val--ready" : ""}`}>
            {remaining <= 0 ? "✓ Arrived — trade now!" : fmtHMS(remaining)}
          </span>
        </div>
      )}
      {!plan.instant && remaining == null && plan.shipments.length > 0 && (
        <div className="bal-pp-eta">
          <span className="bal-pp-eta-label" style={{ color:"var(--n300)" }}>ETA: send shipments to track arrival</span>
        </div>
      )}
      {!plan.instant && plan.shipments.length > 0 && (
        <table className="bal-table" style={{ marginTop:4 }}>
          <thead>
            <tr className="bal-thead-tr bal-thead-tr--pp">
              <th className="bal-th"></th>
              <th className="bal-th bal-th-village">Source</th>
              <th className="bal-th"></th>
              <th className="bal-th bal-th-village">Target</th>
              <th className="bal-th bal-th-dist">Dist</th>
              <th className="bal-th bal-th-res"><ResIcon res="wood"/></th>
              <th className="bal-th bal-th-res"><ResIcon res="stone"/></th>
              <th className="bal-th bal-th-res"><ResIcon res="iron"/></th>
              <th className="bal-th"></th>
            </tr>
          </thead>
          <tbody>
            {plan.shipments.map((s, i) => (
              <PpShipmentRow key={i} shipment={s} onSent={onSent} />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/* ─── PpPlanRows ─────────────────────────────────────────────────────────── */
function PpPlanRows({ plans, onSent }: { plans: PpPlan[]; onSent: (src:string,tgt:string,w:number,s:number,i:number)=>void }) {
  if (!plans.length) return null;
  return (
    <>
      {plans.map(plan => <PpPlanItem key={plan.id} plan={plan} onSent={onSent} />)}
    </>
  );
}

function PpShipmentRow({ shipment: s, onSent }: { shipment: PpShipment; onSent:(src:string,tgt:string,w:number,st:number,i:number)=>void }) {
  const [sent, setSent] = useState(false);
  const handleSend = () => {
    if (sent) return;
    dispatch("xbot:balancer:send", { src:s.source, tgt:s.target, wood:s.wood, stone:s.stone, iron:s.iron, idx:-1 });
    setSent(true);
    onSent(s.source, s.target, s.wood, s.stone, s.iron);
  };
  if (sent) return null;
  return (
    <tr className="bal-tr bal-tr--pp">
      <td className="bal-td bal-td-badges"/>
      <td className="bal-td bal-td-village">
        <VillageLink name={s.sourceName} url={s.sourceUrl} villageId={s.source}/>
      </td>
      <td className="bal-td bal-td-arrow">→</td>
      <td className="bal-td bal-td-village">
        <VillageLink name={s.targetName} url={s.targetUrl} villageId={s.target}/>
      </td>
      <td className="bal-td bal-td-dist">{s.distance}</td>
      <td className="bal-td bal-td-res">{s.wood  > 0 && <span className="bal-res"><ResIcon res="wood"/>  {fmtNum(s.wood)}</span>}</td>
      <td className="bal-td bal-td-res">{s.stone > 0 && <span className="bal-res"><ResIcon res="stone"/> {fmtNum(s.stone)}</span>}</td>
      <td className="bal-td bal-td-res">{s.iron  > 0 && <span className="bal-res"><ResIcon res="iron"/>  {fmtNum(s.iron)}</span>}</td>
      <td className="bal-td bal-td-action">
        <button className="btn btn-save btn-save--dirty"
          style={{ padding:"4px 10px", fontSize:11 }} onClick={handleSend}>
          Send
        </button>
      </td>
    </tr>
  );
}

/* ─── ClusterMap ─────────────────────────────────────────────────────────── */
function ClusterMap({ data }: { data: {svg:string;legend:string;numClusters:number}|null }) {
  const [open, setOpen] = useState(false);
  if (!data) return null;
  return (
    <div className="cfg-section">
      <button
        className={`btn${open ? " btn-save btn-save--saved" : " btn-ghost"}`}
        style={{ margin:"8px 14px", width:"calc(100% - 28px)", fontSize:11 }}
        onClick={() => setOpen(o => !o)}>
        {open ? "▲ Hide Cluster Map" : "▼ Cluster Map"}
      </button>
      {open && (
        <div style={{ padding:"0 14px 10px", overflowX:"auto" }}>
          <div dangerouslySetInnerHTML={{ __html: data.svg }} />
          <div style={{ fontSize:10, color:"var(--n300)", marginTop:4 }}
            dangerouslySetInnerHTML={{ __html: data.legend }} />
        </div>
      )}
    </div>
  );
}

/* ─── SendListTab ────────────────────────────────────────────────────────── */
function SendListTab({ links, summary, running, status, detected, clusterMap, ppPlans, onRun }: {
  links:SendLink[]; summary:BalancerSummary|null; running:boolean;
  status:string; detected:boolean; clusterMap:{svg:string;legend:string;numClusters:number}|null; ppPlans:PpPlan[]; onRun:()=>void;
}) {
  const [sentIds, setSentIds]       = useState<Set<number>>(new Set());
  const [sendingAll, setSendingAll] = useState(false);
  const iRef                        = useRef<ReturnType<typeof setInterval>|null>(null);
  const onSent = useCallback((i:number) => setSentIds(p => new Set([...p,i])), []);

  const handleSendAll = () => {
    const pending = links.map((l,i) => ({l,i})).filter(({i}) => !sentIds.has(i));
    if (!pending.length) return;
    setSendingAll(true); let ptr = 0;
    iRef.current = setInterval(() => {
      if (ptr >= pending.length) { clearInterval(iRef.current!); setSendingAll(false); return; }
      const { l, i } = pending[ptr++]!;
      const srcId = l.sourceUrl?.match(/village=(\d+)/)?.[1] ?? l.source;
      const tgtId = l.targetUrl?.match(/village=(\d+)/)?.[1] ?? l.target;
      dispatch("xbot:balancer:send", { src:srcId, tgt:tgtId, wood:l.wood, stone:l.stone, iron:l.iron, idx:i });
      setSentIds(p => new Set([...p,i]));
    }, 600);
  };
  useEffect(() => () => { if (iRef.current) clearInterval(iRef.current); }, []);
  const unsent = links.filter((_,i) => !sentIds.has(i)).length;

  return (
    <div className="cfg-body">
      {summary && (
        <div className="cfg-section">
          <div className="section-label">Summary</div>
          <div className="bal-summary">
            <div className="bal-summary-row">
              <span className="bal-summary-label">Totals</span>
              <span className="bal-summary-val">
                <ResIcon res="wood"/> {fmtNum(summary.totalWood)} &nbsp;
                <ResIcon res="stone"/> {fmtNum(summary.totalStone)} &nbsp;
                <ResIcon res="iron"/> {fmtNum(summary.totalIron)}
              </span>
            </div>
            <div className="bal-summary-row">
              <span className="bal-summary-label">Avg</span>
              <span className="bal-summary-val">
                <ResIcon res="wood"/> {fmtNum(summary.woodAverage)} &nbsp;
                <ResIcon res="stone"/> {fmtNum(summary.stoneAverage)} &nbsp;
                <ResIcon res="iron"/> {fmtNum(summary.ironAverage)}
              </span>
            </div>
            <div className="bal-summary-row">
              <span className="bal-summary-label">Routes</span>
              <span className="bal-summary-val">
                <strong>{summary.links}</strong> · ~<strong>{summary.merchants}</strong> merchants · avg <strong>{summary.avgDist}</strong>f
              </span>
            </div>
          </div>
        </div>
      )}
      <ClusterMap data={clusterMap} />
      <div className="cfg-section">
        <div style={{ display:"flex", gap:6, padding:"10px 14px" }}>
          <button
            className={`btn btn-save${running?"":links.length===0?" btn-save--dirty":" btn-save--saved"}`}
            onClick={onRun} disabled={running||!detected} style={{ flex:2 }}>
            {running ? <><span className="spinner"/> {status||"Running…"}</> : "▶ Run"}
          </button>
          {links.length > 0 && !sendingAll && (
            <button className="btn btn-save btn-save--dirty" onClick={handleSendAll}
              disabled={unsent===0} style={{ flex:1 }}>Send all ({unsent})</button>
          )}
          {sendingAll && (
            <button className="btn btn-ghost" style={{ flex:1 }}
              onClick={() => { clearInterval(iRef.current!); setSendingAll(false); }}>■ Stop</button>
          )}
        </div>
      </div>
      {links.length === 0 && !running && (
        <div className="cfg-section">
          <div className="state-msg">
            {!detected ? "Userscript not detected — ensure wh_balancer.user.js is active."
              : summary ? "No routes found." : "Press Run to compute."}
          </div>
        </div>
      )}
      <PpPlanRows plans={ppPlans} onSent={() => {}} />
      {links.length > 0 && (
        <div className="cfg-section" style={{ padding:0 }}>
          <table className="bal-table">
            <thead>
              <tr className="bal-thead-tr">
                <th className="bal-th"></th>
                <th className="bal-th bal-th-village">Source</th>
                <th className="bal-th"></th>
                <th className="bal-th bal-th-village">Target</th>
                <th className="bal-th bal-th-dist">Dist</th>
                <th className="bal-th bal-th-res"><ResIcon res="wood"/></th>
                <th className="bal-th bal-th-res"><ResIcon res="stone"/></th>
                <th className="bal-th bal-th-res"><ResIcon res="iron"/></th>
                <th className="bal-th"></th>
              </tr>
            </thead>
            <tbody>
              {links.map((link,i) => (
                <SendRow key={`${link.source}-${link.target}-${i}`} link={link} idx={i} sent={sentIds.has(i)} onSent={onSent}/>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ─── Tip — inline help tooltip ─────────────────────────────────────────── */
function Tip({ text }: { text: string }) {
  const [show, setShow] = useState(false);
  return (
    <span style={{ position:"relative", display:"inline-block", marginLeft:4 }}>
      <span
        style={{ display:"inline-flex", alignItems:"center", justifyContent:"center",
                 width:14, height:14, borderRadius:"50%", background:"var(--b-bg)",
                 border:"1px solid var(--b-br)", color:"var(--b500)", fontSize:9,
                 fontWeight:700, cursor:"help", userSelect:"none", flexShrink:0 }}
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}>?</span>
      {show && (
        <div style={{ position:"absolute", bottom:"calc(100% + 6px)", left:"50%", transform:"translateX(-50%)",
                      zIndex:999, background:"var(--n900)", color:"var(--n0)", padding:"8px 10px",
                      borderRadius:6, fontSize:11, lineHeight:1.45, whiteSpace:"normal",
                      width:260, boxShadow:"var(--shadow-xl)", pointerEvents:"none" }}>
          {text}
          <div style={{ position:"absolute", top:"100%", left:"50%", transform:"translateX(-50%)",
                        border:"5px solid transparent", borderTopColor:"var(--n900)" }}/>
        </div>
      )}
    </span>
  );
}

/* ─── SettingsTab ────────────────────────────────────────────────────────── */
function SettingsTab() {
  const [s, setS]         = useState<BalancerSettings>(loadSettings);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const set = <K extends keyof BalancerSettings>(key:K, val:BalancerSettings[K]) => {
    setS(p => ({ ...p, [key]:val })); setDirty(true); setSaved(false);
  };
  const handleSave = () => {
    saveSettings(s);
    if (!s.hqPriorityEnabled) {
      localStorage.removeItem("tm_whbalancer_hq_data_v1");
      localStorage.removeItem("tm_whbalancer_hq_timestamp_v1");
    }
    setDirty(false); setSaved(true); setTimeout(() => setSaved(false), 2200);
  };

  const numField = (label:string, key:keyof BalancerSettings, step=1, tip?:string) => (
    <div className="field">
      <div className="field-top">
        <span className="field-label">{label}{tip && <Tip text={tip}/>}</span>
      </div>
      <input className="input" type="number" step={step} value={s[key] as number}
        onChange={e => { const n=parseFloat(e.target.value); if (Number.isFinite(n)) set(key, n as BalancerSettings[typeof key]); }}/>
    </div>
  );
  const checkField = (label:string, key:keyof BalancerSettings, tip?:string) => (
    <label className="field-check">
      <span className="field-check-text">
        <span className="field-label">{label}{tip && <Tip text={tip}/>}</span>
      </span>
      <span className="toggle" onClick={e => e.stopPropagation()}>
        <input type="checkbox" checked={Boolean(s[key])}
          onChange={e => set(key, e.target.checked as BalancerSettings[typeof key])}/>
        <span className="toggle-thumb"/>
      </span>
    </label>
  );
  const selectField = (label:string, key:keyof BalancerSettings, options:{value:string;label:string}[], tip?:string) => (
    <div className="field">
      <div className="field-top">
        <span className="field-label">{label}{tip && <Tip text={tip}/>}</span>
      </div>
      <select className="input" value={s[key] as string}
        onChange={e => set(key, e.target.value as BalancerSettings[typeof key])}>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );

  return (
    <div className="cfg-body">
      <div className="cfg-section">
        <div className="section-label">General</div>
        {checkField("Ignore all rules (minting mode)", "isMinting",
          "Bypasses all thresholds and balances purely by average. Use when manually filling warehouses.")}
        {numField("Reserve per village (not sent)", "reservePerVillage", 1000,
          "Amount subtracted from every village's stock before computing excess. These resources are never sent.")}
        {numField("Global max distance (fields)", "maxDistance",60,
          "Routes longer than this distance will be skipped entirely.")}
      </div>
      <div className="cfg-section">
        <div className="section-label">Village thresholds</div>
        {numField("Prioritise villages below (pts)", "lowPoints",1,
          "Villages below this points threshold are treated as priority receivers — they receive resources first and are never donors unless they have a long build queue.")}
        {numField("Finished villages above (pts)", "highPoints",1,
          "Villages above this threshold are considered built-out and donate most of their surplus, keeping only the WH % defined below.")}
        {numField("High farm (pop)", "highFarm",1,
          "Villages with farm population above this value are also treated as built-out donors.")}
        {numField("WH % to keep in finished villages", "builtOutPercentage", 0.01,
          "Built-out villages keep this fraction of warehouse capacity and donate the rest. E.g. 0.02 means keep 2%.")}
        {numField("WH % target for priority villages", "needsMorePercentage", 0.01,
          "Priority villages (low points) aim to reach this fraction of warehouse capacity.")}
      </div>
      <div className="cfg-section">
        <div className="section-label">HQ Build Priority</div>
        {checkField("Prioritise empty build queues", "hqPriorityEnabled",
          "When enabled, fetches each village's HQ build queue. Villages with an empty queue and a next building are boosted as priority receivers — their shortage is raised to the exact building cost shortfall and they won't donate resources needed for construction.")}
        {numField("Maxed-out village (pts)", "maxedOutPoints",1,
          "Villages at or above this threshold are skipped during the HQ check — they are considered fully built. Default 10471 is the max points in TW PT.")}
        {numField("Long queue threshold (hours)", "lowPointsLongQueueHours",0.5,
          "Low-points villages with a build queue longer than this many hours are allowed to act as donors (they have time before they need to build).")}
      </div>
      <div className="cfg-section">
        <div className="section-label">Clusters</div>
        {checkField("Enable spatial clustering", "useClusters",
          "Divides villages into geographic clusters and balances within each cluster instead of globally. Useful for large or spread-out accounts.")}
        {numField("Number of clusters", "numClusters",1,
          "How many clusters to divide the account into. Villages are grouped by geographic proximity on a grid.")}
      </div>
      <div className="cfg-section">
        <div className="section-label">Instant Trade (PP) <span style={{fontSize:10,color:"var(--n300)",fontWeight:400}}>10pp</span></div>
        {checkField("Enable Merchant Exchange", "premiumInstantEnabled",
          "When enabled, the balancer will suggest Merchant Exchange (10pp) routes to correct resource imbalances that cannot be fixed by normal shipments alone.")}
        {selectField("Routing strategy", "premiumStagingStrategy", [
          { value:"weighted", label:"Weighted donors" },
          { value:"largest",  label:"Largest donor" },
        ], 
        "Weighted donors: splits the required amount across multiple donors, prioritising closer ones. More reliable when merchants are spread out.Largest donor: uses the biggest single donor first. Fewer shipments but can fail if that donor has low merchants or is far away.")}
        {numField("Imbalance threshold", "premiumThreshold", 1000,
          "Minimum global imbalance (most abundant minus least abundant resource) required before a PP plan is attempted.")}
        {numField("Min trade amount", "premiumMinTradeAmount", 1000,
          "Minimum amount (in the paying resource) that must be staged via shipments before a PP plan is accepted. Plans below this are discarded.")}
        {numField("Move amount", "premiumMoveAmount", 1000,
          "Upper cap for how much the planner will try to move for a single PP route. The actual amount may be lower due to merchants, donor excess, or distance limits.")}
        {numField("Max distance (fields)", "premiumMaxDistance",1,
          "Maximum distance between a donor village and the PP target. Lower values reduce travel time but may prevent plans if donors are far away.")}
        {numField("Max target fill (%)", "premiumMaxTargetFillPct", 0.01,
          "Prevents overfilling the target. E.g. 0.90 means the target won't be planned above 90% of warehouse capacity for the paying resource.")}
        {numField("Max plans (hard cap)", "premiumMaxPlansHardCap",1,
          "Hard limit on how many PP routes can be generated per run. Prevents accidental large PP spending.")}
        {numField("Donor keep (%)", "premiumDonorKeepPct", 0.01,
          "Donor villages keep at least this fraction of their warehouse capacity in the paying resource. Only amounts above this are considered excess.")}
        {numField("Donor keep min", "premiumDonorKeepMin", 1000,
          "Minimum absolute amount a donor always keeps in the paying resource, regardless of the percentage rule.")}
        {numField("Donor min excess", "premiumDonorMinExcess", 1000,
          "Minimum excess required for a village to qualify as a PP donor. Villages with less excess are ignored to avoid tiny shipments.")}
      </div>
      <div className="cfg-section">
        <div className="section-label">Send All</div>
        {checkField("Enable Send All automation", "sendAllEnabled")}
        {numField("Interval between sends (ms)", "sendAllIntervalMs")}
      </div>
      <div className="cfg-section cfg-section-checks">
        <div className="section-label">Developer</div>
        {checkField("Debug logging (console)", "debugMode",
          "Enables verbose [WH] console logging for algorithm steps, HQ boosts, cluster assignments and send decisions.")}
      </div>
      <div className="cfg-footer">
        <button className={`btn btn-save${dirty?" btn-save--dirty":""}${saved?" btn-save--saved":""}`}
          onClick={handleSave} disabled={!dirty&&!saved} style={{ flex:2 }}>
          {saved ? "✓ Saved" : dirty ? "Save settings" : "No changes"}
        </button>
        <button className="btn btn-ghost" style={{ flex:1 }}
          onClick={() => { setS(loadSettings()); setDirty(false); }}>Reset</button>
      </div>
    </div>
  );
}

/* ─── LocksTab ───────────────────────────────────────────────────────────── */
function LocksTab() {
  const { coordLocks, ppLocks, refresh } = useLocksState();
  const [coordInput, setCoordInput]     = useState("");
  const [commentInput, setCommentInput] = useState("");
  const [lockWood, setLockWood]   = useState(true);
  const [lockStone, setLockStone] = useState(true);
  const [lockIron, setLockIron]   = useState(true);
  const [addError, setAddError]   = useState<string|null>(null);

  const clearCoord = (key:string) => { dispatch("xbot:balancer:clearCoordLock",{coords:key}); setTimeout(refresh,100); };
  const clearAllPp = () => { dispatch("xbot:balancer:clearPpLocks"); setTimeout(refresh,100); };

  const handleAdd = () => {
    const m = coordInput.match(/(\d{1,3})\|(\d{1,3})/);
    if (!m) { setAddError("Invalid coords — use format 451|601"); return; }
    if (!lockWood && !lockStone && !lockIron) { setAddError("Select at least one resource"); return; }
    setAddError(null);
    dispatch("xbot:balancer:setCoordLock", {
      coords: `${parseInt(m[1]!,10)}|${parseInt(m[2]!,10)}`,
      wood: lockWood, stone: lockStone, iron: lockIron,
      comment: commentInput.trim(),
    });
    setCoordInput(""); setCommentInput("");
    setTimeout(refresh, 100);
  };

  return (
    <div className="cfg-body">
      {/* Add new lock form */}
      <div className="cfg-section">
        <div className="section-label">Add coord lock</div>
        <div style={{ padding:"8px 14px", display:"flex", flexDirection:"column", gap:6 }}>
          <div style={{ display:"flex", gap:6, alignItems:"center" }}>
            <input className="input" placeholder="451|601" value={coordInput}
              onChange={e => { setCoordInput(e.target.value); setAddError(null); }}
              style={{ width:90, flexShrink:0 }}
              onKeyDown={e => e.key === "Enter" && handleAdd()}/>
            <span style={{ fontSize:11, color:"var(--n400)" }}>Lock:</span>
            {(["wood","stone","iron"] as const).map(res => (
              <label key={res} style={{ display:"flex", alignItems:"center", gap:3, cursor:"pointer", fontSize:11 }}>
                <input type="checkbox"
                  checked={res==="wood"?lockWood:res==="stone"?lockStone:lockIron}
                  onChange={e => res==="wood"?setLockWood(e.target.checked):res==="stone"?setLockStone(e.target.checked):setLockIron(e.target.checked)}/>
                <ResIcon res={res}/>
              </label>
            ))}
          </div>
          <input className="input" placeholder="Comment (optional)" value={commentInput}
            onChange={e => setCommentInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleAdd()}
            style={{ fontSize:12 }}/>
          {addError && <span style={{ fontSize:11, color:"var(--r500)" }}>{addError}</span>}
          <button className="btn btn-save btn-save--dirty" onClick={handleAdd}>+ Add lock</button>
        </div>
      </div>
      <div className="cfg-section">
        <div className="section-label">Manual coord locks ({coordLocks.length})</div>
        {coordLocks.length === 0
          ? <div className="state-msg">No manual locks set.</div>
          : coordLocks.map(lock => (
            <div key={lock.key} className="bal-lock-row" style={{ flexDirection:"column", alignItems:"stretch", gap:4 }}>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                {/* Village name as link if available, else raw coords */}
                {lock.villageUrl
                  ? <a href={lock.villageUrl} target="_self" className="bal-vil-link"
                      style={{ fontSize:12, fontWeight:600 }}>
                      {lock.villageName?.split(" (")[0] ?? lock.key}
                    </a>
                  : <span className="bal-lock-coord">{lock.villageName?.split(" (")[0] ?? lock.key}</span>
                }
                <span className="bal-vil-coords" style={{ fontSize:10.5 }}>{lock.key}</span>
                <span className="bal-lock-res" style={{ marginLeft:"auto" }}>
                  <ResIcon res="wood"  dim={!lock.wood}/>
                  <ResIcon res="stone" dim={!lock.stone}/>
                  <ResIcon res="iron"  dim={!lock.iron}/>
                </span>
                <button className="btn btn-ghost" style={{ flex:"none", padding:"3px 8px", fontSize:10.5 }}
                  onClick={() => clearCoord(lock.key)}>✕</button>
              </div>
              {lock.comment && (
                <span style={{ fontSize:10.5, color:"var(--n400)", paddingLeft:2, fontStyle:"italic" }}>
                  {lock.comment}
                </span>
              )}
            </div>
          ))
        }
      </div>
      <div className="cfg-section">
        <div className="bal-section-header">
          <span className="section-label" style={{ padding:0 }}>PP resource locks ({ppLocks.length})</span>
          {ppLocks.length > 0 && (
            <button className="btn btn-ghost" style={{ flex:"none", padding:"2px 8px", fontSize:10.5 }}
              onClick={clearAllPp}>Clear all</button>
          )}
        </div>
        {ppLocks.length === 0
          ? <div className="state-msg">No PP locks active.</div>
          : ppLocks.map((lock,i) => (
            <div key={i} className="bal-lock-row">
              <span className="bal-lock-coord" style={{ fontFamily:"var(--mono)", fontSize:11 }}>
                {lock.villageName || `#${lock.villageId}`}
              </span>
              <span className="bal-lock-res" style={{ display:"flex", alignItems:"center", gap:4 }}>
                <ResIcon res={lock.res as "wood"|"stone"|"iron"}/>
                <span style={{ fontSize:11, color:"var(--n500)" }}>{lock.res}</span>
              </span>
              {lock.remainingSec != null && (
                <span style={{ fontSize:10.5, fontFamily:"var(--mono)", color: lock.remainingSec <= 0 ? "var(--g600)" : "var(--n400)", marginLeft:"auto" }}>
                  {lock.remainingSec <= 0 ? "✓ Ready" : fmtHMS(lock.remainingSec)}
                </span>
              )}
            </div>
          ))
        }
        {ppLocks.length > 0 && (
          <span className="field-help" style={{ display:"block", padding:"4px 14px 10px" }}>
            PP locks clear automatically on cancel. Use "Clear all" for orphaned locks.
          </span>
        )}
      </div>
      <div className="cfg-section">
        <div style={{ padding:"10px 14px" }}>
          <button className="btn btn-ghost" onClick={refresh}>↺ Refresh</button>
        </div>
      </div>
    </div>
  );
}

/* ─── HQTab ──────────────────────────────────────────────────────────────── */
function HQTab({ hqEnabled }: { hqEnabled: boolean }) {
  const [results, setResults]   = useState<HqResult[]>([]);
  const [loading, setLoading]   = useState(false);
  const [progress, setProgress] = useState(0);
  const [total, setTotal]       = useState(0);
  const [error, setError]       = useState<string|null>(null);
  const [cached, setCached]     = useState(false);
  const [ageMin, setAgeMin]     = useState<number|null>(null);

  useEffect(() => {
    const onR = (e:Event) => {
      const d = (e as CustomEvent).detail as {
        loading?:boolean; progress?:number; total?:number;
        results?:HqResult[]; cached?:boolean; ageMin?:number|null; error?:string;
      };
      if (d.error) { setError(d.error); setLoading(false); return; }
      if (d.loading) { setLoading(true); setProgress(d.progress??0); setTotal(d.total??0); return; }
      if (d.results) {
        setResults([...d.results].sort((a,b) => {
          if (a.hasShortfall !== b.hasShortfall) return a.hasShortfall ? -1 : 1;
          return a.queueEndsSec - b.queueEndsSec;
        }));
        setCached(!!d.cached); setAgeMin(d.ageMin??null); setLoading(false); setError(null);
      }
    };
    document.addEventListener("xbot:balancer:hqResults", onR);
    return () => document.removeEventListener("xbot:balancer:hqResults", onR);
  }, []);

  const runCheck = () => { setError(null); setLoading(true); setResults([]); dispatch("xbot:balancer:hqCheck"); };
  const shortfalls = results.filter(r => r.hasShortfall).length;

  return (
    <div className="cfg-body">
      <div className="cfg-section">
        <div style={{ padding:"10px 14px", display:"flex", flexDirection:"column", gap:6 }}>
          {!hqEnabled && (
            <div className="field-help" style={{ color:"var(--a500)" }}>
              ⚠ "Prioritise empty build queues" is off in Settings — enable to auto-fetch on Run.
            </div>
          )}
          <button className="btn btn-save btn-save--dirty" onClick={runCheck} disabled={loading}>
            {loading
              ? <><span className="spinner"/> {total>0 ? `Checking… (${progress}/${total})` : "Checking…"}</>
              : cached ? "↺ Refresh HQ data" : "Check HQ queues"}
          </button>
          {cached && ageMin !== null && (
            <span className="field-help">Using cached data from {ageMin} min ago.</span>
          )}
        </div>
      </div>
      {error && <div className="cfg-section"><div className="state-msg" style={{ color:"var(--r500)" }}>{error}</div></div>}
      {!loading && results.length===0 && !error && (
        <div className="cfg-section"><div className="state-msg">Press "Check HQ queues" to inspect build queues.</div></div>
      )}
      {results.length > 0 && (
        <div className="cfg-section">
          <div className="section-label">
            {shortfalls > 0 ? `${shortfalls} village${shortfalls!==1?"s":""} need resources` : "All villages ready ✓"}
          </div>
          {results.map((r,i) => (
            <div key={i} className={`bal-hq-row${r.hasShortfall?" bal-hq-row--warn":" bal-hq-row--ok"}`}>
              <div className="bal-hq-top">
                <a className="bal-hq-name" href={r.villageUrl} target="_self">{r.villageName}</a>
                <span className="bal-hq-building">{r.buildingName}</span>
                <span className="bal-hq-eta">{r.queueEndsSec>0 ? fmtHMS(r.queueEndsSec) : "now"}</span>
                <span className={`bal-hq-status${r.hasShortfall?" bal-hq-status--warn":""}`}>
                  {r.hasShortfall ? "⚠ Short" : "✓"}
                </span>
              </div>
              {r.hasShortfall && (
                <div className="bal-hq-shortfall">
                  {r.shortWood  > 0 && <span className="bal-res"><ResIcon res="wood"/>  {fmtNum(r.shortWood)}</span>}
                  {r.shortStone > 0 && <span className="bal-res"><ResIcon res="stone"/> {fmtNum(r.shortStone)}</span>}
                  {r.shortIron  > 0 && <span className="bal-res"><ResIcon res="iron"/>  {fmtNum(r.shortIron)}</span>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── BalancerView ───────────────────────────────────────────────────────── */
export function BalancerView({ visible, onBack }: { visible:boolean; onBack:()=>void }): React.ReactElement {
  const [tab, setTab]                               = useState<Tab>("sendlist");
  const { links, summary, running, status, detected, clusterMap, ppPlans } = useBalancerState();
  const settings                                    = loadSettings();
  const handleRun = useCallback(() => dispatch("xbot:balancer:run"), []);
  const tabBtn = (t:Tab, label:string) => (
    <button
      className={`btn${tab===t?" btn-save btn-save--saved":" btn-ghost"}`}
      style={{ fontSize:11, padding:"5px 0", flex:1 }}
      onClick={() => setTab(t)}>{label}</button>
  );
  return (
    <div className={`cfg-view${visible?" in":""}`} style={{ display:visible?"flex":"none" }}>
      <div className="cfg-header">
        <button className="back-btn" onClick={onBack}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M9 2L4 7l5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <span className="cfg-icon">⚖️</span>
        <div className="cfg-header-text">
          <span className="cfg-title">WH Balancer</span>
          <span className="cfg-subtitle">
            {running ? (status||"running…")
              : summary ? `${summary.links} routes · ${summary.merchants} merchants`
              : detected ? "ready" : "waiting for userscript…"}
          </span>
        </div>
        {running && <span className="live-pip" style={{ marginLeft:"auto", marginRight:4 }}/>}
      </div>
      <div className="cfg-section" style={{ paddingBottom:0, flexShrink:0 }}>
        <div style={{ display:"flex", gap:3, padding:"8px 14px 0" }}>
          {tabBtn("sendlist","📋 Sends")}
          {tabBtn("settings","⚙️ Settings")}
          {tabBtn("locks","🔒 Locks")}
          {tabBtn("hq","🏗 HQ")}
        </div>
      </div>
      {tab==="sendlist" && <SendListTab links={links} summary={summary} running={running} status={status} detected={detected} clusterMap={clusterMap} ppPlans={ppPlans} onRun={handleRun}/>}
      {tab==="settings" && <SettingsTab/>}
      {tab==="locks"    && <LocksTab/>}
      {tab==="hq"       && <HQTab hqEnabled={settings.hqPriorityEnabled}/>}
    </div>
  );
}
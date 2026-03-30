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
  premiumInstantEnabled: boolean; premiumThreshold: number;
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
interface CoordLock { key: string; wood: boolean; stone: boolean; iron: boolean; }
interface PpLock { villageId: string; res: string; }
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
  premiumInstantEnabled: false, premiumThreshold: 50000,
  premiumMinTradeAmount: 70000, premiumMoveAmount: 300000,
  premiumMaxDistance: 18, premiumMaxTargetFillPct: 0.90,
  premiumMaxPlansHardCap: 12,
  premiumDonorKeepPct: 0.10, premiumDonorKeepMin: 20000, premiumDonorMinExcess: 5000,
};

/* ─── Helpers ────────────────────────────────────────────────────────────── */
function dispatch(name: string, detail?: unknown) {
  document.dispatchEvent(new CustomEvent(name, detail !== undefined ? { detail } : undefined));
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
  const probeRef = useRef<ReturnType<typeof setInterval>|null>(null);
  useEffect(() => {
    const onState = (e: Event) => {
      const d = (e as CustomEvent).detail as { cleanLinks: SendLink[]; summary: BalancerSummary|null; running: boolean; statusText: string };
      setDetected(true);
      setLinks(d.cleanLinks ?? []); setSummary(d.summary ?? null);
      setRunning(d.running ?? false); setStatus(d.statusText ?? "");
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
  return { links, summary, running, status, detected };
}

/* ─── useLocksState ──────────────────────────────────────────────────────── */
function useLocksState() {
  const [coordLocks, setCoordLocks] = useState<CoordLock[]>([]);
  const [ppLocks, setPpLocks]       = useState<PpLock[]>([]);
  const refresh = useCallback(() => {
    const onLocks = (e: Event) => {
      const { coordLocks: raw, ppLocks: pp } = (e as CustomEvent).detail as {
        coordLocks: Record<string,{wood?:boolean;stone?:boolean;iron?:boolean}>; ppLocks: PpLock[];
      };
      setCoordLocks(Object.entries(raw).map(([key,lock]) => ({
        key, wood: Boolean(lock.wood), stone: Boolean(lock.stone), iron: Boolean(lock.iron),
      })));
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

  // Look up live village data from balancer state for the tooltip
  const vData = villageId
    ? (window as Window & { TM_WH_BALANCER_STATE?: { villageLookup?: Record<string,{
        wood:number; stone:number; iron:number;
        warehouseCapacity:number; availableMerchants:number; totalMerchants:number; points:number;
      }> } }).TM_WH_BALANCER_STATE?.villageLookup?.[villageId]
    : null;

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
          {vData && (
            <div className="bal-vil-tooltip-stats">
              <span><ResIcon res="wood"/>  {fmtNum(vData.wood)}</span>
              <span><ResIcon res="stone"/> {fmtNum(vData.stone)}</span>
              <span><ResIcon res="iron"/>  {fmtNum(vData.iron)}</span>
              <span style={{borderTop:"1px solid rgba(255,255,255,0.15)", paddingTop:3, marginTop:2, display:"block"}}>
                WH: {fmtNum(vData.warehouseCapacity)} · Merch: {vData.availableMerchants}/{vData.totalMerchants} · Pts: {fmtNum(vData.points)}
              </span>
            </div>
          )}
        </div>
      )}
    </span>
  );
}

/* ─── SendRow ────────────────────────────────────────────────────────────── */
function SendRow({ link, idx, onSent }: { link: SendLink; idx: number; onSent:(i:number)=>void }) {
  const [sent, setSent] = useState(false);
  const handleSend = () => {
    if (sent) return;
    const srcId = link.sourceUrl?.match(/village=(\d+)/)?.[1] ?? link.source;
    const tgtId = link.targetUrl?.match(/village=(\d+)/)?.[1] ?? link.target;
    dispatch("xbot:balancer:send", { src:srcId, tgt:tgtId, wood:link.wood, stone:link.stone, iron:link.iron, idx });
    setSent(true); onSent(idx);
  };
  return (
    <tr className={`bal-tr${sent ? " bal-tr--sent" : ""}`}>
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
        <button
          className={`btn${sent ? " btn-save btn-save--saved" : " btn-save btn-save--dirty"}`}
          style={{ padding:"4px 10px", fontSize:11, whiteSpace:"nowrap" }}
          onClick={handleSend} disabled={sent}>
          {sent ? "✓" : "Send"}
        </button>
      </td>
    </tr>
  );
}

/* ─── SendListTab ────────────────────────────────────────────────────────── */
function SendListTab({ links, summary, running, status, detected, onRun }: {
  links:SendLink[]; summary:BalancerSummary|null; running:boolean;
  status:string; detected:boolean; onRun:()=>void;
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
                <strong>{summary.links}</strong> · <strong>{summary.merchants}</strong> merchants · avg <strong>{summary.avgDist}</strong>
              </span>
            </div>
          </div>
        </div>
      )}
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
                <SendRow key={`${link.source}-${link.target}-${i}`} link={link} idx={i} onSent={onSent}/>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
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
  const numField = (label:string, key:keyof BalancerSettings, step=1, help?:string) => (
    <div className="field">
      <div className="field-top"><span className="field-label">{label}</span></div>
      {help && <span className="field-help">{help}</span>}
      <input className="input" type="number" step={step} value={s[key] as number}
        onChange={e => { const n=parseFloat(e.target.value); if (Number.isFinite(n)) set(key, n as BalancerSettings[typeof key]); }}/>
    </div>
  );
  const checkField = (label:string, key:keyof BalancerSettings, help?:string) => (
    <label className="field-check">
      <span className="field-check-text">
        <span className="field-label">{label}</span>
        {help && <span className="field-help">{help}</span>}
      </span>
      <span className="toggle" onClick={e => e.stopPropagation()}>
        <input type="checkbox" checked={Boolean(s[key])}
          onChange={e => set(key, e.target.checked as BalancerSettings[typeof key])}/>
        <span className="toggle-thumb"/>
      </span>
    </label>
  );
  return (
    <div className="cfg-body">
      <div className="cfg-section">
        <div className="section-label">General</div>
        {checkField("Ignore all rules (minting mode)", "isMinting")}
        {numField("Reserve per village", "reservePerVillage", 1000, "Subtracted from every village before computing")}
        {numField("Global max distance (fields)", "maxDistance")}
      </div>
      <div className="cfg-section">
        <div className="section-label">Village thresholds</div>
        {numField("Prioritise villages below (pts)", "lowPoints")}
        {numField("Finished villages above (pts)", "highPoints")}
        {numField("High farm (pop)", "highFarm")}
        {numField("WH % to keep in finished villages", "builtOutPercentage", 0.01)}
        {numField("WH % target for priority villages", "needsMorePercentage", 0.01)}
      </div>
      <div className="cfg-section">
        <div className="section-label">HQ Build Priority</div>
        {checkField("Prioritise empty build queues", "hqPriorityEnabled")}
        {numField("Maxed-out village (pts)", "maxedOutPoints")}
        {numField("Long queue threshold (hours)", "lowPointsLongQueueHours")}
      </div>
      <div className="cfg-section">
        <div className="section-label">Clusters</div>
        {checkField("Enable spatial clustering", "useClusters")}
        {numField("Number of clusters", "numClusters")}
      </div>
      <div className="cfg-section">
        <div className="section-label">Instant Trade (PP) <span style={{fontSize:10,color:"var(--n300)",fontWeight:400}}>10pp</span></div>
        {checkField("Enable Merchant Exchange", "premiumInstantEnabled")}
        {numField("Imbalance threshold", "premiumThreshold", 1000, "Min global imbalance before a PP route is suggested")}
        {numField("Min trade amount", "premiumMinTradeAmount", 1000)}
        {numField("Max move amount", "premiumMoveAmount", 1000)}
        {numField("Max donor distance (fields)", "premiumMaxDistance")}
        {numField("Max target fill (%)", "premiumMaxTargetFillPct", 0.01)}
        {numField("Max plans (hard cap)", "premiumMaxPlansHardCap")}
        {numField("Donor keep (%)", "premiumDonorKeepPct", 0.01)}
        {numField("Donor keep min", "premiumDonorKeepMin", 1000)}
        {numField("Donor min excess", "premiumDonorMinExcess", 1000)}
      </div>
      <div className="cfg-section">
        <div className="section-label">Send All</div>
        {checkField("Enable Send All automation", "sendAllEnabled")}
        {numField("Interval between sends (ms)", "sendAllIntervalMs")}
      </div>
      <div className="cfg-section cfg-section-checks">
        <div className="section-label">Developer</div>
        {checkField("Debug logging (console)", "debugMode")}
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
  const clearCoord = (key:string) => { dispatch("xbot:balancer:clearCoordLock",{coords:key}); setTimeout(refresh,100); };
  const clearAllPp = () => { dispatch("xbot:balancer:clearPpLocks"); setTimeout(refresh,100); };
  return (
    <div className="cfg-body">
      <div className="cfg-section">
        <div className="section-label">Manual coord locks ({coordLocks.length})</div>
        {coordLocks.length === 0
          ? <div className="state-msg">No manual locks set.</div>
          : coordLocks.map(lock => (
            <div key={lock.key} className="bal-lock-row">
              <span className="bal-lock-coord">{lock.key}</span>
              <span className="bal-lock-res">
                <ResIcon res="wood"  dim={!lock.wood}/>
                <ResIcon res="stone" dim={!lock.stone}/>
                <ResIcon res="iron"  dim={!lock.iron}/>
              </span>
              <button className="btn btn-ghost" style={{ flex:"none", padding:"4px 10px", fontSize:11 }}
                onClick={() => clearCoord(lock.key)}>Clear</button>
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
              <span className="bal-lock-coord" style={{ fontFamily:"var(--mono)", fontSize:11 }}>#{lock.villageId}</span>
              <span className="bal-lock-res" style={{ display:"flex", alignItems:"center", gap:4 }}>
                <ResIcon res={lock.res as "wood"|"stone"|"iron"}/>
                <span style={{ fontSize:11, color:"var(--n500)" }}>{lock.res}</span>
              </span>
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
  const { links, summary, running, status, detected } = useBalancerState();
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
      {tab==="sendlist" && <SendListTab links={links} summary={summary} running={running} status={status} detected={detected} onRun={handleRun}/>}
      {tab==="settings" && <SettingsTab/>}
      {tab==="locks"    && <LocksTab/>}
      {tab==="hq"       && <HQTab hqEnabled={settings.hqPriorityEnabled}/>}
    </div>
  );
}
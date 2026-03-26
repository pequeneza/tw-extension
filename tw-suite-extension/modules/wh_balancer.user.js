// ==UserScript==
// @name         Tribal Wars - Warehouse Balancer v4
// @namespace    https://pt*.tribalwars.com.pt/
// @version      4.0.0
// @description  The Real Balancer — reserve, max distance, settings import/export, debounced run, keyboard shortcut (Ctrl+Shift+B), enhanced summary
// @match        https://*.tribalwars.com.pt/game.php*
// @grant        none
// ==/UserScript==

/* jshint esversion: 6 */

(function () {
  "use strict";
  if (typeof window.game_data === "undefined") return;

  function whenReady(fn, tries = 0) {
    const maxTries = 300;
    const has$ = typeof window.$ !== "undefined";
    const hasTW = typeof window.TribalWars !== "undefined";
    const hasUI = typeof window.UI !== "undefined";
    const hasDialog = typeof window.Dialog !== "undefined";
    if (has$ && hasTW && hasUI && hasDialog) fn();
    else if (tries < maxTries) setTimeout(() => whenReady(fn, tries + 1), 100);
  }

  whenReady(() => {
    injectCssOnce();
    injectLauncherButton();
    // Keyboard shortcut: Ctrl+Shift+B opens the balancer from any page
    document.addEventListener("keydown", (e) => {
      if (e.ctrlKey && e.shiftKey && (e.key === "B" || e.key === "b")) {
        e.preventDefault();
        try { window.TM_WH_BALANCER.run(); } catch (_) {}
      }
    });
  });

  function injectCssOnce() {
    if (document.getElementById("tm_whbalancer_css")) return;

    const css = `
<style id="tm_whbalancer_css">
#tm_whbalancer_btn { margin-left: 8px; }
#tm_whbalancer_wrap{
  width:100%;
  display:flex;
  justify-content:center;
  align-items:center;
}
#tm_whbalancer_btn{ margin-left:0 !important; }
/* PP rows highlight */
.tmWH tr.tmPpHeader td{
  background:#c7e3ff !important;
  border:1px solid #2a5d8a !important;
  color:#000;
  font-weight:bold;
}
.tmWH tr.tmPpRow td{
  background:#e7f3ff !important;
  border:1px solid #2a5d8a !important;
}
.tmWH .tmBadgePPNow{
  display:inline-block;
  padding:1px 6px;
  border:1px solid #1a7a1a;
  background:#d4f7d4;
  border-radius:3px;
  font-size:12px;
  margin-right:6px;
  color:#1a5c1a;
  font-weight:bold;
}
.tmWH tr.tmPpNowHeader td{
  background:#d4f7d4 !important;
  border:1px solid #1a7a1a !important;
  color:#000;
  font-weight:bold;
}
.tmWH .tmBadgePP{
  display:inline-block;
  padding:1px 6px;
  border:1px solid #2a5d8a;
  background:#ffffff;
  border-radius:3px;
  font-size:12px;
  margin-right:6px;
}

.tmWH { color:#000; font-family: Verdana, Arial, sans-serif; }
.tmWH .twbox { background:#f3e6c1; border:1px solid #7b5b2b; padding:8px; margin-bottom:10px; }
.tmWH .twbox .title { background:#d2b47a; border:1px solid #7b5b2b; padding:6px 8px; font-weight:bold; margin:-8px -8px 8px -8px; }
.tmWH .twmuted { color:#3b2a12; opacity:0.9; font-size:12px; }
.tmWH .twbadge { display:inline-block; padding:1px 6px; border:4px solid #7b5b2b; background:#fff6dc; border-radius:3px; font-size:12px; margin-left:6px; }

.tmWH .tmToggle { width:100%; text-align:left; padding:6px 8px; border:1px solid #7b5b2b; background:#e2c68e; font-weight:bold; cursor:pointer; }
.tmWH .tmToggle:after { content:"▸"; float:right; }
.tmWH .tmToggle.open:after { content:"▾"; }

.tmWH .tmSettingsBody { border:1px solid #7b5b2b; border-top:none; background:#fff6dc; padding:8px; display:none; }
.tmWH .tmSettingsBody.open { display:block; }

.tmWH .tmSubToggle{
  width:100%;
  box-sizing:border-box;
  display:block;
  text-align:left;
  padding:6px 8px;
  border:1px solid #7b5b2b;
  background:#ead3a2;
  font-weight:bold;
  cursor:pointer;
  margin-top:8px;
  line-height:18px;
}
.tmWH button.tmSubToggle{
  appearance:none;
  -webkit-appearance:none;
  border-radius:0;
  font:inherit;
}
.tmWH .tmSubToggle:after{ content:"▸"; float:right; }
.tmWH .tmSubToggle.open:after{ content:"▾"; }

.tmWH .tmSubBody { border:1px solid #7b5b2b; border-top:none; background:#fffdf2; padding:8px; display:none; }
.tmWH .tmSubBody.open { display:block; }

.tmWH .tm-grid { display:grid; grid-template-columns:1fr 1fr; gap:8px 12px; align-items:center; }
.tmWH .tm-grid label { font-weight:bold; }
.tmWH input[type="number"], .tmWH input[type="text"], .tmWH select { width:140px; }

.tmWH .tm-actions { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
.tmWH .tm-flex { display:flex; justify-content:space-between; gap:12px; align-items:flex-start; flex-wrap:wrap; }

.tmWH table.vis { width:100%; }
.tmWH table.vis th { background:#d2b47a; border:1px solid #7b5b2b; color:#000; }
.tmWH table.vis td { background:#fff6dc; border:1px solid #7b5b2b; color:#000; }
.tmWH tr.tmRowA td { background:#fff1c9; }
.tmWH tr.tmRowB td { background:#fff6dc; }

.tmWH a.tmLink { color:#0b4d8a; text-decoration:underline; }

.tmWH .btnSophie { border:1px solid #7b5b2b; background:#e2c68e; color:#000; padding:4px 10px; cursor:pointer; }
.tmWH .btnSophie:hover { background:#d9bb7e; }

.tmWH .tmTimerBox { border:1px solid #7b5b2b; background:#fff6dc; padding:8px; margin-top:8px; }
.tmWH .tmTimerBox .big { font-size:18px; font-weight:bold; }
.tmWH .tmTimerBox .line { margin-top:3px; }
.tmWH .tmTimerBox code { background:#fff1c9; border:1px solid #7b5b2b; padding:1px 4px; }

.tmWH table.tmPpMiniTable { width:100%; border-collapse:collapse; margin-top:6px; }
.tmWH table.tmPpMiniTable th, .tmWH table.tmPpMiniTable td { border:1px solid #7b5b2b; padding:3px 6px; }
.tmWH table.tmPpMiniTable th { background:#d2b47a; }
.tmWH table.tmPpMiniTable td { background:#fff6dc; }

/* Manual locks (compact) */
.tmWH .tmMiniRow { display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
.tmWH .tmMiniRow input[type="text"] { width:110px; }
.tmWH .tmMiniChecks { display:flex; gap:10px; align-items:center; }
.tmWH .tmMiniChecks label { font-weight:bold; display:flex; gap:4px; align-items:center; }
.tmWH .tmLockList { margin-top:8px; border:1px solid #7b5b2b; background:#fff6dc; max-height:160px; overflow:auto; }
.tmWH .tmLockItem { display:flex; justify-content:space-between; gap:10px; padding:4px 6px; border-bottom:1px solid rgba(123,91,43,0.35); cursor:pointer; }
.tmWH .tmLockItem:last-child { border-bottom:none; }
.tmWH .tmLockBadges { display:flex; gap:6px; align-items:center; flex-wrap:wrap; }
.tmWH .tmResIcon { width:16px; height:16px; vertical-align:middle; }
.tmWH .tmResIconDim { opacity:0.25; }
.tmWH .tmLockX { padding:0 8px; }
.tmWH .tmLockComment{
  font-size:11px;
  color:#3b2a12;
  opacity:0.9;
  margin-left:6px;
  padding:0 4px;
  border-left:2px solid rgba(123,91,43,0.35);
}
.tmWH .tmCoordLink{ color:#0b4d8a; text-decoration:underline; cursor:pointer; }

.tmWH .tmPpRouteRow { padding:2px 0; }
.tmWH .tmPpMini { font-size:12px; }
.tmWH .tmPpMini code { background:#fff1c9; border:1px solid #7b5b2b; padding:1px 4px; }

#tmwh_tip_portal{
  position:fixed;
  display:none;
  z-index:2147483647;
  background:#fffdf2;
  border:1px solid #7b5b2b;
  padding:8px;
  min-width:360px;
  max-width:520px;
  box-shadow: 0 2px 10px rgba(0,0,0,0.25);
  pointer-events:none;
}
/* HQ building priority boost */
.tmWH tr.tmHqBoostRow td { background:#fffbe6 !important; border-color:#c8a800 !important; }
.tmWH .tmBadgeHQ {
  display:inline-block; padding:1px 5px;
  border:1px solid #c8a800; background:#fff3b0;
  border-radius:3px; font-size:11px; margin-right:4px;
  color:#7a6000; font-weight:bold;
}
/* HQ building check */
#tmwh_hq_panel {
  max-height:260px;
  overflow-y:auto;
  overflow-x:hidden;
}
.tmHqBox { margin-top:4px; }
.tmHqRow { display:flex; justify-content:space-between; align-items:center; gap:8px; padding:4px 0; border-bottom:1px solid rgba(123,91,43,0.2); flex-wrap:wrap; }
.tmHqRow:last-child { border-bottom:none; }
.tmHqVillage { font-weight:bold; min-width:140px; }
.tmHqBuilding { font-size:11px; color:#3b2a12; flex:1; }
.tmHqOk { color:#1a7a1a; font-weight:bold; }
.tmHqWarn { color:#a40000; font-weight:bold; }
.tmHqEta { font-size:11px; color:#555; white-space:nowrap; }
.tmHqRes { font-size:11px; }
.tmHqShortfall { color:#a40000; }
</style>`;
    document.head.insertAdjacentHTML("beforeend", css);
  }

  function injectLauncherButton() {
    if (document.getElementById("tm_whbalancer_btn") || document.getElementById("tm_whbalancer_wrap")) return;

    const btn = document.createElement("button");
    btn.id = "tm_whbalancer_btn";
    btn.textContent = "xBalancer";
    btn.className = "btn";

    btn.addEventListener("click", () => {
      try {
        window.TM_WH_BALANCER.run();
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error(e);
        alert("WH Balancer crashed. Check console.");
      }
    });

    const targets = [
      document.querySelector("#menu_row2"),
      document.querySelector("#topContainer"),
      document.querySelector("#header_info"),
      document.querySelector("#contentContainer")
    ].filter(Boolean);

    const wrap = document.createElement("div");
    wrap.id = "tm_whbalancer_wrap";
    wrap.appendChild(btn);

    (targets[0] || document.body).appendChild(wrap);
  }

  window.TM_WH_BALANCER = (function () {
    let state = null;

    const SETTINGS_KEY = "tm_whbalancer_settings";

    // ── Suite config integration ───────────────────────────────────────────
    const _suiteCfg = (typeof window.__twSuiteCfg === 'function')
      ? window.__twSuiteCfg('wh_balancer')
      : {};
    // ──────────────────────────────────────────────────────────────────

    // ---------------- PP ROUTES + TIMER PERSISTENCE ----------------
    const PP_LOCKS_KEY = "tm_whbalancer_pp_locks_v2";
    const PP_PLANS_KEY = "tm_whbalancer_pp_plans_v2";
    const HQ_STALENESS_MS = 30 * 60 * 1000; // 30 minutes — re-fetch HQ data when stale
    const HQ_DATA_KEY      = "tm_whbalancer_hq_data_v1";
    const HQ_TIMESTAMP_KEY = "tm_whbalancer_hq_timestamp_v1";

    function safeJsonParse(raw, fallback) {
      try { return raw ? JSON.parse(raw) : fallback; } catch (e) { return fallback; }
    }

    function getNowMs() {
      return Date.now();
    }

    function loadPpLocks() {
      const arr = safeJsonParse(localStorage.getItem(PP_LOCKS_KEY), []);
      if (!Array.isArray(arr)) return [];
      return arr
        .map(x => x && x.villageId && x.res ? ({ villageId: String(x.villageId), res: String(x.res), updatedAt: x.updatedAt || Date.now() }) : null)
        .filter(Boolean);
    }

    function savePpLocks(locks) {
      localStorage.setItem(PP_LOCKS_KEY, JSON.stringify(Array.isArray(locks) ? locks : []));
    }

    function addPpLock({ villageId, res }) {
      const locks = loadPpLocks();
      const vid = String(villageId);
      const rr = String(res);
      const idx = locks.findIndex(l => l.villageId === vid && l.res === rr);
      const next = { villageId: vid, res: rr, updatedAt: Date.now() };
      if (idx >= 0) locks[idx] = next;
      else locks.push(next);
      savePpLocks(locks);
    }

    function removePpLock({ villageId, res }) {
      const vid = String(villageId);
      const rr = String(res);
      savePpLocks(loadPpLocks().filter(l => !(l.villageId === vid && l.res === rr)));
    }

    function loadPpPlans() {
      const arr = safeJsonParse(localStorage.getItem(PP_PLANS_KEY), []);
      if (!Array.isArray(arr)) return [];
      return arr
        .map(p => (p && p.id && p.targetVillageId && p.payRes && p.neededRes && Array.isArray(p.shipments)) ? ({
          ...p,
          id: String(p.id),
          targetVillageId: String(p.targetVillageId),
          payRes: String(p.payRes),
          neededRes: String(p.neededRes),
          instant: !!p.instant,
          shipments: p.shipments.map(s => ({
            source: String(s.source),
            target: String(s.target),
            wood: s.wood || 0,
            stone: s.stone || 0,
            iron: s.iron || 0,
            distance: s.distance || 0,
            sourceName: s.sourceName || null
          }))
        }) : null)
        .filter(Boolean);
    }

    function savePpPlans(plans) {
      localStorage.setItem(PP_PLANS_KEY, JSON.stringify(Array.isArray(plans) ? plans : []));
        }
    function loadHqData() {
      try {
        const rawData = localStorage.getItem(HQ_DATA_KEY);
        const rawTs   = localStorage.getItem(HQ_TIMESTAMP_KEY);

        if (!rawData) return { data: new Map(), timestamp: 0 };

        const entries = JSON.parse(rawData);
        if (!Array.isArray(entries)) throw new Error("Invalid HQ data format");

        const map = new Map(entries);
        const timestamp = parseInt(rawTs, 10) || 0;

        return { data: map, timestamp };
      } catch (e) {
        console.warn("Failed to load HQ data — clearing corrupted cache", e);
        localStorage.removeItem(HQ_DATA_KEY);
        localStorage.removeItem(HQ_TIMESTAMP_KEY);
        return { data: new Map(), timestamp: 0 };
      }
    }

    function saveHqData(map, timestamp) {
      try {
        if (!map || !(map instanceof Map) || map.size === 0) {
          localStorage.removeItem(HQ_DATA_KEY);
          localStorage.removeItem(HQ_TIMESTAMP_KEY);
          return;
        }
        const entries = Array.from(map.entries());
        localStorage.setItem(HQ_DATA_KEY, JSON.stringify(entries));
        localStorage.setItem(HQ_TIMESTAMP_KEY, String(timestamp || Date.now()));
      } catch (e) {
        console.warn("Failed to save HQ data", e);
      }
    }

    function upsertPpPlan(plan) {
      const plans = loadPpPlans();
      const idx = plans.findIndex(p => p.id === String(plan.id));
      if (idx >= 0) plans[idx] = plan;
      else plans.push(plan);
      savePpPlans(plans);
    }

    function removePpPlan(planId) {
      savePpPlans(loadPpPlans().filter(p => p.id !== String(planId)));
    }

    function removePlansByLock({ villageId, res }) {
      const vid = String(villageId);
      const rr = String(res);
      savePpPlans(loadPpPlans().filter(p => !(String(p.targetVillageId) === vid && String(p.payRes) === rr)));
    }

    function makePlanId(plan) {
      const base = `${String(plan.targetVillageId)}|${String(plan.payRes)}|${String(plan.neededRes)}|${String(plan.tradeAmount || 0)}`;
      const sig = (plan.shipments || []).map(s => `${s.source}:${(s.wood || 0) + (s.stone || 0) + (s.iron || 0)}`).join(",");
      return `${base}|${sig}`;
    }

    function computeRemainingSecFromAnchor(plan) {
      if (plan.lastArrivalEtaSec == null || plan.lastArrivalMsAtFetch == null) return null;
      const elapsed = Math.floor((getNowMs() - plan.lastArrivalMsAtFetch) / 1000);
      return Math.max(0, Math.floor(plan.lastArrivalEtaSec) - elapsed);
    }

    // ---------------- MANUAL LOCKS BY COORDS + COMMENTS ----------------
    const MANUAL_LOCKS_COORDS_KEY = "tm_whbalancer_manual_locks_coords_v1";
    const MANUAL_LOCKS_COMMENTS_KEY = "tm_whbalancer_manual_locks_comments_v1";

    function normalizeCoordsKey(input) {
      const m = String(input || "").match(/(\d{1,3})\|(\d{1,3})/);
      if (!m) return null;
      return `${parseInt(m[1], 10)}|${parseInt(m[2], 10)}`;
    }

    function loadManualLocksByCoords() {
      try {
        const raw = localStorage.getItem(MANUAL_LOCKS_COORDS_KEY);
        if (!raw) return {};
        const obj = JSON.parse(raw);
        return obj && typeof obj === "object" ? obj : {};
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn("Manual coord locks parse failed, clearing.", e);
        localStorage.removeItem(MANUAL_LOCKS_COORDS_KEY);
        return {};
      }
    }

    function saveManualLocksByCoords(locks) {
      localStorage.setItem(MANUAL_LOCKS_COORDS_KEY, JSON.stringify(locks || {}));
    }

    function loadManualLockComments() {
      try {
        const raw = localStorage.getItem(MANUAL_LOCKS_COMMENTS_KEY);
        if (!raw) return {};
        const obj = JSON.parse(raw);
        return obj && typeof obj === "object" ? obj : {};
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn("Manual coord comments parse failed, clearing.", e);
        localStorage.removeItem(MANUAL_LOCKS_COMMENTS_KEY);
        return {};
      }
    }

    function saveManualLockComments(comments) {
      localStorage.setItem(MANUAL_LOCKS_COMMENTS_KEY, JSON.stringify(comments || {}));
    }

    function setManualCoordComment(coordsKey, comment) {
      const key = normalizeCoordsKey(coordsKey);
      if (!key) throw new Error("Invalid coords. Use 123|456");

      const c = String(comment || "").trim();
      const comments = loadManualLockComments();
      if (!c) delete comments[key];
      else comments[key] = c.slice(0, 80);
      saveManualLockComments(comments);
      return key;
    }

    function getManualCoordComment(coordsKey) {
      const key = normalizeCoordsKey(coordsKey);
      if (!key) return "";
      const comments = loadManualLockComments();
      return comments[key] || "";
    }

    function setManualCoordLock(coordsKey, lockObj) {
      const key = normalizeCoordsKey(coordsKey);
      if (!key) throw new Error("Invalid coords. Use 123|456");

      const locks = loadManualLocksByCoords();
      locks[key] = { wood: !!lockObj.wood, stone: !!lockObj.stone, iron: !!lockObj.iron };
      saveManualLocksByCoords(locks);
      return key;
    }

    function clearManualCoordLock(coordsKey) {
      const key = normalizeCoordsKey(coordsKey);
      if (!key) throw new Error("Invalid coords. Use 123|456");

      const locks = loadManualLocksByCoords();
      delete locks[key];
      saveManualLocksByCoords(locks);

      const comments = loadManualLockComments();
      delete comments[key];
      saveManualLockComments(comments);

      return key;
    }

    function listManualCoordLocks() {
      return loadManualLocksByCoords();
    }

    function applyManualCoordLocks({ villagesData, excessResources, shortageResources }) {
      const locks = loadManualLocksByCoords();
      if (!locks || typeof locks !== "object") return;

      const resIndex = { wood: 0, stone: 1, iron: 2 };

      for (let idx = 0; idx < villagesData.length; idx++) {
        const coords = coordsFromVillageName(villagesData[idx].name);
        if (!coords) continue;
        const key = `${coords.x}|${coords.y}`;

        const lock = locks[key];
        if (!lock) continue;

        for (const res of ["wood", "stone", "iron"]) {
          if (!lock[res]) continue;

          const i = resIndex[res];
          if (excessResources[idx] && excessResources[idx][i]) excessResources[idx][i][res] = 0;
          if (shortageResources[idx] && shortageResources[idx][i]) shortageResources[idx][i][res] = 0;
        }
      }
    }

    // ---------------- SETTINGS ----------------
    function loadSettings() {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) {
        const defaults = {
          isMinting: false,
          highPoints: 7000,
          highFarm: 23000,
          lowPoints: 3000,
          builtOutPercentage: 0.26,
          needsMorePercentage: 0.7,

          premiumInstantEnabled: false,
          premiumThreshold: 50000,
          premiumMinTradeAmount: 70000,
          premiumMoveAmount: 300000,
          premiumStagingStrategy: "weighted",

          premiumDonorKeepPct: 0.10,
          premiumDonorKeepMin: 20000,
          premiumDonorMinExcess: 5000,

          premiumMaxDistance: 18,
          premiumMaxTargetFillPct: 0.90,
          premiumMaxPlansHardCap: 12,

          sendAllEnabled: false,
          sendAllIntervalMs: 500,

          reservePerVillage: 0,
          maxDistance: 9999,
          hqPriorityEnabled: false,
          maxedOutPoints: 10471,
          lowPointsLongQueueHours: 3,

          settingsOpen: false,
          premiumOptionsOpen: false
        };
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(defaults));
        return defaults;
      }

      try {
        const s = JSON.parse(raw);

        if (typeof s.isMinting === "undefined") s.isMinting = false;
        if (!s.highPoints) s.highPoints = 12000;
        if (!s.highFarm) s.highFarm = 99999;
        if (!s.lowPoints && s.lowPoints !== 0) s.lowPoints = 1;
        if (!s.builtOutPercentage && s.builtOutPercentage !== 0) s.builtOutPercentage = 0.25;
        if (!s.needsMorePercentage && s.needsMorePercentage !== 0) s.needsMorePercentage = 0.85;

        if (typeof s.premiumInstantEnabled === "undefined") s.premiumInstantEnabled = false;
        if (typeof s.premiumThreshold === "undefined") s.premiumThreshold = 50000;
        if (typeof s.premiumMinTradeAmount === "undefined") s.premiumMinTradeAmount = 70000;
        if (typeof s.premiumMoveAmount === "undefined") s.premiumMoveAmount = 300000;

        if (!s.premiumStagingStrategy) s.premiumStagingStrategy = "weighted";
        if (s.premiumStagingStrategy !== "largest" && s.premiumStagingStrategy !== "weighted") s.premiumStagingStrategy = "weighted";

        if (typeof s.premiumDonorKeepPct === "undefined") s.premiumDonorKeepPct = 0.10;
        if (typeof s.premiumDonorKeepMin === "undefined") s.premiumDonorKeepMin = 20000;
        if (typeof s.premiumDonorMinExcess === "undefined") s.premiumDonorMinExcess = 5000;

        if (typeof s.premiumMaxDistance === "undefined") s.premiumMaxDistance = 18;
        if (typeof s.premiumMaxTargetFillPct === "undefined") s.premiumMaxTargetFillPct = 0.90;
        if (typeof s.premiumMaxPlansHardCap === "undefined") s.premiumMaxPlansHardCap = 12;

        if (typeof s.sendAllEnabled === "undefined") s.sendAllEnabled = false;
        if (typeof s.sendAllIntervalMs === "undefined") s.sendAllIntervalMs = 500;

        if (typeof s.settingsOpen === "undefined") s.settingsOpen = false;
        if (typeof s.premiumOptionsOpen === "undefined") s.premiumOptionsOpen = false;
        if (typeof s.reservePerVillage === "undefined") s.reservePerVillage = 0;
        if (typeof s.maxDistance === "undefined") s.maxDistance = 9999;
        if (typeof s.hqPriorityEnabled === "undefined") s.hqPriorityEnabled = false;
        if (typeof s.maxedOutPoints === "undefined") s.maxedOutPoints = 10471;

        s.builtOutPercentage = Math.max(0.01, Math.min(0.95, parseFloat(s.builtOutPercentage)));
        s.needsMorePercentage = Math.max(0.1, Math.min(0.95, parseFloat(s.needsMorePercentage)));

        s.premiumThreshold = Math.max(0, parseInt(s.premiumThreshold, 10) || 0);
        s.premiumMinTradeAmount = Math.max(0, parseInt(s.premiumMinTradeAmount, 10) || 0);
        s.premiumMoveAmount = Math.max(0, parseInt(s.premiumMoveAmount, 10) || 0);

        s.premiumDonorKeepPct = Math.max(0, Math.min(0.95, parseFloat(s.premiumDonorKeepPct)));
        s.premiumDonorKeepMin = Math.max(0, parseInt(s.premiumDonorKeepMin, 10) || 0);
        s.premiumDonorMinExcess = Math.max(0, parseInt(s.premiumDonorMinExcess, 10) || 0);

        s.premiumMaxDistance = Math.max(1, parseInt(s.premiumMaxDistance, 10) || 18);
        s.premiumMaxTargetFillPct = Math.max(0.1, Math.min(0.98, parseFloat(s.premiumMaxTargetFillPct)));
        s.premiumMaxPlansHardCap = Math.max(1, Math.min(50, parseInt(s.premiumMaxPlansHardCap, 10) || 12));

        s.sendAllIntervalMs = Math.max(100, parseInt(s.sendAllIntervalMs, 10) || 500);

        s.highPoints = parseInt(s.highPoints, 10) || 12000;
        s.highFarm = parseInt(s.highFarm, 10) || 99999;
        s.lowPoints = parseInt(s.lowPoints, 10);
        if (isNaN(s.lowPoints)) s.lowPoints = 1;

        s.reservePerVillage = Math.max(0, parseInt(s.reservePerVillage, 10) || 0);
        s.maxDistance = Math.max(1, parseInt(s.maxDistance, 10) || 9999);

        // Merge suite popup config over stored settings
        const numKeys = ['highPoints','highFarm','lowPoints','premiumThreshold',
                          'premiumMoveAmount','premiumMaxDistance','sendAllIntervalMs',
                          'premiumMaxPlansHardCap'];
        const floatKeys = ['builtOutPercentage','needsMorePercentage',
                            'premiumDonorKeepPct','premiumMaxTargetFillPct'];
        for (const k of numKeys)   if (_suiteCfg[k] !== undefined) s[k] = Number(_suiteCfg[k]);
        for (const k of floatKeys) if (_suiteCfg[k] !== undefined) s[k] = parseFloat(_suiteCfg[k]);
        if (_suiteCfg.premiumInstantEnabled !== undefined)
          s.premiumInstantEnabled = Boolean(_suiteCfg.premiumInstantEnabled);
        return s;
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn("Settings parse failed, resetting.", e);
        localStorage.removeItem(SETTINGS_KEY);
        return loadSettings();
      }
    }

    function saveSettings(newS) {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(newS));
    }

    // ---------------- UTILS ----------------
    function ensureTipPortal() {
      if (document.getElementById("tmwh_tip_portal")) return;
      const div = document.createElement("div");
      div.id = "tmwh_tip_portal";
      document.body.appendChild(div);
    }

    function showTipAt(anchorEl, html) {
      ensureTipPortal();
      const tip = document.getElementById("tmwh_tip_portal");
      if (!tip) return;

      tip.innerHTML = html;
      tip.style.display = "block";

      const r = anchorEl.getBoundingClientRect();
      const margin = 10;

      let top = r.top - tip.offsetHeight - margin;
      let left = r.left;

      if (top < 10) top = r.bottom + margin;

      left = Math.max(10, Math.min(left, window.innerWidth - 10 - tip.offsetWidth));

      tip.style.left = `${Math.round(left)}px`;
      tip.style.top = `${Math.round(top)}px`;
    }

    function hideTip() {
      const tip = document.getElementById("tmwh_tip_portal");
      if (!tip) return;
      tip.style.display = "none";
      tip.innerHTML = "";
    }

    function numberWithCommasDots(x) {
      x = String(Math.floor(x));
      const pattern = /(-?\d+)(\d{3})/;
      while (pattern.test(x)) x = x.replace(pattern, "$1.$2");
      return x;
    }

    function parseIntSafe(str) {
      if (typeof str === "number") return Math.floor(str);
      if (!str) return 0;
      return parseInt(String(str).replace(/[^\d]/g, ""), 10) || 0;
    }

    function coordsFromVillageName(name) {
      const m = String(name).match(/(\d+)\|(\d+)/);
      if (!m) return null;
      return { x: parseInt(m[1], 10), y: parseInt(m[2], 10) };
    }

    function dist(a, b) {
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      return Math.round(Math.hypot(dx, dy));
    }

    function formatHMS(totalSeconds) {
      totalSeconds = Math.max(0, Math.floor(totalSeconds));
      const h = Math.floor(totalSeconds / 3600);
      const m = Math.floor((totalSeconds % 3600) / 60);
      const s = totalSeconds % 60;
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    }

    function parseDurationToSeconds(hms) {
      if (!hms) return null;
      const parts = String(hms).trim().split(":").map(v => parseInt(v, 10));
      if (parts.some(isNaN)) return null;
      if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
      if (parts.length === 2) return parts[0] * 60 + parts[1];
      return null;
    }

    function makeURL(params) {
      const base = "game.php";
      const usp = new URLSearchParams(params);
      return `${base}?${usp.toString()}`;
    }

    function getOverviewUrls() {
      if (game_data.player.sitter > 0) {
        return {
          inc: makeURL({ t: game_data.player.id, screen: "overview_villages", mode: "trader", type: "inc", page: "-1" }),
          prod: makeURL({ t: game_data.player.id, screen: "overview_villages", mode: "prod", page: "-1" })
        };
      }
      return {
        inc: makeURL({ screen: "overview_villages", mode: "trader", type: "inc", page: "-1" }),
        prod: makeURL({ screen: "overview_villages", mode: "prod", page: "-1" })
      };
    }

    function resIconHtml(res, dim) {
      const cls = `icon header ${res}`;
      const extra = dim ? " tmResIconDim" : "";
      return `<span class="${cls} tmResIcon${extra}"></span>`;
    }

    function resourceLabel(res) {
      if (["wood", "stone", "iron"].includes(res)) {
        return `${resIconHtml(res)}`;
      }
      return res;
    }

    // ---------------- MARKET / ACTIONS ----------------
    function sendResource(sourceID, targetID, woodAmount, stoneAmount, ironAmount) {
      const payload = { target_id: targetID, wood: woodAmount, stone: stoneAmount, iron: ironAmount };

      TribalWars.post(
        "market",
        { ajaxaction: "map_send", village: sourceID },
        payload,
        function (resp) {
          if (resp && resp.message) UI.SuccessMessage(resp.message);
          else UI.SuccessMessage("Resources sent.");
        },
        !1
      );

      // Record this send so the next Run can subtract it from the donor's
      // stock and credit it to the receiver — preventing duplicate routes
      // when re-running before shipments appear in the prod overview.
      if (state && state.pendingSends) {
        // Compute distance for ETA-aware expiry
        let sendDistance = 50;
        if (state.villagesData) {
          const byId = new Map(state.villagesData.map(v => [String(v.id), v]));
          const srcV = byId.get(String(sourceID));
          const tgtV = byId.get(String(targetID));
          const c1 = srcV ? coordsFromVillageName(srcV.name) : null;
          const c2 = tgtV ? coordsFromVillageName(tgtV.name) : null;
          if (c1 && c2) sendDistance = dist(c1, c2);
        }
        state.pendingSends.push({
          source: String(sourceID),
          target: String(targetID),
          wood:  woodAmount  || 0,
          stone: stoneAmount || 0,
          iron:  ironAmount  || 0,
          sentAt: Date.now(),
          distance: sendDistance,
        });
      }
    }

    // ---------------- FETCH / PARSERS ----------------
    async function fetchIncomingLastArrivalSecondsForPlan(plan) {
      const url = makeURL({ village: plan.targetVillageId, screen: "market", mode: "transports" });
      const html = await $.get(url);
      const $page = $(html);

      const sourceIdSet = new Set(plan.shipments.map(s => String(s.source)));
      const resClass = plan.payRes;

      let $incomingTable = null;
      $page.find("table.vis").each(function () {
        const headerText = $(this).find("tr").first().text();
        if (headerText && headerText.indexOf("Origem") !== -1 && headerText.indexOf("Chega em") !== -1) {
          $incomingTable = $(this);
          return false;
        }
      });
      if (!$incomingTable || !$incomingTable.length) return null;

      let maxSec = null;

      $incomingTable.find("tr").each(function () {
        const $tr = $(this);

        const $a = $tr.find('td a[href*="screen=info_village"][href*="id="]').first();
        if (!$a.length) return;

        const href = $a.attr("href") || "";
        const m = href.match(/id=(\d+)/);
        if (!m) return;
        const originId = String(m[1]);

        if (!sourceIdSet.has(originId)) return;
        if ($tr.find(`.icon.header.${resClass}`).length === 0) return;

        const etaText = $tr.find("td").last().text().trim();
        const sec = parseDurationToSeconds(etaText);
        if (sec === null) return;

        if (maxSec === null || sec > maxSec) maxSec = sec;
      });

      return maxSec;
    }

    async function fetchIncomingOverview(incUrl) {
      const html = await $.get(incUrl);
      const $page = $(html);
      const incomingRes = {};
      const rows = $page.find("#trades_table tr");

      for (let i = 1; i < rows.length - 1; i++) {
        const tr = rows[i];
        const mobile = !!$("#mobileHeader")[0];

        let villageIDtemp = null;
        const villageData = {};

        if (mobile) {
          const resGroups = tr.children?.[5]?.children?.[1]?.children;
          if (!resGroups) continue;
          for (let j = 0; j < resGroups.length; j++) {
            const $child = $(resGroups[j]);
            const icon = $child.find(".icon.mheader");
            if (!icon.length) continue;
            const classNames = icon.attr("class").split(" ");
            const resType = classNames[classNames.length - 1];
            const amt = parseIntSafe($child.text());
            villageData[resType] = amt;
            const link = tr.children?.[3]?.children?.[2]?.href;
            if (link) {
              const m = link.match(/id=(\d+)/);
              if (m) villageIDtemp = m[1];
            }
          }
        } else {
          const resGroups = tr.children?.[8]?.children;
          if (!resGroups) continue;
          for (let j = 0; j < resGroups.length; j++) {
            const $child = $(resGroups[j]);
            let classNames;
            if (($child[0]?.innerHTML || "").indexOf("header") > -1) classNames = $child.find(".icon.header").attr("class").split(" ");
            else classNames = ($child.attr("class") || "").split(" ");
            const resType = classNames[classNames.length - 1];
            const amt = parseIntSafe($child.text());
            if (!resType) continue;
            villageData[resType] = amt;
            const link = tr.children?.[4]?.children?.[0]?.href;
            if (link) {
              const m = link.match(/id=(\d+)/);
              if (m) villageIDtemp = m[1];
            }
          }
        }

        if (!villageIDtemp) continue;
        if (!incomingRes[villageIDtemp]) incomingRes[villageIDtemp] = { wood: 0, stone: 0, iron: 0 };
        if (villageData.wood) incomingRes[villageIDtemp].wood += villageData.wood;
        if (villageData.stone) incomingRes[villageIDtemp].stone += villageData.stone;
        if (villageData.iron) incomingRes[villageIDtemp].iron += villageData.iron;
      }
      return incomingRes;
    }

    async function fetchProdOverview(prodUrl) {
      const html = await $.get(prodUrl);
      const $page = $(html);

      const uniVillage = $page.find("span.bonus_icon_33");
      const uniRow = uniVillage.length > 0 ? (uniVillage.closest("tr").index() - 1) : -1;

      const mobile = !!$("#mobileHeader")[0];
      let villagesData = [];

      if (mobile) {
        let allWoodObjects = $page.find(".res.mwood,.warn_90.mwood,.warn.mwood");
        let allClayObjects = $page.find(".res.mstone,.warn_90.mstone,.warn.mstone");
        let allIronObjects = $page.find(".res.miron,.warn_90.miron,.warn.miron");
        let allWarehouses = $page.find(".mheader.ressources");
        let allVillages = $page.find(".quickedit-vn");
        let allFarms = $page.find(".header.population");
        let allMerchants = $page.find("#production_table a[href*=\"market\"]");
        let productionTable = $page.find("#production_table th");

        if (uniRow >= 0) {
          allVillages.splice(uniRow, 1);
          allWoodObjects.splice(uniRow, 1);
          allClayObjects.splice(uniRow, 1);
          allIronObjects.splice(uniRow, 1);
          allWarehouses.splice(uniRow, 1);
          allFarms.splice(uniRow, 1);
          allMerchants.splice(uniRow, 1);
          productionTable.splice(uniRow, 1);
        }

        for (let i = 0; i < allVillages.length; i++) {
          const wood = parseIntSafe(allWoodObjects[i]?.textContent);
          const stone = parseIntSafe(allClayObjects[i]?.textContent);
          const iron = parseIntSafe(allIronObjects[i]?.textContent);

          const farmText = allFarms[i]?.parentElement?.innerText || "0/0";
          const mFarm = farmText.match(/(\d*)\/(\d*)/);
          const farmUsed = mFarm ? parseInt(mFarm[1], 10) : 0;
          const farmTot = mFarm ? parseInt(mFarm[2], 10) : 0;

          const wh = parseIntSafe(allWarehouses[i]?.parentElement?.innerText);
          const availMerch = parseIntSafe(allMerchants[i]?.innerText);
          const points = parseIntSafe(productionTable[(i * 2) + 1]?.innerText);

          const vNode = allVillages[i];
          villagesData.push({
            id: vNode.dataset.id,
            points,
            url: vNode.children?.[0]?.children?.[0]?.href || "#",
            name: (vNode.innerText || "").trim(),
            wood, stone, iron,
            availableMerchants: availMerch,
            totalMerchants: 999,
            warehouseCapacity: wh,
            farmSpaceUsed: farmUsed,
            farmSpaceTotal: farmTot
          });
        }
      } else {
        let allWoodObjects = $page.find(".res.wood,.warn_90.wood,.warn.wood");
        let allClayObjects = $page.find(".res.stone,.warn_90.stone,.warn.stone");
        let allIronObjects = $page.find(".res.iron,.warn_90.iron,.warn.iron");
        let allVillages = $page.find(".quickedit-vn");

        if (uniRow >= 0) {
          allVillages.splice(uniRow, 1);
          allWoodObjects.splice(uniRow, 1);
          allClayObjects.splice(uniRow, 1);
          allIronObjects.splice(uniRow, 1);
        }

        for (let i = 0; i < allVillages.length; i++) {
          const wood = parseIntSafe(allWoodObjects[i]?.textContent);
          const stone = parseIntSafe(allClayObjects[i]?.textContent);
          const iron = parseIntSafe(allIronObjects[i]?.textContent);

          const wh = parseIntSafe(allIronObjects[i]?.parentElement?.nextElementSibling?.innerHTML);

          const merchText = allIronObjects[i]?.parentElement?.nextElementSibling?.nextElementSibling?.innerText || "0/0";
          const mMerch = merchText.match(/(\d*)\/(\d*)/);
          const availMerch = mMerch ? parseInt(mMerch[1], 10) : 0;
          const totalMerch = mMerch ? parseInt(mMerch[2], 10) : 0;

          const farmText = allIronObjects[i]?.parentElement?.nextElementSibling?.nextElementSibling?.nextElementSibling?.innerText || "0/0";
          const mFarm = farmText.match(/(\d*)\/(\d*)/);
          const farmUsed = mFarm ? parseInt(mFarm[1], 10) : 0;
          const farmTot = mFarm ? parseInt(mFarm[2], 10) : 0;

          const points = parseIntSafe(allWoodObjects[i]?.parentElement?.previousElementSibling?.innerText);

          const vNode = allVillages[i];
          villagesData.push({
            id: vNode.dataset.id,
            points,
            url: vNode.children?.[0]?.children?.[0]?.href || "#",
            name: (vNode.innerText || "").trim(),
            wood, stone, iron,
            availableMerchants: availMerch,
            totalMerchants: totalMerch,
            warehouseCapacity: wh,
            farmSpaceUsed: farmUsed,
            farmSpaceTotal: farmTot
          });
        }
      }

      villagesData.sort((a, b) => (a.points < b.points ? 1 : -1));
      return villagesData;
    }

    // ---------------- CORE MATH ----------------

    // Fix #6: average is computed from current stocks only. Incoming resources are
    // applied per-village as a credit inside computeExcessShortage, preventing
    // in-transit amounts from inflating the fleet target and causing duplicate sends.
    //
    // Fix #1: convergent cap loop — runs until stable so result is order-independent
    // regardless of how villages happen to be sorted by the overview parser.
    function computeConvergentAverage(villagesData, getNow, needsPct) {
      let remaining = 0;
      for (const v of villagesData) remaining += getNow(v);
      let count = villagesData.length || 1;
      const capped = new Set();
      let changed = true;
      let avg = Math.floor(remaining / count);

      while (changed) {
        changed = false;
        avg = Math.floor(remaining / Math.max(1, count));
        for (const v of villagesData) {
          if (capped.has(v.id)) continue;
          const cap = v.warehouseCapacity * needsPct;
          if (cap < avg) {
            remaining -= avg - cap;
            count = Math.max(1, count - 1);
            capped.add(v.id);
            changed = true;
          }
        }
      }
      return Math.floor(remaining / Math.max(1, count));
    }

    function computeTotalsAndAverages(villagesData, incomingRes) {
      // Totals include incoming (for display / summary only)
      let totalWood = 0, totalStone = 0, totalIron = 0;
      for (const v of villagesData) { totalWood += v.wood; totalStone += v.stone; totalIron += v.iron; }
      for (const vid of Object.keys(incomingRes)) {
        totalWood += incomingRes[vid].wood || 0;
        totalStone += incomingRes[vid].stone || 0;
        totalIron += incomingRes[vid].iron || 0;
      }

      const count = villagesData.length || 1;
      // Simple average (displayed in UI)
      const woodAverage  = Math.floor(totalWood  / count);
      const stoneAverage = Math.floor(totalStone / count);
      const ironAverage  = Math.floor(totalIron  / count);

      // Corrected averages: stock-only, convergent
      let actualWoodAverage  = woodAverage;
      let actualStoneAverage = stoneAverage;
      let actualIronAverage  = ironAverage;

      if (!state.settings.isMinting) {
        const needsPct = state.settings.needsMorePercentage;
        actualWoodAverage  = computeConvergentAverage(villagesData, v => v.wood,  needsPct);
        actualStoneAverage = computeConvergentAverage(villagesData, v => v.stone, needsPct);
        actualIronAverage  = computeConvergentAverage(villagesData, v => v.iron,  needsPct);
      }

      return { totalWood, totalStone, totalIron, woodAverage, stoneAverage, ironAverage, actualWoodAverage, actualStoneAverage, actualIronAverage };
    }

    function sumShipments(plan) {
      const sum = { wood: 0, stone: 0, iron: 0 };
      for (const s of plan.shipments) {
        sum.wood += s.wood || 0;
        sum.stone += s.stone || 0;
        sum.iron += s.iron || 0;
      }
      return sum;
    }

    function getPlanMovedAmount(plan) {
      const moved = sumShipments(plan);
      return plan.payRes === "wood" ? (moved.wood || 0)
        : plan.payRes === "stone" ? (moved.stone || 0)
        : (moved.iron || 0);
    }

    // Decide if a persisted plan is valid under CURRENT settings
    function validatePpPlanUnderCurrentSettings(plan) {
      const s = state?.settings || loadSettings();
      const movedAmount = getPlanMovedAmount(plan);
      const reasons = [];
      if (!s.premiumInstantEnabled) reasons.push("Premium is disabled");
      const minTrade = (s.premiumMinTradeAmount || 0);
      if (movedAmount < minTrade) reasons.push(`Moved amount ${numberWithCommasDots(movedAmount)} < Min trade ${numberWithCommasDots(minTrade)}`);
      const threshold = (s.premiumThreshold || 0);
      if (movedAmount < threshold) reasons.push(`Moved amount ${numberWithCommasDots(movedAmount)} < Threshold ${numberWithCommasDots(threshold)}`);
      return { ok: reasons.length === 0, reasons, movedAmount };
    }

    // ---------------- Ex/Short ----------------
    function computeExcessShortage(villagesData, incomingRes, averages) {
      const excessResources   = [];
      const shortageResources = [];
      const villageID         = [];
      const s = state.settings;

      const longQueueHours = s.lowPointsLongQueueHours || 3;           // fallback
      const longQueueSec   = longQueueHours * 3600;

      for (let idx = 0; idx < villagesData.length; idx++) {
        const v   = villagesData[idx];
        villageID.push(v.id);

        const inc = incomingRes[v.id] || { wood: 0, stone: 0, iron: 0 };
        const wh  = v.warehouseCapacity;
        const needsCap = wh * s.needsMorePercentage;

        // Base position vs convergent average
        let tempWood  = averages.actualWoodAverage  < needsCap 
                        ? v.wood  - averages.actualWoodAverage  
                        : -(needsCap - v.wood);
        let tempStone = averages.actualStoneAverage < needsCap 
                        ? v.stone - averages.actualStoneAverage 
                        : -(needsCap - v.stone);
        let tempIron  = averages.actualIronAverage  < needsCap 
                        ? v.iron  - averages.actualIronAverage  
                        : -(needsCap - v.iron);

        // Apply incoming transports
        tempWood  += inc.wood;
        tempStone += inc.stone;
        tempIron  += inc.iron;

        // Built-out villages (high points or high farm) donate most surplus
        if (v.farmSpaceUsed > s.highFarm || v.points > s.highPoints) {
          const wh_leave  = s.builtOutPercentage * wh;
          const res_leave = s.reservePerVillage || 0;

          const leaveWood  = (v.wood  + inc.wood)  > wh_leave ? wh_leave  : res_leave;
          const leaveStone = (v.stone + inc.stone) > wh_leave ? wh_leave  : res_leave;
          const leaveIron  = (v.iron  + inc.iron)  > wh_leave ? wh_leave  : res_leave;

          if (v.wood  + inc.wood  > leaveWood)  tempWood  = Math.round((v.wood  + inc.wood)  - leaveWood);
          if (v.stone + inc.stone > leaveStone) tempStone = Math.round((v.stone + inc.stone) - leaveStone);
          if (v.iron  + inc.iron  > leaveIron)  tempIron  = Math.round((v.iron  + inc.iron)  - leaveIron);
        }

        // ==================== LOW-POINTS VILLAGE LOGIC ====================
        // Default: low-points villages (< lowPoints) are strong receivers and never donors.
        // Exception: If they have more than "lowPointsLongQueueHours" of queued buildings,
        //            they are allowed to act as donors (can have excess).
        if (v.points < s.lowPoints) {
          const hq = state.hqData ? state.hqData.get(String(v.id)) : null;
          const queueSec = hq && typeof hq.queueEndsSec === "number" ? hq.queueEndsSec : 0;

          const hasLongQueue = queueSec > longQueueSec;

          if (!hasLongQueue) {
            // Force strong receiver (classic behavior)
            tempWood  = -(needsCap - v.wood  - inc.wood);
            tempStone = -(needsCap - v.stone - inc.stone);
            tempIron  = -(needsCap - v.iron  - inc.iron);
          }
          // else → keep the normal temp value (can be positive → donor)
        }
        // =================================================================

        // Near-overflow protection (95%+ full) — treat as urgent donor
        // Now respects the long-queue exception for low-points villages
        const isLowWithLongQueue = (v.points < s.lowPoints) &&
                                  (state.hqData?.get(String(v.id))?.queueEndsSec ?? 0) > longQueueSec;

        if (v.points >= s.lowPoints || isLowWithLongQueue) {
          const wh_leave_ov  = s.builtOutPercentage * wh;
          const res_leave_ov = s.reservePerVillage || 0;
          const ovThreshold  = 0.95 * wh;

          if (v.wood  + inc.wood  >= ovThreshold) {
            const ovLeave = (v.wood  + inc.wood)  > wh_leave_ov ? wh_leave_ov : res_leave_ov;
            tempWood  = Math.round((v.wood  + inc.wood)  - ovLeave);
          }
          if (v.stone + inc.stone >= ovThreshold) {
            const ovLeave = (v.stone + inc.stone) > wh_leave_ov ? wh_leave_ov : res_leave_ov;
            tempStone = Math.round((v.stone + inc.stone) - ovLeave);
          }
          if (v.iron  + inc.iron  >= ovThreshold) {
            const ovLeave = (v.iron  + inc.iron)  > wh_leave_ov ? wh_leave_ov : res_leave_ov;
            tempIron  = Math.round((v.iron  + inc.iron)  - ovLeave);
          }
        }

        // Final safety clamp for low-points villages (skip if long queue)
        if (v.points < s.lowPoints) {
          const hq = state.hqData ? state.hqData.get(String(v.id)) : null;
          const queueSec = hq && typeof hq.queueEndsSec === "number" ? hq.queueEndsSec : 0;
          const hasLongQueue = queueSec > longQueueSec;

          if (!hasLongQueue) {
            if (tempWood  > 0) tempWood  = 0;
            if (tempStone > 0) tempStone = 0;
            if (tempIron  > 0) tempIron  = 0;
          }
        }

        // Hard cap: cannot send more than currently available in warehouse
        if (tempWood  > 0 && tempWood  > v.wood)  tempWood  = v.wood;
        if (tempStone > 0 && tempStone > v.stone) tempStone = v.stone;
        if (tempIron  > 0 && tempIron  > v.iron)  tempIron  = v.iron;

        // Build output arrays (one entry per resource)
        excessResources[idx]   = [];
        shortageResources[idx] = [];

        // Wood
        if (tempWood > 0) {
          excessResources[idx].push({ wood: Math.floor(tempWood / 1000) * 1000 });
          shortageResources[idx].push({ wood: 0 });
        } else {
          shortageResources[idx].push({ wood: Math.floor(-tempWood / 1000) * 1000 });
          excessResources[idx].push({ wood: 0 });
        }

        // Stone
        if (tempStone > 0) {
          excessResources[idx].push({ stone: Math.floor(tempStone / 1000) * 1000 });
          shortageResources[idx].push({ stone: 0 });
        } else {
          shortageResources[idx].push({ stone: Math.floor(-tempStone / 1000) * 1000 });
          excessResources[idx].push({ stone: 0 });
        }

        // Iron
        if (tempIron > 0) {
          excessResources[idx].push({ iron: Math.floor(tempIron / 1000) * 1000 });
          shortageResources[idx].push({ iron: 0 });
        } else {
          shortageResources[idx].push({ iron: Math.floor(-tempIron / 1000) * 1000 });
          excessResources[idx].push({ iron: 0 });
        }
      }

      return { excessResources, shortageResources, villageID };
    }

    // ---------------- Locks (PP) applied to computation ----------------
    function applyPpResourceLock({ villagesData, excessResources, shortageResources }) {
      const locks = loadPpLocks();
      if (!locks.length) return;

      for (const lock of locks) {
        const lockedId = String(lock.villageId);
        const res = String(lock.res);

        const idx = villagesData.findIndex(v => String(v.id) === lockedId);
        if (idx < 0) continue;

        const resIndex = res === "wood" ? 0 : res === "stone" ? 1 : 2;

        if (excessResources[idx] && excessResources[idx][resIndex]) {
          if (res === "wood") excessResources[idx][resIndex].wood = 0;
          if (res === "stone") excessResources[idx][resIndex].stone = 0;
          if (res === "iron") excessResources[idx][resIndex].iron = 0;
        }
        if (shortageResources[idx] && shortageResources[idx][resIndex]) {
          if (res === "wood") shortageResources[idx][resIndex].wood = 0;
          if (res === "stone") shortageResources[idx][resIndex].stone = 0;
          if (res === "iron") shortageResources[idx][resIndex].iron = 0;
        }
      }
    }

    // ---------------- HQ Build Priority ----------------
    // For villages with an empty build queue (queueEndsSec === 0) and a known
    // next building cost:
    //   - Zero their EXCESS for any resource needed by the building (they must
    //     not donate those resources — they need them for construction).
    //   - Boost their SHORTAGE to exactly what's still missing for the building
    //     (rounded up to 1000), so the router prioritises sending to them.
    //
    // hqData: Map<villageId string, { queueEndsSec, costWood, costStone, costIron, buildingName }>
    function applyHqBuildPriority({ villagesData, excessResources, shortageResources, incomingRes, hqData }) {
      if (!hqData || !hqData.size) return;

      // Pre-load both lock sources so we can respect them.
      // Manual locks: keyed by "x|y" coords → { wood, stone, iron }
      // PP locks: keyed by villageId + res
      const manualLocks   = loadManualLocksByCoords();
      const ppLocks       = loadPpLocks(); // array of { villageId, res }
      const ppLockSet     = new Set(ppLocks.map(l => `${l.villageId}:${l.res}`));

      for (let idx = 0; idx < villagesData.length; idx++) {
        const v  = villagesData[idx];
        const hq = hqData.get(String(v.id));
        if (!hq) continue;
        if (hq.queueEndsSec > 0) continue;        // still building — not ready yet
        if (!hq.buildingName) continue;            // no next building configured
        if (hq.costWood + hq.costStone + hq.costIron === 0) continue; // cost unknown

        // Resolve manual lock for this village by coords
        const coords    = coordsFromVillageName(v.name);
        const coordKey  = coords ? `${coords.x}|${coords.y}` : null;
        const manLock   = (coordKey && manualLocks[coordKey]) || {};

        const inc = incomingRes[v.id] || { wood: 0, stone: 0, iron: 0 };

        const RES = [
          { res: "wood",  cost: hq.costWood,  inc: inc.wood,  sIdx: 0, eIdx: 0 },
          { res: "stone", cost: hq.costStone, inc: inc.stone, sIdx: 1, eIdx: 1 },
          { res: "iron",  cost: hq.costIron,  inc: inc.iron,  sIdx: 2, eIdx: 2 },
        ];

        for (const { res, cost, inc: incAmt, sIdx, eIdx } of RES) {
          // Respect locks: if this resource is locked (manual or PP), skip it entirely.
          // applyManualCoordLocks / applyPpResourceLock already zeroed it — don't override.
          if (manLock[res]) continue;
          if (ppLockSet.has(`${v.id}:${res}`)) continue;

          const missing = Math.max(0, cost - (v[res] + incAmt));
          const need    = Math.ceil(missing / 1000) * 1000;
          if (need <= 0) continue;

          // Zero excess — village must not donate a resource it needs for building
          if (excessResources[idx]?.[eIdx]) excessResources[idx][eIdx][res] = 0;

          // Boost shortage to the building shortfall (only if not already higher)
          if (shortageResources[idx]?.[sIdx]) {
            shortageResources[idx][sIdx][res] = Math.max(shortageResources[idx][sIdx][res], need);
          }
        }
      }
    }

    // ---------------- Links build ----------------
    function assignMerchantsAndBuildLinks(villagesData, excessResources, shortageResources, villageID) {
      const links = [];

      // Fix #4: pre-compute coords once, cache pairwise distances
      const coordsById = new Map();
      for (const v of villagesData) {
        const c = coordsFromVillageName(v.name);
        if (c) coordsById.set(String(v.id), c);
      }
      const distCache = new Map();
      function cachedDist(aId, bId) {
        const key = aId < bId ? `${aId}:${bId}` : `${bId}:${aId}`;
        if (!distCache.has(key)) {
          const ca = coordsById.get(aId);
          const cb = coordsById.get(bId);
          distCache.set(key, (ca && cb) ? dist(ca, cb) : 9999);
        }
        return distCache.get(key);
      }

      // Fix #2: shared merchant pool — a single merchantsLeft counter per donor
      // replaces the three independent per-resource slot pools of the original.
      // This prevents over-promising the same physical merchants to multiple resources.
      const donors = [];
      for (let p = 0; p < excessResources.length; p++) {
        const exW = Math.floor(excessResources[p][0].wood  / 1000) * 1000;
        const exS = Math.floor(excessResources[p][1].stone / 1000) * 1000;
        const exI = Math.floor(excessResources[p][2].iron  / 1000) * 1000;
        const combined = exW + exS + exI;
        if (combined <= 0) continue;
        if (!coordsById.has(String(villagesData[p].id))) continue;

        const avail = villagesData[p].availableMerchants;
        const merchantsNeeded = Math.ceil(combined / 1000);
        // Scale excess down to what available merchants can actually carry
        const scale = merchantsNeeded <= avail ? 1 : avail / merchantsNeeded;

        donors.push({
          id:           String(villagesData[p].id),
          merchantsLeft: avail,                          // shared pool
          wood:  Math.floor(exW * scale / 1000) * 1000,
          stone: Math.floor(exS * scale / 1000) * 1000,
          iron:  Math.floor(exI * scale / 1000) * 1000,
        });
      }

      // Fix #3: process each resource pass with receivers sorted largest-shortage-first
      // Original iterated in reverse points order which is unrelated to shortage size.
      const RES = [
        { res: "wood",  sIdx: 0, eIdx: 0 },
        { res: "stone", sIdx: 1, eIdx: 1 },
        { res: "iron",  sIdx: 2, eIdx: 2 },
      ];

      const lowPts = state?.settings?.lowPoints || 0;

      for (const { res, sIdx } of RES) {
        // Split receivers into priority (low-points) and normal tiers.
        // Priority villages are served first to guarantee they always receive resources.
        const priorityReceivers = [];
        const normalReceivers   = [];
        for (let q = 0; q < shortageResources.length; q++) {
          const need = shortageResources[q][sIdx][res] || 0;
          if (need <= 0) continue;
          if (villagesData[q] && villagesData[q].points < lowPts)
            priorityReceivers.push({ q, need });
          else
            normalReceivers.push({ q, need });
        }
        priorityReceivers.sort((a, b) => b.need - a.need);
        normalReceivers.sort((a, b) => b.need - a.need);

        for (const rcv of [...priorityReceivers, ...normalReceivers]) {
          const { q } = rcv;
          let remaining = shortageResources[q][sIdx][res];
          if (remaining <= 0) continue;

          // Fix #4: sort donors by cached distance to this receiver
          const tgtId = String(villageID[q]);
          const sortedDonors = donors
            .filter(d => d[res] > 0 && d.merchantsLeft > 0)
            .sort((a, b) => cachedDist(a.id, tgtId) - cachedDist(b.id, tgtId));

          for (const donor of sortedDonors) {
            if (remaining <= 0) break;
            if (donor[res] <= 0 || donor.merchantsLeft <= 0) continue;

            // How much can this donor actually send given shared merchant pool?
            const maxByMerchants = donor.merchantsLeft * 1000;
            const canSend = Math.floor(Math.min(remaining, donor[res], maxByMerchants) / 1000) * 1000;
            if (canSend <= 0) continue;

            links.push({
              source: donor.id,
              target: tgtId,
              wood:  res === "wood"  ? canSend : 0,
              stone: res === "stone" ? canSend : 0,
              iron:  res === "iron"  ? canSend : 0,
            });

            donor[res]         -= canSend;
            donor.merchantsLeft -= Math.ceil(canSend / 1000); // Fix #2: deduct from shared pool
            remaining          -= canSend;
          }

          shortageResources[q][sIdx][res] = remaining;
        }
      }

      return { links };
    }

    // Fix #8: O(n) Map-based merge replacing the original O(n²) nested loop.
    function normalizeAndCombineLinks(links) {
      const map = new Map();
      for (const l of links) {
        const key = `${l.source}:${l.target}`;
        const e = map.get(key) || { source: l.source, target: l.target, wood: 0, stone: 0, iron: 0 };
        e.wood  += l.wood  || 0;
        e.stone += l.stone || 0;
        e.iron  += l.iron  || 0;
        map.set(key, e);
      }
      return [...map.values()].filter(l => l.wood + l.stone + l.iron > 0);
    }

    function addDistanceToLinks(cleanLinks, villagesData) {
      const byId = new Map(villagesData.map(v => [String(v.id), v]));
      for (const l of cleanLinks) {
        const src = byId.get(String(l.source));
        const tgt = byId.get(String(l.target));
        const c1 = coordsFromVillageName(src?.name || "");
        const c2 = coordsFromVillageName(tgt?.name || "");
        l.distance = (c1 && c2) ? dist(c1, c2) : 9999;
      }
      cleanLinks.sort((a, b) => a.distance - b.distance);
      return cleanLinks;
    }

  // Improved spatial clustering with inter-cluster exchange via closest links
  function applyClustering(links, villagesData, numClusters) {
    if (!numClusters || numClusters < 2) return links;

    // Get coordinates
    const villageCoords = new Map();
    villagesData.forEach(v => {
      const c = coordsFromVillageName(v.name);
      if (c) villageCoords.set(String(v.id), c);
    });

    // Find map bounds
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    villageCoords.forEach(c => {
      minX = Math.min(minX, c.x);
      maxX = Math.max(maxX, c.x);
      minY = Math.min(minY, c.y);
      maxY = Math.max(maxY, c.y);
    });

    const width = maxX - minX || 1;
    const height = maxY - minY || 1;
    const gridSize = Math.ceil(Math.sqrt(numClusters));

    // Assign cluster ID to each village
    const villageCluster = new Map();
    villagesData.forEach(v => {
      const c = villageCoords.get(String(v.id));
      if (!c) {
        villageCluster.set(String(v.id), 0);
        return;
      }
      const gx = Math.floor(((c.x - minX) / width) * gridSize);
      const gy = Math.floor(((c.y - minY) / height) * gridSize);
      const clusterId = gy * gridSize + gx;
      villageCluster.set(String(v.id), Math.min(clusterId, numClusters - 1));
    });

    // Tag links with cluster info and distance
    const enhancedLinks = links.map(link => {
      const srcCluster = villageCluster.get(String(link.source)) || 0;
      const tgtCluster = villageCluster.get(String(link.target)) || 0;
      return {
        ...link,
        srcCluster,
        tgtCluster,
        isIntraCluster: srcCluster === tgtCluster
      };
    });

    // Sort: intra-cluster first, then inter-cluster by distance (closest exchanges preferred)
    enhancedLinks.sort((a, b) => {
      if (a.isIntraCluster !== b.isIntraCluster) {
        return a.isIntraCluster ? -1 : 1;   // intra first
      }
      return (a.distance || 9999) - (b.distance || 9999); // then closest overall
    });

    return enhancedLinks;
  }

    // ---------------- CIRCULAR ROUTE REMOVAL ----------------
    // If A→B and B→A both exist, keep only the net direction per resource.
    // Mixed-direction resources (A sends wood to B while B sends wood to A)
    // waste merchants — collapse them into a single net shipment.
    function removeCircularRoutes(links) {
      const map = new Map();
      for (const l of links) map.set(`${l.source}:${l.target}`, l);

      const toRemove = new Set();
      const processed = new Set();

      for (const l of links) {
        const key     = `${l.source}:${l.target}`;
        const revKey  = `${l.target}:${l.source}`;
        if (processed.has(key) || processed.has(revKey)) continue;
        processed.add(key);

        const rev = map.get(revKey);
        if (!rev) continue;

        processed.add(revKey);

        // Net per resource (positive = l direction, negative = rev direction)
        const netWood  = (l.wood  || 0) - (rev.wood  || 0);
        const netStone = (l.stone || 0) - (rev.stone || 0);
        const netIron  = (l.iron  || 0) - (rev.iron  || 0);

        // Update forward link to carry only the net forward amounts
        l.wood  = Math.max(0, netWood);
        l.stone = Math.max(0, netStone);
        l.iron  = Math.max(0, netIron);

        // Update reverse link to carry only the net reverse amounts
        rev.wood  = Math.max(0, -netWood);
        rev.stone = Math.max(0, -netStone);
        rev.iron  = Math.max(0, -netIron);

        if (l.wood   + l.stone   + l.iron   === 0) toRemove.add(key);
        if (rev.wood + rev.stone + rev.iron === 0) toRemove.add(revKey);
      }

      return links.filter(l => !toRemove.has(`${l.source}:${l.target}`));
    }

    // ---------------- PP PLAN BUILDER ----------------
    function choosePayNeedFromTotals(totals) {
      const totalByRes = { wood: totals.totalWood, stone: totals.totalStone, iron: totals.totalIron };
      const resList = ["wood", "stone", "iron"];

      const payRes = resList.slice().sort((a, b) => totalByRes[b] - totalByRes[a])[0];
      const neededRes = resList.slice().sort((a, b) => totalByRes[a] - totalByRes[b])[0];

      if (!payRes || !neededRes || payRes === neededRes) return null;
      return { payRes, neededRes, totalByRes };
    }

    function buildOneInstantTradePlan(excludedVillageIds) {
      const s = state.settings;
      if (!s.premiumInstantEnabled) return null;

      const totals = state.averages;
      if (!totals) return null;

      const pick = choosePayNeedFromTotals(totals);
      if (!pick) return null;

      const { payRes, neededRes, totalByRes } = pick;

      const spread = totalByRes[payRes] - totalByRes[neededRes];
      if (spread < (s.premiumThreshold || 0)) return null;

      const idealMove = Math.floor((spread / 2) / 1000) * 1000;
      if (idealMove <= 0) return null;

      const keepPct = (typeof s.premiumDonorKeepPct === "number" ? s.premiumDonorKeepPct : 0.10);
      const keepMin = (typeof s.premiumDonorKeepMin === "number" ? s.premiumDonorKeepMin : 20000);
      const donorMinExcess = (typeof s.premiumDonorMinExcess === "number" ? s.premiumDonorMinExcess : 5000);

      const donors = state.villagesData
        .map(v => {
          if (excludedVillageIds.has(String(v.id))) return null;

          const wh = v.warehouseCapacity || 0;
          const merch = (v.availableMerchants || 0);
          if (merch <= 0) return null;

          const cur =
            payRes === "wood" ? (v.wood || 0) :
            payRes === "stone" ? (v.stone || 0) :
            (v.iron || 0);

          const keepByPct = Math.floor((wh * keepPct) / 1000) * 1000;
          const keep = Math.floor(Math.max(keepMin, keepByPct) / 1000) * 1000;

          let exAmt = cur - keep;
          exAmt = Math.floor(exAmt / 1000) * 1000;

          if (exAmt < donorMinExcess) return null;
          return { v, exAmt };
        })
        .filter(Boolean);

      if (!donors.length) return null;

      const buffer = 7000;
      const minTrade = (s.premiumMinTradeAmount || 0);

      // ── Check for immediate trade opportunity ────────────────────────────────
      // If any village already holds enough of payRes to execute the trade right
      // now (no shipping needed), create a zero-shipment plan and return early.
      //
      // Rules:
      //  - Village must not be excluded and must have merchants
      //  - Available amount = curPay minus keep threshold (same as donor calc)
      //  - Available amount must meet minTrade and premiumThreshold
      //  - Pick the village with the MOST available payRes (maximises trade size)
      {
        const instantCandidates = state.villagesData
          .map(v => {
            if (excludedVillageIds.has(String(v.id))) return null;
            if ((v.availableMerchants || 0) <= 0) return null;

            const wh     = v.warehouseCapacity || 0;
            const curPay = payRes === "wood" ? (v.wood || 0) : payRes === "stone" ? (v.stone || 0) : (v.iron || 0);

            // Respect keep threshold — same logic as donors above
            const keepByPct = Math.floor((wh * keepPct) / 1000) * 1000;
            const keep      = Math.floor(Math.max(keepMin, keepByPct) / 1000) * 1000;
            const avail     = Math.floor(Math.max(0, curPay - keep) / 1000) * 1000;

            if (avail < minTrade) return null;

            const tradeAmt = Math.floor(Math.min(avail, s.premiumMoveAmount || idealMove, idealMove) / 1000) * 1000;
            if (tradeAmt < minTrade) return null;
            if (tradeAmt < (s.premiumThreshold || 0)) return null;

            return { v, tradeAmt, avail };
          })
          .filter(Boolean)
          .sort((a, b) => b.avail - a.avail);  // most excess first

        if (instantCandidates.length) {
          const best = instantCandidates[0];
          const instantPlan = {
            id: "",
            neededRes,
            payRes,
            targetVillageId: String(best.v.id),
            targetVillageName: best.v.name,
            shipments: [],           // no shipping needed — trade immediately
            tradeAmount: best.tradeAmt,
            spread,
            idealMove,
            moveAmt: best.tradeAmt,
            whFree: best.avail,
            instant: true,           // flag: execute without waiting for incoming
            createdAt: Date.now(),
            lastArrivalEtaSec: null,
            lastArrivalMsAtFetch: null,
            lastRefreshMs: 0
          };
          instantPlan.id = makePlanId(instantPlan);
          return instantPlan;
        }
      }

      const candidates = state.villagesData
        .map(v => {
          if (excludedVillageIds.has(String(v.id))) return null;

          const vc = coordsFromVillageName(v.name);
          if (!vc) return null;

          const merch = (v.availableMerchants || 0);
          if (merch <= 0) return null;

          const whCap = v.warehouseCapacity || 0;

          const curPay =
            payRes === "wood" ? (v.wood || 0) :
            payRes === "stone" ? (v.stone || 0) :
            (v.iron || 0);

          let free = whCap - curPay - buffer;
          free = Math.max(0, Math.floor(free / 1000) * 1000);
          if (free < minTrade) return null;

          let maxDist = 0;
          for (const d of donors) {
            const dc = coordsFromVillageName(d.v.name);
            if (!dc) continue;
            maxDist = Math.max(maxDist, dist(dc, vc));
          }

          return { v, free, maxDist };
        })
        .filter(Boolean)
        .sort((a, b) => (a.maxDist - b.maxDist) || (b.free - a.free));

      const chosen = candidates[0];
      if (!chosen) return null;

      const target = chosen.v;

      const capLimit = Math.floor((target.warehouseCapacity || 0) * (s.premiumMaxTargetFillPct || 0.90) / 1000) * 1000;

      let moveAmt = Math.min(idealMove, s.premiumMoveAmount || idealMove, chosen.free);
      if (capLimit > 0) moveAmt = Math.min(moveAmt, capLimit);
      moveAmt = Math.floor(moveAmt / 1000) * 1000;
      if (moveAmt <= 0) return null;

      const targetC = coordsFromVillageName(target.name);
      const donorsSorted = donors
        .map(d => {
          const dc = coordsFromVillageName(d.v.name);
          const distance = (dc && targetC) ? dist(dc, targetC) : 999999;
          return { ...d, distance };
        })
        .filter(d => d.distance <= (s.premiumMaxDistance || 999999))
        .sort((a, b) => a.distance - b.distance);

      let remaining = moveAmt;
      const shipments = [];

      for (const d of donorsSorted) {
        if (remaining <= 0) break;
        if (excludedVillageIds.has(String(d.v.id))) continue;
        if (String(d.v.id) === String(target.id)) continue;

        const donorMaxSend = (d.v.availableMerchants || 0) * 1000;

        let canSend = Math.min(remaining, d.exAmt, donorMaxSend);
        canSend = Math.floor(canSend / 1000) * 1000;
        if (canSend <= 0) continue;

        shipments.push({
          source: d.v.id,
          target: target.id,
          wood: payRes === "wood" ? canSend : 0,
          stone: payRes === "stone" ? canSend : 0,
          iron: payRes === "iron" ? canSend : 0,
          distance: d.distance,
          sourceName: d.v.name
        });

        remaining -= canSend;
      }

      const shippedTotal = shipments.reduce((sum, sh) => sum + sh.wood + sh.stone + sh.iron, 0);
      if (shippedTotal < minTrade) return null;

      const plan = {
        id: "",
        neededRes,
        payRes,
        targetVillageId: String(target.id),
        targetVillageName: target.name,
        shipments,
        tradeAmount: shippedTotal,
        spread,
        idealMove,
        moveAmt,
        whFree: chosen.free,
        instant: false,
        createdAt: Date.now(),
        lastArrivalEtaSec: null,
        lastArrivalMsAtFetch: null,
        lastRefreshMs: 0
      };

      plan.id = makePlanId(plan);
      return plan;
    }

    function buildPlansUntilDone(regularReceiverIds) {
      const plans = [];
      // Fix #7: seed excluded set with regular-plan receivers so PP donors
      // are never also receivers in the normal balancer run.
      const excluded = new Set(regularReceiverIds || []);
      const hardCap = Math.max(1, state.settings.premiumMaxPlansHardCap || 12);

      for (let i = 0; i < hardCap; i++) {
        const p = buildOneInstantTradePlan(excluded);
        if (!p) break;

        plans.push(p);

        excluded.add(String(p.targetVillageId));
        for (const sh of p.shipments) excluded.add(String(sh.source));
      }

      return plans;
    }

    // ---------------- UI: PP lock status + tooltip ----------------
    function renderPpLockStatus() {
      const $root = $("#tmwh_ppLockStatus");
      if (!$root.length) return;

      const plans = loadPpPlans();
      if (!plans.length) {
        $root.html(`<span class="twmuted">PP routes: <b>none</b></span>`);
        return;
      }

      const helpHtml = `
        <div style="font-weight:bold; margin-bottom:6px">Instant Trade (Merchant Exchange)</div>
        <div class="twmuted">
          Step 1: Send the suggested resource to the target village.<br/>
          Step 2: When the last incoming arrives, script executes Merchant Exchange for <b>10pp</b>.<br/>
          Step 3: Script re-runs the balancer.
        </div>
      `;

      const list = plans.map(p => {
        const name = p.targetVillageName || `ID ${p.targetVillageId}`;
        return `
          <div class="tmPpRouteRow" data-planid="${p.id}">
            <span class="tmPpMini">
              <b>${resourceLabel(p.payRes)}</b> → <b>${resourceLabel(p.neededRes)}</b> @ <b>${name}</b>
            </span>
          </div>
        `;
      }).join("");

      $root.html(`
        <div class="twmuted"><b>PP routes</b> (${plans.length}) <span class="twmuted">(hover a route for info)</span></div>
        ${list}
      `);

      // IMPORTANT FIX: bind AFTER html is injected; also use mouseover/out (more robust than mouseenter in some cases)
      ensureTipPortal();
      $root.find(".tmPpRouteRow")
        .off("mouseover mouseout")
        .on("mouseover", function () {
          showTipAt(this, helpHtml);
        })
        .on("mouseout", function () {
          hideTip();
        });
    }

    // ---------------- Timer boxes per plan ----------------
    function renderTimerBoxForPlan(plan, modeText, countdown, etaInfo) {
      const etaLine = etaInfo ? `<div class="line twmuted">${etaInfo}</div>` : "";

      const moved = sumShipments(plan);
      const movedAmount =
        plan.payRes === "wood" ? moved.wood :
        plan.payRes === "stone" ? moved.stone :
        moved.iron;

      const isInstant = plan.instant || plan.shipments.length === 0;
      const totalsLine = isInstant
        ? `<div class="line twmuted"><span style="color:#1a7a1a;font-weight:bold">⚡ Instant</span> — resources already on hand, no shipping needed.</div>`
        : `<div class="line twmuted">Shipments total: <b>${numberWithCommasDots(movedAmount || 0)}</b> ${resourceLabel(plan.payRes)}</div>`;

      const v = validatePpPlanUnderCurrentSettings(plan);
      const invalidLine = !v.ok
        ? `<div class="line" style="color:#a40000; font-weight:bold">
            ⚠ Invalid under current settings: ${v.reasons.join(" | ")}
          </div>`
        : "";

      const byId = new Map((state?.villagesData || []).map(v => [String(v.id), v]));
      const tgt = byId.get(String(plan.targetVillageId));

      const shipmentsHtml = plan.shipments.map((s) => {
        const src = byId.get(String(s.source));
        return `
          <tr>
            <td>${src ? `<a class="tmLink" href="${src.url}">${src.name}</a>` : (s.sourceName || s.source)}</td>
            <td>${tgt ? `<a class="tmLink" href="${tgt.url}">${tgt.name}</a>` : plan.targetVillageName}</td>
            <td style="text-align:center">${s.distance}</td>
            <td style="text-align:right">${s.wood || 0}</td>
            <td style="text-align:right">${s.stone || 0}</td>
            <td style="text-align:right">${s.iron || 0}</td>
          </tr>
        `;
      }).join("");

      const boxId = `tmwh_timer_plan_${String(plan.id).replace(/[^\w]/g, "_")}`;

      const html = `
        <div class="tmTimerBox" id="${boxId}">
          <div class="tm-flex">
            <div>
              <div class="line"><b>PP route:</b> ${resourceLabel(plan.payRes)} → ${resourceLabel(plan.neededRes)} @ <b>${plan.targetVillageName}</b></div>
              ${totalsLine}
              ${invalidLine}
              <div class="line twmuted">${modeText}</div>
              ${etaLine}
            </div>
            <div style="text-align:right">
              <div class="line big">${countdown || "--:--:--"}</div>
            </div>
          </div>

          <table class="tmPpMiniTable">
            <thead>
              <tr>
                <th>From</th><th>To</th><th>Dist</th><th>${resIconHtml("wood")}</th><th>${resIconHtml("stone")}</th><th>${resIconHtml("iron")}</th>
              </tr>
            </thead>
            <tbody>
              ${shipmentsHtml}
            </tbody>
          </table>

          <div class="tm-actions" style="margin-top:6px">
            <button class="btn btnSophie" data-cancelplan="1" data-planid="${plan.id}" type="button">Cancel plan</button>
            <button class="btn btnSophie" data-clearlock="1" data-planid="${plan.id}" data-ppvid="${plan.targetVillageId}" data-ppres="${plan.payRes}" type="button">Clear lock</button>
          </div>
        </div>
      `;

      const $root = $("#tmwh_timer");
      const $existing = $(`#${boxId}`);
      if ($existing.length) $existing.replaceWith(html);
      else $root.append(html);

      $(`button[data-cancelplan][data-planid="${plan.id}"]`).off("click").on("click", () => {
        stopPlanTimer(plan.id);
        removePpPlan(plan.id);
        $(`#${boxId}`).remove();
        UI.SuccessMessage("Instant trade plan cancelled (lock kept).");
        renderPpLockStatus();
      });

      $(`button[data-clearlock][data-planid="${plan.id}"]`).off("click").on("click", function () {
        const vid = $(this).attr("data-ppvid");
        const res = $(this).attr("data-ppres");

        stopPlanTimer(plan.id);
        removePpLock({ villageId: vid, res });
        removePlansByLock({ villageId: vid, res });
        $(`#${boxId}`).remove();

        UI.SuccessMessage("PP lock cleared (selected route only).");
        renderPpLockStatus();
      });
    }

    function stopPlanTimer(planId) {
      if (!state || !state.planTimers) return;
      const t = state.planTimers.get(String(planId));
      if (t) clearTimeout(t);
      state.planTimers.delete(String(planId));
    }

    function stopAllPlanTimers() {
      if (!state || !state.planTimers) return;
      for (const t of state.planTimers.values()) clearTimeout(t);
      state.planTimers.clear();
    }

    async function startPlanCountdown(plan) {
      if (!state.planTimers) state.planTimers = new Map();
      stopPlanTimer(plan.id);

      const pollEveryMs = 15000;
      const refreshEtaEveryMs = 60000;

      // ensure persisted
      upsertPpPlan(plan);

      // Instant trade: no shipping needed — show manual trade link
      if (plan.instant || plan.shipments.length === 0) {
        const tradeUrl = makeURL({ village: plan.targetVillageId, screen: "market", mode: "other_offer" });
        renderTimerBoxForPlan(
          plan,
          `Resources already available — <a class="tmLink" href="${tradeUrl}" target="_self">click here to execute the Merchant Exchange manually</a>`,
          "00:00:00",
          null
        );
        UI.SuccessMessage("Resources ready — open the market to execute the Merchant Exchange manually.");
        return;
      }

      renderTimerBoxForPlan(
        plan,
        "PP plan active. Waiting for shipments to show as incoming on the target village...",
        "--:--:--",
        "ETA: unknown (no matching incoming found yet)"
      );

      async function loop() {
        if (!state) return;

        const persisted = loadPpPlans().find(p => String(p.id) === String(plan.id));
        if (!persisted) {
          stopPlanTimer(plan.id);
          return;
        }
        plan = { ...persisted };

        const now = getNowMs();
        const lastRefresh = plan.lastRefreshMs || 0;
        const needRefresh = (plan.lastArrivalEtaSec == null) || ((now - lastRefresh) > refreshEtaEveryMs);

        if (needRefresh) {
          try {
            const eta = await fetchIncomingLastArrivalSecondsForPlan(plan);
            if (eta === null) {
              plan.lastRefreshMs = getNowMs();
              upsertPpPlan(plan);

              renderTimerBoxForPlan(
                plan,
                "No matching incoming found yet. Send the suggested shipments first.",
                "--:--:--",
                "ETA: unknown (waiting for incoming to appear)"
              );

              state.planTimers.set(plan.id, setTimeout(loop, pollEveryMs));
              return;
            }

            plan.lastArrivalEtaSec = eta;
            const now = getNowMs();
            plan.lastArrivalMsAtFetch = now;
            plan.lastRefreshMs = now;
            upsertPpPlan(plan);
          } catch (e) {
            // eslint-disable-next-line no-console
            console.warn("ETA refresh failed", e);
            state.planTimers.set(plan.id, setTimeout(loop, pollEveryMs));
            return;
          }
        }

        const remainingSec = computeRemainingSecFromAnchor(plan);

        renderTimerBoxForPlan(
          plan,
          "Countdown to last incoming arrival on target village.",
          remainingSec == null ? "--:--:--" : formatHMS(remainingSec)
        );

        if (remainingSec != null && remainingSec <= 0) {
          stopPlanTimer(plan.id);
          const tradeUrl = makeURL({ village: plan.targetVillageId, screen: "market", mode: "other_offer" });
          renderTimerBoxForPlan(
            plan,
            `Shipments arrived — <a class="tmLink" href="${tradeUrl}" target="_self">click here to execute the Merchant Exchange manually</a>`,
            "00:00:00",
            "ETA until trade: 00:00:00"
          );
          UI.SuccessMessage("Incoming arrived — open the market to execute the Merchant Exchange manually.");
          return;
        }

        state.planTimers.set(plan.id, setTimeout(loop, 1000));
      }

      loop();
    }

    async function resumePersistedPlans() {
      const plans = loadPpPlans();
      if (!plans.length) return;
      if (!$("#tmwh_timer").length) return;

      for (const p of plans) {
        addPpLock({ villageId: p.targetVillageId, res: p.payRes });
        await startPlanCountdown(p);
      }
      renderPpLockStatus();
    }

    // ---------------- SEND ALL ----------------
    function startSendAll({ onlyPp }) {
      if (!state || !state.settings.sendAllEnabled) {
        UI.ErrorMessage("Send All is disabled in settings.");
        return;
      }

      if (state.sendAllTimer) {
        UI.ErrorMessage("Send All already running.");
        return;
      }

      const interval = Math.max(100, parseInt(state.settings.sendAllIntervalMs, 10) || 500);
      UI.SuccessMessage(`Send All started (${interval}ms).`);

      const tick = () => {
        if (!state || !state.sendAllTimer) return;

        let $btn = null;
        if (onlyPp) {
          $btn = $(".tmSendSug:visible").first();
        } else {
          $btn = $(".tmSendSug:visible").first();
          if (!$btn.length) $btn = $(".tmSendNormal:visible").first();
        }

        if (!$btn || !$btn.length) {
          UI.SuccessMessage("Send All finished: no more rows.");
          stopSendAll();
          return;
        }

        $btn.trigger("click");
        state.sendAllTimer = setTimeout(tick, interval);
      };

      state.sendAllTimer = setTimeout(tick, interval);
    }

    function stopSendAll() {
      if (state && state.sendAllTimer) {
        clearTimeout(state.sendAllTimer);
        state.sendAllTimer = null;
        UI.SuccessMessage("Send All stopped.");
      }
    }

    // ---------------- UI: manual lock list render ----------------
    function renderManualCoordLockList() {
      const locks = listManualCoordLocks();
      const keys = Object.keys(locks).sort();
      const comments = loadManualLockComments();

      const $list = $("#tmwh_coordLockList");
      if (!$list.length) return;

      if (!keys.length) {
        $list.html(`<div class="twmuted" style="padding:6px">No manual locks.</div>`);
        return;
      }

      const html = keys.map(k => {
        const l = locks[k] || {};
        const wood = resIconHtml("wood", !l.wood);
        const stone = resIconHtml("stone", !l.stone);
        const iron = resIconHtml("iron", !l.iron);

        const c = comments[k] ? String(comments[k]) : "";
        const commentHtml = c ? `<span class="tmLockComment" title="${c.replace(/"/g, "&quot;")}">${c}</span>` : "";

        return `
          <div class="tmLockItem" data-coords="${k}">
            <div class="tmLockBadges">
              <b><a class="tmCoordLink" href="#" data-coordslink="${k}">${k}</a></b>
              ${wood}${stone}${iron}
              ${commentHtml}
            </div>
            <button class="btn btnSophie tmLockX" data-del="${k}" type="button">X</button>
          </div>
        `;
      }).join("");

      $list.html(html);

      // Click coords => go to game.php?screen=overview&village=<id>
      $list.find("a[data-coordslink]").off("click").on("click", function (e) {
        e.preventDefault();
        e.stopPropagation();

        const key = $(this).attr("data-coordslink");

        const vid = state?.villagesData?.find(v => {
          const c = coordsFromVillageName(v.name);
          return c && `${c.x}|${c.y}` === key;
        })?.id;

        if (!vid) return UI.ErrorMessage("Village not found (press Run first).");

        const u = new URL(window.location.href);
        // Ensure we land in the exact place you requested:
        u.pathname = u.pathname.replace(/\/[^/]*$/, "/game.php");
        u.searchParams.set("screen", "overview");
        u.searchParams.set("village", String(vid));

        // Clear params that can force other overviews (optional but recommended)
        u.searchParams.delete("mode");
        u.searchParams.delete("type");
        u.searchParams.delete("page");

        window.location.href = u.toString();
      });

      $list.find("button[data-del]").off("click").on("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        const key = $(this).attr("data-del");
        try {
          clearManualCoordLock(key);
          renderManualCoordLockList();
          UI.SuccessMessage(`Manual lock removed for ${key}.`);
        } catch (err) {
          UI.ErrorMessage(err.message || String(err));
        }
      });

      $list.find(".tmLockItem").off("click").on("click", function () {
        const key = $(this).attr("data-coords");
        const lock = listManualCoordLocks()[key] || {};
        $("#tmwh_lockCoords").val(key);
        $("#tmwh_lockWood").prop("checked", !!lock.wood);
        $("#tmwh_lockStone").prop("checked", !!lock.stone);
        $("#tmwh_lockIron").prop("checked", !!lock.iron);
        $("#tmwh_lockComment").val(getManualCoordComment(key));
      });
    }

    // ---------------- MAIN DIALOG ----------------
    function showMainDialog() {
      const s = state.settings;
      const settingsOpen = !!s.settingsOpen;
      const premiumOpen = !!s.premiumOptionsOpen;

      const html = `
<div class="tmWH">
  <div class="twbox">
    <div class="title">
      Warehouse Balancer (Standalone)
      <span class="twbadge">Any page</span>
    </div>
    <div class="tm-flex">
      <div class="twmuted">Fetches overview pages, computes plan, shows send list here.</div>
      <div class="tm-actions">
        <button class="btn btnSophie" id="tmwh_run" type="button">Run</button>
        <button class="btn btnSophie" id="tmwh_export_settings" type="button">Export settings</button>
        <button class="btn btnSophie" id="tmwh_import_settings" type="button">Import settings</button>
        <button class="btn btnSophie" id="tmwh_close" type="button">Close</button>
      </div>
    </div>
  </div>

  <div class="twbox">
    <button class="tmToggle ${settingsOpen ? "open" : ""}" id="tmwh_toggleSettings" type="button">Settings</button>
    <div class="tmSettingsBody ${settingsOpen ? "open" : ""}" id="tmwh_settingsBody">
      <div class="tm-grid">
        <label>Ignore settings</label>
        <input type="checkbox" id="tmwh_isMinting" ${s.isMinting ? "checked" : ""}>

        <label>Prioritise villages below points</label>
        <input type="number" id="tmwh_lowPoints" value="${s.lowPoints}">

        <label>Finished villages above points</label>
        <input type="number" id="tmwh_highPoints" value="${s.highPoints}">

        <label>High farm (pop)</label>
        <input type="number" id="tmwh_highFarm" value="${s.highFarm}">

        <label>WH % to keep in finished villages</label>
        <input type="number" step="0.01" min="0.01" max="0.95" id="tmwh_builtOutPercentage" value="${s.builtOutPercentage}">

        <label>WH % target for priority villages</label>
        <input type="number" step="0.01" min="0" max="1" id="tmwh_needsMorePercentage" value="${s.needsMorePercentage}">

        <label>Reserve per village (not sent)</label>
        <input type="number" id="tmwh_reservePerVillage" value="${s.reservePerVillage}">

        <label>Global max distance (fields)</label>
        <input type="number" id="tmwh_maxDistance" value="${s.maxDistance}">

        <label>Prioritise empty build queues <a href="#" class="tmLink tmHelp" data-tip="hq_priority">?</a></label>
        <input type="checkbox" id="tmwh_hqPriorityEnabled" ${s.hqPriorityEnabled ? "checked" : ""}>

        <label>Maxed out village (points) <a href="#" class="tmLink tmHelp" data-tip="hq_maxed">?</a></label>
        <input type="number" id="tmwh_maxedOutPoints" value="${s.maxedOutPoints}">
        
        <label>Low-points long queue threshold (hours): <a href="#" class="tmLink tmHelp" data-tip="LP_QueueHrs">?</a></label></label>
        <input type="number" id="tmwh_lowPointsLongQueueHours" value="${s.lowPointsLongQueueHours}">

        <label>Clusters <a href="#" class="tmLink tmHelp" data-tip="cluster_logic">?</a></label>
        <input type="checkbox" id="tmwh_useClusters" ${s.useClusters ? "checked" : ""}>
        
        <label>Number of Clusters</label>
        <input type="number" id="tmwh_numClusters" "${s.numClustersd}">
      </div>
      <hr/>

      <button class="tmSubToggle ${premiumOpen ? "open" : ""}" id="tmwh_togglePremium" type="button">
        Instant Trade (Merchant Exchange) <span class="twbadge">10pp</span>
        <span class="twmuted" style="font-weight:normal">(${s.premiumInstantEnabled ? "enabled" : "disabled"})</span>
      </button>

      <div class="tmSubBody ${premiumOpen ? "open" : ""}" id="tmwh_premiumBody">
        <div class="tm-grid">
          <label>Enable</label>
          <input type="checkbox" id="tmwh_premiumEnabled" ${s.premiumInstantEnabled ? "checked" : ""}>

          <label>Routing Strategy <a href="#" class="tmLink tmHelp" data-tip="tipStrategy">?</a></label>
          <select id="tmwh_premiumStagingStrategy">
            <option value="weighted" ${s.premiumStagingStrategy === "weighted" ? "selected" : ""}>Weighted donors</option>
            <option value="largest" ${s.premiumStagingStrategy === "largest" ? "selected" : ""}>Largest donor</option>
          </select>

          <label>Threshold <a href="#" class="tmLink tmHelp" data-tip="pp_threshold">?</a></label>
          <input type="number" id="tmwh_premiumThreshold" value="${s.premiumThreshold}">

          <label>Min trade amount <a href="#" class="tmLink tmHelp" data-tip="pp_min_trade">?</a></label>
          <input type="number" id="tmwh_premiumMinTradeAmount" value="${s.premiumMinTradeAmount}">

          <label>Move amount <a href="#" class="tmLink tmHelp" data-tip="pp_move_amount">?</a></label>
          <input type="number" id="tmwh_premiumMoveAmount" value="${s.premiumMoveAmount}">

          <label>Max distance <a href="#" class="tmLink tmHelp" data-tip="pp_max_distance">?</a></label>
          <input type="number" id="tmwh_premiumMaxDistance" value="${s.premiumMaxDistance}">

          <label>Max target fill (%) <a href="#" class="tmLink tmHelp" data-tip="pp_max_fill">?</a></label>
          <input type="number" step="0.01" min="0.1" max="0.98" id="tmwh_premiumMaxTargetFillPct" value="${s.premiumMaxTargetFillPct}">

          <label>Max plans <a href="#" class="tmLink tmHelp" data-tip="pp_max_plans">?</a></label>
          <input type="number" id="tmwh_premiumMaxPlansHardCap" value="${s.premiumMaxPlansHardCap}">
        </div>

        <hr/>

        <div class="tm-grid">
          <label>Donor keep (%) <a href="#" class="tmLink tmHelp" data-tip="pp_donor_keep_pct">?</a></label>
          <input type="number" step="0.01" min="0" max="0.95" id="tmwh_premiumDonorKeepPct" value="${s.premiumDonorKeepPct}">

          <label>Donor keep min <a href="#" class="tmLink tmHelp" data-tip="pp_donor_keep_min">?</a></label>
          <input type="number" id="tmwh_premiumDonorKeepMin" value="${s.premiumDonorKeepMin}">

          <label>Donor min excess <a href="#" class="tmLink tmHelp" data-tip="pp_donor_min_excess">?</a></label>
          <input type="number" id="tmwh_premiumDonorMinExcess" value="${s.premiumDonorMinExcess}">
        </div>

        <div class="tm-actions" style="margin-top:8px">
          <div id="tmwh_ppLockStatus" class="twmuted"></div>
        </div>

        <div id="tmwh_timer"></div>
      </div>

      <hr/>

      <button class="tmSubToggle ${s.sendAllEnabled ? "open" : ""}" id="tmwh_toggleSendAll" type="button">Send All (automation)</button>
      <div class="tmSubBody ${s.sendAllEnabled ? "open" : ""}" id="tmwh_sendAllBody">
        <div class="tm-grid">
          <label>Enable Send All</label>
          <input type="checkbox" id="tmwh_sendAllEnabled" ${s.sendAllEnabled ? "checked" : ""}>

          <label>Interval (ms)</label>
          <input type="number" id="tmwh_sendAllIntervalMs" value="${s.sendAllIntervalMs}">
        </div>
        <div class="twmuted" style="margin-top:6px">
          When you press "Send all", it clicks one row every interval (default 500ms).
        </div>
      </div>

      <hr/>

      <button class="tmSubToggle" id="tmwh_toggleManualLocks" type="button">Manual locks (coords)</button>
      <div class="tmSubBody" id="tmwh_manualLocksBody">
        <div class="tmMiniRow">
          <div>
            <span class="twmuted" style="font-weight:bold">Coords</span><br/>
            <input type="text" id="tmwh_lockCoords" placeholder="451|601">
          </div>

          <div class="tmMiniChecks">
            <label title="Lock Wood">${resIconHtml("wood", false)} <input type="checkbox" id="tmwh_lockWood"></label>
            <label title="Lock Clay">${resIconHtml("stone", false)} <input type="checkbox" id="tmwh_lockStone"></label>
            <label title="Lock Iron">${resIconHtml("iron", false)} <input type="checkbox" id="tmwh_lockIron"></label>
          </div>

          <div>
            <span class="twmuted" style="font-weight:bold">Comment</span><br/>
            <input type="text" id="tmwh_lockComment" placeholder="e.g. nobles, catapult..." style="width:200px">
          </div>

          <div class="tm-actions">
            <button class="btn btnSophie" id="tmwh_saveCoordLock" type="button">Save</button>
            <button class="btn btnSophie" id="tmwh_clearCoordLock" type="button">Clear</button>
          </div>
        </div>

        <div class="twmuted" style="margin-top:6px">
          Locks persist until removed. Locked resources won’t be sent to/from that village. Click coords to open the village.
        </div>

        <div class="tmLockList" id="tmwh_coordLockList"></div>
      </div>

      <div class="tm-actions" style="margin-top:10px">
        <button class="btn btnSophie" id="tmwh_save" type="button">Save settings</button>
      </div>
    </div>
  </div>

  <div class="twbox">
    <div class="title">Results</div>
    <div id="tmwh_summary" class="twmuted">Press Run.</div>
  </div>

  <div class="twbox">
    <div class="title">
      HQ Build Queue Check
      <button class="btn btnSophie" id="tmwh_hq_run" type="button" style="float:right;font-size:11px;margin-top:-2px;">Check HQ</button>
    </div>
    <div class="twmuted" style="font-size:11px;margin-bottom:6px">
      Fetches each village's HQ page to check if resources will be available when the current build queue finishes.
    </div>
    <div id="tmwh_hq_panel" class="twmuted">Press Run (with "Prioritise empty build queues" enabled) or press "Check HQ".</div>
  </div>

  <div class="twbox">
    <div class="title">Send list</div>

    <div class="tm-actions" style="margin-bottom:6px">
      <button class="btn btnSophie" id="tmwh_sendAll" type="button">Send all</button>
      <button class="btn btnSophie" id="tmwh_sendAllPP" type="button">Send all (PP only)</button>
      <button class="btn btnSophie" id="tmwh_stopSendAll" type="button">Stop</button>
    </div>

    <table class="vis" id="tmwh_table">
      <thead>
        <tr>
          <th>Source</th><th>Target</th><th>Dist</th><th>Wood</th><th>Stone</th><th>Iron</th><th>Action</th>
        </tr>
      </thead>
      <tbody id="tmwh_rows"></tbody>
    </table>
  </div>
</div>`;

      Dialog.show("content", html);

      // Stop keyboard events from bubbling out of the Dialog into TW's hotkey handler.
      // TW listens for keydown on document and intercepts letter/number keys as shortcuts.
      // .popup_box is the container TW's Dialog renders into.
      const blockKey = (e) => e.stopPropagation();
      document.querySelectorAll(".popup_box").forEach((box) => {
        box.removeEventListener("keydown",  blockKey);
        box.removeEventListener("keyup",    blockKey);
        box.removeEventListener("keypress", blockKey);
        box.addEventListener("keydown",  blockKey);
        box.addEventListener("keyup",    blockKey);
        box.addEventListener("keypress", blockKey);
      });

      // Bind all Premium tooltips using .tmHelp anchors
      (function bindPremiumTooltips() {
        const tips = {
          tipStrategy: `
            <div style="font-weight:bold; margin-bottom:6px">Staging strategy</div>
            <div class="twmuted">
              <b>Weighted donors</b>: splits the required amount across multiple donor villages,
              prioritizing closer donors. More reliable when merchants are spread out.<br/><br/>
              <b>Largest donor</b>: tries to use the biggest single donor first.
              Fewer shipments, but can fail if that donor has low merchants or is far away.
            </div>
          `,
          pp_threshold: `
            <div style="font-weight:bold; margin-bottom:6px">Threshold</div>
            <div class="twmuted">
              Minimum global imbalance (most abundant resource minus least abundant resource)
              required before the script will attempt to create a PP (Merchant Exchange) plan.
            </div>
          `,
          pp_min_trade: `
            <div style="font-weight:bold; margin-bottom:6px">Min trade amount</div>
            <div class="twmuted">
              Minimum amount (in the <b>paying</b> resource) that must be staged via shipments
              before a PP plan is accepted. If the plan cannot reach this, no PP route is suggested.
            </div>
          `,
          pp_move_amount: `
            <div style="font-weight:bold; margin-bottom:6px">Move amount</div>
            <div class="twmuted">
              Upper cap for how much the planner will try to move for a single PP route.
              The actual amount may be lower due to merchants, donor excess, target capacity, or distance limits.
            </div>
          `,
          pp_max_distance: `
            <div style="font-weight:bold; margin-bottom:6px">Max distance (ETA)</div>
            <div class="twmuted">
              Maximum distance (in fields) allowed between a donor village and the target village
              for PP shipments. Lower values reduce travel time but may prevent plans if donors are far away.
            </div>
          `,
          pp_max_fill: `
            <div style="font-weight:bold; margin-bottom:6px">Max target fill (%)</div>
            <div class="twmuted">
              Prevents overfilling the target village with the paying resource.
              Example: 0.90 means the target will not be planned above ~90% of warehouse capacity for that resource.
            </div>
          `,
          pp_max_plans: `
            <div style="font-weight:bold; margin-bottom:6px">Max plans (safety)</div>
            <div class="twmuted">
              Hard limit of how many PP routes the script can generate in one run.
              Helps avoid accidental large PP spending and excessive shipments.
            </div>
          `,
          pp_donor_keep_pct: `
            <div style="font-weight:bold; margin-bottom:6px">Donor keep (%)</div>
            <div class="twmuted">
              Donor villages will keep at least this percentage of their warehouse capacity
              (in the paying resource). Only amounts above that are considered excess and can be sent.
            </div>
          `,
          pp_donor_keep_min: `
            <div style="font-weight:bold; margin-bottom:6px">Donor keep min</div>
            <div class="twmuted">
              Minimum amount a donor village will always keep (in the paying resource),
              regardless of the percentage keep rule.
            </div>
          `,
          pp_donor_min_excess: `
            <div style="font-weight:bold; margin-bottom:6px">Donor min excess</div>
            <div class="twmuted">
              Minimum excess required for a village to be considered a donor at all.
              Villages with less excess than this are ignored to reduce tiny shipments.
            </div>
          `,
          hq_maxed: `
            <div style="font-weight:bold; margin-bottom:6px">Maxed out village (points)</div>
            <div class="twmuted">
              Villages at or above this points threshold are considered fully built and are
              skipped during the HQ build queue check. Default is <b>10.471</b> — the maximum
              points a village can reach in Tribal Wars PT.
              Set lower if you want to exclude villages you consider finished.
            </div>
          `,
          hq_priority: `
            <div style="font-weight:bold; margin-bottom:6px">Prioritise empty build queues</div>
            <div class="twmuted">
              When enabled, the balancer fetches each village's HQ build queue before routing.<br/><br/>
              Villages with an <b>empty queue</b> (ready to build) and a configured <b>next building</b> are treated as priority receivers:
              <ul style="margin:6px 0 0 16px; padding:0">
                <li>Their <b>shortage</b> is boosted to the exact building cost shortfall.</li>
                <li>Their <b>excess</b> is zeroed for any resource needed by the building — they will not donate those resources.</li>
              </ul>
              <br/>This ensures that villages that can build right now receive resources first and keep what they need.
              Adds one HTTP request per village to the run.
            </div>
          `,
          LP_QueueHrs: `
            <div style="font-weight:bold; margin-bottom:6px">Low-points long queue threshold (hours):</div>
            <div class="twmuted">
              Amount of hours a low point village needs to have in queue before becoming a resource donor<br/><br/>
            </div>
          `,
          cluster_logic:`
          <div style="font-weight:bold; margin-bottom:6px">Clusters:</div>
          <div class="twmuted">
            Divide villages into clusters and balance within each cluster instead of globally. 
            Useful in very large/spread-out accounts.<br/><br/>
          </div>
          `
        };

        ensureTipPortal();
        const $root = $(".tmWH");
        $root.find(".tmHelp").off("mouseover mouseout click");
        $root.find(".tmHelp").on("mouseover", function (e) {
          e.preventDefault();
          const key = $(this).attr("data-tip");
          showTipAt(this, tips[key] || `<div class="twmuted">No help available.</div>`);
        });
        $root.find(".tmHelp").on("mouseout", function () { hideTip(); });
        $root.find(".tmHelp").on("click", function (e) { e.preventDefault(); });
      })();

      // HQ Build Queue Check
      function updateHqBtnLabel() {
        const hasCached = state.hqData && state.hqData.size > 0;
        $("#tmwh_hq_run").text(hasCached ? "Show HQ" : "Check HQ");
      }
      updateHqBtnLabel();

      $("#tmwh_hq_run").on("click", async function () {
        const $btn = $(this);
        const hasCached = state.hqData && state.hqData.size > 0;
        $btn.prop("disabled", true).text(hasCached ? "Loading…" : "Checking…");
        try {
          await runHqCheck();
        } finally {
          $btn.prop("disabled", false);
          updateHqBtnLabel();
        }
      });

      renderPpLockStatus();
      renderManualCoordLockList();

      $("#tmwh_toggleManualLocks").on("click", () => {
        $("#tmwh_toggleManualLocks").toggleClass("open");
        $("#tmwh_manualLocksBody").toggleClass("open");
      });

      $("#tmwh_saveCoordLock").on("click", () => {
        try {
          const coordsKey = normalizeCoordsKey($("#tmwh_lockCoords").val());
          if (!coordsKey) return UI.ErrorMessage("Enter coords like 451|601.");

          setManualCoordLock(coordsKey, {
            wood: $("#tmwh_lockWood").is(":checked"),
            stone: $("#tmwh_lockStone").is(":checked"),
            iron: $("#tmwh_lockIron").is(":checked")
          });

          setManualCoordComment(coordsKey, $("#tmwh_lockComment").val());

          UI.SuccessMessage(`Manual lock saved for ${coordsKey}.`);
          renderManualCoordLockList();
        } catch (e) {
          UI.ErrorMessage(e.message || String(e));
        }
      });

      $("#tmwh_clearCoordLock").on("click", () => {
        try {
          const coordsKey = normalizeCoordsKey($("#tmwh_lockCoords").val());
          if (!coordsKey) return UI.ErrorMessage("Enter coords like 451|601.");

          clearManualCoordLock(coordsKey);

          UI.SuccessMessage(`Manual lock cleared for ${coordsKey}.`);
          renderManualCoordLockList();
        } catch (e) {
          UI.ErrorMessage(e.message || String(e));
        }
      });

      $("#tmwh_close").on("click", () => {
        stopSendAll();
        stopAllPlanTimers();
        hideTip();
        Dialog.close();
      });

      $("#tmwh_toggleSettings").on("click", () => {
        $("#tmwh_toggleSettings").toggleClass("open");
        $("#tmwh_settingsBody").toggleClass("open");
        const ns = loadSettings();
        ns.settingsOpen = $("#tmwh_settingsBody").hasClass("open");
        saveSettings(ns);
        state.settings.settingsOpen = ns.settingsOpen;
      });

      $("#tmwh_togglePremium").on("click", () => {
        $("#tmwh_togglePremium").toggleClass("open");
        $("#tmwh_premiumBody").toggleClass("open");
        const ns = loadSettings();
        ns.premiumOptionsOpen = $("#tmwh_premiumBody").hasClass("open");
        saveSettings(ns);
        state.settings.premiumOptionsOpen = ns.premiumOptionsOpen;
      });

      $("#tmwh_toggleSendAll").on("click", () => {
        $("#tmwh_toggleSendAll").toggleClass("open");
        $("#tmwh_sendAllBody").toggleClass("open");
      });

      $("#tmwh_sendAll").on("click", () => startSendAll({ onlyPp: false }));
      $("#tmwh_sendAllPP").on("click", () => startSendAll({ onlyPp: true }));
      $("#tmwh_stopSendAll").on("click", () => stopSendAll());

      $("#tmwh_save").on("click", () => {
        const ns = readSettingsFromUI();
        state.settings = ns;
        saveSettings(ns);
        UI.SuccessMessage("Settings saved.");
      });

      $("#tmwh_run").on("click", async function () {
        const $btn = $(this);
        if ($btn.prop("disabled")) return;
        $btn.prop("disabled", true).text("Fetching...");
        try {
          const ns = readSettingsFromUI();
          state.settings = ns;
          saveSettings(ns);
          await runComputationAndRender();
        } catch (e) {
          // eslint-disable-next-line no-console
          console.error(e);
          alert("Run failed: " + (e.message || e));
        } finally {
          $btn.prop("disabled", false).text("Run");
        }
      });

      // Export settings to clipboard as JSON
      $("#tmwh_export_settings").on("click", () => {
        try {
          navigator.clipboard.writeText(JSON.stringify(state.settings, null, 2));
          UI.SuccessMessage("Settings exported to clipboard.");
        } catch (e) {
          UI.ErrorMessage("Clipboard write failed: " + (e.message || e));
        }
      });

      // Import settings from clipboard JSON
      $("#tmwh_import_settings").on("click", async () => {
        try {
          const text = await navigator.clipboard.readText();
          const imported = JSON.parse(text);
          state.settings = { ...state.settings, ...imported };
          saveSettings(state.settings);
          UI.SuccessMessage("Settings imported. Press Run to apply.");
        } catch (e) {
          UI.ErrorMessage("Import failed — copy valid JSON settings to clipboard first.");
        }
      });

    }

    function readSettingsFromUI() {
      const s = loadSettings();

      s.isMinting = $("#tmwh_isMinting").is(":checked");
      s.lowPoints = parseInt($("#tmwh_lowPoints").val(), 10);
      s.highPoints = parseInt($("#tmwh_highPoints").val(), 10);
      s.highFarm = parseInt($("#tmwh_highFarm").val(), 10);
      s.builtOutPercentage = parseFloat($("#tmwh_builtOutPercentage").val());
      s.needsMorePercentage = parseFloat($("#tmwh_needsMorePercentage").val());
      s.lowPointsLongQueueHours = parseFloat($("#tmwh_lowPointsLongQueueHours").val());
      

      s.premiumInstantEnabled = $("#tmwh_premiumEnabled").is(":checked");
      s.premiumThreshold = parseInt($("#tmwh_premiumThreshold").val(), 10);
      s.premiumMoveAmount = parseInt($("#tmwh_premiumMoveAmount").val(), 10);
      s.premiumMinTradeAmount = parseInt($("#tmwh_premiumMinTradeAmount").val(), 10);
      s.premiumStagingStrategy = String($("#tmwh_premiumStagingStrategy").val() || "weighted");
      if (s.premiumStagingStrategy !== "largest" && s.premiumStagingStrategy !== "weighted") s.premiumStagingStrategy = "weighted";

      s.premiumMaxDistance = parseInt($("#tmwh_premiumMaxDistance").val(), 10);
      s.premiumMaxTargetFillPct = parseFloat($("#tmwh_premiumMaxTargetFillPct").val());
      s.premiumMaxPlansHardCap = parseInt($("#tmwh_premiumMaxPlansHardCap").val(), 10);

      s.premiumDonorKeepPct = parseFloat($("#tmwh_premiumDonorKeepPct").val());
      s.premiumDonorKeepMin = parseInt($("#tmwh_premiumDonorKeepMin").val(), 10);
      s.premiumDonorMinExcess = parseInt($("#tmwh_premiumDonorMinExcess").val(), 10);

      s.sendAllEnabled = $("#tmwh_sendAllEnabled").is(":checked");
      s.sendAllIntervalMs = parseInt($("#tmwh_sendAllIntervalMs").val(), 10);

      s.reservePerVillage    = parseInt($("#tmwh_reservePerVillage").val(), 10);
      s.maxDistance          = parseInt($("#tmwh_maxDistance").val(),       10);
      s.hqPriorityEnabled    = $("#tmwh_hqPriorityEnabled").is(":checked");
      s.maxedOutPoints       = parseInt($("#tmwh_maxedOutPoints").val(), 10);

      //Cluster Support
      s.useClusters = $("#tmwh_useClusters").is(":checked");
      s.numClusters = parseInt($("#tmwh_numClusters").val(), 20);

      if (isNaN(s.lowPoints)) s.lowPoints = 1;
      if (isNaN(s.highPoints)) s.highPoints = 12000;
      if (isNaN(s.highFarm)) s.highFarm = 99999;
      if (isNaN(s.builtOutPercentage)) s.builtOutPercentage = 0.25;
      if (isNaN(s.needsMorePercentage)) s.needsMorePercentage = 0.85;
      if (isNaN(s.maxedOutPoints) || s.maxedOutPoints <= 0) s.maxedOutPoints = 10471;
      if (isNaN(s.lowPointsLongQueueHours)) s.lowPointsLongQueueHours = 3;

      if (isNaN(s.numClusters)) s.numClusters = 1;

      if (isNaN(s.premiumThreshold)) s.premiumThreshold = 50000;
      if (isNaN(s.premiumMoveAmount)) s.premiumMoveAmount = 300000;
      if (isNaN(s.premiumMinTradeAmount)) s.premiumMinTradeAmount = 70000;

      if (isNaN(s.premiumMaxDistance)) s.premiumMaxDistance = 18;
      if (isNaN(s.premiumMaxTargetFillPct)) s.premiumMaxTargetFillPct = 0.90;
      if (isNaN(s.premiumMaxPlansHardCap)) s.premiumMaxPlansHardCap = 12;

      if (isNaN(s.premiumDonorKeepPct)) s.premiumDonorKeepPct = 0.10;
      if (isNaN(s.premiumDonorKeepMin)) s.premiumDonorKeepMin = 20000;
      if (isNaN(s.premiumDonorMinExcess)) s.premiumDonorMinExcess = 5000;

      if (isNaN(s.sendAllIntervalMs)) s.sendAllIntervalMs = 500;

      s.builtOutPercentage = Math.max(0.01, Math.min(0.95, s.builtOutPercentage));
      s.needsMorePercentage = Math.max(0.1, Math.min(0.95, s.needsMorePercentage));
      s.lowPointsLongQueueHours = Math.max(0, Math.min(24, s.lowPointsLongQueueHours));

      s.premiumThreshold = Math.max(0, s.premiumThreshold);
      s.premiumMoveAmount = Math.max(0, s.premiumMoveAmount);
      s.premiumMinTradeAmount = Math.max(0, s.premiumMinTradeAmount);

      s.premiumMaxDistance = Math.max(1, s.premiumMaxDistance);
      s.premiumMaxTargetFillPct = Math.max(0.1, Math.min(0.98, s.premiumMaxTargetFillPct));
      s.premiumMaxPlansHardCap = Math.max(1, Math.min(50, s.premiumMaxPlansHardCap));

      s.premiumDonorKeepPct = Math.max(0, Math.min(0.95, s.premiumDonorKeepPct));
      s.premiumDonorKeepMin = Math.max(0, s.premiumDonorKeepMin);
      s.premiumDonorMinExcess = Math.max(0, s.premiumDonorMinExcess);

      s.sendAllIntervalMs = Math.max(100, s.sendAllIntervalMs);

      if (isNaN(s.reservePerVillage)) s.reservePerVillage = 0;
      if (isNaN(s.maxDistance))       s.maxDistance = 9999;

      // hqPriorityEnabled is boolean, no sanitisation needed
      s.reservePerVillage = Math.max(0, s.reservePerVillage);
      s.maxDistance       = Math.max(1, s.maxDistance);

      s.settingsOpen = $("#tmwh_settingsBody").hasClass("open");
      s.premiumOptionsOpen = $("#tmwh_premiumBody").hasClass("open");

      return s;
    }

    function renderSummary(averages) {
      const links     = state.cleanLinks || [];
      const merchants = links.reduce((s, l) => s + Math.ceil((l.wood + l.stone + l.iron) / 1000), 0);
      const avgDist   = links.length
        ? (links.reduce((s, l) => s + (l.distance || 0), 0) / links.length).toFixed(1)
        : "—";

      $("#tmwh_summary").html(`
        Totals: ${resIconHtml("wood")} <b>${numberWithCommasDots(averages.totalWood)}</b> |
        ${resIconHtml("stone")} <b>${numberWithCommasDots(averages.totalStone)}</b> |
        ${resIconHtml("iron")}  <b>${numberWithCommasDots(averages.totalIron)}</b><br/>
        Averages: ${resIconHtml("wood")} <b>${numberWithCommasDots(averages.woodAverage)}</b> |
        ${resIconHtml("stone")} <b>${numberWithCommasDots(averages.stoneAverage)}</b> |
        ${resIconHtml("iron")}  <b>${numberWithCommasDots(averages.ironAverage)}</b><br/>
        Corrected: ${resIconHtml("wood")} <b>${numberWithCommasDots(averages.actualWoodAverage)}</b> |
        ${resIconHtml("stone")} <b>${numberWithCommasDots(averages.actualStoneAverage)}</b> |
        ${resIconHtml("iron")}  <b>${numberWithCommasDots(averages.actualIronAverage)}</b><br/>
        Rows: <b>${links.length}</b> &nbsp;|&nbsp;
        Merchants needed ≈ <b>${merchants}</b> &nbsp;|&nbsp;
        Avg distance: <b>${avgDist}</b> fields
      `);
    }

    function villageTooltipHtml(v) {
      if (!v) return "";
      const coords = coordsFromVillageName(v.name);
      const coordStr = coords ? ` (${coords.x}|${coords.y})` : "";
      return `
        <div style="min-width:200px">
          <div style="font-weight:bold;margin-bottom:4px">${v.name}${coordStr}</div>
          <table style="width:100%;border-collapse:collapse;font-size:11px">
            <tr>
              <td>${resIconHtml("wood")}</td><td style="text-align:right">${numberWithCommasDots(v.wood)}</td>
              <td style="padding-left:8px">${resIconHtml("stone")}</td><td style="text-align:right">${numberWithCommasDots(v.stone)}</td>
              <td style="padding-left:8px">${resIconHtml("iron")}</td><td style="text-align:right">${numberWithCommasDots(v.iron)}</td>
            </tr>
          </table>
          <div style="margin-top:4px;font-size:11px;color:#3b2a12">
            WH: <b>${numberWithCommasDots(v.warehouseCapacity)}</b> &nbsp;|&nbsp;
            Merch: <b>${v.availableMerchants}/${v.totalMerchants}</b> &nbsp;|&nbsp;
            Points: <b>${numberWithCommasDots(v.points)}</b>
          </div>
          ${v.farmSpaceUsed != null ? `<div style="font-size:11px;color:#3b2a12">Farm: <b>${v.farmSpaceUsed}/${v.farmSpaceTotal}</b></div>` : ""}
        </div>`;
    }

    function renderRows(cleanLinks) {
      const byId = new Map(state.villagesData.map(v => [String(v.id), v]));
      const $rows = $("#tmwh_rows");
      $rows.empty();
      ensureTipPortal();

      cleanLinks.forEach((l, idx) => {
        const src = byId.get(String(l.source));
        const tgt = byId.get(String(l.target));
        const cls = idx % 2 === 0 ? "tmRowA" : "tmRowB";
        // Check if target is an HQ-priority village (empty queue, needs resources for building)
        const hqTarget = state.hqData?.get(String(l.target));
        const isHqBoost = hqTarget && hqTarget.queueEndsSec === 0 && hqTarget.buildingName
                          && (hqTarget.costWood + hqTarget.costStone + hqTarget.costIron > 0);
        const rowCls = isHqBoost ? "tmHqBoostRow" : cls;
        const hqBadge = isHqBoost
          ? `<span class="tmBadgeHQ" title="Building: ${hqTarget.buildingName}">HQ</span>`
          : "";

        $rows.append(`
          <tr class="${rowCls}">
            <td><a class="tmLink tmVilTip" data-vid="${l.source}" href="${src?.url || "#"}">${src?.name || l.source}</a></td>
            <td>${hqBadge}<a class="tmLink tmVilTip" data-vid="${l.target}" href="${tgt?.url || "#"}">${tgt?.name || l.target}</a></td>
            <td style="text-align:center">${l.distance ?? ""}</td>
            <td style="text-align:right">${l.wood || 0}</td>
            <td style="text-align:right">${l.stone || 0}</td>
            <td style="text-align:right">${l.iron || 0}</td>
            <td style="text-align:center"><button class="btn btnSophie tmSendNormal" data-idx="${idx}" type="button">Send</button></td>
          </tr>
        `);
      });

      // Village detail tooltip on hover
      $rows.off("mouseover.tip mouseout.tip")
        .on("mouseover.tip", ".tmVilTip", function (e) {
          const vid = $(this).attr("data-vid");
          const v = byId.get(String(vid));
          if (v) showTipAt(this, villageTooltipHtml(v));
        })
        .on("mouseout.tip", ".tmVilTip", function () {
          hideTip();
        });

      $("#tmwh_rows .tmSendNormal").on("click", function () {
        const idx = parseInt($(this).attr("data-idx"), 10);
        const l = cleanLinks[idx];
        sendResource(l.source, l.target, l.wood || 0, l.stone || 0, l.iron || 0);
        $(this).closest("tr").remove();
      });
    }

    function appendSuggestedShipmentsToTable(plan) {
      if (!plan) return;

      const byId = new Map(state.villagesData.map(v => [String(v.id), v]));
      const $rows = $("#tmwh_rows");

      const moved = sumShipments(plan);
      const movedAmount =
        plan.payRes === "wood" ? moved.wood :
        plan.payRes === "stone" ? moved.stone :
        moved.iron;
      const totalAll = (moved.wood || 0) + (moved.stone || 0) + (moved.iron || 0);

      // Instant plans: no shipments — show a single green status row and return
      if (plan.instant || plan.shipments.length === 0) {
        $rows.prepend(`
          <tr class="tmPpNowHeader">
            <td colspan="7">
              <span class="tmBadgePPNow">⚡ PP NOW</span>
              <b>${plan.targetVillageName}</b> already has
              <b>${numberWithCommasDots(plan.tradeAmount || 0)}</b> ${resourceLabel(plan.payRes)} —
              instant trade for ${resourceLabel(plan.neededRes)} executing automatically (10pp).
            </td>
          </tr>
        `);
        return;
      }

      $rows.prepend(`
        <tr class="tmPpHeader">
          <td colspan="7">
            <span class="tmBadgePP">PP</span>
            Plan: move <b>${numberWithCommasDots(movedAmount || 0)}</b> ${resourceLabel(plan.payRes)}
            → <b>${plan.targetVillageName}</b>, then instant trade for ${resourceLabel(plan.neededRes)} (10pp).
            <span class="twmuted" style="margin-left:10px">
              Totals:
              ${resIconHtml("wood")} <b>${numberWithCommasDots(moved.wood || 0)}</b>
              ${resIconHtml("stone")} <b>${numberWithCommasDots(moved.stone || 0)}</b>
              ${resIconHtml("iron")} <b>${numberWithCommasDots(moved.iron || 0)}</b>
              | All: <b>${numberWithCommasDots(totalAll || 0)}</b>
            </span>
          </td>
        </tr>
      `);

      plan.shipments.forEach((s) => {
        const src = byId.get(String(s.source));
        const tgt = byId.get(String(s.target));
        $rows.prepend(`
          <tr class="tmPpRow">
            <td><a class="tmLink tmVilTip" data-vid="${s.source}" href="${src?.url || "#"}">${src?.name || s.source}</a></td>
            <td><a class="tmLink tmVilTip" data-vid="${s.target}" href="${tgt?.url || "#"}">${tgt?.name || s.target}</a></td>
            <td style="text-align:center">${s.distance}</td>
            <td style="text-align:right">${s.wood || 0}</td>
            <td style="text-align:right">${s.stone || 0}</td>
            <td style="text-align:right">${s.iron || 0}</td>
            <td style="text-align:center">
              <button
                class="btn btnSophie tmSendSug"
                data-src="${s.source}"
                data-tgt="${s.target}"
                data-wood="${s.wood || 0}"
                data-stone="${s.stone || 0}"
                data-iron="${s.iron || 0}"
                type="button"
              >Send</button>
            </td>
          </tr>
        `);
      });

      // Bind within container (safe even if called multiple times)
      $rows.find(".tmSendSug").off("click").on("click", function () {
        const $b = $(this);
        sendResource(
          $b.attr("data-src"),
          $b.attr("data-tgt"),
          parseInt($b.attr("data-wood"), 10) || 0,
          parseInt($b.attr("data-stone"), 10) || 0,
          parseInt($b.attr("data-iron"), 10) || 0
        );
        $b.closest("tr").remove();
      });

      // Village detail tooltip on PP plan rows
      $rows.off("mouseover.pptip mouseout.pptip")
        .on("mouseover.pptip", ".tmVilTip", function () {
          const vid = $(this).attr("data-vid");
          const v = byId.get(String(vid));
          if (v) showTipAt(this, villageTooltipHtml(v));
        })
        .on("mouseout.pptip", ".tmVilTip", function () {
          hideTip();
        });
    }

    // ---------------- HQ BUILD QUEUE CHECK ----------------

    // Fetch screen=main for a single village and parse:
    //   - The NEXT building in queue (name + wood/stone/iron cost)
    //   - Remaining seconds until queue finishes
    //   - Production per hour for each resource (from the prod row on the same page)
    // Fetch screen=main&mode=build for a village.
    //
    // This single page contains everything we need:
    //
    // 1. BUILD QUEUE — rows with class like "buildorder_storage":
    //      <tr class="lit nodrag buildorder_storage">
    //        <td>...<span data-endtime="UNIX_TIMESTAMP">HH:MM:SS</span>...</td>
    //      </tr>
    //    We take the MAX data-endtime across all queue rows = when the last item finishes.
    //
    // 2. NEXT BUILDING NAME — from screen=main&mode=accountmanager:
    //      <div class="vis">
    //        <h4>Próxima ordem de construção</h4>
    //        <p class="vis_item">
    //          <a class="inline-icon building-watchtower" href="...&screen=watchtower">
    //            Torre de vigia
    //          </a>
    //        </p>
    //      </div>
    //    We extract: building name (anchor text) + building id from href screen param.
    //
    // 3. BUILDING COST — same screen=main&mode=build page, row tr#main_buildrow_{id}:
    //      <td class="cost_wood warn" data-cost="108089">...</td>
    //      <td class="cost_stone warn" data-cost="126104">...</td>
    //      <td class="cost_iron"      data-cost="101472">...</td>
    //    We read data-cost directly — exact integer, no text parsing needed.
    async function fetchHqNextBuilding(villageId) {
      // Step 1: get the next building name + id from accountmanager page
      const amUrl  = makeURL({ village: villageId, screen: "main", mode: "accountmanager" });
      const amHtml = await $.get(amUrl);
      const $am    = $(amHtml);

      let buildingName   = null;
      let buildingId     = null; // e.g. "watchtower"

      $am.find("div.vis").each(function () {
        if ($(this).find("h4").text().indexOf("Próxima") === -1) return;
        const $a = $(this).find("p.vis_item a.inline-icon").first();
        if (!$a.length) return;
        buildingName = $a.text().trim();
        const m = ($a.attr("href") || "").match(/[?&]screen=([^&]+)/);
        if (m) buildingId = m[1];
        return false;
      });

      if (!buildingName || !buildingId) {
        // No next building queued for this village
        return { villageId: String(villageId), queueEndsSec: 0,
                 buildingName: null, costWood: 0, costStone: 0, costIron: 0 };
      }

      // Step 2a: fetch screen=main&mode=build for the QUEUE TIMER only.
      //   The build-mode page shows active queue rows (class "buildorder_*"), each
      //   with a span[data-endtime] Unix timestamp. We take the max = queue end time.
      //
      // Step 2b: fetch screen=main (no mode) for BUILDING COSTS.
      //   The main HQ page has tr#main_buildrow_{buildingId} with:
      //     <td class="cost_wood [warn]" data-cost="108089">
      //     <td class="cost_stone [warn]" data-cost="126104">
      //     <td class="cost_iron [warn]"  data-cost="101472">
      //   These rows do NOT appear on mode=build.

      const [buildRes, mainRes] = await Promise.all([
        $.get(makeURL({ village: villageId, screen: "main", mode: "build" })),
        $.get(makeURL({ village: villageId, screen: "main" })),
      ]);
      const $b    = $(buildRes);
      const $main = $(mainRes);

      // ── Queue end time (from mode=build) ──────────────────────────────────────
      let maxEndTime = 0;
      $b.find("tr[class*='buildorder'] td span[data-endtime]").each(function () {
        const t = parseInt($(this).attr("data-endtime"), 10);
        if (!isNaN(t) && t > maxEndTime) maxEndTime = t;
      });
      const queueEndsSec = maxEndTime > 0
        ? Math.max(0, maxEndTime - Math.floor(Date.now() / 1000))
        : 0;

      // ── Building cost (from screen=main, no mode) ─────────────────────────────
      // tr#main_buildrow_{buildingId} — data-cost attribute has the exact integer.
      const $row    = $main.find(`#main_buildrow_${buildingId}`);
      const costWood  = parseInt($row.find("td.cost_wood").attr("data-cost")  || "0", 10) || 0;
      const costStone = parseInt($row.find("td.cost_stone").attr("data-cost") || "0", 10) || 0;
      const costIron  = parseInt($row.find("td.cost_iron").attr("data-cost")  || "0", 10) || 0;

      // Extract production rates per hour from the main page.
      // TW PT exposes these in #wood_prod, #stone_prod, #iron_prod spans.
      // Falls back to 0 (conservative) if the elements are not found.
      const tryProdRate = ($ctx, res) => {
        const candidates = [
          $ctx.find(`#${res}_prod`),
          $ctx.find(`.${res}_prod`),
          $ctx.find(`[id*="${res}_prod"]`).first(),
        ];
        for (const $el of candidates) {
          if ($el.length) {
            const val = parseIntSafe(String($el.text()).replace(/[^\d]/g, ""));
            if (val > 0) return val;
          }
        }
        return 0;
      };
      const prodWoodPerHr  = tryProdRate($main, "wood");
      const prodStonePerHr = tryProdRate($main, "stone");
      const prodIronPerHr  = tryProdRate($main, "iron");

      return {
        villageId: String(villageId),
        queueEndsSec,
        buildingName,
        buildingId,
        costWood, costStone, costIron,
        prodWoodPerHr, prodStonePerHr, prodIronPerHr,
      };
    }

    // Given village data + HQ result, compute whether the village will have
    // enough resources when the queue finishes to start the next building.
    // Production rates come from villageData (already fetched from the prod overview)
    // since the accountmanager page does not expose per-hour production rates.
    function computeHqReadiness(villageData, hqResult) {
      const {
        queueEndsSec, costWood, costStone, costIron, buildingName,
        prodWoodPerHr = 0, prodStonePerHr = 0, prodIronPerHr = 0,
      } = hqResult;

      if (!buildingName || (costWood + costStone + costIron === 0)) return null;

      const hrs = queueEndsSec / 3600;
      const wh  = villageData.warehouseCapacity;

      // Use production rates fetched from screen=main when available.
      // Falls back to 0 (conservative) when rates could not be parsed.
      const prodWood  = prodWoodPerHr  || 0;
      const prodStone = prodStonePerHr || 0;
      const prodIron  = prodIronPerHr  || 0;

      const projWood  = Math.min(wh, villageData.wood  + prodWood  * hrs);
      const projStone = Math.min(wh, villageData.stone + prodStone * hrs);
      const projIron  = Math.min(wh, villageData.iron  + prodIron  * hrs);

      const shortWood  = Math.max(0, costWood  - projWood);
      const shortStone = Math.max(0, costStone - projStone);
      const shortIron  = Math.max(0, costIron  - projIron);
      const hasShortfall = shortWood + shortStone + shortIron > 0;

      return {
        buildingName,
        queueEndsSec,
        costWood, costStone, costIron,
        projWood: Math.floor(projWood),
        projStone: Math.floor(projStone),
        projIron: Math.floor(projIron),
        shortWood: Math.ceil(shortWood / 1000) * 1000,
        shortStone: Math.ceil(shortStone / 1000) * 1000,
        shortIron: Math.ceil(shortIron / 1000) * 1000,
        hasShortfall,
      };
    }

    async function runHqCheck() {
      const $panel = $("#tmwh_hq_panel");
      if (!$panel.length) return;

      const villagesData = state.villagesData;
      if (!villagesData || !villagesData.length) {
        $panel.html(`<div class="twmuted">Run the balancer first to load village data.</div>`);
        return;
      }

      // If Run already fetched HQ data (hqPriorityEnabled), reuse it — no extra requests.
      // Only fetch fresh if the user explicitly wants it (hqData is null).
      const cachedHqData = state.hqData;
      const results = [];

      if (cachedHqData && cachedHqData.size > 0) {
        // Use cached data from the last Run — instant, no HTTP requests
        const ageMin = state.hqLastFetchMs ? Math.floor((Date.now() - state.hqLastFetchMs) / 60000) : null;
        const ageStr = ageMin !== null ? ` — data from ${ageMin} min ago` : "";
        $panel.html(`<div class="twmuted">Using cached HQ data${ageStr}. <span style="color:#a40000">Press "Check HQ" to refresh.</span></div>`);
        const maxPts = state.settings.maxedOutPoints;
        saveHqData(state.hqData, state.hqLastFetchMs || Date.now());
        for (const v of villagesData) {
          if (v.points >= maxPts) continue;
          if (v.points < (state.settings.lowPoints || 0)) continue;
          const hq = cachedHqData.get(String(v.id));
          if (!hq) continue;
          const check = computeHqReadiness(v, hq);
          if (check) results.push({ v, hq, check });
        }
      } else {
        // No cached data — fetch fresh sequentially
        const maxPts = state.settings.maxedOutPoints || 10471;
        const lowPts = state.settings.lowPoints || 0;
        const toCheck = villagesData.filter(v => v.points >= lowPts && v.points < maxPts);
        const skipped = villagesData.length - toCheck.length;
        for (let i = 0; i < toCheck.length; i++) {
          const v = toCheck[i];
          $panel.html(`<div class="twmuted">Checking HQ queues… (${i + 1}/${toCheck.length}${skipped > 0 ? `, ${skipped} maxed out skipped` : ""})</div>`);
          try {
            const hq = await fetchHqNextBuilding(v.id);
            const check = computeHqReadiness(v, hq);
            if (check) results.push({ v, hq, check });
          } catch (e) {
            // skip villages that fail (e.g. sitter restrictions)
          }
          if (i < toCheck.length - 1) await new Promise(res => setTimeout(res, 300));
        }
        // Cache the freshly-fetched data for subsequent Check HQ calls
        const freshMap = new Map();
        results.forEach(({ v, hq }) => freshMap.set(String(v.id), hq));
        state.hqData = freshMap;
        state.hqLastFetchMs = Date.now();
      }

      if (!results.length) {
        $panel.html(`<div class="twmuted">No upcoming buildings found in any village queue.</div>`);
        return;
      }

      // Sort: shortfalls first, then by queue end time ascending
      results.sort((a, b) => {
        if (a.check.hasShortfall !== b.check.hasShortfall) return a.check.hasShortfall ? -1 : 1;
        return a.hq.queueEndsSec - b.hq.queueEndsSec;
      });

      const rowsHtml = results.map(({ v, check }) => {
        const eta = check.queueEndsSec > 0 ? formatHMS(check.queueEndsSec) : "now";
        const statusHtml = check.hasShortfall
          ? `<span class="tmHqWarn">⚠ Short:
              ${check.shortWood  > 0 ? `${resIconHtml("wood")} <b>${numberWithCommasDots(check.shortWood)}</b> ` : ""}
              ${check.shortStone > 0 ? `${resIconHtml("stone")} <b>${numberWithCommasDots(check.shortStone)}</b> ` : ""}
              ${check.shortIron  > 0 ? `${resIconHtml("iron")} <b>${numberWithCommasDots(check.shortIron)}</b>` : ""}
            </span>`
          : `<span class="tmHqOk">✓ Ready</span>`;

        const costHtml = `
          <span class="tmHqRes">
            Cost: ${resIconHtml("wood")} ${numberWithCommasDots(check.costWood)}
            ${resIconHtml("stone")} ${numberWithCommasDots(check.costStone)}
            ${resIconHtml("iron")} ${numberWithCommasDots(check.costIron)}
          </span>`;

        const projHtml = `
          <span class="tmHqRes twmuted">
            At ETA: ${resIconHtml("wood")} ${numberWithCommasDots(check.projWood)}
            ${resIconHtml("stone")} ${numberWithCommasDots(check.projStone)}
            ${resIconHtml("iron")} ${numberWithCommasDots(check.projIron)}
          </span>`;

        return `
          <div class="tmHqRow">
            <span class="tmHqVillage">
              <a class="tmLink" href="${v.url}">${v.name}</a>
            </span>
            <span class="tmHqBuilding">${check.buildingName}</span>
            <span class="tmHqEta">Queue ends: <b>${eta}</b></span>
            ${statusHtml}
            ${costHtml}
            ${projHtml}
          </div>`;
      }).join("");

      const shortfallCount = results.filter(r => r.check.hasShortfall).length;
      const header = shortfallCount > 0
        ? `<div style="margin-bottom:6px"><b>${shortfallCount}</b> village(s) need resources before queue ends.</div>`
        : `<div style="margin-bottom:6px;color:#1a7a1a"><b>All villages</b> will have enough resources.</div>`;

      $panel.html(`<div class="tmHqBox">${header}${rowsHtml}</div>`);
    }

    async function runComputationAndRender() {
      $("#tmwh_summary").text("Fetching overview pages...");
      $("#tmwh_rows").empty();
      $("#tmwh_timer").empty();
      hideTip();

      stopAllPlanTimers();

      const urls = getOverviewUrls();
      const incomingRes = await fetchIncomingOverview(urls.inc);
      const rawVillagesData = await fetchProdOverview(urls.prod);

      // Apply per-village reserve: subtract a fixed amount before computation so
      // those resources are never considered available for sending.
      const reserve = Math.max(0, state.settings.reservePerVillage || 0);
      const villagesData = reserve > 0
        ? rawVillagesData.map(v => ({
            ...v,
            wood:  Math.max(0, v.wood  - reserve),
            stone: Math.max(0, v.stone - reserve),
            iron:  Math.max(0, v.iron  - reserve),
          }))
        : rawVillagesData;

      // Apply pending sends from this session: subtract from donor stock and
      // credit to receiver incoming so duplicate routes aren't generated on re-run.
      // Sends older than 2 hours are dropped (shipment long since arrived).
      const nowMs = getNowMs;
      const twoHrsMs = 2 * 60 * 60 * 1000;

      const merchantSpeedFPH = ((typeof game_data !== "undefined" && game_data.speed) || 1) * 16;
      state.pendingSends = (state.pendingSends || []).filter(s => {
        const distFields = s.distance || 50;
        const etaMs = Math.max(twoHrsMs, (distFields / merchantSpeedFPH) * 3600 * 1000 * 1.5);
        return nowMs - s.sentAt < etaMs;
      });

      if (state.pendingSends.length) {
        const vById = new Map(villagesData.map(v => [String(v.id), v]));
        for (const s of state.pendingSends) {
          const src = vById.get(s.source);
          const tgt = vById.get(s.target);
          // Subtract from donor's current stock (they no longer have it)
          if (src) {
            src.wood  = Math.max(0, src.wood  - s.wood);
            src.stone = Math.max(0, src.stone - s.stone);
            src.iron  = Math.max(0, src.iron  - s.iron);
          }
          // Credit to receiver's incoming (they will receive it)
          if (tgt) {
            if (!incomingRes[s.target]) incomingRes[s.target] = { wood: 0, stone: 0, iron: 0 };
            incomingRes[s.target].wood  += s.wood;
            incomingRes[s.target].stone += s.stone;
            incomingRes[s.target].iron  += s.iron;
          }
        }
      }

      const averages = computeTotalsAndAverages(villagesData, incomingRes);

      const { excessResources, shortageResources, villageID } = computeExcessShortage(villagesData, incomingRes, averages);

      applyManualCoordLocks({ villagesData, excessResources, shortageResources });
      applyPpResourceLock({ villagesData, excessResources, shortageResources });

      // ==================== HQ FETCHING DECISION (Fixed Timing) ====================
      // Behavior:
      //   - If "Prioritise empty build queues" is ENABLED → fetch HQ data on THIS Run
      //     (even on first execution of the session)
      //   - If disabled → never auto-fetch
      //   - After first successful fetch → only refresh automatically if data is > 30 min old
      //   - Manual "Check HQ" button always works independently

      const isMintingMode = !!state.settings.isMinting;
      const isFirstHqRun = !state.hqLastFetchMs;
      const isHqStale    = (nowMs - (state.hqLastFetchMs || 0)) > HQ_STALENESS_MS;

      let shouldFetchHq = false;

      if (!isMintingMode && state.settings.hqPriorityEnabled) {
        const isFirstHqRun = !state.hqLastFetchMs;
        const isHqStale    = (nowMs - (state.hqLastFetchMs || 0)) > HQ_STALENESS_MS;
        if (isFirstHqRun || isHqStale || !state.hqData || state.hqData.size === 0) {
          shouldFetchHq = true;
        }
      }

      let hqData = state.hqData || null;

      if (shouldFetchHq) {
        hqData = new Map();
        const maxPts = state.settings.maxedOutPoints || 10471;
        const lowPts = state.settings.lowPoints || 0;
        const hqCandidates = villagesData.filter(v => v.points >= lowPts && v.points < maxPts);
        const hqSkipped    = villagesData.length - hqCandidates.length;

        for (let i = 0; i < hqCandidates.length; i++) {
          const v = hqCandidates[i];
          $("#tmwh_summary").text(`Checking HQ build queues… (${i + 1}/${hqCandidates.length}${hqSkipped > 0 ? `, ${hqSkipped} skipped` : ""})`);
          try {
            const hq = await fetchHqNextBuilding(v.id);
            if (hq?.villageId) hqData.set(hq.villageId, hq);
          } catch (e) {
            console.warn(`HQ fetch failed for village ${v.id}`, e);
          }
          if (i < hqCandidates.length - 1) {
            await new Promise(res => setTimeout(res, 300));
          }
        }

        state.hqData = hqData;
        state.hqLastFetchMs = nowMs;
        saveHqData(hqData, nowMs);
      }

      if ((state.settings.hqPriorityEnabled || isFirstHqRun) && hqData && hqData.size > 0) {
        applyHqBuildPriority({ villagesData, excessResources, shortageResources, incomingRes, hqData });
      }

      const { links } = assignMerchantsAndBuildLinks(villagesData, excessResources, shortageResources, villageID);
      let cleanLinks = removeCircularRoutes(addDistanceToLinks(normalizeAndCombineLinks(links), villagesData));

      // Apply clustering if enabled and not in minting mode
      if (!isMintingMode && state.settings.useClusters) {
        cleanLinks = applyClustering(cleanLinks, villagesData, state.settings.numClusters);
      }

      // Global max distance filter (still applies, low-points exempt)
      const maxDist = Math.max(1, state.settings.maxDistance || 9999);
      const lowPts  = state.settings.lowPoints || 0;
      const vByIdMap = new Map(villagesData.map(v => [String(v.id), v]));

      if (maxDist < 9999) {
        cleanLinks = cleanLinks.filter(l => {
          if ((l.distance || 0) <= maxDist) return true;
          const tgt = vByIdMap.get(String(l.target));
          return tgt && tgt.points < lowPts;
        });
      }

      state.incomingRes = incomingRes;
      state.villagesData = villagesData;
      state.averages = averages;
      state.cleanLinks = cleanLinks;

      renderSummary(averages);
      renderRows(cleanLinks);
      renderManualCoordLockList();

      await resumePersistedPlans();

      if (loadPpPlans().length) {
        renderPpLockStatus();
        return;
      }

      // PP Planning - completely skipped in "Ignored settings" mode
      if (!isMintingMode && loadPpPlans().length === 0) {
        const regularReceiverIds = new Set(state.cleanLinks.map(l => String(l.target)));
        const plans = buildPlansUntilDone(regularReceiverIds);
        for (const plan of plans) {
          addPpLock({ villageId: plan.targetVillageId, res: plan.payRes });
          upsertPpPlan(plan);
          appendSuggestedShipmentsToTable(plan);
          await startPlanCountdown(plan);
        }
      }

      renderPpLockStatus();
    }

    async function run() {
      const savedHq = loadHqData();

      state = {
        settings: loadSettings(),
        planTimers: new Map(),
        incomingRes: {},
        villagesData: [],
        averages: null,
        cleanLinks: [],
        hqData: savedHq.data,           
        hqLastFetchMs: savedHq.timestamp, 
        pendingSends: [],   
        sendAllTimer: null,

        // Cluster support
        useClusters: false,
        numClusters: 1,

      };

      showMainDialog();
      await resumePersistedPlans();
    }

    return {
      run,
      sendResource: sendResource,
      listPpPlans: () => loadPpPlans(),
      listPpLocks: () => loadPpLocks(),
      setManualCoordLock: (coords, lockObj) => setManualCoordLock(coords, lockObj),
      clearManualCoordLock: (coords) => clearManualCoordLock(coords),
      listManualCoordLocks: () => listManualCoordLocks()
    };
  })();
})();
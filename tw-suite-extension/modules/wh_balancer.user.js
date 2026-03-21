// ==UserScript==
// @name         Tribal Wars - Warehouse Balancer v3
// @namespace    https://pt*.tribalwars.com.pt/
// @version      3.4.1
// @description  The Real Balancer
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

    // ---------------- PP ROUTES + TIMER PERSISTENCE ----------------
    const PP_LOCKS_KEY = "tm_whbalancer_pp_locks_v2";
    const PP_PLANS_KEY = "tm_whbalancer_pp_plans_v2";

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

        s.builtOutPercentage = Math.max(0.1, Math.min(0.95, parseFloat(s.builtOutPercentage)));
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
    }

    async function doInstantTrade(villageId, giveRes, wantRes, wantAmount) {
      wantAmount = Math.floor((wantAmount || 0) / 1000) * 1000;
      if (wantAmount <= 0) throw new Error("Instant trade aborted: amount must be > 0");
      if (giveRes === wantRes) throw new Error("Instant trade aborted: giveRes and wantRes are the same");

      const pageUrl = makeURL({ village: villageId, screen: "market", mode: "other_offer" });
      const postUrl = makeURL({ village: villageId, screen: "market", mode: "other_offer", action: "merchantexchange" });

      const page = await $.get(pageUrl);
      const $page = $(page);

      const h = $page.find("form#offer_filter input[name='h']").val();
      if (!h) throw new Error("Instant trade failed: CSRF token (h) not found");

      const payload = { res_buy: giveRes, res_sell: wantRes, sell: String(wantAmount), h };

      const respHtml = await $.post(postUrl, payload);
      const $r = $(respHtml);

      const err = $r.find(".error_box, .error, .error_message").first().text().trim();
      if (err) throw new Error(err);

      return true;
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
    function computeTotalsAndAverages(villagesData, incomingRes) {
      let totalWood = 0, totalStone = 0, totalIron = 0;
      for (const v of villagesData) { totalWood += v.wood; totalStone += v.stone; totalIron += v.iron; }
      for (const vid of Object.keys(incomingRes)) {
        totalWood += incomingRes[vid].wood || 0;
        totalStone += incomingRes[vid].stone || 0;
        totalIron += incomingRes[vid].iron || 0;
      }

      const count = villagesData.length || 1;
      const woodAverage = Math.floor(totalWood / count);
      const stoneAverage = Math.floor(totalStone / count);
      const ironAverage = Math.floor(totalIron / count);

      let actualWoodAverage = woodAverage;
      let actualStoneAverage = stoneAverage;
      let actualIronAverage = ironAverage;

      if (!state.settings.isMinting) {
        let actualTotalWood = totalWood;
        let actualTotalStone = totalStone;
        let actualTotalIron = totalIron;
        let cW = count, cS = count, cI = count;

        for (let i = 0; i < villagesData.length; i++) {
          actualWoodAverage = Math.floor(actualTotalWood / cW);
          actualStoneAverage = Math.floor(actualTotalStone / cS);
          actualIronAverage = Math.floor(actualTotalIron / cI);

          const wh = villagesData[i].warehouseCapacity;
          if (wh < actualWoodAverage) { actualTotalWood -= actualWoodAverage - wh * state.settings.needsMorePercentage; cW = Math.max(1, cW - 1); }
          if (wh < actualStoneAverage) { actualTotalStone -= actualStoneAverage - wh * state.settings.needsMorePercentage; cS = Math.max(1, cS - 1); }
          if (wh < actualIronAverage) { actualTotalIron -= actualIronAverage - wh * state.settings.needsMorePercentage; cI = Math.max(1, cI - 1); }
        }
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

      // Optional: if you want Threshold to also act as “minimum plan size”
      const threshold = (s.premiumThreshold || 0);
      if (movedAmount < threshold) reasons.push(`Moved amount ${numberWithCommasDots(movedAmount)} < Threshold ${numberWithCommasDots(threshold)}`);

      return { ok: reasons.length === 0, reasons, movedAmount };
    }

    // ---------------- Ex/Short ----------------
    function computeExcessShortage(villagesData, incomingRes, averages) {
      const excessResources = [];
      const shortageResources = [];
      const villageID = [];

      for (let idx = 0; idx < villagesData.length; idx++) {
        const v = villagesData[idx];
        villageID.push(v.id);
        const inc = incomingRes[v.id] || { wood: 0, stone: 0, iron: 0 };

        let tempWood, tempStone, tempIron;

        if (averages.actualWoodAverage < v.warehouseCapacity * state.settings.needsMorePercentage) tempWood = v.wood + inc.wood - averages.actualWoodAverage;
        else tempWood = -Math.round((v.warehouseCapacity * state.settings.needsMorePercentage) - inc.wood - v.wood);

        if (averages.actualStoneAverage < v.warehouseCapacity * state.settings.needsMorePercentage) tempStone = v.stone + inc.stone - averages.actualStoneAverage;
        else tempStone = -Math.round((v.warehouseCapacity * state.settings.needsMorePercentage) - inc.stone - v.stone);

        if (averages.actualIronAverage < v.warehouseCapacity * state.settings.needsMorePercentage) tempIron = v.iron + inc.iron - averages.actualIronAverage;
        else tempIron = -Math.round((v.warehouseCapacity * state.settings.needsMorePercentage) - inc.iron - v.iron);

        if (v.farmSpaceUsed > state.settings.highFarm || v.points > state.settings.highPoints) {
          const leave = state.settings.builtOutPercentage * v.warehouseCapacity;
          if (v.wood + inc.wood > leave) tempWood = Math.round((v.wood + inc.wood) - leave);
          if (v.stone + inc.stone > leave) tempStone = Math.round((v.stone + inc.stone) - leave);
          if (v.iron + inc.iron > leave) tempIron = Math.round((v.iron + inc.iron) - leave);
        }

        if (v.points < state.settings.lowPoints) {
          tempWood = -Math.round((v.warehouseCapacity * state.settings.needsMorePercentage) - v.wood - inc.wood);
          tempStone = -Math.round((v.warehouseCapacity * state.settings.needsMorePercentage) - v.stone - inc.stone);
          tempIron = -Math.round((v.warehouseCapacity * state.settings.needsMorePercentage) - v.iron - inc.iron);
        }

        if (inc.wood + v.wood > v.warehouseCapacity) tempWood = -(Math.round((v.warehouseCapacity * state.settings.needsMorePercentage) - inc.wood - v.wood));
        if (inc.stone + v.stone > v.warehouseCapacity) tempStone = -(Math.round((v.warehouseCapacity * state.settings.needsMorePercentage) - inc.stone - v.stone));
        if (inc.iron + v.iron > v.warehouseCapacity) tempIron = -(Math.round((v.warehouseCapacity * state.settings.needsMorePercentage) - inc.iron - v.iron));

        if (tempWood > 0 && tempWood > v.wood) tempWood = v.wood;
        if (tempStone > 0 && tempStone > v.stone) tempStone = v.stone;
        if (tempIron > 0 && tempIron > v.iron) tempIron = v.iron;

        excessResources[idx] = [];
        shortageResources[idx] = [];

        if (tempWood > 0) { excessResources[idx].push({ wood: Math.floor(tempWood / 1000) * 1000 }); shortageResources[idx].push({ wood: 0 }); }
        else { shortageResources[idx].push({ wood: Math.floor(-tempWood / 1000) * 1000 }); excessResources[idx].push({ wood: 0 }); }

        if (tempStone > 0) { excessResources[idx].push({ stone: Math.floor(tempStone / 1000) * 1000 }); shortageResources[idx].push({ stone: 0 }); }
        else { shortageResources[idx].push({ stone: Math.floor(-tempStone / 1000) * 1000 }); excessResources[idx].push({ stone: 0 }); }

        if (tempIron > 0) { excessResources[idx].push({ iron: Math.floor(tempIron / 1000) * 1000 }); shortageResources[idx].push({ iron: 0 }); }
        else { shortageResources[idx].push({ iron: Math.floor(-tempIron / 1000) * 1000 }); excessResources[idx].push({ iron: 0 }); }
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

    // ---------------- Links build ----------------
    function assignMerchantsAndBuildLinks(villagesData, excessResources, shortageResources, villageID) {
      const merchantOrders = [];
      const links = [];

      for (let p = 0; p < excessResources.length; p++) {
        const w = Math.floor(excessResources[p][0].wood / 1000) * 1000;
        const s2 = Math.floor(excessResources[p][1].stone / 1000) * 1000;
        const i = Math.floor(excessResources[p][2].iron / 1000) * 1000;
        const combined = parseInt(w, 10) + parseInt(s2, 10) + parseInt(i, 10);

        if (combined > 0) {
          const maxMerchantsNeeded = Math.floor(combined / 1000);
          const c = coordsFromVillageName(villagesData[p].name);
          if (!c) continue;

          if (maxMerchantsNeeded < villagesData[p].availableMerchants) {
            merchantOrders.push({
              villageID: villagesData[p].id,
              x: c.x,
              y: c.y,
              wood: Math.floor(excessResources[p][0].wood / 1000),
              stone: Math.floor(excessResources[p][1].stone / 1000),
              iron: Math.floor(excessResources[p][2].iron / 1000)
            });
          } else {
            const percWood = excessResources[p][0].wood / combined;
            const percStone = excessResources[p][1].stone / combined;
            const percIron = excessResources[p][2].iron / combined;
            merchantOrders.push({
              villageID: villagesData[p].id,
              x: c.x,
              y: c.y,
              wood: Math.floor(percWood * villagesData[p].availableMerchants),
              stone: Math.floor(percStone * villagesData[p].availableMerchants),
              iron: Math.floor(percIron * villagesData[p].availableMerchants)
            });
          }
        }
      }

      function sortMerchantsByDistanceTo(qIndex) {
        const tgt = coordsFromVillageName(villagesData[qIndex].name);
        if (!tgt) return;
        for (let d = 0; d < merchantOrders.length; d++) {
          merchantOrders[d].distance = Math.round(Math.hypot(merchantOrders[d].x - tgt.x, merchantOrders[d].y - tgt.y));
        }
        merchantOrders.sort((a, b) => a.distance - b.distance);
      }

      // Wood pass
      for (let q = shortageResources.length - 1; q >= 0; q--) {
        sortMerchantsByDistanceTo(q);
        while (shortageResources[q][0].wood > 0) {
          let totalWoodToTrade = 0;
          for (let m = 0; m < merchantOrders.length; m++) {
            totalWoodToTrade += merchantOrders[m].wood;
            if (merchantOrders[m].wood > 0) {
              if (shortageResources[q][0].wood <= merchantOrders[m].wood * 1000) {
                links.push({ source: merchantOrders[m].villageID, target: villageID[q], wood: shortageResources[q][0].wood });
                merchantOrders[m].wood -= shortageResources[q][0].wood / 1000;
                shortageResources[q][0].wood = 0;
              } else {
                links.push({ source: merchantOrders[m].villageID, target: villageID[q], wood: merchantOrders[m].wood * 1000 });
                shortageResources[q][0].wood -= merchantOrders[m].wood * 1000;
                merchantOrders[m].wood = 0;
              }
            }
            if (shortageResources[q][0].wood <= 0) break;
            if (m === merchantOrders.length - 1 && shortageResources[q][0].wood > 0) { totalWoodToTrade = 0; break; }
          }
          if (totalWoodToTrade === 0) break;
        }
      }

      // Stone pass
      for (let q = shortageResources.length - 1; q >= 0; q--) {
        sortMerchantsByDistanceTo(q);
        while (shortageResources[q][1].stone > 0) {
          let totalStoneToTrade = 0;
          for (let m = 0; m < merchantOrders.length; m++) {
            totalStoneToTrade += merchantOrders[m].stone;
            if (merchantOrders[m].stone > 0) {
              if (shortageResources[q][1].stone <= merchantOrders[m].stone * 1000) {
                links.push({ source: merchantOrders[m].villageID, target: villageID[q], stone: shortageResources[q][1].stone });
                merchantOrders[m].stone -= shortageResources[q][1].stone / 1000;
                shortageResources[q][1].stone = 0;
              } else {
                links.push({ source: merchantOrders[m].villageID, target: villageID[q], stone: merchantOrders[m].stone * 1000 });
                shortageResources[q][1].stone -= merchantOrders[m].stone * 1000;
                merchantOrders[m].stone = 0;
              }
            }
            if (shortageResources[q][1].stone <= 0) break;
            if (m === merchantOrders.length - 1 && shortageResources[q][1].stone > 0) { totalStoneToTrade = 0; break; }
          }
          if (totalStoneToTrade === 0) break;
        }
      }

      // Iron pass
      for (let q = shortageResources.length - 1; q >= 0; q--) {
        sortMerchantsByDistanceTo(q);
        while (shortageResources[q][2].iron > 0) {
          let totalIronToTrade = 0;
          for (let m = 0; m < merchantOrders.length; m++) {
            totalIronToTrade += merchantOrders[m].iron;
            if (merchantOrders[m].iron > 0) {
              if (shortageResources[q][2].iron <= merchantOrders[m].iron * 1000) {
                links.push({ source: merchantOrders[m].villageID, target: villageID[q], iron: shortageResources[q][2].iron });
                merchantOrders[m].iron -= shortageResources[q][2].iron / 1000;
                shortageResources[q][2].iron = 0;
              } else {
                links.push({ source: merchantOrders[m].villageID, target: villageID[q], iron: merchantOrders[m].iron * 1000 });
                shortageResources[q][2].iron -= merchantOrders[m].iron * 1000;
                merchantOrders[m].iron = 0;
              }
            }
            if (shortageResources[q][2].iron <= 0) break;
            if (m === merchantOrders.length - 1 && shortageResources[q][2].iron > 0) { totalIronToTrade = 0; break; }
          }
          if (totalIronToTrade === 0) break;
        }
      }

      return { links };
    }

    function normalizeAndCombineLinks(links) {
      for (const l of links) {
        if (typeof l.wood === "undefined") l.wood = 0;
        if (typeof l.stone === "undefined") l.stone = 0;
        if (typeof l.iron === "undefined") l.iron = 0;
      }
      for (let i = 0; i < links.length; i++) {
        for (let j = 0; j < links.length; j++) {
          if (i !== j && links[i].source === links[j].source && links[i].target === links[j].target) {
            links[i].wood += parseInt(links[j].wood, 10);
            links[i].stone += parseInt(links[j].stone, 10);
            links[i].iron += parseInt(links[j].iron, 10);
            links[j].wood = 0; links[j].stone = 0; links[j].iron = 0;
          }
        }
      }
      const cleaned = [];
      for (const l of links) if ((l.wood + l.stone + l.iron) > 0) cleaned.push(l);
      return cleaned;
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
      const threshold = (s.premiumThreshold || 0);
        if (shippedTotal < threshold) return null;

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
        createdAt: Date.now(),
        lastArrivalEtaSec: null,
        lastArrivalMsAtFetch: null,
        lastRefreshMs: 0
      };

      plan.id = makePlanId(plan);
      return plan;
    }

    function buildPlansUntilDone() {
      const plans = [];
      const excluded = new Set();
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

      const totalsLine = `
        <div class="line twmuted">
          Shipments total: <b>${numberWithCommasDots(movedAmount || 0)}</b> ${resourceLabel(plan.payRes)}
        </div>
      `;

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
                <th>From</th><th>To</th><th>Dist</th>
                <th>${resIconHtml("wood")}</th><th>${resIconHtml("stone")}</th><th>${resIconHtml("iron")}</th>
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
              plan.lastRefreshMs = nowServer;
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
          renderTimerBoxForPlan(plan, "Arrived. Executing instant trade now...", "00:00:00", "ETA until trade: 00:00:00");
          UI.SuccessMessage("Incoming arrived. Executing instant trade...");

          try {
            await doInstantTrade(plan.targetVillageId, plan.payRes, plan.neededRes, plan.tradeAmount);
            UI.SuccessMessage("Instant trade executed. Re-running balancer...");
            removePpPlan(plan.id);
            await runComputationAndRender();
          } catch (e) {
            // eslint-disable-next-line no-console
            console.error(e);
            alert("Instant trade failed: " + (e.message || e));
          }
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
        <input type="number" step="0.01" min="0" max="1" id="tmwh_builtOutPercentage" value="${s.builtOutPercentage}">

        <label>WH % target for priority villages</label>
        <input type="number" step="0.01" min="0" max="1" id="tmwh_needsMorePercentage" value="${s.needsMorePercentage}">
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

          <label>Max plans  <a href="#" class="tmLink tmHelp" data-tip="pp_max_plans">?</a></label>
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

      // Bind all Premium tooltips (including strategy) using .tmHelp anchors
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
              before a PP plan is accepted. If the plan can’t reach this, no PP route is suggested.
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
              Example: 0.90 means the target won’t be planned above ~90% of warehouse capacity (for that resource).
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
              (in the paying resource). Only amounts above that are considered “excess” and can be sent.
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
          `
        };

        ensureTipPortal();

        // Important: bind within the dialog content only (prevents conflicts)
        const $root = $(".tmWH");
        $root.find(".tmHelp").off("mouseover mouseout click");

        $root.find(".tmHelp").on("mouseover", function (e) {
          e.preventDefault();
          const key = $(this).attr("data-tip");
          const tip = tips[key] || `<div class="twmuted">No help available.</div>`;
          showTipAt(this, tip);
        });

        $root.find(".tmHelp").on("mouseout", function () {
          hideTip();
        });

        $root.find(".tmHelp").on("click", function (e) {
          e.preventDefault();
        });
      })();

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

      $("#tmwh_run").on("click", async () => {
        try {
          const ns = readSettingsFromUI();
          state.settings = ns;
          saveSettings(ns);
          await runComputationAndRender();
        } catch (e) {
          // eslint-disable-next-line no-console
          console.error(e);
          alert("Run failed: " + (e.message || e));
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

      if (isNaN(s.lowPoints)) s.lowPoints = 1;
      if (isNaN(s.highPoints)) s.highPoints = 12000;
      if (isNaN(s.highFarm)) s.highFarm = 99999;
      if (isNaN(s.builtOutPercentage)) s.builtOutPercentage = 0.25;
      if (isNaN(s.needsMorePercentage)) s.needsMorePercentage = 0.85;

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

      s.builtOutPercentage = Math.max(0.1, Math.min(0.95, s.builtOutPercentage));
      s.needsMorePercentage = Math.max(0.1, Math.min(0.95, s.needsMorePercentage));

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

      s.settingsOpen = $("#tmwh_settingsBody").hasClass("open");
      s.premiumOptionsOpen = $("#tmwh_premiumBody").hasClass("open");

      return s;
    }

    function renderSummary(averages) {
      $("#tmwh_summary").html(`
        Totals: ${resIconHtml("wood")} <b>${numberWithCommasDots(averages.totalWood)}</b> |
        ${resIconHtml("stone")} <b>${numberWithCommasDots(averages.totalStone)}</b> |
        ${resIconHtml("iron")}  <b>${numberWithCommasDots(averages.totalIron)}</b><br/>
        Averages: ${resIconHtml("wood")} <b>${numberWithCommasDots(averages.woodAverage)}</b> |
        ${resIconHtml("stone")} <b>${numberWithCommasDots(averages.stoneAverage)}</b> |
        ${resIconHtml("iron")}  <b>${numberWithCommasDots(averages.ironAverage)}</b><br/>
        Corrected: ${resIconHtml("wood")} <b>${numberWithCommasDots(averages.actualWoodAverage)}</b> |
        ${resIconHtml("stone")} <b>${numberWithCommasDots(averages.actualStoneAverage)}</b> |
        ${resIconHtml("iron")}  <b>${numberWithCommasDots(averages.actualIronAverage)}</b>
      `);
    }

    function renderRows(cleanLinks) {
      const byId = new Map(state.villagesData.map(v => [String(v.id), v]));
      const $rows = $("#tmwh_rows");
      $rows.empty();

      cleanLinks.forEach((l, idx) => {
        const src = byId.get(String(l.source));
        const tgt = byId.get(String(l.target));
        const cls = idx % 2 === 0 ? "tmRowA" : "tmRowB";
        $rows.append(`
          <tr class="${cls}">
            <td><a class="tmLink" href="${src?.url || "#"}">${src?.name || l.source}</a></td>
            <td><a class="tmLink" href="${tgt?.url || "#"}">${tgt?.name || l.target}</a></td>
            <td style="text-align:center">${l.distance ?? ""}</td>
            <td style="text-align:right">${l.wood || 0}</td>
            <td style="text-align:right">${l.stone || 0}</td>
            <td style="text-align:right">${l.iron || 0}</td>
            <td style="text-align:center"><button class="btn btnSophie tmSendNormal" data-idx="${idx}" type="button">Send</button></td>
          </tr>
        `);
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
            <td><a class="tmLink" href="${src?.url || "#"}">${src?.name || s.source}</a></td>
            <td><a class="tmLink" href="${tgt?.url || "#"}">${tgt?.name || s.target}</a></td>
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
    }

    async function runComputationAndRender() {
      $("#tmwh_summary").text("Fetching overview pages...");
      $("#tmwh_rows").empty();
      $("#tmwh_timer").empty();
      hideTip();

      stopAllPlanTimers();

      const urls = getOverviewUrls();
      const incomingRes = await fetchIncomingOverview(urls.inc);
      const villagesData = await fetchProdOverview(urls.prod);

      const averages = computeTotalsAndAverages(villagesData, incomingRes);
      renderSummary(averages);

      const { excessResources, shortageResources, villageID } = computeExcessShortage(villagesData, incomingRes, averages);

      applyManualCoordLocks({ villagesData, excessResources, shortageResources });
      applyPpResourceLock({ villagesData, excessResources, shortageResources });

      const { links } = assignMerchantsAndBuildLinks(villagesData, excessResources, shortageResources, villageID);
      const cleanLinks = addDistanceToLinks(normalizeAndCombineLinks(links), villagesData);

      state.incomingRes = incomingRes;
      state.villagesData = villagesData;
      state.averages = averages;
      state.cleanLinks = cleanLinks;

      $("#tmwh_summary").append(`<div class="twmuted" style="margin-top:6px">Plan rows: <b>${cleanLinks.length}</b></div>`);

      renderRows(cleanLinks);
      renderManualCoordLockList();

      await resumePersistedPlans();

      const persistedPlans = loadPpPlans();
      if (persistedPlans.length) {
        for (const p of persistedPlans) appendSuggestedShipmentsToTable(p);
        renderPpLockStatus();
        return;
      }

      if (loadPpPlans().length) {
        renderPpLockStatus();
        return;
      }

      const plans = buildPlansUntilDone();
      for (const plan of plans) {
        addPpLock({ villageId: plan.targetVillageId, res: plan.payRes });
        upsertPpPlan(plan);

        appendSuggestedShipmentsToTable(plan);
        await startPlanCountdown(plan);
      }

      renderPpLockStatus();
    }

    async function run() {
      state = {
        settings: loadSettings(),
        planTimers: new Map(),
        incomingRes: {},
        villagesData: [],
        averages: null,
        cleanLinks: [],
        sendAllTimer: null
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
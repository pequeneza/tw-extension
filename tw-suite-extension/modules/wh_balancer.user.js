// ==UserScript==
// @name         Tribal Wars - Warehouse Balancer v4
// @namespace    https://pt*.tribalwars.com.pt/
// @version      4.0.0
// @description  The Real Balancer — reserve, max distance, settings import/export, HQ priority, PP plans, React overlay integration
// @match        https://*.tribalwars.com.pt/game.php*
// @grant        none
// ==/UserScript==

/* jshint esversion: 6 */

(function () {
  "use strict";
  if (typeof window.game_data === "undefined") return;

  if (window.__twWHBalancerRunning) return;
  window.__twWHBalancerRunning = true;

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

    // Debug logging helper — respects the debugMode setting
    function wbLog(...args) {
      if (state?.settings?.debugMode) console.log(...args);
    }
    function wbGroup(label) {
      if (state?.settings?.debugMode) console.group(label);
    }
    function wbGroupEnd() {
      if (state?.settings?.debugMode) console.groupEnd();
    }
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
        // Validate timestamp — if missing or non-numeric, return 0 so the cache
        // is treated as stale and re-fetched on next Run rather than appearing brand new.
        const parsedTs = parseInt(rawTs, 10);
        const timestamp = Number.isFinite(parsedTs) ? parsedTs : 0;

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
        localStorage.setItem(HQ_TIMESTAMP_KEY, String(Number.isFinite(timestamp) ? timestamp : Date.now()));
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
          const exBefore = excessResources[idx]?.[i]?.[res] || 0;
          const shBefore = shortageResources[idx]?.[i]?.[res] || 0;
          if (excessResources[idx] && excessResources[idx][i]) excessResources[idx][i][res] = 0;
          if (shortageResources[idx] && shortageResources[idx][i]) shortageResources[idx][i][res] = 0;
          if (exBefore + shBefore > 0) wbLog(`[WH] coord-lock ${villagesData[idx].name} [${res}]: excess ${exBefore}→0 shortage ${shBefore}→0`);
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
          builtOutPercentage: 0.2,
          recruitReserve: 20000,
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
          hqNormalQueueMaxHours: 6,

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
        if (!s.highFarm) s.highFarm = 23000;
        if (!s.lowPoints && s.lowPoints !== 0) s.lowPoints = 1;
        if (!s.builtOutPercentage && s.builtOutPercentage !== 0) s.builtOutPercentage = 0.25;
        if (typeof s.recruitReserve === "undefined") s.recruitReserve = 20000;
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
        if (typeof s.debugMode === "undefined") s.debugMode = false;
        if (typeof s.pendingSendsTTLHours === "undefined") s.pendingSendsTTLHours = 2;
        if (typeof s.hqNormalQueueMaxHours === "undefined" || isNaN(+s.hqNormalQueueMaxHours)) s.hqNormalQueueMaxHours = 6;
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
        s.highFarm = parseInt(s.highFarm, 10) || 23000;
        s.lowPoints = parseInt(s.lowPoints, 10);
        if (isNaN(s.lowPoints)) s.lowPoints = 1;

        s.reservePerVillage = Math.max(0, parseInt(s.reservePerVillage, 10) || 0);
        s.recruitReserve    = Math.max(0, parseInt(s.recruitReserve,    10) || 20000);
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

      wbGroup("[WH] computeExcessShortage");
      wbLog("[WH] settings:", {
        lowPoints: s.lowPoints, highPoints: s.highPoints, highFarm: s.highFarm,
        builtOutPercentage: s.builtOutPercentage, needsMorePercentage: s.needsMorePercentage,
        reservePerVillage: s.reservePerVillage, longQueueHours,
      });
      wbLog("[WH] convergent averages:", {
        wood: averages.actualWoodAverage, stone: averages.actualStoneAverage, iron: averages.actualIronAverage,
      });

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

        // If the village has a known next building:
        // - Suppress shortage when stock+incoming already covers the cost (no need to receive more)
        // - Suppress excess when stock+incoming is still below the cost (resources are earmarked
        //   for the building and must not be donated, even if above the convergent average)
        const hqBuilding = state.hqData?.get(String(v.id));
        if (hqBuilding && hqBuilding.buildingName) {
          if (tempWood  < 0 && (v.wood  + inc.wood)  >= hqBuilding.costWood)  tempWood  = 0;
          if (tempStone < 0 && (v.stone + inc.stone) >= hqBuilding.costStone) tempStone = 0;
          if (tempIron  < 0 && (v.iron  + inc.iron)  >= hqBuilding.costIron)  tempIron  = 0;
          if (tempWood  > 0 && (v.wood  + inc.wood)  <  hqBuilding.costWood)  tempWood  = 0;
          if (tempStone > 0 && (v.stone + inc.stone) <  hqBuilding.costStone) tempStone = 0;
          if (tempIron  > 0 && (v.iron  + inc.iron)  <  hqBuilding.costIron)  tempIron  = 0;
        }

        // Built-out villages (high points or high farm) donate most surplus.
        // leaveWood/Stone/Iron = how much the village keeps. It always keeps at least
        // reservePerVillage, and up to builtOutPercentage×WH if it has that much.
        // Using min(stock, wh_leave) means a village below the threshold keeps everything
        // it has — avoiding spurious excess when stock < wh_leave.
        // HIGH-PTS but not HIGH-FARM = actively recruiting troops → keep recruitReserve
        // per resource on top of the normal floor so troops can be trained.
        if (v.farmSpaceUsed > s.highFarm || v.points > s.highPoints) {
          const isRecruiting = v.points > s.highPoints && v.farmSpaceUsed <= s.highFarm;
          const wh_leave     = s.builtOutPercentage * wh;
          const res_leave    = s.reservePerVillage || 0;
          const rec_leave    = isRecruiting ? (s.recruitReserve || 20000) : 0;

          const leaveWood  = Math.max(res_leave, rec_leave, Math.min(v.wood  + inc.wood,  wh_leave));
          const leaveStone = Math.max(res_leave, rec_leave, Math.min(v.stone + inc.stone, wh_leave));
          const leaveIron  = Math.max(res_leave, rec_leave, Math.min(v.iron  + inc.iron,  wh_leave));

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
            // Priority receiver: keep the average-based shortage (same formula as normal
            // villages) so the shortage magnitude is realistic. The priority just means
            // these villages are served first in assignMerchantsAndBuildLinks — not that
            // they get an inflated warehouse-proportional shortage that starves other receivers.
            // Allow excess only on resources where stock exceeds max(buildingCost, avg) —
            // surplus beyond what the village needs for its next build can be donated.
            const safeFloorW = hq ? Math.max(averages.actualWoodAverage,  hq.costWood)  : averages.actualWoodAverage;
            const safeFloorS = hq ? Math.max(averages.actualStoneAverage, hq.costStone) : averages.actualStoneAverage;
            const safeFloorI = hq ? Math.max(averages.actualIronAverage,  hq.costIron)  : averages.actualIronAverage;
            if (tempWood  > 0) tempWood  = Math.max(0, Math.round(v.wood  + inc.wood  - safeFloorW));
            if (tempStone > 0) tempStone = Math.max(0, Math.round(v.stone + inc.stone - safeFloorS));
            if (tempIron  > 0) tempIron  = Math.max(0, Math.round(v.iron  + inc.iron  - safeFloorI));
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
            const ovLeave = Math.max(res_leave_ov, Math.min(v.wood  + inc.wood,  wh_leave_ov));
            tempWood  = Math.round((v.wood  + inc.wood)  - ovLeave);
          }
          if (v.stone + inc.stone >= ovThreshold) {
            const ovLeave = Math.max(res_leave_ov, Math.min(v.stone + inc.stone, wh_leave_ov));
            tempStone = Math.round((v.stone + inc.stone) - ovLeave);
          }
          if (v.iron  + inc.iron  >= ovThreshold) {
            const ovLeave = Math.max(res_leave_ov, Math.min(v.iron  + inc.iron,  wh_leave_ov));
            tempIron  = Math.round((v.iron  + inc.iron)  - ovLeave);
          }
        }

        // Final safety clamp for low-points villages (skip if long queue)
        if (v.points < s.lowPoints) {
          const hq = state.hqData ? state.hqData.get(String(v.id)) : null;
          const queueSec = hq && typeof hq.queueEndsSec === "number" ? hq.queueEndsSec : 0;
          const hasLongQueue = queueSec > longQueueSec;

          if (!hasLongQueue) {
            const safeFloorW = hq ? Math.max(averages.actualWoodAverage,  hq.costWood)  : averages.actualWoodAverage;
            const safeFloorS = hq ? Math.max(averages.actualStoneAverage, hq.costStone) : averages.actualStoneAverage;
            const safeFloorI = hq ? Math.max(averages.actualIronAverage,  hq.costIron)  : averages.actualIronAverage;
            if (tempWood  > 0) tempWood  = Math.max(0, Math.round(v.wood  + inc.wood  - safeFloorW));
            if (tempStone > 0) tempStone = Math.max(0, Math.round(v.stone + inc.stone - safeFloorS));
            if (tempIron  > 0) tempIron  = Math.max(0, Math.round(v.iron  + inc.iron  - safeFloorI));
          }
        }

        // Hard cap: cannot send more than currently available in warehouse
        if (tempWood  > 0 && tempWood  > v.wood)  tempWood  = v.wood;
        if (tempStone > 0 && tempStone > v.stone) tempStone = v.stone;
        if (tempIron  > 0 && tempIron  > v.iron)  tempIron  = v.iron;

        // Per-village debug log
        const hqEntry  = state.hqData?.get(String(v.id));
        const isLowPts = v.points < s.lowPoints;
        const isHighPts  = v.points > s.highPoints;
        const isHighFarm = v.farmSpaceUsed > s.highFarm;
        const qSec       = hqEntry?.queueEndsSec ?? null;
        const hasLongQ   = qSec !== null && qSec > longQueueSec;
        const tags = [
          isLowPts   ? "[LOW]"                                                  : "",
          isHighPts  ? "[HIGH-PTS]"                                             : "",
          isHighFarm ? `[HIGH-FARM farm=${v.farmSpaceUsed}/${s.highFarm}]`      : "",
          hasLongQ   ? `[LONG-Q ${(qSec/3600).toFixed(1)}h]`                   : "",
        ].filter(Boolean).join(" ");
        wbLog(`[WH] ${v.name} pts=${v.points}${tags ? " " + tags : ""}`, {
          stock:    { wood: v.wood, stone: v.stone, iron: v.iron },
          incoming: { wood: inc.wood, stone: inc.stone, iron: inc.iron },
          hq: hqEntry ? {
            building: hqEntry.buildingName, queueEndsSec: hqEntry.queueEndsSec,
            cost: { wood: hqEntry.costWood, stone: hqEntry.costStone, iron: hqEntry.costIron },
          } : null,
          temp:     { wood: tempWood, stone: tempStone, iron: tempIron },
          excess:   { wood: Math.max(0, Math.floor(tempWood  / 1000) * 1000), stone: Math.max(0, Math.floor(tempStone / 1000) * 1000), iron: Math.max(0, Math.floor(tempIron  / 1000) * 1000) },
          shortage: { wood: Math.max(0, Math.floor(-tempWood / 1000) * 1000), stone: Math.max(0, Math.floor(-tempStone/ 1000) * 1000), iron: Math.max(0, Math.floor(-tempIron / 1000) * 1000) },
        });

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

      wbGroupEnd();
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
        const exBefore = excessResources[idx]?.[resIndex]?.[res] || 0;
        const shBefore = shortageResources[idx]?.[resIndex]?.[res] || 0;

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
        if (exBefore + shBefore > 0) wbLog(`[WH] pp-lock ${villagesData[idx].name} [${res}]: excess ${exBefore}→0 shortage ${shBefore}→0`);
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
    function applyHqBuildPriority({ villagesData, excessResources, shortageResources, incomingRes, hqData, averages }) {
      if (!hqData || !hqData.size) return;
      wbGroup("[WH] applyHqBuildPriority");
      const s = state.settings;
      const boostedIds = new Set();

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
        if (!hq.buildingName) continue;            // no next building configured
        if (hq.costWood + hq.costStone + hq.costIron === 0) continue; // cost unknown

        const isLowPtsV = v.points < (s.lowPoints || 0);

        // Non-low-points villages whose queue exceeds hqNormalQueueMaxHours are not
        // boosted as shortage receivers — they have enough time for a future run.
        const normalQueueMaxSec = s.hqNormalQueueMaxHours * 3600;
        if (!isLowPtsV && normalQueueMaxSec > 0 && (hq.queueEndsSec || 0) > normalQueueMaxSec) {
          wbLog(`[WH] HQ skip ${v.name}: queue ${((hq.queueEndsSec||0)/3600).toFixed(1)}h > max ${s.hqNormalQueueMaxHours}h`);
          continue;
        }

        // Resolve manual lock for this village by coords
        const coords    = coordsFromVillageName(v.name);
        const coordKey  = coords ? `${coords.x}|${coords.y}` : null;
        const manLock   = (coordKey && manualLocks[coordKey]) || {};

        const inc = incomingRes[v.id] || { wood: 0, stone: 0, iron: 0 };

        // Use current stock + incoming only — production rates from screen=main are
        // unreliable (selector may not match on all server versions) and silently
        // fall back to 0, making the projection identical to raw stock anyway.
        // The missing < 1000 guard below handles the sub-1k noise this can cause.
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
          const isLowPtsVillage = v.points < (s.lowPoints || 0);

          // Cap excess to what's above the building cost — always, regardless of whether
          // there is a shortage. A village must keep enough for construction before donating.
          // This runs unconditionally so resources with surplus above cost are still capped
          // (previously the cap was inside the need>0 block and was skipped for surplus resources).
          if (excessResources[idx]?.[eIdx]) {
            const before = excessResources[idx][eIdx][res];
            const safeExcess = Math.floor(Math.max(0, v[res] + incAmt - cost) / 1000) * 1000;
            excessResources[idx][eIdx][res] = Math.min(before, safeExcess);
            if (excessResources[idx][eIdx][res] !== before) {
              wbLog(`[WH] HQ cap excess ${v.name} [${res}]: ${before}→${excessResources[idx][eIdx][res]} (cost=${cost} stock=${v[res]} inc=${incAmt})`);
            }
          }

          // Low-points villages: ceil so even small shortfalls trigger a send.
          // Normal/high villages: round so sub-500 noise (e.g. 503 iron) is suppressed.
          let need = isLowPtsVillage
            ? Math.ceil(missing  / 1000) * 1000
            : Math.round(missing / 1000) * 1000;
          if (need <= 0) { if (missing > 0) wbLog(`[WH] HQ skip ${v.name} [${res}]: missing=${missing} rounded to 0`); continue; }

          // For low-points villages, cap the HQ shortage boost to the same ceiling used
          // in computeExcessShortage: convergent average minus current stock.
          // Without this, large building costs re-introduce the inflated-shortage problem
          // that the low-points fix was designed to prevent.
          if (isLowPtsVillage) {
            const avgForRes = res === "wood"  ? averages.actualWoodAverage
                            : res === "stone" ? averages.actualStoneAverage
                            :                   averages.actualIronAverage;
            const avgBased = Math.max(0, Math.ceil((avgForRes - v[res] - incAmt) / 1000) * 1000);
            need = Math.min(need, avgBased);
            if (need <= 0) continue;
          }

          // Boost shortage to the building shortfall (only if not already higher)
          if (shortageResources[idx]?.[sIdx]) {
            const before = shortageResources[idx][sIdx][res];
            const boosted = Math.max(before, need);
            shortageResources[idx][sIdx][res] = boosted;
            if (boosted > before) boostedIds.add(String(v.id));
            wbLog(`[WH] HQ boost ${v.name} [${res}]: missing=${missing} need=${need} shortage ${before}→${boosted}`);
          }
        }

        wbLog(`[WH] HQ ${v.name} pts=${v.points}`, {
          building: hq.buildingName, queueEndsSec: hq.queueEndsSec,
          cost:     { wood: hq.costWood,  stone: hq.costStone,  iron: hq.costIron  },
          stock:    { wood: v.wood, stone: v.stone, iron: v.iron },
          incoming: { wood: inc.wood, stone: inc.stone, iron: inc.iron },
          isLowPts: isLowPtsV,
        });
      }
      wbGroupEnd();
      state.hqBoostedIds = boostedIds;
    }

    // ---------------- Links build ----------------
    function assignMerchantsAndBuildLinks(villagesData, excessResources, shortageResources, villageID, isMintingMode) {
      const links = [];

      // Max distance constraint — applied per-donor inside the loop so donor resources
      // are not consumed by links that will later be filtered out.
      const maxDist = Math.max(1, state?.settings?.maxDistance || 9999);
      const lowPts  = state?.settings?.lowPoints || 0;

      // Pre-compute coords, cache pairwise distances
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

      // Fix (Bug 4): Build cluster map before donor loop so donor sorting can be cluster-aware.
      // Uses modular row-wrap instead of Math.min clamp to avoid dumping overflow into last cluster.
      const clusterEnabled = !isMintingMode && state?.settings?.useClusters;
      const numClusters = clusterEnabled ? (state?.settings?.numClusters || 1) : 1;
      const villageCluster = new Map();
      if (clusterEnabled && numClusters >= 2) {
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        coordsById.forEach(c => {
          minX = Math.min(minX, c.x); maxX = Math.max(maxX, c.x);
          minY = Math.min(minY, c.y); maxY = Math.max(maxY, c.y);
        });
        const width    = maxX - minX || 1;
        const height   = maxY - minY || 1;
        const gridSize = Math.ceil(Math.sqrt(numClusters));
        for (const v of villagesData) {
          const c = coordsById.get(String(v.id));
          if (!c) { villageCluster.set(String(v.id), 0); continue; }
          const gx = Math.min(Math.floor(((c.x - minX) / width)  * gridSize), gridSize - 1);
          const gy = Math.min(Math.floor(((c.y - minY) / height) * gridSize), gridSize - 1);
          // Modular wrap: row-major index clamped to [0, numClusters-1] without lump-clamp
          villageCluster.set(String(v.id), (gy % Math.ceil(numClusters / gridSize)) * gridSize + gx);
        }
      }

      // Shared merchant pool per donor
      const donors = [];
      for (let p = 0; p < excessResources.length; p++) {
        const exW = Math.floor(excessResources[p][0].wood  / 1000) * 1000;
        const exS = Math.floor(excessResources[p][1].stone / 1000) * 1000;
        const exI = Math.floor(excessResources[p][2].iron  / 1000) * 1000;
        const combined = exW + exS + exI;
        if (combined <= 0) continue;
        if (!coordsById.has(String(villagesData[p].id))) continue;

        const avail = villagesData[p].availableMerchants;

        // Keep full excess amounts — merchantsLeft is the only constraint.
        // Pre-scaling proportionally was wrong: it capped e.g. wood to 156k even when
        // receivers only needed 5k wood, leaving the remaining merchants unable to
        // send stone instead. The per-send canSend = min(remaining, donor[res], merchantsLeft*1000)
        // already enforces the merchant limit correctly without pre-capping.
        donors.push({
          id:            String(villagesData[p].id),
          merchantsLeft: avail,
          wood:  exW,
          stone: exS,
          iron:  exI,
        });
      }

      // Pre-allocate merchant capacity proportionally across each resource a donor can send.
      // Without this, the first resource in the loop (wood) can consume all merchants,
      // leaving none for stone/iron and allowing the warehouse to fill up and stall production.
      for (const donor of donors) {
        const needW = Math.ceil(donor.wood  / 1000);
        const needS = Math.ceil(donor.stone / 1000);
        const needI = Math.ceil(donor.iron  / 1000);
        const totalNeed = needW + needS + needI;
        if (totalNeed <= donor.merchantsLeft) {
          // Enough merchants for all resources — each gets exactly what it needs.
          donor.resBudget = { wood: needW, stone: needS, iron: needI };
        } else {
          // Proportionally split available merchants across resources with excess.
          const avail = donor.merchantsLeft;
          const totalExcess = (donor.wood + donor.stone + donor.iron) || 1;
          let bW = donor.wood  > 0 ? Math.floor(avail * donor.wood  / totalExcess) : 0;
          let bS = donor.stone > 0 ? Math.floor(avail * donor.stone / totalExcess) : 0;
          let bI = donor.iron  > 0 ? Math.floor(avail * donor.iron  / totalExcess) : 0;
          // Distribute rounding remainder to the resource with the most excess.
          const rem = avail - bW - bS - bI;
          if (rem > 0) {
            if (donor.wood >= donor.stone && donor.wood >= donor.iron && donor.wood > 0) bW += rem;
            else if (donor.stone >= donor.iron && donor.stone > 0) bS += rem;
            else if (donor.iron > 0) bI += rem;
          }
          donor.resBudget = {
            wood:  Math.min(bW, needW),
            stone: Math.min(bS, needS),
            iron:  Math.min(bI, needI),
          };
        }
      }

      const RES = [
        { res: "wood",  sIdx: 0 },
        { res: "stone", sIdx: 1 },
        { res: "iron",  sIdx: 2 },
      ];

      for (const { res, sIdx } of RES) {
        const priorityReceivers = [];
        const normalReceivers   = [];
        for (let q = 0; q < shortageResources.length; q++) {
          const need = shortageResources[q][sIdx][res] || 0;
          if (need <= 0) continue;
          const v         = villagesData[q];
          const hqEntry   = state.hqData?.get(String(v?.id));
          // queueEndsSec = 0 means can build right now (most urgent).
          // Villages with no HQ data get Infinity — treated as least urgent.
          const queueSecs = (hqEntry && state.hqBoostedIds?.has(String(v?.id)))
            ? (hqEntry.queueEndsSec ?? Infinity)
            : Infinity;
          if (v && v.points < lowPts)
            priorityReceivers.push({ q, need, queueSecs });
          else
            normalReceivers.push({ q, need, queueSecs });
        }
        // Priority villages: largest shortage first (urgency already encoded by points)
        priorityReceivers.sort((a, b) => b.need - a.need);
        // Normal villages: sort by queue urgency first (shorter queue = more urgent),
        // then by shortage size as tiebreaker.
        // queue=0 (ready to build now) → served first
        // queue=20min → before queue=10h
        // no HQ boost (Infinity) → served last among normal villages
        normalReceivers.sort((a, b) => a.queueSecs - b.queueSecs || b.need - a.need);

        for (const rcv of [...priorityReceivers, ...normalReceivers]) {
          const { q } = rcv;
          let remaining = shortageResources[q][sIdx][res];
          if (remaining <= 0) continue;

          const tgtId      = String(villageID[q]);
          const tgtCluster = villageCluster.get(tgtId) ?? 0;

          // Fix (Bug 1): cluster-aware donor sorting.
          // When clustering is active, intra-cluster donors are tried first (sorted by distance),
          // then cross-cluster donors as fallback (also sorted by distance).
          // This is where clustering actually affects resource flow — not post-hoc re-sorting.
          const receiverIsHqBoosted = state.hqBoostedIds?.has(tgtId);
          const eligibleDonors = donors.filter(d => {
            if (d[res] <= 0 || d.merchantsLeft <= 0) return false;
            if (receiverIsHqBoosted && state.hqBoostedIds?.has(d.id)) return false;
            return true;
          });

          let sortedDonors;
          if (clusterEnabled && numClusters >= 2) {
            const intra = eligibleDonors
              .filter(d => (villageCluster.get(d.id) ?? 0) === tgtCluster)
              .sort((a, b) => cachedDist(a.id, tgtId) - cachedDist(b.id, tgtId));
            const inter = eligibleDonors
              .filter(d => (villageCluster.get(d.id) ?? 0) !== tgtCluster)
              .sort((a, b) => cachedDist(a.id, tgtId) - cachedDist(b.id, tgtId));
            sortedDonors = [...intra, ...inter];
          } else {
            sortedDonors = eligibleDonors
              .sort((a, b) => cachedDist(a.id, tgtId) - cachedDist(b.id, tgtId));
          }

          for (const donor of sortedDonors) {
            if (remaining <= 0) break;
            if (donor[res] <= 0 || donor.merchantsLeft <= 0 || donor.resBudget[res] <= 0) continue;

            const maxByMerchants = Math.min(donor.merchantsLeft, donor.resBudget[res]) * 1000;
            const canSend = Math.floor(Math.min(remaining, donor[res], maxByMerchants) / 1000) * 1000;
            if (canSend <= 0) continue;

            // Skip if this donor→receiver pair exceeds maxDistance, unless the receiver
            // is a low-points priority village (always exempt from distance filter).
            const isLowPtsReceiver = villagesData[q] && villagesData[q].points < lowPts;
            if (maxDist < 9999 && !isLowPtsReceiver && cachedDist(donor.id, tgtId) > maxDist) continue;

            links.push({
              source: donor.id,
              target: tgtId,
              wood:  res === "wood"  ? canSend : 0,
              stone: res === "stone" ? canSend : 0,
              iron:  res === "iron"  ? canSend : 0,
            });

            const merchantsUsed     = canSend / 1000;
            donor[res]              -= canSend;
            donor.merchantsLeft     -= merchantsUsed;
            donor.resBudget[res]    -= merchantsUsed;
            remaining               -= canSend;
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

            const curNeed   = neededRes === "wood" ? (v.wood || 0) : neededRes === "stone" ? (v.stone || 0) : (v.iron || 0);
            const needSpace = Math.floor(Math.max(0, wh - curNeed) / 1000) * 1000;
            const tradeAmt = Math.floor(Math.min(avail, s.premiumMoveAmount || idealMove, idealMove, needSpace) / 1000) * 1000;
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
            createdAt: getNowMs(),
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

      // Reject or cap the plan if the target has no WH space for the resource it will receive
      const curNeeded = neededRes === "wood" ? (target.wood || 0) : neededRes === "stone" ? (target.stone || 0) : (target.iron || 0);
      const whFreeForNeeded = Math.floor(Math.max(0, (target.warehouseCapacity || 0) - curNeeded) / 1000) * 1000;
      moveAmt = Math.min(moveAmt, whFreeForNeeded);
      moveAmt = Math.floor(moveAmt / 1000) * 1000;
      if (moveAmt < minTrade) return null;

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
        createdAt: getNowMs(),
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
            <button class="btn btnSophie" data-tradedone="1" data-planid="${plan.id}" data-ppvid="${plan.targetVillageId}" data-ppres="${plan.payRes}" type="button" style="background:#1a6e1a;color:#fff">Trade Done ✓</button>
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
        const vid = plan.targetVillageId;
        const res = plan.payRes;
        stopPlanTimer(plan.id);
        removePpPlan(plan.id);
        removePpLock({ villageId: vid, res });
        removePlansByLock({ villageId: vid, res });
        $(`#${boxId}`).remove();
        UI.SuccessMessage("Instant trade plan cancelled and lock cleared.");
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

      $(`button[data-tradedone][data-planid="${plan.id}"]`).off("click").on("click", function () {
        const vid = plan.targetVillageId;
        const res = plan.payRes;
        stopPlanTimer(plan.id);
        removePpPlan(plan.id);
        removePpLock({ villageId: vid, res });
        removePlansByLock({ villageId: vid, res });
        $(`#${boxId}`).remove();
        UI.SuccessMessage("Trade complete — plan cleared.");
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
            // Push updated ETA anchor to React panel so useCountdown can start ticking
            updateReactState({ running: false, statusText: '' });
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
          // Notify React panel that arrival is complete
          updateReactState({ running: false, statusText: '' });
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

    // Returns the cluster map SVG+legend as an HTML string for the React panel.
    // Returns null if clustering is disabled or no village coords are available.
    function computeClusterMapSvg(villagesData, cleanLinks) {
      const s = state?.settings;
      if (!s?.useClusters || (s?.numClusters || 1) < 2) return null;

      const coords = [];
      for (const v of villagesData) {
        const c = coordsFromVillageName(v.name);
        if (c) coords.push({ id: String(v.id), name: v.name, x: c.x, y: c.y, pts: v.points });
      }
      if (!coords.length) return null;

      const numClusters = s.numClusters;
      const gridSize = Math.ceil(Math.sqrt(numClusters));
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const c of coords) {
        minX = Math.min(minX, c.x); maxX = Math.max(maxX, c.x);
        minY = Math.min(minY, c.y); maxY = Math.max(maxY, c.y);
      }
      const width = maxX - minX || 1, height = maxY - minY || 1;
      for (const c of coords) {
        const gx = Math.min(Math.floor(((c.x - minX) / width)  * gridSize), gridSize - 1);
        const gy = Math.min(Math.floor(((c.y - minY) / height) * gridSize), gridSize - 1);
        c.cluster = (gy % Math.ceil(numClusters / gridSize)) * gridSize + gx;
      }

      const PAD = 32, DOT = 7, W = 540, H = 400;
      const scaleX = x => PAD + ((x - minX) / width)  * (W - PAD * 2);
      const scaleY = y => PAD + ((y - minY) / height) * (H - PAD * 2);
      const COLORS = ["#e74c3c","#3498db","#2ecc71","#f39c12","#9b59b6","#1abc9c","#e67e22","#34495e","#e91e63","#00bcd4","#8bc34a","#ff5722"];
      const clusterColor = i => COLORS[i % COLORS.length];

      const crossLinks = (cleanLinks || []).filter(l => {
        const sc = coords.find(c => c.id === String(l.source));
        const tc = coords.find(c => c.id === String(l.target));
        return sc && tc && sc.cluster !== tc.cluster;
      });

      let cellRects = "";
      for (let gy = 0; gy < gridSize; gy++) {
        for (let gx = 0; gx < gridSize; gx++) {
          const cid = (gy % Math.ceil(numClusters / gridSize)) * gridSize + gx;
          if (cid >= numClusters) continue;
          const x1 = PAD + (gx / gridSize) * (W - PAD * 2);
          const y1 = PAD + (gy / gridSize) * (H - PAD * 2);
          const cw = (W - PAD * 2) / gridSize, ch = (H - PAD * 2) / gridSize;
          const col = clusterColor(cid);
          cellRects += `<rect x="${x1.toFixed(1)}" y="${y1.toFixed(1)}" width="${cw.toFixed(1)}" height="${ch.toFixed(1)}" fill="${col}" fill-opacity="0.10" stroke="${col}" stroke-opacity="0.35" stroke-width="1" stroke-dasharray="4,3"/>`;
        }
      }

      let arrows = "";
      for (const l of crossLinks) {
        const sc = coords.find(c => c.id === String(l.source));
        const tc = coords.find(c => c.id === String(l.target));
        if (!sc || !tc) continue;
        const col = clusterColor(sc.cluster);
        arrows += `<line x1="${scaleX(sc.x).toFixed(1)}" y1="${scaleY(sc.y).toFixed(1)}" x2="${scaleX(tc.x).toFixed(1)}" y2="${scaleY(tc.y).toFixed(1)}" stroke="${col}" stroke-width="1.2" stroke-opacity="0.45" marker-end="url(#arr_${sc.cluster})"/>`;
      }

      let defs = '<defs>';
      for (let i = 0; i < numClusters; i++) {
        const col = clusterColor(i);
        defs += `<marker id="arr_${i}" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="${col}" fill-opacity="0.6"/></marker>`;
      }
      defs += '</defs>';

      let dots = "";
      for (const c of coords) {
        const cx = scaleX(c.x), cy = scaleY(c.y);
        const col = clusterColor(c.cluster);
        const isLow = c.pts < (s.lowPoints || 0);
        const label = c.name.split(" (")[0].trim();
        dots += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${DOT}" fill="${col}" stroke="#fff" stroke-width="1.5" opacity="0.9"><title>${c.name} pts=${c.pts} cluster=${c.cluster}</title></circle>`;
        if (isLow) dots += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${DOT + 3}" fill="none" stroke="${col}" stroke-width="1.5" stroke-dasharray="3,2" opacity="0.7"/>`;
        dots += `<text x="${(cx + DOT + 2).toFixed(1)}" y="${(cy + 4).toFixed(1)}" font-size="9" fill="#333" font-family="sans-serif">${label}</text>`;
      }

      const svg = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg" style="display:block;max-width:100%">${defs}${cellRects}${arrows}${dots}</svg>`;
      const legend = Array.from({length: numClusters}, (_, i) =>
        `<span style="display:inline-block;margin-right:8px"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${clusterColor(i)};vertical-align:middle;margin-right:3px"></span>Cluster ${i}</span>`
      ).join("") + " &nbsp;·&nbsp; Dashed ring = low-points &nbsp;·&nbsp; Arrows = cross-cluster sends";

      return { svg, legend, numClusters };
    }

    function renderClusterMap(villagesData, cleanLinks) {
      const s = state?.settings;
      const mapBox = document.getElementById("tmwh_map_box");
      const container = document.getElementById("tmwh_map_container");
      if (!mapBox || !container) return;

      // Only show map when clustering is enabled and numClusters >= 2
      if (!s?.useClusters || (s?.numClusters || 1) < 2) {
        mapBox.style.display = "none";
        return;
      }
      mapBox.style.display = "";

      // Gather coords
      const coords = [];
      const idToVillage = new Map();
      for (const v of villagesData) {
        const c = coordsFromVillageName(v.name);
        if (c) { coords.push({ id: String(v.id), name: v.name, x: c.x, y: c.y, pts: v.points }); }
        idToVillage.set(String(v.id), v);
      }
      if (!coords.length) return;

      // Compute clusters (same logic as assignMerchantsAndBuildLinks)
      const numClusters = s.numClusters;
      const gridSize = Math.ceil(Math.sqrt(numClusters));
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const c of coords) {
        minX = Math.min(minX, c.x); maxX = Math.max(maxX, c.x);
        minY = Math.min(minY, c.y); maxY = Math.max(maxY, c.y);
      }
      const width  = maxX - minX || 1;
      const height = maxY - minY || 1;
      for (const c of coords) {
        const gx = Math.min(Math.floor(((c.x - minX) / width)  * gridSize), gridSize - 1);
        const gy = Math.min(Math.floor(((c.y - minY) / height) * gridSize), gridSize - 1);
        c.cluster = (gy % Math.ceil(numClusters / gridSize)) * gridSize + gx;
      }

      // SVG dimensions
      const PAD = 32, DOT = 7, W = 540, H = 400;
      const scaleX = x => PAD + ((x - minX) / width)  * (W - PAD * 2);
      const scaleY = y => PAD + ((y - minY) / height) * (H - PAD * 2);

      // Cluster colours (up to 12 distinct)
      const COLORS = [
        "#e74c3c","#3498db","#2ecc71","#f39c12","#9b59b6",
        "#1abc9c","#e67e22","#34495e","#e91e63","#00bcd4",
        "#8bc34a","#ff5722"
      ];
      const clusterColor = i => COLORS[i % COLORS.length];

      // Build link index for drawing arrows (only cross-cluster links)
      const crossLinks = (cleanLinks || []).filter(l => {
        const sc = coords.find(c => c.id === String(l.source));
        const tc = coords.find(c => c.id === String(l.target));
        return sc && tc && sc.cluster !== tc.cluster;
      });

      // Draw grid cell backgrounds
      let cellRects = "";
      for (let gy = 0; gy < gridSize; gy++) {
        for (let gx = 0; gx < gridSize; gx++) {
          const cid = (gy % Math.ceil(numClusters / gridSize)) * gridSize + gx;
          if (cid >= numClusters) continue;
          const x1 = PAD + (gx / gridSize) * (W - PAD * 2);
          const y1 = PAD + (gy / gridSize) * (H - PAD * 2);
          const cw = (W - PAD * 2) / gridSize;
          const ch = (H - PAD * 2) / gridSize;
          const col = clusterColor(cid);
          cellRects += `<rect x="${x1.toFixed(1)}" y="${y1.toFixed(1)}" width="${cw.toFixed(1)}" height="${ch.toFixed(1)}" fill="${col}" fill-opacity="0.10" stroke="${col}" stroke-opacity="0.35" stroke-width="1" stroke-dasharray="4,3"/>`;
        }
      }

      // Draw cross-cluster link arrows
      let arrows = "";
      for (const l of crossLinks) {
        const sc = coords.find(c => c.id === String(l.source));
        const tc = coords.find(c => c.id === String(l.target));
        if (!sc || !tc) continue;
        const x1 = scaleX(sc.x), y1 = scaleY(sc.y);
        const x2 = scaleX(tc.x), y2 = scaleY(tc.y);
        const col = clusterColor(sc.cluster);
        arrows += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${col}" stroke-width="1.2" stroke-opacity="0.45" marker-end="url(#arr_${sc.cluster})"/>`;
      }

      // Arrowhead markers per cluster colour
      let defs = '<defs>';
      for (let i = 0; i < numClusters; i++) {
        const col = clusterColor(i);
        defs += `<marker id="arr_${i}" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="${col}" fill-opacity="0.6"/></marker>`;
      }
      defs += '</defs>';

      // Draw village dots + labels
      let dots = "";
      for (const c of coords) {
        const cx = scaleX(c.x), cy = scaleY(c.y);
        const col = clusterColor(c.cluster);
        const isLow = c.pts < (s.lowPoints || 0);
        const label = c.name.split(" (")[0].trim(); // just "001x" part
        dots += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${DOT}" fill="${col}" stroke="#fff" stroke-width="1.5" opacity="0.9">
          <title>${c.name} pts=${c.pts} cluster=${c.cluster}</title>
        </circle>`;
        if (isLow) {
          dots += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${DOT + 3}" fill="none" stroke="#fff" stroke-width="1.5" stroke-dasharray="3,2" opacity="0.7"/>`;
        }
        dots += `<text x="${(cx + DOT + 2).toFixed(1)}" y="${(cy + 4).toFixed(1)}" font-size="9" fill="#333" font-family="sans-serif">${label}</text>`;
      }

      container.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg" style="display:block;max-width:100%">
        ${defs}
        ${cellRects}
        ${arrows}
        ${dots}
      </svg>
      <div style="font-size:10px;color:#888;margin-top:4px">
        ${Array.from({length: numClusters}, (_, i) =>
          `<span style="display:inline-block;margin-right:8px"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${clusterColor(i)};vertical-align:middle;margin-right:3px"></span>Cluster ${i}</span>`
        ).join("")}
        &nbsp;·&nbsp; Dashed ring = low-points village &nbsp;·&nbsp; Arrows = cross-cluster sends
      </div>`;
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
      const reserve = state?.settings?.reservePerVillage || 0;
      const rawById = new Map((state.rawVillagesData || []).map(r => [String(r.id), r]));
      const raw = rawById.get(String(v.id));
      const showRaw = raw && reserve > 0;
      return `
        <div style="min-width:200px">
          <div style="font-weight:bold;margin-bottom:4px">${v.name}${coordStr}</div>
          <table style="width:100%;border-collapse:collapse;font-size:11px">
            <tr>
              <td>${resIconHtml("wood")}</td><td style="text-align:right">${numberWithCommasDots(showRaw ? raw.wood : v.wood)}</td>
              <td style="padding-left:8px">${resIconHtml("stone")}</td><td style="text-align:right">${numberWithCommasDots(showRaw ? raw.stone : v.stone)}</td>
              <td style="padding-left:8px">${resIconHtml("iron")}</td><td style="text-align:right">${numberWithCommasDots(showRaw ? raw.iron : v.iron)}</td>
            </tr>
          </table>
          ${showRaw ? `<div style="font-size:10px;color:#888;margin-top:2px">Reserve ${numberWithCommasDots(reserve)} subtracted → available: ${numberWithCommasDots(v.wood)} / ${numberWithCommasDots(v.stone)} / ${numberWithCommasDots(v.iron)}</div>` : ""}
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

      // Build cluster map for CC badge (same grid logic as assignMerchantsAndBuildLinks)
      const clusterMap = new Map();
      const s = state?.settings;
      if (s?.useClusters && (s?.numClusters || 1) >= 2) {
        const numClusters = s.numClusters;
        const gridSize = Math.ceil(Math.sqrt(numClusters));
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const v of state.villagesData) {
          const c = coordsFromVillageName(v.name);
          if (c) { minX = Math.min(minX, c.x); maxX = Math.max(maxX, c.x); minY = Math.min(minY, c.y); maxY = Math.max(maxY, c.y); }
        }
        const width = maxX - minX || 1, height = maxY - minY || 1;
        for (const v of state.villagesData) {
          const c = coordsFromVillageName(v.name);
          if (!c) { clusterMap.set(String(v.id), 0); continue; }
          const gx = Math.min(Math.floor(((c.x - minX) / width)  * gridSize), gridSize - 1);
          const gy = Math.min(Math.floor(((c.y - minY) / height) * gridSize), gridSize - 1);
          clusterMap.set(String(v.id), (gy % Math.ceil(numClusters / gridSize)) * gridSize + gx);
        }
      }

      cleanLinks.forEach((l, idx) => {
        const src = byId.get(String(l.source));
        const tgt = byId.get(String(l.target));
        const cls = idx % 2 === 0 ? "tmRowA" : "tmRowB";
        // Check if target is an HQ-priority village (empty queue, needs resources for building)
        const hqTarget = state.hqData?.get(String(l.target));
        const hqReadiness = hqTarget ? computeHqReadiness(tgt, hqTarget) : null;
        const isHqBoost = !!(hqReadiness?.hasShortfall);
        const rowCls = isHqBoost ? "tmHqBoostRow" : cls;
        const hqBadge = isHqBoost
          ? `<span class="tmBadgeHQ" title="Building: ${hqTarget.buildingName}">HQ</span>`
          : "";

        // CC badge — cross-cluster send
        const srcCluster = clusterMap.get(String(l.source)) ?? -1;
        const tgtCluster = clusterMap.get(String(l.target)) ?? -1;
        const isCrossCluster = clusterMap.size > 0 && srcCluster !== tgtCluster;
        const ccBadge = isCrossCluster
          ? `<span class="tmBadgeCC" title="Cross-cluster send (cluster ${srcCluster} → ${tgtCluster})">CC</span>`
          : "";

        $rows.append(`
          <tr class="${rowCls}">
            <td>${ccBadge}<a class="tmLink tmVilTip" data-vid="${l.source}" href="${src?.url || "#"}">${src?.name || l.source}</a></td>
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

      // Instant plans: no shipments to send — show status row with cancel button only
      if (plan.instant || plan.shipments.length === 0) {
        $rows.prepend(`
          <tr class="tmPpNowHeader" data-planid="${plan.id}">
            <td colspan="6">
              <span class="tmBadgePPNow">⚡ PP NOW</span>
              <b>${plan.targetVillageName}</b> already has
              <b>${numberWithCommasDots(plan.tradeAmount || 0)}</b> ${resourceLabel(plan.payRes)} —
              instant trade for ${resourceLabel(plan.neededRes)} (10pp). Use the timer box below to confirm or cancel.
            </td>
            <td style="text-align:center;white-space:nowrap">
              <button class="btn btnSophie tmPpReject" data-planid="${plan.id}" type="button" style="background:#8b1a1a;color:#fff" title="Cancel plan">✗</button>
            </td>
          </tr>
        `);
        _bindPpRowButtons(plan, $rows);
        return;
      }

      // Build shipment rows as a string so the whole block is prepended at once,
      // keeping header on top and shipments in order below it.
      const shipmentsHtml = plan.shipments.map((s) => {
        const src = byId.get(String(s.source));
        const tgt = byId.get(String(s.target));
        return `
          <tr class="tmPpRow" data-planid="${plan.id}">
            <td><a class="tmLink tmVilTip" data-vid="${s.source}" href="${src?.url || "#"}">${src?.name || s.source}</a></td>
            <td><a class="tmLink tmVilTip" data-vid="${s.target}" href="${tgt?.url || "#"}">${tgt?.name || s.target}</a></td>
            <td style="text-align:center">${s.distance}</td>
            <td style="text-align:right">${s.wood || 0}</td>
            <td style="text-align:right">${s.stone || 0}</td>
            <td style="text-align:right">${s.iron || 0}</td>
            <td style="text-align:center">
              <button class="btn btnSophie tmSendSug" data-src="${s.source}" data-tgt="${s.target}" data-wood="${s.wood || 0}" data-stone="${s.stone || 0}" data-iron="${s.iron || 0}" type="button">Send</button>
            </td>
          </tr>
        `;
      }).join("");

      $rows.prepend(`
        <tr class="tmPpHeader" data-planid="${plan.id}">
          <td colspan="6">
            <span class="tmBadgePP">PP</span>
            Plan: move <b>${numberWithCommasDots(movedAmount || 0)}</b> ${resourceLabel(plan.payRes)}
            → <b>${plan.targetVillageName}</b>, then instant trade for ${resourceLabel(plan.neededRes)} (10pp).
            <span class="twmuted" style="margin-left:10px">
              ${resIconHtml("wood")} <b>${numberWithCommasDots(moved.wood || 0)}</b>
              ${resIconHtml("stone")} <b>${numberWithCommasDots(moved.stone || 0)}</b>
              ${resIconHtml("iron")} <b>${numberWithCommasDots(moved.iron || 0)}</b>
              | All: <b>${numberWithCommasDots(totalAll || 0)}</b>
            </span>
          </td>
          <td style="text-align:center;white-space:nowrap">
            <button class="btn btnSophie tmPpAccept" data-planid="${plan.id}" type="button" style="background:#1a6e1a;color:#fff;margin-right:3px" title="Accept: send all shipments for this plan">✓</button>
            <button class="btn btnSophie tmPpReject" data-planid="${plan.id}" type="button" style="background:#8b1a1a;color:#fff" title="Cancel this plan">✗</button>
          </td>
        </tr>
        ${shipmentsHtml}
      `);

      _bindPpRowButtons(plan, $rows);

      // Village detail tooltips
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

    function _bindPpRowButtons(plan, $rows) {
      // ✓ Accept — send every shipment sequentially then remove all rows for this plan
      $rows.find(`.tmPpAccept[data-planid="${plan.id}"]`).off("click").on("click", function () {
        const $btn = $(this);
        $btn.prop("disabled", true).text("…");
        $rows.find(`.tmPpReject[data-planid="${plan.id}"]`).prop("disabled", true);
        const shipments = plan.shipments.slice();
        const interval = Math.max(100, parseInt(state?.settings?.sendAllIntervalMs, 10) || 400);
        let i = 0;
        function sendNext() {
          if (i >= shipments.length) {
            $rows.find(`[data-planid="${plan.id}"]`).remove();
            UI.SuccessMessage(`PP — ${shipments.length} shipment(s) sent. Timer is running in the box below.`);
            return;
          }
          const s = shipments[i++];
          sendResource(s.source, s.target, s.wood || 0, s.stone || 0, s.iron || 0);
          setTimeout(sendNext, interval);
        }
        sendNext();
      });

      // ✗ Reject — cancel plan, remove rows and timer box
      $rows.find(`.tmPpReject[data-planid="${plan.id}"]`).off("click").on("click", function () {
        const vid = plan.targetVillageId;
        const res = plan.payRes;
        stopPlanTimer(plan.id);
        removePpPlan(plan.id);
        removePpLock({ villageId: vid, res });
        removePlansByLock({ villageId: vid, res });
        $rows.find(`[data-planid="${plan.id}"]`).remove();
        const boxId = `tmwh_timer_plan_${String(plan.id).replace(/[^\w]/g, "_")}`;
        $(`#${boxId}`).remove();
        UI.SuccessMessage("PP plan cancelled.");
        renderPpLockStatus();
      });

      // Per-row Send buttons remain available as a fallback
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

    // -------- BULK HQ DATA FETCH --------
    // Replaces per-village fetchHqNextBuilding for the main computation pass.
    //   1. screen=am_village          (1 fetch)  → villageId → templateId
    //   2. screen=am_village&mode=queue&template=ID  (N unique templates, usually 1-3)
    //   3. screen=overview_villages&mode=buildings   (1 fetch) → levels + queue times
    //   4. Walk template sequence per village → find next building step needed
    //   5. screen=main for ONE village per unique (buildingId, targetLevel) for costs

    function normalizeStr(s) {
      return (s || "").toLowerCase().trim()
        .normalize("NFD").replace(/[̀-ͯ]/g, "");
    }

    const TW_PT_BLDG = (() => {
      const m = {};
      [
        ["edificio principal", "main"], ["quartel", "barracks"],
        ["estabulo", "stable"], ["oficina", "garage"], ["academia", "snob"],
        ["ferreiro", "smith"], ["praca de reunioes", "place"], ["mercado", "market"],
        ["bosque", "wood"], ["poco de argila", "stone"], ["mina de ferro", "iron"],
        ["fazenda", "farm"], ["armazem", "storage"], ["esconderijo", "hide"],
        ["muralha", "wall"], ["torre de vigia", "watchtower"], ["estatua", "statue"],
      ].forEach(([k, v]) => { m[k] = v; });
      return m;
    })();

    const TW_PT_BLDG_NAME = {
      main: "Edifício Principal", barracks: "Quartel", stable: "Estábulo",
      garage: "Oficina", snob: "Academia", smith: "Ferreiro",
      place: "Praça de Reuniões", market: "Mercado", wood: "Bosque",
      stone: "Poço de Argila", iron: "Mina de Ferro", farm: "Fazenda",
      storage: "Armazém", hide: "Esconderijo", wall: "Muralha",
      watchtower: "Torre de Vigia", statue: "Estátua",
    };

    function buildingNameToId(rawName) {
      const n = normalizeStr(rawName);
      if (TW_PT_BLDG[n]) return TW_PT_BLDG[n];
      for (const [key, id] of Object.entries(TW_PT_BLDG)) {
        if (n.startsWith(key)) return id;
      }
      return null;
    }

    // "Ferreiro - a 13.05. às 06:33" or "05:45:30" → seconds remaining
    function parseBuildingQueueEndSec(text) {
      const s = text || "";
      // "hoje às HH:MM" — today
      const mHoje = s.match(/hoje\s+às\s+(\d{1,2}):(\d{2})/i);
      if (mHoje) {
        const t = new Date();
        t.setHours(parseInt(mHoje[1], 10), parseInt(mHoje[2], 10), 0, 0);
        return Math.max(0, Math.floor((t.getTime() - Date.now()) / 1000));
      }
      // "amanhã às HH:MM" — tomorrow
      const mAmanha = s.match(/amanhã\s+às\s+(\d{1,2}):(\d{2})/i);
      if (mAmanha) {
        const t = new Date();
        t.setDate(t.getDate() + 1);
        t.setHours(parseInt(mAmanha[1], 10), parseInt(mAmanha[2], 10), 0, 0);
        return Math.max(0, Math.floor((t.getTime() - Date.now()) / 1000));
      }
      // "a DD.MM. às HH:MM" — specific date
      const mDate = s.match(/(\d{1,2})\.(\d{1,2})\.\s*[^\d]*(\d{1,2}):(\d{2})/);
      if (mDate) {
        const now = new Date();
        const target = new Date(now.getFullYear(), parseInt(mDate[2], 10) - 1, parseInt(mDate[1], 10),
                                 parseInt(mDate[3], 10), parseInt(mDate[4], 10), 0);
        if (target.getTime() < now.getTime()) target.setFullYear(now.getFullYear() + 1);
        return Math.max(0, Math.floor((target.getTime() - now.getTime()) / 1000));
      }
      // "H:MM:SS" or "HH:MM:SS" — plain remaining duration (overview page format)
      const mDur = s.match(/\b(\d+):(\d{2}):(\d{2})\b/);
      if (mDur) {
        return parseInt(mDur[1], 10) * 3600 + parseInt(mDur[2], 10) * 60 + parseInt(mDur[3], 10);
      }
      return 0;
    }

    // Building cost table — deterministic formulas, same across all TW servers
    // Source: https://help.tribalwars.net/index.php?title=Village_Headquarters
    const TW_BUILD_COST = {
      main:       { w: 90,    s: 80,    i: 70,    f: 1.26  },
      barracks:   { w: 200,   s: 170,   i: 90,    f: 1.26  },
      stable:     { w: 270,   s: 240,   i: 260,   f: 1.26  },
      garage:     { w: 300,   s: 240,   i: 260,   f: 1.26  },
      snob:       { w: 15000, s: 25000, i: 10000, f: 1.26  },
      smith:      { w: 220,   s: 180,   i: 240,   f: 1.26  },
      place:      { w: 10,    s: 40,    i: 30,    f: 1.26  },
      statue:     { w: 220,   s: 220,   i: 220,   f: 1.0   },
      market:     { w: 100,   s: 100,   i: 100,   f: 1.26  },
      wood:       { w: 50,    s: 60,    i: 40,    f: 1.25  },
      stone:      { w: 65,    s: 50,    i: 40,    f: 1.275 },
      iron:       { w: 75,    s: 65,    i: 70,    f: 1.252 },
      farm:       { w: 45,    s: 40,    i: 30,    f: 1.3   },
      storage:    { w: 60,    s: 50,    i: 40,    f: 1.265 },
      hide:       { w: 50,    s: 60,    i: 50,    f: 1.25  },
      wall:       { w: 50,    s: 100,   i: 20,    f: 1.265 },
      watchtower: { w: 12050, s: 23750, i: 9250,  f: 1.26  },
    };
    function calcBuildingCost(buildingId, level) {
      const c = TW_BUILD_COST[buildingId];
      if (!c) return { wood: 0, stone: 0, iron: 0 };
      const m = Math.pow(c.f, level - 1);
      return { wood: Math.floor(c.w * m), stone: Math.floor(c.s * m), iron: Math.floor(c.i * m) };
    }

    function makeAmVillageUrl(extra) {
      const base = { screen: "am_village" };
      if (game_data.player.sitter > 0) base.t = game_data.player.id;
      return makeURL(Object.assign(base, extra || {}));
    }

    // Returns [{id, name}] for all templates visible on the template list page
    async function fetchTemplateList() {
      const html = await fetchWithRetry(makeAmVillageUrl({ mode: "template" }));
      const $doc = $(html);
      const seen = new Set();
      const templates = [];
      $doc.find("a[href*='template=']").each(function () {
        const m = ($(this).attr("href") || "").match(/[?&]template=(\d+)/);
        if (!m) return;
        const id = m[1];
        if (seen.has(id)) return;
        seen.add(id);
        const $row = $(this).closest("tr");
        const name = $row.find("td").first().text().replace(/\s+/g, " ").trim() || `Plan ${id}`;
        templates.push({ id, name });
      });
      console.log(`[WH Plans] template list: ${templates.length} plans`);
      return templates;
    }

    // villageId → { templateKey, templateName }
    // templateKey is either a numeric template ID string, or "n:TemplateName" (name-based fallback)
    async function fetchAmVillageTemplateMap() {
      const html = await fetchWithRetry(makeAmVillageUrl());
      const $doc = $(html);
      const result = new Map();
      const rows = $doc.find("#village_table tr.row_a, #village_table tr.row_b");
      console.log(`[WH Bulk] am_village: ${rows.length} village rows`);

      let sampleLogged = false;
      rows.each(function () {
        const $tr = $(this);

        // Village ID — from checkbox value (most reliable; avoids link href confusion)
        const vid = $tr.find("input[name='villages[]']").val() ||
                    $tr.find("span.village_anchor").attr("data-id");
        if (!vid) return;

        // Log first row for debugging
        if (!sampleLogged) {
          sampleLogged = true;
          console.log(`[WH Bulk] am_village first row HTML: ${$tr.html().replace(/\s+/g, ' ').substring(0, 600)}`);
        }

        // Template is in td index 1 (layout: 0=checkbox+village, 1=model, 2=orders, 3=status, 4=remove)
        const $tplTd = $tr.find("td").eq(1);

        // Try link with numeric template ID in href
        let templateId = null;
        $tplTd.find("a").each(function () {
          const m = ($(this).attr("href") || "").match(/[?&]template=(\d+)/);
          if (m) { templateId = m[1]; return false; }
        });

        // Template name (nbsp = no template)
        const templateName = $tplTd.text().replace(/ /g, '').trim();
        const hasTemplate = templateName.length > 0 && !/sem gest/i.test(templateName);

        if (templateId) {
          result.set(vid, { templateKey: templateId, templateName });
        } else if (hasTemplate) {
          result.set(vid, { templateKey: `n:${templateName}`, templateName });
        }
      });
      return result;
    }

    // { steps: [{buildingId, targetLevel}, ...], farmThreshold: number }
    // farmThreshold mirrors population_upgrades: free-pop % below which farm is built first
    // templateKey: numeric ID string OR "n:name" (fetch via villageId in that case)
    async function fetchTemplateSequence(templateKey, villageId) {
      let url;
      if (templateKey.startsWith("n:")) {
        if (!villageId) return { steps: [], farmThreshold: 20 };
        url = makeAmVillageUrl({ mode: "queue", village: villageId });
      } else {
        url = makeAmVillageUrl({ mode: "queue", template: templateKey });
      }
      const html = await fetchWithRetry(url);
      const $doc = $(html);

      const $popOpt = $doc.find('select[name="population_upgrades"] option[selected]');
      const farmThreshold = $popOpt.length ? (parseInt($popOpt.attr('value'), 10) || 20) : 20;

      const $items = $doc.find("#template_queue li[data-building]");
      console.log(`[WH Seq] template=${templateKey} items=${$items.length} farmThreshold=${farmThreshold} url=${url}`);
      const steps = [];
      $items.each(function () {
        const buildingId = $(this).attr("data-building");
        if (!buildingId || !TW_PT_BLDG_NAME[buildingId]) return;
        const levelText = $(this).find("span.level_absolute").text().trim();
        const lm = levelText.match(/\(N[ií]vel\s*(\d+)\)/i);
        if (!lm) return;
        const targetLevel = parseInt(lm[1], 10);
        if (targetLevel > 0) steps.push({ buildingId, targetLevel });
      });
      return { steps, farmThreshold };
    }

    // villageId → {levels: {buildingId: number}, queueEndsSec: number}
    async function fetchBuildingsOverview() {
      const base = { screen: "overview_villages", mode: "buildings", page: "-1" };
      if (game_data.player.sitter > 0) base.t = game_data.player.id;
      const html = await fetchWithRetry(makeURL(base));
      const $p = $(html);
      const result = new Map();

      $p.find("table.vis tbody tr").each(function () {
        const $tr = $(this);
        // Village ID is directly on the <tr id="v_XXXXX"> attribute
        const rowId = $tr.attr("id") || "";
        const vm = rowId.match(/^v_(\d+)$/);
        if (!vm) return;
        const vid = vm[1];

        // Building levels — each td has class "upgrade_building b_BUILDINGID"
        const levels = {};
        $tr.find("td[class*='b_']").each(function () {
          const cm = ($(this).attr("class") || "").match(/\bb_([a-z_]+)\b/);
          if (!cm || !TW_PT_BLDG_NAME[cm[1]]) return;
          const v = parseInt($(this).text().trim(), 10);
          if (!isNaN(v)) levels[cm[1]] = v;
        });

        // Queue: look up the village-specific ul by ID from the page root.
        // The HTML parser moves <ul> out of <td>/<tr> (block in table), so
        // $tr.find("ul.order_queue") returns nothing — use #building_order_VID instead.
        const $ul = $p.find(`#building_order_${vid}`);
        // Queue items: <li class="order"> each containing a .queue_icon img.
        // The img has a `title` attribute (not data-title — that is set by game JS at runtime).
        // title format: "BuildingName - hoje às HH:MM" / "amanhã às HH:MM" / "a DD.MM. às HH:MM"
        const $liItems = $ul.find("li.order");
        const queueLength = $liItems.length;
        let queueEndsSec = 0;
        const queuedLevels = {}; // buildingId → number of levels currently in queue
        if (queueLength > 0) {
          // Iterate all items: take max parsed time, collect queued building levels
          $liItems.each(function () {
            const $img = $(this).find(".queue_icon img");
            const title = $img.attr("title") || "";
            const sec = parseBuildingQueueEndSec(title);
            if (sec > queueEndsSec) queueEndsSec = sec;
            const src = $img.attr("src") || "";
            const m = src.match(/buildings\/([a-z_]+)\.webp/i);
            if (m && TW_PT_BLDG_NAME[m[1]]) queuedLevels[m[1]] = (queuedLevels[m[1]] || 0) + 1;
          });
          if (queueEndsSec === 0) {
            const titles = [];
            $liItems.each(function () { titles.push(`"${$(this).find(".queue_icon img").attr("title") || ""}"`); });
            console.log(`[WH Bulk] vid=${vid} queue time parse miss (${queueLength} items) — titles: [${titles.join(", ")}]`);
          }
        }

        result.set(vid, { levels, queueLength, queueEndsSec, queuedLevels });
      });
      console.log(`[WH Bulk] buildings overview: ${result.size} villages parsed`);
      if (result.size > 0) {
        const [firstVid, firstOv] = result.entries().next().value;
        const lvlStr = Object.entries(firstOv.levels).map(([k, v]) => `${k}=${v}`).join(', ');
        console.log(`[WH Bulk] first village vid=${firstVid}: levels { ${lvlStr} } | queue=${firstOv.queueLength} ends=${Math.round(firstOv.queueEndsSec / 60)}m`);
      }
      return result;
    }

    // Returns same Map<villageId, hqResult> shape as fetchHqNextBuilding.
    // Returns null on fetch failure so callers can fall back.
    async function fetchAllHqDataBulk(candidates, onProgress) {
      console.log(`[WH Bulk] start — ${candidates.length} candidates`);

      // Step 1: buildings overview — current levels + queue state for all villages
      let bOverview;
      try {
        if (onProgress) onProgress("Fetching buildings overview…");
        bOverview = await fetchBuildingsOverview();
      } catch (e) {
        console.log(`[WH Bulk] buildings overview fetch failed: ${e && e.status ? 'HTTP ' + e.status : String(e)} — falling back to per-village`);
        return null;
      }

      // Step 2: template assignments from am_village
      let templateMap;
      try {
        if (onProgress) onProgress("Fetching account manager…");
        templateMap = await fetchAmVillageTemplateMap();
      } catch (e) {
        console.log(`[WH Bulk] am_village fetch failed: ${e && e.status ? 'HTTP ' + e.status : String(e)} — falling back to per-village`);
        return null;
      }
      const withTemplate = [...templateMap.keys()];
      const uniqueTemplates = new Map(); // templateKey → representative villageId
      for (const [vid, val] of templateMap) {
        if (!uniqueTemplates.has(val.templateKey)) uniqueTemplates.set(val.templateKey, vid);
      }
      const uniqueTemplateKeys = [...uniqueTemplates.keys()];
      console.log(`[WH Bulk] am_village: ${withTemplate.length}/${candidates.length} villages have templates — keys: ${uniqueTemplateKeys.join(', ')}`);
      if (!templateMap.size) { console.log('[WH Bulk] no templates assigned — returning empty'); return new Map(); }

      // Step 3: build sequence per unique template — use cached plans when available
      // Index by both numeric ID ("1746") and name-based key ("n:XXX") to match either form
      const cachedPlanSeqs = (() => {
        try {
          const raw = localStorage.getItem('tm_whbalancer_plans_v1');
          if (!raw) return new Map();
          const plans = JSON.parse(raw);
          const m = new Map();
          for (const p of plans) {
            const entry = { steps: p.steps, farmThreshold: p.farmThreshold ?? 20 };
            m.set(p.id, entry);
            m.set(`n:${p.name}`, entry);
          }
          return m;
        } catch { return new Map(); }
      })();
      const templateSeqs = new Map();
      const keysToFetch = [];
      for (const tkey of uniqueTemplateKeys) {
        if (cachedPlanSeqs.has(tkey)) {
          templateSeqs.set(tkey, cachedPlanSeqs.get(tkey));
          console.log(`[WH Bulk] template "${tkey}": ${cachedPlanSeqs.get(tkey).steps.length} steps farmThreshold=${cachedPlanSeqs.get(tkey).farmThreshold} (cached)`);
        } else {
          keysToFetch.push(tkey);
        }
      }
      for (let i = 0; i < keysToFetch.length; i++) {
        const tkey = keysToFetch[i];
        const repVid = uniqueTemplates.get(tkey);
        if (onProgress) onProgress(`Fetching template ${i + 1}/${keysToFetch.length}…`);
        try {
          const { steps: seq, farmThreshold } = await fetchTemplateSequence(tkey, repVid);
          templateSeqs.set(tkey, { steps: seq, farmThreshold });
          const preview = seq.slice(0, 4).map(s => `${s.buildingId}->${s.targetLevel}`).join(', ');
          console.log(`[WH Bulk] template "${tkey}": ${seq.length} steps farmThreshold=${farmThreshold} — ${preview}${seq.length > 4 ? ', ...' : ''}`);
        } catch (e) {
          console.log(`[WH Bulk] template "${tkey}" fetch failed: ${e && e.status ? 'HTTP ' + e.status : String(e)}`);
        }
        if (i < keysToFetch.length - 1) await new Promise(r => setTimeout(r, 300));
      }

      // Step 4: next building per village — first sequence step where effective level < target
      // Effective level = completed level + levels already queued (resources already consumed)
      // Farm is inserted first when free population < farmThreshold% (mirrors population_upgrades select)
      const nextMap = new Map();
      let noTemplate = 0, noOverview = 0, noNextStep = 0;
      for (const v of candidates) {
        const vid = String(v.id);
        const tval = templateMap.get(vid);
        if (!tval) { noTemplate++; continue; }
        const seqEntry = templateSeqs.get(tval.templateKey);
        if (!seqEntry || !seqEntry.steps.length) continue;
        const overview = bOverview.get(vid);
        if (!overview) { noOverview++; continue; }

        const farmThreshold = seqEntry.farmThreshold ?? 20;
        const farmUsed = v.farmSpaceUsed ?? 0;
        const farmTot  = v.farmSpaceTotal ?? 0;
        const farmLevel = overview.levels['farm'] || 0;
        if (farmLevel < 30 && farmTot > 0 && ((farmTot - farmUsed) / farmTot) * 100 < farmThreshold) {
          nextMap.set(vid, { buildingId: 'farm', targetLevel: farmLevel + 1 });
          continue;
        }

        const qLevels = overview.queuedLevels || {};
        let found = false;
        for (const step of seqEntry.steps) {
          const effective = (overview.levels[step.buildingId] || 0) + (qLevels[step.buildingId] || 0);
          if (effective < step.targetLevel) {
            nextMap.set(vid, step); found = true; break;
          }
        }
        if (!found) noNextStep++;
      }
      console.log(`[WH Bulk] next buildings: ${nextMap.size} found | no-template=${noTemplate} no-overview=${noOverview} sequence-complete=${noNextStep}`);
      for (const [vid, next] of nextMap) {
        const ov = bOverview.get(vid);
        const completed = ov?.levels[next.buildingId] || 0;
        const inQueue   = ov?.queuedLevels?.[next.buildingId] || 0;
        const qSec = ov?.queueEndsSec || 0;
        const qLen = ov?.queueLength || 0;
        const qStr = qSec > 0 ? ` queue=${qLen}x ends=${Math.round(qSec / 60)}m` : ' queue=idle';
        console.log(`[WH Bulk]   vid=${vid}: ${next.buildingId} ${completed}+${inQueue}q->${next.targetLevel}${qStr}`);
      }

      // Step 5: assemble result — costs computed from TW_BUILD_COST formula (no HTTP)
      const result = new Map();
      for (const v of candidates) {
        const vid = String(v.id);
        const overview = bOverview.get(vid);
        if (!overview) continue;
        const next = nextMap.get(vid);
        const queueEndsSec = overview.queueEndsSec || 0;
        if (!next) {
          if (queueEndsSec > 0) result.set(vid, {
            villageId: vid, buildingName: null, buildingId: null,
            queueEndsSec, costWood: 0, costStone: 0, costIron: 0,
            prodWoodPerHr: 0, prodStonePerHr: 0, prodIronPerHr: 0,
          });
          continue;
        }
        // Cost for the immediate next single upgrade (currentLevel+1), not the template target.
        // A template step "market→20" with current level 17 means the next upgrade is 17→18.
        const completedLevel = overview.levels[next.buildingId] || 0;
        const nextSingleLevel = completedLevel + 1;
        const cost = calcBuildingCost(next.buildingId, nextSingleLevel);
        result.set(vid, {
          villageId: vid,
          buildingId: next.buildingId,
          buildingName: TW_PT_BLDG_NAME[next.buildingId] || next.buildingId,
          queueEndsSec,
          costWood: cost.wood, costStone: cost.stone, costIron: cost.iron,
          prodWoodPerHr: 0, prodStonePerHr: 0, prodIronPerHr: 0,
        });
      }
      console.log(`[WH Bulk] done — ${result.size} villages in HQ map`);
      return result;
    }

    async function fetchWithRetry(url, maxRetries = 3) {
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          return await $.get(url);
        } catch (e) {
          if (attempt < maxRetries && e && e.status === 429) {
            await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
            continue;
          }
          throw e;
        }
      }
    }

    async function fetchHqNextBuilding(villageId) {
      // Step 1: get the next building name + id from accountmanager page
      const amUrl  = makeURL({ village: villageId, screen: "main", mode: "accountmanager" });
      const amHtml = await fetchWithRetry(amUrl);
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
        fetchWithRetry(makeURL({ village: villageId, screen: "main", mode: "build" })),
        fetchWithRetry(makeURL({ village: villageId, screen: "main" })),
      ]);
      const $b    = $(buildRes);
      const $main = $(mainRes);

      // ── Queue end time (from mode=build) ──────────────────────────────────────
      // The active (lit) row has a span[data-endtime] Unix timestamp.
      // Queued (sortable_row) rows only have a plain duration span e.g. "1:09:01".
      // Strategy: start from the active row's data-endtime, then add durations of
      // each subsequent queued row to find the true end of the full queue.
      let maxEndTime = 0;

      // 1. Active row — absolute Unix timestamp
      $b.find("tr.lit span[data-endtime]").each(function () {
        const t = parseInt($(this).attr("data-endtime"), 10);
        if (!isNaN(t) && t > maxEndTime) maxEndTime = t;
      });

      // 2. Queued rows — plain HH:MM:SS durations, add to the running end time
      $b.find("tr.sortable_row").each(function () {
        const durationText = $(this).find("td.nowrap span").not("[data-endtime]").first().text().trim();
        const parts = durationText.match(/^(\d+):(\d{2}):(\d{2})$/);
        if (parts) {
          const durSec = parseInt(parts[1],10)*3600 + parseInt(parts[2],10)*60 + parseInt(parts[3],10);
          // If we have no base yet (active row had no timestamp), use now as base
          if (maxEndTime === 0) maxEndTime = Math.floor(getNowMs() / 1000);
          maxEndTime += durSec;
        }
      });

      let queueEndsSec = maxEndTime > 0
        ? Math.max(0, maxEndTime - Math.floor(getNowMs() / 1000))
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
        const ageMin = state.hqLastFetchMs ? Math.floor((getNowMs() - state.hqLastFetchMs) / 60000) : null;
        const ageStr = ageMin !== null ? ` — data from ${ageMin} min ago` : "";
        $panel.html(`<div class="twmuted">Using cached HQ data${ageStr}. <span style="color:#a40000">Press "Check HQ" to refresh.</span></div>`);
        const maxPts = state.settings.maxedOutPoints;
        saveHqData(state.hqData, state.hqLastFetchMs || getNowMs());
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
        state.hqLastFetchMs = getNowMs();
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

    function updateReactState({ running, statusText, cleanLinks, averages, byId }) {
      const prevLinks = window.TM_WH_BALANCER_STATE?.cleanLinks ?? [];
      const rawLinks  = cleanLinks ?? null;

      // Build cluster map so isCrossCluster is correct (same logic as renderRows)
      const reactClusterMap = new Map();
      const s = state?.settings;
      if (s?.useClusters && (s?.numClusters || 1) >= 2 && state?.villagesData) {
        const numClusters = s.numClusters;
        const gridSize = Math.ceil(Math.sqrt(numClusters));
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const v of state.villagesData) {
          const c = coordsFromVillageName(v.name);
          if (c) { minX = Math.min(minX, c.x); maxX = Math.max(maxX, c.x); minY = Math.min(minY, c.y); maxY = Math.max(maxY, c.y); }
        }
        const w = maxX - minX || 1, h = maxY - minY || 1;
        for (const v of state.villagesData) {
          const c = coordsFromVillageName(v.name);
          if (!c) { reactClusterMap.set(String(v.id), 0); continue; }
          const gx = Math.min(Math.floor(((c.x - minX) / w) * gridSize), gridSize - 1);
          const gy = Math.min(Math.floor(((c.y - minY) / h) * gridSize), gridSize - 1);
          reactClusterMap.set(String(v.id), (gy % Math.ceil(numClusters / gridSize)) * gridSize + gx);
        }
      }

      const mappedLinks = rawLinks
        ? rawLinks.map((l) => {
            const srcV = byId?.get(String(l.source));
            const tgtV = byId?.get(String(l.target));
            const srcCluster = reactClusterMap.get(String(l.source)) ?? -1;
            const tgtCluster = reactClusterMap.get(String(l.target)) ?? -1;
            const isCrossCluster = reactClusterMap.size > 0 && srcCluster !== tgtCluster;
            return {
              source:         srcV?.name ?? String(l.source),
              target:         tgtV?.name ?? String(l.target),
              sourceId:       String(l.source),
              targetId:       String(l.target),
              distance:       l.distance ?? 0,
              wood:           l.wood  || 0,
              stone:          l.stone || 0,
              iron:           l.iron  || 0,
              isHqBoost:      Boolean(state.hqBoostedIds?.has(String(l.target))),
              isCrossCluster,
              sourceUrl:      srcV?.url,
              targetUrl:      tgtV?.url,
            };
          })
        : prevLinks;

      const summary = (averages && rawLinks)
        ? {
            totalWood:    averages.totalWood,
            totalStone:   averages.totalStone,
            totalIron:    averages.totalIron,
            woodAverage:  averages.actualWoodAverage,
            stoneAverage: averages.actualStoneAverage,
            ironAverage:  averages.actualIronAverage,
            links:        mappedLinks.length,
            merchants:    mappedLinks.reduce((s, l) => s + Math.ceil((l.wood + l.stone + l.iron) / 1000), 0),
            avgDist:      mappedLinks.length
              ? (mappedLinks.reduce((s, l) => s + (l.distance || 0), 0) / mappedLinks.length).toFixed(1)
              : '—',
          }
        : (window.TM_WH_BALANCER_STATE?.summary ?? null);

      // Also keep on window for same-world consumers (legacy jQuery dialog)
      // Build a plain-object map for the React tooltip (Map is not serialisable via CustomEvent)
      const villageLookup = {};
      const rawById = new Map((state.rawVillagesData || []).map(r => [String(r.id), r]));
      const reserve = state?.settings?.reservePerVillage || 0;
      if (byId) {
        byId.forEach((v, id) => {
          const raw = rawById.get(id);
          villageLookup[id] = {
            wood: v.wood, stone: v.stone, iron: v.iron,
            rawWood:  raw ? raw.wood  : null,
            rawStone: raw ? raw.stone : null,
            rawIron:  raw ? raw.iron  : null,
            reserve,
            warehouseCapacity: v.warehouseCapacity,
            availableMerchants: v.availableMerchants,
            totalMerchants: v.totalMerchants,
            points: v.points,
            farmSpaceUsed: v.farmSpaceUsed ?? null,
            farmSpaceTotal: v.farmSpaceTotal ?? null,
          };
        });
      }
      const clusterMapData = (rawLinks && byId)
        ? computeClusterMapSvg(state?.villagesData || [], rawLinks)
        : (window.TM_WH_BALANCER_STATE?.clusterMap ?? null);
      const prevPpPlans = window.TM_WH_BALANCER_STATE?.ppPlans ?? [];

      // Map PP plan shipments to use village names for the React panel
      const ppPlansForReact = loadPpPlans().map(plan => {
        const srcV = id => {
          const v = state?.villagesData?.find(vv => String(vv.id) === String(id));
          return v ? { name: v.name, url: v.url } : { name: String(id), url: null };
        };
        // Compute remaining ETA from anchor
        const remainingSec = (() => {
          if (plan.lastArrivalEtaSec == null || plan.lastArrivalMsAtFetch == null) return null;
          const elapsed = Math.floor((getNowMs() - plan.lastArrivalMsAtFetch) / 1000);
          return Math.max(0, Math.floor(plan.lastArrivalEtaSec) - elapsed);
        })();
        const marketUrl = `game.php?village=${plan.targetVillageId}&screen=market&mode=other_offer`;
        return {
          id: plan.id,
          payRes: plan.payRes,
          neededRes: plan.neededRes,
          targetVillageName: plan.targetVillageName,
          targetVillageId: plan.targetVillageId,
          tradeAmount: plan.tradeAmount || 0,
          instant: plan.instant || plan.shipments.length === 0,
          marketUrl,
          remainingSec,
          lastArrivalEtaSec:   plan.lastArrivalEtaSec   ?? null,
          lastArrivalMsAtFetch: plan.lastArrivalMsAtFetch ?? null,
          shipments: plan.shipments.map(s => ({
            source: String(s.source),
            target: String(s.target),
            sourceName: srcV(s.source).name,
            targetName: srcV(s.target).name,
            sourceUrl: srcV(s.source).url,
            targetUrl: srcV(s.target).url,
            distance: s.distance || 0,
            wood: s.wood || 0,
            stone: s.stone || 0,
            iron: s.iron || 0,
          })),
        };
      });

      window.TM_WH_BALANCER_STATE = {
        running:    Boolean(running),
        statusText: statusText ?? '',
        cleanLinks: mappedLinks,
        summary,
        villageLookup,
        clusterMap: clusterMapData,
        ppPlans:    ppPlansForReact,
      };

      // Bridge to content-script world via CustomEvent on document
      // Merge previous ppPlans when running (rawLinks is null during fetch)
      if (!rawLinks) window.TM_WH_BALANCER_STATE.ppPlans = prevPpPlans;

      document.dispatchEvent(new CustomEvent('xbot:balancer:state', {
        detail: window.TM_WH_BALANCER_STATE,
      }));
    }

    // Headless run — initialises state and computes without opening the jQuery dialog.
    // Used by the React panel (BalancerView) so results appear in the side panel only.
    async function runHeadless() {
      const savedHq = loadHqData();
      state = {
        settings:      loadSettings(),
        planTimers:    new Map(),
        incomingRes:   {},
        villagesData:  [],
        averages:      null,
        cleanLinks:    [],
        hqData:        savedHq.data,
        hqBoostedIds:  new Set(),
        hqLastFetchMs: savedHq.timestamp,
        pendingSends:  state?.pendingSends || [],
        sendAllTimer:  null,
      };
      try {
        await runComputationAndRender();
      } catch (e) {
        console.error('[WH] runHeadless failed', e);
        updateReactState({ running: false, statusText: 'Error — check console' });
      }
    }

    // Headless HQ check — always fetches fresh data so queue times are accurate.
    // Uses the fast bulk approach first; falls back to per-village if bulk fails.
    async function runHqCheckHeadless() {
      if (!state || !state.villagesData || !state.villagesData.length) {
        document.dispatchEvent(new CustomEvent('xbot:balancer:hqResults', {
          detail: { error: 'Run the balancer first to load village data.' },
        }));
        return;
      }
      const maxPts    = state.settings.maxedOutPoints || 10471;
      const lowPts    = state.settings.lowPoints      || 0;
      const hqCandidates   = state.villagesData.filter(v => v.points >= lowPts && v.points < maxPts);
      const hqTotal        = hqCandidates.length;
      const hqSkippedCount = state.villagesData.length - hqTotal;
      document.dispatchEvent(new CustomEvent('xbot:balancer:hqResults', {
        detail: { loading: true, progress: 0, total: hqTotal, skipped: hqSkippedCount },
      }));
      try {
        // Step 1: try fast bulk fetch (overview + am_village, 3-4 HTTP requests total)
        let freshHqData = await fetchAllHqDataBulk(hqCandidates, (label) => {
          document.dispatchEvent(new CustomEvent('xbot:balancer:hqResults', {
            detail: { loading: true, progress: 0, total: hqTotal, skipped: hqSkippedCount },
          }));
        });

        // Step 2: fallback to per-village fetch if bulk failed
        if (!freshHqData) {
          freshHqData = new Map();
          for (let i = 0; i < hqCandidates.length; i++) {
            const v = hqCandidates[i];
            document.dispatchEvent(new CustomEvent('xbot:balancer:hqResults', {
              detail: { loading: true, progress: i + 1, total: hqTotal, skipped: hqSkippedCount },
            }));
            try {
              const hq = await fetchHqNextBuilding(v.id);
              if (hq) freshHqData.set(String(v.id), hq);
            } catch (_) { /* skip individual failures */ }
            if (i < hqCandidates.length - 1) await new Promise(res => setTimeout(res, 300));
          }
        }

        // Build results array and classify villages
        const results = [];
        const normalQueueMaxSec = (state.settings.hqNormalQueueMaxHours ?? 6) * 3600;
        for (const v of hqCandidates) {
          const hq = freshHqData.get(String(v.id));
          if (!hq) continue;
          const check = computeHqReadiness(v, hq);
          if (!check) continue;
          const isLowPtsV = v.points < lowPts;
          const overQueue = !isLowPtsV && normalQueueMaxSec > 0 && (hq.queueEndsSec || 0) > normalQueueMaxSec;
          results.push({ villageName: v.name, villageUrl: v.url, villagePoints: v.points, overQueue, ...check });
        }

        // Update cache so the next balancer Run can reuse this fresh data
        state.hqData = freshHqData;
        state.hqLastFetchMs = getNowMs();
        saveHqData(freshHqData, state.hqLastFetchMs);

        document.dispatchEvent(new CustomEvent('xbot:balancer:hqResults', {
          detail: { results, cached: false, ageMin: 0, fetchedAtMs: state.hqLastFetchMs },
        }));
      } catch (e) {
        document.dispatchEvent(new CustomEvent('xbot:balancer:hqResults', {
          detail: { error: String(e) },
        }));
      }
    }

    // Listen for commands from the content-script world (BalancerView React panel)
    document.addEventListener('xbot:balancer:run', () => {
      try { runHeadless(); } catch (e) { console.error('[WH] run() failed', e); }
    });
    document.addEventListener('xbot:balancer:hqCheck', () => {
      try { runHqCheckHeadless(); } catch (e) { console.error('[WH] hqCheck failed', e); }
    });
    document.addEventListener('xbot:balancer:send', (e) => {
      try {
        const { src, tgt, wood, stone, iron, idx } = e.detail;
        sendResource(src, tgt, wood, stone, iron, idx);
      } catch (e) { console.error('[WH] sendResource failed', e); }
    });
    document.addEventListener('xbot:balancer:clearCoordLock', (e) => {
      try { clearManualCoordLock(e.detail.coords); } catch (e) { console.error(e); }
    });

    document.addEventListener('xbot:balancer:setCoordLock', (e) => {
      try {
        const { coords, wood, stone, iron, comment } = e.detail || {};
        setManualCoordLock(coords, { wood: !!wood, stone: !!stone, iron: !!iron });
        if (comment !== undefined) setManualCoordComment(coords, comment || '');
      } catch (err) { console.error('[WH] setCoordLock failed', err); }
    });
    document.addEventListener('xbot:balancer:clearPpLocks', () => {
      try { localStorage.removeItem(PP_LOCKS_KEY); } catch (e) { console.error(e); }
    });
    document.addEventListener('xbot:balancer:cancelPlan', (e) => {
      try {
        const { planId } = e.detail || {};
        if (!planId) return;
        stopPlanTimer(planId);
        removePpPlan(planId);
        if (typeof UI !== 'undefined') UI.SuccessMessage('PP plan cancelled.');
        updateReactState({ running: false, statusText: '' });
      } catch (err) { console.error('[WH] cancelPlan failed', err); }
    });
    document.addEventListener('xbot:balancer:acceptTrade', async (e) => {
      try {
        const { planId, villageId, payRes, neededRes, tradeAmount } = e.detail || {};
        if (!planId || !villageId) return;
        await doInstantTrade(villageId, payRes, neededRes, tradeAmount);
        stopPlanTimer(planId);
        removePpPlan(planId);
        if (typeof UI !== 'undefined') UI.SuccessMessage('Instant trade executed!');
        updateReactState({ running: false, statusText: '' });
      } catch (err) {
        console.error('[WH] acceptTrade failed', err);
        if (typeof UI !== 'undefined') UI.ErrorMessage('Trade failed: ' + (err.message || err));
      }
    });
    document.addEventListener('xbot:balancer:fetchPlans', () => {
      (async () => {
        try {
          document.dispatchEvent(new CustomEvent('xbot:balancer:plansResult',
            { detail: { loading: true, progress: 0, total: 0 } }));

          const templates = await fetchTemplateList();

          document.dispatchEvent(new CustomEvent('xbot:balancer:plansResult',
            { detail: { loading: true, progress: 0, total: templates.length } }));

          const plans = [];
          for (let i = 0; i < templates.length; i++) {
            const t = templates[i];
            try {
              const { steps, farmThreshold } = await fetchTemplateSequence(t.id, null);
              plans.push({ id: t.id, name: t.name, steps, farmThreshold });
              console.log(`[WH Plans] "${t.name}" (${t.id}): ${steps.length} steps`);
            } catch (err) {
              console.warn(`[WH Plans] failed template ${t.id}:`, err);
            }
            document.dispatchEvent(new CustomEvent('xbot:balancer:plansResult',
              { detail: { loading: true, progress: i + 1, total: templates.length } }));
            if (i < templates.length - 1) await new Promise(r => setTimeout(r, 300));
          }

          localStorage.setItem('tm_whbalancer_plans_v1', JSON.stringify(plans));
          document.dispatchEvent(new CustomEvent('xbot:balancer:plansResult',
            { detail: { plans } }));
        } catch (err) {
          console.error('[WH Plans] fetchAllPlans error:', err);
          document.dispatchEvent(new CustomEvent('xbot:balancer:plansResult',
            { detail: { error: String(err) } }));
        }
      })();
    });
    // Content script polls locks/state via request/response events
    document.addEventListener('xbot:balancer:getLocks', () => {
      const ppLocksRaw = loadPpLocks();
      const ppPlansMap = new Map(loadPpPlans().map(p => [`${p.targetVillageId}:${p.payRes}`, p]));
      const ppLocksWithEta = ppLocksRaw.map(lock => {
        const plan = ppPlansMap.get(`${lock.villageId}:${lock.res}`);
        let remainingSec = null;
        if (plan && plan.lastArrivalEtaSec != null && plan.lastArrivalMsAtFetch != null) {
          const elapsed = Math.floor((getNowMs() - plan.lastArrivalMsAtFetch) / 1000);
          remainingSec = Math.max(0, Math.floor(plan.lastArrivalEtaSec) - elapsed);
        }
        const village = state?.villagesData?.find(v => String(v.id) === String(lock.villageId));
        return { ...lock, villageName: village?.name || null, remainingSec };
      });
      const rawCoordLocks = listManualCoordLocks();
      const comments = loadManualLockComments();
      // Build coords→village lookup from current villagesData
      const coordToVillage = new Map();
      for (const v of (state?.villagesData || [])) {
        const c = coordsFromVillageName(v.name);
        if (c) coordToVillage.set(`${c.x}|${c.y}`, v);
      }
      const enrichedCoordLocks = Object.entries(rawCoordLocks).map(([key, lock]) => {
        const v = coordToVillage.get(key);
        return {
          key,
          wood:  !!lock.wood,
          stone: !!lock.stone,
          iron:  !!lock.iron,
          comment: comments[key] || null,
          villageName: v?.name || null,
          villageUrl:  v?.url  || null,
        };
      });
      document.dispatchEvent(new CustomEvent('xbot:balancer:locks', {
        detail: {
          coordLocks: enrichedCoordLocks,
          ppLocks:    ppLocksWithEta,
        },
      }));
    });

    async function runComputationAndRender() {
      updateReactState({ running: true, statusText: 'Fetching…' });
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
      // Low-points villages are receivers being built up — applying the reserve to them
      // would floor their stock to 0 and artificially inflate their shortage.
      const reserve = Math.max(0, state.settings.reservePerVillage || 0);
      const lowPtsThreshold = state.settings.lowPoints || 0;
      const villagesData = reserve > 0
        ? rawVillagesData.map(v => {
            if (v.points < lowPtsThreshold) return v; // no reserve for low-pts receivers
            return {
              ...v,
              wood:  Math.max(0, v.wood  - reserve),
              stone: Math.max(0, v.stone - reserve),
              iron:  Math.max(0, v.iron  - reserve),
            };
          })
        : rawVillagesData;

      // Compute averages BEFORE applying pendingSends stock reductions.
      // pendingSends subtracts from donor stock which would lower the pool and
      // produce artificially low averages — making donors appear to have more
      // excess than they really do relative to the true account-wide average.
      const nowMs = getNowMs();
      // pendingSendsTTLHours: user-configurable minimum TTL floor.
      // Too low → sends expire before arrival, villages re-appear as donors/receivers prematurely.
      // Too high → sends linger too long, blocking re-routing of resources that have already arrived.
      const ttlFloorHours = (state?.settings?.pendingSendsTTLHours ?? 2);
      const ttlFloorMs    = Math.max(0.25, ttlFloorHours) * 3600 * 1000;

      const merchantSpeedFPH = ((typeof game_data !== "undefined" && game_data.speed) || 1) * 16;
      state.pendingSends = (state.pendingSends || []).filter(s => {
        const distFields = s.distance || 50;
        const etaMs = Math.max(ttlFloorMs, (distFields / merchantSpeedFPH) * 3600 * 1000 * 1.5);
        return nowMs - s.sentAt < etaMs;
      });

      // Averages use pre-pendingSends stock so the pool size is not distorted
      const averages = computeTotalsAndAverages(villagesData, incomingRes);

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

      const { excessResources, shortageResources, villageID } = computeExcessShortage(villagesData, incomingRes, averages);

      applyManualCoordLocks({ villagesData, excessResources, shortageResources });
      applyPpResourceLock({ villagesData, excessResources, shortageResources });

      // Diagnostic: totals after locks, before HQ priority
      wbLog("[WH] post-locks totals", {
        excess: {
          wood:  excessResources.reduce((s, e) => s + (e[0]?.wood  || 0), 0),
          stone: excessResources.reduce((s, e) => s + (e[1]?.stone || 0), 0),
          iron:  excessResources.reduce((s, e) => s + (e[2]?.iron  || 0), 0),
        },
        shortage: {
          wood:  shortageResources.reduce((s, e) => s + (e[0]?.wood  || 0), 0),
          stone: shortageResources.reduce((s, e) => s + (e[1]?.stone || 0), 0),
          iron:  shortageResources.reduce((s, e) => s + (e[2]?.iron  || 0), 0),
        },
      });

      // ==================== HQ FETCHING DECISION (Fixed Timing) ====================
      // Behavior:
      //   - If "Prioritise empty build queues" is ENABLED → fetch HQ data on THIS Run
      //     (even on first execution of the session)
      //   - If disabled → never auto-fetch
      //   - After first successful fetch → only refresh automatically if data is > 30 min old
      //   - Manual "Check HQ" button always works independently

      const isMintingMode = !!state.settings.isMinting;
      const isFirstHqRun = !state.hqLastFetchMs && (!state.hqData || state.hqData.size === 0);
      const isHqStale    = (nowMs - (state.hqLastFetchMs || 0)) > HQ_STALENESS_MS;

      // HQ staleness diagnostic — always visible (not gated by debugMode)
      if (state.settings.hqPriorityEnabled) {
        if (isFirstHqRun) {
          console.log('[WH] HQ: no cached data — will fetch fresh');
        } else if (!Number.isFinite(nowMs) || !Number.isFinite(state.hqLastFetchMs)) {
          console.warn('[WH] HQ: invalid timestamp detected — nowMs:', nowMs, 'hqLastFetchMs:', state.hqLastFetchMs, '— clearing cache');
          localStorage.removeItem('tm_whbalancer_hq_timestamp_v1');
          state.hqLastFetchMs = null;
        } else {
          const ageMs  = nowMs - state.hqLastFetchMs;
          const ageMin = Math.floor(ageMs / 60000);
          const ageSec = Math.floor((ageMs % 60000) / 1000);
          const staleIn    = Math.max(0, HQ_STALENESS_MS - ageMs);
          const staleInMin = Math.floor(staleIn / 60000);
          const staleInSec = Math.floor((staleIn % 60000) / 1000);
          console.log(
            `[WH] HQ cache age: ${ageMin}m ${ageSec}s` +
            (isHqStale
              ? ' — STALE, will re-fetch'
              : ` — fresh (stale in ${staleInMin}m ${staleInSec}s)`) +
            ` | villages cached: ${state.hqData?.size ?? 0}`
          );
        }
      }

      let shouldFetchHq = false;

      if (!isMintingMode && state.settings.hqPriorityEnabled) {
        const isFirstHqRun = !state.hqLastFetchMs && (!state.hqData || state.hqData.size === 0);
        const isHqStale    = (nowMs - (state.hqLastFetchMs || 0)) > HQ_STALENESS_MS;
        if (isFirstHqRun || isHqStale || !state.hqData || state.hqData.size === 0) {
          shouldFetchHq = true;
        }
      }

      let hqData = state.hqData || null;

      if (shouldFetchHq) {
        const maxPts = state.settings.maxedOutPoints || 10471;
        const lowPts = state.settings.lowPoints || 0;
        const hqCandidates = villagesData.filter(v => v.points >= lowPts && v.points < maxPts);
        const hqSkipped    = villagesData.length - hqCandidates.length;

        const onHqProgress = (msg) => {
          const label = hqSkipped > 0 ? `${msg} (${hqSkipped} maxed skipped)` : msg;
          $("#tmwh_summary").text(`HQ: ${label}`);
          updateReactState({ running: true, statusText: `HQ: ${label}` });
        };

        // Try the fast bulk approach first (3 bulk fetches + N_unique_cost fetches)
        const bulkResult = await fetchAllHqDataBulk(hqCandidates, onHqProgress);

        if (bulkResult !== null) {
          hqData = bulkResult;
        } else {
          // Fallback: sequential per-village (old approach)
          hqData = new Map();
          for (let i = 0; i < hqCandidates.length; i++) {
            const v = hqCandidates[i];
            onHqProgress(`${i + 1}/${hqCandidates.length}`);
            try {
              const hq = await fetchHqNextBuilding(v.id);
              if (hq?.villageId) hqData.set(hq.villageId, hq);
            } catch (e) {
              console.warn(`HQ fetch failed for village ${v.id}`, e);
            }
            if (i < hqCandidates.length - 1) await new Promise(r => setTimeout(r, 300));
          }
        }

        state.hqData = hqData;
        state.hqLastFetchMs = nowMs;
        saveHqData(hqData, nowMs);
      }

      if (state.settings.hqPriorityEnabled && hqData && hqData.size > 0) {
        applyHqBuildPriority({ villagesData, excessResources, shortageResources, incomingRes, hqData, averages });
      }

      // Diagnostic: log total excess and shortage per resource entering the link builder
      wbGroup("[WH] pre-assign totals");
      console.log("excess totals", {
        wood:  excessResources.reduce((s, e) => s + (e[0]?.wood  || 0), 0),
        stone: excessResources.reduce((s, e) => s + (e[1]?.stone || 0), 0),
        iron:  excessResources.reduce((s, e) => s + (e[2]?.iron  || 0), 0),
      });
      console.log("shortage totals", {
        wood:  shortageResources.reduce((s, e) => s + (e[0]?.wood  || 0), 0),
        stone: shortageResources.reduce((s, e) => s + (e[1]?.stone || 0), 0),
        iron:  shortageResources.reduce((s, e) => s + (e[2]?.iron  || 0), 0),
      });
      excessResources.forEach((e, i) => {
        const w = e[0]?.wood || 0, s = e[1]?.stone || 0, ir = e[2]?.iron || 0;
        if (w + s + ir > 0) console.log(`  donor ${villagesData[i]?.name}: W=${w} S=${s} I=${ir}`);
      });
      console.groupEnd();
      const { links } = assignMerchantsAndBuildLinks(villagesData, excessResources, shortageResources, villageID, isMintingMode);
      let cleanLinks = removeCircularRoutes(addDistanceToLinks(normalizeAndCombineLinks(links), villagesData));

      // Clustering is now handled inside assignMerchantsAndBuildLinks (intra-cluster donors first).
      // The post-hoc applyClustering() re-sort is no longer needed.

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
      state.rawVillagesData = rawVillagesData;
      state.averages = averages;
      state.cleanLinks = cleanLinks;

      renderSummary(averages);
      renderRows(cleanLinks);
      renderClusterMap(villagesData, cleanLinks);
      renderManualCoordLockList();
      const _byId = new Map(villagesData.map(v => [String(v.id), v]));
      updateReactState({ running: false, statusText: '', cleanLinks, averages, byId: _byId });

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

    return {
      sendResource: sendResource,
      listPpPlans: () => loadPpPlans(),
      listPpLocks: () => loadPpLocks(),
      setManualCoordLock: (coords, lockObj) => setManualCoordLock(coords, lockObj),
      clearManualCoordLock: (coords) => clearManualCoordLock(coords),
      listManualCoordLocks: () => listManualCoordLocks()
    };
  })();
})();

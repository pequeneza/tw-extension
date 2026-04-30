// ==UserScript==
// @name         TribalWars Fakes
// @namespace    tribalwars Fakes
// @version      5.5
// @description  Smart fake sender (runs + per-village/per-target caps + target plan w/ auto-reset on new coords)
// @match        *://*.tribalwars.com.pt/*screen=place*
// @match        *://*.tribalwars.com.pt/*screen=place&try=confirm*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function () {

const SETTINGS_KEY = "fake_sender_settings_v1";
const CONFIG_KEY = "fake_sender_config_v1";
const PENDING_SWITCH_KEY = "fake_pending_switch_village_v1";

/* ---------------- RUNS / STORAGE KEYS ---------------- */

const RUN_ID_KEY = "fake_run_id_v1";

// persistent across runs (plan only)
const TARGET_PLAN_KEY = "fake_target_plan_v1";

// NEW: coords fingerprint to detect changes (adding/removing coords)
const COORDS_FINGERPRINT_KEY = "fake_coords_fingerprint_v1";

var tempAllExcessCombined, tempMaxMerchantsNeeded, tempPercWood, tempPercStone, tempPercIron;
var htmlCode;

// per-run (counters only)
function getRunId(){
    let id = localStorage.getItem(RUN_ID_KEY);
    if(!id){
        id = String(Date.now());
        localStorage.setItem(RUN_ID_KEY, id);
    }
    return id;
}
function setNewRunId(){
    const id = String(Date.now());
    localStorage.setItem(RUN_ID_KEY, id);
    return id;
}
function runKey(base){
    return `${base}__run_${getRunId()}`;
}
function villageCountStorageKey(){ return runKey("fake_sent_by_village_v1"); }
function targetSentStorageKey(){ return runKey("fake_target_sent_v1"); }

/* ---------------- DEFAULTS ---------------- */

const DEFAULT_CONFIG = {
    attackDelay: 3500,
    attackRandom: 2500,
    confirmDelay: 800,
    confirmRandom: 800,
    switchDelay: 8500,
    switchRandom: 3500,

    // max fakes per village (per run)
    fakesPerVillage: 10,

    // per target caps & plan probability (plan persists, but auto-reset when coords list changes)
    maxAttacksPerCoord: 2,     // hard cap any coord can receive
    multiHitAttacks: 2,        // N attacks for "lucky" coords
    multiHitChance: 20,        // percent chance a coord is chosen to have N attacks

    arrivalStart: "08:01",
    arrivalEnd: "22:58",
    stopAtEnd: true,
    coords: `493|591 492|591 494|590 491|592 490|592 489|593 487|592 486|593 486|594 487|593 487|594 488|595 486|596 488|597 488|598 488|599 488|601 487|601 485|602 486|602 490|599 489|600 483|601 484|599 482|600 482|601 481|601 480|602 485|599 482|599 482|598 481|597 482|596 482|595 481|595 480|595 480|596 480|594 481|593 482|592 483|592 478|593 478|592 478|597 478|601 478|598 475|602 476|603 477|604 483|603 476|596 476|595 476|593 476|594 475|593 474|595 473|595 473|596 473|597 476|591 477|590 477|589 476|589 475|589 476|588 477|588 477|587 478|589 478|591 480|588 482|589 483|589 482|591 476|585 475|585 477|586 479|585 474|584 480|584 480|583 479|583 482|586 484|586 485|587 484|590 486|589 490|588 486|584 485|584 487|583 482|582 484|582 481|581 490|583 490|582 491|581 487|581 486|581 486|582 485|579 485|578 484|578 483|578 482|579 481|579 481|580 483|579 482|578 482|577 480|578 480|577 479|579 479|581 478|581 477|581 477|582 477|579 493|577 494|578 493|578 493|576 496|576 496|577 496|575 499|574 494|575 491|575 491|576 490|576 490|575 490|574 491|573 491|571 492|571 490|571 489|570 489|572 487|572 488|577 489|577 489|578 488|578 492|577 490|578 487|573 485|574 483|575 482|575 481|576 480|576 479|576 491|578 489|576 485|572 495|566 494|566 489|567 488|567 490|568 488|568 488|583 493|583 491|584 484|581 483|582 491|600 475|581 475|580 473|581 471|582 476|578 476|575`
};

const DEFAULT_SETTINGS = {
    maxCatapults: 1,
    maxScouts: 20,
    maxInfantry: 35,
    maxCavalry: 999
};

/* ---------------- LOAD/SAVE ---------------- */

function safeParse(raw, fallback){
    try { return JSON.parse(raw); } catch { return fallback; }
}

// ── Suite config integration ─────────────────────────────────────────────────
// getXBotCfg() reads the live mirror written by FakeSenderView on every save,
// falling back to the page-load snapshot. This means config changes made in the
// overlay take effect on the next cycle — no page refresh needed.
const SS_LIVE_CFG = 'xbot_live_cfg_fakes';
function getXBotCfg() {
    try {
        const live = sessionStorage.getItem(SS_LIVE_CFG);
        if (live) return JSON.parse(live);
    } catch {}
    // Fallback: page-load snapshot (stale after config changes, but safe)
    return (typeof window.__twSuiteCfg === 'function')
        ? window.__twSuiteCfg('fakes')
        : {};
}
// ─────────────────────────────────────────────────────────────────────────────

function loadSettings(){
    const raw = localStorage.getItem(SETTINGS_KEY);
    const cfg = getXBotCfg();
    const suiteOverride = {};
    if (cfg.maxCatapults !== undefined) suiteOverride.maxCatapults = Number(cfg.maxCatapults);
    if (cfg.maxScouts    !== undefined) suiteOverride.maxScouts    = Number(cfg.maxScouts);
    if (cfg.maxInfantry  !== undefined) suiteOverride.maxInfantry  = Number(cfg.maxInfantry);
    if (cfg.maxCavalry   !== undefined) suiteOverride.maxCavalry   = Number(cfg.maxCavalry);
    return {...DEFAULT_SETTINGS, ...(raw ? safeParse(raw, {}) : {}), ...suiteOverride};
}
function saveSettings(s){ localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); }

function loadConfig(){
    const raw = localStorage.getItem(CONFIG_KEY);
    const cfg = getXBotCfg();
    const suiteOverride = {};
    const numFields = ['attackDelay','attackRandom','confirmDelay','confirmRandom',
                        'switchDelay','switchRandom','fakesPerVillage','maxAttacksPerCoord',
                        'multiHitAttacks','multiHitChance'];
    for (const k of numFields) {
        if (cfg[k] !== undefined) suiteOverride[k] = Number(cfg[k]);
    }
    if (cfg.arrivalStart !== undefined) suiteOverride.arrivalStart = String(cfg.arrivalStart);
    if (cfg.arrivalEnd   !== undefined) suiteOverride.arrivalEnd   = String(cfg.arrivalEnd);
    if (cfg.stopAtEnd    !== undefined) suiteOverride.stopAtEnd    = Boolean(cfg.stopAtEnd);
    if (cfg.coords && String(cfg.coords).trim()) suiteOverride.coords = String(cfg.coords);
    return {...DEFAULT_CONFIG, ...(raw ? safeParse(raw, {}) : {}), ...suiteOverride};
}
function saveConfig(c){ localStorage.setItem(CONFIG_KEY, JSON.stringify(c)); }

let SETTINGS = loadSettings();
let CONFIG = loadConfig();

/* ---------------- COORDS CHANGE DETECTION (AUTO RESET PLAN + AUTO NEW RUN) ---------------- */

function normalizeCoordsForFingerprint(coordsArr){
    // normalize: unique + valid coord format + sorted
    const set = new Set();
    for(const c of coordsArr){
        const s = String(c || "").trim();
        if(/^\d{1,3}\|\d{1,3}$/.test(s)) set.add(s);
    }
    return Array.from(set).sort();
}

function fingerprintFromCoords(coordsArr){
    // simple deterministic fingerprint; no crypto needed
    return normalizeCoordsForFingerprint(coordsArr).join(" ");
}

function maybeResetPlanAndStartNewRunOnCoordsChange(){
    const coordsArr = getCoordsFromConfigRaw(CONFIG.coords);
    const fp = fingerprintFromCoords(coordsArr);

    const lastFp = localStorage.getItem(COORDS_FINGERPRINT_KEY);

    // first ever fingerprint => just store it (no reset)
    if(!lastFp){
        localStorage.setItem(COORDS_FINGERPRINT_KEY, fp);
        return;
    }

    if(lastFp !== fp){
        // coords changed (added/removed/replaced) => reset plan and start a new run automatically
        console.warn("[FAKE] Coords changed -> resetting target plan and starting new run");
        localStorage.setItem(COORDS_FINGERPRINT_KEY, fp);

        // reset target plan
        localStorage.removeItem(TARGET_PLAN_KEY);

        // start new run (resets per-run counters via new runId)
        const id = setNewRunId();

        // reset index + session stats
        setIndex(0);
        sessionStorage.setItem("fake_sent", "0");
        sessionStorage.removeItem("fake_pending_target");

        // we do NOT touch troop caps/settings/config

        // toast/log might not exist yet; safe to console + reload
        console.info("[FAKE] New run started due to coords change. runId=", id);

        // reload to guarantee all keys use the new runId and plan is rebuilt cleanly
        setTimeout(()=>location.reload(), 50);
    }
}

// helper: parse coords string without using CONFIG inside getCoords() (since we need it early too)
function getCoordsFromConfigRaw(coordsRaw){
    return String(coordsRaw || "").trim().split(/\s+/).filter(Boolean);
}

/* ---------------- PER-RUN COUNTERS (VILLAGE/TARGET) ---------------- */

function villageKey() {
    const id = game_data?.village?.id;
    return id ? `id:${id}` : `coord:${game_data?.village?.coord || "unknown"}`;
}

function loadVillageCounts() {
    return safeParse(localStorage.getItem(villageCountStorageKey()) || "{}", {});
}
function saveVillageCounts(map) {
    localStorage.setItem(villageCountStorageKey(), JSON.stringify(map));
}
function getSentFromVillage() {
    const map = loadVillageCounts();
    return map[villageKey()] || 0;
}
function incSentForVillage() {
    const map = loadVillageCounts();
    const key = villageKey();
    map[key] = (map[key] || 0) + 1;
    saveVillageCounts(map);
    return map[key];
}

function loadTargetSent(){
    return safeParse(localStorage.getItem(targetSentStorageKey()) || "{}", {});
}
function saveTargetSent(map){
    localStorage.setItem(targetSentStorageKey(), JSON.stringify(map));
}
function getTargetSent(coord){
    const sent = loadTargetSent();
    return sent[String(coord)] || 0;
}
function incTargetSent(coord){
    coord = String(coord || "").trim();
    const sent = loadTargetSent();
    sent[coord] = (sent[coord] || 0) + 1;
    saveTargetSent(sent);
    return sent[coord];
}

/* ---------------- TARGET PLAN (PERSISTENT; AUTO RESET ON COORDS CHANGE) ---------------- */

function loadTargetPlan(){
    return safeParse(localStorage.getItem(TARGET_PLAN_KEY) || "{}", {});
}
function saveTargetPlan(map){
    localStorage.setItem(TARGET_PLAN_KEY, JSON.stringify(map));
}

function clampInt(v, min, max, fallback){
    const n = parseInt(v, 10);
    if(!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, n));
}

function ensureTargetPlanned(coord){
    coord = String(coord || "").trim();
    if(!coord) return { planned: 1 };

    const plan = loadTargetPlan();
    if(!plan[coord]) plan[coord] = {};

    // Decide planned hits only once per coord (persistent).
    if(!plan[coord].initialized){
        const chance = clampInt(CONFIG.multiHitChance, 0, 100, DEFAULT_CONFIG.multiHitChance);
        const N = clampInt(CONFIG.multiHitAttacks, 1, 999, DEFAULT_CONFIG.multiHitAttacks);
        const maxPer = clampInt(CONFIG.maxAttacksPerCoord, 1, 999, DEFAULT_CONFIG.maxAttacksPerCoord);

        const roll = Math.random() * 100;
        const planned = (roll < chance) ? N : 1;

        plan[coord].planned = Math.min(planned, maxPer);
        plan[coord].initialized = true;

        saveTargetPlan(plan);
    }

    return { planned: clampInt(plan[coord].planned, 1, 999, 1) };
}

function canSendToTarget(coord){
    coord = String(coord || "").trim();
    if(!coord) return false;

    const maxPer = clampInt(CONFIG.maxAttacksPerCoord, 1, 999, DEFAULT_CONFIG.maxAttacksPerCoord);
    const planned = Math.min(ensureTargetPlanned(coord).planned, maxPer);
    const sent = getTargetSent(coord);

    return sent < planned && sent < maxPer;
}

function findNextEligibleTarget(coords, startIndex, currentVillageCoord){
    let idx = startIndex;

    for(let i=0; i<coords.length; i++){
        if(idx >= coords.length){
            if(CONFIG.stopAtEnd) return { idx: coords.length, target: null };
            idx = 0;
        }

        const target = coords[idx];

        if(!isTargetAvailable(target, currentVillageCoord)){
            idx++;
            continue;
        }

        if(!canSendToTarget(target)){
            idx++;
            continue;
        }

        return { idx, target };
    }

    return { idx: coords.length, target: null };
}

/* ---------------- PENDING SWITCH FLAG ---------------- */

function setPendingSwitchVillage(val){
    sessionStorage.setItem(PENDING_SWITCH_KEY, val ? "1" : "0");
}
function isPendingSwitchVillage(){
    return sessionStorage.getItem(PENDING_SWITCH_KEY) === "1";
}


/* ---------------- UI BRIDGE (overlay reads sessionStorage) --------------- */
// uiLog writes entries for FakeSenderView's Status tab to poll.
// Values are mirrored to localStorage so they persist across tab sessions.
// uiToast and uiRenderMeta are no-ops — the overlay handles all display.

const LS_LOG_PERSIST    = "fake_ui_log_v1";
const LS_SENT_PERSIST   = "fake_sent_v1";
const LS_TOTAL_PERSIST  = "fake_total_coords_v1";
const LS_PENDING_PERSIST = "fake_pending_target_v1";

function uiLog(message, level = "info") {
    const ts = new Date().toLocaleTimeString();
    let entries = [];
    try { entries = JSON.parse(sessionStorage.getItem("fake_ui_log") || "[]"); } catch {}
    entries.unshift({ ts, message, level });
    const trimmed = entries.slice(0, 50);
    const raw = JSON.stringify(trimmed);
    sessionStorage.setItem("fake_ui_log", raw);
    // persist so overlay can show log after a page reload / new tab
    try { localStorage.setItem(LS_LOG_PERSIST, raw); } catch {}
}

function uiToast() {}   // no-op

function isPaused() {
    return sessionStorage.getItem("fake_paused") === "1";
}

/** Returns a short village label for log prefixes, e.g. "Lisbon (491|592)" */
function vLabel() {
    const name  = game_data?.village?.name  || "?";
    const coord = game_data?.village?.coord || "?|?";
    return `${name} (${coord})`;
}


/* ---------------- CORE UTILITIES ---------------- */

function isConfirmPage(){
    // If the rally point unit inputs are present, this is definitely the rally
    // point — even if try=confirm is still in the URL from a previous navigation.
    if(document.querySelector("input.unitsInput")) return false;

    if(!location.href.includes("try=confirm")) return false;
    return !!(
        document.getElementById("troop_confirm_submit") ||
        document.querySelector('input[name="submit_confirm"]') ||
        document.querySelector('button[name="submit_confirm"]') ||
        document.querySelector(".troop_confirm_go") ||
        document.querySelector("#command-data-form")
    );
}

function isArrivalAllowed(arrivalDate){
    const [startH,startM] = CONFIG.arrivalStart.split(":").map(Number);
    const [endH,endM] = CONFIG.arrivalEnd.split(":").map(Number);

    const start = new Date(arrivalDate);
    start.setHours(startH,startM,0,0);

    const end = new Date(arrivalDate);
    end.setHours(endH,endM,0,0);

    return arrivalDate >= start && arrivalDate <= end;
}

function randomDelay(base, variation) {
    return base + Math.floor(Math.random() * variation * 2) - variation;
}

function num(str) {
    if (!str) return 0;
    str = String(str).replace(/[^0-9]/g,'');
    return parseInt(str,10) || 0;
}

function getCookie(name) {
    const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
    return match ? parseInt(match[2],10) : 0;
}

function setCookie(name,val) {
    const d = new Date();
    d.setFullYear(d.getFullYear()+10);
    document.cookie = `${name}=${val};expires=${d.toUTCString()};path=/`;
}

function currentIndex(){ return getCookie("fake_index") || 0; }
function setIndex(i){ setCookie("fake_index",i); }

function getCoords(){
    return String(CONFIG.coords || "").trim().split(/\s+/).filter(Boolean);
}

function getArrivalTime(){
    const arrivalNode =
        document.querySelector("#arrival_time") ||
        document.querySelector(".arrival_time") ||
        document.querySelector("#date_arrival");

    if(!arrivalNode) return null;

    const text = arrivalNode.textContent.trim();

    // Match HH:MM:SS optionally followed by AM/PM (with optional space)
    const match = text.match(/(\d{1,2}):(\d{2}):(\d{2})\s*(am|pm)?/i);
    if(!match) return null;

    let hours   = parseInt(match[1], 10);
    const mins  = parseInt(match[2], 10);
    const secs  = parseInt(match[3], 10);
    const ampm  = (match[4] || "").toLowerCase();

    // Convert 12-hour to 24-hour if AM/PM marker is present
    if(ampm === "am") {
        if(hours === 12) hours = 0;          // 12:xx AM -> 00:xx
    } else if(ampm === "pm") {
        if(hours !== 12) hours += 12;        // 1–11 PM -> 13–23
    }

    const now = new Date();
    const arrival = new Date(now);
    arrival.setHours(hours, mins, secs, 0);

    // If the computed arrival is more than 1 minute in the past it must be
    // rolling over midnight — add one day so the window comparison is correct.
    if(arrival.getTime() < now.getTime() - 60_000) {
        arrival.setDate(arrival.getDate() + 1);
    }

    return arrival;
}

function showPopup(msg){
    sessionStorage.setItem("fake_popup", msg);
    uiLog(msg, "info");
}

/* ---------------- NEW HELPERS FOR TARGET/VILLAGE FLOW ---------------- */

function isTargetAvailable(target, currentVillageCoord){
    if(!/^\d{1,3}\|\d{1,3}$/.test(String(target||""))) return false;
    if(currentVillageCoord && String(target) === String(currentVillageCoord)) return false;
    return true;
}

/* ---------------- VILLAGE POINTS ---------------- */

async function getCurrentVillagePoints() {
    let url = "game.php?screen=overview_villages&mode=prod&page=-1";
    if (game_data.player.sitter > 0)
        url = `game.php?t=${game_data.player.id}&screen=overview_villages&mode=prod&page=-1`;

    try {
        const html = await (await fetch(url, {credentials:'include'})).text();
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const currentVillageId = game_data.village.id;

        for (const row of doc.querySelectorAll('#production_table tr, table.vis tr')) {
            const link = row.querySelector('.quickedit-vn a, a[href*="info_village"]');
            if (!link) continue;

            const id = link.href.match(/village=(\d+)/)?.[1];
            if (!id) continue;

            if (parseInt(id,10) === currentVillageId) {
                const points = num(row.querySelector('td:nth-child(3), .points')?.textContent);
                console.info("[FAKE] Village points detected:", points);
                uiLog(`[${vLabel()}] Village points: ${points}`, "info");
                return points || 0;
            }
        }
    } catch (e) {
        console.error("[FAKE] Error reading village points:", e);
        uiLog(`[${vLabel()}] Error reading village points: ${e?.message || e}`, "err");
        uiToast("Error reading village points", "err");
    }
    return 0;
}

/* ---------------- TROOPS ---------------- */

function getUnitAvailable(unit){
    const input =
        document.getElementById(`unit_input_${unit}`) ||
        document.querySelector(`input[name="${unit}"]`);

    if(!input) return 0;

    if(input.dataset?.allCount)
        return num(input.dataset.allCount);

    const link = document.getElementById(`units_entry_all_${unit}`);
    if(link) return num(link.textContent);

    return 0;
}

function getAvailablePopulation(){
    const popValues = {
        spear:1, sword:1, axe:1, archer:1,
        spy:2,
        light:4, marcher:4, heavy:6,
        ram:5, catapult:8
    };

    let total = 0;
    for(const unit in popValues){
        total += getUnitAvailable(unit) * popValues[unit];
    }

    console.info("[FAKE] Available population:",total);
    uiLog(`[${vLabel()}] Available population: ${total}`, "info");
    return total;
}

/* ---------------- FAKE TROOP BUILDER ---------------- */

function calculateFakeTroops(requiredPop){
    const troops = {};
    let popUsed = 0;
    let infantryUsed = 0;
    let cavalryUsed = 0;

    // SETTINGS already reloaded at cycle() start
    const scoutsCap = Math.max(0, SETTINGS.maxScouts|0);
    const maxInf = Math.max(0, SETTINGS.maxInfantry|0);
    const maxCav = Math.max(0, SETTINGS.maxCavalry|0);
    const siegeCap = Math.max(0, SETTINGS.maxCatapults|0);

    const scouts = Math.min(scoutsCap, getUnitAvailable("spy"));
    if(scouts === 0){
        console.warn("[FAKE] No scouts available");
        uiToast("No scouts available", "warn");
        uiLog(`[${vLabel()}] No scouts available`, "warn");
        return null;
    }
    troops.spy = scouts;
    popUsed += scouts*2;

    // Catapult first, fallback to ram (both capped)
    if(siegeCap > 0 && getUnitAvailable("catapult") > 0){
        troops.catapult = 1;
        popUsed += 8;
    } else if(siegeCap > 0 && getUnitAvailable("ram") > 0){
        troops.ram = 1;
        popUsed += 5;
    } else {
        console.warn("[FAKE] No catapult or ram available (or siege cap is 0)");
        uiToast("No catapult/ram (or siege cap is 0)", "warn");
        uiLog(`[${vLabel()}] No catapult/ram (or siege cap is 0)`, "warn");
        return null;
    }

    const fillers = [
        {unit:"spear", pop:1, group:"inf"},
        {unit:"sword", pop:1, group:"inf"},
        {unit:"axe", pop:1, group:"inf"},
        {unit:"light", pop:4, group:"cav"},
        {unit:"heavy", pop:6, group:"cav"}
    ];

    for(const f of fillers){
        let available = getUnitAvailable(f.unit);
        while(available > 0 && popUsed + f.pop <= requiredPop){
            if(f.group === "inf" && infantryUsed >= maxInf) break;
            if(f.group === "cav" && cavalryUsed >= maxCav) break;

            troops[f.unit] = (troops[f.unit]||0)+1;
            popUsed += f.pop;

            if(f.group === "inf") infantryUsed++;
            if(f.group === "cav") cavalryUsed++;

            available--;
        }
        if(popUsed >= requiredPop) break;
    }

    // Optional extra siege within cap (keep adding siege once infantry/cav caps hit)
    if (popUsed < requiredPop && siegeCap > 1) {
        while (popUsed < requiredPop) {
            const usedSiege = (troops.catapult || 0) + (troops.ram || 0);
            if (usedSiege >= siegeCap) break;

            const catsAvail = getUnitAvailable("catapult");
            const ramsAvail = getUnitAvailable("ram");

            const catsUsed = troops.catapult || 0;
            const ramsUsed = troops.ram || 0;

            if (catsAvail > catsUsed) {
                troops.catapult = catsUsed + 1;
                popUsed += 8;
                continue;
            }
            if (ramsAvail > ramsUsed) {
                troops.ram = ramsUsed + 1;
                popUsed += 5;
                continue;
            }
            break;
        }
    }

    if (popUsed < requiredPop) {
        console.warn("[FAKE] Cannot reach required population within caps", {requiredPop, popUsed, SETTINGS});
        uiToast(`Cannot reach requiredPop (${popUsed}/${requiredPop}) within caps -> switching village`, "err");
        uiLog(`[${vLabel()}] Cannot reach requiredPop (${popUsed}/${requiredPop}) — switching`, "err");
        return null;
    }

    return Object.keys(troops).length ? troops : null;
}

function fillTroops(troops){
    for(const unit in troops){
        // Use the same selector getUnitAvailable uses — id="unit_input_{unit}"
        // is reliable; form[unit] fails when field name differs from unit key.
        const input =
            document.getElementById(`unit_input_${unit}`) ||
            document.querySelector(`input[name="${unit}"]`);

        if(!input) continue;

        input.value = troops[unit];
        // Fire events so the game's own listeners register the new value
        input.dispatchEvent(new Event("input",  { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
    }

    console.info("[FAKE] Troops filled");
    uiLog(`[${vLabel()}] Troops filled`, "info");
}

/* ---------------- OUTGOING ---------------- */

function countOutgoingAttacksForThisVillage() {
    const container = document.getElementById("commands_outgoings");
    if (!container) return 0;

    // Count commands by unique command id, but ONLY when the row contains the small-attack icon.
    // This avoids counting spy icons and avoids counting "return" commands.
    const rows = container.querySelectorAll("tr.command-row");
    const ids = new Set();

    for (const row of rows) {
        // detect "attack" by the icon image in your HTML snippet
        const attackIcon = row.querySelector('img[src*="graphic/command/attack_small"]');
        if (!attackIcon) continue;

        // grab command id (present on the span in your snippet)
        const el = row.querySelector(".command_hover_details[data-command-id]");
        const id = el?.getAttribute("data-command-id");
        if (id) ids.add(id);
    }

    return ids.size;
}

/* ---------------- VILLAGE SWITCH ---------------- */

function switchVillage(){
    console.warn("[FAKE] Switching village");
    uiToast("Switching village…", "warn");
    uiLog(`[${vLabel()}] Switching village`, "warn");

    setTimeout(()=>{
        const btn =
            document.getElementById("village_switch_right") ||
            document.querySelector(".arrow_right");
        if(btn) btn.click();
    },randomDelay(CONFIG.switchDelay,CONFIG.switchRandom));
}

/* ---------------- SEND FAKE (UPDATED) ---------------- */

function sendFake(){
    if (isPaused()) {
        uiToast("Paused – sendFake() blocked", "warn");
        uiLog(`[${vLabel()}] Paused – sendFake() blocked`, "warn");
        return;
    }
    if(isConfirmPage()){

        function clickConfirmButton(){
            const confirmBtn =
                document.getElementById("troop_confirm_submit") ||
                document.querySelector('button[name="submit_confirm"]') ||
                document.querySelector('input[name="submit_confirm"]') ||
                document.querySelector(".btn-confirm-yes") ||
                document.querySelector(".troop_confirm_go");

            if(!confirmBtn) return false;

            const arrival = getArrivalTime();

            if(arrival && !isArrivalAllowed(arrival)){
                console.warn("[FAKE] Arrival outside allowed window:", arrival.toLocaleTimeString());
                uiToast("Arrival outside allowed window -> skipping target", "warn");
                uiLog(`[${vLabel()}] Arrival outside window: ${arrival.toLocaleTimeString()} — advancing index and switching village`, "warn");

                // Advance index so this target is skipped, not retried in a tight loop
                const nextIdx = parseInt(sessionStorage.getItem("fake_pending_index") || "0", 10);
                setIndex(nextIdx);
                sessionStorage.removeItem("fake_pending_index");

                // Clear stale pending target so the next village's cycle writes
                // its own fresh coords into form.x/y before clicking attack.
                sessionStorage.removeItem("fake_pending_target");
                localStorage.removeItem("fake_pending_target_v1");

                showPopup("Arrival outside time window, skipping target");

                // Switch village so the next village tries a fresh target
                switchVillage();

                return true;
            }

            console.info("[FAKE] Clicking CONFIRM");
            showPopup("Fake attack sent!");
            uiLog(`[${vLabel()}] Clicking CONFIRM`, "info");

            setTimeout(()=>{
                setPendingSwitchVillage(true);

                // click first
                confirmBtn.click();

                // Increment sent counter only now — after timing check passed
                const sent = parseInt(sessionStorage.getItem("fake_sent") || "0", 10) + 1;
                sessionStorage.setItem("fake_sent", String(sent));
                try { localStorage.setItem(LS_SENT_PERSIST, String(sent)); } catch {}
                uiLog(`[${vLabel()}] ⚔ Sent → ${sessionStorage.getItem("fake_pending_target") || "-"}`, "info");

                // Commit index advance now that the attack is confirmed
                const nextIdx = parseInt(sessionStorage.getItem("fake_pending_index") || "0", 10);
                setIndex(nextIdx);
                sessionStorage.removeItem("fake_pending_index");

                // increment per-run counters (village + target sent)
                const pendingTarget = sessionStorage.getItem("fake_pending_target") || "-";
                const vNow = incSentForVillage();
                const tNow = pendingTarget !== "-" ? incTargetSent(pendingTarget) : 0;
                const planned = pendingTarget !== "-" ? ensureTargetPlanned(pendingTarget).planned : 0;

                uiLog(`[${vLabel()}] Confirmed → ${pendingTarget} (${vNow}/${Math.max(1,parseInt(CONFIG.fakesPerVillage,10)||1)} here, target ${tNow}/${planned})`, "info");
                uiLog(`[${vLabel()}] Attack confirmed`, "info");
            }, randomDelay(CONFIG.confirmDelay, CONFIG.confirmRandom));

            return true;
        }

        const interval = setInterval(()=>{
            if(clickConfirmButton()) clearInterval(interval);
        }, 300);

        return;
    }

    // RALLY POINT PAGE
    // 1. Troops are already filled by fillTroops() in main().
    // 2. Type the coord into the autocomplete input — the game resolves the village
    //    itself when Atacar is clicked; selecting the dropdown is not required.
    // 3. Click Atacar.
    const coordInput = document.querySelector(
        '.target-input-field.target-input-autocomplete,' +
        '.target-input-autocomplete,' +
        'input.ui-autocomplete-input[id*="target"],' +
        'input.ui-autocomplete-input'
    );

    const attackBtn = document.querySelector(
        '#target_attack,' +
        'input[type="submit"][value*="Atac"],' +
        'input[type="submit"][value*="Attack"],' +
        'button[value*="Atac"]'
    );

    if (!coordInput) {
        uiLog(`[${vLabel()}] Coord autocomplete input not found`, "err");
        uiToast("Coord input not found", "err");
        return;
    }
    if (!attackBtn) {
        uiLog(`[${vLabel()}] Attack button not found`, "err");
        uiToast("Attack button not found", "err");
        return;
    }

    setTimeout(()=>{
        const pendingTarget = sessionStorage.getItem("fake_pending_target") || "";
        if (!pendingTarget || pendingTarget === "-") {
            uiLog(`[${vLabel()}] No pending target — aborting`, "err");
            return;
        }

        // Type the coord into the autocomplete field character by character,
        // firing keyboard/input events so the game's autocomplete listener tracks it.
        coordInput.focus();
        coordInput.value = pendingTarget;
        ["input", "change", "keyup"].forEach(evt =>
            coordInput.dispatchEvent(new Event(evt, { bubbles: true }))
        );

        console.info("[FAKE] Coord set to:", pendingTarget);
        uiLog(`[${vLabel()}] Clicking ATTACK → confirmation`, "info");
        showPopup("Proceeding to confirmation…");

        setPendingSwitchVillage(false);
        attackBtn.click();
    }, randomDelay(CONFIG.attackDelay, CONFIG.attackRandom));
}

/* ---------------- MAIN ---------------- */


async function main(){
    // after successful confirm -> switch village now (1 fake per village per visit)
    if(!isConfirmPage() && isPendingSwitchVillage()){
        setPendingSwitchVillage(false);
        uiLog(`[${vLabel()}] ✓ Sent — switching village`, "info");
        switchVillage();
        return;
    }

    if(isPaused()){
        uiLog(`[${vLabel()}] Paused`, "warn");
        return;
    }

    console.group("[FAKE] Cycle start");

    await new Promise(r=>setTimeout(r,1200));

    const form = document.forms[0];
    if(!form){
        console.warn("[FAKE] No form found");
        uiToast("No form found", "warn");
        uiLog(`[${vLabel()}] No form found`, "warn");
        return;
    }
    
    const perVillageCap = Math.max(1, parseInt(CONFIG.fakesPerVillage, 10) || 1);
    const sentHere = getSentFromVillage();
    if(sentHere >= perVillageCap){
        uiToast(`Village cap reached (${sentHere}/${perVillageCap}) -> switching village`, "warn");
        uiLog(`[${vLabel()}] Cap reached (${sentHere}/${perVillageCap}) — switching`, "warn");
        switchVillage();
        return;
    }

    const outgoingAttacksNow = countOutgoingAttacksForThisVillage();
    if (outgoingAttacksNow >= perVillageCap) {
        uiToast(`Outgoing attacks cap reached (${outgoingAttacksNow}/${perVillageCap}) -> switching village`, "warn");
        uiLog(`[${vLabel()}] Outgoing cap (${outgoingAttacksNow}/${perVillageCap}) — switching`, "warn");
        switchVillage();
        return;
    }

    const points = await getCurrentVillagePoints();
    if(points < 100){
        console.warn("[FAKE] Could not read points");
        uiToast("Could not read points - switching village", "warn");
        uiLog(`[${vLabel()}] Could not read points — switching`, "warn");
        switchVillage();
        return;
    }

    const requiredPop = Math.ceil(points * 2 /100);
    uiLog(`[${vLabel()}] pts=${points} reqPop=${requiredPop}`, "info");

    const availablePop = getAvailablePopulation();
    if(availablePop < requiredPop){
        console.warn("[FAKE] Not enough troops");
        uiToast("Not enough troops - switching village", "warn");
        uiLog(`[${vLabel()}] Not enough troops — switching`, "warn");
        switchVillage();
        return;
    }

    const troops = calculateFakeTroops(requiredPop);
    if(!troops){
        uiToast("Cannot build fake troops - switching village", "warn");
        uiLog(`[${vLabel()}] Cannot build troops — switching`, "warn");
        switchVillage();
        return;
    }

    fillTroops(troops);

    const coords = getCoords();
    // Keep total fresh for overlay progress bar
    sessionStorage.setItem("fake_total_coords", String(coords.length));
    try { localStorage.setItem(LS_TOTAL_PERSIST, String(coords.length)); } catch {};
    let index = currentIndex();

    if(index >= coords.length){
        if(CONFIG.stopAtEnd){
            console.info("[FAKE] All targets used");
            uiToast("All targets used (stopAtEnd)", "ok");
            uiLog(`[${vLabel()}] All targets used (stopAtEnd)`, "info");
            return;
        }
        index = 0;
        setIndex(0);
    }

    const currentVillageCoord = game_data?.village?.coord;

    // pick next eligible target respecting per-target caps and plan
    const pick = findNextEligibleTarget(coords, index, currentVillageCoord);
    if(!pick.target){
        uiToast("No eligible targets left (caps reached)", "ok");
        uiLog(`[${vLabel()}] No eligible targets left`, "info");
        return;
    }

    const target = pick.target;
    index = pick.idx;

    console.info("[FAKE] Target:", target);

    // Store target for the confirm page — counters are only incremented there,
    // after the arrival window check passes and the attack is actually confirmed.
    sessionStorage.setItem("fake_pending_target", target || "-");
    try { localStorage.setItem(LS_PENDING_PERSIST, target || "-"); } catch {}

    // Store the would-be next index so the confirm page can commit it on success.
    // Index is NOT advanced here — if the arrival window check fails on the
    // confirm page we skip this target and switch village.
    sessionStorage.setItem("fake_pending_index", String(index + 1));

    sendFake();

    setTimeout(()=>console.groupEnd(), 1500);
}

/* ---------------- FETCH-BASED ENGINE ---------------- */

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function villageKeyById(id) { return `id:${id}`; }
function getSentFromVillage_id(id) {
    const map = loadVillageCounts();
    return map[villageKeyById(id)] || 0;
}
function incSentForVillage_id(id) {
    const map = loadVillageCounts();
    const key = villageKeyById(id);
    map[key] = (map[key] || 0) + 1;
    saveVillageCounts(map);
    return map[key];
}

async function fetchAllVillages() {
    // Fast path: game_data.player.villages is often pre-populated by TW
    const gv = game_data?.player?.villages;
    if (gv) {
        const arr = Array.isArray(gv) ? gv : Object.values(gv);
        const villages = arr
            .map(v => {
                const idRaw = v.id ?? v.villageId ?? v.village_id;
                const id = idRaw ? parseInt(idRaw, 10) : 0;
                const coord = v.coord
                    || (v.x != null && v.y != null ? `${v.x}|${v.y}` : null);
                const points = v.points ? parseInt(v.points, 10) : 0;
                return { id, coord, points };
            })
            .filter(v => v.id && v.coord);
        if (villages.length) {
            uiLog(`Villages from game_data: ${villages.length}`, 'info');
            return villages;
        }
    }

    // Fallback: parse overview HTML (try multiple mode URLs)
    const base = game_data.player.sitter > 0
        ? `game.php?t=${game_data.player.id}&screen=overview_villages`
        : `game.php?screen=overview_villages`;
    const urls = [
        `${base}&mode=prod&page=-1`,
        `${base}&mode=combined&page=-1`,
        `${base}&page=-1`,
    ];

    for (const url of urls) {
        try {
            const html = await (await fetch(url, { credentials: 'include' })).text();
            const doc = new DOMParser().parseFromString(html, 'text/html');
            const villages = [];
            const seen = new Set();

            for (const row of doc.querySelectorAll('tr')) {
                // Accept any in-cell link whose href contains village=<number>
                const link = row.querySelector('td a[href*="village="]');
                if (!link) continue;
                const idMatch = link.href.match(/[?&]village=(\d+)/);
                if (!idMatch) continue;
                const id = parseInt(idMatch[1], 10);
                if (!id || seen.has(id)) continue;
                seen.add(id);

                const coordMatch = row.textContent.match(/(\d{1,3})\|(\d{1,3})/);
                if (!coordMatch) continue;
                const coord = `${coordMatch[1]}|${coordMatch[2]}`;

                const points = num(
                    row.querySelector('.points')?.textContent ||
                    row.querySelector('td:nth-child(3)')?.textContent
                );
                villages.push({ id, coord, points: points || 0 });
            }

            if (villages.length) {
                uiLog(`Villages from ${url}: ${villages.length}`, 'info');
                return villages;
            }
        } catch (e) {
            uiLog(`fetchAllVillages (${url}): ${e?.message || e}`, 'warn');
        }
    }

    return [];
}

async function fetchVillagePoints(villageId) {
    // Used when fetchAllVillages couldn't determine a village's points.
    // Reuses the same overview URL that getCurrentVillagePoints() relies on.
    const base = game_data.player.sitter > 0
        ? `game.php?t=${game_data.player.id}&screen=overview_villages`
        : `game.php?screen=overview_villages`;
    try {
        const html = await (await fetch(`${base}&mode=prod&page=-1`, { credentials: 'include' })).text();
        const doc = new DOMParser().parseFromString(html, 'text/html');
        for (const row of doc.querySelectorAll('tr')) {
            const link = row.querySelector('td a[href*="village="]');
            if (!link) continue;
            const m = link.href.match(/[?&]village=(\d+)/);
            if (!m || parseInt(m[1], 10) !== villageId) continue;
            return num(
                row.querySelector('.points')?.textContent ||
                row.querySelector('td:nth-child(3)')?.textContent
            ) || 0;
        }
    } catch {}
    return 0;
}

async function fetchRallyPointData(villageId) {
    const url = `/game.php?village=${villageId}&screen=place`;
    const html = await (await fetch(url, { credentials: 'include' })).text();
    const doc = new DOMParser().parseFromString(html, 'text/html');

    const ALL_UNITS = ['spear','sword','axe','archer','spy','light','marcher','heavy','ram','catapult','snob','knight'];
    const available = {};
    for (const unit of ALL_UNITS) {
        const allLink = doc.getElementById(`units_entry_all_${unit}`);
        if (allLink) {
            available[unit] = num(allLink.textContent);
        } else {
            const input = doc.getElementById(`unit_input_${unit}`) || doc.querySelector(`input[name="${unit}"]`);
            available[unit] = input?.dataset?.allCount ? num(input.dataset.allCount) : 0;
        }
    }

    const hiddenInputs = {};
    doc.querySelectorAll('input[type="hidden"]').forEach(inp => {
        if (inp.name) hiddenInputs[inp.name] = inp.value || '';
    });

    const form = doc.querySelector('form');
    const formAction = form?.getAttribute('action') || url;

    let outgoing = 0;
    const outgoingContainer = doc.getElementById("commands_outgoings");
    if (outgoingContainer) {
        const ids = new Set();
        for (const row of outgoingContainer.querySelectorAll("tr.command-row")) {
            const attackIcon = row.querySelector('img[src*="graphic/command/attack_small"]');
            if (!attackIcon) continue;
            const el = row.querySelector(".command_hover_details[data-command-id]");
            const id = el?.getAttribute("data-command-id");
            if (id) ids.add(id);
        }
        outgoing = ids.size;
    }

    return { available, hiddenInputs, formAction, outgoing };
}

function getAvailablePopFrom(available) {
    const popValues = { spear:1, sword:1, axe:1, archer:1, spy:2, light:4, marcher:4, heavy:6, ram:5, catapult:8 };
    let total = 0;
    for (const unit in popValues) total += (available[unit] || 0) * popValues[unit];
    return total;
}

function calculateFakeTroopsFrom(available, requiredPop) {
    const troops = {};
    let popUsed = 0, infantryUsed = 0, cavalryUsed = 0;

    const scoutsCap = Math.max(0, SETTINGS.maxScouts | 0);
    const maxInf    = Math.max(0, SETTINGS.maxInfantry | 0);
    const maxCav    = Math.max(0, SETTINGS.maxCavalry | 0);
    const siegeCap  = Math.max(0, SETTINGS.maxCatapults | 0);

    const scouts = Math.min(scoutsCap, available.spy || 0);
    if (scouts === 0) return null;
    troops.spy = scouts;
    popUsed += scouts * 2;

    if (siegeCap > 0 && (available.catapult || 0) > 0) {
        troops.catapult = 1; popUsed += 8;
    } else if (siegeCap > 0 && (available.ram || 0) > 0) {
        troops.ram = 1; popUsed += 5;
    } else {
        return null;
    }

    const fillers = [
        { unit: "spear", pop: 1, group: "inf" },
        { unit: "sword", pop: 1, group: "inf" },
        { unit: "axe",   pop: 1, group: "inf" },
        { unit: "light", pop: 4, group: "cav" },
        { unit: "heavy", pop: 6, group: "cav" }
    ];

    for (const f of fillers) {
        let avail = available[f.unit] || 0;
        while (avail > 0 && popUsed + f.pop <= requiredPop) {
            if (f.group === "inf" && infantryUsed >= maxInf) break;
            if (f.group === "cav" && cavalryUsed >= maxCav) break;
            troops[f.unit] = (troops[f.unit] || 0) + 1;
            popUsed += f.pop;
            if (f.group === "inf") infantryUsed++;
            if (f.group === "cav") cavalryUsed++;
            avail--;
        }
        if (popUsed >= requiredPop) break;
    }

    if (siegeCap > 1 && popUsed < requiredPop) {
        while (popUsed < requiredPop) {
            const usedSiege = (troops.catapult || 0) + (troops.ram || 0);
            if (usedSiege >= siegeCap) break;
            const catsUsed = troops.catapult || 0, ramsUsed = troops.ram || 0;
            if ((available.catapult || 0) > catsUsed) { troops.catapult = catsUsed + 1; popUsed += 8; continue; }
            if ((available.ram      || 0) > ramsUsed)  { troops.ram      = ramsUsed + 1; popUsed += 5; continue; }
            break;
        }
    }

    if (popUsed < requiredPop) return null;
    return Object.keys(troops).length ? troops : null;
}

function parseArrivalFromDoc(doc) {
    const node = doc.querySelector("#arrival_time, .arrival_time, #date_arrival");
    if (!node) return null;
    const match = node.textContent.trim().match(/(\d{1,2}):(\d{2}):(\d{2})\s*(am|pm)?/i);
    if (!match) return null;
    let h = parseInt(match[1], 10);
    const m = parseInt(match[2], 10), s = parseInt(match[3], 10);
    const ampm = (match[4] || "").toLowerCase();
    if (ampm === "am" && h === 12) h = 0;
    else if (ampm === "pm" && h !== 12) h += 12;
    const now = new Date();
    const arrival = new Date(now);
    arrival.setHours(h, m, s, 0);
    if (arrival.getTime() < now.getTime() - 60_000) arrival.setDate(arrival.getDate() + 1);
    return arrival;
}

async function sendFakeViaFetch(villageId, target, troops, rallyData) {
    const [tx, ty] = target.split('|').map(Number);
    const { hiddenInputs, formAction } = rallyData;

    // Build attack POST: all hidden inputs from the form + target coords + units
    const body1 = new URLSearchParams();
    for (const [k, v] of Object.entries(hiddenInputs)) body1.set(k, v);
    body1.set('x', String(tx));
    body1.set('y', String(ty));
    body1.set('attack', '1');
    for (const [unit, amount] of Object.entries(troops)) body1.set(unit, String(amount));

    const resp1 = await fetch(formAction, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body1.toString()
    });
    if (!resp1.ok) return { success: false, skip: false, msg: `Attack POST ${resp1.status}` };

    const html1 = await resp1.text();
    const doc1 = new DOMParser().parseFromString(html1, 'text/html');

    // Locate confirmation form
    const confirmForm =
        doc1.getElementById('command-data-form') ||
        doc1.querySelector('form[action*="try=confirm"]') ||
        doc1.querySelector('form');
    if (!confirmForm) return { success: false, skip: false, msg: 'No confirmation form in response' };

    // Check arrival window before committing
    const arrival = parseArrivalFromDoc(doc1);
    if (arrival && !isArrivalAllowed(arrival)) {
        return { success: false, skip: true, msg: `Arrival outside window: ${arrival.toLocaleTimeString()}`, arrival };
    }

    // Collect all inputs from the confirmation form, then add submit trigger
    const body2 = new URLSearchParams();
    for (const input of confirmForm.querySelectorAll('input')) {
        if (input.name) body2.set(input.name, input.value || '');
    }
    body2.set('submit_confirm', '1');

    await sleep(randomDelay(CONFIG.confirmDelay, CONFIG.confirmRandom));

    const confirmAction =
        confirmForm.getAttribute('action') ||
        `/game.php?village=${villageId}&screen=place&try=confirm`;
    const resp2 = await fetch(confirmAction, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body2.toString()
    });
    if (!resp2.ok) return { success: false, skip: false, msg: `Confirm POST ${resp2.status}` };

    return { success: true, msg: 'Sent', arrival };
}

async function runFetchLoop() {
    uiLog('Fetch loop starting…', 'info');

    let villages = [];
    try {
        villages = await fetchAllVillages();
    } catch (e) {
        uiLog(`fetchAllVillages error: ${e?.message || e}`, 'err');
        return;
    }
    if (!villages.length) { uiLog('No villages found', 'err'); return; }
    uiLog(`Found ${villages.length} village(s)`, 'info');
    updateScreenLockStatus(`Found ${villages.length} village(s) — scanning targets…`);

    while (true) {
        if (isPaused()) { updateScreenLockStatus('Cancelled'); await sleep(500); break; }

        CONFIG   = loadConfig();
        SETTINGS = loadSettings();

        const coords = getCoords();
        sessionStorage.setItem("fake_total_coords", String(coords.length));
        try { localStorage.setItem(LS_TOTAL_PERSIST, String(coords.length)); } catch {}

        let index = currentIndex();
        if (index >= coords.length) {
            if (CONFIG.stopAtEnd) { uiLog('All targets used (stopAtEnd)', 'info'); updateScreenLockStatus('All targets used — done'); break; }
            index = 0; setIndex(0);
        }

        const perVillageCap = Math.max(1, parseInt(CONFIG.fakesPerVillage, 10) || 1);
        let anyAttempted = false;

        for (const village of villages) {
            if (isPaused()) break;

            // Re-read index each village iteration so prior sends affect it
            index = currentIndex();
            if (index >= coords.length) {
                if (CONFIG.stopAtEnd) break;
                index = 0; setIndex(0);
            }

            const sentHere = getSentFromVillage_id(village.id);
            if (sentHere >= perVillageCap) continue;

            const pick = findNextEligibleTarget(coords, index, village.coord);
            if (!pick.target) { uiLog('No eligible targets left', 'info'); return; }

            anyAttempted = true;

            let rallyData;
            try {
                rallyData = await fetchRallyPointData(village.id);
            } catch (e) {
                uiLog(`[${village.coord}] Rally fetch error: ${e?.message || e}`, 'err');
                continue;
            }

            const { available, outgoing } = rallyData;

            if (outgoing >= perVillageCap) {
                uiLog(`[${village.coord}] Outgoing cap (${outgoing}/${perVillageCap}) — skipping`, 'warn');
                continue;
            }

            if (village.points < 100) {
                uiLog(`[${village.coord}] Points too low — skipping`, 'warn');
                continue;
            }

            const requiredPop = Math.ceil(village.points * 2 / 100);
            const availPop = getAvailablePopFrom(available);
            if (availPop < requiredPop) {
                uiLog(`[${village.coord}] Not enough troops (${availPop}/${requiredPop}) — skipping`, 'warn');
                continue;
            }

            const troops = calculateFakeTroopsFrom(available, requiredPop);
            if (!troops) {
                uiLog(`[${village.coord}] Cannot build troops — skipping`, 'warn');
                continue;
            }

            uiLog(`[${village.coord}] Sending fake → ${pick.target}`, 'info');
            updateScreenLockStatus(`[${village.coord}] → ${pick.target}`);
            await sleep(randomDelay(CONFIG.attackDelay, CONFIG.attackRandom));

            let result;
            try {
                result = await sendFakeViaFetch(village.id, pick.target, troops, rallyData);
            } catch (e) {
                uiLog(`[${village.coord}] Send error: ${e?.message || e}`, 'err');
                continue;
            }

            if (result.success) {
                setIndex(pick.idx + 1);
                const vNow = incSentForVillage_id(village.id);
                const tNow = incTargetSent(pick.target);
                const planned = ensureTargetPlanned(pick.target).planned;
                const sentTotal = parseInt(sessionStorage.getItem("fake_sent") || "0", 10) + 1;
                sessionStorage.setItem("fake_sent", String(sentTotal));
                try { localStorage.setItem(LS_SENT_PERSIST, String(sentTotal)); } catch {}
                uiLog(`[${village.coord}] ⚔ → ${pick.target} (vil ${vNow}/${perVillageCap}, tgt ${tNow}/${planned})`, 'info');
                updateScreenLockStatus(`⚔ Sent ${pick.target} — ${vNow}/${perVillageCap} from ${village.coord}`);
                await sleep(randomDelay(CONFIG.switchDelay, CONFIG.switchRandom));
            } else if (result.skip) {
                uiLog(`[${village.coord}] Skip → ${result.msg}`, 'warn');
                setIndex(pick.idx + 1);
            } else {
                uiLog(`[${village.coord}] Failed → ${result.msg}`, 'err');
            }
        }

        if (!anyAttempted) { uiLog('All villages at cap — done', 'info'); updateScreenLockStatus('All villages at cap — done'); break; }
        await sleep(2000);
    }
}

/* ---------------- SCREEN LOCK OVERLAY ---------------- */

let _lockEl = null;
let _lockStatusEl = null;

function showScreenLock() {
    if (_lockEl) return;
    sessionStorage.removeItem('fake_paused');

    const el = document.createElement('div');
    el.id = '__fake_lock__';
    el.style.cssText = `
        position:fixed;inset:0;z-index:999999;
        background:rgba(0,0,0,0.5);
        backdrop-filter:blur(5px);-webkit-backdrop-filter:blur(5px);
        display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;
        font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
    `;
    el.innerHTML = `
        <style>
            @keyframes __fspin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
            #__fake_lock_cancel:hover:not(:disabled){opacity:.85}
            #__fake_lock_cancel:disabled{opacity:.5;cursor:default}
        </style>
        <div style="font-size:52px;line-height:1;animation:__fspin 1.4s linear infinite;
            filter:drop-shadow(0 0 14px rgba(255,200,50,.8))">⚔️</div>
        <div id="__fake_lock_status" style="
            color:#fff;font-size:14px;font-weight:500;
            text-shadow:0 1px 4px rgba(0,0,0,.6);
            max-width:320px;text-align:center;min-height:20px;
        ">Starting…</div>
        <button id="__fake_lock_cancel" style="
            padding:8px 26px;background:#dc2626;color:#fff;
            border:none;border-radius:7px;font-size:13px;font-weight:600;
            cursor:pointer;transition:opacity .15s;
            box-shadow:0 2px 10px rgba(0,0,0,.35);
        ">Cancel</button>
    `;

    el.querySelector('#__fake_lock_cancel').addEventListener('click', () => {
        sessionStorage.setItem('fake_paused', '1');
        const btn = el.querySelector('#__fake_lock_cancel');
        btn.textContent = 'Cancelling…';
        btn.disabled = true;
        updateScreenLockStatus('Cancelling — finishing current send…');
    });

    document.body.appendChild(el);
    _lockEl = el;
    _lockStatusEl = el.querySelector('#__fake_lock_status');
}

function hideScreenLock() {
    _lockEl?.remove();
    _lockEl = null;
    _lockStatusEl = null;
}

function updateScreenLockStatus(msg) {
    if (_lockStatusEl) _lockStatusEl.textContent = msg;
}

/* ---------------- START ---------------- */

console.info("[FAKE] Script loaded – version 7.1 (fetch mode + screen lock)");

maybeResetPlanAndStartNewRunOnCoordsChange();

sessionStorage.setItem("fake_total_coords", String(getCoords().length));
try { localStorage.setItem(LS_TOTAL_PERSIST, String(getCoords().length)); } catch {}

if (location.href.includes("screen=place") && !location.href.includes("try=confirm")) {
    console.info("[FAKE] Rally point detected — starting fetch loop");
    showScreenLock();
    runFetchLoop()
        .catch(e => {
            console.error("[FAKE] runFetchLoop fatal error:", e);
            uiLog(`Fatal error: ${e?.message || e}`, "err");
            updateScreenLockStatus(`Error: ${e?.message || e}`);
        })
        .finally(() => hideScreenLock());
}

})();
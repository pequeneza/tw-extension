// ==UserScript==
// @name         TribalWars Attack Generator
// @namespace    tribalwars Attack Generator
// @version      1.0
// @description  Generates arbitrary attack commands (fake / custom / send-all / siege presets) either sent immediately in sequence or queued into the Autosender for precision landing times.
// @match        *://*.tribalwars.com.pt/*screen=place*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function () {

const SETTINGS_KEY = "attackgen_settings_v1";
const CONFIG_KEY = "attackgen_config_v1";

/* ---------------- RUNS / STORAGE KEYS ---------------- */

const RUN_ID_KEY = "attackgen_run_id_v1";
const TARGET_PLAN_KEY = "attackgen_target_plan_v1";
const COORDS_FINGERPRINT_KEY = "attackgen_coords_fingerprint_v1";
const WORLD_DATA_KEY = "attackgen_world_data_v1";
const WORLD_DATA_TTL_MS = 6 * 60 * 60 * 1000;

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
function villageCountStorageKey(){ return runKey("attackgen_sent_by_village_v1"); }
function targetSentStorageKey(){ return runKey("attackgen_target_sent_v1"); }

/* ---------------- DEFAULTS ---------------- */

const DEFAULT_CONFIG = {
    attackDelay: 3500,
    attackRandom: 2500,
    confirmDelay: 800,
    confirmRandom: 800,
    switchDelay: 8500,
    switchRandom: 3500,

    attacksPerVillage: 10,
    maxAttacksPerCoord: 2,
    multiHitAttacks: 2,
    multiHitChance: 20,

    arrivalStart: "08:01",
    arrivalEnd: "22:58",
    stopAtEnd: true,
    coords: "",

    // troop generation
    attackType: "fake",        // fake | custom | send_all | ram_then_catapult | catapult_then_ram
    customUnits: {},           // { unit: count } — used when attackType === "custom"
    garrisonReservePct: 0,     // used when attackType === "send_all"

    // target sourcing
    targetMode: "manual",      // manual | auto
    autoPlayers: "",
    autoTribes: "",
    autoContinents: "",
    autoMinPoints: 0,
    autoMaxPoints: 999999,
    autoMinX: 0,
    autoMaxX: 999,
    autoMinY: 0,
    autoMaxY: 999,

    // execution
    executionMode: "sequential", // sequential | timed
    timedArrivalMode: "asap",    // asap | target_time
    timedTargetArrival: "",      // "HH:MM"
};

const DEFAULT_SETTINGS = {
    maxCatapults: 1,
    maxRams: 1,
    maxScouts: 20,
    maxInfantry: 35,
    maxCavalry: 999
};

/* ---------------- LOAD/SAVE ---------------- */

function safeParse(raw, fallback){
    try { return JSON.parse(raw); } catch { return fallback; }
}

const SS_LIVE_CFG = 'xbot_live_cfg_attack_generator';
function getXBotCfg() {
    try {
        const live = sessionStorage.getItem(SS_LIVE_CFG);
        if (live) return JSON.parse(live);
    } catch {}
    return (typeof window.__twSuiteCfg === 'function')
        ? window.__twSuiteCfg('attack_generator')
        : {};
}

function loadSettings(){
    const raw = localStorage.getItem(SETTINGS_KEY);
    const cfg = getXBotCfg();
    const suiteOverride = {};
    if (cfg.maxCatapults !== undefined) suiteOverride.maxCatapults = Number(cfg.maxCatapults);
    if (cfg.maxRams      !== undefined) suiteOverride.maxRams      = Number(cfg.maxRams);
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
                        'switchDelay','switchRandom','attacksPerVillage','maxAttacksPerCoord',
                        'multiHitAttacks','multiHitChance','garrisonReservePct',
                        'autoMinPoints','autoMaxPoints','autoMinX','autoMaxX','autoMinY','autoMaxY'];
    for (const k of numFields) {
        if (cfg[k] !== undefined) suiteOverride[k] = Number(cfg[k]);
    }
    const strFields = ['arrivalStart','arrivalEnd','coords','attackType','targetMode',
                        'autoPlayers','autoTribes','autoContinents','executionMode',
                        'timedArrivalMode','timedTargetArrival'];
    for (const k of strFields) {
        if (cfg[k] !== undefined) suiteOverride[k] = String(cfg[k]);
    }
    if (cfg.stopAtEnd !== undefined) suiteOverride.stopAtEnd = Boolean(cfg.stopAtEnd);
    if (cfg.customUnits !== undefined) {
        suiteOverride.customUnits = typeof cfg.customUnits === 'string'
            ? safeParse(cfg.customUnits, {})
            : cfg.customUnits;
    }
    return {...DEFAULT_CONFIG, ...(raw ? safeParse(raw, {}) : {}), ...suiteOverride};
}
function saveConfig(c){ localStorage.setItem(CONFIG_KEY, JSON.stringify(c)); }

let SETTINGS = loadSettings();
let CONFIG = loadConfig();

/* ---------------- COORDS CHANGE DETECTION ---------------- */

function normalizeCoordsForFingerprint(coordsArr){
    const set = new Set();
    for(const c of coordsArr){
        const s = String(c || "").trim();
        if(/^\d{1,3}\|\d{1,3}$/.test(s)) set.add(s);
    }
    return Array.from(set).sort();
}

function fingerprintFromCoords(coordsArr){
    return normalizeCoordsForFingerprint(coordsArr).join(" ");
}

function maybeResetPlanAndStartNewRunOnCoordsChange(){
    const coordsArr = getCoordsFromConfigRaw(CONFIG.coords);
    const fp = fingerprintFromCoords(coordsArr);

    const lastFp = localStorage.getItem(COORDS_FINGERPRINT_KEY);

    if(!lastFp){
        localStorage.setItem(COORDS_FINGERPRINT_KEY, fp);
        return;
    }

    if(lastFp !== fp){
        console.warn("[ATKGEN] Coords changed -> resetting target plan and starting new run");
        localStorage.setItem(COORDS_FINGERPRINT_KEY, fp);
        localStorage.removeItem(TARGET_PLAN_KEY);

        const id = setNewRunId();

        setIndex(0);
        sessionStorage.setItem("attackgen_sent", "0");
        sessionStorage.removeItem("attackgen_pending_target");

        console.info("[ATKGEN] New run started due to coords change. runId=", id);
        setTimeout(()=>location.reload(), 50);
    }
}

function getCoordsFromConfigRaw(coordsRaw){
    return String(coordsRaw || "").trim().split(/\s+/).filter(Boolean);
}

/* ---------------- PER-RUN COUNTERS (VILLAGE/TARGET) ---------------- */

function loadVillageCounts() {
    return safeParse(localStorage.getItem(villageCountStorageKey()) || "{}", {});
}
function saveVillageCounts(map) {
    localStorage.setItem(villageCountStorageKey(), JSON.stringify(map));
}
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

function isTargetAvailable(target, currentVillageCoord){
    if(!/^\d{1,3}\|\d{1,3}$/.test(String(target||""))) return false;
    if(currentVillageCoord && String(target) === String(currentVillageCoord)) return false;
    return true;
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

/* ---------------- UI BRIDGE (overlay reads sessionStorage) --------------- */

const LS_LOG_PERSIST     = "attackgen_ui_log_v1";
const LS_SENT_PERSIST    = "attackgen_sent_v1";
const LS_TOTAL_PERSIST   = "attackgen_total_coords_v1";
const LS_PENDING_PERSIST = "attackgen_pending_target_v1";

function uiLog(message, level = "info") {
    const ts = new Date().toLocaleTimeString();
    let entries = [];
    try { entries = JSON.parse(sessionStorage.getItem("attackgen_ui_log") || "[]"); } catch {}
    entries.unshift({ ts, message, level });
    const trimmed = entries.slice(0, 50);
    const raw = JSON.stringify(trimmed);
    sessionStorage.setItem("attackgen_ui_log", raw);
    try { localStorage.setItem(LS_LOG_PERSIST, raw); } catch {}
}

function isPaused() {
    return sessionStorage.getItem("attackgen_paused") === "1";
}

/* ---------------- CORE UTILITIES ---------------- */

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

function currentIndex(){ return getCookie("attackgen_index") || 0; }
function setIndex(i){ setCookie("attackgen_index",i); }

function getCoords(){
    return String(CONFIG.coords || "").trim().split(/\s+/).filter(Boolean);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/* ---------------- VILLAGES / RALLY POINT (fetch-based) ---------------- */

async function fetchAllVillages() {
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

/* ---------------- TROOP BUILDERS (pluggable) ---------------- */

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

const COMBAT_UNITS = ['spear','sword','axe','archer','spy','light','marcher','heavy','ram','catapult'];

function buildCustomTroops(available) {
    const custom = CONFIG.customUnits || {};
    const troops = {};
    let any = false;
    for (const unit in custom) {
        const want = Math.max(0, parseInt(custom[unit], 10) || 0);
        if (want <= 0) continue;
        const have = available[unit] || 0;
        if (have < want) return null; // not enough of a required unit -> skip this target
        troops[unit] = want;
        any = true;
    }
    return any ? troops : null;
}

function buildSendAllTroops(available) {
    const reservePct = Math.max(0, Math.min(100, Number(CONFIG.garrisonReservePct) || 0));
    const troops = {};
    let any = false;
    for (const unit of COMBAT_UNITS) {
        const have = available[unit] || 0;
        if (have <= 0) continue;
        const send = Math.floor(have * (1 - reservePct / 100));
        if (send > 0) { troops[unit] = send; any = true; }
    }
    return any ? troops : null;
}

function buildSiegePreset(available, primary, secondary) {
    const caps = {
        ram: Math.max(0, SETTINGS.maxRams | 0),
        catapult: Math.max(0, SETTINGS.maxCatapults | 0),
    };
    const troops = {};
    let any = false;

    const primaryCount = Math.min(caps[primary] || 0, available[primary] || 0);
    if (primaryCount > 0) { troops[primary] = primaryCount; any = true; }

    const secondaryCount = Math.min(caps[secondary] || 0, available[secondary] || 0);
    if (secondaryCount > 0) { troops[secondary] = secondaryCount; any = true; }

    const scouts = Math.min(Math.max(0, SETTINGS.maxScouts | 0), available.spy || 0);
    if (scouts > 0) { troops.spy = scouts; any = true; }

    return any ? troops : null;
}

function buildTroops(available, village) {
    switch (CONFIG.attackType) {
        case "custom":            return buildCustomTroops(available);
        case "send_all":          return buildSendAllTroops(available);
        case "ram_then_catapult": return buildSiegePreset(available, "ram", "catapult");
        case "catapult_then_ram": return buildSiegePreset(available, "catapult", "ram");
        case "fake":
        default: {
            const requiredPop = Math.ceil((village?.points || 0) * 2 / 100);
            const availPop = getAvailablePopFrom(available);
            if (availPop < requiredPop) return null;
            return calculateFakeTroopsFrom(available, requiredPop);
        }
    }
}

/* ---------------- SEQUENTIAL SEND (fetch-based, same flow as fakes.user.js) ---------------- */

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

async function sendAttackViaFetch(villageId, target, troops, rallyData) {
    const [tx, ty] = target.split('|').map(Number);
    const { hiddenInputs, formAction } = rallyData;

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

    const confirmForm =
        doc1.getElementById('command-data-form') ||
        doc1.querySelector('form[action*="try=confirm"]') ||
        doc1.querySelector('form');
    if (!confirmForm) return { success: false, skip: false, msg: 'No confirmation form in response' };

    const arrival = parseArrivalFromDoc(doc1);
    if (arrival && !isArrivalAllowed(arrival)) {
        return { success: false, skip: true, msg: `Arrival outside window: ${arrival.toLocaleTimeString()}`, arrival };
    }

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
    uiLog('Sequential send loop starting…', 'info');

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
        sessionStorage.setItem("attackgen_total_coords", String(coords.length));
        try { localStorage.setItem(LS_TOTAL_PERSIST, String(coords.length)); } catch {}

        let index = currentIndex();
        if (index >= coords.length) {
            if (CONFIG.stopAtEnd) { uiLog('All targets used (stopAtEnd)', 'info'); updateScreenLockStatus('All targets used — done'); break; }
            index = 0; setIndex(0);
        }

        const perVillageCap = Math.max(1, parseInt(CONFIG.attacksPerVillage, 10) || 1);
        let anyAttempted = false;

        for (const village of villages) {
            if (isPaused()) break;

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

            if (CONFIG.attackType === 'fake' && village.points < 100) {
                uiLog(`[${village.coord}] Points too low — skipping`, 'warn');
                continue;
            }

            const troops = buildTroops(available, village);
            if (!troops) {
                uiLog(`[${village.coord}] Cannot build troops — skipping`, 'warn');
                continue;
            }

            sessionStorage.setItem("attackgen_pending_target", pick.target || "-");
            try { localStorage.setItem(LS_PENDING_PERSIST, pick.target || "-"); } catch {}

            uiLog(`[${village.coord}] Sending → ${pick.target}`, 'info');
            updateScreenLockStatus(`[${village.coord}] → ${pick.target}`);
            await sleep(randomDelay(CONFIG.attackDelay, CONFIG.attackRandom));

            let result;
            try {
                result = await sendAttackViaFetch(village.id, pick.target, troops, rallyData);
            } catch (e) {
                uiLog(`[${village.coord}] Send error: ${e?.message || e}`, 'err');
                continue;
            }

            if (result.success) {
                setIndex(pick.idx + 1);
                const vNow = incSentForVillage_id(village.id);
                const tNow = incTargetSent(pick.target);
                const planned = ensureTargetPlanned(pick.target).planned;
                const sentTotal = parseInt(sessionStorage.getItem("attackgen_sent") || "0", 10) + 1;
                sessionStorage.setItem("attackgen_sent", String(sentTotal));
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

/* ---------------- TIMED SEND (queue into Autosender) ---------------- */

const UNIT_SPEED_MIN_PER_FIELD = {
    spear: 18, sword: 22, axe: 18, archer: 18,
    spy: 9, light: 10, marcher: 10, heavy: 11,
    ram: 30, catapult: 30, snob: 35, knight: 10
};

function distanceTiles(c1, c2) {
    const [x1, y1] = c1.split('|').map(Number);
    const [x2, y2] = c2.split('|').map(Number);
    return Math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2);
}

function slowestUnitSpeed(troops) {
    let slowest = 0;
    for (const unit in troops) {
        if ((troops[unit] || 0) <= 0) continue;
        const s = UNIT_SPEED_MIN_PER_FIELD[unit] || 0;
        if (s > slowest) slowest = s;
    }
    return slowest;
}

// Mirrors src/content/overlay/queue-utils.ts fetchWorldSpeed() — kept in sync manually
// since userscripts can't import TS modules.
async function fetchWorldSpeedLocal() {
    const gd = window.game_data;
    if (gd?.speed != null && gd?.unit_speed != null) {
        return { gameSpeed: gd.speed, unitSpeed: gd.unit_speed };
    }
    try {
        const html = await (await fetch('/page/settings', { credentials: 'include' })).text();
        const doc = new DOMParser().parseFromString(html, 'text/html');
        let gameSpeed = 1, unitSpeed = 1;
        for (const s of doc.querySelectorAll('script')) {
            const t = s.textContent || '';
            let m = t.match(/"speed"\s*:\s*([\d.]+)/);
            if (m) gameSpeed = parseFloat(m[1]);
            m = t.match(/"unit_speed"\s*:\s*([\d.]+)/);
            if (m) unitSpeed = parseFloat(m[1]);
        }
        return { gameSpeed, unitSpeed };
    } catch {
        return { gameSpeed: 1, unitSpeed: 1 };
    }
}

async function computeTravelMs(srcCoord, tgtCoord, troops) {
    const minPerField = slowestUnitSpeed(troops);
    if (!minPerField) return null;
    const { gameSpeed, unitSpeed } = await fetchWorldSpeedLocal();
    const dist = distanceTiles(srcCoord, tgtCoord);
    const minutes = (dist * minPerField) / (Math.max(gameSpeed, 0.01) * Math.max(unitSpeed, 0.01));
    return Math.round(minutes * 60000);
}

function nextOccurrenceOfTime(hhmm) {
    const [h, m] = String(hhmm).split(":").map(Number);
    const now = new Date();
    const d = new Date(now);
    d.setHours(h || 0, m || 0, 0, 0);
    if (d.getTime() <= now.getTime()) d.setDate(d.getDate() + 1);
    return d;
}

function pushAutosenderEntry({ villageId, srcCoord, tgtCoord, launchMs, arrivalMs, troops }) {
    const [sx, sy] = srcCoord.split('|').map(Number);
    const [tx, ty] = tgtCoord.split('|').map(Number);
    const entry = {
        id: 'atkgen_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
        src: { villageId, x: sx, y: sy },
        tgt: { x: tx, y: ty },
        launch: launchMs,
        arrival: arrivalMs,
        units: troops,
        ntTemplate: null,
        sigilPct: 0,
        leaveHome: false,
        status: "pending",
        createdAt: Date.now(),
    };
    let existing = [];
    try { existing = JSON.parse(localStorage.getItem("xbot_autosender_queue") || "[]"); } catch {}
    existing.push(entry);
    localStorage.setItem("xbot_autosender_queue", JSON.stringify(existing));
    document.dispatchEvent(new CustomEvent("xbot:autosender:run", { detail: { action: "getState" } }));
    return entry;
}

async function runTimedQueueBuild() {
    uiLog('Timed queue build starting…', 'info');

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
        if (isPaused()) { updateScreenLockStatus('Cancelled'); break; }

        CONFIG   = loadConfig();
        SETTINGS = loadSettings();

        const coords = getCoords();
        sessionStorage.setItem("attackgen_total_coords", String(coords.length));
        try { localStorage.setItem(LS_TOTAL_PERSIST, String(coords.length)); } catch {}

        let index = currentIndex();
        if (index >= coords.length) {
            if (CONFIG.stopAtEnd) { uiLog('All targets used (stopAtEnd)', 'info'); updateScreenLockStatus('All targets used — done'); break; }
            index = 0; setIndex(0);
        }

        const perVillageCap = Math.max(1, parseInt(CONFIG.attacksPerVillage, 10) || 1);
        let anyAttempted = false;

        for (const village of villages) {
            if (isPaused()) break;

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

            if (CONFIG.attackType === 'fake' && village.points < 100) {
                uiLog(`[${village.coord}] Points too low — skipping`, 'warn');
                continue;
            }

            const troops = buildTroops(rallyData.available, village);
            if (!troops) {
                uiLog(`[${village.coord}] Cannot build troops for this target — skipping`, 'warn');
                continue;
            }

            const travelMs = await computeTravelMs(village.coord, pick.target, troops);
            if (travelMs == null) {
                uiLog(`[${village.coord}] Could not compute travel time — skipping`, 'err');
                continue;
            }

            let launchMs, arrivalMs;
            const now = Date.now();
            if (CONFIG.timedArrivalMode === "target_time" && CONFIG.timedTargetArrival) {
                const arrivalDate = nextOccurrenceOfTime(CONFIG.timedTargetArrival);
                arrivalMs = arrivalDate.getTime();
                launchMs = arrivalMs - travelMs;
                if (launchMs <= now + 3000) {
                    uiLog(`[${village.coord}] Not enough time to reach target arrival — skipping`, 'warn');
                    continue;
                }
            } else {
                launchMs = now + 5000;
                arrivalMs = launchMs + travelMs;
            }

            sessionStorage.setItem("attackgen_pending_target", pick.target || "-");
            try { localStorage.setItem(LS_PENDING_PERSIST, pick.target || "-"); } catch {}

            pushAutosenderEntry({
                villageId: village.id, srcCoord: village.coord, tgtCoord: pick.target,
                launchMs, arrivalMs, troops
            });

            setIndex(pick.idx + 1);
            const vNow = incSentForVillage_id(village.id);
            const tNow = incTargetSent(pick.target);
            const planned = ensureTargetPlanned(pick.target).planned;
            const queuedTotal = parseInt(sessionStorage.getItem("attackgen_sent") || "0", 10) + 1;
            sessionStorage.setItem("attackgen_sent", String(queuedTotal));
            try { localStorage.setItem(LS_SENT_PERSIST, String(queuedTotal)); } catch {}
            uiLog(`[${village.coord}] ⏱ Queued → ${pick.target} @ ${new Date(arrivalMs).toLocaleTimeString()} (vil ${vNow}/${perVillageCap}, tgt ${tNow}/${planned})`, 'info');
            updateScreenLockStatus(`⏱ Queued ${pick.target} — ${vNow}/${perVillageCap} from ${village.coord}`);
        }

        if (!anyAttempted) { uiLog('All villages at cap — done', 'info'); updateScreenLockStatus('All villages at cap — done'); break; }
    }
}

/* ---------------- AUTOMATIC TARGET DISCOVERY ---------------- */

async function fetchWorldData(force) {
    if (!force) {
        try {
            const cached = JSON.parse(localStorage.getItem(WORLD_DATA_KEY) || "null");
            if (cached && (Date.now() - cached.ts) < WORLD_DATA_TTL_MS) return cached.data;
        } catch {}
    }

    const [villagesTxt, playersTxt, alliesTxt] = await Promise.all([
        fetch('/map/village.txt', { credentials: 'include' }).then(r => r.text()),
        fetch('/map/player.txt', { credentials: 'include' }).then(r => r.text()),
        fetch('/map/ally.txt', { credentials: 'include' }).then(r => r.text()),
    ]);

    const allies = {};
    for (const line of alliesTxt.split('\n')) {
        const cols = line.split(',');
        if (cols.length < 3) continue;
        allies[cols[0]] = { tag: cols[1], name: decodeURIComponent(cols[2] || '') };
    }

    const players = {};
    for (const line of playersTxt.split('\n')) {
        const cols = line.split(',');
        if (cols.length < 2) continue;
        players[cols[0]] = {
            name: decodeURIComponent(cols[1] || ''),
            allyId: cols[2] || '0',
        };
    }

    const villages = [];
    for (const line of villagesTxt.split('\n')) {
        const cols = line.split(',');
        if (cols.length < 6) continue;
        const x = parseInt(cols[2], 10), y = parseInt(cols[3], 10);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        villages.push({
            id: cols[0],
            name: decodeURIComponent(cols[1] || ''),
            x, y,
            coord: `${x}|${y}`,
            playerId: cols[4] || '0',
            points: parseInt(cols[5], 10) || 0,
        });
    }

    const data = { villages, players, allies };
    try { localStorage.setItem(WORLD_DATA_KEY, JSON.stringify({ ts: Date.now(), data })); } catch {}
    return data;
}

function splitList(raw) {
    return String(raw || "")
        .split(/[\n,]+/)
        .map(s => s.trim())
        .filter(Boolean);
}

function continentOf(x, y) {
    const kx = Math.floor(x / 100);
    const ky = Math.floor(y / 100);
    return `${ky}${kx}`;
}

async function generateAutoCoords(opts) {
    const cfg = { ...CONFIG, ...(opts || {}) };
    const world = await fetchWorldData(false);

    const wantPlayers = splitList(cfg.autoPlayers).map(s => s.toLowerCase());
    const wantTribes = splitList(cfg.autoTribes).map(s => s.toLowerCase());
    const wantContinents = new Set(splitList(cfg.autoContinents));

    const minPoints = Number(cfg.autoMinPoints) || 0;
    const maxPoints = Number(cfg.autoMaxPoints) || 999999;
    const minX = Number(cfg.autoMinX) || 0, maxX = Number(cfg.autoMaxX) || 999;
    const minY = Number(cfg.autoMinY) || 0, maxY = Number(cfg.autoMaxY) || 999;

    const hasAnyFilter = wantPlayers.length || wantTribes.length || wantContinents.size ||
        minPoints > 0 || maxPoints < 999999 || minX > 0 || maxX < 999 || minY > 0 || maxY < 999;
    if (!hasAnyFilter) return { coords: [], count: 0, error: "No filters set" };

    let allowedPlayerIds = null;
    if (wantPlayers.length || wantTribes.length) {
        allowedPlayerIds = new Set();
        const tribeIds = new Set();
        if (wantTribes.length) {
            for (const [id, a] of Object.entries(world.allies)) {
                if (wantTribes.includes(String(a.tag || '').toLowerCase()) ||
                    wantTribes.includes(String(a.name || '').toLowerCase())) {
                    tribeIds.add(id);
                }
            }
        }
        for (const [id, p] of Object.entries(world.players)) {
            const nameMatch = wantPlayers.length && wantPlayers.includes(String(p.name || '').toLowerCase());
            const tribeMatch = tribeIds.size && tribeIds.has(p.allyId);
            if (nameMatch || tribeMatch) allowedPlayerIds.add(id);
        }
    }

    const coords = [];
    for (const v of world.villages) {
        if (allowedPlayerIds && !allowedPlayerIds.has(v.playerId)) continue;
        if (v.points < minPoints || v.points > maxPoints) continue;
        if (v.x < minX || v.x > maxX || v.y < minY || v.y > maxY) continue;
        if (wantContinents.size && !wantContinents.has(continentOf(v.x, v.y))) continue;
        coords.push(v.coord);
    }

    const unique = Array.from(new Set(coords));
    return { coords: unique, count: unique.length };
}

/* ---------------- SCREEN LOCK OVERLAY ---------------- */

let _lockEl = null;
let _lockStatusEl = null;

function showScreenLock() {
    if (_lockEl) return;
    sessionStorage.removeItem('attackgen_paused');

    const el = document.createElement('div');
    el.id = '__attackgen_lock__';
    el.style.cssText = `
        position:fixed;inset:0;z-index:999999;
        background:rgba(0,0,0,0.5);
        backdrop-filter:blur(5px);-webkit-backdrop-filter:blur(5px);
        display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;
        font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
    `;
    el.innerHTML = `
        <style>
            @keyframes __agspin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
            #__attackgen_lock_cancel:hover:not(:disabled){opacity:.85}
            #__attackgen_lock_cancel:disabled{opacity:.5;cursor:default}
        </style>
        <div style="font-size:52px;line-height:1;animation:__agspin 1.4s linear infinite;
            filter:drop-shadow(0 0 14px rgba(255,200,50,.8))">🗡️</div>
        <div id="__attackgen_lock_status" style="
            color:#fff;font-size:14px;font-weight:500;
            text-shadow:0 1px 4px rgba(0,0,0,.6);
            max-width:320px;text-align:center;min-height:20px;
        ">Starting…</div>
        <button id="__attackgen_lock_cancel" style="
            padding:8px 26px;background:#dc2626;color:#fff;
            border:none;border-radius:7px;font-size:13px;font-weight:600;
            cursor:pointer;transition:opacity .15s;
            box-shadow:0 2px 10px rgba(0,0,0,.35);
        ">Cancel</button>
    `;

    el.querySelector('#__attackgen_lock_cancel').addEventListener('click', () => {
        sessionStorage.setItem('attackgen_paused', '1');
        const btn = el.querySelector('#__attackgen_lock_cancel');
        btn.textContent = 'Cancelling…';
        btn.disabled = true;
        updateScreenLockStatus('Cancelling — finishing current step…');
    });

    document.body.appendChild(el);
    _lockEl = el;
    _lockStatusEl = el.querySelector('#__attackgen_lock_status');
}

function hideScreenLock() {
    _lockEl?.remove();
    _lockEl = null;
    _lockStatusEl = null;
}

function updateScreenLockStatus(msg) {
    if (_lockStatusEl) _lockStatusEl.textContent = msg;
}

/* ---------------- MANUAL START GATE ---------------- */
// Attack Generator NEVER starts on its own — page load / injection only wires up
// listeners. The engine runs exclusively in response to an explicit
// xbot:attackgen:start event dispatched by the React panel's "Start" button.

let _active = false;

function setActive(v) {
    _active = v;
    try { sessionStorage.setItem("attackgen_active", v ? "1" : "0"); } catch {}
}

function isRallyUrl() {
    return location.href.includes("screen=place") && !location.href.includes("try=confirm");
}

function startEngine() {
    if (_active) return;
    if (!isRallyUrl()) {
        uiLog("Attack Generator can only be started on the rally point (screen=place).", "err");
        return;
    }

    CONFIG = loadConfig();
    SETTINGS = loadSettings();

    sessionStorage.removeItem("attackgen_paused");
    setActive(true);
    showScreenLock();

    const runner = CONFIG.executionMode === "timed" ? runTimedQueueBuild : runFetchLoop;
    console.info(`[ATKGEN] Manual start — running ${CONFIG.executionMode} engine`);
    uiLog(`Started (${CONFIG.executionMode} mode)`, "info");

    runner()
        .catch(e => {
            console.error("[ATKGEN] fatal error:", e);
            uiLog(`Fatal error: ${e?.message || e}`, "err");
            updateScreenLockStatus(`Error: ${e?.message || e}`);
        })
        .finally(() => {
            hideScreenLock();
            setActive(false);
        });
}

function stopEngine() {
    sessionStorage.setItem("attackgen_paused", "1");
    uiLog("Stop requested", "warn");
}

/* ---------------- START ---------------- */

console.info("[ATKGEN] Script loaded – version 1.0 (manual start only)");

maybeResetPlanAndStartNewRunOnCoordsChange();

sessionStorage.setItem("attackgen_total_coords", String(getCoords().length));
try { localStorage.setItem(LS_TOTAL_PERSIST, String(getCoords().length)); } catch {}
setActive(false); // always reset — never resume automatically, even after a reload

document.addEventListener('xbot:attackgen:start', startEngine);
document.addEventListener('xbot:attackgen:stop', stopEngine);

// One-shot bridge: React panel asks for an auto-generated coord list.
document.addEventListener('xbot:attackgen:generateCoords', async (ev) => {
    try {
        const result = await generateAutoCoords(ev.detail || {});
        sessionStorage.setItem('attackgen_generated_coords', JSON.stringify(result));
    } catch (e) {
        sessionStorage.setItem('attackgen_generated_coords', JSON.stringify({ error: e?.message || String(e) }));
    }
});

})();

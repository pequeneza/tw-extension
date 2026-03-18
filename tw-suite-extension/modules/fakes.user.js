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

// Used in list rendering / distance helpers
var sourceName, sourceURL, targetName, targetURL, targetWood, targetStone, targetIron, targetCapacity;
var tempRow, listHTML;
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

function loadSettings(){
    const raw = localStorage.getItem(SETTINGS_KEY);
    return {...DEFAULT_SETTINGS, ...(raw ? safeParse(raw, {}) : {})};
}
function saveSettings(s){ localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); }

function loadConfig(){
    const raw = localStorage.getItem(CONFIG_KEY);
    return {...DEFAULT_CONFIG, ...(raw ? safeParse(raw, {}) : {})};
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

/* ---------------- RESTORE POPUP ---------------- */

const savedPopup = sessionStorage.getItem("fake_popup");
if(savedPopup){
    sessionStorage.removeItem("fake_popup");
    setTimeout(()=> showPopup(savedPopup), 1000);
}

/* ---------------- STATS ---------------- */

let fakeStats = {
    sent: parseInt(sessionStorage.getItem("fake_sent") || 0),
    lastTarget: "-"
};

/* ---------------- UI STATE ---------------- */

const UI_STATE = {
    paused: sessionStorage.getItem("fake_paused") === "1",
    collapsed: sessionStorage.getItem("fake_collapsed") === "1",
    editorOpen: sessionStorage.getItem("fake_editor_open") === "1",
    settingsOpen: sessionStorage.getItem("fake_settings_open") !== "0",
    pos: safeParse(localStorage.getItem("fake_ui_pos") || "null", null),
    editorPos: safeParse(localStorage.getItem("fake_editor_pos") || "null", null),
    log: safeParse(sessionStorage.getItem("fake_ui_log") || "[]", [])
};

function uiSaveState(){
    sessionStorage.setItem("fake_paused", UI_STATE.paused ? "1" : "0");
    sessionStorage.setItem("fake_collapsed", UI_STATE.collapsed ? "1" : "0");
    sessionStorage.setItem("fake_settings_open", UI_STATE.settingsOpen ? "1" : "0");
    sessionStorage.setItem("fake_editor_open", UI_STATE.editorOpen ? "1" : "0");
    sessionStorage.setItem("fake_ui_log", JSON.stringify(UI_STATE.log.slice(-25)));
}

/* ---------------- UI HELPERS ---------------- */

function uiLog(message, level="info"){
    const ts = new Date().toLocaleTimeString();
    UI_STATE.log.push({ts, message, level});
    uiSaveState();
    uiRenderLog();
}

function uiToast(message, kind="ok"){
    const containerId = "fakeToastContainer";
    let c = document.getElementById(containerId);
    if(!c){
        c = document.createElement("div");
        c.id = containerId;
        Object.assign(c.style,{
            position:"fixed",
            top:"10px",
            right:"10px",
            display:"flex",
            flexDirection:"column",
            gap:"8px",
            zIndex:10000
        });
        document.body.appendChild(c);
    }

    const t = document.createElement("div");
    const bg = kind==="warn" ? "rgba(210,140,0,0.92)"
             : kind==="err" ? "rgba(160,20,20,0.92)"
             : "rgba(12, 110, 44, 0.92)";
    t.textContent = message;
    Object.assign(t.style,{
        background:bg,
        color:"#fff",
        padding:"10px 12px",
        borderRadius:"10px",
        fontFamily:"system-ui, Arial",
        fontSize:"13px",
        boxShadow:"0 10px 26px rgba(0,0,0,.25)",
        maxWidth:"360px",
        lineHeight:"1.35",
        border:"1px solid rgba(255,255,255,.12)"
    });

    c.appendChild(t);
    setTimeout(()=>{
        t.style.opacity="0";
        t.style.transition="opacity .35s ease";
        setTimeout(()=>t.remove(), 380);
    }, 4200);
}

function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
}

/* ---------------- UI INJECTION ---------------- */

function injectStyles(){
    if(document.getElementById("fakeUIStyles")) return;
    const style = document.createElement("style");
    style.id = "fakeUIStyles";
    style.textContent = `
        .fakePanel * { box-sizing: border-box; }
        .fakePanel button {
            font-family: inherit;
            border: 0;
            border-radius: 10px;
            padding: 8px 10px;
            cursor: pointer;
            font-weight: 650;
            transition: transform .06s ease, filter .15s ease, background .15s ease;
            user-select: none;
        }
        .fakePanel button:active { transform: translateY(1px); }
        .fakePanel button:hover { filter: brightness(1.07); }
        .fakePanel input[type="number"], .fakePanel input[type="text"], .fakePanel textarea{
            width: 100%;
            padding: 7px 9px;
            border-radius: 10px;
            border: 1px solid rgba(255,255,255,.14);
            background: rgba(255,255,255,.06);
            color: #fff;
            outline: none;
            font-weight: 650;
            font-family: inherit;
        }
        .fakePanel textarea{
            min-height: 130px;
            resize: vertical;
            font-weight: 600;
            line-height: 1.35;
        }
        .fakeRow { display:flex; justify-content:space-between; gap:12px; }
        .fakeLabel { opacity:.78; }
        .fakeValue { font-weight:800; }
        .fakePill {
            display:inline-flex; align-items:center; gap:6px;
            padding: 4px 8px; border-radius: 999px;
            background: rgba(255,255,255,.08);
            border: 1px solid rgba(255,255,255,.10);
            font-size: 12px;
        }
        .fakeDivider { height:1px; background: rgba(255,255,255,.10); margin:10px 0; }
        .fakeLog { margin-top:10px; max-height:110px; overflow:auto; padding-right:4px; }
        .fakeLogItem { font-size:12px; opacity:.92; margin:4px 0; line-height:1.25; }
        .fakeLogItem .ts { opacity:.65; margin-right:6px; }
        .fakeLogItem.warn { color: #ffd28a; }
        .fakeLogItem.err { color: #ff9a9a; }
        .fakeMini { font-size:12px; opacity:.85; }
        .fakeProgress {
            height: 8px;
            background: rgba(255,255,255,.10);
            border-radius: 999px;
            overflow:hidden;
            border: 1px solid rgba(255,255,255,.10);
        }
        .fakeProgress > div{
            height: 100%;
            background: linear-gradient(90deg, rgba(92,255,155,.95), rgba(0,190,255,.85));
            width:0%;
        }
        .dragHandle {
            cursor: move;
            padding: 10px 12px;
            border-radius: 14px;
            background: rgba(255,255,255,.06);
            border: 1px solid rgba(255,255,255,.09);
        }
        .btnRow { display:flex; gap:8px; flex-wrap:wrap; }
        .btnPrimary { background: #20b15a; color:#fff; }
        .btnWarn { background: #d59a00; color:#111; }
        .btnGhost { background: rgba(255,255,255,.08); color:#fff; border:1px solid rgba(255,255,255,.10); }
        .btnSmall { padding: 6px 8px; font-size: 12px; border-radius: 9px; }
        .muted { opacity: .7; }
        .grid2 { display:grid; grid-template-columns: 1fr 1fr; gap:10px; }
        .settingsGrid{ display:grid; grid-template-columns: 1fr 110px; gap: 8px 10px; align-items:center; margin-top:8px; }
        .titleRow{ display:flex; justify-content:space-between; align-items:center; gap:10px; }
        .kbd{
            font-size: 11px;
            padding: 2px 6px;
            border-radius: 8px;
            border: 1px solid rgba(255,255,255,.16);
            background: rgba(255,255,255,.06);
            opacity: .86;
        }
    `;
    document.head.appendChild(style);
}

function makePanelBase({id, title, subtitle, width, pos, rightDefault, topDefault}){
    const panel = document.createElement("div");
    panel.id = id;
    panel.className = "fakePanel";
    Object.assign(panel.style,{
        position:"fixed",
        top: (pos?.top ?? topDefault) + "px",
        right: (pos?.right ?? rightDefault) + "px",
        width: width + "px",
        background:"rgba(10, 24, 14, 0.92)",
        color:"white",
        padding:"12px",
        borderRadius:"16px",
        fontFamily:"system-ui, Arial",
        fontSize:"13px",
        zIndex:9999,
        lineHeight:"1.35",
        border:"1px solid rgba(255,255,255,.10)",
        boxShadow:"0 18px 46px rgba(0,0,0,.35)",
        backdropFilter:"blur(6px)"
    });

    panel.innerHTML = `
        <div class="dragHandle" id="${id}Drag" title="Drag to move">
            <div style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
                <div>
                    <div style="font-size:14px; font-weight:850; letter-spacing:.2px;">${escapeHtml(title)}</div>
                    <div class="fakeMini muted">${escapeHtml(subtitle)}</div>
                </div>
                <div style="display:flex; gap:8px; align-items:center;">
                    <span class="fakePill" id="${id}StatusPill">OK</span>
                    <button class="btnGhost btnSmall" id="${id}CloseBtn" title="Close">✕</button>
                </div>
            </div>
        </div>
        <div id="${id}Body" style="margin-top:10px;"></div>
    `;
    return panel;
}

function wireDrag(panelId, storageKey){
    const panel = document.getElementById(panelId);
    const handle = document.getElementById(panelId + "Drag");
    if(!panel || !handle) return;

    let startX=0, startY=0, startTop=0, startRight=0, dragging=false;

    handle.addEventListener("mousedown", (e)=>{
        dragging = true;
        startX = e.clientX;
        startY = e.clientY;

        const rect = panel.getBoundingClientRect();
        startTop = rect.top;
        startRight = window.innerWidth - rect.right;

        e.preventDefault();
    });

    document.addEventListener("mousemove", (e)=>{
        if(!dragging) return;

        const dx = e.clientX - startX;
        const dy = e.clientY - startY;

        const newTop = Math.max(0, Math.min(window.innerHeight - 60, startTop + dy));
        const newRight = Math.max(0, Math.min(window.innerWidth - 60, startRight - dx));

        panel.style.top = newTop + "px";
        panel.style.right = newRight + "px";

        localStorage.setItem(storageKey, JSON.stringify({top:newTop, right:newRight}));
    });

    document.addEventListener("mouseup", ()=> dragging=false);
}

/* ---------------- MAIN PANEL ---------------- */

function createMainPanel(){
    if(document.getElementById("fakeMainPanel")) return;

    injectStyles();

    const panel = makePanelBase({
        id:"fakeMainPanel",
        title:"Fake Sender",
        subtitle:`v5.5 • run ${getRunId()}`,
        width: 340,
        pos: UI_STATE.pos,
        rightDefault: 14,
        topDefault: 70
    });

    const body = panel.querySelector("#fakeMainPanelBody");
    body.innerHTML = `
        <div class="fakeRow"><span class="fakeLabel">Sent</span><span class="fakeValue" id="fakeCount">${fakeStats.sent}</span></div>
        <div class="fakeRow"><span class="fakeLabel">Village</span><span class="fakeValue" id="fakeVillage">-</span></div>
        <div class="fakeRow"><span class="fakeLabel">Target</span><span class="fakeValue" id="fakeTarget">-</span></div>

        <div class="fakeDivider"></div>

        <div class="fakeRow"><span class="fakeLabel">Outgoing (attack)</span><span class="fakeValue" id="fakeOutgoing">-</span></div>
        <div class="fakeRow"><span class="fakeLabel">Index</span><span class="fakeValue" id="fakeIndex">-</span></div>
        <div class="fakeRow"><span class="fakeLabel">Remaining</span><span class="fakeValue" id="fakeRemaining">-</span></div>

        <div style="margin-top:10px;">
            <div class="fakeRow" style="align-items:center;">
                <span class="fakeLabel">Progress</span>
                <span class="fakeValue" id="fakeProgressText">-</span>
            </div>
            <div class="fakeProgress" style="margin-top:6px;"><div id="fakeProgressBar"></div></div>
        </div>

        <div class="fakeDivider"></div>

        <div class="titleRow">
            <div style="font-weight:850;">Troop Caps</div>
            <button class="btnGhost btnSmall" id="fakeSettingsToggleBtn">${UI_STATE.settingsOpen ? "Hide" : "Show"}</button>
        </div>

        <div id="fakeSettingsBody" style="margin-top:8px; display:${UI_STATE.settingsOpen ? "block" : "none"};">
            <div class="settingsGrid">
                <div class="fakeLabel">Max Catapults (caps Rams)</div>
                <input type="number" id="setMaxCatapults" min="0" max="50" step="1" value="${SETTINGS.maxCatapults}">
                <div class="fakeLabel">Max Scouts</div>
                <input type="number" id="setMaxScouts" min="0" max="200" step="1" value="${SETTINGS.maxScouts}">
                <div class="fakeLabel">Max Infantry</div>
                <input type="number" id="setMaxInfantry" min="0" max="300" step="1" value="${SETTINGS.maxInfantry}">
                <div class="fakeLabel">Max Cavalry</div>
                <input type="number" id="setMaxCavalry" min="0" max="300" step="1" value="${SETTINGS.maxCavalry}">
            </div>

            <div class="btnRow" style="margin-top:10px;">
                <button class="btnPrimary" id="fakeSaveSettingsBtn">Save</button>
                <button class="btnGhost" id="fakeResetSettingsBtn">Reset defaults</button>
            </div>
        </div>

        <div class="fakeDivider"></div>

        <div class="btnRow">
            <button id="fakePauseBtn" class="btnWarn">Pause</button>
            <button id="fakeNewRunBtn" class="btnGhost" title="Start fresh run (resets per-run village/target sent counters)">New run</button>
            <button id="fakeRestartBtn" class="btnPrimary">Reset</button>
            <button id="fakeEditorBtn" class="btnGhost" title="Open editor window for timings & coords">Editor</button>
            <button id="fakeClearLogBtn" class="btnGhost">Clear log</button>
        </div>

        <div class="fakeMini muted" style="margin-top:8px;">
            Hotkeys: <span class="kbd">Alt</span>+<span class="kbd">E</span> editor • <span class="kbd">Alt</span>+<span class="kbd">S</span> caps
        </div>

        <div class="fakeLog" id="fakeLog"></div>
    `;

    document.body.appendChild(panel);

    const closeBtn = panel.querySelector("#fakeMainPanelCloseBtn");
    closeBtn.addEventListener("click", ()=>{
        UI_STATE.collapsed = !UI_STATE.collapsed;
        uiApplyCollapsed();
    });

    wireDrag("fakeMainPanel", "fake_ui_pos");

    wireMainPanel();
    uiApplyPaused();
    uiApplyCollapsed();
    uiRenderMeta();
    uiRenderLog();
    uiLog("Main panel ready", "info");
}

function uiApplyPaused(){
    const pill = document.getElementById("fakeMainPanelStatusPill");
    const btn = document.getElementById("fakePauseBtn");
    if(pill){
        pill.textContent = UI_STATE.paused ? "PAUSED" : "RUN";
        pill.style.background = UI_STATE.paused ? "rgba(213,154,0,.22)" : "rgba(32,177,90,.22)";
        pill.style.border = UI_STATE.paused ? "1px solid rgba(213,154,0,.35)" : "1px solid rgba(32,177,90,.35)";
    }
    if(btn){
        btn.textContent = UI_STATE.paused ? "Resume" : "Pause";
        btn.className = UI_STATE.paused ? "btnPrimary" : "btnWarn";
    }
    uiSaveState();
}

function uiApplyCollapsed(){
    const body = document.getElementById("fakeMainPanelBody");
    if(body) body.style.display = UI_STATE.collapsed ? "none" : "block";
    uiSaveState();
}

function uiRenderMeta(){
    const outgoing = document.getElementById("fakeOutgoing");
    const idxNode = document.getElementById("fakeIndex");
    const remNode = document.getElementById("fakeRemaining");
    const progText = document.getElementById("fakeProgressText");
    const progBar = document.getElementById("fakeProgressBar");

    if(outgoing) outgoing.textContent = String(countOutgoingAttacksForThisVillage());
    const coords = getCoords();
    const idx = currentIndex();
    if(idxNode) idxNode.textContent = `${idx}/${coords.length}`;
    if(remNode) remNode.textContent = String(Math.max(0, coords.length - idx));

    const pct = coords.length ? Math.min(100, Math.round((idx/coords.length)*100)) : 0;
    if(progText) progText.textContent = `${pct}%`;
    if(progBar) progBar.style.width = `${pct}%`;
}

function uiRenderLog(){
    const logNode = document.getElementById("fakeLog");
    if(!logNode) return;
    const items = UI_STATE.log.slice(-25);
    logNode.innerHTML = items.map(i => {
        const cls = i.level === "warn" ? "warn" : i.level === "err" ? "err" : "";
        return `<div class="fakeLogItem ${cls}"><span class="ts">${i.ts}</span>${escapeHtml(i.message)}</div>`;
    }).join("");
    logNode.scrollTop = logNode.scrollHeight;
}

function readSettingsFromUI(){
    const toInt = (id, fallback) => {
        const v = document.getElementById(id)?.value;
        const n = parseInt(v, 10);
        return Number.isFinite(n) && n >= 0 ? n : fallback;
    };

    return {
        maxCatapults: toInt("setMaxCatapults", DEFAULT_SETTINGS.maxCatapults),
        maxScouts: toInt("setMaxScouts", DEFAULT_SETTINGS.maxScouts),
        maxInfantry: toInt("setMaxInfantry", DEFAULT_SETTINGS.maxInfantry),
        maxCavalry: toInt("setMaxCavalry", DEFAULT_SETTINGS.maxCavalry)
    };
}

function wireMainPanel(){
    const settingsToggleBtn = document.getElementById("fakeSettingsToggleBtn");
    const settingsBody = document.getElementById("fakeSettingsBody");
    const saveSettingsBtn = document.getElementById("fakeSaveSettingsBtn");
    const resetSettingsBtn = document.getElementById("fakeResetSettingsBtn");
    const pauseBtn = document.getElementById("fakePauseBtn");
    const newRunBtn = document.getElementById("fakeNewRunBtn");
    const restartBtn = document.getElementById("fakeRestartBtn");
    const editorBtn = document.getElementById("fakeEditorBtn");
    const clearLogBtn = document.getElementById("fakeClearLogBtn");

    if(settingsToggleBtn && settingsBody){
        settingsToggleBtn.addEventListener("click", ()=>{
            UI_STATE.settingsOpen = !UI_STATE.settingsOpen;
            settingsBody.style.display = UI_STATE.settingsOpen ? "block" : "none";
            settingsToggleBtn.textContent = UI_STATE.settingsOpen ? "Hide" : "Show";
            uiSaveState();
        });
    }

    document.addEventListener("keydown", (e)=>{
        if(e.altKey && (e.key === "s" || e.key === "S")){
            settingsToggleBtn?.click();
        }
        if(e.altKey && (e.key === "e" || e.key === "E")){
            toggleEditor();
        }
    });

    if(saveSettingsBtn){
        saveSettingsBtn.addEventListener("click", ()=>{
            SETTINGS = readSettingsFromUI();
            saveSettings(SETTINGS);
            uiToast("Troop caps saved", "ok");
            uiLog("Troop caps saved: " + JSON.stringify(SETTINGS), "info");
        });
    }

    if(resetSettingsBtn){
        resetSettingsBtn.addEventListener("click", ()=>{
            SETTINGS = {...DEFAULT_SETTINGS};
            saveSettings(SETTINGS);

            const map = [
                ["setMaxCatapults", SETTINGS.maxCatapults],
                ["setMaxScouts", SETTINGS.maxScouts],
                ["setMaxInfantry", SETTINGS.maxInfantry],
                ["setMaxCavalry", SETTINGS.maxCavalry]
            ];
            for(const [id,val] of map){
                const el = document.getElementById(id);
                if(el) el.value = String(val);
            }

            uiToast("Troop caps reset", "ok");
            uiLog("Troop caps reset to defaults", "warn");
        });
    }

    if(pauseBtn){
        pauseBtn.addEventListener("click", ()=>{
            UI_STATE.paused = !UI_STATE.paused;
            uiApplyPaused();
            uiToast(UI_STATE.paused ? "Paused" : "Resumed", UI_STATE.paused ? "warn" : "ok");
            uiLog(UI_STATE.paused ? "Paused by user" : "Resumed by user", UI_STATE.paused ? "warn" : "info");
        });
    }

    newRunBtn?.addEventListener("click", ()=>{
        const id = setNewRunId();

        // clean run => reset index and per-session "sent"
        setIndex(0);
        sessionStorage.setItem("fake_sent", "0");
        sessionStorage.removeItem("fake_pending_target");

        UI_STATE.log = [];
        uiSaveState();

        uiToast(`New run started (runId=${id})`, "ok");
        uiLog(`New run started (runId=${id})`, "warn");

        setTimeout(()=>location.reload(), 350);
    });

    if(restartBtn){
        restartBtn.addEventListener("click", () => {
            setIndex(0);
            fakeStats.sent = 0;
            sessionStorage.setItem("fake_sent", 0);

            fakeStats.lastTarget = "-";
            sessionStorage.removeItem("fake_pending_target");

            document.getElementById("fakeVillage").textContent = "-";
            document.getElementById("fakeTarget").textContent = "-";
            document.getElementById("fakeCount").textContent = "0";

            uiLog("Reset pressed (index=0, sent=0)", "warn");
            uiToast("Reset done. Reloading…", "ok");
            location.reload();
        });
    }

    editorBtn?.addEventListener("click", toggleEditor);

    clearLogBtn?.addEventListener("click", ()=>{
        UI_STATE.log = [];
        uiSaveState();
        uiRenderLog();
        uiToast("Log cleared", "ok");
    });
}

/* ---------------- EDITOR PANEL ---------------- */

function createEditorPanel(){
    if(document.getElementById("fakeEditorPanel")) return;

    const panel = makePanelBase({
        id:"fakeEditorPanel",
        title:"Editor",
        subtitle:"Timings • Arrival • Coords",
        width: 420,
        pos: UI_STATE.editorPos,
        rightDefault: 370,
        topDefault: 90
    });

    const body = panel.querySelector("#fakeEditorPanelBody");
    body.innerHTML = `
        <div class="grid2">
            <div>
                <div class="fakeLabel">Attack delay (ms)</div>
                <input type="number" id="cfgAttackDelay" min="0" step="50" value="${CONFIG.attackDelay}">
            </div>
            <div>
                <div class="fakeLabel">Attack random (ms)</div>
                <input type="number" id="cfgAttackRandom" min="0" step="50" value="${CONFIG.attackRandom}">
            </div>
        </div>

        <div class="grid2" style="margin-top:10px;">
            <div>
                <div class="fakeLabel">Confirm delay (ms)</div>
                <input type="number" id="cfgConfirmDelay" min="0" step="50" value="${CONFIG.confirmDelay}">
            </div>
            <div>
                <div class="fakeLabel">Confirm random (ms)</div>
                <input type="number" id="cfgConfirmRandom" min="0" step="50" value="${CONFIG.confirmRandom}">
            </div>
        </div>

        <div class="grid2" style="margin-top:10px;">
            <div>
                <div class="fakeLabel">Switch delay (ms)</div>
                <input type="number" id="cfgSwitchDelay" min="0" step="50" value="${CONFIG.switchDelay}">
            </div>
            <div>
                <div class="fakeLabel">Switch random (ms)</div>
                <input type="number" id="cfgSwitchRandom" min="0" step="50" value="${CONFIG.switchRandom}">
            </div>
        </div>

        <div class="grid2" style="margin-top:10px;">
            <div>
                <div class="fakeLabel">Stop at end</div>
                <input type="text" id="cfgStopAtEnd" value="${CONFIG.stopAtEnd ? "true" : "false"}" title="Use true/false">
            </div>
            <div>
                <div class="fakeLabel">Arrival start (HH:MM)</div>
                <input type="text" id="cfgArrivalStart" value="${CONFIG.arrivalStart}">
            </div>
        </div>

        <div class="grid2" style="margin-top:10px;">
            <div>
                <div class="fakeLabel">Arrival end (HH:MM)</div>
                <input type="text" id="cfgArrivalEnd" value="${CONFIG.arrivalEnd}">
            </div>
            <div>
                <div class="fakeLabel">Max fakes per village (per run)</div>
                <input type="number" id="cfgFakesPerVillage" min="1" step="1" value="${CONFIG.fakesPerVillage}">
            </div>
        </div>

        <div class="grid2" style="margin-top:10px;">
            <div>
                <div class="fakeLabel">Max attacks per coord</div>
                <input type="number" id="cfgMaxAttacksPerCoord" min="1" step="1" value="${CONFIG.maxAttacksPerCoord}">
            </div>
            <div>
                <div class="fakeLabel">Chance of N attacks (%)</div>
                <input type="number" id="cfgMultiHitChance" min="0" max="100" step="1" value="${CONFIG.multiHitChance}">
            </div>
        </div>

        <div class="grid2" style="margin-top:10px;">
            <div>
                <div class="fakeLabel">N attacks (for lucky coords)</div>
                <input type="number" id="cfgMultiHitAttacks" min="1" step="1" value="${CONFIG.multiHitAttacks}">
            </div>
            <div class="fakeMini muted" style="align-self:end;">
                Plan auto-resets if coords list changes.
            </div>
        </div>

        <div class="fakeDivider"></div>

        <div class="fakeLabel" style="font-weight:850;">Coords</div>
        <div class="fakeMini muted" style="margin:6px 0 8px;">
            Paste coords separated by spaces or newlines (format: 123|456).
        </div>
        <textarea id="cfgCoords">${CONFIG.coords}</textarea>

        <div class="btnRow" style="margin-top:10px;">
            <button class="btnPrimary" id="cfgSaveBtn">Save editor</button>
            <button class="btnGhost" id="cfgResetBtn">Reset defaults</button>
            <button class="btnGhost" id="cfgApplyNoReloadBtn" title="Apply config immediately (used next cycle)">Apply</button>
        </div>
    `;

    document.body.appendChild(panel);

    const closeBtn = panel.querySelector("#fakeEditorPanelCloseBtn");
    closeBtn.addEventListener("click", ()=>{
        UI_STATE.editorOpen = false;
        uiSaveState();
        panel.remove();
        uiToast("Editor closed", "ok");
    });

    wireDrag("fakeEditorPanel", "fake_editor_pos");
    wireEditorPanel();

    const pill = document.getElementById("fakeEditorPanelStatusPill");
    if(pill){
        pill.textContent = "EDIT";
        pill.style.background = "rgba(0,190,255,.18)";
        pill.style.border = "1px solid rgba(0,190,255,.30)";
    }

    uiToast("Editor opened", "ok");
    uiLog("Editor opened", "info");
}

function toggleEditor(){
    UI_STATE.editorOpen = !UI_STATE.editorOpen;
    uiSaveState();
    if(UI_STATE.editorOpen){
        createEditorPanel();
    }else{
        document.getElementById("fakeEditorPanel")?.remove();
        uiToast("Editor closed", "ok");
    }
}

function readConfigFromEditor(){
    const toInt = (id, fallback) => {
        const v = document.getElementById(id)?.value;
        const n = parseInt(v, 10);
        return Number.isFinite(n) && n >= 0 ? n : fallback;
    };
    const toText = (id, fallback) => {
        const v = document.getElementById(id)?.value;
        return (v == null ? fallback : String(v)).trim();
    };
    const toBool = (txt, fallback) => {
        if(/^(true|1|yes|y)$/i.test(txt)) return true;
        if(/^(false|0|no|n)$/i.test(txt)) return false;
        return fallback;
    };

    const coordsRaw = toText("cfgCoords", DEFAULT_CONFIG.coords);
    const coordsNorm = coordsRaw.replace(/\s+/g, " ").trim();

    return {
        attackDelay: toInt("cfgAttackDelay", DEFAULT_CONFIG.attackDelay),
        attackRandom: toInt("cfgAttackRandom", DEFAULT_CONFIG.attackRandom),
        confirmDelay: toInt("cfgConfirmDelay", DEFAULT_CONFIG.confirmDelay),
        confirmRandom: toInt("cfgConfirmRandom", DEFAULT_CONFIG.confirmRandom),
        switchDelay: toInt("cfgSwitchDelay", DEFAULT_CONFIG.switchDelay),
        switchRandom: toInt("cfgSwitchRandom", DEFAULT_CONFIG.switchRandom),

        fakesPerVillage: Math.max(1, toInt("cfgFakesPerVillage", DEFAULT_CONFIG.fakesPerVillage)),

        maxAttacksPerCoord: Math.max(1, toInt("cfgMaxAttacksPerCoord", DEFAULT_CONFIG.maxAttacksPerCoord)),
        multiHitChance: clampInt(toInt("cfgMultiHitChance", DEFAULT_CONFIG.multiHitChance), 0, 100, DEFAULT_CONFIG.multiHitChance),
        multiHitAttacks: Math.max(1, toInt("cfgMultiHitAttacks", DEFAULT_CONFIG.multiHitAttacks)),

        stopAtEnd: toBool(toText("cfgStopAtEnd", DEFAULT_CONFIG.stopAtEnd ? "true" : "false"), DEFAULT_CONFIG.stopAtEnd),
        arrivalStart: toText("cfgArrivalStart", DEFAULT_CONFIG.arrivalStart),
        arrivalEnd: toText("cfgArrivalEnd", DEFAULT_CONFIG.arrivalEnd),
        coords: coordsNorm || DEFAULT_CONFIG.coords
    };
}

function wireEditorPanel(){
    const saveBtn = document.getElementById("cfgSaveBtn");
    const resetBtn = document.getElementById("cfgResetBtn");
    const applyBtn = document.getElementById("cfgApplyNoReloadBtn");

    saveBtn?.addEventListener("click", ()=>{
        const c = readConfigFromEditor();
        saveConfig(c);
        CONFIG = loadConfig();
        uiToast("Editor saved", "ok");
        uiLog("Editor saved: timings/coords updated", "info");
        uiRenderMeta();

        // If coords list changed, the script will auto reset plan + new run + reload on next startup.
        uiToast("If you changed coords, page will auto-reload to start a new run", "warn");
    });

    applyBtn?.addEventListener("click", ()=>{
        const c = readConfigFromEditor();
        CONFIG = {...CONFIG, ...c}; // apply without persisting
        uiToast("Applied (no reload). Next cycle uses new config.", "ok");
        uiLog("Applied editor config (no reload)", "info");
        uiRenderMeta();
    });

    resetBtn?.addEventListener("click", ()=>{
        saveConfig({...DEFAULT_CONFIG});
        CONFIG = loadConfig();

        const map = [
            ["cfgAttackDelay", CONFIG.attackDelay],
            ["cfgAttackRandom", CONFIG.attackRandom],
            ["cfgConfirmDelay", CONFIG.confirmDelay],
            ["cfgConfirmRandom", CONFIG.confirmRandom],
            ["cfgSwitchDelay", CONFIG.switchDelay],
            ["cfgSwitchRandom", CONFIG.switchRandom],
            ["cfgFakesPerVillage", CONFIG.fakesPerVillage],
            ["cfgMaxAttacksPerCoord", CONFIG.maxAttacksPerCoord],
            ["cfgMultiHitChance", CONFIG.multiHitChance],
            ["cfgMultiHitAttacks", CONFIG.multiHitAttacks],
            ["cfgStopAtEnd", CONFIG.stopAtEnd ? "true" : "false"],
            ["cfgArrivalStart", CONFIG.arrivalStart],
            ["cfgArrivalEnd", CONFIG.arrivalEnd]
        ];
        for(const [id,val] of map){
            const el = document.getElementById(id);
            if(el) el.value = String(val);
        }
        const ta = document.getElementById("cfgCoords");
        if(ta) ta.value = CONFIG.coords;

        uiToast("Editor reset to defaults", "ok");
        uiLog("Editor reset to defaults", "warn");
        uiRenderMeta();
    });
}

/* ---------------- CORE UTILITIES ---------------- */

function isConfirmPage(){ return location.href.includes("try=confirm"); }

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
    const match = text.match(/(\d{2}):(\d{2}):(\d{2})/);
    if(!match) return null;

    const now = new Date();
    const arrival = new Date(now);
    arrival.setHours(match[1],match[2],match[3],0);

    return arrival;
}

function showPopup(msg){
    sessionStorage.setItem("fake_popup", msg);
    uiToast(msg, "ok");
    uiLog(msg, "info");

    const popup = document.createElement("div");
    popup.textContent = msg;
    Object.assign(popup.style, {
        position: "fixed",
        top: "10px",
        right: "10px",
        background: "rgba(0,128,0,0.85)",
        color: "white",
        padding: "10px 14px",
        borderRadius: "6px",
        zIndex: 9999,
        fontFamily: "Arial",
        fontSize: "14px",
        display: "none"
    });
    document.body.appendChild(popup);
    setTimeout(()=>popup.remove(), 10000);
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
                uiLog("Village points detected: " + points, "info");
                return points || 0;
            }
        }
    } catch (e) {
        console.error("[FAKE] Error reading village points:", e);
        uiLog("Error reading village points: " + (e?.message || e), "err");
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
    uiLog("Available population: " + total, "info");
    return total;
}

/* ---------------- FAKE TROOP BUILDER ---------------- */

function calculateFakeTroops(requiredPop){
    const troops = {};
    let popUsed = 0;
    let infantryUsed = 0;
    let cavalryUsed = 0;

    SETTINGS = loadSettings();

    const scoutsCap = Math.max(0, SETTINGS.maxScouts|0);
    const maxInf = Math.max(0, SETTINGS.maxInfantry|0);
    const maxCav = Math.max(0, SETTINGS.maxCavalry|0);
    const siegeCap = Math.max(0, SETTINGS.maxCatapults|0);

    const scouts = Math.min(scoutsCap, getUnitAvailable("spy"));
    if(scouts === 0){
        console.warn("[FAKE] No scouts available");
        uiToast("No scouts available", "warn");
        uiLog("No scouts available", "warn");
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
        uiLog("No catapult/ram (or siege cap is 0)", "warn");
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
        uiLog(`ERROR: Cannot reach requiredPop (${popUsed}/${requiredPop}) within caps -> switch village`, "err");
        return null;
    }

    return Object.keys(troops).length ? troops : null;
}

function fillTroops(troops){
    const form = document.forms[0];
    if(!form) return;

    for(const unit in troops){
        if(form[unit]) form[unit].value = troops[unit];
    }

    console.info("[FAKE] Troops filled");
    uiLog("Troops filled", "info");
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
    uiLog("Switching village", "warn");

    setTimeout(()=>{
        const btn =
            document.getElementById("village_switch_right") ||
            document.querySelector(".arrow_right");
        if(btn) btn.click();
    },randomDelay(CONFIG.switchDelay,CONFIG.switchRandom));
}

/* ---------------- SEND FAKE (UPDATED) ---------------- */

function sendFake(){
    if (UI_STATE.paused) {
        uiToast("Paused – sendFake() blocked", "warn");
        uiLog("Paused – sendFake() blocked", "warn");
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
                uiToast("Arrival outside allowed window -> going back", "warn");
                uiLog("Arrival outside allowed window: " + arrival.toLocaleTimeString(), "warn");

                setPendingSwitchVillage(false);
                showPopup("Arrival outside time window, skipping target");

                setTimeout(()=>{
                    location.href = location.href.replace(/&try=confirm.*$/,'').replace(/screen=place.*/,'screen=place');
                }, 900);

                return true;
            }

            console.info("[FAKE] Clicking CONFIRM");
            showPopup("Fake attack sent!");
            uiLog("Clicking CONFIRM", "info");

            setTimeout(()=>{
                setPendingSwitchVillage(true);

                // click first
                confirmBtn.click();

                // increment per-run counters (village + target sent)
                const pendingTarget = sessionStorage.getItem("fake_pending_target") || "-";
                const vNow = incSentForVillage();
                const tNow = pendingTarget !== "-" ? incTargetSent(pendingTarget) : 0;
                const planned = pendingTarget !== "-" ? ensureTargetPlanned(pendingTarget).planned : 0;

                uiLog(`Confirmed. Village=${vNow}/${Math.max(1, parseInt(CONFIG.fakesPerVillage,10)||1)}; Target ${pendingTarget}=${tNow}/${planned}`, "info");
                uiLog("Fake attack confirmed (clicked CONFIRM)", "info");
            }, randomDelay(CONFIG.confirmDelay, CONFIG.confirmRandom));

            return true;
        }

        const interval = setInterval(()=>{
            if(clickConfirmButton()) clearInterval(interval);
        }, 300);

        return;
    }

    // RALLY POINT PAGE: click attack to go to confirm
    const attackBtn = document.querySelector('#target_attack, input[type="submit"][value*="Attack"], input[name="attack"], button.btn-attack, .btn-attack');

    if(!attackBtn){
        console.error("[FAKE] Attack button not found");
        uiToast("Attack button not found", "err");
        uiLog("Attack button not found", "err");
        return;
    }

    setTimeout(()=>{
        console.info("[FAKE] Clicking ATTACK");
        uiLog("Clicking ATTACK (going to confirmation)", "info");
        showPopup("Proceeding to confirmation…");

        setPendingSwitchVillage(false);
        attackBtn.click();
    }, randomDelay(CONFIG.attackDelay, CONFIG.attackRandom));
}

/* ---------------- MAIN ---------------- */

function updateStats(village,target){
    fakeStats.sent++;
    fakeStats.lastTarget = target;

    sessionStorage.setItem("fake_sent",fakeStats.sent);
    sessionStorage.setItem("fake_pending_target", target || "-");

    const count = document.getElementById("fakeCount");
    const v = document.getElementById("fakeVillage");
    const t = document.getElementById("fakeTarget");

    if(count) count.textContent = fakeStats.sent;
    if(v) v.textContent = village || "-";
    if(t) t.textContent = target || "-";

    uiRenderMeta();
    uiLog(`Sent fake to ${target} from ${village}`, "info");
}

async function main(){
    // after successful confirm -> switch village now (1 fake per village per visit)
    if(!isConfirmPage() && isPendingSwitchVillage()){
        setPendingSwitchVillage(false);
        uiLog("Success -> switching village for next target", "info");
        switchVillage();
        return;
    }

    if(UI_STATE.paused){
        uiRenderMeta();
        uiLog("Paused - main() not executed", "warn");
        return;
    }

    console.group("[FAKE] Cycle start");

    await new Promise(r=>setTimeout(r,1200));

    const form = document.forms[0];
    if(!form){
        console.warn("[FAKE] No form found");
        uiToast("No form found", "warn");
        uiLog("No form found", "warn");
        return;
    }
    
    const perVillageCap = Math.max(1, parseInt(CONFIG.fakesPerVillage, 10) || 1);
    const sentHere = getSentFromVillage();
    if(sentHere >= perVillageCap){
        uiToast(`Village cap reached (${sentHere}/${perVillageCap}) -> switching village`, "warn");
        uiLog(`Village cap reached (${sentHere}/${perVillageCap}) -> switching village`, "warn");
        switchVillage();
        return;
    }

    const outgoingAttacksNow = countOutgoingAttacksForThisVillage();
    if (outgoingAttacksNow >= perVillageCap) {
        uiToast(`Outgoing attacks cap reached (${outgoingAttacksNow}/${perVillageCap}) -> switching village`, "warn");
        uiLog(`Outgoing attacks cap reached (${outgoingAttacksNow}/${perVillageCap}) -> switching village`, "warn");
        switchVillage();
        return;
    }

    const points = await getCurrentVillagePoints();
    if(points < 100){
        console.warn("[FAKE] Could not read points");
        uiToast("Could not read points - switching village", "warn");
        uiLog("Could not read points - switching village", "warn");
        switchVillage();
        return;
    }

    const requiredPop = Math.ceil(points * 2 /100);
    uiLog(`Village points=${points}, requiredPop=${requiredPop}`, "info");

    const availablePop = getAvailablePopulation();
    if(availablePop < requiredPop){
        console.warn("[FAKE] Not enough troops");
        uiToast("Not enough troops - switching village", "warn");
        uiLog("Not enough troops - switching village", "warn");
        switchVillage();
        return;
    }

    const troops = calculateFakeTroops(requiredPop);
    if(!troops){
        uiToast("Cannot build fake troops - switching village", "warn");
        uiLog("Cannot build fake troops - switching village", "warn");
        switchVillage();
        return;
    }

    fillTroops(troops);

    const coords = getCoords();
    let index = currentIndex();

    if(index >= coords.length){
        if(CONFIG.stopAtEnd){
            console.info("[FAKE] All targets used");
            uiToast("All targets used (stopAtEnd)", "ok");
            uiLog("All targets used (stopAtEnd)", "info");
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
        uiLog("No eligible targets left (all coords reached planned/max)", "info");
        return;
    }

    const target = pick.target;
    index = pick.idx;

    const [x,y] = target.split("|");
    form.x.value = x;
    form.y.value = y;

    console.info("[FAKE] Target:", target);
    updateStats(currentVillageCoord, target);

    // advance index now (will be used next village after confirm success)
    setIndex(index + 1);

    uiRenderMeta();
    sendFake();

    setTimeout(()=>console.groupEnd(), 1500);
}

/* ---------------- START ---------------- */

console.info("[FAKE] Script loaded – version 5.5");

// IMPORTANT: run the coords-change check ASAP on startup
// (this can trigger a reload; safe to do before building UI)
maybeResetPlanAndStartNewRunOnCoordsChange();

createMainPanel();
if(UI_STATE.editorOpen) createEditorPanel();

if (isConfirmPage()) {
    console.info("[FAKE] Confirm page detected");
    uiRenderMeta();

    if (UI_STATE.paused) {
        uiToast("Paused (confirm page) – no action taken", "warn");
        uiLog("Paused on confirm page – sendFake() skipped", "warn");
    } else {
        sendFake();
    }
}
else if (document.forms[0] && document.querySelector('input[name="x"]')) {
    console.info("[FAKE] Rally point detected");
    uiRenderMeta();

    if (UI_STATE.paused) {
        uiToast("Paused – no action taken", "warn");
        uiLog("Paused on rally point – main() not scheduled", "warn");
    } else {
        setTimeout(main, 800);
    }
}

else if(document.forms[0] && document.querySelector('input[name="x"]')){
    console.info("[FAKE] Rally point detected");
    uiRenderMeta();
    setTimeout(main, 800);
}

})();
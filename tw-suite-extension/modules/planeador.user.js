// ==UserScript==
// @name         TW Planeador
// @namespace    tw_planeador
// @version      1.1.0
// @description  Planeador de ataques coordenados: busca velocidades do servidor, calcula Hora de Saída e gera links de ataque pré-preenchidos.
// @match        https://*.tribalwars.com.pt/game.php*
// ==/UserScript==

/* ── Standalone injection (bookmarklet) ────────────────────────────────────
   Paste in the browser address bar or save as a bookmark:

   javascript:$.getScript('RAW_URL_TO_planeador.user.js');void(0);

   Replace RAW_URL_TO_planeador.user.js with the direct URL to this file
   (e.g. a Dropbox raw link, GitHub raw URL, or your own server).
   ─────────────────────────────────────────────────────────────────────── */

(function () {
    'use strict';

    /* ── re-entry guard ─────────────────────────────────────────────────── */
    if (window.__twPlaneadorLoaded) return;
    window.__twPlaneadorLoaded = true;

    const _screen = new URLSearchParams(window.location.search).get('screen');
    const isMemo  = _screen === 'memo';

    /* ═══════════════════════════════════════════════════════════════════════
       CONSTANTS
    ═══════════════════════════════════════════════════════════════════════ */

    /* Base travel time in seconds per tile at gameSpeed=1, unitSpeed=1 */
    const BASE_SEC = {
        spear: 1080, sword: 1320, axe: 1080, archer: 1080,
        spy: 540,    light: 600,  marcher: 600, heavy: 660,
        ram: 1800,   catapult: 1800, snob: 2100, knight: 600,
    };

    const UNIT_ORDER   = ['spear','sword','axe','archer','spy','light','marcher','heavy','ram','catapult','snob','knight'];
    const UNIT_LABEL   = { spear:'Lança', sword:'Espada', axe:'Machado', archer:'Arqueiro', spy:'Espião', light:'Cav. Leve', marcher:'Arq. Cavalo', heavy:'Cav. Pesada', ram:'Ariete', catapult:'Catapulta', snob:'Nobre', knight:'Paladino' };

    /* ═══════════════════════════════════════════════════════════════════════
       HELPERS
    ═══════════════════════════════════════════════════════════════════════ */

    const pad2 = n => String(n).padStart(2, '0');

    function getServerId() {
        return window.location.hostname.split('.')[0];
    }

    function getCurrentVillageId() {
        if (typeof game_data !== 'undefined' && game_data.village?.id)
            return String(game_data.village.id);
        return new URLSearchParams(window.location.search).get('village') || '';
    }

    function serverNowMs() {
        if (typeof game_data !== 'undefined' && game_data.time)
            return game_data.time * 1000;
        return Date.now();
    }

    function dist(x1, y1, x2, y2) {
        return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
    }

    /** Slowest unit travel time in seconds for a mixed composition */
    function travelSec(troops, distance, gameSpeed, unitSpeed) {
    let max = 0;
    for (const [unit, count] of Object.entries(troops)) {
        if (count > 0 && BASE_SEC[unit]) {
            const s = distance * BASE_SEC[unit] / (gameSpeed * unitSpeed); // correct
            if (s > max) max = s;
        }
    }
    return Math.ceil(max);
}

    function fmtDuration(sec) {
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        const s = sec % 60;
        return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
    }

    function fmtDatetime(ms) {
        const d = new Date(ms);
        return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()} ás ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
    }

    function readPageCoords() {
        const tds = document.querySelectorAll('td');
        for (let i = 0; i < tds.length - 1; i++) {
            if (tds[i].textContent.trim() === 'Coordenadas:') {
                const m = (tds[i + 1].textContent || '').trim().match(/(\d+)\|(\d+)/);
                if (m) return { x: parseInt(m[1], 10), y: parseInt(m[2], 10) };
            }
        }
        return null;
    }

    /** Parse a "DD/MM/YYYY HH:MM:SS" string into a JS timestamp */
    function parseDatetime(dateStr, timeStr) {
        const [day, month, year] = dateStr.split('/').map(Number);
        const [hh, mm, ss]       = timeStr.split(':').map(Number);
        if ([day, month, year, hh, mm, ss].some(isNaN)) return null;
        return new Date(year, month - 1, day, hh, mm, ss).getTime();
    }

    function buildAttackUrl(villageId, tx, ty, troops, targetVillageId) {
        const server = getServerId();
        const p = new URLSearchParams({ village: villageId, screen: 'place', x: tx, y: ty, from: 'simulator' });
        for (const [unit, count] of Object.entries(troops)) {
            if (count > 0) p.set(`att_${unit}`, count);
        }
        if (targetVillageId) p.set('target', targetVillageId);
        return `https://${server}.tribalwars.com.pt/game.php?${p.toString()}`;
    }

    /* ═══════════════════════════════════════════════════════════════════════
       SERVER CONFIG — game_data first, /page/settings fallback
    ═══════════════════════════════════════════════════════════════════════ */

    async function fetchServerConfig() {
        if (typeof game_data !== 'undefined' && game_data.speed != null && game_data.unit_speed != null) {
            return { gameSpeed: game_data.speed, unitSpeed: game_data.unit_speed };
        }

        const server = getServerId();
        try {
            const res  = await fetch(`https://${server}.tribalwars.com.pt/page/settings`, { credentials: 'include' });
            const text = await res.text();
            return parseSettingsPage(text);
        } catch {
            return { gameSpeed: 1, unitSpeed: 1 };
        }
    }

    function parseSettingsPage(html) {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        let gameSpeed = 1, unitSpeed = 1;

        /* Try embedded game_data script block */
        for (const s of doc.querySelectorAll('script')) {
            const t = s.textContent;
            let m = t.match(/"speed"\s*:\s*([\d.]+)/);
            if (m) gameSpeed = parseFloat(m[1]);
            m = t.match(/"unit_speed"\s*:\s*([\d.]+)/);
            if (m) unitSpeed = parseFloat(m[1]);
        }

        /* Fallback: table rows labelled "Velocidade …" */
        if (gameSpeed === 1) {
            doc.querySelectorAll('tr').forEach(tr => {
                const tds = tr.querySelectorAll('td');
                if (tds.length < 2) return;
                const label = tds[0].textContent.toLowerCase();
                const val   = parseFloat(tds[1].textContent.replace(',', '.'));
                if (!isNaN(val)) {
                    if (label.includes('velocidade do jogo'))          gameSpeed  = val;
                    if (label.includes('velocidade das unidades'))     unitSpeed  = val;
                }
            });
        }

        return { gameSpeed, unitSpeed };
    }

    /* ═══════════════════════════════════════════════════════════════════════
       VILLAGE + GROUP DATA
    ═══════════════════════════════════════════════════════════════════════ */

    async function fetchGroups() {
        const vid = getCurrentVillageId();
        if (!vid) return [{ id: '0', name: 'Todos' }];
        try {
            /* Base overview_villages page reliably renders the full group navigation */
            const res  = await fetch(`/game.php?village=${vid}&screen=overview_villages`, { credentials: 'include' });
            const text = await res.text();
            const groups = parseGroups(text);
            console.log('[Planeador] groups found:', groups.length, groups.map(g => g.name));
            return groups;
        } catch {
            return [{ id: '0', name: 'Todos' }];
        }
    }

    function parseGroups(html) {
        const doc  = new DOMParser().parseFromString(html, 'text/html');
        const byId = new Map();

        /* Strategy 1 — navigation links/tabs: href contains the real game group IDs */
        doc.querySelectorAll('a[href*="group="]').forEach(a => {
            const m    = (a.getAttribute('href') || '').match(/[?&]group=(\d+)/);
            const name = a.textContent.trim();
            if (m && name) byId.set(m[1], name);
        });

        /* Strategy 2 — <select name="group_id"> fallback */
        if (byId.size <= 1) {
            const namedSel = doc.querySelector('#group_id, select[name="group_id"]');
            if (namedSel) {
                Array.from(namedSel.options).forEach(o => {
                    const name = o.textContent.trim();
                    const val  = o.value.trim();
                    const m    = val.match(/[?&]group=(\d+)/);
                    const id   = m ? m[1] : val;
                    if (id && name) byId.set(id, name);
                });
            }
        }

        /* Strategy 3 — any <select> whose option values look like group URLs */
        if (byId.size <= 1) {
            for (const sel of Array.from(doc.querySelectorAll('select')).sort((a, b) => b.options.length - a.options.length)) {
                const looksLikeGroups = Array.from(sel.options).some(o => /[?&]group=\d+/.test(o.value));
                if (looksLikeGroups && sel.options.length > 1) {
                    Array.from(sel.options).forEach(o => {
                        const m = (o.value || '').match(/[?&]group=(\d+)/);
                        if (m && o.textContent.trim()) byId.set(m[1], o.textContent.trim());
                    });
                    break;
                }
            }
        }

        /* Always ensure "Todos" (group 0 = all villages) is present */
        if (!byId.has('0')) byId.set('0', 'Todos');

        const result = [{ id: '0', name: byId.get('0') }];
        byId.forEach((name, id) => { if (id !== '0') result.push({ id, name }); });
        return result;
    }

    /**
     * Fetches the combined village overview and returns an array of
     * { villageId, name, x, y, troops: { spear: N, ... } }
     */
    async function fetchVillages(groupId = '0') {
        const vid = getCurrentVillageId();
        if (!vid) return [];

        const url = `/game.php?village=${vid}&screen=overview_villages&mode=units&type=own_home&group=${groupId}&page=-1`;
        try {
            const res  = await fetch(url, { credentials: 'include' });
            const text = await res.text();
            const result = parseVillagesTable(text);
            if (!result.length) {
                const doc = new DOMParser().parseFromString(text, 'text/html');
                const tables = doc.querySelectorAll('table');
                console.warn('[Planeador] parseVillagesTable returned empty.',
                    'URL:', url,
                    'Tables found:', tables.length,
                    Array.from(tables).map(t => ({ id: t.id, cls: t.className, rows: t.rows.length }))
                );
            }
            return result;
        } catch (e) {
            console.error('[Planeador] fetchVillages:', e);
            return [];
        }
    }

    function parseVillagesTable(html) {
        const doc = new DOMParser().parseFromString(html, 'text/html');

        /* Pick the table most likely to be the units overview:
           prefer explicit ids, then the vis table with the most rows */
        let table = doc.querySelector('#units_table, #villages_table');
        if (!table) {
            const candidates = Array.from(doc.querySelectorAll('table.vis'));
            table = candidates.reduce((best, t) => (t.rows.length > (best?.rows.length ?? 0) ? t : best), null);
        }
        if (!table) return [];

        /* Header cells: prefer <thead>, fall back to first <tr> of the table */
        let headerCells = Array.from(table.querySelectorAll('thead th, thead td'));
        if (!headerCells.length) {
            const firstRow = table.querySelector('tr');
            if (firstRow) headerCells = Array.from(firstRow.querySelectorAll('th, td'));
        }

        const colUnit = {};
        headerCells.forEach((th, idx) => {
            const img = th.querySelector('img');
            if (!img) return;
            const src = img.getAttribute('src') || '';
            const m   = src.match(/unit[_/](?:unit_)?([a-z]+)\./i);
            if (m) colUnit[idx] = m[1].toLowerCase();
        });

        console.log('[Planeador] colUnit detected:', colUnit);

        const results = [];
        table.querySelectorAll('tbody tr').forEach(tr => {
            const tds = Array.from(tr.querySelectorAll('td'));

            /* Village link — look for info_village or plain village links */
            const link = tr.querySelector('a[href*="village="]');
            if (!link) return;

            /* Village ID: 'id=' param (info_village style) takes priority over 'village=' */
            const href = link.getAttribute('href') || '';
            const idM  = href.match(/[?&]id=(\d+)/) ?? href.match(/[?&]village=(\d+)/);
            if (!idM) return;
            const villageId = idM[1];

            /* Coordinates from "(X|Y)" anywhere in the row */
            const coordM = tr.textContent.match(/\((\d+)\|(\d+)\)/);
            if (!coordM) return;
            const x = parseInt(coordM[1], 10);
            const y = parseInt(coordM[2], 10);

            const name = link.textContent.trim();

            /* Troop counts by detected column index */
            const troops = {};
            Object.entries(colUnit).forEach(([idx, unit]) => {
                const td    = tds[parseInt(idx, 10)];
                const count = parseInt(td?.textContent?.trim().replace(/\D/g, '') || '0', 10);
                if (count > 0) troops[unit] = count;
            });

            if (Object.keys(troops).length > 0) {
                results.push({ villageId, name, x, y, troops });
            }
        });

        return results;
    }

    /* ═══════════════════════════════════════════════════════════════════════
       TARGET VILLAGE ID LOOKUP  (optional — resolves coords → village id)
    ═══════════════════════════════════════════════════════════════════════ */

    async function lookupTargetVillageId(tx, ty) {
        const vid = getCurrentVillageId();
        if (!vid) return null;
        try {
            const res  = await fetch(
                `/game.php?village=${vid}&screen=info_village&x=${tx}&y=${ty}`,
                { credentials: 'include' }
            );
            const text = await res.text();
            const m    = text.match(/village=(\d+).*?screen=info_village/);
            if (m) return m[1];
            /* Also look for game_data.village.id in the fetched page */
            const m2 = text.match(/"village"\s*:\s*\{[^}]*"id"\s*:\s*(\d+)/);
            if (m2) return m2[1];
        } catch {}
        return null;
    }

    /* ═══════════════════════════════════════════════════════════════════════
       UI
    ═══════════════════════════════════════════════════════════════════════ */

    /* ── Unit selection + countdown + dock state ────────────────────────── */
    let _lastCalc = null;
    let _selUnits = new Set(UNIT_ORDER);
    let _countdownTimer = null;
    let _docked = true;
    let _cmdType = 'Attack';
    let _destroyDrag = null;
    let _destroyResize = null;

    const CSS = `
#sim-overlay { position:fixed; top:60px; left:50%; transform:translateX(-50%); z-index:99999;
               background:#f4e4bc; border:2px solid #7d5c2e; border-radius:6px;
               font-family:Verdana,sans-serif; font-size:12px; color:#3b2a1a;
               box-shadow:0 4px 20px rgba(0,0,0,0.45); min-width:620px; max-width:1100px; }
#sim-overlay * { box-sizing:border-box; }
#sim-titlebar { background:#7d5c2e; color:#f4e4bc; padding:8px 12px; border-radius:4px 4px 0 0;
                display:flex; align-items:center; justify-content:space-between; user-select:none; cursor:move; }
#sim-titlebar span { font-weight:bold; font-size:13px; }
#sim-titlebar button { background:none; border:none; color:#f4e4bc; font-size:15px; cursor:pointer;
                        padding:2px 6px; line-height:1; border-radius:3px; }
#sim-titlebar button:hover { background:rgba(255,255,255,0.15); }
#sim-controls { display:flex; flex-wrap:wrap; align-items:center; gap:8px; padding:10px 12px;
                background:#e8d5a3; border-bottom:1px solid #c9a96e; }
#sim-controls label { font-weight:bold; font-size:11px; }
#sim-controls input, #sim-controls select { padding:3px 6px; border:1px solid #7d5c2e; border-radius:3px;
                                             background:#fff9ec; font-size:12px; }
#sim-controls input[type=text] { width:90px; }
#sim-controls input[name=date] { width:90px; }
#sim-controls input[name=time] { width:110px; }
#sim-controls input[name=sigilia] { width:50px; }
.sim-cmd-btn { background:none; border:2px solid transparent; border-radius:3px; cursor:pointer; padding:2px 4px; line-height:1; vertical-align:middle; }
.sim-cmd-btn img { display:block; width:20px; height:20px; image-rendering:crisp-edges; image-rendering:-webkit-optimize-contrast; }
.sim-cmd-btn:hover { background:rgba(0,0,0,0.08); }
.sim-cmd-btn.sim-cmd-active[data-type="Attack"]  { border-color:#c00; background:rgba(204,0,0,0.08); }
.sim-cmd-btn.sim-cmd-active[data-type="Support"] { border-color:#3b82f6; background:rgba(59,130,246,0.08); }
#sim-overlay.sim-attack  { border-color:#c00; }
#sim-overlay.sim-support { border-color:#3b82f6; }
#sim-calcular { background:#5a3a1a; color:#f4e4bc; border:1px solid #3b2a1a; border-radius:3px;
                padding:5px 14px; font-weight:bold; font-size:12px; cursor:pointer; }
#sim-calcular:hover { background:#7d5c2e; }
#sim-status { padding:4px 12px; font-size:11px; color:#7d5c2e; min-height:20px; background:#f4e4bc; }
#sim-body { max-height:420px; overflow-y:auto; overflow-x:auto; }
#sim-table { width:100%; border-collapse:collapse; }
#sim-table th { background:#8b6914; color:#f4e4bc; padding:5px 6px; text-align:center;
                position:sticky; top:0; white-space:nowrap; font-size:11px; }
#sim-table th.left { text-align:left; }
#sim-table td { padding:4px 6px; border-bottom:1px solid #d9c08a; text-align:center; white-space:nowrap; }
#sim-table tr:nth-child(even) td { background:#f0dfa8; }
#sim-table tr:hover td { background:#e6ca7a; }
.sim-village-cell { text-align:left; max-width:180px; overflow:hidden; text-overflow:ellipsis; }
.sim-zero { color:#bbb; }
.sim-departure { font-weight:bold; color:#3b2a1a; }
.sim-travel { color:#7d5c2e; }
.btn-enviar { background:#5a3a1a; color:#f4e4bc; border:1px solid #3b2a1a; border-radius:3px;
              padding:3px 10px; font-size:11px; font-weight:bold; cursor:pointer; white-space:nowrap; }
.btn-enviar:hover { background:#7d5c2e; }
.btn-kumin { background:#1a4a3a; color:#f4e4bc; border:1px solid #0d3a2a; border-radius:3px;
             padding:3px 8px; font-size:11px; font-weight:bold; cursor:pointer; white-space:nowrap; margin-left:4px; }
.btn-kumin:hover { background:#2a6a5a; }
.btn-kumin:disabled { background:#5a8a7a; cursor:default; }
.sim-unit-icon { width:16px; height:16px; vertical-align:middle; }
#sim-pagination { padding:5px 12px; font-size:11px; color:#7d5c2e; background:#e8d5a3; border-top:1px solid #c9a96e; }
th.sim-unit-th { cursor:pointer; transition:background 0.15s, opacity 0.15s; }
th.sim-unit-th:hover { filter:brightness(1.25); }
th.sim-unit-th.sim-u-on    { background:#3a6e3a; outline:2px solid #7cfc7c; outline-offset:-2px; }
th.sim-unit-th.sim-u-off   { background:#6a6a50; opacity:0.55; }
th.sim-unit-th.sim-u-empty { background:#5a5a5a; opacity:0.30; cursor:default; pointer-events:none; }
td.sim-cell-on { background:#c6f0c6 !important; color:#1a4a1a; border-radius:3px; }
td[data-editable] { cursor:text; }
td[data-editable]:hover { outline:1px dashed #a07c2e; }
.sim-troop-input { width:46px; font-size:12px; text-align:center; border:1px solid #a07c2e; border-radius:2px; background:#fff8e7; color:#3b2a1a; padding:1px 2px; box-sizing:border-box; }
td.sim-countdown { font-weight:bold; color:#3b2a1a; font-variant-numeric:tabular-nums; }
td.sim-countdown.sim-urgent { color:#b00; animation:sim-pulse 0.8s infinite alternate; }
@keyframes sim-pulse { from { opacity:1; } to { opacity:0.4; } }
#sim-overlay:not(.sim-docked) { display:flex; flex-direction:column; }
#sim-overlay:not(.sim-docked) #sim-body { flex:1; max-height:none; overflow-y:auto; }
#sim-overlay.sim-docked { position:static !important; transform:none !important; z-index:auto !important;
                           box-shadow:none !important; min-width:0 !important; max-width:100% !important;
                           margin:8px 0; border-radius:4px; }
#sim-overlay.sim-docked #sim-titlebar { cursor:default; border-radius:3px 3px 0 0; }
#sim-resize-handle { display:none; position:absolute; right:0; bottom:0; width:16px; height:16px; cursor:se-resize; }
#sim-resize-handle::after { content:''; position:absolute; right:3px; bottom:3px; width:9px; height:9px;
                             border-right:2px solid rgba(125,92,46,0.7); border-bottom:2px solid rgba(125,92,46,0.7); }
#sim-overlay:not(.sim-docked) #sim-resize-handle { display:block; }
#sim-toggle-btn {
    width: 25px;
    height: 25px;
    align-items: center;
    justify-content: center;
    background: #E9D0A9;
    border: 1px solid #000;
    border-radius: 3px;
    cursor: pointer;
    font-size: 17px;
    user-select: none;
    box-sizing: border-box;
    box-shadow: rgba(60, 30, 0, 0.7) 2px 2px 2px
    }
#sim-toggle-btn:hover { background:#7d5c2e; }
#sim-toggle-btn.sim-btn-active { border-color:#f4e4bc; box-shadow:0 0 6px #f4e4bc; }
`;

    function injectStyle() {
        if (document.getElementById('sim-style')) return;
        const st = document.createElement('style');
        st.id = 'sim-style';
        st.textContent = CSS;
        document.head.appendChild(st);
    }

    /* ── Input persistence ───────────────────────────────────────────────── */
    const SIM_STORAGE_KEY = 'tw_sim_inputs';

    function saveInputs(overlay) {
        const data = {
            target:      overlay.querySelector('[name=target]').value,
            date:        overlay.querySelector('[name=date]').value,
            time:        overlay.querySelector('[name=time]').value,
            group:       overlay.querySelector('[name=group]').value,
            sigilia:     overlay.querySelector('[name=sigilia]').value,
            commandType: overlay.querySelector('[name=commandType]').value,
        };
        try { localStorage.setItem(SIM_STORAGE_KEY, JSON.stringify(data)); } catch {}
    }

    function loadInputs() {
        try { return JSON.parse(localStorage.getItem(SIM_STORAGE_KEY) || '{}'); } catch { return {}; }
    }

    function buildDialogHtml(groups) {
        const saved = loadInputs();

        const today = (() => {
            const d = new Date();
            return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
        })();
        const now = (() => {
            const d = new Date();
            return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}.000`;
        })();

        const groupOptions = groups.map(g =>
            `<option value="${g.id}"${saved.group === g.id ? ' selected' : ''}>${g.name}</option>`
        ).join('');

        return `
<div id="sim-overlay" style="position:relative">
  <div id="sim-titlebar">
    <span>🗺️ Planeador</span>
    <div style="display:flex;gap:4px;align-items:center;">
      <button id="sim-refresh-all" title="Preencher alvo com coordenadas da página e atualizar hora se estiver no passado">↻</button>
      <button id="sim-dock" title="Soltar para flutuar">⊞</button>
      <button id="sim-close" title="Fechar">✕</button>
    </div>
  </div>
  <div id="sim-controls">
    <label>Alvo</label>
    <input name="target" type="text" placeholder="500|500" value="${saved.target || ''}" />
    <label>Data</label>
    <input name="date"   type="text" placeholder="DD/MM/AAAA" value="${saved.date || today}" />
    <label>Hora</label>
    <input name="time" type="text" placeholder="HH:MM:SS.mmm" value="${saved.time || now}" />
    <label>Grupo</label>
    <select name="group">${groupOptions}</select>
    <label>Sigilia(%)</label>
    <input name="sigilia" type="number" value="${saved.sigilia ?? 0}" min="0" max="100" />
    <div style="display:flex;align-items:center;gap:4px;flex-shrink:0;">
      <button id="sim-calcular">CALCULAR</button>
      <button class="sim-cmd-btn${(saved.commandType||'Attack')==='Attack' ? ' sim-cmd-active' : ''}" data-type="Attack" title="Ataque"><img src="https://dspt.innogamescdn.com/asset/48a2d4fb/graphic/command/attack.webp"></button>
      <button class="sim-cmd-btn${(saved.commandType||'Attack')==='Support' ? ' sim-cmd-active' : ''}" data-type="Support" title="Apoio"><img src="https://dspt.innogamescdn.com/asset/48a2d4fb/graphic/command/support.webp"></button>
    </div>
    <input type="hidden" name="commandType" value="${saved.commandType || 'Attack'}" />
  </div>
  <div id="sim-status">Pronto. Insere o alvo e clica CALCULAR.</div>
  <div id="sim-body"></div>
  <div id="sim-pagination"></div>
  <div id="sim-resize-handle"></div>
</div>`;
    }

    function unitIconHtml(unit) {
        return `<img class="sim-unit-icon" src="/graphic/unit/unit_${unit}.png" title="${UNIT_LABEL[unit] || unit}" />`;
    }

    /** Returns only the troop entries present in `active` Set (non-zero). Falls back to all troops if result is empty. */
    function activeTroops(troops, active) {
        const sel = {};
        for (const [u, c] of Object.entries(troops)) {
            if (c > 0 && active.has(u)) sel[u] = c;
        }
        return Object.keys(sel).length ? sel : null;
    }

    function renderTable(villages, usedUnits, targetX, targetY, targetVillageId, arrivalMs, cfg, selUnits) {
        const active = selUnits && selUnits.size ? selUnits : new Set(UNIT_ORDER);
        const now    = serverNowMs();

        /* For each village: compute travel using selected units; skip if no selected troops or departure already past */
        const rows = [];
        for (const r of villages) {
            const sel = activeTroops(r.troops, active);
            if (!sel) continue;                                       // no selected units in this village
            const d      = dist(r.x, r.y, targetX, targetY);
            const sec    = travelSec(sel, d, cfg.gameSpeed, cfg.unitSpeed);
            const depMs  = arrivalMs - sec * 1000;
            if (depMs < now) continue;                                // departure already past — skip
            rows.push({ r, d, sec, depMs });
        }

        /* Sort earliest-departure first */
        rows.sort((a, b) => a.depMs - b.depMs);

        const emptyUnits = new Set(usedUnits.filter(u => !villages.some(v => (v.troops[u] || 0) > 0)));
        const unitHeaders = usedUnits.map(u => {
            const on    = active.has(u);
            const empty = emptyUnits.has(u);
            if (empty) {
                return `<th class="sim-unit-th sim-u-empty" title="${UNIT_LABEL[u] || u} — sem tropas">${unitIconHtml(u)}</th>`;
            }
            return `<th class="sim-unit-th ${on ? 'sim-u-on' : 'sim-u-off'}" data-unit="${u}" title="${UNIT_LABEL[u] || u} — clica para ${on ? 'desactivar' : 'activar'}">${unitIconHtml(u)}</th>`;
        }).join('');

        const trs = rows.map(({ r, sec, depMs }, i) => {
            const depFmt  = fmtDatetime(depMs);
            const remSec  = Math.max(0, Math.floor((depMs - Date.now()) / 1000));
            const remFmt  = fmtDuration(remSec);
            const urgent  = remSec < 300; // < 5 min

            const unitCells = usedUnits.map(u => {
                const count = r.troops[u] || 0;
                const on    = active.has(u);
                if (!count) return `<td class="sim-zero">0</td>`;
                if (!on)    return `<td>${count}</td>`;
                return `<td class="sim-cell-on" data-unit="${u}" data-editable="1">${count}</td>`;
            }).join('');

            /* Only send the green (active) units — non-selected units would change travel speed */
            const troopsForUrl = {};
            for (const [u, c] of Object.entries(r.troops)) if (c > 0 && active.has(u)) troopsForUrl[u] = c;
            const url = buildAttackUrl(r.villageId, targetX, targetY, troopsForUrl, targetVillageId);

            /* Kumin entry: use arrival time + leave select at default "arrival", matching kumin_gluer behaviour */
            const arrDate   = new Date(arrivalMs);
            const kuminDate = `${arrDate.getFullYear()}-${pad2(arrDate.getMonth()+1)}-${pad2(arrDate.getDate())}`
                            + `T${pad2(arrDate.getHours())}:${pad2(arrDate.getMinutes())}:${pad2(arrDate.getSeconds())}`
                            + `.${String(arrivalMs % 1000).padStart(3,'0')}`;
            const kuminEntry = { name: r.name, source: `${r.x}|${r.y}`, target: `${targetX}|${targetY}`, date: kuminDate, commandType: _cmdType, units: troopsForUrl, sendMs: depMs };

            return `<tr data-vid="${r.villageId}">
  <td class="sim-village-cell" title="${r.name}">${i + 1}. ${r.name}</td>
  ${unitCells}
  <td class="sim-departure">${depFmt}</td>
  <td class="sim-countdown${urgent ? ' sim-urgent' : ''}" data-dep="${depMs}">${remFmt}</td>
  <td>
    <button class="btn-enviar" data-url="${encodeURIComponent(url)}">Enviar</button>
    <button class="btn-kumin" data-kumin="${encodeURIComponent(JSON.stringify(kuminEntry))}">+ Kumin</button>
  </td>
</tr>`;
        }).join('');

        const emptyRow = !rows.length
            ? `<tr><td colspan="${usedUnits.length + 4}" style="padding:16px;text-align:center;color:#7d5c2e">Sem aldeias com partida futura para as unidades selecionadas.</td></tr>`
            : '';

        return `
<table id="sim-table">
  <thead>
    <tr>
      <th class="left">Aldeia</th>
      ${unitHeaders}
      <th>Hora de Saída</th>
      <th>⏱</th>
      <th>Comando</th>
    </tr>
  </thead>
  <tbody>${emptyRow}${trs}</tbody>
</table>`;
    }

    function reRenderTable() {
        if (!_lastCalc) return;
        const { villages, usedUnits, tx, ty, targetVillageId, arrivalMs, cfg } = _lastCalc;
        const bodyEl = document.getElementById('sim-body');
        const pageEl = document.getElementById('sim-pagination');
        bodyEl.innerHTML = renderTable(villages, usedUnits, tx, ty, targetVillageId, arrivalMs, cfg, _selUnits);
        const shown = bodyEl.querySelectorAll('#sim-table tbody tr').length;
        pageEl.textContent = `${shown} aldeias com partida futura · Chegada: ${fmtDatetime(arrivalMs)}`;
        startCountdown();
    }

    function startCountdown() {
        if (_countdownTimer) clearInterval(_countdownTimer);
        _countdownTimer = setInterval(() => {
            const now = Date.now();
            document.querySelectorAll('#sim-table td.sim-countdown').forEach(td => {
                const depMs = parseInt(td.getAttribute('data-dep'), 10);
                const rem   = Math.floor((depMs - now) / 1000);
                if (rem <= 0) {
                    /* Departure passed while table was open — remove the row */
                    td.closest('tr')?.remove();
                    /* Re-number remaining rows */
                    document.querySelectorAll('#sim-table tbody tr').forEach((tr, i) => {
                        const cell = tr.querySelector('.sim-village-cell');
                        if (cell) cell.textContent = cell.textContent.replace(/^\d+\./, `${i + 1}.`);
                    });
                } else {
                    td.textContent = fmtDuration(rem);
                    td.classList.toggle('sim-urgent', rem < 300);
                }
            });
        }, 1000);
    }

    /* ═══════════════════════════════════════════════════════════════════════
       MAIN — open dialog
    ═══════════════════════════════════════════════════════════════════════ */

    async function openDialog() {
        injectStyle();
        _docked = true;

        /* Remove any existing instance */
        document.getElementById('sim-overlay')?.remove();

        /* Fetch groups for the dropdown */
        const groups = await fetchGroups();

        /* Inject HTML — default: docked inside the page content container */
        const wrapper = document.createElement('div');
        wrapper.innerHTML = buildDialogHtml(groups);
        const overlay = wrapper.firstElementChild;
        overlay.classList.add('sim-docked');

        const container = document.getElementById('contentContainer')
                       || document.getElementById('content_value')
                       || document.querySelector('#main-content, .content-main, #content')
                       || document.body;
        container.prepend(overlay);

        /* Drag — disabled while docked */
        const draggable = makeDraggable(overlay, document.getElementById('sim-titlebar'));
        draggable.disable();
        _destroyDrag = () => draggable.destroy();

        /* Resize — active only when floating */
        const resizable = makeResizable(overlay, document.getElementById('sim-resize-handle'));
        _destroyResize = () => resizable.destroy();

        /* Dock button — toggles between embedded and floating */
        document.getElementById('sim-dock').addEventListener('click', () => {
            const dockBtn = document.getElementById('sim-dock');
            if (_docked) {
                /* Float it */
                document.body.appendChild(overlay);
                overlay.classList.remove('sim-docked');
                draggable.enable();
                dockBtn.textContent = '⊟';
                dockBtn.title = 'Encaixar na página';
                _docked = false;
            } else {
                /* Re-dock it */
                container.prepend(overlay);
                overlay.classList.add('sim-docked');
                draggable.disable();
                dockBtn.textContent = '⊞';
                dockBtn.title = 'Soltar para flutuar';
                _docked = true;
            }
        });

        /* Close button */
        document.getElementById('sim-close').addEventListener('click', () => {
            if (_countdownTimer) { clearInterval(_countdownTimer); _countdownTimer = null; }
            _destroyDrag?.(); _destroyDrag = null;
            _destroyResize?.(); _destroyResize = null;
            _docked = true;
            overlay.remove();
            document.getElementById('sim-toggle-btn')?.classList.remove('sim-btn-active');
        });

        /* Auto-format inputs */
        overlay.querySelector('[name=target]').addEventListener('input', function() {
            if (/^\d{3}$/.test(this.value)) this.value += '|';
        });
        overlay.querySelector('[name=date]').addEventListener('input', function() {
            if (/^\d{2}$/.test(this.value))        this.value += '/';
            else if (/^\d{2}\/\d{2}$/.test(this.value)) this.value += '/';
        });
        overlay.querySelector('[name=time]').addEventListener('input', function() {
            if (/^\d{2}$/.test(this.value))               this.value += ':';
            else if (/^\d{2}:\d{2}$/.test(this.value))   this.value += ':';
            else if (/^\d{2}:\d{2}:\d{2}$/.test(this.value)) this.value += '.';
        });

        /* Command type buttons */
        const initType = overlay.querySelector('[name=commandType]').value || 'Attack';
        _cmdType = initType;
        overlay.classList.add(initType === 'Attack' ? 'sim-attack' : 'sim-support');
        overlay.querySelectorAll('.sim-cmd-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const type = btn.getAttribute('data-type');
                _cmdType = type;
                overlay.querySelector('[name=commandType]').value = type;
                overlay.querySelectorAll('.sim-cmd-btn').forEach(b => b.classList.remove('sim-cmd-active'));
                btn.classList.add('sim-cmd-active');
                overlay.classList.remove('sim-attack', 'sim-support');
                overlay.classList.add(type === 'Attack' ? 'sim-attack' : 'sim-support');
                saveInputs(overlay);
            });
        });

        /* Refresh coords + time: update target from page coords; reset arrival time to now if stored time is in the past */
        document.getElementById('sim-refresh-all').addEventListener('click', () => {
            const c = readPageCoords();
            if (c) {
                overlay.querySelector('[name=target]').value = `${c.x}|${c.y}`;
            }

            const dateVal = overlay.querySelector('[name=date]').value.trim();
            const timeVal = overlay.querySelector('[name=time]').value.trim();
            const [timePart, msPart = '0'] = timeVal.split('.');
            const storedMs = parseDatetime(dateVal, timePart);
            const msOffset = parseInt(msPart, 10) || 0;
            if (!storedMs || (storedMs + msOffset) < Date.now()) {
                const d = new Date();
                overlay.querySelector('[name=date]').value = `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
                overlay.querySelector('[name=time]').value = `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}.000`;
            }

            saveInputs(overlay);
        });

        /* Command row click → fill arrival time */
        function attachCommandRowHandlers() {
            document.querySelectorAll('#commands_outgoings tr.command-row').forEach(tr => {
                if (tr.__simBound) return;
                tr.__simBound = true;
                tr.addEventListener('click', () => {
                    const endSpan = tr.querySelector('span[data-endtime]');
                    const endSec  = parseInt(endSpan?.getAttribute('data-endtime') || '0', 10);
                    if (!endSec) return;
                    const msEl = tr.querySelector('td span.grey.small');
                    const ms   = parseInt(msEl?.textContent?.trim() || '0', 10);
                    const d    = new Date(endSec * 1000);
                    overlay.querySelector('[name=date]').value = `${pad2(d.getDate())}/${pad2(d.getMonth()+1)}/${d.getFullYear()}`;
                    overlay.querySelector('[name=time]').value = `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}.${String(ms).padStart(3,'0')}`;
                    saveInputs(overlay);
                    document.querySelectorAll('#commands_outgoings tr.command-row').forEach(r => {
                        r.style.outline = '';
                        r.style.backgroundColor = '';
                    });
                    tr.style.outline = '2px solid #5a3a1a';
                    tr.style.backgroundColor = '#f0dfa8';
                });
            });
        }
        attachCommandRowHandlers();
        const _rowPoll = setInterval(() => {
            if (!document.getElementById('sim-overlay')) { clearInterval(_rowPoll); return; }
            attachCommandRowHandlers();
        }, 2000);

        /* Delegate clicks: Enviar buttons + unit header toggles */
        document.getElementById('sim-body').addEventListener('click', e => {
            const btn = e.target.closest('.btn-enviar');
            if (btn) { window.open(decodeURIComponent(btn.getAttribute('data-url')), '_blank'); return; }

            const kuminBtn = e.target.closest('.btn-kumin');
            if (kuminBtn) {
                try {
                    const entry = JSON.parse(decodeURIComponent(kuminBtn.getAttribute('data-kumin')));
                    const q = JSON.parse(localStorage.getItem('twKuminGluer_queue') || '[]');
                    q.push(entry);
                    localStorage.setItem('twKuminGluer_queue', JSON.stringify(q));
                    const vid = getCurrentVillageId();
                    const memoUrl = vid
                        ? `${location.origin}/game.php?village=${vid}&screen=memo`
                        : `${location.origin}/game.php?screen=memo`;
                    window.open(memoUrl, '_blank', 'noopener,noreferrer');
                } catch (err) {
                    console.error('[Planeador] Kumin queue error:', err);
                }
                return;
            }

            const th = e.target.closest('th[data-unit]');
            if (th) {
                const unit = th.getAttribute('data-unit');
                if (_selUnits.has(unit)) _selUnits.delete(unit);
                else _selUnits.add(unit);
                reRenderTable();
                return;
            }

            const editCell = e.target.closest('td[data-editable]');
            if (editCell && !editCell.querySelector('.sim-troop-input')) {
                const unit = editCell.getAttribute('data-unit');
                const vid  = editCell.closest('tr')?.getAttribute('data-vid');
                const cur  = parseInt(editCell.textContent, 10) || 0;
                editCell.innerHTML = `<input class="sim-troop-input" type="number" min="0" value="${cur}">`;
                const inp = editCell.querySelector('.sim-troop-input');
                inp.focus(); inp.select();

                function commit() {
                    const newVal = Math.max(0, parseInt(inp.value, 10) || 0);
                    const village = _lastCalc?.villages.find(v => v.villageId === vid);
                    if (village) { village.troops[unit] = newVal; reRenderTable(); }
                }
                inp.addEventListener('blur', commit);
                inp.addEventListener('keydown', ev => {
                    if (ev.key === 'Enter')  { inp.removeEventListener('blur', commit); commit(); }
                    if (ev.key === 'Escape') { inp.removeEventListener('blur', commit); reRenderTable(); }
                });
            }
        });

        /* CALCULAR */
        document.getElementById('sim-calcular').addEventListener('click', () => {
            saveInputs(overlay);
            runCalc(overlay);
        });
    }

    async function runCalc(overlay) {
        const statusEl = document.getElementById('sim-status');
        const bodyEl   = document.getElementById('sim-body');
        const pageEl   = document.getElementById('sim-pagination');

        const rawTarget = overlay.querySelector('[name=target]').value.trim();
        const rawDate   = overlay.querySelector('[name=date]').value.trim();
        const rawTime   = overlay.querySelector('[name=time]').value.trim();
        const groupId   = overlay.querySelector('[name=group]').value;

        /* Validate target coords */
        const coordM = rawTarget.match(/(\d+)[|,\s]+(\d+)/);
        if (!coordM) { statusEl.textContent = '⚠ Coordenadas de alvo inválidas. Usa o formato 500|500.'; return; }
        const tx = parseInt(coordM[1], 10);
        const ty = parseInt(coordM[2], 10);

        /* Validate arrival datetime — format HH:MM:SS.mmm */
        const [timePart, msPart = '0'] = rawTime.split('.');
        const rawMs     = Math.max(0, Math.min(999, parseInt(msPart, 10) || 0));
        const arrivalMs = parseDatetime(rawDate, timePart);
        if (!arrivalMs) { statusEl.textContent = '⚠ Data/Hora inválidas. Usa DD/MM/AAAA e HH:MM:SS.mmm.'; return; }
        const arrivalMsFull = arrivalMs + rawMs;

        statusEl.textContent = '⏳ A buscar configurações do servidor…';
        bodyEl.innerHTML = '';
        pageEl.textContent = '';

        /* Fetch server config */
        const cfg = await fetchServerConfig();
        statusEl.textContent = `⏳ Servidor: velocidade=${cfg.gameSpeed}, unidades=${cfg.unitSpeed}. A buscar aldeias…`;

        /* Fetch villages */
        const villages = await fetchVillages(groupId);
        if (!villages.length) {
            statusEl.textContent = '⚠ Sem dados de aldeias. Certifica-te de que estás na página correcta.';
            return;
        }

        /* Resolve target village id in background; re-render once known */
        let targetVillageId = null;
        lookupTargetVillageId(tx, ty).then(id => {
            if (!id) return;
            targetVillageId = id;
            if (_lastCalc) { _lastCalc.targetVillageId = id; reRenderTable(); }
        });

        /* Always show all unit types; renderTable will grey out empty columns */
        const usedUnits = UNIT_ORDER.slice();

        /* Reset selection to all units on a fresh calc */
        _selUnits = new Set(usedUnits);

        /* Store for re-render on unit toggle */
        _lastCalc = { villages, usedUnits, tx, ty, targetVillageId, arrivalMs: arrivalMsFull, cfg };

        reRenderTable();
        statusEl.textContent = `✓ ${villages.length} aldeias · gameSpeed=${cfg.gameSpeed} · unitSpeed=${cfg.unitSpeed} · clica nos ícones para filtrar unidades`;
    }

    /* ── Drag helper ─────────────────────────────────────────────────────── */
    function makeDraggable(el, handle) {
        let ox = 0, oy = 0, dragging = false, enabled = true;
        const onDown = e => {
            if (!enabled) return;
            dragging = true;
            ox = e.clientX - el.getBoundingClientRect().left;
            oy = e.clientY - el.getBoundingClientRect().top;
            e.preventDefault();
        };
        const onMove = e => {
            if (!dragging) return;
            el.style.left      = (e.clientX - ox) + 'px';
            el.style.top       = (e.clientY - oy) + 'px';
            el.style.transform = 'none';
        };
        const onUp = () => { dragging = false; };
        handle.addEventListener('mousedown', onDown);
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
        return {
            enable()  { enabled = true; },
            disable() { enabled = false; dragging = false; },
            destroy() {
                handle.removeEventListener('mousedown', onDown);
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
            },
        };
    }

    /* ── Resize helper ───────────────────────────────────────────────────── */
    function makeResizable(el, handle) {
        let sx, sy, sw, sh, active = false;
        const onDown = e => {
            if (el.classList.contains('sim-docked')) return;
            sx = e.clientX; sy = e.clientY;
            sw = el.offsetWidth; sh = el.offsetHeight;
            active = true;
            e.preventDefault(); e.stopPropagation();
        };
        const onMove = e => {
            if (!active) return;
            el.style.width  = Math.max(500, sw + (e.clientX - sx)) + 'px';
            el.style.height = Math.max(260, sh + (e.clientY - sy)) + 'px';
        };
        const onUp = () => { active = false; };
        handle.addEventListener('mousedown', onDown);
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
        return {
            destroy() {
                handle.removeEventListener('mousedown', onDown);
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
            },
        };
    }

    /* ── Toggle button ───────────────────────────────────────────────────── */
    function ensureToggleButton() {
        if (document.getElementById('sim-toggle-btn')) return;
        const anchor = document.getElementById('new_quest');
        if (!anchor) return;

        injectStyle();
        const btn = document.createElement('div');
        btn.className = 'quest';
        btn.id = 'sim-toggle-btn';
        btn.title = 'Planeador';
        btn.textContent = '🗺️';
        btn.addEventListener('click', () => {
            const existing = document.getElementById('sim-overlay');
            if (existing) {
                existing.remove();
                if (_countdownTimer) { clearInterval(_countdownTimer); _countdownTimer = null; }
                _destroyDrag?.(); _destroyDrag = null;
                _destroyResize?.(); _destroyResize = null;
                btn.classList.remove('sim-btn-active');
            } else {
                openDialog().then(() => btn.classList.add('sim-btn-active'));
            }
        });
        anchor.parentNode.insertBefore(btn, anchor.nextSibling);
    }

    /* ═══════════════════════════════════════════════════════════════════════
       KUMIN QUEUE — process pending entries when on screen=memo
    ═══════════════════════════════════════════════════════════════════════ */

    const KUMIN_QUEUE_KEY = 'twKuminGluer_queue';
    const KUMIN_ALL_UNITS = ['spear','sword','axe','archer','spy','light','marcher','heavy','ram','catapult','snob','knight'];

    function nativeSet(el, value) {
        if (!el) return;
        const proto  = el.tagName === 'SELECT' ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
        if (setter) setter.call(el, value); else el.value = value;
        el.dispatchEvent(new Event('input',  { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function initMemo() {
        const raw = localStorage.getItem(KUMIN_QUEUE_KEY);
        if (!raw) return;
        let queue;
        try { queue = JSON.parse(raw); } catch { return; }
        if (!Array.isArray(queue) || !queue.length) return;

        let attempts = 0;
        const waitForForm = () => {
            if (document.getElementById('quickAddName')) {
                processKuminQueue(queue);
            } else if (++attempts < 50) {
                setTimeout(waitForForm, 250);
            }
        };
        setTimeout(waitForForm, 600);
    }

    function processKuminQueue(queue) {
        let idx = 0;

        function fillNext() {
            if (idx >= queue.length) { localStorage.removeItem(KUMIN_QUEUE_KEY); return; }
            const e       = queue[idx++];
            const nameEl  = document.getElementById('quickAddName');
            const srcEl   = document.getElementById('quickAddSource');
            const tgtEl   = document.getElementById('quickAddTarget');
            const dtEl    = document.getElementById('quickAddDate');
            const typeEl  = document.getElementById('quickAddCommandTypeSelection');
            const editBtn = document.getElementById('quickAddEdit');
            if (!nameEl || !editBtn) return;

            nativeSet(nameEl, e.name        || '');
            nativeSet(srcEl,  e.source      || '');
            nativeSet(tgtEl,  e.target      || '');
            nativeSet(dtEl,   e.date        || '');
            if (typeEl) nativeSet(typeEl, e.commandType || 'Attack');

            setTimeout(() => {
                editBtn.click();
                waitForEditor(e, fillNext);
            }, 350);
        }

        function waitForEditor(entry, onDone) {
            let attempts = 0;
            function check() {
                const popupDate = document.getElementById('popupDate');
                const createBtn = findCreateBtn();
                if (popupDate && createBtn) {
                    nativeSet(popupDate, entry.date || '');
                    setUnits(entry);
                    setTimeout(() => { createBtn.click(); setTimeout(onDone, 800); }, 400);
                } else if (++attempts < 50) {
                    setTimeout(check, 200);
                } else {
                    onDone();
                }
            }
            setTimeout(check, 400);
        }

        function findCreateBtn() {
            return Array.from(document.querySelectorAll('button, input[type="submit"]'))
                .find(b => {
                    const t = (b.textContent || b.value || '').toLowerCase().replace(/\s+/g, ' ').trim();
                    return t.includes('create new') || t.includes('criar novo') || t.includes('novo') || t.includes('new');
                }) || null;
        }

        function setUnits(entry) {
            const units = entry.units;
            if (!units || typeof units !== 'object') return;
            KUMIN_ALL_UNITS.forEach(u => { const cb = document.getElementById(`${u}_all`); if (cb?.checked) cb.click(); });
            KUMIN_ALL_UNITS.forEach(u => {
                const amount = units[u];
                const input  = document.getElementById(`unit_input_${u}`)
                            || document.querySelector(`input[name="${u}"].unitsInput`)
                            || document.querySelector(`input[name="${u}"]`);
                if (!input) return;
                nativeSet(input, (amount && amount > 0) ? String(amount) : '');
            });
        }

        fillNext();
    }

    /* ── Boot ────────────────────────────────────────────────────────────── */
    function boot() {
        if (isMemo) { initMemo(); return; }
        ensureToggleButton();
        let tries = 0;
        const t = setInterval(() => {
            ensureToggleButton();
            if (document.getElementById('sim-toggle-btn') || ++tries > 60) clearInterval(t);
        }, 200);
    }

    if (typeof $ !== 'undefined' && typeof TribalWars !== 'undefined') {
        boot();
    } else {
        const poll = setInterval(() => {
            if (typeof $ !== 'undefined' && typeof TribalWars !== 'undefined') {
                clearInterval(poll);
                boot();
            }
        }, 200);
    }

})();

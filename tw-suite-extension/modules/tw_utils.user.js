// ==UserScript==
// @name         TW Utils
// @namespace    tw_utils
// @version      1.2.0
// @description  Utilitários variados para o TribalWars PT.
// @match        https://*.tribalwars.com.pt/game.php*
// ==/UserScript==

(function () {
    'use strict';

    if (window.__twUtilsLoaded) return;
    window.__twUtilsLoaded = true;

    /* Settings injected by xBot via the config bridge */
    const cfg = window.__twSuiteCfg?.('tw_utils') ?? {};

    /* ═══════════════════════════════════════════════════════════════════════
       HELPERS
    ═══════════════════════════════════════════════════════════════════════ */

    function getCurrentScreen() {
        return new URLSearchParams(window.location.search).get('screen') || '';
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /* ═══════════════════════════════════════════════════════════════════════
       CSS
    ═══════════════════════════════════════════════════════════════════════ */

    const CSS = `
.tw-incf-btn {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    vertical-align: -3px;
    line-height: 0;
    padding: 3px 4px;
    border: 1px solid #603000;
    border-radius: 3px;
    background: #e9d0a9;
    box-shadow: 1px 1px 2px rgba(0,0,0,0.30);
    margin: 0 4px 0 2px;
    user-select: none;
}
.tw-incf-btn:hover {
    background: #f0dca0;
    border-color: #4a2000;
}
.tw-incf-btn.active {
    background: #d4b8a0;
    border-color: #8b3a3a;
    box-shadow: inset 1px 1px 2px rgba(0,0,0,0.30);
}
.tw-incf-btn img { display: block; width: 18px; height: 18px; }
.tw-incf-forbidden {
    display: none;
    position: absolute;
    inset: 0;
    pointer-events: none;
}
.tw-incf-btn.active .tw-incf-forbidden { display: block; }
.tw-incf-forbidden::before {
    content: '';
    position: absolute;
    inset: 1px;
    border: 2px solid #cc0000;
    border-radius: 50%;
    box-sizing: border-box;
}
.tw-incf-forbidden::after {
    content: '';
    position: absolute;
    top: 50%;
    left: 8%;
    width: 84%;
    height: 1.5px;
    background: #cc0000;
    transform: rotate(135deg);
    transform-origin: center;
    margin-top: -0.75px;
}
#tw-qb-toggle {
    display: inline-block;
    cursor: pointer;
    font-weight: bold;
    font-size: 13px;
    line-height: 1.4;
    padding: 1px 6px;
    border: 1px solid #603000;
    border-radius: 3px;
    background: #e9d0a9;
    box-shadow: 1px 1px 2px rgba(0,0,0,0.30);
    margin: 0 6px 0 0;
    vertical-align: middle;
    user-select: none;
}
#tw-qb-toggle:hover { background: #f0dca0; border-color: #4a2000; }
.tw-bc-btn {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    vertical-align: -3px;
    line-height: 0;
    padding: 3px 4px;
    border: 1px solid #603000;
    border-radius: 3px;
    background: #e9d0a9;
    box-shadow: 1px 1px 2px rgba(0,0,0,0.30);
    margin: 0 4px 0 2px;
    user-select: none;
    float: right;
}
.tw-bc-btn:hover { background: #f5ddb8; }
.tw-bc-btn img { width: 18px; height: 18px; display: block; }
.tw-bc-counter {
    font-size: 10px;
    font-family: Verdana, Arial, sans-serif;
    color: #8b1a00;
    font-weight: bold;
    white-space: nowrap;
    float: right;
    line-height: 18px;
    margin-right: 2px;
}
#tw-bc-fixed {
    position: fixed;
    bottom: 8px;
    right: 8px;
    z-index: 8990;
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 3px 7px 3px 5px;
    background: #e9d0a9;
    border: 1px solid #603000;
    border-radius: 3px;
    box-shadow: 1px 1px 2px rgba(0,0,0,0.25);
    cursor: pointer;
    font-family: Verdana, Arial, sans-serif;
    font-size: 10px;
    font-weight: bold;
    color: #8b1a00;
    user-select: none;
    transition: opacity 0.15s;
}
#tw-bc-fixed:hover { background: #f5ddb8; border-color: #4a2000; }
#tw-bc-fixed.tw-bc-empty { opacity: 0.4; pointer-events: none; }
#tw-bc-fixed img { width: 16px; height: 16px; display: block; }
/* Unit Max */
#tw-umax-btn {
    display: inline-block;
    cursor: pointer;
    font-weight: bold;
    font-size: 10px;
    line-height: 1.4;
    padding: 1px 5px;
    border: 1px solid #603000;
    border-radius: 3px;
    background: #e9d0a9;
    box-shadow: 1px 1px 2px rgba(0,0,0,0.25);
    margin-left: 6px;
    vertical-align: middle;
    user-select: none;
    color: #603000;
}
#tw-umax-btn:hover { background: #f0dca0; border-color: #4a2000; }
#tw-umax-btn.active { background: #c8e6c9; border-color: #388e3c; color: #1b5e20; }
#tw-umax-sim-btn {
    display: inline-block;
    cursor: pointer;
    font-weight: bold;
    font-size: 10px;
    line-height: 1.4;
    padding: 1px 5px;
    border: 1px solid #1a237e;
    border-radius: 3px;
    background: #e8eaf6;
    box-shadow: 1px 1px 2px rgba(0,0,0,0.20);
    margin-left: 3px;
    vertical-align: middle;
    user-select: none;
    color: #1a237e;
}
#tw-umax-sim-btn:hover { background: #c5cae9; }
#tw-umax-sim-btn.loading { opacity: 0.6; pointer-events: none; }
/* Map Draw Select */
#tw-mds-rubber {
    position: fixed; z-index: 99999; pointer-events: none; display: none;
    border: 2px dashed rgba(51,255,0,0.9);
    background: rgba(155,252,10,0.12);
}
.DSMDrawOverlay {
    position: absolute; z-index: 50;
    width: 53px; height: 38px;
    pointer-events: none;
}
#tw-umax-sim-panel {
    margin: 4px 0 2px;
    padding: 5px 8px;
    border-radius: 3px;
    font-size: 11px;
    font-family: Verdana, Arial, sans-serif;
    line-height: 1.6;
}
#tw-umax-sim-panel.tw-umax-sim-ok {
    background: #e8f0fe;
    border: 1px solid #3f51b5;
    color: #1a237e;
}
#tw-umax-sim-panel.tw-umax-sim-warn {
    background: #fff8e1;
    border: 1px solid #ffc107;
    color: #6d4c00;
}
#tw-umax-panel {
    margin: 4px 0 2px;
    padding: 5px 7px;
    background: #f0f8f0;
    border: 1px solid #8bc34a;
    border-radius: 3px;
    font-size: 11px;
    font-family: Verdana, Arial, sans-serif;
    line-height: 1.8;
}
#tw-umax-panel .tw-umax-title {
    font-weight: bold;
    color: #1b5e20;
    margin-bottom: 4px;
    font-size: 10px;
    display: block;
}
#tw-umax-panel .tw-umax-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 3px 12px;
}
#tw-umax-panel .tw-umax-item {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    white-space: nowrap;
}
#tw-umax-panel .tw-umax-item img { width: 16px; height: 16px; vertical-align: middle; }
#tw-umax-panel .tw-umax-away { color: #6a6a6a; font-size: 10px; }
#tw-umax-panel .tw-umax-support { color: #1565c0; }
#tw-umax-panel .tw-umax-stale { color: #999; font-size: 10px; font-style: italic; font-weight: normal; }
.tw-umax-inline { font-size: 11px; margin-left: 4px; }
.tw-umax-inline strong { color: #1b5e20; }
.tw-umax-inline .tw-umax-support { color: #1565c0; }
.tw-umax-inline .tw-umax-away { color: #6a6a6a; }
`;

    function injectStyle() {
        if (document.getElementById('tw-utils-style')) return;
        const st = document.createElement('style');
        st.id = 'tw-utils-style';
        st.textContent = CSS;
        document.head.appendChild(st);
    }

    /* ═══════════════════════════════════════════════════════════════════════
       VILLAGE SWITCHER
       Registers a native a.mp button via TWMap.context so TW handles
       own-village detection, positioning and __village__ substitution.
    ═══════════════════════════════════════════════════════════════════════ */

    function initVillageSwitcher() {
        if (getCurrentScreen() !== 'map') return;
        if (typeof TWMap === 'undefined' || !TWMap?.context || !TWMap?.urls?.ctx) return;

        const container = document.getElementById('map-ctx-buttons');
        if (!container) return;

        container.insertAdjacentHTML('beforeend',
            `<a class="mp" id="mp_switch" title="Mudar para esta aldeia" href="/game.php?screen=map"` +
            ` style="opacity:0;display:none;background-position:-384px 0px;"></a>` +
            `<style>#mp_switch:hover{background-position:-384px -24px !important;}</style>`
        );

        TWMap.context._ownOrder.push('mp_switch');
        TWMap.context._circlePos.push([-12, -80]);

        const sitterFrag = game_data.player.sitter !== '0'
            ? `t=${game_data.player.id}&`
            : '';

        Object.defineProperty(TWMap.urls.ctx, 'mp_switch', {
            get() {
                return `/game.php?village=__village__&${sitterFrag}screen=map${location.hash}`;
            },
        });
    }

    /* ═══════════════════════════════════════════════════════════════════════
       INCOMING FILTER
       Adds a support-icon toggle button to incoming tables (#show_incoming_units,
       #commands_incomings). Clicking hides all support rows; clicking again
       restores them. The icon gets a red forbidden overlay when active.
    ═══════════════════════════════════════════════════════════════════════ */

    const SUPPORT_FRAGMENT = 'graphic/command/support.webp';

    function supportIconUrl() {
        const base = (typeof game_data !== 'undefined' && game_data.graphic_path)
            ? game_data.graphic_path
            : 'https://dspt.innogamescdn.com/asset/610fa902/';
        return `${base}${SUPPORT_FRAGMENT}`;
    }

    function isSupportRow(tr) {
        return [...tr.querySelectorAll('img:not([data-twincf])')].some(img => img.src.includes(SUPPORT_FRAGMENT));
    }

    function applyFilter(table, hide) {
        table.querySelectorAll('tbody tr, tr').forEach(tr => {
            if (tr.closest('thead')) return;
            if (isSupportRow(tr)) tr.style.display = hide ? 'none' : '';
        });
    }

    function attachFilterButton(table) {
        if (table.dataset.twIncfAttached) return;
        table.dataset.twIncfAttached = '1';

        const headerCell =
            table.querySelector('thead tr th:first-child') ||
            table.querySelector('thead tr td:first-child') ||
            table.querySelector('tr:first-child th:first-child') ||
            table.querySelector('tr:first-child td:first-child');

        if (!headerCell) return;

        const btn = document.createElement('span');
        btn.className = 'tw-incf-btn';
        btn.title = 'Ocultar / mostrar apoios';

        const img = document.createElement('img');
        img.src = supportIconUrl();
        img.alt = 'Apoio';
        img.dataset.twincf = '1';

        const forbidden = document.createElement('span');
        forbidden.className = 'tw-incf-forbidden';

        btn.appendChild(img);
        btn.appendChild(forbidden);

        let hidden = false;
        btn.addEventListener('click', () => {
            hidden = !hidden;
            btn.classList.toggle('active', hidden);
            applyFilter(table, hidden);
        });

        headerCell.insertAdjacentElement('afterbegin', btn);
    }

    function processTables() {
        document.querySelectorAll(
            '#show_incoming_units, #commands_incomings, ' +
            'table#show_incoming_units, table#commands_incomings'
        ).forEach(el => {
            const table = el.matches('table') ? el : el.querySelector('table');
            if (table) attachFilterButton(table);
        });
    }

    function initIncomingFilter() {
        processTables();
        new MutationObserver(processTables)
            .observe(document.body, { childList: true, subtree: true });
    }

    /* ═══════════════════════════════════════════════════════════════════════
       QUICKBAR COLLAPSE
       Adds a –/+ button inside #quickbar_contents to collapse/expand the
       quickbar. State persists in localStorage across page navigations.
    ═══════════════════════════════════════════════════════════════════════ */

    const QB_KEY = 'tw_qb_collapsed';

    function applyQbState(contents, collapsed) {
        const btn = document.getElementById('tw-qb-toggle');
        if (!btn) return;
        contents.querySelectorAll('ul').forEach(ul => { ul.style.display = collapsed ? 'none' : ''; });
        btn.textContent = collapsed ? '+' : '−';
        btn.title = collapsed ? 'Expandir quickbar' : 'Minimizar quickbar';
    }

    function initQuickbarCollapse() {
        function setup() {
            const contents = document.getElementById('quickbar_contents');
            if (!contents || document.getElementById('tw-qb-toggle')) return;

            const btn = document.createElement('span');
            btn.id = 'tw-qb-toggle';
            btn.addEventListener('click', () => {
                const next = localStorage.getItem(QB_KEY) !== '1';
                localStorage.setItem(QB_KEY, next ? '1' : '0');
                applyQbState(contents, next);
            });

            contents.insertAdjacentElement('afterbegin', btn);
            applyQbState(contents, localStorage.getItem(QB_KEY) === '1');
        }

        setup();
        new MutationObserver(setup).observe(document.body, { childList: true, subtree: true });
    }

    /* ═══════════════════════════════════════════════════════════════════════
       BULK CANCEL
       • In-table button: floated right in the last <th> of any command table
         that contains .command-cancel links (context-aware).
       • Fixed button (#tw-bc-fixed): always present on screen=place even when
         there are no commands to cancel; dims when count is 0.
       Clicking either button fetches every .command-cancel href sequentially
       (250 ms apart) then reloads the page.
       Overlay can trigger cancel via CustomEvent xbot:twutils:cancelAll.
    ═══════════════════════════════════════════════════════════════════════ */

    const DELETE_FRAGMENT = 'graphic/delete.webp';

    function bcDelay() {
        const lo = Number(cfg.bcDelayMin ?? 100);
        const hi = Number(cfg.bcDelayMax ?? 200);
        return lo + Math.random() * (hi - lo);
    }

    function deleteIconUrl() {
        const base = (typeof game_data !== 'undefined' && game_data.graphic_path)
            ? game_data.graphic_path
            : 'https://dspt.innogamescdn.com/asset/0095440e/';
        return `${base}${DELETE_FRAGMENT}`;
    }

    function getCancelLinks() {
        return [...document.querySelectorAll('a.command-cancel[href]')];
    }

    async function cancelAll(btn, counter) {
        const links = getCancelLinks();
        if (!links.length) return;

        btn.style.pointerEvents = 'none';
        btn.style.opacity = '0.5';
        counter.textContent = `0/${links.length}`;

        let done = 0;
        for (const a of links) {
            try { await fetch(a.href, { credentials: 'include' }); } catch (_) {}
            done++;
            counter.textContent = `${done}/${links.length}`;
            if (done < links.length) await sleep(bcDelay());
        }

        counter.textContent = '✓';
        await sleep(800);
        location.reload();
    }

    function attachBulkCancelButton(table) {
        if (table.dataset.twBcAttached) return;
        table.dataset.twBcAttached = '1';

        const headerRow =
            table.querySelector('thead tr') ||
            table.querySelector('tr:first-child');
        if (!headerRow) return;

        const cells = headerRow.querySelectorAll('th, td');
        if (!cells.length) return;
        const lastCell = cells[cells.length - 1];

        const counter = document.createElement('span');
        counter.className = 'tw-bc-counter';

        const btn = document.createElement('span');
        btn.className = 'tw-bc-btn';
        btn.title = 'Cancelar todos os comandos';

        const img = document.createElement('img');
        img.src = deleteIconUrl();
        img.alt = 'Cancelar todos';
        img.dataset.twbc = '1';

        btn.appendChild(img);
        btn.addEventListener('click', () => cancelAll(btn, counter));

        // float right: insert counter first, then button (button ends up rightmost)
        lastCell.appendChild(counter);
        lastCell.appendChild(btn);
    }

    function processBcTables() {
        document.querySelectorAll('a.command-cancel[href]').forEach(a => {
            const table = a.closest('table');
            if (table) attachBulkCancelButton(table);
        });
    }

    /* Always-present fixed button — shown on screen=place regardless of commands */
    function injectBcFixed() {
        if (document.getElementById('tw-bc-fixed')) return;

        const wrap = document.createElement('div');
        wrap.id = 'tw-bc-fixed';
        wrap.title = 'Cancelar todos os comandos';

        const counter = document.createElement('span');
        counter.id = 'tw-bc-fixed-counter';

        const img = document.createElement('img');
        img.src = deleteIconUrl();
        img.alt = 'Cancelar todos';
        img.dataset.twbc = '1';

        wrap.appendChild(counter);
        wrap.appendChild(img);
        wrap.addEventListener('click', () => cancelAll(wrap, counter));

        document.body.appendChild(wrap);
        updateBcFixed();
    }

    let _bcLastCount = -1;
    function updateBcFixed() {
        const wrap = document.getElementById('tw-bc-fixed');
        const counter = document.getElementById('tw-bc-fixed-counter');
        if (!wrap || !counter) return;

        const count = getCancelLinks().length;
        if (count === _bcLastCount) return; // skip DOM write — would re-trigger the observer
        _bcLastCount = count;

        counter.textContent = count > 0 ? String(count) : '';
        if (count > 0) wrap.classList.remove('tw-bc-empty');
        else wrap.classList.add('tw-bc-empty');
    }

    const BULK_CANCEL_SCREENS = ['place', 'overview', 'info_village'];

    function initBulkCancel() {
        const screen = getCurrentScreen();
        if (!BULK_CANCEL_SCREENS.includes(screen)) return;
        if (screen === 'place' && location.href.includes('try=confirm')) return;

        injectBcFixed();
        processBcTables();

        let _bcTimer = null;
        new MutationObserver(() => {
            if (_bcTimer) return;
            _bcTimer = setTimeout(() => { _bcTimer = null; processBcTables(); updateBcFixed(); }, 250);
        }).observe(document.body, { childList: true, subtree: true });
    }

    /* ═══════════════════════════════════════════════════════════════════════
       UNIT MAX
       • screen=overview: MAX button on #show_units widget. Fetches
         screen=place&mode=call automatically to get incoming support, then
         injects totals inline on each existing unit row.
       • screen=place&mode=call: silently pre-caches #support_sum so the
         fetch is skipped when the user happens to visit that page first.
    ═══════════════════════════════════════════════════════════════════════ */

    const UMAX_SUPPORT_KEY  = 'tw_umax_support_v1';
    const UMAX_SUPPORT_TTL  = 10 * 60 * 1000; // 10 min
    const UMAX_SIM_KEY      = 'tw_umax_sim_v1';
    const UMAX_TEMPLATE_KEY = 'tw_umax_template_v1';
    const UMAX_SIM_UNITS    = ['spear','sword','axe','spy','light','heavy','ram','catapult','snob'];

    /* Baseline TW PT unit combat stats (used when VillageOverview is unavailable). */
    const UMAX_UNIT_STATS = {
        spear:    { attack: 10,  defense: 15,  defense_cavalry: 45 },
        sword:    { attack: 25,  defense: 50,  defense_cavalry: 25 },
        axe:      { attack: 40,  defense: 10,  defense_cavalry: 5  },
        spy:      { attack: 0,   defense: 2,   defense_cavalry: 1  },
        light:    { attack: 130, defense: 30,  defense_cavalry: 40 },
        heavy:    { attack: 150, defense: 200, defense_cavalry: 80 },
        ram:      { attack: 2,   defense: 20,  defense_cavalry: 50 },
        catapult: { attack: 100, defense: 100, defense_cavalry: 50 },
        snob:     { attack: 30,  defense: 100, defense_cavalry: 50 },
        militia:  { attack: 0,   defense: 15,  defense_cavalry: 45 },
    };

    function umaxParseCounts(rowClass) {
        const counts = {};
        document.querySelectorAll(`#unit_overview_table tr.${rowClass} strong[data-count]`).forEach(el => {
            const unit = el.dataset.count;
            counts[unit] = parseInt(el.textContent.replace(/[^\d]/g, ''), 10) || 0;
        });
        return counts;
    }

    function umaxSaveSupportSum() {
        const table = document.getElementById('support_sum');
        if (!table) return;
        const counts = {};
        table.querySelectorAll('tbody td[data-unit]').forEach(td => {
            const n = parseInt(td.textContent.trim().replace(/[^\d]/g, ''), 10) || 0;
            counts[td.dataset.unit] = (counts[td.dataset.unit] || 0) + n;
        });
        try {
            sessionStorage.setItem(UMAX_SUPPORT_KEY, JSON.stringify({ counts, ts: Date.now() }));
        } catch (_) {}
    }

    function umaxLoadCachedSupport() {
        try {
            const raw = sessionStorage.getItem(UMAX_SUPPORT_KEY);
            if (!raw) return null;
            const data = JSON.parse(raw);
            if (Date.now() - data.ts > UMAX_SUPPORT_TTL) return null;
            return data.counts;
        } catch (_) {
            return null;
        }
    }

    /* Fetches screen=overview_villages&mode=incomings, parses support rows for
       the current village. Falls back to empty if none found.
       Only caches results that contain actual troop counts (avoids poisoning
       the cache with empty objects on failure). */
    async function umaxFetchSupportSum() {
        const cached = umaxLoadCachedSupport();
        if (cached && Object.values(cached).some(n => n > 0)) return cached;

        const vid = typeof game_data !== 'undefined' ? game_data.village.id : null;
        const coord = typeof game_data !== 'undefined' && game_data.village ? game_data.village.coord : null;
        if (!vid) return {};

        try {
            const resp = await fetch(
                `/game.php?village=${vid}&screen=overview_villages&mode=incomings`,
                { credentials: 'include' }
            );
            const html = await resp.text();
            const doc = new DOMParser().parseFromString(html, 'text/html');
            const counts = {};

            doc.querySelectorAll('table tbody tr').forEach(tr => {
                if (!isSupportRow(tr)) return;
                // Verify this row targets the current village
                const links = [...tr.querySelectorAll('a[href]')];
                const isOurVillage = links.some(a =>
                    a.href.includes(`village=${vid}`) ||
                    (coord && a.textContent.includes(coord))
                );
                if (!isOurVillage) return;

                // Parse unit counts: img src encodes unit id, adjacent text node is count
                tr.querySelectorAll('img').forEach(img => {
                    const m = img.src.match(/unit_(\w+)/);
                    if (!m || !UMAX_SIM_UNITS.includes(m[1])) return;
                    const sib = img.nextSibling;
                    if (!sib || sib.nodeType !== 3) return;
                    const n = parseInt(sib.textContent.replace(/[^\d]/g, ''), 10) || 0;
                    if (n > 0) counts[m[1]] = (counts[m[1]] || 0) + n;
                });
            });

            if (Object.values(counts).some(n => n > 0)) {
                try {
                    sessionStorage.setItem(UMAX_SUPPORT_KEY, JSON.stringify({ counts, ts: Date.now() }));
                } catch (_) {}
            }
            return counts;
        } catch (_) {
            return {};
        }
    }

    /* Injects / removes inline MAX annotations on each all_unit row. */
    async function umaxApplyInline(widget, show, btn) {
        widget.querySelectorAll('.tw-umax-inline').forEach(el => el.remove());
        if (!show) return;

        btn.textContent = '…';
        btn.style.pointerEvents = 'none';

        const supportCounts = await umaxFetchSupportSum();

        btn.textContent = 'Total';
        btn.style.pointerEvents = '';

        const allCounts  = umaxParseCounts('all_unit');
        const homeCounts = umaxParseCounts('home_unit');

        widget.querySelectorAll('#unit_overview_table tr.all_unit').forEach(tr => {
            const strong = tr.querySelector('strong[data-count]');
            if (!strong) return;

            const unit    = strong.dataset.count;
            const own     = allCounts[unit]     || 0;
            const home    = homeCounts[unit]    || 0;
            const away    = own - home;
            const support = supportCounts[unit] || 0;
            const grand   = own + support;

            if (grand === 0) return;

            const span = document.createElement('span');
            span.className = 'tw-umax-inline';

            const parts = [];
            if (home > 0)    parts.push(`própria: ${home.toLocaleString('pt-PT')}`);
            if (away > 0)    parts.push(`<span class="tw-umax-support">apoio: ${away.toLocaleString('pt-PT')}</span>`);
            if (support > 0) parts.push(`<span class="tw-umax-away">a caminho: ${support.toLocaleString('pt-PT')}</span>`);

            // Always show the breakdown — grand total shown only when incoming support raises it above own
            const grandStr = support > 0 ? `→ <strong>${grand.toLocaleString('pt-PT')}</strong> ` : '';
            span.innerHTML = `${grandStr}<span class="tw-umax-away">(${parts.join('; ')})</span>`;
            strong.insertAdjacentElement('afterend', span);
        });
    }

    /* Parses incoming SUPPORT commands from the incomings tables already in the DOM.
       These are ally troops still en route — not yet counted in all_unit. */
    function umaxParseIncomingSupportFromDOM() {
        const counts = {};
        document.querySelectorAll('#show_incoming_units, #commands_incomings').forEach(container => {
            const table = container.matches('table') ? container : container.querySelector('table');
            if (!table) return;
            table.querySelectorAll('tbody tr').forEach(tr => {
                if (!isSupportRow(tr)) return;
                // Method A: strong[data-count] (used in the unit widget)
                tr.querySelectorAll('strong[data-count]').forEach(el => {
                    const unit = el.dataset.count;
                    const n = parseInt(el.textContent.replace(/[^\d]/g, ''), 10) || 0;
                    if (unit && n > 0) counts[unit] = (counts[unit] || 0) + n;
                });
                // Method B: img src encodes unit id, adjacent text node is the count
                tr.querySelectorAll('img').forEach(img => {
                    if (img.dataset.twincf) return;
                    const m = img.src.match(/unit_(\w+)/);
                    if (!m || !UMAX_SIM_UNITS.includes(m[1])) return;
                    const sib = img.nextSibling;
                    if (!sib || sib.nodeType !== 3) return;
                    const n = parseInt(sib.textContent.replace(/[^\d]/g, ''), 10) || 0;
                    if (n > 0) counts[m[1]] = (counts[m[1]] || 0) + n;
                });
            });
        });
        return counts;
    }

    /* Reads attack template saved by TwUtilsView from sessionStorage. */
    function umaxGetTemplate() {
        try {
            const raw = sessionStorage.getItem(UMAX_TEMPLATE_KEY);
            if (!raw) return null;
            return JSON.parse(raw);
        } catch (_) { return null; }
    }

    /* Gets unit combat stats from VillageOverview if available, else hardcoded. */
    function umaxGetUnitStats() {
        try {
            const groups = typeof VillageOverview !== 'undefined' && VillageOverview.units;
            if (groups) {
                for (const group of groups) {
                    if (!group) continue;
                    const stats = {};
                    let count = 0;
                    for (const [id, unit] of Object.entries(group)) {
                        if (unit && typeof unit === 'object' && unit.attack !== undefined) {
                            stats[id] = {
                                attack:           unit.attack || 0,
                                defense:          unit.defense || 0,
                                defense_cavalry:  unit.defense_cavalry || 0,
                            };
                            count++;
                        }
                    }
                    if (count > 0) return Object.assign({}, UMAX_UNIT_STATS, stats);
                }
            }
        } catch (_) {}
        return UMAX_UNIT_STATS;
    }

    const UMAX_WALL_KEY = '__wall__';

    /* Wall damage per wave from rams: floor(rams × 0.02 × (1 − level/25)), min 1 if rams > 0. */
    function umaxCalcWallDamage(rams, wallLevel) {
        if (!rams || wallLevel <= 0) return 0;
        return Math.max(1, Math.floor(rams * 0.02 * (1 - wallLevel / 25)));
    }

    /* Pure combat simulation: how many identical attack waves to wipe defenders.
       Wall level decreases each wave from ram damage — wallFactor is recomputed per wave. */
    function umaxRunSimulation(template, defenders, unitStats, wallLevel) {
        let def = {};
        for (const [u, n] of Object.entries(defenders)) { if (n > 0) def[u] = n; }
        if (!Object.keys(def).length) return { waves: 0 };

        const cavalryIds = new Set(['light', 'heavy']);
        let infantryA = 0, cavalryA = 0;
        for (const [u, n] of Object.entries(template)) {
            if (u === UMAX_WALL_KEY) continue;
            const s = unitStats[u]; if (!s || !n) continue;
            (cavalryIds.has(u) ? (cavalryA += s.attack * n) : (infantryA += s.attack * n));
        }
        const defKey = cavalryA > infantryA ? 'defense_cavalry' : 'defense';

        let A = 0;
        for (const [u, n] of Object.entries(template)) {
            if (u === UMAX_WALL_KEY) continue;
            const s = unitStats[u]; if (!s || !n) continue;
            A += s.attack * n;
        }
        if (A === 0) return { impossible: true, reason: 'Modelo sem valor ofensivo' };

        const rams = Number(template['ram']) || 0;
        let currentWall = wallLevel || 0;

        let waves = 0;
        const MAX_WAVES = 5000;
        while (waves < MAX_WAVES) {
            // Recompute wall factor each wave (rams reduce wall after each hit)
            const wallFactor = Math.pow(1.037, currentWall);

            let D = 0;
            for (const [u, n] of Object.entries(def)) {
                const s = unitStats[u]; if (!s || !n) continue;
                D += (s[defKey] || 0) * n;
            }
            if (D === 0) break;
            D *= wallFactor;
            waves++;

            // Rams destroy wall levels after each attack
            currentWall = Math.max(0, currentWall - umaxCalcWallDamage(rams, currentWall));

            if (A >= D) { def = {}; break; }

            // TW exact formula: defenders LOSE (A/D)^1.5 fraction each wave
            // survival = 1 - (A/D)^1.5 = 1 - (A/D) × sqrt(A/D)
            const ratio = Math.max(0, 1 - Math.pow(A / D, 1.5));
            const next = {};
            for (const [u, n] of Object.entries(def)) {
                const survivors = Math.floor(n * ratio);
                if (survivors > 0) next[u] = survivors;
            }
            if (!Object.keys(next).length) break;
            if (Object.entries(next).every(([u, n]) => n === def[u])) {
                return { impossible: true, reason: 'Ataque demasiado fraco para reduzir a defesa' };
            }
            def = next;
        }
        return {
            waves,
            impossible: waves >= MAX_WAVES,
            defenseType: cavalryA > infantryA ? 'cavalaria' : 'infantaria',
            finalWall: currentWall,
        };
    }

    /* Uses TW's own simulator endpoint to compute the exact attack count.
       Returns { waves, fromServer: true } or null on any failure. */
    async function umaxSimulateViaServer(template, defenders, wallLevel) {
        const vid = typeof game_data !== 'undefined' ? game_data.village.id : null;
        if (!vid) { console.debug('[umax-sim] no village id'); return null; }

        try {
            const simUrl = `/game.php?village=${vid}&screen=place&mode=sim`;

            // Step 1: GET the simulator page to harvest form fields + CSRF token
            const getResp = await fetch(simUrl, { credentials: 'include' });
            if (!getResp.ok) return null;
            const getHtml = await getResp.text();
            const doc = new DOMParser().parseFromString(getHtml, 'text/html');

            const form = doc.querySelector('form[action*="screen=place"]') ||
                         doc.querySelector('form[action*="mode=sim"]') ||
                         doc.querySelector('form');
            if (!form) { console.debug('[umax-sim] no form found in GET response'); return null; }
            console.debug('[umax-sim] form action:', form.getAttribute('action'));

            // Dump ALL form fields first — captures hidden CSRF token regardless of field name
            const params = new URLSearchParams();
            form.querySelectorAll('input, select, textarea').forEach(el => {
                if (!el.name) return;
                if (el.type === 'submit' || el.type === 'button' || el.type === 'image') return;
                if (el.type === 'checkbox') { if (el.checked) params.set(el.name, el.value || '1'); }
                else if (el.type === 'radio') { if (el.checked) params.set(el.name, el.value); }
                else params.set(el.name, el.value || '');
            });

            // Locate per-unit input fields (primary: name contains unit + att/def)
            const attFieldMap = {}, defFieldMap = {};
            let wallFieldName = null;

            form.querySelectorAll('input[name], select[name]').forEach(el => {
                const lname = el.name.toLowerCase();
                const lid = (el.id || '').toLowerCase();
                if (!wallFieldName && (lname.includes('wall') || lid.includes('wall'))) {
                    wallFieldName = el.name;
                }
                for (const unit of UMAX_SIM_UNITS) {
                    if (!attFieldMap[unit] && lname.includes(unit) && lname.includes('att')) attFieldMap[unit] = el.name;
                    if (!defFieldMap[unit] && lname.includes(unit) && lname.includes('def')) defFieldMap[unit] = el.name;
                }
            });

            console.debug('[umax-sim] attFieldMap:', attFieldMap, 'defFieldMap:', defFieldMap, 'wallField:', wallFieldName);

            // Fallback: find inputs by proximity to unit images in the same table row
            if (!Object.keys(attFieldMap).length || !Object.keys(defFieldMap).length) {
                form.querySelectorAll('tr').forEach(tr => {
                    const imgs = [...tr.querySelectorAll('img[src*="unit_"]')];
                    if (!imgs.length) return;
                    const unit = (imgs[0].src.match(/unit_(\w+)/) || [])[1];
                    if (!unit || !UMAX_SIM_UNITS.includes(unit)) return;
                    const inputs = [...tr.querySelectorAll(
                        'input[name][type="text"], input[name][type="number"], input[name]:not([type])'
                    )];
                    if (!attFieldMap[unit] && inputs[0]) attFieldMap[unit] = inputs[0].name;
                    if (!defFieldMap[unit] && inputs[1]) defFieldMap[unit] = inputs[1].name;
                });
            }

            // Override with our values (after dump so they overwrite form defaults)
            for (const [unit, count] of Object.entries(template)) {
                if (unit === UMAX_WALL_KEY) continue;
                if (attFieldMap[unit]) params.set(attFieldMap[unit], String(Number(count) || 0));
            }
            for (const unit of UMAX_SIM_UNITS) {
                if (defFieldMap[unit]) params.set(defFieldMap[unit], String(defenders[unit] || 0));
            }
            if (wallFieldName) params.set(wallFieldName, String(wallLevel || 0));

            // Include the submit button value so TW processes the simulation
            const submitBtn = form.querySelector('input[type="submit"][name], button[type="submit"][name]');
            if (submitBtn) params.set(submitBtn.name, submitBtn.value || 'simulate');
            else params.set('simulate', 'simulate');

            // Step 2: POST back to the same URL
            const formAction = form.getAttribute('action');
            const postUrl = (formAction && formAction.startsWith('/')) ? formAction : simUrl;

            const postResp = await fetch(postUrl, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: params.toString(),
            });
            if (!postResp.ok) return null;
            const postHtml = await postResp.text();

            console.debug('[umax-sim] POST params:', params.toString());
            console.debug('[umax-sim] POST status:', postResp.status);

            // Step 3: Parse "X attacks needed" from Portuguese TW response
            const patterns = [
                /necessário[s]?\s+(?:mais\s+)?(\d+)\s+ataque[s]?/i,
                /(\d+)\s+ataque[s]?\s+completo[s]?\s+para\s+eliminar/i,
                /(\d+)\s+ataque[s]?\s+para\s+(?:eliminar|destruir)/i,
            ];
            for (const pat of patterns) {
                const m = postHtml.match(pat);
                if (m) return { waves: parseInt(m[1], 10), fromServer: true };
            }

            // Log a snippet around known keywords to help tune the regex
            const snippet = postHtml.match(/.{0,120}ataque.{0,120}/i);
            console.debug('[umax-sim] no pattern matched. snippet:', snippet ? snippet[0] : '(no "ataque" in response)');
            return null;
        } catch (err) {
            console.debug('[umax-sim] exception:', err);
            return null;
        }
    }

    /* Renders simulation result panel inside the widget. */
    function umaxRenderSimResult(widget, result, template, wallLevel, homeCounts, supportCounts) {
        const old = document.getElementById('tw-umax-sim-panel');
        if (old) old.remove();

        const panel = document.createElement('div');
        panel.id = 'tw-umax-sim-panel';

        const SHORT = { axe:'Machado', light:'CavL', heavy:'CavP', spy:'Btd', ram:'Aríete', catapult:'Cata', snob:'Nobre', spear:'Lança', sword:'Espada' };

        // Debug line showing what defenders were detected
        const defDbg = homeCounts && Object.keys(homeCounts).length
            ? 'presentes: ' + UMAX_SIM_UNITS.filter(u => (homeCounts[u]||0) > 0)
                .map(u => `${(homeCounts[u]||0).toLocaleString('pt-PT')} ${SHORT[u]||u}`).join(', ')
            : 'presentes: (vazio)';
        const supDbg = supportCounts && Object.values(supportCounts).some(v => v > 0)
            ? ' · a caminho: ' + UMAX_SIM_UNITS.filter(u => (supportCounts[u]||0) > 0)
                .map(u => `${(supportCounts[u]||0).toLocaleString('pt-PT')} ${SHORT[u]||u}`).join(', ')
            : '';

        if (result.noTemplate) {
            panel.className = 'tw-umax-sim-warn';
            panel.innerHTML = 'Define o modelo de ataque no painel <strong>⚙️ TW Tweaks</strong>';
        } else if (result.impossible) {
            panel.className = 'tw-umax-sim-warn';
            panel.innerHTML = (result.reason || 'Simulação impossível') +
                `<br><span style="font-size:10px;opacity:0.8">${defDbg}${supDbg}</span>`;
        } else if (result.waves === 0) {
            panel.className = 'tw-umax-sim-warn';
            panel.innerHTML = 'Sem defensores detectados' +
                `<br><span style="font-size:10px;opacity:0.8">${defDbg}${supDbg}</span>`;
        } else {
            const tplStr = Object.entries(template)
                .filter(([k]) => k !== UMAX_WALL_KEY)
                .filter(([,n]) => n > 0)
                .map(([u, n]) => `${Number(n).toLocaleString('pt-PT')} ${SHORT[u] || u}`).join(' + ');
            const wallStr = wallLevel > 0
                ? (result.fromServer
                    ? ` · Muralha ${wallLevel}`
                    : ` · Muralha ${wallLevel}→${result.finalWall ?? wallLevel}`)
                : '';
            const srcLabel = result.fromServer
                ? `<span style="font-size:10px;color:#388e3c">(simulador TW)</span>`
                : `<span style="font-size:10px;color:#999">(estimativa local)</span>`;
            panel.className = 'tw-umax-sim-ok';
            panel.innerHTML =
                `<strong>${result.waves}</strong> ataque${result.waves !== 1 ? 's' : ''} completo${result.waves !== 1 ? 's' : ''} para eliminar a defesa` +
                ` <span class="tw-umax-away">(${result.defenseType}${wallStr} · ${tplStr})</span>` +
                ` ${srcLabel}` +
                `<br><span style="font-size:10px;opacity:0.7">${defDbg}${supDbg}</span>`;
        }

        const content = widget.querySelector('.widget_content');
        if (content) content.insertBefore(panel, content.firstChild);
    }

    /* Runs inline simulation and renders result — no navigation. */
    async function umaxRunAndShow(widget, simBtn) {
        simBtn.textContent = '…';
        simBtn.classList.add('loading');

        const template = umaxGetTemplate();
        const hasTemplate = template && Object.entries(template)
            .filter(([k]) => k !== UMAX_WALL_KEY)
            .some(([, v]) => v > 0);

        if (!hasTemplate) {
            umaxRenderSimResult(widget, { noTemplate: true }, {}, 0, {}, {});
            simBtn.textContent = 'Simular';
            simBtn.classList.remove('loading');
            return;
        }

        // Defenders = all troops currently in village (own + allied support already here)
        //             + incoming support still en route.
        // all_unit covers troops already defending; incoming adds support still en route.
        // Two sources for en-route support (take max per unit to avoid double-counting):
        //   • incomings DOM: support rows in #show_incoming_units / #commands_incomings
        //   • support_sum fetch from mode=call: called support (subset of incomings)
        const [supportCounts, incomingDOM] = await Promise.all([
            umaxFetchSupportSum(),
            Promise.resolve(umaxParseIncomingSupportFromDOM()),
        ]);
        const allCounts = umaxParseCounts('all_unit');
        const defenders = {};
        UMAX_SIM_UNITS.forEach(u => {
            const enRoute = Math.max(supportCounts[u] || 0, incomingDOM[u] || 0);
            const total = (allCounts[u] || 0) + enRoute;
            if (total > 0) defenders[u] = total;
        });

        const wallLevel = (() => {
            try {
                const v = template[UMAX_WALL_KEY];
                if (v !== undefined && v !== null) return Math.max(0, Math.min(25, Number(v) || 0));
            } catch (_) {}
            try { return Number(game_data.village.buildings.wall) || 0; } catch (_) {}
            return 0;
        })();

        // Try TW's own simulator endpoint first; fall back to local formula
        let result = await umaxSimulateViaServer(template, defenders, wallLevel);
        if (result) {
            // Compute offense type from template for display purposes
            const cavalryIds = new Set(['light', 'heavy']);
            const unitStats = umaxGetUnitStats();
            let infantryA = 0, cavalryA = 0;
            for (const [u, n] of Object.entries(template)) {
                if (u === UMAX_WALL_KEY) continue;
                const s = unitStats[u]; if (!s || !n) continue;
                cavalryIds.has(u) ? (cavalryA += s.attack * n) : (infantryA += s.attack * n);
            }
            result.defenseType = cavalryA > infantryA ? 'cavalaria' : 'infantaria';
        } else {
            result = umaxRunSimulation(template, defenders, umaxGetUnitStats(), wallLevel);
        }
        // For debug, build merged en-route counts
        const mergedEnRoute = {};
        UMAX_SIM_UNITS.forEach(u => {
            const v = Math.max(supportCounts[u] || 0, incomingDOM[u] || 0);
            if (v > 0) mergedEnRoute[u] = v;
        });
        umaxRenderSimResult(widget, result, template, wallLevel, allCounts, mergedEnRoute);

        simBtn.textContent = 'Simular';
        simBtn.classList.remove('loading');
    }

    /* On screen=place&mode=sim, reads prefill key and fills defender inputs. */
    function umaxPrefillSim() {
        let raw;
        try {
            raw = sessionStorage.getItem(UMAX_SIM_KEY);
            if (!raw) return;
            sessionStorage.removeItem(UMAX_SIM_KEY);
        } catch (_) { return; }

        let prefill;
        try { prefill = JSON.parse(raw); } catch (_) { return; }

        function fill() {
            let ok = false;
            Object.entries(prefill).forEach(([unit, count]) => {
                const input = document.querySelector(`input[name="def[${unit}]"]`);
                if (input) { input.value = String(count); ok = true; }
            });
            return ok;
        }

        if (!fill()) {
            const obs = new MutationObserver(() => { if (fill()) obs.disconnect(); });
            obs.observe(document.body, { childList: true, subtree: true });
            setTimeout(() => obs.disconnect(), 5000);
        }
    }

    function initUnitMax() {
        const screen = getCurrentScreen();

        if (screen === 'place' && location.href.includes('mode=sim')) {
            umaxPrefillSim();
            return;
        }

        if (screen === 'place' && location.href.includes('mode=call')) {
            umaxSaveSupportSum();
            new MutationObserver(umaxSaveSupportSum)
                .observe(document.body, { childList: true, subtree: true });
            return;
        }

        if (screen !== 'overview') return;

        function attach() {
            const widget = document.getElementById('show_units');
            if (!widget || document.getElementById('tw-umax-btn')) return;

            const header = widget.querySelector('h4.head');
            if (!header) return;

            const btn = document.createElement('span');
            btn.id = 'tw-umax-btn';
            btn.textContent = 'Total';
            btn.title = 'Total disponível (própria + apoio + a caminho)';

            let active = false;
            btn.addEventListener('click', async () => {
                active = !active;
                btn.classList.toggle('active', active);
                await umaxApplyInline(widget, active, btn);
            });

            header.appendChild(btn);

            const simBtn = document.createElement('span');
            simBtn.id = 'tw-umax-sim-btn';
            simBtn.textContent = 'Simular';
            simBtn.title = 'Calcular ataques necessários para eliminar a defesa presente';
            simBtn.addEventListener('click', async () => {
                await umaxRunAndShow(widget, simBtn);
            });
            header.appendChild(simBtn);
        }

        attach();
        new MutationObserver(attach).observe(document.body, { childList: true, subtree: true });
    }

    /* ═══════════════════════════════════════════════════════════════════════
       MAP DRAW SELECT
       Shift+drag on the map canvas to bulk-select villages by rectangle.
       Toggled from the TwUtilsView overlay panel via CustomEvents.
    ═══════════════════════════════════════════════════════════════════════ */

    function initMapDrawSelect() {
        console.log('[mds] initMapDrawSelect called, screen:', getCurrentScreen());
        if (getCurrentScreen() !== 'map') return;
        console.log('[mds] screen=map confirmed, setting up');

        var TILE_W = 53, TILE_H = 38;
        /* Coord map built from spawnSector intercepts — guaranteed fallback */
        var _villageCoordMap = {};

        var sel = {
            villages: [],
            villageIds: [],
            showCoords: true,
            showCounter: false,
            showNewLine: true,
            _active: false,
            _origSpawn: null,
            _origClick: null,
            _drag: null,
            _justDragged: false,
            _rubber: null
        };

        /* ── Map bounds detection ───────────────────────────────────── */

        function detectMapBounds() {
            var mapEl = document.getElementById('map');
            if (mapEl) return mapEl.getBoundingClientRect();
            var cfg_el = document.getElementById('map_config');
            var leftOff = cfg_el ? cfg_el.getBoundingClientRect().right : 0;
            return { left: leftOff, top: 0, width: window.innerWidth - leftOff, height: window.innerHeight };
        }

        function getTileSize() {
            var td = window.TWMap && window.TWMap.tileDimensions;
            if (td && typeof td === 'object') {
                var tw = parseFloat(td.x || td.w || td.width);
                var th = parseFloat(td.y || td.h || td.height);
                if (!isNaN(tw) && tw > 0) return { w: tw, h: th };
            }
            var ts = window.TWMap && window.TWMap.tileSize;
            if (ts && typeof ts === 'object') {
                var tw2 = parseFloat(ts.x || ts.w || ts.width);
                var th2 = parseFloat(ts.y || ts.h || ts.height);
                if (!isNaN(tw2) && tw2 > 0) return { w: tw2, h: th2 };
            }
            return { w: TILE_W, h: TILE_H };
        }

        function getMapCenter() {
            if (!window.TWMap) return null;
            // Try TWMap.pos with string OR number values
            var p = window.TWMap.pos;
            if (p && typeof p === 'object') {
                var px = parseFloat(p.x), py = parseFloat(p.y);
                if (!isNaN(px)) return { x: px, y: py };
                var pcx = parseFloat(p.cx), pcy = parseFloat(p.cy);
                if (!isNaN(pcx)) return { x: pcx, y: pcy };
            }
            // TWMap.map_el_coordx/y — tile coordinates of map center
            var mcx = parseFloat(window.TWMap.map_el_coordx);
            var mcy = parseFloat(window.TWMap.map_el_coordy);
            if (!isNaN(mcx)) return { x: mcx, y: mcy };
            return null;
        }

        function pixelToMapCoord(clientX, clientY) {
            var b = detectMapBounds();
            var relX = clientX - b.left;
            var relY = clientY - b.top;
            // Use TW's own converter when available
            if (typeof window.TWMap.CoordByXY === 'function') {
                try {
                    var r = window.TWMap.CoordByXY(relX, relY);
                    if (r && typeof r.x !== 'undefined') {
                        return { x: Math.floor(parseFloat(r.x)), y: Math.floor(parseFloat(r.y)) };
                    }
                } catch (_) {}
            }
            var center = getMapCenter();
            if (!center) {
                console.log('[mds] pixelToMapCoord: no center. pos:', JSON.stringify(window.TWMap && window.TWMap.pos), 'map_el_coordx:', window.TWMap && window.TWMap.map_el_coordx);
                return null;
            }
            var ts = getTileSize();
            return {
                x: Math.floor(center.x + (relX - b.width  / 2) / ts.w),
                y: Math.floor(center.y + (relY - b.height / 2) / ts.h)
            };
        }

        function isOverMapArea(e) {
            var mapEl = document.getElementById('map');
            return mapEl ? mapEl.contains(e.target) : false;
        }

        /* ── Village lookup — tries every known key format ──────────── */

        function findVillage(x, y) {
            if (window.TWMap && window.TWMap.villages) {
                var vils = window.TWMap.villages;
                // Use TW's own key generator if available
                if (typeof window.TWMap.villageKey === 'function') {
                    var key = window.TWMap.villageKey(x, y);
                    if (vils[key]) return vils[key];
                }
                var v = vils[x * 1000 + y] ||   // format A
                        vils[y * 1000 + x] ||   // format B (y-major)
                        vils[x + '|' + y];       // format C (string key)
                if (v) return v;
            }
            return _villageCoordMap[x + '|' + y] || null;
        }

        /* ── Selection helpers ──────────────────────────────────────── */

        function markSelected(id) {
            $('#DSMDraw_overlay_' + id)
                .css('outline', 'rgba(51, 255, 0, 0.7) solid 2px')
                .css('background-color', 'rgba(155, 252, 10, 0.14)');
        }

        function demarkSelected(id) {
            $('#DSMDraw_overlay_' + id).css('outline', '').css('background-color', '');
        }

        function emitState() {
            var count = 0, output = '';
            for (var i = 0; i < sel.villages.length; i++) {
                if (sel.villages[i] === null) continue;
                count++;
                if (sel.showCounter) output += count + '. ';
                if (sel.showCoords) output += '[coord]';
                output += sel.villages[i];
                if (sel.showCoords) output += '[/coord]';
                output += sel.showNewLine ? '\n' : ' ';
            }
            var ta = document.getElementById('tw-mds-output');
            if (ta) ta.value = output;
            var badge = document.getElementById('tw-mds-count');
            if (badge) badge.textContent = count + ' aldeia(s)';
            document.dispatchEvent(new CustomEvent('xbot:mapsel:state', {
                detail: { active: sel._active, count: count, output: output }
            }));
        }

        function handleVillage(x, y) {
            var coord = x + '|' + y;
            var village = findVillage(x, y);
            console.log('[mds] handleVillage', x, y, '→', village ? village.id : 'NOT FOUND', '_coordMap size:', Object.keys(_villageCoordMap).length);
            if (!village) return;
            var idx = sel.villages.indexOf(coord);
            if (idx === -1) {
                sel.villages.push(coord);
                sel.villageIds.push(village.id);
                markSelected(village.id);
            } else {
                sel.villages[idx] = null;
                var idIdx = sel.villageIds.indexOf(village.id);
                if (idIdx !== -1) sel.villageIds[idIdx] = null;
                demarkSelected(village.id);
            }
            emitState();
        }

        function selectRect(x1, y1, x2, y2) {
            var minX = Math.min(x1, x2), maxX = Math.max(x1, x2);
            var minY = Math.min(y1, y2), maxY = Math.max(y1, y2);
            if ((maxX - minX + 1) * (maxY - minY + 1) > 10000) return;
            var added = false;
            for (var x = minX; x <= maxX; x++) {
                for (var y = minY; y <= maxY; y++) {
                    var coord = x + '|' + y;
                    if (sel.villages.indexOf(coord) !== -1) continue;
                    var village = findVillage(x, y);
                    if (!village) continue;
                    sel.villages.push(coord);
                    sel.villageIds.push(village.id);
                    added = true;
                }
            }
            console.log('[mds] selectRect', x1, y1, '->', x2, y2, 'added:', added, '_coordMap size:', Object.keys(_villageCoordMap).length);
            if (added) window.TWMap.reload();
            emitState();
        }

        function clearAll() {
            sel.villages = [];
            sel.villageIds = [];
            $('.DSMDrawOverlay').remove();
            if (sel._active) window.TWMap.reload();
            emitState();
        }

        /* ── Map hooks ──────────────────────────────────────────────── */

        function extractVillagesFromSectorData(data) {
            try {
                if (!data) return;
                // Format A: array of village objects with .x .y .id
                if (Array.isArray(data)) {
                    data.forEach(function(v) {
                        if (v && typeof v.x === 'number' && v.id) _villageCoordMap[v.x + '|' + v.y] = v;
                    });
                    return;
                }
                if (typeof data !== 'object') return;
                // Format B: { villages: [...] } or { villages: {...} }
                if (data.villages) {
                    var vils = data.villages;
                    if (Array.isArray(vils)) {
                        vils.forEach(function(v) {
                            if (v && typeof v.x === 'number' && v.id) _villageCoordMap[v.x + '|' + v.y] = v;
                        });
                    } else {
                        Object.keys(vils).forEach(function(k) {
                            var v = vils[k];
                            if (!v || !v.id) return;
                            if (typeof v.x === 'number') _villageCoordMap[v.x + '|' + v.y] = v;
                            else if (k.indexOf('|') !== -1) _villageCoordMap[k] = v;
                        });
                    }
                    return;
                }
                // Format C: data is directly an object of villages keyed by "x|y" or integer
                Object.keys(data).forEach(function(k) {
                    var v = data[k];
                    if (!v || !v.id) return;
                    if (typeof v.x === 'number') _villageCoordMap[v.x + '|' + v.y] = v;
                    else if (k.indexOf('|') !== -1) _villageCoordMap[k] = v;
                });
            } catch (_) {}
        }

        function hookedSpawnSector(data, sector) {
            extractVillagesFromSectorData(data);
            window.TWMap.mapHandler._mdsOrigSpawn(data, sector);
            for (var i = 0; i < sel.villageIds.length; i++) {
                var vid = sel.villageIds[i];
                if (vid === null) continue;
                var v = $('#map_village_' + vid);
                if (!v.length) continue;
                var oid = 'DSMDraw_overlay_' + vid;
                if (document.getElementById(oid)) continue;
                $('<div class="DSMDrawOverlay" id="' + oid + '" style="width:53px;height:38px;position:absolute;z-index:50;left:' + v.css('left') + ';top:' + v.css('top') + ';pointer-events:none;"></div>').appendTo(v.parent());
                markSelected(vid);
            }
        }

        function hookedClick(x, y, event) {
            if (sel._justDragged) { sel._justDragged = false; return false; }
            if (event && event.shiftKey) return false;
            console.log('[mds] hookedClick', x, y);
            handleVillage(x, y);
            return false;
        }

        /* ── Rubber-band drag ───────────────────────────────────────── */

        function getRubber() {
            if (!sel._rubber) {
                sel._rubber = document.createElement('div');
                sel._rubber.id = 'tw-mds-rubber';
                document.body.appendChild(sel._rubber);
            }
            return sel._rubber;
        }

        function onMouseDown(e) {
            if (!sel._active || !e.shiftKey || e.button !== 0) return;
            if (!isOverMapArea(e)) return;
            e.preventDefault();
            e.stopPropagation();
            sel._drag = { clientX: e.clientX, clientY: e.clientY };
            var r = getRubber();
            r.style.left = e.clientX + 'px';
            r.style.top  = e.clientY + 'px';
            r.style.width = r.style.height = '0';
            r.style.display = 'block';
        }

        function onMouseMove(e) {
            if (!sel._drag) return;
            var dx = e.clientX - sel._drag.clientX;
            var dy = e.clientY - sel._drag.clientY;
            var r = getRubber();
            r.style.left   = (dx < 0 ? e.clientX : sel._drag.clientX) + 'px';
            r.style.top    = (dy < 0 ? e.clientY : sel._drag.clientY) + 'px';
            r.style.width  = Math.abs(dx) + 'px';
            r.style.height = Math.abs(dy) + 'px';
        }

        function onMouseUp(e) {
            if (!sel._drag) return;
            var drag = sel._drag;
            sel._drag = null;
            getRubber().style.display = 'none';
            var dx = e.clientX - drag.clientX;
            var dy = e.clientY - drag.clientY;
            var c1 = pixelToMapCoord(drag.clientX, drag.clientY);
            var c2 = pixelToMapCoord(e.clientX, e.clientY);
            console.log('[mds] mouseup dx:', dx, 'dy:', dy, 'c1:', c1, 'c2:', c2, 'center:', getMapCenter(), 'bounds:', detectMapBounds());
            if (Math.abs(dx) < 4 && Math.abs(dy) < 4) {
                if (c1) handleVillage(c1.x, c1.y);
                return;
            }
            sel._justDragged = true;
            if (c1 && c2) selectRect(c1.x, c1.y, c2.x, c2.y);
        }

        function bindDrag() {
            document.addEventListener('mousedown', onMouseDown, true);
            document.addEventListener('mousemove', onMouseMove, false);
            document.addEventListener('mouseup',   onMouseUp,   false);
        }

        function unbindDrag() {
            document.removeEventListener('mousedown', onMouseDown, true);
            document.removeEventListener('mousemove', onMouseMove, false);
            document.removeEventListener('mouseup',   onMouseUp,   false);
            if (sel._rubber) sel._rubber.style.display = 'none';
        }

        /* ── Sidebar UI ─────────────────────────────────────────────── */

        function showUi() {
            if (document.getElementById('tw-mds-panel')) return;
            $('#map_config').prepend(
                '<table id="tw-mds-panel" class="vis" style="border-spacing:0;border-collapse:collapse;margin-top:10px;" width="100%"><tbody>' +
                '<tr><th colspan="2">Map Draw Select</th></tr>' +
                '<tr><td colspan="2" style="padding:2px 4px;font-size:10px;color:#666;font-style:italic;">Shift+arrasta → rectângulo | Clique → alterna</td></tr>' +
                '<tr><td><input type="checkbox" id="tw-mds-chk-coords" checked></td><td><label for="tw-mds-chk-coords">BBCode</label></td></tr>' +
                '<tr><td><input type="checkbox" id="tw-mds-chk-counter"></td><td><label for="tw-mds-chk-counter">Contador</label></td></tr>' +
                '<tr><td><input type="checkbox" id="tw-mds-chk-newline" checked></td><td><label for="tw-mds-chk-newline">Nova linha</label></td></tr>' +
                '<tr><td colspan="2" id="tw-mds-count" style="padding:2px 4px;font-size:10px;color:#555;">0 aldeia(s)</td></tr>' +
                '<tr><td colspan="2" style="padding:2px 4px;"><textarea id="tw-mds-output" rows="5" style="width:95%;font-size:11px;" readonly></textarea></td></tr>' +
                '<tr><td colspan="2" style="padding:4px;">' +
                '<button id="tw-mds-copy" style="margin-right:6px;">Copiar</button>' +
                '<button id="tw-mds-clear">Limpar tudo</button>' +
                '</td></tr>' +
                '</tbody></table>'
            );
            $('#tw-mds-chk-coords').on('change', function() { sel.showCoords   = this.checked; emitState(); });
            $('#tw-mds-chk-counter').on('change', function() { sel.showCounter = this.checked; emitState(); });
            $('#tw-mds-chk-newline').on('change', function() { sel.showNewLine = this.checked; emitState(); });
            $('#tw-mds-copy').on('click', function() {
                var ta = document.getElementById('tw-mds-output');
                if (ta) { ta.select(); document.execCommand('copy'); }
            });
            $('#tw-mds-clear').on('click', clearAll);
        }

        /* ── Enable / Disable ───────────────────────────────────────── */

        function enable() {
            if (sel._active) return;
            sel._active = true;
            // Diagnostic dump — check browser console after enabling
            try {
                console.log('[mds] TWMap.pos:', JSON.stringify(window.TWMap.pos));
                console.log('[mds] map_el_coordx:', window.TWMap.map_el_coordx, 'map_el_coordy:', window.TWMap.map_el_coordy);
                console.log('[mds] tileSize:', JSON.stringify(window.TWMap.tileSize), 'tileDimensions:', JSON.stringify(window.TWMap.tileDimensions));
                console.log('[mds] CoordByXY is function:', typeof window.TWMap.CoordByXY === 'function');
                console.log('[mds] villageKey type:', typeof window.TWMap.villageKey, '| sample call(500,500):', typeof window.TWMap.villageKey === 'function' ? window.TWMap.villageKey(500, 500) : 'n/a');
                console.log('[mds] CoordByXY(0,0):', typeof window.TWMap.CoordByXY === 'function' ? JSON.stringify(window.TWMap.CoordByXY(0, 0)) : 'n/a');
                if (window.TWMap.villages) {
                    var sampleKeys = Object.keys(window.TWMap.villages).slice(0, 3);
                    console.log('[mds] villages sample keys:', sampleKeys);
                    console.log('[mds] villages sample values:', JSON.stringify(sampleKeys.map(function(k) { return window.TWMap.villages[k]; })));
                }
            } catch (_) {}
            window.TWMap.mapHandler._mdsOrigSpawn = window.TWMap.mapHandler.spawnSector;
            window.TWMap.mapHandler._mdsOrigClick = window.TWMap.mapHandler.onClick;
            window.TWMap.mapHandler.spawnSector = hookedSpawnSector;
            window.TWMap.mapHandler.onClick = hookedClick;
            bindDrag();
            showUi();
            window.TWMap.reload();
            emitState();
        }

        function disable() {
            if (!sel._active) return;
            sel._active = false;
            if (window.TWMap.mapHandler._mdsOrigSpawn)
                window.TWMap.mapHandler.spawnSector = window.TWMap.mapHandler._mdsOrigSpawn;
            if (window.TWMap.mapHandler._mdsOrigClick)
                window.TWMap.mapHandler.onClick = window.TWMap.mapHandler._mdsOrigClick;
            unbindDrag();
            clearAll();
            $('#tw-mds-panel').remove();
            if (sel._rubber) { sel._rubber.remove(); sel._rubber = null; }
            window.TWMap.reload();
            emitState();
        }

        /* ── CustomEvent bridge ─────────────────────────────────────── */

        document.addEventListener('xbot:mapsel:enable',  enable);
        document.addEventListener('xbot:mapsel:disable', disable);
        document.addEventListener('xbot:mapsel:clear',   clearAll);

        // Wait for TWMap to be ready before registering
        if (!window.TWMap || !window.TWMap.mapHandler || !window.TWMap.villages) {
            var mdsPoll = setInterval(function() {
                if (window.TWMap && window.TWMap.mapHandler && window.TWMap.villages) {
                    clearInterval(mdsPoll);
                    emitState();
                }
            }, 200);
        } else {
            emitState();
        }
    }

    /* ═══════════════════════════════════════════════════════════════════════
       BOOT
    ═══════════════════════════════════════════════════════════════════════ */

    function boot() {
        injectStyle();
        if (cfg.villageSwitcher !== false) initVillageSwitcher();
        if (cfg.incomingFilter !== false) initIncomingFilter();
        if (cfg.quickbarCollapse !== false) initQuickbarCollapse();
        if (cfg.bulkCancel !== false) initBulkCancel();
        if (cfg.unitMax !== false) initUnitMax();
        if (cfg.mapDrawSelect !== false) initMapDrawSelect();
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

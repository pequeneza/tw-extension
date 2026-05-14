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
    const BC_DELAY_MS = 200;

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
            if (done < links.length) await sleep(BC_DELAY_MS);
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

    function updateBcFixed() {
        const wrap = document.getElementById('tw-bc-fixed');
        const counter = document.getElementById('tw-bc-fixed-counter');
        if (!wrap || !counter) return;

        const count = getCancelLinks().length;
        counter.textContent = count > 0 ? String(count) : '';
        if (count > 0) wrap.classList.remove('tw-bc-empty');
        else wrap.classList.add('tw-bc-empty');
    }

    function initBulkCancel() {
        if (getCurrentScreen() !== 'place') return;
        if (location.href.includes('try=confirm')) return;

        injectBcFixed();
        processBcTables();

        new MutationObserver(() => {
            processBcTables();
            updateBcFixed();
        }).observe(document.body, { childList: true, subtree: true });

        document.addEventListener('xbot:twutils:cancelAll', () => {
            const wrap = document.getElementById('tw-bc-fixed');
            const counter = document.getElementById('tw-bc-fixed-counter');
            if (wrap && counter) cancelAll(wrap, counter);
        });
    }

    /* ═══════════════════════════════════════════════════════════════════════
       UNIT MAX
       • screen=overview: MAX button on #show_units widget. Fetches
         screen=place&mode=call automatically to get incoming support, then
         injects totals inline on each existing unit row.
       • screen=place&mode=call: silently pre-caches #support_sum so the
         fetch is skipped when the user happens to visit that page first.
    ═══════════════════════════════════════════════════════════════════════ */

    const UMAX_SUPPORT_KEY = 'tw_umax_support_v1';
    const UMAX_SUPPORT_TTL = 10 * 60 * 1000; // 10 min
    const UMAX_SIM_KEY     = 'tw_umax_sim_v1';
    const UMAX_SIM_UNITS   = ['spear','sword','axe','spy','light','heavy','ram','catapult','snob'];

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
            counts[td.dataset.unit] = parseInt(td.textContent.trim().replace(/[^\d]/g, ''), 10) || 0;
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

    /* Fetches screen=place&mode=call, parses #support_sum, caches result. */
    async function umaxFetchSupportSum() {
        const cached = umaxLoadCachedSupport();
        if (cached) return cached;

        const vid = typeof game_data !== 'undefined' ? game_data.village.id : null;
        if (!vid) return {};

        try {
            const resp = await fetch(
                `/game.php?village=${vid}&screen=place&mode=call`,
                { credentials: 'include' }
            );
            const html = await resp.text();
            const doc = new DOMParser().parseFromString(html, 'text/html');
            const counts = {};
            doc.querySelectorAll('#support_sum tbody td[data-unit]').forEach(td => {
                counts[td.dataset.unit] = parseInt(td.textContent.trim().replace(/[^\d]/g, ''), 10) || 0;
            });
            try {
                sessionStorage.setItem(UMAX_SUPPORT_KEY, JSON.stringify({ counts, ts: Date.now() }));
            } catch (_) {}
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

        btn.textContent = 'MAX';
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

            let html = '';
            if (support > 0 || away > 0) {
                const grandStr = support > 0 ? `→ <strong>${grand.toLocaleString('pt-PT')}</strong> ` : '';
                html = `${grandStr}<span class="tw-umax-away">(${parts.join('; ')})</span>`;
            }

            if (html) {
                span.innerHTML = html;
                strong.insertAdjacentElement('afterend', span);
            }
        });
    }

    /* Fetches support, saves prefill to sessionStorage, navigates to sim. */
    async function umaxOpenSim() {
        const homeCounts    = umaxParseCounts('home_unit');
        const supportCounts = await umaxFetchSupportSum();

        const prefill = {};
        UMAX_SIM_UNITS.forEach(unit => {
            const total = (homeCounts[unit] || 0) + (supportCounts[unit] || 0);
            if (total > 0) prefill[unit] = total;
        });

        try { sessionStorage.setItem(UMAX_SIM_KEY, JSON.stringify(prefill)); } catch (_) {}

        const vid = (typeof game_data !== 'undefined' ? game_data.village.id : null)
            || new URLSearchParams(location.search).get('village') || '';
        location.href = `/game.php?village=${vid}&screen=place&mode=sim`;
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
            btn.textContent = 'MAX';
            btn.title = 'Máximo disponível (casa + em viagem + apoio recebido)';

            let active = false;
            btn.addEventListener('click', async () => {
                active = !active;
                btn.classList.toggle('active', active);
                await umaxApplyInline(widget, active, btn);
            });

            header.appendChild(btn);

            const simBtn = document.createElement('span');
            simBtn.id = 'tw-umax-sim-btn';
            simBtn.textContent = 'Sim';
            simBtn.title = 'Simular defesa com tropas presentes (abre o simulador pré-preenchido)';
            simBtn.addEventListener('click', async () => {
                simBtn.textContent = '…';
                simBtn.classList.add('loading');
                await umaxOpenSim();
            });
            header.appendChild(simBtn);
        }

        attach();
        new MutationObserver(attach).observe(document.body, { childList: true, subtree: true });
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

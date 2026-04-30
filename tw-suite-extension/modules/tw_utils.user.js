// ==UserScript==
// @name         TW Utils
// @namespace    tw_utils
// @version      1.1.0
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
       BOOT
    ═══════════════════════════════════════════════════════════════════════ */

    function boot() {
        injectStyle();
        if (cfg.villageSwitcher !== false) initVillageSwitcher();
        if (cfg.incomingFilter !== false) initIncomingFilter();
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

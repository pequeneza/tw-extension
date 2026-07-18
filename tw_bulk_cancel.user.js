// ==UserScript==
// @name         TW Bulk Cancel
// @namespace    tw_bulk_cancel
// @version      1.0.0
// @description  Cancela todos os comandos de apoio em bloco no ecrã de praça.
// @match        https://*.tribalwars.com.pt/game.php*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    if (window.__twBulkCancelLoaded) return;
    window.__twBulkCancelLoaded = true;

    /* ═══════════════════════════════════════════════════════════════════════
       HELPERS
    ═══════════════════════════════════════════════════════════════════════ */

    function getCurrentScreen() {
        return new URLSearchParams(window.location.search).get('screen') || '';
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Adds random jitter to fixed UI-automation delays so repeated runs (and
    // different installs of this script) don't produce an identical, mechanically
    // precise timing signature.
    function jitter(baseMs, spreadMs) {
        return Math.max(0, Math.round(baseMs + (Math.random() * 2 - 1) * spreadMs));
    }

    /* ═══════════════════════════════════════════════════════════════════════
       CSS
    ═══════════════════════════════════════════════════════════════════════ */

    const CSS = `
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
`;

    function injectStyle() {
        if (document.getElementById('tw-bulk-cancel-style')) return;
        const st = document.createElement('style');
        st.id = 'tw-bulk-cancel-style';
        st.textContent = CSS;
        document.head.appendChild(st);
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
    function bcDelay() { return 100 + Math.random() * 100; }

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
        await sleep(jitter(800, 200));
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
        if (count === _bcLastCount) return;
        _bcLastCount = count;

        counter.textContent = count > 0 ? String(count) : '';
        if (count > 0) wrap.classList.remove('tw-bc-empty');
        else wrap.classList.add('tw-bc-empty');
    }

    function initBulkCancel() {
        if (getCurrentScreen() !== 'place') return;
        if (location.href.includes('try=confirm')) return;

        injectBcFixed();
        processBcTables();

        let _bcTimer = null;
        new MutationObserver(() => {
            if (_bcTimer) return;
            _bcTimer = setTimeout(() => { _bcTimer = null; processBcTables(); updateBcFixed(); }, 250);
        }).observe(document.body, { childList: true, subtree: true });

        document.addEventListener('xbot:twutils:cancelAll', () => {
            const wrap = document.getElementById('tw-bc-fixed');
            const counter = document.getElementById('tw-bc-fixed-counter');
            if (wrap && counter) cancelAll(wrap, counter);
        });
    }

    /* ═══════════════════════════════════════════════════════════════════════
       BOOT
    ═══════════════════════════════════════════════════════════════════════ */

    function boot() {
        injectStyle();
        initBulkCancel();
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

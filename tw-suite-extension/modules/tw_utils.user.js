// ==UserScript==
// @name         TW Utils
// @namespace    tw_utils
// @version      1.0.0
// @description  Utilitários variados para o TribalWars PT.
// @match        https://*.tribalwars.com.pt/game.php*
// ==/UserScript==

(function () {
    'use strict';

    if (window.__twUtilsLoaded) { window.__twUtilsOpen?.(); return; }
    window.__twUtilsLoaded = true;

    /* ═══════════════════════════════════════════════════════════════════════
       HELPERS
    ═══════════════════════════════════════════════════════════════════════ */

    function getCurrentScreen() {
        return new URLSearchParams(window.location.search).get('screen') || '';
    }

    function getCurrentVillageId() {
        if (typeof game_data !== 'undefined' && game_data.village?.id)
            return String(game_data.village.id);
        return new URLSearchParams(window.location.search).get('village') || '';
    }

    /* ═══════════════════════════════════════════════════════════════════════
       SETTINGS
    ═══════════════════════════════════════════════════════════════════════ */

    const STORAGE_KEY = 'tw_utils_settings';

    /* Registry of all utilities — add new entries here when extending */
    const UTIL_DEFS = [
        {
            id: 'villageSwitcher',
            label: 'Village Switcher',
            description: 'No mapa, mostra botão para trocar para uma aldeia própria selecionada.',
        },
    ];

    function loadSettings() {
        try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
    }

    function saveSettings(s) {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch {}
    }

    function isEnabled(id) {
        return loadSettings()[id] !== false; // enabled by default
    }

    /* ═══════════════════════════════════════════════════════════════════════
       CSS
    ═══════════════════════════════════════════════════════════════════════ */

    const CSS = `
#twutils-toggle { display:flex; align-items:center; justify-content:center;
                  background:#5a3a1a; cursor:pointer; font-size:15px; user-select:none; }
#twutils-toggle:hover { background:#7d5c2e; }
#twutils-toggle.twutils-active { border-color:#f4e4bc !important; box-shadow:0 0 6px #f4e4bc; }

#twutils-panel { position:fixed; top:60px; right:20px; z-index:99998;
                 background:#f4e4bc; border:2px solid #7d5c2e; border-radius:6px;
                 font-family:Verdana,sans-serif; font-size:12px; color:#3b2a1a;
                 box-shadow:0 4px 20px rgba(0,0,0,0.45); min-width:260px; }
#twutils-panel * { box-sizing:border-box; }
#twutils-titlebar { background:#7d5c2e; color:#f4e4bc; padding:8px 12px; border-radius:4px 4px 0 0;
                    display:flex; align-items:center; justify-content:space-between;
                    user-select:none; cursor:move; }
#twutils-titlebar span { font-weight:bold; font-size:13px; }
#twutils-titlebar button { background:none; border:none; color:#f4e4bc; font-size:15px;
                            cursor:pointer; padding:2px 6px; line-height:1; border-radius:3px; }
#twutils-titlebar button:hover { background:rgba(255,255,255,0.15); }
#twutils-list { padding:10px 12px; display:flex; flex-direction:column; gap:8px; }
.twutils-item { display:flex; align-items:flex-start; gap:8px; padding:6px 8px;
                background:#e8d5a3; border:1px solid #c9a96e; border-radius:4px; }
.twutils-item label { font-weight:bold; font-size:12px; cursor:pointer; }
.twutils-item p { margin:2px 0 0; font-size:10px; color:#7d5c2e; }
.twutils-item input[type=checkbox] { margin-top:2px; cursor:pointer; flex-shrink:0; }

#twutils-switch-btn { display:block; width:100%; margin-top:6px;
                      background:#5a3a1a; color:#f4e4bc; border:1px solid #3b2a1a;
                      border-radius:3px; padding:4px 10px; font-size:11px; font-weight:bold;
                      cursor:pointer; font-family:Verdana,sans-serif; text-align:center; }
#twutils-switch-btn:hover { background:#7d5c2e; }
`;

    function injectStyle() {
        if (document.getElementById('twutils-style')) return;
        const st = document.createElement('style');
        st.id = 'twutils-style';
        st.textContent = CSS;
        document.head.appendChild(st);
    }

    /* ═══════════════════════════════════════════════════════════════════════
       SETTINGS PANEL
    ═══════════════════════════════════════════════════════════════════════ */

    let _panelOpen = false;

    function buildPanel() {
        const settings = loadSettings();
        const panel = document.createElement('div');
        panel.id = 'twutils-panel';
        panel.innerHTML = `
<div id="twutils-titlebar">
  <span>⚙️ TW Utils</span>
  <button id="twutils-close" title="Fechar">✕</button>
</div>
<div id="twutils-list">
${UTIL_DEFS.map(u => `
  <div class="twutils-item">
    <input type="checkbox" id="twutils-cb-${u.id}" data-util="${u.id}"${settings[u.id] !== false ? ' checked' : ''}>
    <div>
      <label for="twutils-cb-${u.id}">${u.label}</label>
      <p>${u.description}</p>
    </div>
  </div>`).join('')}
</div>`;

        panel.querySelector('#twutils-close').addEventListener('click', togglePanel);
        panel.querySelectorAll('input[type=checkbox]').forEach(cb => {
            cb.addEventListener('change', () => {
                const s = loadSettings();
                s[cb.dataset.util] = cb.checked;
                saveSettings(s);
            });
        });

        makeDraggable(panel, panel.querySelector('#twutils-titlebar'));
        document.body.appendChild(panel);
    }

    function togglePanel() {
        _panelOpen = !_panelOpen;
        document.getElementById('twutils-toggle')?.classList.toggle('twutils-active', _panelOpen);
        if (_panelOpen) {
            buildPanel();
        } else {
            document.getElementById('twutils-panel')?.remove();
        }
    }

    /* ═══════════════════════════════════════════════════════════════════════
       VILLAGE SWITCHER
       Watches for map popups of own villages and injects a switch button.
       Own-village detection: popup contains a link to screen=place (rally
       point), which TW only renders for the current player's own villages.
    ═══════════════════════════════════════════════════════════════════════ */

    function initVillageSwitcher() {
        new MutationObserver(mutations => {
            if (getCurrentScreen() !== 'map') return;
            for (const m of mutations) {
                for (const node of m.addedNodes) {
                    if (node.nodeType !== 1) continue;
                    tryInjectSwitchBtn(node);
                    node.querySelectorAll('[id*="popup"],[class*="popup"]').forEach(tryInjectSwitchBtn);
                }
                /* Clean up orphaned button when popup is removed */
                for (const node of m.removedNodes) {
                    if (node.nodeType !== 1) continue;
                    if (node.querySelector?.('#twutils-switch-btn') || node.id?.includes('popup')) {
                        document.getElementById('twutils-switch-btn')?.remove();
                    }
                }
            }
        }).observe(document.body, { childList: true, subtree: true });
    }

    function tryInjectSwitchBtn(el) {
        if (el.querySelector?.('#twutils-switch-btn')) return;

        /* Only inject for own villages — identified by presence of a rally-point link */
        const placeLink = el.querySelector?.('a[href*="screen=place"][href*="village="]');
        if (!placeLink) return;

        const m = placeLink.href.match(/[?&]village=(\d+)/);
        if (!m) return;
        const targetVillageId = m[1];

        if (targetVillageId === getCurrentVillageId()) return;

        const coordM = el.textContent.match(/\((\d+)\|(\d+)\)/);

        const btn = document.createElement('button');
        btn.id = 'twutils-switch-btn';
        btn.textContent = '⇄ Trocar aldeia';
        btn.addEventListener('click', e => {
            e.stopPropagation();
            const url = new URL(window.location.href);
            url.searchParams.set('village', targetVillageId);
            if (coordM) url.hash = `${coordM[1]};${coordM[2]}`;
            window.location.href = url.toString();
        });

        el.appendChild(btn);
    }

    /* ═══════════════════════════════════════════════════════════════════════
       DRAG HELPER
    ═══════════════════════════════════════════════════════════════════════ */

    function makeDraggable(el, handle) {
        let ox = 0, oy = 0, dragging = false;
        handle.addEventListener('mousedown', e => {
            dragging = true;
            ox = e.clientX - el.getBoundingClientRect().left;
            oy = e.clientY - el.getBoundingClientRect().top;
            e.preventDefault();
        });
        document.addEventListener('mousemove', e => {
            if (!dragging) return;
            el.style.left  = (e.clientX - ox) + 'px';
            el.style.top   = (e.clientY - oy) + 'px';
            el.style.right = 'auto';
        });
        document.addEventListener('mouseup', () => { dragging = false; });
    }

    /* ═══════════════════════════════════════════════════════════════════════
       TOGGLE BUTTON
    ═══════════════════════════════════════════════════════════════════════ */

    function ensureToggleButton() {
        if (document.getElementById('twutils-toggle')) return;
        const anchor = document.getElementById('new_quest');
        if (!anchor) return;

        const btn = document.createElement('div');
        btn.className = 'quest';
        btn.id = 'twutils-toggle';
        btn.title = 'TW Utils';
        btn.textContent = '⚙️';
        btn.addEventListener('click', togglePanel);
        anchor.parentNode.insertBefore(btn, anchor.nextSibling);
    }

    /* ═══════════════════════════════════════════════════════════════════════
       BOOT
    ═══════════════════════════════════════════════════════════════════════ */

    window.__twUtilsOpen = togglePanel;

    function boot() {
        injectStyle();
        ensureToggleButton();
        let tries = 0;
        const t = setInterval(() => {
            ensureToggleButton();
            if (document.getElementById('twutils-toggle') || ++tries > 60) clearInterval(t);
        }, 200);

        if (isEnabled('villageSwitcher')) initVillageSwitcher();
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

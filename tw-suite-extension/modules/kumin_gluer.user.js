// ==UserScript==
// @name         Kumin Gluer
// @namespace    tw_kumin_gluer
// @version      1.1.0
// @description  Click an incoming attack on info_village to schedule a glue/snipe via Kumin autosender
// @match        https://*.tribalwars.com.pt/game.php*
// ==/UserScript==

(function () {
    'use strict';

    if (window.__twKuminGluerRunning) return;
    window.__twKuminGluerRunning = true;

    const QUEUE_KEY    = 'twKuminGluer_queue';
    const CACHE_KEY    = 'twKuminGluer_commandCache';
    const SETTINGS_KEY = 'twKuminGluer_settings';

    const NT_COUNT = {
        noNT:                          1,
        twoNoblesSame:                 2,
        threeNoblesSame:               3,
        fourNoblesSame:                4,
        fiveNoblesSame:                5,
        secondNobleWithRest:           2,
        thirdNobleWithRest:            3,
        fourNobleWithRest:             4,
        fiveNobleWithRest:             5,
        splitSecondThirdNobleNT:       2,
        secondNobleBuffNT:             2,
        thirdNobleBuffNT:              3,
        secondNobleBuffWith5NoblesNT:  5,
        secondNobleBuffWith2NoblesNT:  2,
        firstNobleRedNT:               1,
        secondNobleRedNT:              2,
        thirdNobleRedNT:               3,
        fourthNobleRedNT:              4,
        firstNobleRed5NT:              1,
        secondNobleRed5NT:             2,
        thirdNobleRed5NT:              3,
    };

    function loadSettings() {
        try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'); } catch { return {}; }
    }
    function saveSettings(s) { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); }

    const params    = new URLSearchParams(window.location.search);
    const screen    = params.get('screen');
    const isVillage = screen === 'info_village';
    const isMemo    = screen === 'memo';

    function whenReady(cb) {
        if (typeof $ !== 'undefined' && typeof TribalWars !== 'undefined') cb();
        else setTimeout(() => whenReady(cb), 150);
    }

    /* ── Read coordinates from the "Coordenadas:" table row on the page ── */
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

    /* =========================================================
       INFO_VILLAGE  — attach click handlers + scheduled panel
    ========================================================= */
    if (isVillage) whenReady(initVillage);

    function initVillage() {
        const villageId = params.get('village')
            || ((typeof game_data !== 'undefined' && game_data.village)
                ? String(game_data.village.id) : null);

        /* Fetch troop templates from the rally point and send to the overlay */
        if (villageId) {
            fetch(`/game.php?village=${villageId}&screen=place`, { credentials: 'include' })
                .then(r => r.text())
                .then(html => {
                    const doc = new DOMParser().parseFromString(html, 'text/html');
                    const sel = doc.querySelector('#troop_template_selection');
                    if (!sel) return;
                    const options = Array.from(sel.querySelectorAll('option'))
                        .filter(o => o.value && o.value !== '0')
                        .map(o => ({ value: o.value, label: o.textContent.trim() }));
                    if (options.length) {
                        document.dispatchEvent(new CustomEvent('xbot:gluer:templates', {
                            detail: { options },
                        }));
                    }
                })
                .catch(() => {});
        }

        function attachHandlers() {
            document.querySelectorAll('tr.command-row').forEach(tr => {
                if (tr.__gluerBound) return;
                tr.__gluerBound = true;
                tr.style.cursor = 'pointer';
                tr.addEventListener('click', () => selectRow(tr));
            });
        }

        attachHandlers();
        setInterval(attachHandlers, 3000);

        initScheduledPanel();
    }

    /* =========================================================
       SCHEDULED PANEL — always visible inside #commands_outgoings
       Reads from localStorage cache written by the memo page.
    ========================================================= */

    function initScheduledPanel() {
        let attempts = 0;
        const wait = () => {
            const container = document.getElementById('commands_outgoings');
            if (!container) {
                if (++attempts < 30) setTimeout(wait, 300);
                return;
            }

            /* Coord detection: try multiple strategies */
            let targetCoords = null;
            const c1 = readPageCoords();
            if (c1) {
                targetCoords = `${c1.x}|${c1.y}`;
            } else {
                /* Fallback: look for (X|Y) pattern in headings or info table */
                for (const el of document.querySelectorAll('h1,h2,h3,td,#content_value')) {
                    const m = el.textContent.match(/\((\d+)\|(\d+)\)/);
                    if (m) { targetCoords = `${m[1]}|${m[2]}`; break; }
                }
            }
            console.log('[KuminGluer] info_village coords:', targetCoords);
            if (!targetCoords) return;

            /* Header: title + refresh button */
            const header = document.createElement('div');
            header.style.cssText = 'display:flex;align-items:center;gap:8px;margin-top:10px;margin-bottom:4px';

            const title = document.createElement('span');
            title.textContent = 'Ataques Agendados (Kumin)';
            title.style.cssText = 'font-weight:bold;color:#3b4a6b;font-size:12px';

            const refreshBtn = document.createElement('button');
            refreshBtn.textContent = '🔄';
            refreshBtn.title = 'Atualizar da cache (visita screen=memo para dados frescos)';
            refreshBtn.style.cssText = 'padding:1px 6px;cursor:pointer;background:#3b4a6b;color:#fff;border:none;border-radius:3px;font-size:11px';

            header.appendChild(title);
            header.appendChild(refreshBtn);

            const panel = document.createElement('div');
            panel.style.cssText = 'border:2px solid #3b4a6b;border-radius:4px;background:#f0f4ff;padding:8px;font-size:12px';

            container.appendChild(header);
            container.appendChild(panel);

            refreshBtn.title = 'Atualizar da cache (visita screen=memo para dados frescos)';
            const render = () => renderFromCache(targetCoords, panel);
            refreshBtn.addEventListener('click', render);
            render();
        };
        wait();
    }

    function renderFromCache(targetCoords, panel) {
        const ntTemplate = loadSettings().ntTemplate || 'noNT';
        panel.innerHTML = '';

        const raw = localStorage.getItem(CACHE_KEY);
        if (!raw) {
            panel.innerHTML = '<span style="color:#888;font-size:11px">Sem dados — visita screen=memo para carregar.</span>';
            return;
        }

        let cache;
        try { cache = JSON.parse(raw); } catch {
            panel.innerHTML = '<span style="color:red;font-size:11px">Cache corrompida.</span>';
            return;
        }

        const commands = (cache.commands || []).filter(c => c.targetCoords === targetCoords);
        const updatedAt = cache.updatedAt ? new Date(cache.updatedAt) : null;

        const tsLine = document.createElement('div');
        tsLine.style.cssText = 'font-size:10px;color:#888;margin-bottom:6px';
        tsLine.textContent = updatedAt
            ? `Atualizado: ${updatedAt.toLocaleString('pt-PT', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })}`
            : '';
        panel.appendChild(tsLine);

        if (!commands.length) {
            const empty = document.createElement('span');
            empty.style.cssText = 'color:#555;font-size:11px';
            empty.textContent = 'Nenhum ataque agendado para esta aldeia.';
            panel.appendChild(empty);
            return;
        }

        const table = document.createElement('table');
        table.style.cssText = 'border-collapse:collapse;width:100%';

        const thead = table.createTHead();
        const hRow  = thead.insertRow();
        ['Label', 'Origem', 'Envio', 'Tropas'].forEach(h => {
            const th = document.createElement('th');
            th.textContent = h;
            th.style.cssText = 'background:#3b4a6b;color:#fff;padding:4px 8px;text-align:left;font-size:11px';
            hRow.appendChild(th);
        });

        const count = NT_COUNT[ntTemplate] ?? 1;
        const expanded = [];
        commands.forEach(c => {
            for (let n = 0; n < count; n++) expanded.push({ ...c, _copy: n });
        });

        const tbody = table.createTBody();
        expanded.forEach((c, i) => {
            const row = tbody.insertRow();
            row.style.background = i % 2 === 0 ? '#dce8ff' : '#eef3ff';

            const tdLabel = row.insertCell();
            tdLabel.textContent = c.label || '—';
            tdLabel.style.padding = '4px 8px';

            const tdSrc = row.insertCell();
            tdSrc.textContent = c.source || '—';
            tdSrc.style.padding = '4px 8px';

            const tdTime = row.insertCell();
            tdTime.style.cssText = 'padding:4px 8px;white-space:nowrap';
            if (c.sendMs) {
                const d  = new Date(c.sendMs);
                const ms = c.sendMs % 1000;
                tdTime.textContent = d.toLocaleString('pt-PT', {
                    day: '2-digit', month: '2-digit',
                    hour: '2-digit', minute: '2-digit', second: '2-digit',
                }) + `.${String(ms).padStart(3, '0')}`;

                const remaining = c.sendMs - Date.now();
                const tag = document.createElement('span');
                tag.style.fontSize = '11px';
                if (remaining > 0) {
                    const h = Math.floor(remaining / 3600000);
                    const m = Math.floor((remaining % 3600000) / 60000);
                    const s = Math.floor((remaining % 60000) / 1000);
                    tag.textContent = ` (${h}h ${m}m ${s}s)`;
                    tag.style.color = '#3b4a6b';
                } else {
                    tag.textContent = ' (enviado)';
                    tag.style.color = '#888';
                }
                tdTime.appendChild(tag);
            } else {
                tdTime.textContent = '—';
            }

            const tdUnit = row.insertCell();
            tdUnit.style.cssText = 'padding:4px 8px;white-space:nowrap';
            const unitEntries = Object.entries(c.units || {});
            if (unitEntries.length) {
                unitEntries.forEach(([unit, amount]) => {
                    const wrap = document.createElement('span');
                    wrap.style.cssText = 'display:inline-flex;align-items:center;gap:2px;margin-right:6px';
                    const img = document.createElement('img');
                    img.src = `/graphic/unit/unit_${unit}.png`;
                    img.style.cssText = 'width:16px;height:16px;vertical-align:middle';
                    const txt = document.createTextNode(amount === 'all' ? ' todos' : ` ${amount}`);
                    wrap.appendChild(img);
                    wrap.appendChild(txt);
                    tdUnit.appendChild(wrap);
                });
            } else {
                tdUnit.textContent = '—';
            }
        });

        panel.appendChild(table);
    }

    function selectRow(tr) {
        const endSpan = tr.querySelector('span[data-endtime]');
        const endSec  = parseInt(endSpan?.getAttribute('data-endtime') || '0', 10);
        if (!endSec) return;

        const msEl      = tr.querySelector('td span.grey.small');
        const ms        = parseInt(msEl?.textContent?.trim() || '0', 10);
        const arrivalMs = endSec * 1000 + ms;

        const labelEl = tr.querySelector('.quickedit-label');
        const label   = labelEl
            ? Array.from(labelEl.childNodes)
                .filter(n => n.nodeType === Node.TEXT_NODE)
                .map(n => n.textContent).join('').trim()
            : 'Ataque';

        const KNOWN_UNITS = new Set(['spear','sword','axe','archer','spy','light','marcher','heavy','ram','catapult','snob','knight','militia']);
        let unit = 'ram';
        const unitImgs = tr.querySelectorAll('span[data-command-id] img');
        for (const img of unitImgs) {
            const src = img.getAttribute('src') || '';
            const m = src.match(/unit[_\/]tiny[_\/]?([a-z0-9_]+)\./i)
                   || src.match(/unit_([a-z0-9_]+)\./i);
            if (m && KNOWN_UNITS.has(m[1].toLowerCase())) {
                unit = m[1].toLowerCase();
                break;
            }
        }

        const cmdSpan = tr.querySelector('span.quickedit[data-id]');
        const cmdId   = cmdSpan?.getAttribute('data-id') || '';

        const coords  = readPageCoords();
        const targetX = coords?.x ?? null;
        const targetY = coords?.y ?? null;
        const villageId = params.get('id') || params.get('village');

        document.querySelectorAll('tr.command-row').forEach(r => {
            r.style.outline = '';
            r.style.backgroundColor = '';
        });
        tr.style.outline = '2px solid #3b82f6';
        tr.style.backgroundColor = '#eff6ff';

        document.dispatchEvent(new CustomEvent('xbot:gluer:select', {
            detail: { arrivalMs, ms, label, unit, cmdId, targetX, targetY, villageId },
        }));
    }

    /* =========================================================
       MEMO — cache Kumin commands + auto-fill quickAdd queue
    ========================================================= */
    if (isMemo) whenReady(initMemo);

    function initMemo() {
        /* Shared mutex: if planeador (or another instance) already claimed the queue
         * in this page load, defer caching until after their queue processing finishes
         * to avoid concurrent popup manipulation (which causes crashes). */
        if (window.__kuminQueueClaimed) {
            if (window.__xbotQueueDone) {
                setTimeout(cacheKuminCommands, 800);
            } else {
                window.addEventListener('xbot:kumin:queue:done', function() {
                    setTimeout(cacheKuminCommands, 800);
                }, { once: true });
            }
            return;
        }

        /* Read queue first — if there is one, process it before caching.
         * Running cacheKuminCommands concurrently opens edit popups for
         * existing rows while processQueue is also watching for a popup,
         * causing check() to grab the wrong popup and create duplicate commands. */
        let queue = null;
        try {
            const parsed = JSON.parse(localStorage.getItem(QUEUE_KEY));
            if (Array.isArray(parsed) && parsed.length) queue = parsed;
        } catch {}

        if (!queue) {
            cacheKuminCommands();
            return;
        }

        /* Claim synchronously — same-thread mutex with planeador's initMemo. */
        window.__kuminQueueClaimed = true;

        let attempts = 0;
        const waitForForm = () => {
            if (document.getElementById('quickAddName')) {
                processQueue(queue);
            } else if (++attempts < 50) {
                setTimeout(waitForForm, 250);
            } else {
                window.__kuminQueueClaimed = false;
                cacheKuminCommands();
            }
        };
        setTimeout(waitForForm, 600);
    }

    const ALL_UNITS = ['spear','sword','axe','archer','spy','light','marcher','heavy','ram','catapult','snob','knight'];

    /* Poll for Kumin's rendered rows; only open popups for commands not yet in cache */
    function cacheKuminCommands() {
        /* Load existing per-command unit data keyed by command ID */
        const unitCache = {};
        try {
            const raw = localStorage.getItem(CACHE_KEY);
            if (raw) {
                (JSON.parse(raw).commands || []).forEach(c => {
                    if (c.id && Object.keys(c.units || {}).length) unitCache[c.id] = c;
                });
            }
        } catch {}

        let attempts = 0;
        const poll = () => {
            const rows = Array.from(document.querySelectorAll('tr[id^="command_"]'));
            if (rows.length > 0) {
                const newRows = rows.filter(tr => !unitCache[tr.id.replace('command_', '')]);
                console.log(`[KuminGluer] ${rows.length - newRows.length} cached, ${newRows.length} new — opening popups for new only.`);

                extractAllCommands(newRows, (newCommands) => {
                    newCommands.forEach(c => { unitCache[c.id] = c; });

                    const commands = rows.map(tr => {
                        const id      = tr.id.replace('command_', '');
                        const tds     = tr.querySelectorAll('td');
                        const timerEl = tds[5]?.querySelector('b.commandTimer[data-endtime]');
                        const endSec  = timerEl ? parseInt(timerEl.getAttribute('data-endtime'), 10) : null;
                        const msEl    = tds[5]?.querySelector('span.grey.small');
                        const ms      = parseInt(msEl?.textContent?.trim() || '0', 10);
                        const cached  = unitCache[id] || {};
                        return {
                            ...cached,
                            id,
                            label:        tds[2]?.textContent?.trim() || cached.label || '',
                            source:       tds[3]?.textContent?.trim() || cached.source || '',
                            targetCoords: tds[4]?.textContent?.trim() || cached.targetCoords || '',
                            sendMs:       endSec ? (endSec * 1000 + ms) : (cached.sendMs || null),
                        };
                    });

                    localStorage.setItem(CACHE_KEY, JSON.stringify({ commands, updatedAt: Date.now() }));
                    console.log(`[KuminGluer] Cached ${commands.length} command(s).`);
                });
            } else if (++attempts < 40) {
                setTimeout(poll, 500);
            }
        };
        setTimeout(poll, 1000);
    }

    function extractAllCommands(rows, onDone) {
        const results = [];
        let idx = 0;
        function next() {
            if (idx >= rows.length) { onDone(results); return; }
            extractOneCommand(rows[idx++], (data) => {
                results.push(data);
                setTimeout(next, 400);
            });
        }
        next();
    }

    function extractOneCommand(tr, onDone) {
    const tds     = tr.querySelectorAll('td');
    const timerEl = tds[5]?.querySelector('b.commandTimer[data-endtime]');
    const endSec  = timerEl ? parseInt(timerEl.getAttribute('data-endtime'), 10) : null;
    const msEl    = tds[5]?.querySelector('span.grey.small');
    const ms      = parseInt(msEl?.textContent?.trim() || '0', 10);
    const base = {
        id:           tr.id.replace('command_', ''),
        label:        tds[2]?.textContent?.trim() || '',
        source:       tds[3]?.textContent?.trim() || '',
        targetCoords: tds[4]?.textContent?.trim() || '',
        sendMs:       endSec ? (endSec * 1000 + ms) : null,
        units:        {},
    };

        const editBtn = document.getElementById(`edit_command_${base.id}`);
        if (!editBtn) { onDone(base); return; }

        editBtn.click();

        let wait = 0;
        const pollPopup = () => {
            const input = document.getElementById('unit_input_spear');
            if (input) {
                ALL_UNITS.forEach(u => {
                    const inp = document.getElementById(`unit_input_${u}`);
                    const cb  = document.getElementById(`${u}_all`);
                    if (!inp) return;
                    const sendAll = cb ? cb.checked : false;
                    const amount  = parseInt(inp.value, 10) || 0;
                    if (sendAll || amount > 0) {
                        base.units[u] = sendAll ? 'all' : amount;
                    }
                });

                const cross = document.getElementById('popup_cross');
                if (cross) cross.click();
                setTimeout(() => onDone(base), 250);
            } else if (++wait < 25) {
                setTimeout(pollPopup, 200);
            } else {
                onDone(base);
            }
        };
        setTimeout(pollPopup, 400);
    }


    function nativeSet(el, value) {
        if (!el) return;
        const proto = el.tagName === 'SELECT'
            ? window.HTMLSelectElement.prototype
            : window.HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
        if (setter) setter.call(el, value);
        else el.value = value;
        el.dispatchEvent(new Event('input',  { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function processQueue(queue) {
        let idx = 0;

        function fillNext() {
            if (idx >= queue.length) {
                localStorage.removeItem(QUEUE_KEY);
                console.log('[KuminGluer] All entries processed.');
                // Cache now that no popups will be opened by processQueue
                setTimeout(cacheKuminCommands, 1000);
                // Auto-close if opened as a popup from the overlay
                setTimeout(() => { try { window.close(); } catch {} }, 2500);
                return;
            }

            const e       = queue[idx++];
            const nameEl  = document.getElementById('quickAddName');
            const srcEl   = document.getElementById('quickAddSource');
            const tgtEl   = document.getElementById('quickAddTarget');
            const dtEl    = document.getElementById('quickAddDate');
            const typeEl  = document.getElementById('quickAddCommandTypeSelection');
            const editBtn = document.getElementById('quickAddEdit');

            if (!nameEl || !editBtn) {
                console.warn('[KuminGluer] quickAdd form not ready');
                return;
            }

            nativeSet(nameEl, e.name        || '');
            nativeSet(srcEl,  e.source      || '');
            nativeSet(tgtEl,  e.target      || '');
            nativeSet(dtEl,   e.date        || '');
            if (typeEl) nativeSet(typeEl, e.commandType || 'Attack');

            setTimeout(() => {
                editBtn.click();
                waitForEditorAndFill(e, fillNext);
            }, 350);
        }

        function waitForEditorAndFill(entry, onDone) {
            let attempts = 0;
            function check() {
                const popupDate = document.getElementById('popupDate');
                const createBtn = findCreateNewButton();
                // offsetParent === null means the element is hidden — wait for the real popup
                if (popupDate && popupDate.offsetParent !== null && createBtn) {
                    nativeSet(popupDate, entry.date || '');
                    setUnitsInEditor(entry);
                    setTimeout(() => {
                        createBtn.click();
                        setTimeout(onDone, 800);
                    }, 400);
                } else if (++attempts < 50) {
                    setTimeout(check, 200);
                } else {
                    console.warn('[KuminGluer] Editor did not appear — skipping entry');
                    onDone();
                }
            }
            setTimeout(check, 400);
        }

        function findCreateNewButton() {
            return Array.from(document.querySelectorAll('button, input[type="submit"]'))
                .find(b => {
                    const t = (b.textContent || b.value || '')
                        .toLowerCase().replace(/\s+/g, ' ').trim();
                    return t.includes('create new')
                        || t.includes('criar novo')
                        || t.includes('novo')
                        || t.includes('new');
                }) || null;
        }

        function setUnitsInEditor(entry) {
            const units = entry.units;
            if (!units || typeof units !== 'object') return;

            const ALL_UNITS = ['spear','sword','axe','archer','spy','light','marcher','heavy','ram','catapult','snob','knight'];

            ALL_UNITS.forEach(unit => {
                const cb = document.getElementById(`${unit}_all`);
                if (cb && cb.checked) cb.click();
            });

            ALL_UNITS.forEach(unit => {
                const amount = units[unit];
                const input  = findUnitInput(unit);
                if (!input) return;
                const val = (amount && amount > 0) ? String(amount) : '';
                nativeSet(input, val);
                if (amount && amount > 0)
                    console.log('[KuminGluer] Set', unit, '=', amount);
            });

            const sigilEl = document.getElementById('popupSigil');
            if (sigilEl && entry.sigilPct != null) {
                nativeSet(sigilEl, String(entry.sigilPct));
                console.log('[KuminGluer] Set sigil =', entry.sigilPct);
            }
        }

        function findUnitInput(unit) {
            return document.getElementById(`unit_input_${unit}`)
                || document.querySelector(`input[name="${unit}"].unitsInput`)
                || document.querySelector(`input[name="${unit}"]`)
                || document.querySelector(`input[data-unit="${unit}"]`);
        }

        fillNext();
    }

})();

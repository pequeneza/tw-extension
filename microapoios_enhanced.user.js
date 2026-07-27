// ==UserScript==
// @name         Micro Apoios — Support Sender
// @namespace    http://tampermonkey.net/
// @version      2.0.7
// @description  Send support templates to multiple target coordinates with batch automation
// @author       Enhanced by xBot & xStriker from original by Costache Madalin
// @match        https://*.tribalwars.com.pt/game.php*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function () {
    'use strict';

    if (!window.game_data) return;
    if (window.__mapoiosRunning) return;
    window.__mapoiosRunning = true;

    // Adds random jitter to fixed UI-automation delays so repeated runs (and
    // different installs of this script) don't produce an identical, mechanically
    // precise timing signature.
    function jitter(baseMs, spreadMs) {
        return Math.max(0, Math.round(baseMs + (Math.random() * 2 - 1) * spreadMs));
    }

    // ─── Header icons (inline SVG, self-contained — no external CDN) ───────────────
    // Using `stroke="currentColor"`/`fill="currentColor"` means each icon inherits the
    // colour of its own <a>, which is set inline from the active theme's textColor — so
    // these automatically match whichever of the 10 themes the user has picked, unlike the
    // old icons8.com PNGs which were always tinted the same regardless of theme.
    //
    // Declared up here (not just before createMainInterface, where they're used) because
    // waitForJquery's poll can call buildUI()/createMainInterface() SYNCHRONOUSLY on its very
    // first check if jQuery is already loaded on the page (the common case) — i.e. before the
    // script has finished its own top-to-bottom pass. `var` only hoists the name, not the
    // assigned value, so declaring these below that point meant they briefly read as `undefined`
    // and got concatenated into the header HTML as the literal string "undefined".
    var ICON_CLOSE =
        '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
    var ICON_MINIMIZE =
        '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M5 12h14"/></svg>';
    var ICON_THEME = // "adjustments" glyph — opens the theme/appearance settings panel
        '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="6" x2="20" y2="6" stroke-linecap="round"/><circle cx="9" cy="6" r="2" fill="currentColor" stroke="none"/><line x1="4" y1="12" x2="20" y2="12" stroke-linecap="round"/><circle cx="15" cy="12" r="2" fill="currentColor" stroke="none"/><line x1="4" y1="18" x2="20" y2="18" stroke-linecap="round"/><circle cx="7" cy="18" r="2" fill="currentColor" stroke="none"/></svg>';
    var ICON_DOCK = // map-pin glyph — toggles docked (pinned into page flow) vs floating
        '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 21s7-7.5 7-12a7 7 0 10-14 0c0 4.5 7 12 7 12z"/><circle cx="12" cy="9" r="2.4"/></svg>';

    // ─── Page detection via URLSearchParams (order-independent) ────────────────
    const _p        = new URLSearchParams(location.search);
    const isMassPage = _p.get('screen') === 'place' && _p.get('mode') === 'call' && !_p.get('try');
    const isConfirm  = _p.get('screen') === 'place' && _p.get('try') === 'confirm';

    if (!isMassPage && !isConfirm) return;

    // ─── Storage keys (world-scoped) ────────────────────────────────────────────
    const W              = game_data.world;
    const BATCH_KEY      = W + '_mapoios_batch_v1';
    const STOP_KEY       = W + '_mapoios_stop_v1';
    const TEMPLATES_KEY  = W + '_mapoios_templates_v1';
    const SETTINGS_KEY   = W + 'support_sender_settings2';
    const THEME_KEY      = 'supportSenderTheme';
    const GROUP_KEY      = W + '_mapoios_group';
    const UI_KEY         = W + '_mapoios_ui_v1';

    // ─── UI state (docked vs floating) ──────────────────────────────────────────
    // Docked = inserted into the page flow right after .info_box (same posture planeador
    // defaults to); floating = today's position:fixed draggable panel. Minimized state is
    // NOT persisted here on purpose — the panel is meant to always open collapsed.
    function getUIState() {
        try {
            var s = JSON.parse(localStorage.getItem(UI_KEY) || 'null');
            return { docked: s && typeof s.docked === 'boolean' ? s.docked : true };
        } catch (e) { return { docked: true }; }
    }
    function saveUIState(s) { localStorage.setItem(UI_KEY, JSON.stringify(s)); }

    // ─── Batch helpers ───────────────────────────────────────────────────────────
    function getBatch()   { try { return JSON.parse(localStorage.getItem(BATCH_KEY) || 'null'); } catch { return null; } }
    function isStopRequested() { return localStorage.getItem(STOP_KEY) === '1'; }
    // Every persist stamps lastActivity — this is how runBatchHandler tells an actively
    // progressing batch (a few seconds between stamps) from an abandoned one (tab closed,
    // crash, browser restart) that happens to still have running:true sitting in storage.
    //
    // setBatch is called from many nested async callbacks (autocomplete polls, page-advance
    // polls, submit timeouts...). Stopping a batch used to mean flipping running:false — but
    // whichever of those callbacks was already in flight at that moment was holding its OWN
    // stale copy of the batch object (still running:true), and its next setBatch() call wrote
    // that stale copy straight back over the stop, silently resurrecting the batch (reproduced
    // live: it kept sending for another cycle after being "stopped"). STOP_KEY is a separate
    // flag nothing can accidentally overwrite this way — every persist checks it and refuses to
    // write running:true once a stop has been requested, no matter how stale the caller's copy
    // of the batch object is.
    function setBatch(b) {
        if (b) {
            b.lastActivity = Date.now();
            if (b.running && isStopRequested()) b.running = false;
        }
        localStorage.setItem(BATCH_KEY, JSON.stringify(b));
    }
    function clearBatch() {
        localStorage.setItem(STOP_KEY, '1'); // veto first, so no in-flight write can resurrect it
        localStorage.removeItem(BATCH_KEY);
        removeEmergencyStopBanner();
    }

    // Abandoned-batch cutoff: normal cycle time between persists is well under 5s (autocomplete
    // poll maxes at 4s, fill/submit delays are ~1.5-2.4s). 90s of silence means whatever last
    // touched this batch is gone, so auto-resuming on an unrelated page visit would be a footgun.
    var BATCH_STALE_MS = 90 * 1000;

    // Rendered with plain DOM APIs (no jQuery dependency) so a Stop control exists the instant
    // a running batch is detected — not only after jQuery loads and the full panel builds, which
    // was the window during which the batch was effectively unstoppable.
    function showEmergencyStopBanner(batch) {
        var el = document.getElementById('mapoios_estop');
        if (!el) {
            el = document.createElement('div');
            el.id = 'mapoios_estop';
            el.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:999999;background:#c0392b;color:#fff;padding:10px;text-align:center;font:bold 13px Arial,sans-serif;cursor:pointer;';
            el.addEventListener('click', function () { clearBatch(); });
            document.body.appendChild(el);
        }
        el.textContent = '⛔ xBot em execução (alvo ' + (batch.index + 1) + '/' + batch.targets.length + ') — clica para PARAR';
    }
    function removeEmergencyStopBanner() {
        var el = document.getElementById('mapoios_estop');
        if (el) el.remove();
    }

    // ─── Confirm page (safety net — mass support usually doesn't redirect here) ───
    if (isConfirm) {
        var _cb = getBatch();
        if (_cb && _cb.running) {
            setTimeout(function () {
                var btn = document.querySelector('#place_call_form_submit, .btn-confirm-yes, input[value="Enviar apoio"]');
                if (btn) btn.click();
            }, jitter(1500, 300));
        }
        return;
    }

    // ─── From here: isMassPage only ─────────────────────────────────────────────

    // ─── Troop configuration ─────────────────────────────────────────────────────
    const SKIP_UNITS = ['snob', 'militia', 'knight', 'marcher'];
    var units = Array.from(game_data.units).filter(function (u) { return !SKIP_UNITS.includes(u); });

    // ─── Pop weights ──────────────────────────────────────────────────────────────
    var POP_KEY = W + '_mapoios_pop_v1';
    var DEFAULT_POP_WEIGHTS = (function () {
        var w = {};
        units.forEach(function (u) { w[u] = 1; });
        w.heavy = 4;
        w.catapult = 2;
        return w;
    })();
    function getPopWeights() {
        try {
            var s = JSON.parse(localStorage.getItem(POP_KEY) || 'null');
            if (!s) return Object.assign({}, DEFAULT_POP_WEIGHTS);
            units.forEach(function (u) { if (!(u in s)) s[u] = DEFAULT_POP_WEIGHTS[u] !== undefined ? DEFAULT_POP_WEIGHTS[u] : 1; });
            return s;
        } catch (e) { return Object.assign({}, DEFAULT_POP_WEIGHTS); }
    }
    function savePopWeights(w) { localStorage.setItem(POP_KEY, JSON.stringify(w)); }

    // ─── Unit selection ───────────────────────────────────────────────────────────
    var UNIT_SEL_KEY = W + '_mapoios_unitsel_v1';
    function getUnitSelection() {
        try {
            var s = JSON.parse(localStorage.getItem(UNIT_SEL_KEY) || 'null');
            if (!s) { var d = {}; units.forEach(function (u) { d[u] = true; }); return d; }
            units.forEach(function (u) { if (!(u in s)) s[u] = true; });
            return s;
        } catch (e) { var d2 = {}; units.forEach(function (u) { d2[u] = true; }); return d2; }
    }
    function saveUnitSelection(sel) { localStorage.setItem(UNIT_SEL_KEY, JSON.stringify(sel)); }

    // ─── Theme variables ─────────────────────────────────────────────────────────
    var textColor            = '#ffffff';
    var backgroundInput      = '#000000';
    var borderColor          = '#C5979D';
    var backgroundContainer  = '#2B193D';
    var backgroundHeader     = '#2C365E';
    var backgroundMainTable  = '#484D6D';
    var backgroundInnerTable = '#4B8F8C';
    var widthInterface       = 70;
    var headerColorAlternateTable = -30;
    var backgroundAlternateTableEven;
    var backgroundAlternateTableOdd;

    var defaultTheme = '[["theme1",["#E0E0E0","#000000","#C5979D","#2B193D","#2C365E","#484D6D","#4B8F8C","50"]],["currentTheme","theme1"],["theme2",["#E0E0E0","#000000","#F76F8E","#113537","#37505C","#445552","#294D4A","50"]],["theme3",["#E0E0E0","#000000","#ACFCD9","#190933","#665687","#7C77B9","#623B5A","50"]],["theme4",["#E0E0E0","#000000","#181F1C","#60712F","#274029","#315C2B","#214F4B","50"]],["theme5",["#E0E0E0","#000000","#9AD1D4","#007EA7","#003249","#1F5673","#1C448E","50"]],["theme6",["#E0E0E0","#000000","#EA8C55","#81171B","#540804","#710627","#9E1946","50"]],["theme7",["#E0E0E0","#000000","#754043","#37423D","#171614","#3A2618","#523A34","50"]],["theme8",["#E0E0E0","#000000","#9E0031","#8E0045","#44001A","#600047","#770058","50"]],["theme9",["#E0E0E0","#000000","#C1BDB3","#5F5B6B","#323031","#3D3B3C","#575366","50"]],["theme10",["#E0E0E0","#000000","#E6BCCD","#29274C","#012A36","#14453D","#7E52A0","50"]]]';

    // ─── Batch state machine (mass support page) ─────────────────────────────────
    (function runBatchHandler() {
        var batch = getBatch();
        if (!batch || !batch.running) return;

        // Belt-and-braces alongside the STOP_KEY veto in setBatch: a fresh page load is the one
        // place we're guaranteed nothing else is mid-flight, so also just refuse outright to
        // schedule anything if a stop is on record, regardless of what running says.
        if (isStopRequested()) { batch.running = false; setBatch(batch); return; }

        // Refuse to silently resume a batch nobody has touched in a while — this is what
        // used to make the script start sending the moment this screen was opened for an
        // unrelated reason, with a leftover batch from a session that was never cleanly
        // stopped (closed tab, crash, restart).
        if (batch.lastActivity && (Date.now() - batch.lastActivity) > BATCH_STALE_MS) {
            batch.running = false;
            setBatch(batch);
            showBatchNotice('Batch abandonado detetado (inativo há mais de ' + Math.round((Date.now() - batch.lastActivity) / 1000) + 's) — parado por segurança. Reinicia manualmente se quiseres continuar.');
            return;
        }

        showEmergencyStopBanner(batch);

        if (batch.state === 'filling' && !batch.needNextPage) {
            // Target was selected; fill troops and send
            setTimeout(function () { autoFillAndSend(batch); }, jitter(2000, 400));
        } else {
            // Need to (re)select the target — either starting fresh, or resuming a target whose
            // previous partial send (not enough troops on that page) reset target selection and
            // pagination on reload. Either way autoFillAndSend picks the right page back up via
            // batch.pageAttempts once the target is selected again.
            batch.needNextPage = false;
            setTimeout(function () { navigateToTarget(batch.targets[batch.index], batch.group, batch); }, jitter(800, 200));
        }
    })();

    function normalizeCoord(c) {
        if (!c) return '';
        var parts = String(c).split('|');
        return parseInt(parts[0], 10) + '|' + parseInt(parts[1], 10);
    }

    function getCurrentTargetCoord() {
        // Desktop: read from page header text (shows "X|Y" in village-name element)
        var vn = document.querySelector('.village-name, #target_name');
        if (vn) { var m = vn.textContent.match(/\d+\|\d+/); if (m) return m[0]; }
        // Mobile: coordinate inputs
        var ix = document.getElementById('inputx'), iy = document.getElementById('inputy');
        if (ix && iy && ix.value && iy.value) return ix.value.trim() + '|' + iy.value.trim();
        // Try URL target param (numeric VID — can't compare with coord directly)
        return null;
    }

    // Finds the autocomplete suggestion whose displayed coord actually matches — never
    // trust "whichever item is first", since a stale/leftover suggestion from the
    // previous target can still be in the DOM when the poll fires.
    function findMatchingAutocompleteItem(coord) {
        var items = document.querySelectorAll('.target-select-autocomplete .village-item');
        for (var i = 0; i < items.length; i++) {
            var m = items[i].textContent.match(/\d+\s*\|\s*\d+/);
            if (m && normalizeCoord(m[0]) === normalizeCoord(coord)) return items[i];
        }
        return null;
    }

    function navigateToTarget(coord, group, batch) {
        // If the page already has this target selected, skip navigation and fill directly
        var cur = getCurrentTargetCoord();
        if (cur && normalizeCoord(cur) === normalizeCoord(coord)) {
            logBatch('[Batch] Alvo já ativo: ' + coord + ' — a preencher diretamente', batch);
            batch.state = 'filling';
            setBatch(batch);
            setTimeout(function () { autoFillAndSend(getBatch()); }, jitter(800, 200));
            return;
        }

        function typeAndSelect() {
            // Step 2: type coord into the autocomplete input
            var inp = document.querySelector('input.target-input-field, input.target-input-autocomplete, input.ui-autocomplete-input');
            if (!inp) { _urlNavigate(coord, group, batch); return; }

            inp.value = coord;
            // Trigger jQuery UI autocomplete via key events
            $(inp).trigger('focus').trigger('keydown').trigger('keyup').trigger('input');

            // Step 3: poll for an autocomplete suggestion that actually matches this coord
            // (not just "the first item" — that can be a stale entry from the previous target)
            var waited = 0, maxWait = 4000, pollMs = 200;
            var poll = setInterval(function () {
                waited += pollMs;
                var item = findMatchingAutocompleteItem(coord);
                if (item) {
                    clearInterval(poll);

                    // Step 4: save state='filling' BEFORE clicking (survives page reload)
                    batch.state = 'filling';
                    setBatch(batch);

                    // Click the village name (not village-delete inside it)
                    var clickTarget = item.querySelector('.village-name') || item.querySelector('.village-picture') || item;
                    clickTarget.click();

                    // Fallback: if page didn't reload in 2.5s, fill directly
                    setTimeout(function () {
                        var b = getBatch();
                        if (b && b.running && b.state === 'filling') autoFillAndSend(b);
                    }, jitter(2500, 400));

                } else if (waited >= maxWait) {
                    clearInterval(poll);
                    logBatch('[Batch] Autocomplete timeout for ' + coord + ' — falling back to URL nav', batch);
                    _urlNavigate(coord, group, batch);
                }
            }, pollMs);
        }

        // Step 1: clear current target if one is shown, then WAIT for the deletion to
        // actually take effect before typing the next coord — a fixed 500ms guess here
        // was the root cause of clicks landing on the still-active previous target when
        // TW's delete/refresh took longer than that.
        var delBtn = document.querySelector('img.village-delete');
        if (!delBtn) { setTimeout(typeAndSelect, jitter(500, 150)); return; }

        delBtn.click();
        var clearWaited = 0, clearMaxWait = 2500, clearPollMs = 100;
        var clearPoll = setInterval(function () {
            clearWaited += clearPollMs;
            if (!document.querySelector('img.village-delete') || clearWaited >= clearMaxWait) {
                clearInterval(clearPoll);
                setTimeout(typeAndSelect, jitter(200, 60));
            }
        }, clearPollMs);
    }

    function _urlNavigate(coord, group, batch) {
        if (batch) { batch.state = 'filling'; setBatch(batch); }
        var myVid = game_data.village.id;
        // Forward sitter mode (?t=<id>) the same way kumin_gluer.user.js does — without this,
        // a sitter-managed batch run would drop back into the sitter's own account context on
        // this navigation instead of staying on the managed account.
        var sitterId = _p.get('t');
        var page     = batch && batch.page;
        // Forwarded the same way as page/group below — the "Distância" column header toggles
        // this between nearest-first (dir=1) and furthest-first (dir=0), and it needs to be
        // resent on every navigation or it silently reverts, same as the page/group bugs before.
        var dir      = (batch && batch.dir) || '1';
        location.href = '/game.php?village=' + myVid +
            '&screen=place&order=distance&dir=' + encodeURIComponent(dir) +
            '&target=' + encodeURIComponent(coord) +
            '&mode=call' +
            (group ? '&group=' + encodeURIComponent(group) : '') +
            (page ? '&page=' + encodeURIComponent(page) : '') +
            (sitterId ? '&t=' + encodeURIComponent(sitterId) : '');
    }

    // Forcing the group via the URL's &group= param does NOT reliably scope which villages TW
    // actually fills from — confirmed live: the group-menu link can show the intended group
    // highlighted while #village_troup_list is still populated from an unrelated, unfiltered
    // village set (and things like the page-size form's plain POST silently reset it back to
    // "todos" too). The selected group renders as <strong class="group-menu-item" data-group-id=
    // "X">, everything else as a clickable <a class="group-menu-item" data-group-id="Y">. Clicking
    // the real element is what actually drives TribalWars' own client-side filtering, so that's
    // asserted immediately before every fill instead of trusting the URL.
    function ensureGroupSelected(groupId, cb) {
        if (!groupId) { cb(); return; }
        if (document.querySelector('strong.group-menu-item[data-group-id="' + groupId + '"]')) { cb(); return; }
        var link = document.querySelector('a.group-menu-item[data-group-id="' + groupId + '"]');
        if (!link) { cb(); return; } // group not present on this page — proceed as-is
        link.click();
        var waited = 0, maxWait = 4000, pollMs = 150;
        var poll = setInterval(function () {
            waited += pollMs;
            if (document.querySelector('strong.group-menu-item[data-group-id="' + groupId + '"]') || waited >= maxWait) {
                clearInterval(poll);
                cb();
            }
        }, pollMs);
    }

    // TribalWars' own village-list pagination widget: current page is a <strong class=
    // "paged-nav-item">, other pages are <a class="paged-nav-item"> siblings immediately
    // following it. Clicks to the next one and waits for the table body to actually change
    // (AJAX-driven, no page reload). cb(false) when there's no further page.
    function goToNextPage(cb) {
        var current = document.querySelector('strong.paged-nav-item');
        var next = current ? current.nextElementSibling : null;
        if (!next || next.tagName !== 'A' || !next.classList.contains('paged-nav-item')) { cb(false); return; }
        var tbody = document.querySelector('#village_troup_list tbody');
        var before = tbody ? tbody.innerHTML.slice(0, 200) : '';
        next.click();
        var waited = 0, maxWait = 4000, pollMs = 150;
        var poll = setInterval(function () {
            waited += pollMs;
            var nowTbody = document.querySelector('#village_troup_list tbody');
            var now = nowTbody ? nowTbody.innerHTML.slice(0, 200) : '';
            if (now !== before || waited >= maxWait) {
                clearInterval(poll);
                cb(now !== before);
            }
        }, pollMs);
    }

    // Re-selecting a target (and re-asserting the group) resets pagination back to page 1, so
    // resuming a target that's N pages deep means clicking forward N times first.
    function advancePages(n, cb) {
        if (n <= 0) { cb(true); return; }
        goToNextPage(function (ok) {
            if (!ok) { cb(false); return; }
            advancePages(n - 1, cb);
        });
    }

    var MAX_PAGE_ATTEMPTS = 50; // defensive cap against a misbehaving pagination widget

    function autoFillAndSend(batch) {
        var tpl = batch.template;
        if (!tpl || Object.keys(tpl).length === 0) {
            console.log('[MicroApoios] No template set.');
            return;
        }

        ensureGroupSelected(batch.group, function () {
            // "remaining" tracks what's still owed to THIS target across possibly multiple
            // pages/sends — only (re)initialized when starting a fresh target, never when just
            // resuming one that's still short after a prior partial send.
            if (!batch.remaining) {
                batch.remaining = {};
                Object.keys(tpl).forEach(function (unit) {
                    batch.remaining[unit] = Math.round((parseFloat(tpl[unit]) || 0) * 1000); // k → actual count
                });
                // Every target uses the same template, so a page that had none of the needed
                // units for a PREVIOUS target will have none for this one either — no point
                // re-scanning pages already proven empty this run. batch.pageFloor is the
                // deepest page any target has had to reach so far (persists for the whole
                // batch, unlike pageAttempts which is per-target); start each new target there
                // instead of back at page 1.
                batch.pageAttempts = batch.pageFloor || 0;
            }
            // Re-selecting the target (and re-asserting the group above) resets pagination back
            // to page 1, so get back to wherever this target's fill had reached first.
            advancePages(batch.pageAttempts || 0, function (reachedPage) {
                if (!reachedPage) {
                    finalizeTargetIncomplete(batch, 'página anterior já não existe');
                    return;
                }
                fillCurrentPageAndSend(batch);
            });
        });
    }

    // Fills whatever's still owed to the current target (batch.remaining) from the CURRENTLY
    // rendered page of #village_troup_list, then either submits (fully or partially satisfied)
    // or — if this page had nothing usable at all — tries the next page of the same group before
    // giving up on the target.
    function fillCurrentPageAndSend(batch) {
        var remaining = batch.remaining;

        // Select all villages
        var selectAll = document.getElementById('place_call_select_all');
        if (selectAll && !selectAll.checked) selectAll.click();

        // Zero all visible unit inputs
        document.querySelectorAll('#village_troup_list input[type=number]').forEach(function (i) { i.value = 0; });

        // Rows are in the page's distance-to-target order (nearest-first or furthest-first,
        // whichever the user had active via the "Distância" column and batch.dir preserves —
        // see _urlNavigate), so that direction's villages are consumed first, top to bottom,
        // until whatever's still owed for this target is met.
        var takenThisPage = {};
        Object.keys(remaining).forEach(function (u) { takenThisPage[u] = 0; });
        document.querySelectorAll('#village_troup_list tbody tr').forEach(function (row) {
            Object.keys(remaining).forEach(function (unit) {
                var stillOwed = remaining[unit] - takenThisPage[unit];
                if (stillOwed <= 0) return;
                var input = row.querySelector('.call-unit-box-' + unit);
                if (!input) return;
                var availEl = row.querySelector("[data-unit='" + unit + "']");
                // Strip non-digit chars: TW PT uses '.' as thousands sep ("1.000" → 1000)
                var avail = availEl ? (parseInt(availEl.textContent.replace(/\D/g, ''), 10) || 0) : 0;
                var take = Math.min(stillOwed, avail);
                input.value = take;
                takenThisPage[unit] += take;
            });
        });

        var totalTakenThisPage = Object.keys(takenThisPage).reduce(function (s, u) { return s + takenThisPage[u]; }, 0);

        if (totalTakenThisPage === 0) {
            // Nothing usable on this page — try the next page of the same group before treating
            // the target as unfulfillable. This is what lets a group spread across several pages
            // (page size) still fully support a target instead of silently under-filling it.
            if ((batch.pageAttempts || 0) >= MAX_PAGE_ATTEMPTS) {
                finalizeTargetIncomplete(batch, 'limite de páginas atingido');
                return;
            }
            goToNextPage(function (hasNext) {
                if (!hasNext) { finalizeTargetIncomplete(batch, 'sem tropas disponíveis em nenhuma página'); return; }
                batch.pageAttempts = (batch.pageAttempts || 0) + 1;
                // Confirmed this page is empty this run — raise the floor so the NEXT target
                // starts here too instead of re-scanning known-empty pages from page 1.
                batch.pageFloor = Math.max(batch.pageFloor || 0, batch.pageAttempts);
                setBatch(batch);
                setTimeout(function () { fillCurrentPageAndSend(batch); }, jitter(600, 150));
            });
            return;
        }

        // Find and click the send/submit button
        setTimeout(function () {
            // Re-read from storage to guard against stale-closure double-execution
            var fb = getBatch();
            if (!fb || !fb.running || fb.state !== 'filling') return;

            var newRemaining = {};
            var stillNeeded = false;
            Object.keys(remaining).forEach(function (u) {
                newRemaining[u] = Math.max(0, remaining[u] - (takenThisPage[u] || 0));
                if (newRemaining[u] > 0) stillNeeded = true;
            });

            var sentStr = Object.keys(takenThisPage)
                .filter(function (u) { return takenThisPage[u] > 0; })
                .map(function (u) { return u + ':' + takenThisPage[u].toLocaleString(); })
                .join(' | ');

            if (!fb.totalSent) fb.totalSent = {};
            Object.keys(takenThisPage).forEach(function (u) {
                fb.totalSent[u] = (fb.totalSent[u] || 0) + takenThisPage[u];
            });

            var submitBtn = (
                document.getElementById('place_call_form_submit') ||
                document.querySelector('#place_call_send input[type=submit]') ||
                document.querySelector('form[id*=call] input[type=submit]') ||
                document.querySelector('input[type=submit][name=action]') ||
                Array.from(document.querySelectorAll('input[type=submit], button[type=submit]'))
                    .find(function (b) { return b.offsetParent !== null; })
            );
            if (!submitBtn) {
                showBatchNotice('Batch: tropas preenchidas — clica Enviar manualmente (' + (fb.index + 1) + '/' + fb.targets.length + ')');
                return;
            }

            if (stillNeeded) {
                // Partial send from this page — persist progress and come back for more on the
                // next reload (runBatchHandler sees needNextPage and resumes this same target)
                // instead of moving on to the next one.
                logBatch('[' + (fb.index + 1) + '/' + fb.targets.length + '] ' + (fb.targets[fb.index] || '') + ' → ' + sentStr + ' (parcial, página ' + ((fb.pageAttempts || 0) + 1) + ', continua)', fb);
                fb.remaining = newRemaining;
                fb.pageAttempts = batch.pageAttempts || 0;
                fb.needNextPage = true;
                fb.state = 'filling';
            } else {
                logBatch('[' + (fb.index + 1) + '/' + fb.targets.length + '] ' + (fb.targets[fb.index] || '') + ' → ' + sentStr + ' (completo)', fb);
                fb.remaining = null;
                fb.pageAttempts = 0;
                fb.needNextPage = false;
                fb.index++;
                if (fb.index >= fb.targets.length) {
                    fb.running  = false;
                    fb.finished = true;
                } else {
                    fb.state = 'selecting';
                }
            }
            setBatch(fb);
            updateBatchUI(fb);
            submitBtn.click();
        }, jitter(1500, 300));
    }

    // Gives up on fully satisfying the current target (no more pages / villages to pull from)
    // and logs exactly what's still short before moving on to the next target.
    function finalizeTargetIncomplete(batch, reason) {
        var fb = getBatch();
        if (!fb || !fb.running) return;
        var shortfall = Object.keys(fb.remaining || batch.remaining || {})
            .map(function (u) { return { u: u, v: (fb.remaining || batch.remaining)[u] }; })
            .filter(function (e) { return e.v > 0; })
            .map(function (e) { return e.u + ':' + e.v.toLocaleString(); })
            .join(' | ');
        logBatch('[' + (fb.index + 1) + '/' + fb.targets.length + '] ' + (fb.targets[fb.index] || '') + ' → INCOMPLETO (faltam ' + (shortfall || '—') + '; ' + reason + ')', fb);
        fb.remaining = null;
        fb.pageAttempts = 0;
        fb.needNextPage = false;
        fb.index++;
        if (fb.index >= fb.targets.length) {
            fb.running = false;
            fb.finished = true;
            setBatch(fb);
            updateBatchUI(fb);
        } else {
            fb.state = 'selecting';
            setBatch(fb);
            updateBatchUI(fb);
            navigateToTarget(fb.targets[fb.index], fb.group, fb);
        }
    }

    function showBatchNotice(msg) {
        var el = document.getElementById('mapoios_notice');
        if (!el) {
            el = document.createElement('div');
            el.id = 'mapoios_notice';
            el.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:#aa44aa;color:#fff;padding:8px;text-align:center;font-weight:bold;font-size:13px;';
            document.body.appendChild(el);
        }
        el.textContent = msg;
    }

    // ─── Wait for jQuery then build UI ───────────────────────────────────────────
    (function waitForJquery() {
        var tries = 0;
        (function poll() {
            if (typeof $ !== 'undefined' && typeof TribalWars !== 'undefined') {
                buildUI();
                return;
            }
            if (++tries > 80) { console.error('[MicroApoios] jQuery not found'); return; }
            setTimeout(poll, 150);
        })();
    })();

    function buildUI() {
        initializationTheme();
        injectCSS();
        createMainInterface();
        changeTheme();
        addEvents();

        var batch = getBatch();
        if (batch && batch.finished) {
            setTimeout(function () {
                var totStr = batch.totalSent
                    ? Object.keys(batch.totalSent).filter(function (u) { return batch.totalSent[u] > 0; })
                          .map(function (u) { return u + ':' + batch.totalSent[u].toLocaleString(); }).join(' | ')
                    : '';
                if (typeof UI !== 'undefined') UI.SuccessMessage('Batch completo! ' + batch.targets.length + ' alvos. Total: ' + (totStr || '—'), 5000);
                clearBatch();
            }, 500);
        }
    }

    // ─── Inline CSS ───────────────────────────────────────────────────────────────
    function injectCSS() {
        if (document.getElementById('mapoios-css')) return;
        var s = document.createElement('style');
        s.id = 'mapoios-css';
        s.textContent = [
            '.mapoios-wrap{position:fixed;top:20px;left:20px;z-index:10000;border-radius:5px;width:50%;min-width:360px;font-size:12px;font-family:Arial,sans-serif;box-shadow:0 4px 24px rgba(0,0,0,.7);overflow:hidden;}',
            // Docked = sits in the normal page flow right after .info_box, full content width,
            // no shadow/fixed-position chrome (those only make sense for the floating overlay).
            '.mapoios-wrap.mapoios-docked{position:static;top:auto;left:auto;width:100%;min-width:0;box-shadow:none;margin:8px 0;}',
            '.mapoios-header{padding:8px 10px;position:relative;border-radius:5px 5px 0 0;cursor:move;text-align:center;}',
            '.mapoios-header h2{margin:2px 0;font-size:15px;}',
            // Single flex row for all header icon-buttons, replacing four individually
            // hand-tuned `right:Npx` offsets — adding/removing an icon no longer requires
            // re-measuring every sibling's position.
            '.mapoios-header-actions{position:absolute;top:6px;right:8px;display:flex;align-items:center;gap:3px;}',
            '.mapoios-icon-btn{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:4px;text-decoration:none;cursor:pointer;}',
            '.mapoios-icon-btn:hover{background:rgba(255,255,255,.18);}',
            // Outline uses currentColor so it matches each button's own (theme-driven) icon
            // colour instead of needing a separate theme-aware rule here.
            '.mapoios-icon-btn:focus-visible{outline:1px solid currentColor;outline-offset:1px;}',
            '.mapoios-body{}',
            '.mapoios-tabs{display:flex;padding:4px 6px 0;gap:2px;}',
            '.mapoios-tab-btn{cursor:pointer;padding:5px 10px;border:none;border-radius:3px 3px 0 0;font-size:11px;opacity:.75;}',
            '.mapoios-tab-btn.active{opacity:1;font-weight:bold;}',
            '.mapoios-panel{display:none;padding:6px;overflow-x:auto;}',
            '.mapoios-panel.active{display:block;}',
            '.mapoios-footer{padding:4px;text-align:center;border-radius:0 0 5px 5px;font-size:10px;opacity:.6;}',
            '.scriptTable{width:100%;border-collapse:collapse;}',
            '.scriptTable td{padding:3px 5px;border:1px solid rgba(255,255,255,.15);}',
            '.scriptInput{padding:2px 4px;border-radius:3px;font-size:11px;width:55px;}',
            '.fm_unit{text-align:center;padding:2px;}',
            '.hideMobile{}',
            // Shared labelled-control pattern used by Modelos/Envio em Lote (small caption
            // above its input), so those two tabs read as one consistent form language instead
            // of ad-hoc inline "Label: <input>" pairs with no visual hierarchy.
            '.mapoios-field-row{display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;margin:6px 0;}',
            '.mapoios-field{display:flex;flex-direction:column;gap:2px;}',
            '.mapoios-field>span{font-size:10px;text-transform:uppercase;letter-spacing:.03em;opacity:.7;}',
            /* chip input */
            '.chip-input-wrap{display:flex;flex-wrap:wrap;align-items:center;gap:4px;padding:4px;border-radius:4px;min-height:30px;cursor:text;}',
            '.chip{display:inline-flex;align-items:center;gap:2px;padding:2px 6px;border-radius:10px;font-size:11px;}',
            '.chip-x{background:none;border:none;cursor:pointer;font-size:13px;line-height:1;padding:0 2px;opacity:.7;}',
            '.chip-x:hover{opacity:1;}',
            '.chip-draft{background:none;border:none;outline:none;color:inherit;font-size:11px;min-width:80px;flex:1;}',
            /* batch status bar */
            '.batch-progress{padding:4px 8px;border-radius:3px;margin:4px 0;font-size:11px;}',
            '.batch-log{font-size:10px;margin-top:4px;max-height:70px;overflow-y:auto;padding:4px;border-radius:3px;}',
            '.tmpl-preview{font-size:10px;padding:4px;margin-top:4px;border-radius:3px;word-break:break-all;min-height:16px;}',
            '@media(max-width:600px){.hideMobile{display:none!important}.mapoios-wrap{width:98%;left:1%;}}',
        ].join('');
        document.head.appendChild(s);
    }

    // ─── Theme init ───────────────────────────────────────────────────────────────
    function initializationTheme() {
        var raw = localStorage.getItem(THEME_KEY);
        if (raw) {
            var m = new Map(JSON.parse(raw));
            // Migrate 7-element entries
            m.forEach(function (v, k) {
                if (k !== 'currentTheme' && Array.isArray(v) && v.length === 7) { v.push(50); m.set(k, v); }
            });
            localStorage.setItem(THEME_KEY, JSON.stringify(Array.from(m.entries())));
            applyMapTheme(m);
        } else {
            localStorage.setItem(THEME_KEY, defaultTheme);
            applyMapTheme(new Map(JSON.parse(defaultTheme)));
        }
        if (game_data.device !== 'desktop') widthInterface = 98;
        backgroundAlternateTableEven = backgroundContainer;
        backgroundAlternateTableOdd  = getColorDarker(backgroundContainer, headerColorAlternateTable);
    }

    function applyMapTheme(m) {
        var cur = m.get('currentTheme') || 'theme1';
        var c   = m.get(cur) || [];
        if (c.length >= 8) {
            textColor = c[0]; backgroundInput = c[1]; borderColor = c[2];
            backgroundContainer = c[3]; backgroundHeader = c[4];
            backgroundMainTable = c[5]; backgroundInnerTable = c[6];
            widthInterface = c[7];
        }
    }

    // ─── Panel placement (docked under .info_box vs floating) ──────────────────────
    // Docked mirrors planeador's default posture: inserted into the page flow instead of
    // floating over it. If .info_box isn't found (e.g. a layout that doesn't have it) we
    // still fall back to the old prepend-into-contentContainer spot, just without the
    // fixed-position/draggable floating chrome.
    function insertPanel(html, docked) {
        if (docked) {
            var infoBox = document.querySelector('.info_box');
            if (infoBox && infoBox.parentNode) {
                infoBox.insertAdjacentHTML('afterend', html);
            } else {
                $('#contentContainer').eq(0).prepend(html);
                $('#mobileContent').eq(0).prepend(html);
            }
            // The panel's inline width:X% (baked in for the floating case) has higher
            // specificity than the .mapoios-docked stylesheet rule, so it has to be cleared
            // here for the docked full-width layout to actually take effect.
            $('#div_container').addClass('mapoios-docked').css('width', '');
            return;
        }
        $('#contentContainer').eq(0).prepend(html);
        $('#mobileContent').eq(0).prepend(html);
        $('#div_container').css('position', 'fixed');
        if (typeof $.fn.draggable === 'function') {
            $('#div_container').draggable({ handle: '.mapoios-header' });
        }
    }

    // Minimize only hides the body — shrinking the container to 10% width only makes visual
    // sense for the floating overlay, so leave width alone while docked (it already spans the
    // full content column there).
    function applyMinimized() {
        $('#mapoios-body').hide();
        if (!$('#div_container').hasClass('mapoios-docked')) $('#div_container').css('width', '10%');
    }
    function applyExpanded() {
        $('#mapoios-body').show();
        if (!$('#div_container').hasClass('mapoios-docked')) $('#div_container').css('width', widthInterface + '%');
    }

    // ─── Main interface ───────────────────────────────────────────────────────────
    function createMainInterface() {
        var dispUnits = units.filter(function (u) {
            return !['knight','snob','militia','marcher'].includes(u);
        });
        var rowsButtons   = dispUnits.length + 2; // label + units + pop
        var rowsDatetimes = dispUnits.length - 1; // total - label(1) - checkbox(2)

        function unitImgCells() {
            return dispUnits.map(function (u) {
                return '<td class="fm_unit"><img src="https://dsen.innogamescdn.com/asset/1d2499b/graphic/unit/unit_' + u + '.png"></td>';
            }).join('');
        }

        function inputRowCells(suffix, cls, type) {
            return dispUnits.map(function (u) {
                return '<td align="center"><input id="' + u + suffix + '" value="0" type="' + type + '" class="scriptInput ' + cls + '" style="width:48px"' + (type === 'text' ? ' disabled' : ' step="any"') + '></td>';
            }).join('');
        }

        var html =
            '<div id="div_container" class="mapoios-wrap" style="background:' + backgroundContainer + ';border:2px solid ' + borderColor + ';width:' + widthInterface + '%">' +
            // Header
            '<div class="mapoios-header" style="background:' + backgroundHeader + '">' +
            '<h2 style="color:' + textColor + '">Support Sender</h2>' +
            '<div class="mapoios-header-actions">' +
            '<a id="btn_toggle_dock" href="#" class="mapoios-icon-btn" style="color:' + textColor + '" title="Fixar / Flutuar" aria-label="Alternar entre painel fixo e flutuante">' + ICON_DOCK + '</a>' +
            '<a id="btn_toggle_theme" href="#" class="mapoios-icon-btn" style="color:' + textColor + '" title="Tema" aria-label="Abrir definições de tema e tamanho">' + ICON_THEME + '</a>' +
            '<a id="div_minimize" href="#" class="mapoios-icon-btn" style="color:' + textColor + '" title="Minimizar / Expandir" aria-label="Minimizar ou expandir o painel">' + ICON_MINIMIZE + '</a>' +
            '<a id="btn_close_panel" href="#" class="mapoios-icon-btn" style="color:' + textColor + '" title="Fechar" aria-label="Fechar o painel">' + ICON_CLOSE + '</a>' +
            '</div>' +
            '</div>' +
            '<div id="theme_settings" style="background:' + backgroundMainTable + '"></div>' +
            '<div id="mapoios-body">' +
            // Tabs
            '<div class="mapoios-tabs" style="background:' + backgroundHeader + '">' +
            '<button class="mapoios-tab-btn active" data-tab="tab_troops" style="background:' + backgroundMainTable + ';color:' + textColor + '">Tropas</button>' +
            '<button class="mapoios-tab-btn" data-tab="tab_templates" style="background:' + backgroundContainer + ';color:' + textColor + '">Modelos</button>' +
            '<button class="mapoios-tab-btn" data-tab="tab_batch" style="background:' + backgroundContainer + ';color:' + textColor + '">Envio em Lote</button>' +
            '</div>' +

            // ── Tab 1: Troops ──────────────────────────────────────────────────
            '<div id="tab_troops" class="mapoios-panel active" style="background:' + backgroundMainTable + '">' +
            '<table id="table_upload" class="scriptTable">' +
            '<tr style="background:' + backgroundInnerTable + '"><td style="color:' + textColor + '">Tropas</td>' + unitImgCells() + '<td style="color:' + textColor + '">Pop</td></tr>' +
            '<tr style="background:' + backgroundInnerTable + '"><td style="color:' + textColor + ';font-size:10px">Usar</td>' +
            dispUnits.map(function (u) { return '<td align="center"><input type="checkbox" id="use_unit_' + u + '" checked></td>'; }).join('') +
            '<td></td></tr>' +
            '<tr><td style="color:' + textColor + '">Total</td>' + inputRowCells('total', 'totalTroops', 'text') +
            '<td><input id="packets_total" value="0" type="text" class="scriptInput" disabled style="width:48px"> <span class="hideMobile" style="color:' + textColor + '">k</span></td></tr>' +
            '<tr><td style="color:' + textColor + '">Enviar</td>' + inputRowCells('total', 'sendTroops', 'number') +
            '<td><input id="packets_send" value="0" type="number" step="any" class="scriptInput" style="width:48px"> <span class="hideMobile" style="color:' + textColor + '">k</span></td></tr>' +
            '<tr><td style="color:' + textColor + '">Reserva</td>' + inputRowCells('Reserve', 'reserveTroops', 'number') +
            '<td><input id="packets_reserve" value="0" type="text" class="scriptInput" disabled style="width:48px"> <span class="hideMobile" style="color:' + textColor + '">k</span></td></tr>' +
            '<tr id="tr_pop_toggle_row"><td colspan="' + (dispUnits.length + 2) + '" style="text-align:center;padding:2px">' +
            '<button id="btn_toggle_pop" title="Mostra/oculta o peso de população de cada unidade, usado para calcular o total de Pop" style="font-size:10px;padding:2px 8px;background:' + backgroundContainer + ';color:' + textColor + ';border:1px solid ' + borderColor + ';border-radius:3px;cursor:pointer">⚙ Pesos de Pop</button>' +
            '</td></tr>' +
            '<tr id="tr_pop_weights" style="display:none;background:' + backgroundInnerTable + '">' +
            '<td style="color:' + textColor + ';font-size:10px">Pop/unid</td>' +
            dispUnits.map(function (u) {
                return '<td align="center"><input id="pop_w_' + u + '" type="number" step="any" min="0" value="0" class="scriptInput" style="width:40px;background:' + backgroundInput + ';color:' + textColor + ';border:1px solid ' + borderColor + '"></td>';
            }).join('') +
            '<td><button id="btn_save_pop" title="Guardar pesos de Pop" aria-label="Guardar pesos de Pop" style="font-size:10px;padding:2px 6px;background:' + backgroundContainer + ';color:' + textColor + ';border:1px solid ' + borderColor + ';border-radius:3px;cursor:pointer">✓</button></td>' +
            '</tr>' +
            '<tr>' +
            '<td colspan="1"><center><span style="color:' + textColor + '">Sigilia:</span><input type="number" id="flag_boost" class="scriptInput" min="0" max="100" value="0" style="width:40px;text-align:center"></center></td>' +
            '<td colspan="2"><center><input type="checkbox" id="checkbox_window"> <span style="color:' + textColor + '">aterrar entre:</span></center></td>' +
            '<td colspan="' + rowsDatetimes + '"><div style="display:flex;gap:10px;align-items:center;justify-content:center;flex-wrap:wrap;padding:2px 0">' +
            '<span style="color:' + textColor + ';white-space:nowrap">início: <input type="datetime-local" id="start_window" class="scriptInput" style="width:auto"></span>' +
            '<span style="color:' + textColor + ';white-space:nowrap">fim: <input type="datetime-local" id="stop_window" class="scriptInput" style="width:auto"></span>' +
            '</div></td>' +
            '</tr>' +
            '<tr><td colspan="' + rowsButtons + '" align="center">' +
            '<button class="btn evt-confirm-btn btn-confirm-yes" id="btn_fill_inputs" title="Distribui as tropas da linha Enviar pelas aldeias selecionadas">Preencher</button> ' +
            '<button class="btn evt-confirm-btn btn-confirm-yes" id="btn_calculate" title="Recalcula os totais de tropas disponíveis e o total de Pop">Calcular</button>' +
            '</td></tr>' +
            '</table></div>' +

            // ── Tab 2: Templates ───────────────────────────────────────────────
            '<div id="tab_templates" class="mapoios-panel" style="background:' + backgroundMainTable + ';color:' + textColor + ';padding:8px">' +
            '<p style="margin:0 0 8px;font-size:11px;opacity:.85">Guarda a linha <b>Enviar</b> da aba Tropas como modelo com nome, para reutilizar no Envio em Lote.</p>' +
            '<div class="mapoios-field-row">' +
            '<label class="mapoios-field"><span style="color:' + textColor + '">Nome do modelo</span><input type="text" id="tmpl_name" class="scriptInput" placeholder="ex: apoio-padrão" style="width:130px;background:' + backgroundInput + ';color:' + textColor + ';border:1px solid ' + borderColor + '"></label>' +
            '<button class="btn evt-confirm-btn btn-confirm-yes" id="btn_save_tmpl" title="Guarda a linha Enviar atual com este nome">Guardar</button>' +
            '</div>' +
            '<div class="mapoios-field-row">' +
            '<label class="mapoios-field"><span style="color:' + textColor + '">Modelos guardados</span><select id="tmpl_select" class="scriptInput" style="width:140px;background:' + backgroundInput + ';color:' + textColor + ';border:1px solid ' + borderColor + '"><option value="">— selecionar —</option></select></label>' +
            '<button class="btn evt-confirm-btn btn-confirm-yes" id="btn_load_tmpl" title="Aplica este modelo à linha Enviar">Carregar</button>' +
            '<button id="btn_del_tmpl" style="background:#833;color:#fff;border:none;border-radius:3px;padding:3px 8px;cursor:pointer;font-size:11px" title="Elimina este modelo permanentemente">Eliminar</button>' +
            '</div>' +
            '<div id="tmpl_preview" class="tmpl-preview" style="background:' + backgroundContainer + ';border:1px solid ' + borderColor + '"></div>' +
            '</div>' +

            // ── Tab 3: Batch Send ──────────────────────────────────────────────
            '<div id="tab_batch" class="mapoios-panel" style="background:' + backgroundMainTable + ';color:' + textColor + ';padding:8px">' +
            '<p style="margin:0 0 6px;font-size:11px;opacity:.85">Adiciona coordenadas alvo (escreve "123|456" → Enter). O xBot navega até cada uma, preenche as tropas do modelo escolhido e envia.</p>' +
            // Chip coord input
            '<div id="batch_chips" class="chip-input-wrap" style="background:' + backgroundInput + ';border:1px solid ' + borderColor + ';border-radius:4px"></div>' +
            // Group + template + delay row — group is a live dropdown of the page's own TW
            // groups (populated in initBatchTab via populateGroupSelect), not a free-typed ID.
            '<div class="mapoios-field-row">' +
            '<label class="mapoios-field"><span style="color:' + textColor + '">Grupo</span><select id="batch_group" class="scriptInput" title="Filtra as aldeias de apoio por grupo — muda o filtro na página imediatamente" style="width:130px;background:' + backgroundInput + ';color:' + textColor + ';border:1px solid ' + borderColor + '"><option value="">— Todos —</option></select></label>' +
            '<label class="mapoios-field"><span style="color:' + textColor + '">Modelo</span><select id="batch_tmpl" class="scriptInput" style="width:130px;background:' + backgroundInput + ';color:' + textColor + ';border:1px solid ' + borderColor + '"><option value="__send_row__">— usar linha de envio —</option></select></label>' +
            '<label class="mapoios-field"><span style="color:' + textColor + '">Pausa (s)</span><input type="number" id="batch_delay" class="scriptInput" value="3" min="1" max="30" style="width:55px;background:' + backgroundInput + ';color:' + textColor + ';border:1px solid ' + borderColor + '"></label>' +
            '</div>' +
            // Shows the resolved troop amounts this batch will actually send — templates are
            // frozen at save time, so editing the Tropas tab afterwards does NOT change them.
            '<div id="batch_tmpl_preview" class="tmpl-preview" style="background:' + backgroundContainer + ';border:1px solid ' + borderColor + '"></div>' +
            // Buttons
            '<div class="mapoios-field-row" style="align-items:center;margin-top:6px">' +
            '<button class="btn evt-confirm-btn btn-confirm-yes" id="btn_start_batch" title="Inicia o envio automático para todos os alvos listados acima">&#9654; Iniciar</button>' +
            '<button id="btn_stop_batch" style="display:none;background:#833;color:#fff;border:none;border-radius:3px;padding:4px 10px;cursor:pointer;font-size:11px" title="Para o lote em execução">&#9632; Parar</button>' +
            '<span id="batch_progress" class="batch-progress" style="background:' + backgroundContainer + ';color:' + textColor + '"></span>' +
            '</div>' +
            '</div>' +

            '</div>' + // mapoios-body
            // Lives OUTSIDE mapoios-body deliberately — batch progress/errors need to stay
            // readable even while the panel is minimized, not just when the Envio em Lote tab
            // happens to be open. Starts hidden; logBatch()/the log-restore code reveal it the
            // moment there's actually something to show.
            '<div id="batch_log" class="batch-log" style="display:none;margin:4px 6px;background:' + backgroundContainer + ';border:1px solid ' + borderColor + ';color:' + textColor + '"></div>' +
            '<div class="mapoios-footer" style="background:' + backgroundHeader + ';color:' + textColor + '">by Costache Madalin — melhorado por xBot &amp; xStriker | v2</div>' +
            '</div>';

        $('#div_container').remove();
        insertPanel(html, getUIState().docked);

        $('#div_minimize').on('click', function (e) {
            e.preventDefault();
            if ($('#mapoios-body').is(':visible')) applyMinimized();
            else applyExpanded();
        });

        $('#btn_toggle_dock').on('click', function (e) {
            e.preventDefault();
            var s = getUIState();
            s.docked = !s.docked;
            saveUIState(s);
            buildUI(); // rebuild in the new position; re-applies the always-minimized default too
        });

        // Always starts collapsed — the user has to deliberately expand it, regardless of
        // docked/floating mode or what state it was left in on a previous visit.
        applyMinimized();

        // Tab switching
        $('#div_container').on('click', '.mapoios-tab-btn', function () {
            var target = $(this).data('tab');
            $('.mapoios-tab-btn')
                .css('background', backgroundContainer)
                .css('opacity', '.75')
                .removeClass('active');
            $(this).css('background', backgroundMainTable).css('opacity', '1').addClass('active');
            $('.mapoios-panel').removeClass('active').hide();
            $('#' + target).addClass('active').show();
        });

        // Restore saved settings
        var saved = null;
        try { saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null'); } catch (e) {}
        if (saved) {
            var cbs = $('#table_upload input[type=checkbox]').get();
            (saved[0] || []).forEach(function (v, i) { if (cbs[i]) cbs[i].checked = v; });
            var inps = $('#table_upload input').get();
            (saved[1] || []).forEach(function (v, i) { if (inps[i]) inps[i].value = v; });
            $('.totalTroops').val(0); $('#packets_total').val(0);
        }

        // Auto-save settings on change
        $('#table_upload input').on('click input change', function () {
            countTotalTroops();
            var cbs2  = $('#table_upload input[type=checkbox]').map(function () { return this.checked; }).get();
            var vals2 = $('#table_upload input').map(function () { return this.value; }).get();
            var data  = JSON.stringify([cbs2, vals2]);
            if (data !== localStorage.getItem(SETTINGS_KEY)) localStorage.setItem(SETTINGS_KEY, data);
        });

        if (game_data.device !== 'desktop') { $('.hideMobile').hide(); $('#table_upload input[type=text]').css('width', '100%'); }

        // Bind action buttons via jQuery (avoids Tampermonkey inline-onclick scoping issues)
        $('#btn_fill_inputs').on('click', fillInputs);
        $('#btn_calculate').on('click', countTotalTroops);
        $('#btn_close_panel').on('click', function(e) { e.preventDefault(); $('#div_container').remove(); });
        $('#btn_toggle_theme').on('click', function(e) { e.preventDefault(); $('#theme_settings').toggle(); });

        // Initialize sub-systems
        initTemplateTab();
        initBatchTab();
        initPopWeightsUI();
        initUnitSelection();
    }

    function initUnitSelection() {
        var sel = getUnitSelection();
        units.forEach(function (u) {
            var cb  = document.getElementById('use_unit_' + u);
            var inp = document.getElementById(u + 'total');
            if (!cb) return;
            cb.checked = sel[u] !== false;
            if (inp && inp.classList.contains('sendTroops')) {
                inp.disabled = !cb.checked;
                inp.style.opacity = cb.checked ? '' : '0.35';
            }
            cb.addEventListener('change', function () {
                sel[u] = cb.checked;
                saveUnitSelection(sel);
                if (inp && inp.classList.contains('sendTroops')) {
                    inp.disabled = !cb.checked;
                    inp.style.opacity = cb.checked ? '' : '0.35';
                    if (!cb.checked) inp.value = 0;
                }
                countTotalTroops();
            });
        });
    }

    function initPopWeightsUI() {
        var w = getPopWeights();
        units.forEach(function (u) {
            var inp = document.getElementById('pop_w_' + u);
            if (inp) inp.value = w[u] !== undefined ? w[u] : 1;
        });
        $('#btn_toggle_pop').on('click', function (e) {
            e.preventDefault();
            $('#tr_pop_weights').toggle();
        });
        $('#btn_save_pop').on('click', function () {
            var w2 = {};
            units.forEach(function (u) {
                var inp = document.getElementById('pop_w_' + u);
                w2[u] = inp ? (parseFloat(inp.value) || 0) : (DEFAULT_POP_WEIGHTS[u] || 1);
            });
            savePopWeights(w2);
            if (typeof UI !== 'undefined') UI.SuccessMessage('Pesos de Pop guardados.', 1000);
            $('#tr_pop_weights').hide();
            countTotalTroops();
        });
    }

    // ─── Theme panel ──────────────────────────────────────────────────────────────
    function changeTheme() {
        var themeNames = [1,2,3,4,5,6,7,8,9,10].map(function(n){ return 'theme'+n; });
        var fieldLabels = ['textColor','backgroundInput','borderColor','backgroundContainer','backgroundHeader','backgroundMainTable','backgroundInnerTable'];
        var fieldVals   = [textColor, backgroundInput, borderColor, backgroundContainer, backgroundHeader, backgroundMainTable, backgroundInnerTable];

        var rows = fieldLabels.map(function (lbl, i) {
            return '<tr><td style="color:' + textColor + '">' + lbl + '</td>' +
                   '<td style="background-color:' + fieldVals[i] + '" class="td_background" style="width:20px">&nbsp;</td>' +
                   '<td><input type="text" class="scriptInput input_theme" value="' + fieldVals[i] + '" style="background:' + backgroundInput + ';color:' + textColor + ';border:1px solid ' + borderColor + '"></td></tr>';
        }).join('');

        var html =
            '<h3 style="color:' + textColor + ';padding:8px 10px 4px;margin:0">Tema (recarrega após guardar)</h3>' +
            '<table class="scriptTable" style="background:' + backgroundMainTable + '">' +
            '<tr><td style="color:' + textColor + '"><select id="select_theme" style="background:' + backgroundInput + ';color:' + textColor + '">' +
            themeNames.map(function(n){ return '<option value="'+n+'">'+n+'</option>'; }).join('') +
            '</select></td><td style="color:' + textColor + '">preview</td><td style="color:' + textColor + '">hex</td></tr>' +
            rows +
            '<tr><td style="color:' + textColor + '">width %</td>' +
            '<td colspan="2"><input type="range" min="25" max="100" class="slider input_theme" id="input_slider_width" value="' + widthInterface + '"> <span id="td_width">' + widthInterface + '%</span></td></tr>' +
            '<tr><td><button class="btn evt-confirm-btn btn-confirm-yes" id="btn_save_theme">Guardar</button></td>' +
            '<td><button class="btn evt-confirm-btn btn-confirm-yes" id="btn_reset_theme">Repor</button></td><td></td></tr>' +
            '</table>';

        $('#theme_settings').append(html).hide();

        $('#select_theme').on('change', function () {
            var key = $(this).find(':selected').text();
            var stored = localStorage.getItem(THEME_KEY);
            if (!stored) return;
            var m   = new Map(JSON.parse(stored));
            var cols = m.get(key) || [];
            $('.input_theme').each(function (i, el) { el.value = cols[i] || ''; });
            $('.td_background').each(function (i, el) { el.style.background = cols[i] || ''; });
            m.set('currentTheme', key);
            localStorage.setItem(THEME_KEY, JSON.stringify(Array.from(m.entries())));
        });

        $('#btn_save_theme').on('click', function () {
            var cols = Array.from($('.input_theme')).map(function (e) { return e.value.toUpperCase().trim(); });
            var key  = $('#select_theme').find(':selected').text();
            for (var i = 0; i < cols.length - 1; i++) {
                if (!/#[0-9A-F]{6}/.test(cols[i])) {
                    if (typeof UI !== 'undefined') UI.ErrorMessage('Invalid colour: ' + cols[i]);
                    return;
                }
            }
            var m = localStorage.getItem(THEME_KEY) ? new Map(JSON.parse(localStorage.getItem(THEME_KEY))) : new Map();
            m.set(key, cols); m.set('currentTheme', key);
            localStorage.setItem(THEME_KEY, JSON.stringify(Array.from(m.entries())));
            if (typeof UI !== 'undefined') UI.SuccessMessage('Saved. Run script again.', 1200);
        });

        $('#btn_reset_theme').on('click', function () {
            localStorage.setItem(THEME_KEY, defaultTheme);
            if (typeof UI !== 'undefined') UI.SuccessMessage('Reset done. Run script again.', 1000);
        });

        $('#input_slider_width').on('input', function () { $('#td_width').text($(this).val() + '%'); });

        var stored2 = localStorage.getItem(THEME_KEY);
        if (stored2) {
            var m2 = new Map(JSON.parse(stored2));
            var el = document.querySelector('#select_theme');
            if (el) el.value = m2.get('currentTheme') || 'theme1';
        }
    }

    // ─── Vanilla chip input ───────────────────────────────────────────────────────
    function createChipInput(containerId, initialChips, onChangeCallback, opts) {
        opts = opts || {};
        var placeholder = opts.placeholder || 'type then Enter';
        var validate    = opts.validate    || function () { return true; };

        var container = document.getElementById(containerId);
        if (!container) return null;

        // Internal state — never rely on the caller's array reference
        var state = Array.isArray(initialChips) ? initialChips.slice() : [];

        function render() {
            container.innerHTML = '';

            for (var i = 0; i < state.length; i++) {
                (function (chip, idx) {
                    var span = document.createElement('span');
                    span.className = 'chip';
                    span.style.cssText = 'background:' + borderColor + ';color:' + backgroundContainer + ';';
                    span.textContent = chip;

                    var xBtn = document.createElement('button');
                    xBtn.className = 'chip-x';
                    xBtn.textContent = '×';
                    xBtn.title = 'Remover ' + chip;
                    xBtn.setAttribute('aria-label', 'Remover alvo ' + chip);
                    xBtn.style.color = backgroundContainer;
                    xBtn.type = 'button';
                    xBtn.addEventListener('click', function (e) {
                        e.stopPropagation();
                        state.splice(idx, 1);
                        render();
                        onChangeCallback(state.slice());
                    });
                    span.appendChild(xBtn);
                    container.appendChild(span);
                })(state[i], i);
            }

            var input = document.createElement('input');
            input.className = 'chip-draft';
            input.placeholder = state.length === 0 ? placeholder : '';
            input.style.cssText = 'color:' + textColor + ';background:transparent;';
            input.addEventListener('keydown', function (e) {
                var val = input.value.trim();
                if (e.key === 'Enter' || e.key === ',') {
                    e.preventDefault();
                    if (val && validate(val) && state.indexOf(val) === -1) {
                        state.push(val);
                        render();
                        onChangeCallback(state.slice());
                    } else if (val && !validate(val)) {
                        input.value = '';
                    }
                } else if (e.key === 'Backspace' && input.value === '' && state.length > 0) {
                    state.pop();
                    render();
                    onChangeCallback(state.slice());
                }
            });
            input.addEventListener('paste', function (e) {
                e.preventDefault();
                var text = (e.clipboardData || window.clipboardData).getData('text');
                var parts = text.split(/[\n\r,]+/).map(function (s) { return s.trim(); }).filter(Boolean);
                var changed = false;
                parts.forEach(function (part) {
                    if (/^\d+\|\d+$/.test(part) && state.indexOf(part) === -1) {
                        state.push(part);
                        changed = true;
                    }
                });
                if (changed) { render(); onChangeCallback(state.slice()); }
            });
            container.appendChild(input);
            container.addEventListener('click', function () { input.focus(); });
        }

        render();
        return {
            getChips: function () { return state.slice(); },
            setChips: function (arr) { state = Array.isArray(arr) ? arr.slice() : []; render(); }
        };
    }

    // ─── Template tab ─────────────────────────────────────────────────────────────
    var _coordChipInput = null;
    var _coordChips     = [];

    function getTemplates()   { try { return JSON.parse(localStorage.getItem(TEMPLATES_KEY) || '{}'); } catch { return {}; } }
    function saveTemplates(t) { localStorage.setItem(TEMPLATES_KEY, JSON.stringify(t)); }

    function getTemplateFromSendRow() {
        var sel = getUnitSelection();
        var tpl = {};
        document.querySelectorAll('.sendTroops').forEach(function (inp) {
            var unit = inp.id.replace('total', '');
            var val  = parseFloat(inp.value) || 0;
            if (val > 0 && sel[unit] !== false) tpl[unit] = val;
        });
        return tpl;
    }

    function applyTemplateToSendRow(tpl) {
        Object.keys(tpl).forEach(function (unit) {
            var inp = document.getElementById(unit + 'total');
            if (inp && inp.classList.contains('sendTroops')) inp.value = tpl[unit];
        });
        countTotalTroops();
    }

    function renderTemplatePreview(name, tpl) {
        var el = document.getElementById('tmpl_preview');
        if (!el) return;
        if (!tpl || Object.keys(tpl).length === 0) { el.textContent = ''; return; }
        el.textContent = name + ': ' + Object.keys(tpl).map(function (u) { return u + ':' + tpl[u] + 'k'; }).join(' | ');
    }

    function refreshTemplateDropdowns() {
        var templates = getTemplates();
        var names     = Object.keys(templates);
        var opts      = names.map(function (n) { return '<option value="' + n + '">' + n + '</option>'; }).join('');
        $('#tmpl_select').find('option:not([value=""])').remove().end().append(opts);
        $('#batch_tmpl').find('option:not([value="__send_row__"])').remove().end().append(opts);
    }

    function initTemplateTab() {
        refreshTemplateDropdowns();

        $('#btn_save_tmpl').on('click', function () {
            var name = $('#tmpl_name').val().trim();
            if (!name) { alert('Insere um nome para o modelo.'); return; }
            var tpl = getTemplateFromSendRow();
            if (Object.keys(tpl).length === 0) { alert('A linha de envio está vazia.'); return; }
            var all = getTemplates(); all[name] = tpl; saveTemplates(all);
            refreshTemplateDropdowns();
            $('#tmpl_name').val('');
            renderBatchTemplatePreview();
            if (typeof UI !== 'undefined') UI.SuccessMessage('"' + name + '" saved.', 1000);
        });

        $('#btn_load_tmpl').on('click', function () {
            var name = $('#tmpl_select').val();
            if (!name) return;
            var tpl = getTemplates()[name];
            if (!tpl) return;
            applyTemplateToSendRow(tpl);
            renderTemplatePreview(name, tpl);
        });

        $('#tmpl_select').on('change', function () {
            var name = $(this).val();
            if (!name) { $('#tmpl_preview').text(''); return; }
            renderTemplatePreview(name, getTemplates()[name]);
        });

        $('#btn_del_tmpl').on('click', function () {
            var name = $('#tmpl_select').val();
            if (!name || !confirm('Delete "' + name + '"?')) return;
            var all = getTemplates(); delete all[name]; saveTemplates(all);
            refreshTemplateDropdowns();
            $('#tmpl_preview').text('');
            renderBatchTemplatePreview();
        });
    }

    // Shows what the batch will ACTUALLY send for the currently selected Modelo.
    // Named templates are frozen at save time — editing the Tropas tab afterwards has no
    // effect on them, which is easy to miss, so make the resolved values visible here.
    function renderBatchTemplatePreview() {
        var el = document.getElementById('batch_tmpl_preview');
        if (!el) return;
        var key = $('#batch_tmpl').val();
        var tpl = (key === '__send_row__') ? getTemplateFromSendRow() : (getTemplates()[key] || {});
        if (!tpl || Object.keys(tpl).length === 0) { el.textContent = 'Vazio — preenche a linha de envio ou escolhe outro modelo.'; return; }
        var label = (key === '__send_row__') ? 'Linha de envio (ao vivo)' : ('Modelo "' + key + '" (fixo, guardado antes)');
        el.textContent = label + ': ' + Object.keys(tpl).map(function (u) { return u + ':' + tpl[u] + 'k'; }).join(' | ');
    }

    // ─── Batch tab ────────────────────────────────────────────────────────────────
    // TribalWars renders its own "Grupos" sidebar widget as one <a class="group-menu-item"
    // data-group-id="X"> per selectable group, and the CURRENTLY active one as a
    // <strong class="group-menu-item" data-group-id="X"> (no href) instead. Either tag carries
    // the real numeric group id we need, and its (decorated) text is the group's display name.
    function getPageGroups() {
        var out = [];
        document.querySelectorAll('.group-menu-item[data-group-id]').forEach(function (el) {
            var id = el.getAttribute('data-group-id');
            if (!id) return;
            var label = el.textContent.replace(/[\[\]›‹]/g, '').trim();
            out.push({ id: id, label: label || ('#' + id) });
        });
        return out;
    }

    // Populates #batch_group from the groups actually present on THIS page — done once per
    // panel build, same as the template dropdowns (refreshTemplateDropdowns).
    function populateGroupSelect() {
        var sel = document.getElementById('batch_group');
        if (!sel) return;
        sel.innerHTML = '';
        // TribalWars' own "todos" entry (data-group-id="0") already comes through
        // getPageGroups() like every other group, so no synthetic placeholder is added here —
        // a hand-added empty-value option would be the one choice ensureGroupSelected silently
        // ignores (empty groupId means "don't force anything" elsewhere in this file), breaking
        // "switch immediately when the dropdown changes" for that one entry specifically.
        getPageGroups().forEach(function (g) {
            var opt = document.createElement('option');
            opt.value = g.id;
            opt.textContent = g.label;
            sel.appendChild(opt);
        });
        if (!sel.options.length) {
            var fallback = document.createElement('option');
            fallback.value = '';
            fallback.textContent = '— Todos —';
            sel.appendChild(fallback);
        }
    }

    function initBatchTab() {
        populateGroupSelect();

        // Pre-fill group from URL or saved value — but only if that id is actually one of the
        // groups available on this page. A saved/URL group id that no longer exists (deleted,
        // renamed, or simply a different page than last time) falls back to whatever's first in
        // the list (normally TribalWars' own "todos") instead of leaving the dropdown blank.
        var selEl      = document.getElementById('batch_group');
        var available  = selEl ? Array.from(selEl.options).map(function (o) { return o.value; }) : [];
        var urlGroup   = _p.get('group') || '';
        var savedGroup = localStorage.getItem(GROUP_KEY) || '';
        var wantGroup  = urlGroup || savedGroup;
        var groupVal   = (wantGroup && available.indexOf(wantGroup) !== -1) ? wantGroup : (available[0] || '');
        if (selEl) selEl.value = groupVal;

        $('#batch_group').on('change', function () {
            var groupId = $(this).val();
            localStorage.setItem(GROUP_KEY, groupId);
            // Switches TribalWars' own live group filter right away — without this the
            // dropdown would only be a remembered preference that takes effect the next time
            // a batch runs, instead of an immediate, visible change on the page.
            ensureGroupSelected(groupId, function () {});
        });

        renderBatchTemplatePreview();
        $('#batch_tmpl').on('change', renderBatchTemplatePreview);

        // Chip input for coordinates
        _coordChipInput = createChipInput(
            'batch_chips',
            _coordChips,
            function (newChips) { _coordChips = newChips; },
            {
                placeholder: '123|456 then Enter',
                validate: function (v) {
                    if (!/^\d+\|\d+$/.test(v)) {
                        alert('Formato de coordenada inválido. Usa: 123|456');
                        return false;
                    }
                    return true;
                }
            }
        );

        // Restore chip input and log if batch was running
        var existingBatch = getBatch();
        if (existingBatch && existingBatch.running) {
            if (existingBatch.targets && _coordChipInput) {
                _coordChipInput.setChips(existingBatch.targets);
            }
            updateBatchUI(existingBatch);
            if (existingBatch.log && existingBatch.log.length) {
                var logEl = document.getElementById('batch_log');
                if (logEl) {
                    logEl.style.display = 'block';
                    logEl.innerHTML = existingBatch.log.map(function (l) { return '<div>' + l + '</div>'; }).join('');
                    logEl.scrollTop = logEl.scrollHeight;
                }
            }
        }

        $('#btn_start_batch').on('click', function () {
            var targets = _coordChips.slice();
            if (targets.length === 0) { alert('Adiciona pelo menos uma coordenada alvo.'); return; }

            var group   = $('#batch_group').val().trim();
            var tmplKey = $('#batch_tmpl').val();
            var tpl;

            if (tmplKey === '__send_row__') {
                tpl = getTemplateFromSendRow();
                if (Object.keys(tpl).length === 0) { alert('Linha de envio vazia — preenche quantidades ou carrega um modelo.'); return; }
            } else {
                tpl = getTemplates()[tmplKey];
                if (!tpl) { alert('Modelo não encontrado.'); return; }
            }

            var delayS = Math.max(1, parseInt($('#batch_delay').val(), 10) || 3);
            // Captured once here (not re-read from the URL on every navigation) so it survives
            // the reloads a batch run goes through — same reasoning as `group` below. Without
            // this, _urlNavigate's fallback silently drops back to page 0 on every target whose
            // autocomplete times out, even if the user had deliberately paged into this group's
            // village list first.
            var page  = _p.get('page') || '';
            // Same idea: capture whichever direction ("Distância" column, nearest vs furthest
            // first) was active when the user clicked Iniciar, so villages get consumed in that
            // order for the whole run instead of silently reverting to nearest-first.
            var dir   = _p.get('dir') || '';
            localStorage.removeItem(STOP_KEY); // clear any veto left over from a previous run
            var batch = { running: true, targets: targets, index: 0, template: tpl, group: group, page: page, dir: dir, pageFloor: 0, state: 'selecting', delay: delayS * 1000 };
            setBatch(batch);
            logBatch('A iniciar lote: ' + targets.length + ' alvos. Primeiro: ' + targets[0], batch);
            updateBatchUI(batch);
            navigateToTarget(targets[0], group, batch);
        });

        $('#btn_stop_batch').on('click', function () {
            clearBatch();
            updateBatchUI(null);
            logBatch('Batch stopped by user.');
        });
    }

    function updateBatchUI(batch) {
        if (batch && batch.running) {
            $('#btn_start_batch').hide();
            $('#btn_stop_batch').show();
            var coord = batch.targets[batch.index] || '';
            $('#batch_progress').text('Target ' + (batch.index + 1) + ' / ' + batch.targets.length + '  (' + coord + ')');
        } else {
            removeEmergencyStopBanner();
            $('#btn_start_batch').show();
            $('#btn_stop_batch').hide();
            if (batch && batch.finished) {
                var totStr = batch.totalSent
                    ? Object.keys(batch.totalSent).filter(function (u) { return batch.totalSent[u] > 0; })
                          .map(function (u) { return u + ':' + batch.totalSent[u].toLocaleString(); }).join(' | ')
                    : '';
                $('#batch_progress').text('Concluído! ' + batch.targets.length + ' alvos. Total: ' + (totStr || '—'));
            } else {
                $('#batch_progress').text('');
            }
        }
    }

    // batchRef: pass the SAME batch object the caller is about to setBatch() with, so the log
    // line rides along with it. Without this, logBatch would getBatch() its own fresh copy,
    // push+save into THAT, and then the caller's later setBatch(theirStaleCopy) would overwrite
    // storage again and silently drop the just-added line — which is why the log wasn't
    // surviving reloads (every entry but the last got clobbered this way).
    function logBatch(msg, batchRef) {
        var line = new Date().toLocaleTimeString() + ' — ' + msg;
        var b = batchRef || getBatch();
        if (b) {
            if (!b.log) b.log = [];
            b.log.push(line);
            if (!batchRef) setBatch(b);
        }
        var el = document.getElementById('batch_log');
        if (!el) return;
        el.style.display = 'block';
        el.innerHTML += '<div>' + line + '</div>';
        el.scrollTop = el.scrollHeight;
    }

    // ─── Original: countTotalTroops ───────────────────────────────────────────────
    function countTotalTroops() {
        var dateStart = new Date(), dateStop = new Date();
        dateStart.setFullYear(dateStart.getFullYear() - 1);
        dateStop.setFullYear(dateStop.getFullYear() + 1);

        var sigil = 0;
        var timeWindow = document.getElementById('checkbox_window').checked;
        if (timeWindow) {
            dateStart = new Date(document.getElementById('start_window').value);
            dateStop  = new Date(document.getElementById('stop_window').value);
            sigil     = parseInt(document.getElementById('flag_boost').value, 10) || 0;
            if (isNaN(dateStart)) { if (typeof UI !== 'undefined') UI.ErrorMessage('Invalid start date', 2000); }
            if (isNaN(dateStop))  { if (typeof UI !== 'undefined') UI.ErrorMessage('Invalid end date', 2000); }
        }

        var mapVillages = new Map();
        var coordDestination;
        if (game_data.device === 'desktop') {
            var vn2 = document.querySelector('.village-name');
            if (vn2) { var vm = vn2.textContent.match(/\d+\|\d+/); if (vm) coordDestination = vm[0]; }
        } else {
            var ix2 = document.getElementById('inputx'), iy2 = document.getElementById('inputy');
            if (ix2 && iy2) coordDestination = ix2.value + '|' + iy2.value;
        }

        var speedTroop = getUnitSpeedTable();

        Array.from(document.querySelectorAll('#village_troup_list tbody tr')).forEach(function (row) {
            var m2 = row.children[0] ? row.children[0].innerText.match(/\d+\|\d+/) : null;
            if (!m2) return;
            var coord    = m2[0];
            var distance = calcDistance(coord, coordDestination);
            var objTroops = { distance: distance };

            units.forEach(function (troopName) {
                var cell        = row.querySelector("[data-unit='" + troopName + "']");
                var totalTroops = parseInt(cell ? cell.textContent : 0, 10) || 0;
                var reserveInp  = document.getElementById(troopName + 'Reserve');
                var reserveTroops = reserveInp ? (parseFloat(reserveInp.value) || 0) * 1000 : 0;
                totalTroops = totalTroops > reserveTroops ? totalTroops - reserveTroops : 0;

                var timeTroop = speedTroop[troopName] * distance;
                timeTroop = timeTroop / (1 + sigil / 100.0);

                var stEl = document.getElementById('serverTime');
                var sdEl = document.getElementById('serverDate');
                if (stEl && sdEl) {
                    var sParts = sdEl.innerText.split('/');
                    var sDate  = sParts[1] + '/' + sParts[0] + '/' + sParts[2];
                    var dateCurrent = new Date(new Date(sDate + ' ' + stEl.innerText).getTime() + timeTroop);
                    if (totalTroops > 0 && dateStart < dateCurrent && dateCurrent < dateStop) {
                        objTroops[troopName + '_speed'] = troopName;
                    }
                }
                objTroops[troopName] = totalTroops;
                if (!timeWindow) { delete objTroops.ram; delete objTroops.catapult; delete objTroops.ram_speed; delete objTroops.catapult_speed; }
            });
            mapVillages.set(coord, objTroops);
        });

        // Sum troops across villages, but only the units each village can actually deliver within
        // the requested landing window. A support command travels at the pace of its SLOWEST
        // included unit, so once we know the slowest unit that — sent alone — would still land
        // in-window from a given village, every unit at least as fast lands in-window too once
        // bundled with it. This restores the original script's "packets land between" filtering,
        // which had been dropped in favour of unconditionally summing every village's raw troops.
        var objTotal = {};
        units.forEach(function(u) { objTotal[u] = 0; });
        Array.from(mapVillages.keys()).forEach(function (key) {
            var obj = mapVillages.get(key);
            var anchor = villageAnchorSpeed(obj, speedTroop);
            if (anchor < 0) return; // nothing from this village lands in the window
            units.forEach(function (u) { if (speedTroop[u] <= anchor) objTotal[u] += obj[u] || 0; });
        });

        var popWeights = getPopWeights();
        var totalPop = 0;
        units.forEach(function (key) {
            var inp = document.getElementById(key + 'total');
            if (inp && inp.classList.contains('totalTroops')) inp.value = (objTotal[key] / 1000).toFixed(2);
            totalPop += (objTotal[key] || 0) * (popWeights[key] || 0);
        });

        document.getElementById('packets_total').value = (totalPop / 1000).toFixed(2);
        addEvents();
        return mapVillages;
    }

    // ─── Original: fillInputs ─────────────────────────────────────────────────────
    function fillInputs() {
        var mapVillages = countTotalTroops();
        var troopsTotal = Array.from(document.getElementsByClassName('totalTroops')).map(function (e) { return parseFloat(e.value) * 1000; });
        var sendTotal   = Array.from(document.getElementsByClassName('sendTroops')).map(function (e) {
            return { value: (isNaN(parseFloat(e.value)) ? 0 : parseFloat(e.value) * 1000), troopName: e.id.replace('total', '') };
        });
        var sendTotalObj = {};
        sendTotal.forEach(function (e) { sendTotalObj[e.troopName] = e.value; });

        for (var i = 0; i < troopsTotal.length; i++) {
            if (troopsTotal[i] < sendTotal[i].value) { alert('Tropas insuficientes.'); return; }
        }

        var checkbox = document.getElementById('village_troup_list').children[0].children[0].getElementsByTagName('input');
        var troops   = ['spear','sword','axe','archer','spy','light','heavy','ram','catapult'];
        for (var j = 0; j < checkbox.length - 1; j++) {
            checkbox[j].checked = troops.includes(checkbox[j].id.split('_')[1]);
        }
        document.getElementById('place_call_select_all').click();
        $('#village_troup_list input[type=number]:visible').val(0);

        var speedTroop = getUnitSpeedTable();
        var listTotal = [];
        Array.from(mapVillages.keys()).forEach(function (key) {
            var obj = mapVillages.get(key);
            // Only units at least as fast as this village's landing-window anchor get bundled in
            // — anything slower would drag the whole command outside the requested window (see
            // villageAnchorSpeed / the equivalent filtering in countTotalTroops).
            var anchor = villageAnchorSpeed(obj, speedTroop);
            var ot = { coord: key, speedTroop: anchor >= 0 ? 'ok' : null };
            units.forEach(function (u) {
                var eligible = anchor >= 0 && speedTroop[u] <= anchor;
                ot[u] = (eligible && sendTotalObj[u] > 0) ? obj[u] || 0 : 0;
            });
            var tw2 = document.getElementById('checkbox_window').checked;
            if (!tw2) { ot.ram = 0; ot.catapult = 0; }
            listTotal.push(ot);
        });

        var listRange = listTotal.filter(function (r) { return r.speedTroop; });
        var factorObj = {};
        sendTotal.forEach(function (e) { factorObj[e.troopName] = e.value / listRange.length; });

        var mapResult = new Map();
        Object.keys(factorObj).forEach(function (troopName) {
            var factorValue = factorObj[troopName];
            listRange.sort(function (a, b) { return a[troopName] > b[troopName] ? 1 : a[troopName] < b[troopName] ? -1 : 0; });
            for (var i2 = 0; i2 < listRange.length; i2++) {
                var tv = listRange[i2][troopName] || 0;
                if (tv < factorValue) {
                    var extra = factorValue - tv;
                    if (listRange.length - i2 - 1 > 0) factorValue += extra / (listRange.length - i2 - 1);
                    listRange[i2][troopName] = tv;
                } else {
                    var mod = factorValue % parseInt(factorValue, 10);
                    if (tv + 1 > factorValue) {
                        listRange[i2][troopName] = parseInt(factorValue, 10) + (Math.random() < mod ? 1 : 0);
                    } else {
                        listRange[i2][troopName] = factorValue;
                    }
                }
                var tw2 = document.getElementById('checkbox_window').checked;
                if (listRange[i2].speedTroop === troopName && listRange[i2][troopName] === 0 && tw2) listRange[i2][troopName] = 1;
                if (!tw2) { listRange[i2].ram = 0; listRange[i2].catapult = 0; }
                mapResult.set(listRange[i2].coord, listRange[i2]);
            }
        });

        Array.from(document.querySelectorAll('.overview_table .selected')).forEach(function (row) {
            var m3 = row.children[0] ? row.children[0].innerText.match(/\d+\|\d+/) : null;
            if (!m3) return;
            var coord3 = m3[0];
            if (!mapResult.has(coord3)) return;
            var obj3 = mapResult.get(coord3);
            var cnt  = 0;
            Object.keys(obj3).forEach(function (k) { if (k !== 'speedTroop' && k !== 'coord') cnt += (obj3[k] || 0); });
            if (cnt > 1) {
                Object.keys(obj3).forEach(function (k) {
                    if (k !== 'speedTroop') $(row).find('.call-unit-box-' + k).val(obj3[k]);
                });
            }
        });
    }

    // ─── Original: addEvents ──────────────────────────────────────────────────────
    function addEvents() {
        $('.sendTroops').off('input').on('input', function () {
            var popWeights = getPopWeights();
            var pop = 0;
            Array.from(document.getElementsByClassName('sendTroops')).forEach(function (inp) {
                var val = parseFloat(inp.value) || 0;
                var unit = inp.id.replace('total', '');
                pop += val * 1000 * (popWeights[unit] || 0);
            });
            document.getElementById('packets_send').value = (pop / 1000).toFixed(2);
            if ($('#batch_tmpl').val() === '__send_row__') renderBatchTemplatePreview();
        });

        $('#packets_send').off('input').on('input', function () {
            var need       = parseFloat(this.value) || 0;
            var totalPop   = parseFloat(document.getElementById('packets_total').value) || 0;
            var sendTotals = document.getElementsByClassName('sendTroops');
            var totals     = document.getElementsByClassName('totalTroops');
            var ratio      = totalPop > 0 ? need / totalPop : 0;
            for (var i = 0; i < totals.length; i++) {
                if (!sendTotals[i].id.includes('spy')) sendTotals[i].value = parseInt(parseFloat(totals[i].value) * ratio * 100, 10) / 100.0;
                else sendTotals[i].value = 0;
            }
        });
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────────
    function httpGet(url) {
        var x = new XMLHttpRequest();
        x.open('GET', url, false);
        x.send(null);
        return x.responseText;
    }

    function getColorDarker(hexInput, percent) {
        var hex = hexInput.replace(/^\s*#|\s*$/g, '');
        if (hex.length === 3) hex = hex.replace(/(.)/g, '$1$1');
        var r = parseInt(hex.substr(0,2),16), g = parseInt(hex.substr(2,2),16), b = parseInt(hex.substr(4,2),16);
        var p = (100 + percent) / 100;
        r = Math.round(Math.min(255, Math.max(0, r*p)));
        g = Math.round(Math.min(255, Math.max(0, g*p)));
        b = Math.round(Math.min(255, Math.max(0, b*p)));
        return '#' + ('00'+r.toString(16)).slice(-2).toUpperCase() +
                     ('00'+g.toString(16)).slice(-2).toUpperCase() +
                     ('00'+b.toString(16)).slice(-2).toUpperCase();
    }

    function calcDistance(c1, c2) {
        var a = (c1||'0|0').split('|'), b = (c2||'0|0').split('|');
        var dx = parseInt(a[0],10) - parseInt(b[0],10), dy = parseInt(a[1],10) - parseInt(b[1],10);
        return Math.sqrt(dx*dx + dy*dy);
    }

    function getSpeedConstant() {
        var key = W + 'speedWorld';
        var stored = localStorage.getItem(key);
        if (stored) return JSON.parse(stored);
        var data = httpGet('/interface.php?func=get_config');
        var doc2 = new DOMParser().parseFromString(data, 'text/html');
        var obj  = {
            worldSpeed: Number(doc2.getElementsByTagName('speed')[0].innerHTML),
            unitSpeed:  Number(doc2.getElementsByTagName('unit_speed')[0].innerHTML)
        };
        localStorage.setItem(key, JSON.stringify(obj));
        return obj;
    }

    // ms-per-field for each unit type on this world, used both to display the "arrives at"
    // check and to work out which units can be safely bundled into one command (see
    // villageAnchorSpeed below).
    function getUnitSpeedTable() {
        var speedConst = getSpeedConstant();
        var sw = speedConst.worldSpeed, su = speedConst.unitSpeed;
        return {
            snob:2100*1000/(sw*su), ram:1800*1000/(sw*su), catapult:1800*1000/(sw*su),
            sword:1320*1000/(sw*su), axe:1080*1000/(sw*su), spear:1080*1000/(sw*su),
            archer:1080*1000/(sw*su), heavy:660*1000/(sw*su), light:600*1000/(sw*su),
            marcher:600*1000/(sw*su), knight:600*1000/(sw*su), spy:540*1000/(sw*su)
        };
    }

    // The slowest unit type this village could send ALONE and still land inside the requested
    // window (higher ms-per-field = slower), or -1 if nothing from this village lands in time.
    // A support command travels at the pace of its slowest included unit, so any unit at least
    // as fast as this anchor also lands on time once bundled with it — this is what lets a
    // command mix e.g. spear + heavy from a village where only heavy alone would make the cut.
    function villageAnchorSpeed(obj, speedTroop) {
        var anchor = -1;
        units.forEach(function (u) {
            if (obj[u + '_speed'] !== undefined && speedTroop[u] > anchor) anchor = speedTroop[u];
        });
        return anchor;
    }

    // Expose for inline onclick attributes
    window.countTotalTroops = countTotalTroops;
    window.fillInputs        = fillInputs;

})();

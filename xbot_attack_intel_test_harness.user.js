// ==UserScript==
// @name         xBot Attack Intel — Test Harness
// @namespace    tw_attack_intel_test
// @version      1.0.0
// @description  Manual test helpers for attack_intel — force a sync, inspect the local server directly, or seed synthetic reports without waiting for a real matching attack.
// @match        https://*.tribalwars.com.pt/game.php*
// @grant        unsafeWindow
// @run-at       document-end
// ==/UserScript==

// NOTE: some Tampermonkey builds (notably its MV3 Chrome build) still
// isolate the JS global object from the page even with a permissive grant —
// so `window.foo = ...` inside a userscript can silently fail to be visible
// from the DevTools console, even though the DOM stays shared. This script
// uses `unsafeWindow` (Tampermonkey's documented escape hatch to the real
// page window) for every exposed console helper below specifically to avoid
// that. If commands still show "not defined" after this, open the script's
// own entry in the Tampermonkey dashboard → its Settings tab → set
// "Sandbox Mode" to "Page" → save → reload the tab.

// HOW TO USE (test-only, not part of the shipped extension):
//
// 1. Install the REAL tw-suite-extension/modules/attack_intel.user.js as a
//    Tampermonkey script on the second account's browser — its header already
//    has @match/@grant set correctly, it has zero xBot-extension dependency
//    (no chrome.* calls anywhere in it), so it runs standalone as-is. This
//    means the test uses the actual production code, not a re-implementation.
// 2. ALSO install this harness (as a second Tampermonkey script, or just paste
//    it into DevTools console — F12 — on each account's incomings page).
// 3. Both accounts need server-attack-intel running (npm start) and pointed
//    at the same serverUrl — if both browser profiles are on this same PC,
//    the default http://localhost:3742 already matches for both.
// 3b. server-attack-intel now requires a valid xBot license on every
//     data-bearing request. Under the real extension this is automatic
//     (router.ts bridges your already-validated key in). Under bare
//     Tampermonkey there's no bridge, so set one by hand once per account:
//       localStorage.setItem('attack_intel_settings_v1',
//         JSON.stringify({ ...JSON.parse(localStorage.getItem('attack_intel_settings_v1')||'{}'), licenseKey: 'YOUR-KEY' }))
//     If you skip this, every gated call 401s and this harness will log a
//     warning telling you which endpoint rejected it.
// 4. Since syncMode defaults to "manual", nothing sends itself. Use
//    xbotTestSync() to force one pass on demand — it dispatches the exact
//    same event the real "Sync now" button in the overlay uses, so it's not
//    a bypass of the design, just a way to trigger it without opening the
//    panel.
//
// Console commands this exposes:
//   xbotTestSync()                          — force a real sync pass now
//   xbotTestStatus()                        — read local settings + hit
//                                              /health and /stats directly
//   xbotTestAdvisory(srcVillageId)          — check one village's advisory
//                                              state directly, no need to
//                                              find an `unknown` row by eye
//   xbotTestSeed(srcVillageId, size, inRange, arrivalOffsetMin, world, asSelf)
//                                            — POST a synthetic /report so
//                                              you don't need two real
//                                              accounts to actually be hit
//                                              by the same attacking village
//                                              at the same time to test the
//                                              cross-account advisory logic.
//                                              asSelf=true seeds under THIS
//                                              account's own reporterId, to
//                                              confirm it's correctly
//                                              excluded from confirming its
//                                              own other unknown attacks.

(function () {
    'use strict';

    const pageWindow = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;

    const SETTINGS_KEY = 'attack_intel_settings_v1';
    // Synthetic seeds default to a separate "world" so they never mix into
    // real report data — pass a real world name explicitly if you want to
    // test alongside genuine rows instead.
    const TEST_WORLD = 'xbot-test';

    function settings() {
        try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'); }
        catch (e) { return {}; }
    }
    function serverUrl() {
        return String(settings().serverUrl || 'http://localhost:3742').replace(/\/+$/, '');
    }
    function realWorld() {
        return (typeof pageWindow.game_data !== 'undefined' && pageWindow.game_data.world) || 'unknown';
    }

    // Same key/value the real attack_intel.user.js reads via getReporterId()
    // — this account's own stable identity for the cross-player advisory
    // signal. Used both so xbotTestAdvisory() mirrors exactly what the real
    // module would ask for, and so xbotTestSeed(..., { asSelf: true }) can
    // deliberately simulate "this same account already reported this".
    function reporterId() {
        try { return localStorage.getItem('attack_intel_reporter_id') || ''; }
        catch (e) { return ''; }
    }

    // Same sourcing as attack_intel.user.js's currentLicenseKey(): prefer the
    // extension's own bridged key (router.ts, real extension only), fall
    // back to whatever's manually entered in the shared settings object
    // (Settings tab's "License key" field, or attack_intel_settings_v1
    // edited by hand for a bare-Tampermonkey install). Every data-bearing
    // endpoint requires this now — /health is the one exception.
    function licenseKey() {
        try {
            const bridged = sessionStorage.getItem('__xbot_license_key__');
            if (bridged) return bridged;
        } catch (e) { /* ignore */ }
        return settings().licenseKey || '';
    }
    function authHeaders(extra) {
        return { 'X-XBot-License': licenseKey(), ...(extra || {}) };
    }

    // Forces an immediate sync pass on THIS tab's real attack_intel.user.js
    // instance. Respects manual/automatic mode exactly as the real "Sync
    // now" button does — this is not a way around the 5-minute floor, it's
    // the same on-demand trigger the UI exposes, just reachable from the
    // console when there's no overlay (e.g. a bare Tampermonkey install).
    pageWindow.xbotTestSync = function () {
        console.log('[xbot-test] what the real module is about to read:');
        pageWindow.xbotTestScanTable();
        document.dispatchEvent(new CustomEvent('xbot:attackintel:syncNow'));
        console.log('[xbot-test] syncNow dispatched — check the Network tab for /report + /advisory calls, or run xbotTestStatus() after a moment');
    };

    // Read-only — talks to the server directly, bypassing the game page
    // entirely, so you can confirm both accounts' reports landed in the
    // same xBot.db without relying on the badge rendering correctly.
    pageWindow.xbotTestStatus = async function (world) {
        const w = world || realWorld();
        try {
            const health = await fetch(`${serverUrl()}/health`).then(r => r.json()); // /health stays keyless
            const statsRes = await fetch(`${serverUrl()}/stats?world=${encodeURIComponent(w)}`, { headers: authHeaders() });
            const stats = await statsRes.json();
            console.log('[xbot-test] health:', health);
            if (!statsRes.ok) console.warn('[xbot-test] /stats rejected (status %d) — check licenseKey:', statsRes.status, stats);
            console.log('[xbot-test] stats for world "%s":', w, stats);
            console.log('[xbot-test] local settings:', settings());
        } catch (e) {
            console.error('[xbot-test] server unreachable at', serverUrl(), '—', e);
        }
    };

    // Read-only — check one specific source village's advisory state
    // directly, without hunting for an `unknown` row in the table by eye.
    // Sends this account's real reporterId, same as a live sync would, so
    // the result reflects the actual cross-player exclusion (own reports
    // never count as confirmation — see xbotTestSeed's asSelf option below).
    pageWindow.xbotTestAdvisory = async function (srcVillageId, windowHours, world) {
        if (!srcVillageId) { console.error('[xbot-test] usage: xbotTestAdvisory(srcVillageId[, windowHours][, world])'); return; }
        const qs = new URLSearchParams({
            world: world || realWorld(),
            srcVillageId: String(srcVillageId),
            windowHours: String(windowHours || settings().windowHours || 12),
            reporterId: reporterId(),
        });
        try {
            const res = await fetch(`${serverUrl()}/advisory?${qs.toString()}`, { headers: authHeaders() });
            const data = await res.json();
            if (!res.ok) console.warn('[xbot-test] /advisory rejected (status %d) — check licenseKey:', res.status, data);
            console.log('[xbot-test] advisory for village %s:', srcVillageId, data);
            return data;
        } catch (e) {
            console.error('[xbot-test] server unreachable at', serverUrl(), '—', e);
        }
    };

    // Synthetic — POSTs a fake observation straight to /report so you can
    // simulate "account 2 confirmed a large attack from village X" and
    // "account 1 has an unknown attack from village X around the same time"
    // without needing two real accounts to actually be hit by the same
    // attacking village at the same moment. cmdId is auto-prefixed `test-`
    // so it's obviously synthetic if you ever inspect xBot.db directly.
    //   size:      "small" | "medium" | "large" | "unknown"
    //   inRange:   true/false — whether this counts as a FINAL classification
    //   arrivalOffsetMin: minutes from now (can be negative), default 0
    //   asSelf:    false (default) — seeds under a fresh random reporterId,
    //              i.e. simulates ANOTHER player's account, the normal case.
    //              true — seeds under THIS account's own real reporterId,
    //              letting you deliberately test that an account's own
    //              report never counts as confirmation for its own other
    //              unknown attacks from the same village (see /advisory's
    //              own-reporter exclusion).
    pageWindow.xbotTestSeed = async function (srcVillageId, size, inRange, arrivalOffsetMin, world, asSelf) {
        if (!srcVillageId || !size) {
            console.error('[xbot-test] usage: xbotTestSeed(srcVillageId, size, inRange=true, arrivalOffsetMin=0, world?, asSelf=false)');
            return;
        }
        const w = world || TEST_WORLD;
        const arrivalMs = Date.now() + (Number(arrivalOffsetMin) || 0) * 60_000;
        const body = {
            world: w,
            cmdId: `test-${srcVillageId}-${size}-${Date.now()}`,
            srcVillageId: String(srcVillageId),
            srcX: 500, srcY: 500,
            destVillageId: 'test-dest',
            player: 'xbot-test-harness',
            size,
            inRange: inRange !== false,
            arrivalMs,
            reporterId: asSelf ? reporterId() : `test-reporter-${Math.random().toString(36).slice(2, 8)}`,
        };
        try {
            const res = await fetch(`${serverUrl()}/report`, {
                method: 'POST',
                headers: authHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify(body),
            });
            const data = await res.json();
            if (!res.ok) console.warn('[xbot-test] /report rejected (status %d) — check licenseKey:', res.status, data);
            console.log('[xbot-test] seeded (world="%s"):', w, body, '→', data);
            return data;
        } catch (e) {
            console.error('[xbot-test] server unreachable at', serverUrl(), '—', e);
        }
    };

    // Read-only diagnostic — a full mirror of attack_intel.user.js's own
    // parseRow() (same field names, same size/label filtering), but this
    // copy never sends anything anywhere. Lets you see exactly what the
    // real module would read/report from whatever is already in the table
    // — no synthetic data needed when the account already has real rows.
    const SIZE_BY_ICON = { attack_small: 'small', attack_medium: 'medium', attack_large: 'large', attack: 'unknown' };
    const IGNORED_LABELS = ['Btd']; // keep in sync with attack_intel.user.js

    function diagQueryParam(href, key) {
        try { return new URL(href, window.location.origin).searchParams.get(key); }
        catch (e) { const m = String(href).match(new RegExp(`[?&]${key}=(\\d+)`)); return m ? m[1] : null; }
    }
    function diagParseRow(row) {
        const tds = row.querySelectorAll(':scope > td');
        if (tds.length < 8) return { skip: 'fewer than 8 <td>' };

        const img = tds[0].querySelector('img');
        const iconName = img ? (img.getAttribute('src') || '').split('/').pop().split('?')[0].replace(/\.[a-z0-9]+$/i, '') : '';
        if (!/^attack/.test(iconName)) return { skip: 'not an attack icon' };
        const size = SIZE_BY_ICON[iconName] || 'unknown';

        const label = (tds[0].querySelector('.quickedit-label')?.textContent || '').replace(/\[.*?\]\s*$/, '').trim();
        if (IGNORED_LABELS.includes(label)) return { skip: `ignored label "${label}"`, label, size };

        const cmdId = tds[0].querySelector('[data-command-id]')?.getAttribute('data-command-id') || null;
        const srcLink = tds[2].querySelector('a[href*="info_village"]');
        const srcVillageId = srcLink ? diagQueryParam(srcLink.getAttribute('href') || '', 'id') : null;
        const coords = tds[2].textContent.match(/\((\d+)\|(\d+)\)/);

        return {
            skip: null,
            cmdId, label, size,
            srcVillageId,
            srcX: coords ? Number(coords[1]) : null,
            srcY: coords ? Number(coords[2]) : null,
            player: tds[3].textContent.trim(),
            inRange: tds[7].textContent.trim() === 'Dentro do Alcance',
            arrivalText: tds[5].textContent.trim(),
        };
    }

    pageWindow.xbotTestScanTable = function () {
        const table = document.getElementById('incomings_table');
        if (!table) { console.warn('[xbot-test] #incomings_table not found on this page'); return; }
        const rows = Array.from(table.rows).slice(1);
        const wouldReport = [];
        const skipped = [];
        for (const row of rows) {
            const parsed = diagParseRow(row);
            if (parsed.skip) skipped.push(parsed);
            else wouldReport.push(parsed);
        }
        console.log(`[xbot-test] ${wouldReport.length} row(s) WOULD be reported:`);
        console.table(wouldReport);
        if (skipped.length) {
            console.log(`[xbot-test] ${skipped.length} row(s) skipped:`);
            console.table(skipped);
        }
        return { wouldReport, skipped };
    };

    // Small floating button so the console doesn't have to stay open.
    if (!document.getElementById('xbot-test-sync-btn')) {
        const btn = document.createElement('button');
        btn.id = 'xbot-test-sync-btn';
        btn.textContent = '🔄 xBot Test Sync';
        btn.style.cssText = 'position:fixed;bottom:12px;right:12px;z-index:999999;'
            + 'padding:8px 12px;background:#222;color:#fff;border:1px solid #555;'
            + 'border-radius:6px;font:12px sans-serif;cursor:pointer;opacity:0.85;';
        btn.onclick = () => { pageWindow.xbotTestSync(); setTimeout(() => pageWindow.xbotTestStatus(), 500); };
        document.body.appendChild(btn);
    }

    console.log('[xbot-test] ready — xbotTestSync(), xbotTestStatus(), xbotTestAdvisory(srcVillageId), xbotTestSeed(srcVillageId, size, inRange, arrivalOffsetMin), xbotTestScanTable() available');
    // Self-check: if this ever logs false, the console's `window` is still a
    // different object than the one this script wrote to — the functions
    // will keep showing "not defined" until Sandbox Mode is set to "Page"
    // for this script in the Tampermonkey dashboard.
    console.log('[xbot-test] reachable from the page console:', typeof window.xbotTestSync === 'function');
})();

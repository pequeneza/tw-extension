// ==UserScript==
// @name         TribalWars Attack Intel
// @namespace    tw_attack_intel
// @version      1.0.0
// @description  Reports incoming-attack metadata to a local xBot intel server and shows cross-report size advisories.
// @match        https://*.tribalwars.com.pt/game.php*
// @grant        unsafeWindow
// @run-at       document-end
// ==/UserScript==

(function () {
    'use strict';

    // Some Tampermonkey builds (notably its MV3 Chrome build) still isolate
    // the JS global object from the page even with a permissive grant, even
    // though the DOM (document, fetch, localStorage) stays shared — which
    // silently breaks any window.X assignment meant to be visible from the
    // page/console, without breaking the DOM-level CustomEvent bridge this
    // module otherwise relies on. unsafeWindow is Tampermonkey's documented
    // escape hatch back to the real page window; when this runs inside the
    // real xBot extension (true main-world injection) it's already the same
    // object as window, so the fallback is a no-op there.
    const pageWindow = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;

    if (typeof pageWindow.game_data === 'undefined') return;
    if (pageWindow.__twAttackIntelRunning) return;
    pageWindow.__twAttackIntelRunning = true;

    const SETTINGS_KEY    = 'attack_intel_settings_v1';
    const REPORTER_ID_KEY = 'attack_intel_reporter_id';

    // Hard floor, enforced regardless of what's in localStorage (hand-edited
    // storage or a settings-UI bug must never push this below 5 minutes).
    const MIN_AUTO_SYNC_MINUTES = 5;
    // How often we cheaply re-check (localStorage read only, no network) for
    // a settings change that should reschedule the automatic timer.
    const SETTINGS_RECHECK_MS = 30_000;

    const DEFAULT_SETTINGS = {
        enabled: true,
        serverUrl: 'http://localhost:3742',
        windowHours: 12,
        // "manual"    — never syncs on its own; only xbot:attackintel:syncNow does anything.
        // "automatic" — syncs on a timer, never faster than MIN_AUTO_SYNC_MINUTES.
        syncMode: 'manual',
        autoSyncMinutes: 5,
        // Purely visual, no network: when true, the advisory column (header +
        // blank cells) is added to the table the instant it's found on page
        // load, instead of waiting for a sync pass to add it. Actual data
        // (waiting dots / advisory icons) still only ever comes from a real
        // sync, gated by syncMode exactly as before.
        keepTracking: false,
        // Only used when there's no sessionStorage bridge to read from (i.e.
        // no real xBot extension present — a bare Tampermonkey install).
        // Under the real extension this is ignored; router.ts's own
        // already-validated key always takes priority via currentLicenseKey().
        licenseKey: '',
        // Text applied (via quickedit, same mechanism as mass_label_renamer)
        // when the player clicks a confirmed LARGE marker icon. Empty/unset
        // falls back to DEFAULT_TAG_TEXT at the point of use, not here, so a
        // later change to the fallback doesn't require migrating settings.
        tagText: '',
    };

    // Matches mass_label_renamer's own TAGS[9] ('[Fake]') — used when the
    // user hasn't configured a custom tag text of their own.
    const DEFAULT_TAG_TEXT = '[Fake]';

    /* ── Settings ────────────────────────────────────────────────────────────*/

    function loadSettings() {
        try {
            const raw = localStorage.getItem(SETTINGS_KEY);
            if (!raw) return { ...DEFAULT_SETTINGS };
            const saved = JSON.parse(raw);
            if (!saved || typeof saved !== 'object') return { ...DEFAULT_SETTINGS };
            return { ...DEFAULT_SETTINGS, ...saved };
        } catch (e) {
            return { ...DEFAULT_SETTINGS };
        }
    }

    function baseUrl(settings) {
        return String(settings.serverUrl || DEFAULT_SETTINGS.serverUrl).replace(/\/+$/, '');
    }

    /* ── Reporter ID — random per browser install, never derived from the
       TribalWars account. Persisted so the server can group reports from the
       same install without learning who the player is. ─────────────────────*/

    function randomId() {
        try {
            if (window.crypto && typeof window.crypto.randomUUID === 'function') {
                return window.crypto.randomUUID();
            }
        } catch (e) { /* fall through */ }
        try {
            if (window.crypto && typeof window.crypto.getRandomValues === 'function') {
                const buf = new Uint8Array(16);
                window.crypto.getRandomValues(buf);
                return Array.from(buf, b => b.toString(16).padStart(2, '0')).join('');
            }
        } catch (e) { /* fall through */ }
        let out = '';
        for (let i = 0; i < 32; i++) out += Math.floor(Math.random() * 16).toString(16);
        return out;
    }

    function getReporterId() {
        try {
            const existing = localStorage.getItem(REPORTER_ID_KEY);
            if (existing) return existing;
        } catch (e) { /* ignore */ }
        const id = randomId();
        try { localStorage.setItem(REPORTER_ID_KEY, id); } catch (e) { /* ignore */ }
        return id;
    }

    const reporterId = getReporterId();

    /* ── License key sourcing ────────────────────────────────────────────────
       server-attack-intel requires a valid xBot license on every data-bearing
       request (reuses the same POST license.vivaomadeira.com/validate the
       extension itself already calls — see router.ts). Under the real
       extension, router.ts bridges the already-validated key into
       sessionStorage right after its own check passes. Under a bare
       Tampermonkey install (no router.ts, no bridge), fall back to a manually
       entered key in this module's own settings — same enforcement either
       way, just a different source for the key. ───────────────────────────*/

    const LICENSE_BRIDGE_KEY = '__xbot_license_key__';

    function currentLicenseKey(settings) {
        try {
            const bridged = sessionStorage.getItem(LICENSE_BRIDGE_KEY);
            if (bridged) return bridged;
        } catch (e) { /* ignore */ }
        return settings.licenseKey || '';
    }

    /* ── State bridge to the React panel ─────────────────────────────────────*/

    let serverOnline = false;
    let trackedThisSession = 0;
    let lastSyncMs = null;
    // null (not checked yet) | 'ok' | 'missing' | 'invalid' | 'unreachable'
    let licenseStatus = null;

    function dispatchState() {
        const payload = { serverOnline, trackedThisSession, lastSyncMs, licenseStatus };
        pageWindow.TM_ATTACK_INTEL_STATE = payload;
        document.dispatchEvent(new CustomEvent('xbot:attackintel:state', { detail: payload }));
    }

    // serverOnline reflects reachability only — getting a 401/403/503 back
    // from the license gate still means the server answered, so that's
    // "online" with a license problem, not "offline". Only an actual network
    // failure (fetch rejecting) means unreachable.
    function setOnline(ok) {
        serverOnline = !!ok;
        if (ok) lastSyncMs = Date.now();
        dispatchState();
    }

    function noteResponse(res) {
        if (!res) return;
        if (res.status === 401) licenseStatus = 'missing';
        else if (res.status === 403) licenseStatus = 'invalid';
        else if (res.status === 503) licenseStatus = 'unreachable';
        else if (res.ok) licenseStatus = 'ok';
    }

    document.addEventListener('xbot:attackintel:getState', dispatchState);

    /* ── Health probe — runs on every page so the panel shows correct status
       even when the current page has no incomings table. ────────────────────*/

    function healthCheck() {
        const settings = loadSettings();
        try {
            fetch(`${baseUrl(settings)}/health`, { method: 'GET' })
                .then(res => setOnline(res && res.ok))
                .catch(() => setOnline(false));
        } catch (e) {
            setOnline(false);
        }
    }

    healthCheck();

    /* ── Page gate ───────────────────────────────────────────────────────────*/

    const params = new URLSearchParams(window.location.search);
    const isIncomingsPage = params.get('screen') === 'overview_villages' &&
                            params.get('mode')   === 'incomings';
    if (!isIncomingsPage) return;

    /* ── Row parsing ─────────────────────────────────────────────────────────*/

    const SIZE_BY_ICON = {
        attack_small:  'small',
        attack_medium: 'medium',
        attack_large:  'large',
        attack:        'unknown',
    };

    // Commands whose base unit-name label (before any [BITO tag]) matches one
    // of these are ignored completely — not reported, not counted toward
    // advisories. "Btd" commands are excluded per explicit request.
    const IGNORED_LABELS = ['Btd'];

    function baseLabel(td0) {
        const el = td0.querySelector('.quickedit-label');
        if (!el) return '';
        // Strip a trailing "[tag]" (e.g. "Btd [Morto]" -> "Btd") and whitespace.
        return el.textContent.replace(/\[.*?\]\s*$/, '').trim();
    }

    // Returns null when td[0]'s icon isn't an attack icon at all (e.g. a support
    // row leaking into this view) so such rows are skipped entirely.
    function parseSize(td0) {
        const img = td0.querySelector('img');
        if (!img) return null;
        const src  = img.getAttribute('src') || '';
        const file = (src.split('/').pop() || '').split('?')[0];
        const name = file.replace(/\.[a-z0-9]+$/i, '');
        if (!/^attack/.test(name)) return null;
        return SIZE_BY_ICON[name] || 'unknown';
    }

    function serverNowMs() {
        const t = (typeof pageWindow.game_data !== 'undefined' && pageWindow.game_data.time)
            ? pageWindow.game_data.time
            : Math.floor(Date.now() / 1000);
        return t * 1000;
    }

    // Arrival-time parsing lifted from desviador.user.js — same page, same cell,
    // already handles the day/year rollover cases of the PT date formats.
    function parseArrivalMs(arrivalTd) {
        const msVal = parseInt(arrivalTd.querySelector('span.grey.small')?.textContent.trim() || '0', 10);
        const cellText = arrivalTd.textContent;
        const nowMs = serverNowMs();

        const amanhaMatch   = cellText.match(/amanhã\s+(?:às\s*)?(\d{2}):(\d{2}):(\d{2})(?::(\d{1,3}))?/i);
        const dateTimeMatch = !amanhaMatch && cellText.match(/(\d{1,2})\.(\d{1,2})\.\s*(?:às\s*)?(\d{2}):(\d{2}):(\d{2})(?::(\d{1,3}))?/);
        const timeOnlyMatch = !amanhaMatch && !dateTimeMatch && cellText.match(/(\d{2}):(\d{2}):(\d{2})(?::(\d{1,3}))?/);

        if (amanhaMatch) {
            const now = new Date(nowMs);
            const h = +amanhaMatch[1], m = +amanhaMatch[2], s = +amanhaMatch[3];
            const ms = amanhaMatch[4] ? parseInt(amanhaMatch[4], 10) : msVal;
            return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, h, m, s, ms).getTime();
        }
        if (dateTimeMatch) {
            const now = new Date(nowMs);
            const day = +dateTimeMatch[1], month = +dateTimeMatch[2] - 1;
            const h = +dateTimeMatch[3], m = +dateTimeMatch[4], s = +dateTimeMatch[5];
            const ms = dateTimeMatch[6] ? parseInt(dateTimeMatch[6], 10) : msVal;
            const candidate = new Date(now.getFullYear(), month, day, h, m, s, ms);
            if (candidate.getTime() <= nowMs) candidate.setFullYear(candidate.getFullYear() + 1);
            return candidate.getTime();
        }
        if (timeOnlyMatch) {
            const now = new Date(nowMs);
            const h = +timeOnlyMatch[1], m = +timeOnlyMatch[2], s = +timeOnlyMatch[3];
            const ms = timeOnlyMatch[4] ? parseInt(timeOnlyMatch[4], 10) : msVal;
            const arrival = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, s, ms);
            if (arrival.getTime() <= nowMs) arrival.setDate(arrival.getDate() + 1);
            return arrival.getTime();
        }
        return null;
    }

    function queryParam(href, key) {
        try {
            return new URL(href, window.location.origin).searchParams.get(key);
        } catch (e) {
            const m = String(href).match(new RegExp(`[?&]${key}=(\\d+)`));
            return m ? m[1] : null;
        }
    }

    function ownVillageId() {
        const v = pageWindow.game_data && pageWindow.game_data.village;
        return v && v.id != null ? String(v.id) : null;
    }

    function parseRow(row) {
        // Exclude our own advisory column (inserted at index 0 by
        // ensureAdvisoryColumn) so the original 8-column indices below stay
        // correct on every sync after the first one, not just before the
        // column exists.
        const tds = row.querySelectorAll(':scope > td:not(.' + ADV_COL_CLASS + ')');
        if (tds.length < 8) return null;

        const size = parseSize(tds[0]);
        if (!size) return null;

        if (IGNORED_LABELS.includes(baseLabel(tds[0]))) return null;

        const cmdId = tds[0].querySelector('[data-command-id]')?.getAttribute('data-command-id') || null;
        if (!cmdId) return null;

        const srcLink = tds[2].querySelector('a[href*="info_village"]');
        const srcVillageId = srcLink ? queryParam(srcLink.getAttribute('href') || '', 'id') : null;
        if (!srcVillageId) return null;

        const coords = tds[2].textContent.match(/\((\d+)\|(\d+)\)/);
        const srcX = coords ? Number(coords[1]) : null;
        const srcY = coords ? Number(coords[2]) : null;

        const destLink = tds[1].querySelector('a[href*="village="]');
        const destVillageId = (destLink ? queryParam(destLink.getAttribute('href') || '', 'village') : null)
            || ownVillageId();

        const arrivalMs = parseArrivalMs(tds[5]);
        if (arrivalMs == null) return null;

        return {
            cmdId,
            srcVillageId,
            srcX,
            srcY,
            destVillageId,
            player: tds[3].textContent.trim(),
            size,
            inRange: tds[7].textContent.trim() === 'Dentro do Alcance',
            arrivalMs,
            td0: tds[0],
        };
    }

    function parseRows() {
        const table = document.getElementById('incomings_table');
        if (!table) return [];
        const out = [];
        for (const row of Array.from(table.rows).slice(1)) {
            let parsed = null;
            try { parsed = parseRow(row); } catch (e) { parsed = null; }
            if (parsed) out.push(parsed);
        }
        return out;
    }

    /* ── Reporting ───────────────────────────────────────────────────────────*/

    const reported = new Set(); // per-page-load dedup only, not the source of truth

    function report(entry, settings) {
        const body = JSON.stringify({
            world: pageWindow.game_data.world,
            cmdId: entry.cmdId,
            srcVillageId: entry.srcVillageId,
            srcX: entry.srcX,
            srcY: entry.srcY,
            destVillageId: entry.destVillageId,
            player: entry.player,
            size: entry.size,
            inRange: entry.inRange,
            arrivalMs: entry.arrivalMs,
            reporterId,
        });
        try {
            fetch(`${baseUrl(settings)}/report`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-XBot-License': currentLicenseKey(settings),
                },
                body,
            }).then(res => {
                noteResponse(res);
                setOnline(true); // got a response at all — reachable, regardless of status
                if (res.ok) trackedThisSession++;
            }).catch(() => setOnline(false));
        } catch (e) {
            setOnline(false);
        }
    }

    /* ── Cross-session tracking + resolve-on-arrival ────────────────────────
       localStorage survives page reloads (unlike `reported` above), so a
       command we've already reported keeps being recognised as "still
       incoming" across sessions until it actually disappears from the
       table. Once that happens — and only once its own arrivalMs has
       actually passed, so a pagination gap is never mistaken for an
       arrival — the server is told to move it out of the active table. ──*/

    const TRACKED_KEY = 'attack_intel_tracked_v1';
    const TRACKED_STALE_MS = 48 * 3600_000; // safety-net prune if resolve keeps failing

    function loadTracked() {
        try {
            const raw = localStorage.getItem(TRACKED_KEY);
            const parsed = raw ? JSON.parse(raw) : {};
            return (parsed && typeof parsed === 'object') ? parsed : {};
        } catch (e) { return {}; }
    }
    function saveTracked(map) {
        try { localStorage.setItem(TRACKED_KEY, JSON.stringify(map)); } catch (e) { /* ignore */ }
    }

    function scanAndReport(settings) {
        const tracked = loadTracked();
        const world = pageWindow.game_data.world;

        for (const entry of parseRows()) {
            // Keep the persisted record fresh every scan, not just on first
            // sight, so a command already known from a prior session is
            // still correctly recognised as "still incoming" this session.
            tracked[entry.cmdId] = { world, srcVillageId: entry.srcVillageId, arrivalMs: entry.arrivalMs };

            if (reported.has(entry.cmdId)) continue;
            reported.add(entry.cmdId);
            report(entry, settings);
        }

        saveTracked(tracked);
    }

    function resolveOnServer(world, cmdId, settings) {
        fetch(`${baseUrl(settings)}/resolve`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-XBot-License': currentLicenseKey(settings),
            },
            body: JSON.stringify({ world, cmdId }),
        }).then(res => {
            noteResponse(res);
            setOnline(true);
        }).catch(() => setOnline(false));
    }

    function checkResolved(settings) {
        const tracked = loadTracked();
        const visible = new Set(parseRows().map(e => e.cmdId));
        const now = Date.now();
        let changed = false;

        for (const [cmdId, entry] of Object.entries(tracked)) {
            if (visible.has(cmdId)) continue; // still on this page, nothing to do

            const pastArrival = typeof entry.arrivalMs === 'number' && now >= entry.arrivalMs;
            const tooStale = typeof entry.arrivalMs === 'number' && (now - entry.arrivalMs) > TRACKED_STALE_MS;

            if (pastArrival) {
                // Missing AND its own arrival time has passed — this is a
                // real landing, not just "not on the current page". Best
                // effort: drop it locally regardless of whether the POST
                // succeeds, so a server outage can't grow this list forever.
                resolveOnServer(entry.world, cmdId, settings);
                delete tracked[cmdId];
                changed = true;
            } else if (tooStale) {
                delete tracked[cmdId];
                changed = true;
            }
            // Missing but arrival is still in the future: leave it tracked —
            // most likely just a pagination gap, not an actual arrival.
        }

        if (changed) saveTracked(tracked);
    }

    /* ── Advisory badges ─────────────────────────────────────────────────────
       Rendered as a real attack-size icon (attack_small.webp) in a dedicated
       column on the left, not text inline in the existing icon cell — but
       kept faded/grayscale so it never looks like a confirmed classification.
       The column is added to EVERY row (blank where there's no advisory),
       not just advisory rows, so table column alignment never breaks. ─────*/

    const ADV_COL_CLASS = 'xbot-adv-col';

    function ensureAdvisoryColumn(table) {
        // Appended at the END, not inserted at the front — desviador.user.js
        // (and potentially other modules) read this same table's rows by
        // fixed positional index (directTds[5] for arrival, etc.), scanning
        // any row via span.quickedit[data-id] with no awareness this column
        // exists. Inserting at index 0 shifted every one of their indices by
        // one and broke that parsing; appending leaves every original index
        // untouched no matter which other script reads the row.
        const headerRow = table.rows[0];
        if (headerRow && !headerRow.querySelector('.' + ADV_COL_CLASS)) {
            const th = document.createElement('th');
            th.className = ADV_COL_CLASS;
            th.style.cssText = 'width:22px;text-align:center;font-size:12px;';
            th.title = 'Attack Intel advisory';
            th.textContent = '🛰️'; // same icon as the module elsewhere (popup, trigger button)
            headerRow.appendChild(th);
        }
        for (const row of Array.from(table.rows).slice(1)) {
            if (row.querySelector(':scope > td.' + ADV_COL_CLASS)) continue;
            const td = document.createElement('td');
            td.className = ADV_COL_CLASS;
            row.appendChild(td);
        }
    }

    /* ── Local advisory cache ────────────────────────────────────────────────
       localStorage, not IndexedDB: this is at most one small JSON entry per
       distinct source village ever seen (a few hundred bytes each even for
       an account with hundreds of attacking villages) — nowhere near
       localStorage's ~5-10MB ceiling, and every other module in this
       codebase already reads/writes small JSON maps here synchronously with
       no setup cost. IndexedDB's async API and versioned-schema overhead
       buys nothing at this scale; it would just be a heavier tool for the
       same job. Lets `keepTracking` show last-known advisories the instant
       the page loads, without waiting on a real sync. ───────────────────────*/

    // v1 -> v2: excluded own reports from confirming evidence (reporterId
    // filtering) — old cached confirmedNearby values were computed without
    // that filter and would be wrong if read back as fresh.
    // v2 -> v3: added hasOtherReports — entries cached under v2 don't have
    // this field at all (reads as undefined/falsy), which would wrongly
    // clear the waiting dot even for villages that DO have other-account
    // data, just because that field didn't exist yet when they were cached.
    const ADVISORY_CACHE_KEY = 'attack_intel_advisory_cache_v3';
    const ADVISORY_CACHE_STALE_MS = 24 * 3600_000;

    function loadAdvisoryCache() {
        try {
            const raw = localStorage.getItem(ADVISORY_CACHE_KEY);
            const parsed = raw ? JSON.parse(raw) : {};
            return (parsed && typeof parsed === 'object') ? parsed : {};
        } catch (e) { return {}; }
    }

    function saveAdvisoryCache(cache) {
        // Prune anything stale on every save so this can't grow unbounded —
        // no separate cleanup pass needed.
        const now = Date.now();
        for (const [villageId, entry] of Object.entries(cache)) {
            if (!entry || (now - entry.checkedMs) > ADVISORY_CACHE_STALE_MS) delete cache[villageId];
        }
        try { localStorage.setItem(ADVISORY_CACHE_KEY, JSON.stringify(cache)); } catch (e) { /* ignore */ }
    }

    const WAITING_CLASS       = 'xbot-attackintel-waiting';
    const MARKER_LARGE_CLASS  = 'xbot-attackintel-marker-large';
    const MARKER_MEDIUM_CLASS = 'xbot-attackintel-marker-medium';

    function clearCell(cell) {
        cell.querySelectorAll(
            '.' + WAITING_CLASS + ', .' + MARKER_LARGE_CLASS + ', .' + MARKER_MEDIUM_CLASS
        ).forEach(el => el.remove());
    }

    // Shown for every unknown-size row the moment it's been checked, so the
    // player can see the tool is actively tracking it even when there's
    // nothing to report yet — distinct from "hasn't been checked at all"
    // (which stays blank) and from the raw-evidence markers addSizeMarkers() adds.
    function addWaitingMarker(entry) {
        const row = entry.td0 && entry.td0.closest('tr');
        const cell = row && row.querySelector(':scope > td.' + ADV_COL_CLASS);
        if (!cell || cell.querySelector('.' + WAITING_CLASS)
            || cell.querySelector('.' + MARKER_LARGE_CLASS) || cell.querySelector('.' + MARKER_MEDIUM_CLASS)) return;

        const dot = document.createElement('span');
        dot.className = WAITING_CLASS;
        dot.title = 'Size unknown — this attack is being tracked. If another player confirms a large or medium attack from this village around this time, a marker will appear here.';
        dot.style.cssText = 'display:inline-block;width:6px;height:6px;border-radius:50%;background:#888;opacity:.6;cursor:help;';
        cell.appendChild(dot);
    }

    // Reuses the real attack_large.webp/attack_medium.webp icon (same asset
    // path as the row's own — currently-unknown — icon, just swapping the
    // filename) rather than a plain colored dot, so it reads naturally next
    // to the game's own icons. Kept faded/grayscale, same as the very first
    // version of this feature, specifically so it never looks like a
    // confirmed classification of THIS row — it's evidence about the
    // village, not a claim about this specific attack.
    function makeSizeIcon(entry, cls, iconFile, sizeLabel) {
        const srcImg = entry.td0.querySelector('img');
        const srcUrl = srcImg ? (srcImg.getAttribute('src') || '') : '';
        const iconSrc = srcUrl.replace(/attack(?:_[a-z]+)?\.webp$/, iconFile);
        if (!iconSrc) return null;

        const img = document.createElement('img');
        img.className = cls;
        img.src = iconSrc;
        img.alt = sizeLabel.toLowerCase();
        img.title = 'Another player confirmed a ' + sizeLabel + ' attack from this village around this arrival '
            + 'window. This is raw evidence, not a claim about this specific attack’s size — you decide '
            + 'whether it’s worth tagging.';
        img.style.cssText = 'width:16px;height:16px;opacity:.6;filter:grayscale(.3);'
            + 'cursor:help;display:block;margin-right:2px;';
        return img;
    }

    /* ── Click-to-tag on a confirmed LARGE marker ────────────────────────────
       Applies the configured tag text to the command's own quickedit label —
       the exact same UI-automation mechanism mass_label_renamer.user.js uses
       (open the inline rename editor, type, save), reimplemented locally in
       plain DOM so this module stays independent of whether that other
       userscript is even installed. Medium markers are intentionally left
       click-inert — this is only for LARGE per the feature request. ────────*/

    function jitter(baseMs, spreadMs) {
        return Math.max(0, Math.round(baseMs + (Math.random() * 2 - 1) * spreadMs));
    }

    function currentTagText(settings) {
        const configured = (settings.tagText || '').trim();
        return configured || DEFAULT_TAG_TEXT;
    }

    // Whether this row's OWN label already carries the tag — the label text
    // itself is the source of truth for "already tagged", not a separate
    // localStorage flag, so it stays correct across reloads/re-renders and
    // in sync with whatever the player may have edited by hand since.
    function rowHasTag(td0, tagText) {
        const el = td0.querySelector('.quickedit-label');
        return !!(el && el.textContent.indexOf(tagText) !== -1);
    }

    function setTagIconAppearance(icon, tagged) {
        icon.style.opacity = tagged ? '1' : '.6';
        icon.style.filter = tagged ? 'none' : 'grayscale(.3)';
    }

    // Mirrors mass_label_renamer.user.js's performRename: open the inline
    // quickedit editor, type the new value, save — same minimal jittered
    // pacing, reimplemented in plain DOM (this module has no jQuery
    // dependency anywhere else, so none is introduced here either).
    function performRename(row, buildValue, onDone) {
        const renameIcon = row.querySelector('.rename-icon');
        if (!renameIcon) { if (onDone) onDone(false); return; }
        renameIcon.click();
        setTimeout(() => {
            const input = row.querySelector('input[type=text]');
            if (!input) { if (onDone) onDone(false); return; }
            input.value = buildValue(input.value);
            setTimeout(() => {
                const saveBtn = row.querySelector('input[type=button]');
                if (saveBtn) saveBtn.click();
                if (onDone) onDone(true);
            }, jitter(100, 50));
        }, jitter(200, 100));
    }

    // Wires the click-to-tag behavior onto an already-created LARGE marker
    // icon: sets its initial appearance from current label state, and on
    // click applies the tag (same "base word + tag" convention as
    // mass_label_renamer's own bulk-fake) then turns the icon fully opaque.
    // Settings are re-read at click time, not captured at render time, so a
    // tag-text change takes effect on the very next click without needing a
    // resync.
    function wireLargeMarkerTagging(icon, entry) {
        const settings = loadSettings();
        const tagText = currentTagText(settings);
        const tagged = rowHasTag(entry.td0, tagText);
        setTagIconAppearance(icon, tagged);
        icon.style.cursor = 'pointer';
        icon.title += ' Click to tag this command "' + tagText + '" (like the label renamer).';

        icon.addEventListener('click', (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            const row = entry.td0 && entry.td0.closest('tr');
            if (!row) return;
            const liveSettings = loadSettings();
            const liveTagText = currentTagText(liveSettings);
            if (rowHasTag(entry.td0, liveTagText)) return; // already tagged — nothing to do
            performRename(row, (val) => val.split(' ')[0] + ' ' + liveTagText, (success) => {
                if (success) setTagIconAppearance(icon, true);
            });
        });
    }

    // Renders the raw sizes confirmed nearby in time from this village — never
    // a computed "likely X" guess. attack_large.webp = a large was confirmed,
    // attack_medium.webp = a medium was confirmed; both can show together.
    // The player decides what that means for this specific row, not the tool.
    //
    // hasOtherReports distinguishes "still waiting, but another account has
    // reported something about this village" (keep the dot — a real match is
    // still possible) from "no account other than this one has ever reported
    // anything about this village" (clear it — there's nothing that could
    // ever confirm it, so a waiting dot only implies detection is imminent
    // when it structurally can't be).
    function addSizeMarkers(entry, confirmedNearby, hasOtherReports) {
        const row = entry.td0 && entry.td0.closest('tr');
        const cell = row && row.querySelector(':scope > td.' + ADV_COL_CLASS);
        if (!cell) return;

        const hasLarge = !!(confirmedNearby && confirmedNearby.large);
        const hasMedium = !!(confirmedNearby && confirmedNearby.medium);
        if (!hasLarge && !hasMedium) {
            if (!hasOtherReports) clearCell(cell); // nothing else out there — don't imply this is still being tracked
            return; // otherwise: nothing confirmed nearby yet — leave the waiting dot as-is
        }

        clearCell(cell); // replace the waiting dot, not stack on top of it
        if (hasLarge) {
            const icon = makeSizeIcon(entry, MARKER_LARGE_CLASS, 'attack_large.webp', 'LARGE');
            if (icon) {
                wireLargeMarkerTagging(icon, entry);
                cell.appendChild(icon);
            }
        }
        if (hasMedium) {
            const icon = makeSizeIcon(entry, MARKER_MEDIUM_CLASS, 'attack_medium.webp', 'MEDIUM');
            if (icon) cell.appendChild(icon);
        }
    }

    async function advisoryTick(settings) {
        const table = document.getElementById('incomings_table');
        if (table) ensureAdvisoryColumn(table);

        const bySrc = new Map();
        for (const entry of parseRows()) {
            if (entry.size !== 'unknown') continue;
            addWaitingMarker(entry); // instant feedback, before the fetch even resolves
            if (!bySrc.has(entry.srcVillageId)) bySrc.set(entry.srcVillageId, []);
            bySrc.get(entry.srcVillageId).push(entry);
        }

        const cache = loadAdvisoryCache();
        let cacheDirty = false;

        for (const [srcVillageId, entries] of bySrc) {
            const qs = new URLSearchParams({
                world: String(pageWindow.game_data.world),
                srcVillageId: String(srcVillageId),
                windowHours: String(settings.windowHours),
                reporterId: String(reporterId),
            });
            let res;
            try {
                res = await fetch(`${baseUrl(settings)}/advisory?${qs.toString()}`, {
                    headers: { 'X-XBot-License': currentLicenseKey(settings) },
                });
            } catch (e) {
                setOnline(false); // actual network failure — genuinely unreachable
                if (cacheDirty) saveAdvisoryCache(cache);
                return;
            }
            noteResponse(res);
            setOnline(true); // reached the server, regardless of what it answered

            if (!res.ok) {
                // License rejected (or some other error) — nothing usable to
                // read; stop this pass without touching the cache for this village.
                if (cacheDirty) saveAdvisoryCache(cache);
                return;
            }
            const data = await res.json();
            const confirmedNearby = {
                large: !!(data.confirmedNearby && data.confirmedNearby.large),
                medium: !!(data.confirmedNearby && data.confirmedNearby.medium),
            };
            const hasOtherReports = !!data.hasOtherReports;
            cache[srcVillageId] = { confirmedNearby, hasOtherReports, checkedMs: Date.now() };
            cacheDirty = true;
            entries.forEach(e => addSizeMarkers(e, confirmedNearby, hasOtherReports));
        }

        if (cacheDirty) saveAdvisoryCache(cache);
    }

    // Renders whatever the local cache already knows, synchronously, with no
    // network round-trip — so keepTracking shows last-known advisories the
    // instant the page loads instead of waiting for a real sync to finish.
    // A real sync (if/when one runs) always supersedes this with live data.
    function renderCachedAdvisories(table) {
        ensureAdvisoryColumn(table);
        const cache = loadAdvisoryCache();
        const now = Date.now();

        for (const entry of parseRows()) {
            if (entry.size !== 'unknown') continue;
            const cached = cache[entry.srcVillageId];
            if (!cached || (now - cached.checkedMs) > ADVISORY_CACHE_STALE_MS) continue; // nothing usable — leave blank until a real sync runs
            if (cached.confirmedNearby && (cached.confirmedNearby.large || cached.confirmedNearby.medium)) {
                addSizeMarkers(entry, cached.confirmedNearby, cached.hasOtherReports);
            } else if (cached.hasOtherReports) {
                addWaitingMarker(entry); // checked before, inconclusive, but another account has data — still worth tracking
            } // else: no other account has ever reported this village — leave blank, nothing to wait on
        }
    }

    /* ── Ensure the "Todos" village group is selected ───────────────────────
       If some other group filter is active, the incomings table only shows
       that group's villages — a sync would silently miss everything else.
       Mirrors ensureGroupSelected() from microapoios_enhanced.user.js: the
       active group renders as <strong class="group-menu-item" data-group-id>,
       every other selectable one as a clickable <a class="group-menu-item"
       data-group-id>. Clicking the real element is what actually drives
       TribalWars' own client-side filtering (not the URL param alone), so
       it's asserted before every sync rather than trusted from the URL. ────*/

    const ALL_GROUP_ID = '0'; // TribalWars' own "todos" entry, data-group-type="all"

    function ensureAllGroupSelected(cb) {
        if (document.querySelector('strong.group-menu-item[data-group-id="' + ALL_GROUP_ID + '"]')) { cb(); return; }
        const link = document.querySelector('a.group-menu-item[data-group-id="' + ALL_GROUP_ID + '"]');
        if (!link) { cb(); return; } // group switcher not present on this page — proceed as-is
        link.click();
        let waited = 0;
        const maxWait = 4000, pollMs = 150;
        const poll = setInterval(() => {
            waited += pollMs;
            if (document.querySelector('strong.group-menu-item[data-group-id="' + ALL_GROUP_ID + '"]') || waited >= maxWait) {
                clearInterval(poll);
                cb();
            }
        }, pollMs);
    }

    /* ── Sync gating ─────────────────────────────────────────────────────────
       Nothing is sent or fetched just because the table changed. A sync pass
       (report whatever's currently visible + check advisories) only happens
       when the user explicitly asks for one (xbot:attackintel:syncNow) or,
       if they've opted into "automatic" mode, on a timer that can never run
       faster than MIN_AUTO_SYNC_MINUTES — enforced here, not just in the UI,
       so a hand-edited or buggy setting can't bypass it. ─────────────────────*/

    function runSync() {
        const settings = loadSettings();
        if (!settings.enabled) return;
        if (!document.getElementById('incomings_table')) return; // not on this page right now
        ensureAllGroupSelected(() => {
            scanAndReport(settings);
            checkResolved(settings);
            advisoryTick(settings);
        });
    }

    let autoTimer = null;
    let scheduledMode = null;
    let scheduledMinutes = null;

    function scheduleAuto() {
        const settings = loadSettings();
        const minutes = Math.max(MIN_AUTO_SYNC_MINUTES, Number(settings.autoSyncMinutes) || MIN_AUTO_SYNC_MINUTES);
        const mode = settings.enabled ? settings.syncMode : 'manual';

        // No change since the last check — leave the existing timer's phase
        // alone. Rebuilding it every recheck tick would mean it never fires.
        if (mode === scheduledMode && minutes === scheduledMinutes) return;

        scheduledMode = mode;
        scheduledMinutes = minutes;
        if (autoTimer) { clearInterval(autoTimer); autoTimer = null; }
        if (mode !== 'automatic') return;

        autoTimer = setInterval(runSync, minutes * 60_000);
    }

    document.addEventListener('xbot:attackintel:syncNow', runSync);

    /* ── Boot ────────────────────────────────────────────────────────────────*/

    function start(table) {
        const settings = loadSettings();
        // No network here — renders the column plus whatever the local
        // advisory cache already knows about currently-unknown rows, purely
        // from localStorage, so keepTracking shows last-known state the
        // instant the page loads instead of waiting on a sync to finish.
        if (settings.enabled && settings.keepTracking) renderCachedAdvisories(table);

        scheduleAuto();
        setInterval(scheduleAuto, SETTINGS_RECHECK_MS);
        if (settings.syncMode === 'automatic') runSync(); // don't wait a full interval for the first one
    }

    function whenTableReady(tries) {
        const table = document.getElementById('incomings_table');
        if (table) { start(table); return; }
        if ((tries || 0) < 100) setTimeout(() => whenTableReady((tries || 0) + 1), 100);
    }

    whenTableReady(0);
})();

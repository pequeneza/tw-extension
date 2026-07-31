// ==UserScript==
// @name         Desviador
// @namespace    tw_desviador
// @version      3.5.1
// @description  Desvio automático via place-screen tabs — isolados por cmdId
// @match        https://*.tribalwars.com.pt/game.php*
// ==/UserScript==

(function () {
    'use strict';

    if (window.__twDesviadorRunning) return;
    window.__twDesviadorRunning = true;

    const PENDING_PREFIX       = 'twDesviador_pending_';  /* per-cmdId pending state   */
    const SCHED_PREFIX         = 'twDesviador_sched_';    /* per-cmdId fire schedule   */
    const ACTIVE_KEY           = 'twDesviador_active';
    const CANCEL_SEC_KEY       = 'twDesviador_cancelSec';
    const ALERT_SEC_KEY        = 'twDesviador_alertSec';
    const TAB_CMD_KEY          = 'twDesviador_tabCmdId';  /* sessionStorage — per tab  */
    const HANDOFF_KEY          = 'twDesviador_pendingHandoff'; /* sessionStorage — one-shot cmdId carried into a freshly opened place tab */
    const HANDOFF_TTL_MS       = 30_000;
    const LAST_CANCEL_KEY      = 'twDesviador_lastCancel';/* cross-tab cancel signal   */
    const MUTE_KEY             = 'twDesviador_muteSound'; /* beep mute flag             */
    const ALL_COMMANDS_KEY     = 'twDesviador_allCommands';/* ignore [Desviar] filter   */
    const BLACKLIST_KEY        = 'twDesviador_blacklist'; /* comma-sep act-upon tags    */
    const WHITELIST_KEY        = 'twDesviador_whitelist'; /* comma-sep ignore tags      */
    const HISTORY_KEY          = 'twDesviador_history';  /* fired command log (last 50) */
    const POPUP_TIMEOUT_MS     = 6_000;  /* max wait for popup rows / support btn        */

    /* Per-profile multiplier (persisted once, same pattern as fingerprint-shield.ts's
       seed): without it, every xBot install shares the exact same base±spread
       ranges, which is a recognizable tool signature independent of the
       per-call Math.random() noise already applied below. */
    function getJitterMultiplier() {
        try {
            const existing = localStorage.getItem('xbot_jitter_mult_v1');
            if (existing) { const n = parseFloat(existing); if (!isNaN(n)) return n; }
        } catch (e) { /* ignore */ }
        const mult = 0.8 + Math.random() * 0.5; // 0.8x - 1.3x, stable per profile
        try { localStorage.setItem('xbot_jitter_mult_v1', String(mult)); } catch (e) { /* ignore */ }
        return mult;
    }
    const _jitterMult = getJitterMultiplier();

    /* Adds random jitter to fixed UI-automation delays so repeated runs (and
       different installs of this script) don't produce an identical, mechanically
       precise timing signature. Not used on the recall-trick's sentAt-derived math
       (doScheduleCancel's gap window), which needs ms-level fidelity to work. */
    function jitter(baseMs, spreadMs) {
        return Math.max(0, Math.round(baseMs * _jitterMult + (Math.random() * 2 - 1) * spreadMs * _jitterMult));
    }

    const params    = new URLSearchParams(window.location.search);
    const screenId  = params.get('screen');
    const mode      = params.get('mode');
    const subtype   = params.get('subtype');
    const tryParam  = params.get('try');
    const village   = params.get('village');
    const tParam    = params.get('t');

    const isIncomings = screenId === 'overview_villages' &&
                        mode     === 'incomings'          &&
                        subtype  === 'attacks';
    const isPlace   = screenId === 'place' && !tryParam;
    const isConfirm = screenId === 'place' && tryParam === 'confirm';

    /* ── helpers ─────────────────────────────────────────────────────────────*/

    function sitterPrefix() {
        return tParam ? `t=${tParam}&` : '';
    }

    function whenReady(cb) {
        let tries = 0;
        const poll = () => {
            if (typeof $ !== 'undefined' && typeof TribalWars !== 'undefined') { cb(); return; }
            if (++tries > 60) { console.error('[Desviador] whenReady: timeout após 9s'); return; }
            setTimeout(poll, 150);
        };
        poll();
    }

    /* Per-cmdId pending entries — each open tab only reads/writes its own key */
    function getPending(cmdId) {
        try { return JSON.parse(localStorage.getItem(PENDING_PREFIX + cmdId) || 'null'); }
        catch { return null; }
    }
    function setPending(data) {
        localStorage.setItem(PENDING_PREFIX + data.cmdId, JSON.stringify(data));
    }
    function clearPending(cmdId) {
        localStorage.removeItem(PENDING_PREFIX + cmdId);
    }

    function getHistory() {
        try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch { return []; }
    }
    function addHistory(entry) {
        const MAX_HIST  = 50;
        const EXPIRE_MS = 48 * 3_600_000;
        const now       = Date.now();
        const hist      = getHistory()
            .filter(h => now - h.firedAt < EXPIRE_MS)
            .slice(-(MAX_HIST - 1));
        hist.push(entry);
        localStorage.setItem(HISTORY_KEY, JSON.stringify(hist));
    }

    /* Bind this tab to its cmdId via sessionStorage.
     * sessionStorage persists across navigations within the same tab but is
     * never shared between tabs — so two concurrent tabs never collide.
     * A freshly opened place tab has no TAB_CMD_KEY of its own yet; it recovers
     * the cmdId from HANDOFF_KEY, which window.open() clones from the opener's
     * sessionStorage into the new tab (same-origin only). Consumed once. */
    function resolveTabCmdId() {
        let id = sessionStorage.getItem(TAB_CMD_KEY);
        if (!id) {
            try {
                const raw = sessionStorage.getItem(HANDOFF_KEY);
                if (raw) {
                    sessionStorage.removeItem(HANDOFF_KEY);
                    const { cmdId, ts } = JSON.parse(raw);
                    if (cmdId && Date.now() - ts < HANDOFF_TTL_MS) id = cmdId;
                }
            } catch (_) {}
            if (id) sessionStorage.setItem(TAB_CMD_KEY, id);
        }
        return id;
    }

    /* Opens the place tab for cmdId, unfocused + pinned. Hands the id off via
     * sessionStorage instead of a URL query param (never sent to the game
     * server) — window.open() clones this tab's sessionStorage into the new
     * one, so it must be set synchronously right before opening.
     * Unfocus/pin is done via the background service worker (through router.ts),
     * since chrome.tabs isn't reachable from page context. We wait for its ack
     * (xbot:tabs:armed) before calling window.open() — chrome.runtime.sendMessage
     * is async, so opening immediately after dispatching the arm request risks
     * creating the tab before the background has actually armed, silently
     * dropping the pin/unfocus. A short timeout fallback still opens the tab
     * (unpinned/focused) if the extension bridge doesn't respond in time. */
    function openPlaceTab(destVillage, cmdId) {
        try {
            sessionStorage.setItem(HANDOFF_KEY, JSON.stringify({ cmdId, ts: Date.now() }));
        } catch (_) {}

        let launched = false;
        function launch() {
            if (launched) return;
            launched = true;
            document.removeEventListener('xbot:tabs:armed', launch);
            window.open(`/game.php?${sitterPrefix()}village=${destVillage}&screen=place`, '_blank');
        }
        document.addEventListener('xbot:tabs:armed', launch);
        document.dispatchEvent(new CustomEvent('xbot:tabs:armNextTab'));
        setTimeout(launch, 200);
    }

    /* ── stale schedule cleanup on every page load ───────────────────────────*/

    /* Recovery used to re-fire any SCHED_PREFIX entry whose fireAt had passed by
     * treating it as a "missed" send and opening a tab for it. That misidentified
     * commands as missed too broadly (e.g. a backlog of stale entries all being
     * past-due at once), causing dozens of tabs/triggers to fire in a single burst.
     * We no longer attempt recovery — this just clears out stale/expired entries
     * so they don't keep accumulating in localStorage. */
    function recoverMissedFires() {
        const now = Date.now();
        for (let i = localStorage.length - 1; i >= 0; i--) {
            const key = localStorage.key(i);
            if (!key || !key.startsWith(SCHED_PREFIX)) continue;
            try {
                const d = JSON.parse(localStorage.getItem(key));
                if (!d || now > d.arrivalMs || now >= d.fireAt) localStorage.removeItem(key);
            } catch { localStorage.removeItem(key); }
        }
    }

    /* Only run recovery on pages that are NOT already a desviador place/confirm tab.
     * Place tabs are themselves the product of recovery; re-running here is redundant
     * and would attempt to open additional tabs from the same stale schedule entries. */
    if (!isPlace && !isConfirm) recoverMissedFires();

    /* =========================================================
       INCOMINGS PAGE
    ========================================================= */

    if (isIncomings) whenReady(initIncomings);

    function initIncomings() {
        const wasActive = localStorage.getItem(ACTIVE_KEY) === '1';
        const originalTitle = document.title;

        let active   = false;
        let tickerId = null;
        const scheduled        = new Set();
        const timers           = [];
        const alertTimers      = [];
        const scheduledDetails = new Map();

        /* Cross-tab cancel notification: the place tab writes LAST_CANCEL_KEY,
         * the storage event fires here (different tab), we forward it to React. */
        window.addEventListener('storage', e => {
            if (e.key === LAST_CANCEL_KEY && e.newValue) {
                try {
                    const d = JSON.parse(e.newValue);
                    document.dispatchEvent(new CustomEvent('xbot:desviador:canceled', { detail: d }));
                } catch {}
            }
        });

        function pad2(n) { return String(n).padStart(2, '0'); }

        function updateTitle() {
            if (!active) { document.title = originalTitle; return; }
            const now = Date.now();
            let next = Infinity;
            scheduledDetails.forEach(d => { if (!d.fired && d.fireAt > now) next = Math.min(next, d.fireAt - now); });
            if (next === Infinity) { document.title = originalTitle; return; }
            const total = Math.floor(next / 1000);
            document.title = `Desviador: ${pad2(Math.floor(total / 3600))}:${pad2(Math.floor((total % 3600) / 60))}:${pad2(total % 60)}`;
        }

        function dispatchState() {
            updateTitle();
            document.dispatchEvent(new CustomEvent('xbot:desviador:state', {
                detail: {
                    active,
                    scheduled: Array.from(scheduledDetails.values()),
                    notifPermission: Notification.permission,
                    muted: localStorage.getItem(MUTE_KEY) === '1',
                    allCommands: localStorage.getItem(ALL_COMMANDS_KEY) === '1',
                    blacklist: localStorage.getItem(BLACKLIST_KEY) ?? '[Desviar]',
                    whitelist: localStorage.getItem(WHITELIST_KEY) ?? '',
                },
            }));
        }

        document.addEventListener('xbot:desviador:cmd', e => {
            const type = e.detail?.type;
            if (type === 'start' && !active)   startMonitoring();
            else if (type === 'stop' && active) stopAll();
            else if (type === 'requestNotif')   Notification.requestPermission().then(dispatchState);
            else if (type === 'toggleMute') {
                localStorage.setItem(MUTE_KEY, localStorage.getItem(MUTE_KEY) === '1' ? '0' : '1');
                dispatchState();
            }
            else if (type === 'setAllCommands') {
                localStorage.setItem(ALL_COMMANDS_KEY, e.detail.value ? '1' : '0');
                dispatchState();
            }
            else if (type === 'setBlacklist') {
                localStorage.setItem(BLACKLIST_KEY, e.detail.value ?? '');
                dispatchState();
            }
            else if (type === 'setWhitelist') {
                localStorage.setItem(WHITELIST_KEY, e.detail.value ?? '');
                dispatchState();
            }
        });

        function playBeep() {
            if (localStorage.getItem(MUTE_KEY) === '1') return;
            try {
                const ctx  = new (window.AudioContext || window.webkitAudioContext)();
                const osc  = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.connect(gain); gain.connect(ctx.destination); osc.type = 'sine';
                [660, 880, 1100].forEach((f, i) => {
                    const t = ctx.currentTime + i * 0.18;
                    osc.frequency.setValueAtTime(f, t);
                    gain.gain.setValueAtTime(0.25, t);
                    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
                });
                osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.6);
            } catch {}
        }

        function fireAlert(label, villageName, secLeft) {
            playBeep();
            if (Notification.permission === 'granted') {
                new Notification('⚔️ Desviador — A enviar tropas!', {
                    body: `${label} (${villageName}) — em ~${secLeft}s`,
                    icon: '/graphic/icon/small_attacker.png',
                    tag: 'desviador-alert', requireInteraction: true,
                });
            }
        }

        function stopAll() {
            active = false;
            localStorage.removeItem(ACTIVE_KEY);
            timers.forEach(clearTimeout); timers.length = 0;
            alertTimers.forEach(clearTimeout); alertTimers.length = 0;
            for (let i = localStorage.length - 1; i >= 0; i--) {
                const k = localStorage.key(i);
                if (k && (k.startsWith(SCHED_PREFIX) || k.startsWith(PENDING_PREFIX)))
                    localStorage.removeItem(k);
            }
            scheduled.clear(); scheduledDetails.clear();
            if (tickerId) { clearInterval(tickerId); tickerId = null; }
            document.title = originalTitle;
            dispatchState();
        }

        function startMonitoring() {
            active = true;
            localStorage.setItem(ACTIVE_KEY, '1');
            if (!tickerId) tickerId = setInterval(dispatchState, 1000);
            if (Notification.permission === 'default') Notification.requestPermission().then(dispatchState);
            scanAndSchedule();
            dispatchState();
        }

        if (wasActive) startMonitoring();
        else dispatchState();

        function scanAndSchedule() {
            if (!active) return;

            const cancelSec      = parseInt(localStorage.getItem(CANCEL_SEC_KEY) || '300', 10);
            const cancelMs       = Math.min(cancelSec * 1000, 600_000);
            const alertSec       = parseInt(localStorage.getItem(ALERT_SEC_KEY)  || '60',  10);
            const allCommands    = localStorage.getItem(ALL_COMMANDS_KEY) === '1';
            const blacklist      = (localStorage.getItem(BLACKLIST_KEY) ?? '[Desviar]').split(',').map(t => t.trim()).filter(Boolean);
            const whitelist      = (localStorage.getItem(WHITELIST_KEY) ?? '').split(',').map(t => t.trim()).filter(Boolean);
            const BASE_OFFSET_MS = 35_000;

            const serverNowMs = (
                typeof game_data !== 'undefined' && game_data.time
                    ? game_data.time : Math.floor(Date.now() / 1000)
            ) * 1000;

            /* ── 1. Collect all unseen [Desviar] rows ── */
            const rawMatches = [];
            document.querySelectorAll('span.quickedit[data-id]').forEach(qeSpan => {
                const cmdId = qeSpan.getAttribute('data-id');
                if (scheduled.has(cmdId)) return;
                if (getPending(cmdId)) { scheduled.add(cmdId); return; }
                const row = qeSpan.closest('tr');
                if (!row) return;
                const labelEl = qeSpan.querySelector('.quickedit-label');
                if (!labelEl) return;
                const labelText = Array.from(labelEl.childNodes)
                    .filter(n => n.nodeType === Node.TEXT_NODE)
                    .map(n => n.textContent).join('').trim();
                if (whitelist.length > 0 && whitelist.some(tag => labelText.includes(tag))) return;
                if (!allCommands && !blacklist.some(tag => labelText.includes(tag))) return;

                const directTds = Array.from(row.querySelectorAll(':scope > td'));
                const arrivalTd = directTds[5];
                if (!arrivalTd) { console.warn(`[Desviador] ${cmdId}: 6ª coluna não encontrada`); return; }
                const msVal = parseInt(arrivalTd.querySelector('span.grey.small')?.textContent.trim() || '0', 10);
                const cellText = arrivalTd.textContent;
                // "amanhã às HH:MM:SS[:mmm]" — always tomorrow
                const amanhaMatch = cellText.match(/amanhã\s+(?:às\s*)?(\d{2}):(\d{2}):(\d{2})(?::(\d{1,3}))?/i);
                // "DD.MM. [às] HH:MM:SS[:mmm]" — explicit date
                const dateTimeMatch = !amanhaMatch && cellText.match(/(\d{1,2})\.(\d{1,2})\.\s*(?:às\s*)?(\d{2}):(\d{2}):(\d{2})(?::(\d{1,3}))?/);
                // "HH:MM:SS[:mmm]" — same day or next day (hoje / no prefix)
                const timeOnlyMatch = !amanhaMatch && !dateTimeMatch && cellText.match(/(\d{2}):(\d{2}):(\d{2})(?::(\d{1,3}))?/);
                if (!amanhaMatch && !dateTimeMatch && !timeOnlyMatch) { console.warn(`[Desviador] ${cmdId}: hora não reconhecida`); return; }

                let arrivalMs;
                if (amanhaMatch) {
                    const serverNow = new Date(serverNowMs);
                    const h = +amanhaMatch[1], m = +amanhaMatch[2], s = +amanhaMatch[3];
                    const ms = amanhaMatch[4] ? parseInt(amanhaMatch[4], 10) : msVal;
                    const tomorrow = new Date(serverNow.getFullYear(), serverNow.getMonth(), serverNow.getDate() + 1, h, m, s, ms);
                    arrivalMs = tomorrow.getTime();
                } else if (dateTimeMatch) {
                    const serverNow = new Date(serverNowMs);
                    const day = +dateTimeMatch[1], month = +dateTimeMatch[2] - 1;
                    const h = +dateTimeMatch[3], m = +dateTimeMatch[4], s = +dateTimeMatch[5];
                    const ms = dateTimeMatch[6] ? parseInt(dateTimeMatch[6], 10) : msVal;
                    const candidate = new Date(serverNow.getFullYear(), month, day, h, m, s, ms);
                    // Guard against year rollover (e.g. attack in Jan when today is Dec)
                    if (candidate.getTime() <= serverNowMs) candidate.setFullYear(candidate.getFullYear() + 1);
                    arrivalMs = candidate.getTime();
                } else {
                    const serverNow = new Date(serverNowMs);
                    const h = +timeOnlyMatch[1], m = +timeOnlyMatch[2], s = +timeOnlyMatch[3];
                    const ms = timeOnlyMatch[4] ? parseInt(timeOnlyMatch[4], 10) : msVal;
                    const arrival = new Date(serverNow.getFullYear(), serverNow.getMonth(), serverNow.getDate(), h, m, s, ms);
                    if (arrival.getTime() <= serverNowMs) arrival.setDate(arrival.getDate() + 1);
                    arrivalMs = arrival.getTime();
                }

                const villageTd = row.querySelector('td.incoming_from') || directTds[1];
                if (!villageTd) return;
                const td2Link = villageTd.querySelector('a[href*="village="]');
                if (!td2Link) return;
                const vmatch = (td2Link.getAttribute('href') || '').match(/village=(\d+)/);
                if (!vmatch) return;

                rawMatches.push({
                    cmdId, labelText,
                    villageName: td2Link.textContent.trim(),
                    destVillage: vmatch[1],
                    arrivalMs, row,
                });
            });

            /* ── 2. Group by destVillage — deduplicate within cancel windows ──
             *
             * Multiple attacks hitting the same village within one cancel window
             * only need ONE support (troops are already gone when they all land).
             * This check groups raw matches BEFORE adding to scheduledDetails so
             * same-batch duplicates are caught — not just entries from prior scans. */
            const newEntries = [];
            const byDest = new Map();
            for (const e of rawMatches) {
                if (!byDest.has(e.destVillage)) byDest.set(e.destVillage, []);
                byDest.get(e.destVillage).push(e);
            }

            for (const [, entries] of byDest) {
                entries.sort((a, b) => a.arrivalMs - b.arrivalMs);
                entries.forEach(e => scheduled.add(e.cmdId)); /* mark all seen */

                let windowEnd = -Infinity;
                for (const e of entries) {
                    const existingCover = Array.from(scheduledDetails.values()).some(d =>
                        d.destVillage === e.destVillage && (d.fireAt + cancelMs) > e.arrivalMs
                    );
                    if (existingCover) {
                        console.log(`[Desviador] ${e.cmdId} coberto por apoio existente — ignorado.`);
                        continue;
                    }
                    if (e.arrivalMs <= windowEnd) {
                        console.log(`[Desviador] ${e.cmdId} coberto na mesma vaga — ignorado.`);
                        continue;
                    }
                    newEntries.push({ ...e, cancelMs });
                    /* Window end = when this support cancels = fireAt + cancelMs */
                    windowEnd = (e.arrivalMs - BASE_OFFSET_MS) + cancelMs;
                }
            }

            if (newEntries.length) {
                /* ── 3. Assign fireAt: 35–40 s before arrival ── */
                newEntries.forEach(e => {
                    e.fireAt = e.arrivalMs - BASE_OFFSET_MS - Math.random() * 5_000;
                    e._naturalFireAt = e.fireAt;
                });

                /* ── 4. Rate-limit: max 5 popup windows per 45 s ─────────────────────
                 * Sort entries by natural fire time DESCENDING — latest entries keep
                 * their natural time; earlier entries are pulled BACK (earlier) when
                 * the window is full. For each entry, count already-assigned fires in
                 * [t, t + 45 s). If ≥ MAX_PER_WINDOW, pull t back by one full window
                 * and extend cancelMs by the same amount so the cancel still fires
                 * after the attack arrives. Existing scheduled-but-not-yet-fired
                 * entries from this session seed the assigned list. */
                const RATE_WINDOW_MS   = 45_000;
                const MAX_PER_WINDOW   = 8;
                const CANCEL_SAFETY_MS = 30_000;  /* must fire ≥ 30 s before arrival */
                const now2 = Date.now();

                const assignedFires = Array.from(scheduledDetails.values())
                    .filter(d => !d.fired && d.fireAt > now2)
                    .map(d => d.fireAt);

                newEntries.sort((a, b) => b._naturalFireAt - a._naturalFireAt);
                const windowCounts = new Map(); /* window base time → entries placed so far */

                for (const e of newEntries) {
                    let t = e._naturalFireAt;

                    /* Walk backward through windows until a slot is available */
                    let inWindow = assignedFires.filter(at => at >= t && at < t + RATE_WINDOW_MS);
                    while (inWindow.length >= MAX_PER_WINDOW) {
                        t = Math.min(...inWindow) - RATE_WINDOW_MS;
                        inWindow = assignedFires.filter(at => at >= t && at < t + RATE_WINDOW_MS);
                    }

                    /* Spread entries within the window 1 s apart */
                    const slotIndex = windowCounts.get(t) || 0;
                    const fireAt    = t + slotIndex * 1_000;
                    windowCounts.set(t, slotIndex + 1);

                    const pullBack  = e._naturalFireAt - fireAt;
                    e.fireAt    = fireAt;
                    e.cancelMs += Math.max(0, pullBack);   /* extend if pulled back */

                    assignedFires.push(fireAt);
                }

                /* ── 4c. Drop entries where rate-limiting pushed fireAt too close to arrival ──
                 * Entry must fire at least 30 s before arrival so the popup has time to
                 * fill and submit the command. */
                for (let i = newEntries.length - 1; i >= 0; i--) {
                    if (newEntries[i].fireAt >= newEntries[i].arrivalMs - CANCEL_SAFETY_MS) {
                        scheduled.add(newEntries[i].cmdId);
                        console.warn(`[Desviador] ${newEntries[i].cmdId}: janela inatingível após rate-limit — ignorado.`);
                        newEntries.splice(i, 1);
                    }
                }

                /* ── 5. Schedule timers ── */
                newEntries.forEach(e => {
                    const { cmdId, labelText, villageName, destVillage, arrivalMs, cancelMs, fireAt, row } = e;
                    const delay = fireAt - Date.now();
                    const td1   = row.querySelector('td:nth-child(1)');

                    scheduledDetails.set(cmdId, {
                        cmdId, label: labelText, villageName, destVillage, arrivalMs, fireAt, fired: false,
                    });
                    localStorage.setItem(SCHED_PREFIX + cmdId, JSON.stringify({
                        cmdId, village: destVillage, cancelMs, arrivalMs, fireAt,
                    }));

                    if (td1) td1.style.outline = '2px solid #22c55e';

                    if (delay <= 0) {
                        if (getPending(cmdId)) {
                            const detail = scheduledDetails.get(cmdId);
                            if (detail) detail.fired = true;
                            return;
                        }
                        console.warn(`[Desviador] ${cmdId}: tempo insuficiente — a abrir imediatamente.`);
                        const detail = scheduledDetails.get(cmdId);
                        if (detail) detail.fired = true;
                        localStorage.removeItem(SCHED_PREFIX + cmdId);
                        addHistory({ cmdId, label: labelText, villageName, village: destVillage, arrivalMs, firedAt: Date.now() });
                        setPending({ phase: 'send', village: destVillage, cancelMs, cmdId });
                        openPlaceTab(destVillage, cmdId);
                        return;
                    }

                    const alertDelay = delay - alertSec * 1000;
                    if (alertDelay > 0) {
                        alertTimers.push(setTimeout(() => {
                            if (active) fireAlert(labelText, villageName, alertSec);
                        }, alertDelay));
                    }

                    timers.push(setTimeout(() => {
                        if (!active) return;
                        if (getPending(cmdId)) return; /* another tab already claimed this cmdId */
                        const detail = scheduledDetails.get(cmdId);
                        if (detail) detail.fired = true;
                        localStorage.removeItem(SCHED_PREFIX + cmdId);
                        if (td1) td1.style.outline = '2px solid #d97706';
                        addHistory({ cmdId, label: labelText, villageName, village: destVillage, arrivalMs, firedAt: Date.now() });
                        setPending({ phase: 'send', village: destVillage, cancelMs, cmdId });
                        openPlaceTab(destVillage, cmdId);
                        dispatchState();
                    }, delay));

                    console.log(`[Desviador] ${cmdId} → ${destVillage} em ${Math.round(delay / 1000)}s`);
                });
            }

            dispatchState();
            timers.push(setTimeout(scanAndSchedule, jitter(15_000, 3_000)));
        }
    }

    /* =========================================================
       PLACE PAGE  (send phase OR cancel phase)
    ========================================================= */

    if (isPlace) whenReady(handlePlace);

    function handlePlace() {
        const cmdId = resolveTabCmdId();
        if (!cmdId) return;
        const p = getPending(cmdId);
        if (!p) return;
        if (p.phase === 'send')   doSendSupport(p);
        if (p.phase === 'cancel') doScheduleCancel(p);
    }

    function findDesviarTemplate() {
        return Array.from(document.querySelectorAll('a.troop_template_selector'))
            .find(a => a.textContent.trim() === 'Desviar');
    }

    function doSendSupport(p) {
        const template = findDesviarTemplate();
        if (!template) {
            console.error('[Desviador] Template "Desviar" não encontrado. A abortar.');
            clearPending(p.cmdId);
            return;
        }
        template.click();
        /* Skip "Anterior" — it almost always picks the current village (invalid support
         * target) which leaves a stale "Alvo inválido" message on the page.
         * Go straight to the own-villages popup and iterate until one works. */
        setTimeout(() => {
            const errBox = document.querySelector('.error_box .content');
            if (errBox && /unidades suficientes|sem unidades/i.test(errBox.textContent || '')) {
                console.warn('[Desviador] Sem unidades para desviar — a fechar.');
                clearPending(p.cmdId);
                window.close();
                return;
            }
            tryOwnVillage(p, new Set());
        }, 600);
    }

    function tryOwnVillage(p, tried) {
        const myX = parseInt((typeof game_data !== 'undefined' && game_data.village?.x) ?? '-1', 10);
        const myY = parseInt((typeof game_data !== 'undefined' && game_data.village?.y) ?? '-1', 10);

        function getAvailableRows() {
            const rows = Array.from(document.querySelectorAll(
                '.popup_helper a[href^="javascript:selectTarget"]'
            )).filter(a => {
                const m = (a.getAttribute('href') || '').match(/selectTarget\((\d+),\s*(\d+)/);
                if (!m) return false;
                const x = parseInt(m[1], 10), y = parseInt(m[2], 10);
                if (x === myX && y === myY) return false;   /* own current village */
                if (tried.has(`${x},${y}`))  return false;   /* already tried */
                return true;
            });
            /* Sort by squared distance from the attacked village — pick closest first */
            rows.sort((a, b) => {
                const ma = (a.getAttribute('href') || '').match(/selectTarget\((\d+),\s*(\d+)/);
                const mb = (b.getAttribute('href') || '').match(/selectTarget\((\d+),\s*(\d+)/);
                if (!ma || !mb) return 0;
                const da = (parseInt(ma[1], 10) - myX) ** 2 + (parseInt(ma[2], 10) - myY) ** 2;
                const db = (parseInt(mb[1], 10) - myX) ** 2 + (parseInt(mb[2], 10) - myY) ** 2;
                return da - db;
            });
            return rows;
        }

        /* Reuse already-loaded popup rows if the popup is still open — avoids an
         * extra AJAX request on every "Alvo inválido" retry. Only re-click the link
         * if the popup is empty or closed. */
        const existingRows = getAvailableRows();
        if (existingRows.length > 0) {
            proceedWithTarget(existingRows[0], p, tried);
            return;
        }

        const popupLink = document.querySelector('a[onclick*="ajax=own"]');
        if (!popupLink) {
            console.error('[Desviador] Link "As suas aldeias" não encontrado. A abortar.');
            clearPending(p.cmdId);
            return;
        }
        popupLink.click();

        const start = Date.now();
        const waitRows = () => {
            const rows = getAvailableRows();
            if (rows.length === 0) {
                if (Date.now() - start > POPUP_TIMEOUT_MS) {
                    console.error('[Desviador] Nenhum alvo disponível. A abortar.');
                    clearPending(p.cmdId);
                    return;
                }
                setTimeout(waitRows, 200);
                return;
            }
            proceedWithTarget(rows[0], p, tried);
        };
        setTimeout(waitRows, jitter(300, 80));
    }

    function proceedWithTarget(pick, p, tried) {
        const m     = (pick.getAttribute('href') || '').match(/selectTarget\((\d+),\s*(\d+)/);
        const coord = m ? `${parseInt(m[1], 10)},${parseInt(m[2], 10)}` : null;
        pick.click();

        let _lastTmplClick = 0;
        setTimeout(() => {
            /* Re-apply template after target change so troop fields stay populated */
            const tmpl = findDesviarTemplate();
            if (tmpl) { tmpl.click(); _lastTmplClick = Date.now(); }

            /* Poll for the support button.
             * Only check "Alvo inválido" after a 500 ms grace period — the stale
             * error from any previous attempt would still be on the page otherwise. */
            const pollStart = Date.now();
            const poll = () => {
                const btn = document.querySelector('#target_support');
                if (btn && btn.offsetParent !== null && !btn.disabled) {
                    setPending({ ...p, phase: 'confirm' });
                    btn.click();
                    return;
                }
                const elapsed = Date.now() - pollStart;
                if (elapsed > 500 && /alvo inv[aá]lido/i.test(document.body?.innerText || '')) {
                    console.warn(`[Desviador] ${coord} inválido — a tentar próximo.`);
                    const next = new Set(tried);
                    if (coord) next.add(coord);
                    tryOwnVillage(p, next);
                    return;
                }
                if (elapsed > 500 && document.querySelector('.error_box')) {
                    const errText = document.querySelector('.error_box .content')?.textContent || '';
                    if (/unidades suficientes|sem unidades/i.test(errText)) {
                        console.warn('[Desviador] Sem unidades para desviar — a fechar.');
                        clearPending(p.cmdId);
                        window.close();
                        return;
                    }
                }
                if (elapsed > POPUP_TIMEOUT_MS) {
                    console.error('[Desviador] Timeout a aguardar botão de apoio. A abortar.');
                    clearPending(p.cmdId);
                    return;
                }
                /* Retry template click every 600 ms in case the AJAX update cleared it */
                if (Date.now() - _lastTmplClick > 600) {
                    const tmpl2 = findDesviarTemplate();
                    if (tmpl2) { tmpl2.click(); _lastTmplClick = Date.now(); }
                }
                setTimeout(poll, 200);
            };
            setTimeout(poll, 200);
        }, jitter(1200, 250));
    }

    function doScheduleCancel(p) {
        const elapsed  = Date.now() - (p.sentAt || 0);
        if (elapsed > p.cancelMs + 30_000) {
            console.warn('[Desviador] Janela de cancelamento expirada. A fechar.');
            clearPending(p.cmdId);
            setTimeout(() => { try { window.close(); } catch {} }, 1000);
            return;
        }
        // Recall trick: TW uses return = sentAt + 2*cancelMs (cancelMs in whole seconds).
        // So return%1000 = sentAt%1000. Check sentAt ms against gap ms window.
        var _retrying = false;
        if (p.gapAfterMs && p.gapBeforeMs && p.sentAt) {
            var _sentMs  = p.sentAt % 1000;
            var _gapMsLo = p.gapAfterMs  % 1000;
            var _gapMsHi = p.gapBeforeMs % 1000;
            var _msOk = (_gapMsLo < _gapMsHi)
                ? (_sentMs > _gapMsLo && _sentMs < _gapMsHi)
                : (_sentMs > _gapMsLo || _sentMs < _gapMsHi);
            if (!_msOk) {
                console.warn('[Desviador] Recall: sentAt ms=' + _sentMs + ' fora da janela [' + _gapMsLo + '-' + _gapMsHi + ']. Cancelar e tentar novamente.');
                _retrying = true;
            }
        }
        const remaining = _retrying ? 2000 : Math.max(p.cancelMs - elapsed, 2000);
        const cancelAt  = Date.now() + remaining;
        console.log(`[Desviador] Cancelar em ${Math.round(remaining / 1000)}s`);

        // Rename the outgoing command via TW AJAX label endpoint (with retries)
        if (p.note && !_retrying) {
            var _renamed = false;
            var _tryRename = function(attempt) {
                if (_renamed) return;
                var links = Array.from(document.querySelectorAll('a.command-cancel[data-home]'))
                    .filter(function(a) { return a.getAttribute('data-home') === p.village; });
                if (!links.length) {
                    if (attempt < 8) setTimeout(function() { _tryRename(attempt + 1); }, 1000);
                    else console.warn('[Desviador] Comando não encontrado para renomear após ' + attempt + ' tentativas.');
                    return;
                }
                var link = links[0];
                var row  = link.closest('tr');
                // Try multiple sources for the command ID
                var href = link.getAttribute('href') || '';
                var idM  = href.match(/[?&]id=(\d+)/);
                var cmdId = (idM && idM[1])
                    || link.getAttribute('data-command')
                    || link.getAttribute('data-id')
                    || (row && (row.querySelector('span.quickedit[data-id]') || {getAttribute: function(){return null;}}).getAttribute('data-id'))
                    || null;
                if (!cmdId) {
                    console.warn('[Desviador] ID do comando não encontrado (href=' + href.slice(0,80) + ')');
                    return;
                }
                var csrf = (typeof game_data !== 'undefined' && game_data.csrf) ? game_data.csrf : null;
                if (!csrf || typeof $ === 'undefined') return;
                _renamed = true;
                $.post('/game.php?' + sitterPrefix() + 'village=' + p.village + '&screen=place&ajax=label_unit', {
                    id:   cmdId,
                    name: p.note,
                    h:    csrf,
                }).done(function() {
                    console.log('[Desviador] Renomeado cmd=' + cmdId + ' → "' + p.note + '"');
                }).fail(function(xhr) {
                    console.warn('[Desviador] Falha ao renomear cmd=' + cmdId + ' status=' + xhr.status);
                    _renamed = false; // allow retry
                });
            };
            setTimeout(function() { _tryRename(0); }, 2000);
        }

        /* ── Blur overlay ── */
        const backdrop = document.createElement('div');
        backdrop.style.cssText = [
            'position:fixed;inset:0;z-index:999998;',
            'backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);',
            'background:rgba(5,8,20,0.55);',
        ].join('');

        const dialog = document.createElement('div');
        dialog.style.cssText = [
            'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:999999;',
            'width:380px;',
            'background:linear-gradient(160deg,#0d1525 0%,#0a1020 100%);',
            'border:1px solid rgba(180,130,40,0.45);border-radius:16px;',
            'padding:22px 32px 20px;font-family:"Trebuchet MS",sans-serif;',
            'color:#e8d9b0;text-align:center;',
            'box-shadow:0 20px 60px rgba(0,0,0,0.85),inset 0 1px 0 rgba(255,220,120,0.08);',
            'user-select:none;',
        ].join('');

        const titleEl = document.createElement('div');
        titleEl.style.cssText = 'font-size:13px;letter-spacing:0.08em;color:#a89060;margin-bottom:6px;text-transform:uppercase;';
        titleEl.textContent = '🔀 Desviador — Aguardando cancelamento';

        const villageEl = document.createElement('div');
        villageEl.style.cssText = 'font-size:12px;color:#7a8fa6;margin-bottom:16px;';
        villageEl.textContent = `Aldeia ${p.village}`;

        const timerWrap = document.createElement('div');
        timerWrap.style.cssText = 'width:280px;margin:0 auto;';

        const timerEl = document.createElement('div');
        timerEl.style.cssText = [
            'font-size:38px;font-weight:700;font-family:monospace;',
            'font-variant-numeric:tabular-nums;letter-spacing:0.04em;',
            'transition:color 0.3s,text-shadow 0.3s;',
        ].join('');

        timerWrap.appendChild(timerEl);
        dialog.appendChild(titleEl);
        dialog.appendChild(villageEl);
        dialog.appendChild(timerWrap);
        document.body.appendChild(backdrop);
        document.body.appendChild(dialog);

        function fmtCd(ms) {
            if (ms <= 0) return '00:00:00';
            const total = Math.floor(ms / 1000);
            const h = Math.floor(total / 3600);
            const m = Math.floor((total % 3600) / 60);
            const s = total % 60;
            return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
        }

        let tickId = null;
        let cancelled = false;

        function executCancel() {
            if (cancelled) return;
            cancelled = true;
            if (tickId) { clearInterval(tickId); tickId = null; }
            backdrop.remove();
            dialog.remove();

            const cancelLinks = Array.from(
                document.querySelectorAll('a.command-cancel[data-home]')
            ).filter(a => a.getAttribute('data-home') === p.village);

            if (cancelLinks.length === 0) {
                const reloadCount = (p.reloadCount || 0) + 1;
                if (reloadCount >= 3) {
                    console.error('[Desviador] Falha ao cancelar após 3 tentativas. A desistir.');
                    clearPending(p.cmdId);
                    setTimeout(() => { try { window.close(); } catch {} }, 1000);
                    return;
                }
                console.warn(`[Desviador] Sem links de cancelamento visíveis — a recarregar (tentativa ${reloadCount}/3).`);
                setPending({ ...p, reloadCount });
                location.reload();
                return;
            }

            cancelLinks[0].click();
            clearPending(p.cmdId);
            document.title = '✓ Cancelado — Desviador';
            console.log('[Desviador] Apoio cancelado.');

            localStorage.setItem(LAST_CANCEL_KEY, JSON.stringify({
                village: p.village, ts: Date.now(),
            }));

            // Recall retry: ms was off, re-queue immediately (send again now)
            if (_retrying && p.retryEntry && typeof window.xbot_addToQueue === 'function') {
                var _gapMid = Math.floor(((p.gapAfterMs || 0) + (p.gapBeforeMs || 0)) / 2);
                var _retryLaunch = Date.now() + 3000; // send ASAP after 3s
                // cancelMs must be whole seconds so TW return ms = sentAt ms
                var _newCancelMs = Math.round((_gapMid - _retryLaunch) / 2 / 1000) * 1000;
                if (_gapMid > Date.now() + 5000 && _newCancelMs > 2000) {
                    window.xbot_addToQueue(Object.assign({}, p.retryEntry, {
                        launch: _retryLaunch,
                        arrival: _gapMid,
                        cancelAfterMs: _newCancelMs,
                        status: undefined,
                        createdAt: undefined,
                    }));
                    console.log('[Desviador] Recall re-agendado (cancelar em ' + Math.round(_newCancelMs / 1000) + 's)');
                } else {
                    console.warn('[Desviador] Recall: janela já passou — sem retry.');
                }
            }

            setTimeout(() => { try { window.close(); } catch {} }, 3000);
        }

        function render() {
            const left = cancelAt - Date.now();
            if (left <= 0) { executCancel(); return; }

            document.title = '⛔ NÃO FECHAR — ' + fmtCd(left);
            timerEl.textContent = fmtCd(left);
            if (left >= 60_000) {
                timerEl.style.color = '#d4a84b';
                timerEl.style.textShadow = '0 0 24px rgba(212,168,75,0.35)';
            } else if (left >= 10_000) {
                timerEl.style.color = '#e07b28';
                timerEl.style.textShadow = '0 0 24px rgba(224,123,40,0.4)';
            } else {
                timerEl.style.color = '#cc3333';
                timerEl.style.textShadow = '0 0 24px rgba(204,51,51,0.5)';
            }
        }

        render();
        tickId = setInterval(render, 50);
    }

    /* =========================================================
       CONFIRM PAGE  (screen=place&try=confirm)
    ========================================================= */

    if (isConfirm) whenReady(handleConfirm);

    function handleConfirm() {
        const cmdId = resolveTabCmdId();
        if (!cmdId) return;
        const p = getPending(cmdId);
        if (!p || p.phase !== 'confirm') return;

        const errBox = document.querySelector('.error_box .content');
        if (errBox && /unidades suficientes|sem unidades/i.test(errBox.textContent || '')) {
            console.warn('[Desviador] Sem unidades para desviar (confirm) — a fechar.');
            clearPending(p.cmdId);
            window.close();
            return;
        }

        const btn = document.querySelector('#troop_confirm_submit');
        if (!btn) {
            console.error('[Desviador] Botão de confirmação não encontrado. A abortar.');
            clearPending(p.cmdId);
            return;
        }

        /* sentAt must match the real click instant — doScheduleCancel's recall-trick
           math uses sentAt%1000 for ms-level gap alignment, so it's captured inside
           the callback (after jitter), not before it. */
        setTimeout(() => {
            btn.click();
            setPending({ ...p, phase: 'cancel', sentAt: Date.now() });
        }, jitter(400, 100));
    }

})();

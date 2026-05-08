// ==UserScript==
// @name         Desviador
// @namespace    tw_desviador
// @version      3.0.0
// @description  Desvio automático via place-screen tabs — isolados por cmdId
// @match        https://*.tribalwars.com.pt/game.php*
// ==/UserScript==

(function () {
    'use strict';

    if (window.__twDesviadorRunning) return;
    window.__twDesviadorRunning = true;

    const PENDING_PREFIX  = 'twDesviador_pending_';  /* per-cmdId pending state   */
    const SCHED_PREFIX    = 'twDesviador_sched_';    /* per-cmdId fire schedule   */
    const ACTIVE_KEY      = 'twDesviador_active';
    const CANCEL_SEC_KEY  = 'twDesviador_cancelSec';
    const ALERT_SEC_KEY   = 'twDesviador_alertSec';
    const TAB_CMD_KEY     = 'twDesviador_tabCmdId';  /* sessionStorage — per tab  */
    const LAST_CANCEL_KEY = 'twDesviador_lastCancel';/* cross-tab cancel signal   */

    const params    = new URLSearchParams(window.location.search);
    const screenId  = params.get('screen');
    const mode      = params.get('mode');
    const subtype   = params.get('subtype');
    const tryParam  = params.get('try');
    const village   = params.get('village');
    const desvCmdId = params.get('__desv');

    const isIncomings = screenId === 'overview_villages' &&
                        mode     === 'incomings'          &&
                        subtype  === 'attacks';
    const isPlace   = screenId === 'place' && !tryParam;
    const isConfirm = screenId === 'place' && tryParam === 'confirm';

    /* ── helpers ─────────────────────────────────────────────────────────────*/

    function whenReady(cb) {
        if (typeof $ !== 'undefined' && typeof TribalWars !== 'undefined') cb();
        else setTimeout(() => whenReady(cb), 150);
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

    /* Bind this tab to its cmdId via sessionStorage.
     * sessionStorage persists across navigations within the same tab but is
     * never shared between tabs — so two concurrent tabs never collide. */
    function resolveTabCmdId() {
        let id = sessionStorage.getItem(TAB_CMD_KEY);
        if (!id && desvCmdId) {
            id = desvCmdId;
            sessionStorage.setItem(TAB_CMD_KEY, id);
        }
        return id;
    }

    /* ── recovery on every page load ─────────────────────────────────────────*/

    function recoverMissedFires() {
        const now = Date.now();
        for (let i = localStorage.length - 1; i >= 0; i--) {
            const key = localStorage.key(i);
            if (!key || !key.startsWith(SCHED_PREFIX)) continue;
            try {
                const d = JSON.parse(localStorage.getItem(key));
                if (!d) { localStorage.removeItem(key); continue; }
                if (now > d.arrivalMs) { localStorage.removeItem(key); continue; }
                if (now >= d.fireAt) {
                    localStorage.removeItem(key); /* claim — prevents duplicate tabs */
                    setPending({ phase: 'send', village: d.village, cancelMs: d.cancelMs, cmdId: d.cmdId });
                    window.open(`/game.php?village=${d.village}&screen=place&__desv=${d.cmdId}`, '_blank');
                }
            } catch { localStorage.removeItem(key); }
        }
    }

    recoverMissedFires();

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
                detail: { active, scheduled: Array.from(scheduledDetails.values()), notifPermission: Notification.permission },
            }));
        }

        document.addEventListener('xbot:desviador:cmd', e => {
            const type = e.detail?.type;
            if (type === 'start' && !active)   startMonitoring();
            else if (type === 'stop' && active) stopAll();
            else if (type === 'requestNotif')   Notification.requestPermission().then(dispatchState);
        });

        function playBeep() {
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
            scheduled.forEach(id => localStorage.removeItem(SCHED_PREFIX + id));
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
            const cancelMs       = cancelSec * 1000;
            const alertSec       = parseInt(localStorage.getItem(ALERT_SEC_KEY)  || '60',  10);
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
                const row = qeSpan.closest('tr');
                if (!row) return;
                const labelEl = qeSpan.querySelector('.quickedit-label');
                if (!labelEl) return;
                const labelText = Array.from(labelEl.childNodes)
                    .filter(n => n.nodeType === Node.TEXT_NODE)
                    .map(n => n.textContent).join('').trim();
                if (!labelText.includes('[Desviar]')) return;

                const directTds = Array.from(row.querySelectorAll(':scope > td'));
                const arrivalTd = directTds[5];
                if (!arrivalTd) { console.warn(`[Desviador] ${cmdId}: 6ª coluna não encontrada`); return; }
                const msVal = parseInt(arrivalTd.querySelector('span.grey.small')?.textContent.trim() || '0', 10);
                const cellText = arrivalTd.textContent;
                // Try to match "DD.MM. [às] HH:MM:SS" first — present when arrival is not today
                const dateTimeMatch = cellText.match(/(\d{1,2})\.(\d{1,2})\.\s*(?:às\s*)?(\d{2}):(\d{2}):(\d{2})/);
                const timeOnlyMatch = !dateTimeMatch && cellText.match(/(\d{2}):(\d{2}):(\d{2})/);
                if (!dateTimeMatch && !timeOnlyMatch) { console.warn(`[Desviador] ${cmdId}: hora não reconhecida`); return; }

                let arrivalMs;
                if (dateTimeMatch) {
                    const serverNow = new Date(serverNowMs);
                    const day = +dateTimeMatch[1], month = +dateTimeMatch[2] - 1;
                    const h = +dateTimeMatch[3], m = +dateTimeMatch[4], s = +dateTimeMatch[5];
                    const candidate = new Date(serverNow.getFullYear(), month, day, h, m, s, msVal);
                    // Guard against year rollover (e.g. attack in Jan when today is Dec)
                    if (candidate.getTime() <= serverNowMs) candidate.setFullYear(candidate.getFullYear() + 1);
                    arrivalMs = candidate.getTime();
                } else {
                    const arrival = new Date(serverNowMs);
                    arrival.setHours(+timeOnlyMatch[1], +timeOnlyMatch[2], +timeOnlyMatch[3], msVal);
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
                });

                /* ── 4. Stagger simultaneous fires ──────────────────────────
                 * Sort ascending by fireAt; walk backwards so each entry fires
                 * at least STAGGER_MS before the one after it.
                 * The latest keeps its natural time; earlier ones are pushed back. */
                const STAGGER_MS = 20_000;
                newEntries.sort((a, b) => a.fireAt - b.fireAt);
                for (let i = newEntries.length - 2; i >= 0; i--) {
                    const max = newEntries[i + 1].fireAt - STAGGER_MS;
                    if (newEntries[i].fireAt > max) newEntries[i].fireAt = max;
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
                        console.warn(`[Desviador] ${cmdId}: tempo insuficiente — a abrir imediatamente.`);
                        const detail = scheduledDetails.get(cmdId);
                        if (detail) detail.fired = true;
                        localStorage.removeItem(SCHED_PREFIX + cmdId);
                        setPending({ phase: 'send', village: destVillage, cancelMs, cmdId });
                        window.open(`/game.php?village=${destVillage}&screen=place&__desv=${cmdId}`, '_blank');
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
                        const detail = scheduledDetails.get(cmdId);
                        if (detail) detail.fired = true;
                        localStorage.removeItem(SCHED_PREFIX + cmdId);
                        if (td1) td1.style.outline = '2px solid #d97706';
                        setPending({ phase: 'send', village: destVillage, cancelMs, cmdId });
                        window.open(`/game.php?village=${destVillage}&screen=place&__desv=${cmdId}`, '_blank');
                        dispatchState();
                    }, delay));

                    console.log(`[Desviador] ${cmdId} → ${destVillage} em ${Math.round(delay / 1000)}s`);
                });
            }

            dispatchState();
            timers.push(setTimeout(scanAndSchedule, 15_000));
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

    function doSendSupport(p) {
        const template = Array.from(document.querySelectorAll('a.troop_template_selector'))
            .find(a => a.textContent.trim() === 'Desviar');
        if (!template) {
            console.error('[Desviador] Template "Desviar" não encontrado. A abortar.');
            clearPending(p.cmdId);
            return;
        }
        template.click();
        /* Skip "Anterior" — it almost always picks the current village (invalid support
         * target) which leaves a stale "Alvo inválido" message on the page.
         * Go straight to the own-villages popup and iterate until one works. */
        setTimeout(() => tryOwnVillage(p, new Set()), 600);
    }

    function tryOwnVillage(p, tried) {
        const popupLink = document.querySelector('a[onclick*="ajax=own"]');
        if (!popupLink) {
            console.error('[Desviador] Link "As suas aldeias" não encontrado. A abortar.');
            clearPending(p.cmdId);
            return;
        }
        popupLink.click();

        const myX = parseInt((typeof game_data !== 'undefined' && game_data.village?.x) ?? '-1', 10);
        const myY = parseInt((typeof game_data !== 'undefined' && game_data.village?.y) ?? '-1', 10);

        const start = Date.now();
        const waitRows = () => {
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

            if (rows.length === 0) {
                if (Date.now() - start > 6000) {
                    console.error('[Desviador] Nenhum alvo disponível. A abortar.');
                    clearPending(p.cmdId);
                    return;
                }
                setTimeout(waitRows, 200);
                return;
            }

            const pick = rows[0];
            const m    = (pick.getAttribute('href') || '').match(/selectTarget\((\d+),\s*(\d+)/);
            const coord = m ? `${parseInt(m[1], 10)},${parseInt(m[2], 10)}` : null;
            pick.click();

            setTimeout(() => {
                /* Re-apply template after target change so troop fields stay populated */
                const tmpl = Array.from(document.querySelectorAll('a.troop_template_selector'))
                    .find(a => a.textContent.trim() === 'Desviar');
                if (tmpl) tmpl.click();

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
                    if (elapsed > 6000) {
                        console.error('[Desviador] Timeout a aguardar botão de apoio. A abortar.');
                        clearPending(p.cmdId);
                        return;
                    }
                    setTimeout(poll, 200);
                };
                setTimeout(poll, 200);
            }, 400);
        };
        setTimeout(waitRows, 300);
    }

    function doScheduleCancel(p) {
        const elapsed   = Date.now() - (p.sentAt || 0);
        const remaining = Math.max(p.cancelMs - elapsed, 2000);
        console.log(`[Desviador] Cancelar em ${Math.round(remaining / 1000)}s`);

        setTimeout(() => {
            const cancelLinks = Array.from(
                document.querySelectorAll('a.command-cancel[data-home]')
            ).filter(a => a.getAttribute('data-home') === p.village);

            if (cancelLinks.length === 0) {
                console.warn('[Desviador] Sem links de cancelamento visíveis — a recarregar.');
                location.reload();
                return;
            }

            cancelLinks[0].click();
            clearPending(p.cmdId);
            console.log('[Desviador] Apoio cancelado.');

            /* Notify the incomings tab via localStorage storage event (fires in other tabs) */
            localStorage.setItem(LAST_CANCEL_KEY, JSON.stringify({
                village: p.village, ts: Date.now(),
            }));

            setTimeout(() => window.close(), 3000);
        }, remaining);
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

        const btn = document.querySelector('#troop_confirm_submit');
        if (!btn) {
            console.error('[Desviador] Botão de confirmação não encontrado. A abortar.');
            clearPending(p.cmdId);
            return;
        }

        /* Record dispatch time before navigating so the cancel phase knows when to fire */
        setPending({ ...p, phase: 'cancel', sentAt: Date.now() });
        setTimeout(() => btn.click(), 400);
    }

})();

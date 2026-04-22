// ==UserScript==
// @name         Desviador
// @namespace    tw_desviador
// @version      1.0.0
// @description  Desvio automático de tropas para ataques marcados com [Desviar]
// @match        https://*.tribalwars.com.pt/game.php*
// ==/UserScript==

(function () {
    'use strict';

    if (window.__twDesviadorRunning) return;
    window.__twDesviadorRunning = true;

    const PENDING_KEY    = 'twDesviador_pending';
    const SCHED_PREFIX   = 'twDesviador_sched_';
    const ACTIVE_KEY     = 'twDesviador_active';
    const CANCEL_SEC_KEY = 'twDesviador_cancelSec';
    const ALERT_SEC_KEY  = 'twDesviador_alertSec';
    const TAB_CMD_KEY    = 'twDesviador_tabCmdId';

    const params   = new URLSearchParams(window.location.search);
    const screen   = params.get('screen');
    const mode     = params.get('mode');
    const subtype  = params.get('subtype');
    const tryParam = params.get('try');
    const village  = params.get('village');
    const desvCmdId = params.get('__desv'); /* cmdId injected when opening tab */

    const isIncomings = screen === 'overview_villages' &&
                        mode   === 'incomings'          &&
                        subtype === 'attacks';
    const isPlace   = screen === 'place' && !tryParam;
    const isConfirm = screen === 'place' && tryParam === 'confirm';

    /* ------------------------------------------------------------------ helpers */

    function whenReady(cb) {
        if (typeof $ !== 'undefined' && typeof TribalWars !== 'undefined') {
            cb();
        } else {
            setTimeout(() => whenReady(cb), 150);
        }
    }

    /* Per-cmdId pending keys: twDesviador_pending_<cmdId>
     * Each open tab only reads/writes its own key, so concurrent commands
     * never overwrite each other's cancel state. */
    function pendingKey(cmdId) { return PENDING_KEY + '_' + cmdId; }

    function getPending(cmdId) {
        try { return JSON.parse(localStorage.getItem(pendingKey(cmdId)) || 'null'); }
        catch { return null; }
    }

    function setPending(data) {
        if (data === null) return; /* use clearPending(cmdId) to remove */
        localStorage.setItem(pendingKey(data.cmdId), JSON.stringify(data));
    }

    function clearPending(cmdId) {
        localStorage.removeItem(pendingKey(cmdId));
    }

    /* Find a pending entry whose village matches the current page village.
     * Used by place/confirm pages which only know their own village parameter. */
    function findPendingForVillage(village) {
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (!key || !key.startsWith(PENDING_KEY + '_')) continue;
            try {
                const data = JSON.parse(localStorage.getItem(key));
                if (data && data.village === village) return data;
            } catch { /* skip */ }
        }
        return null;
    }

    /*
     * recoverMissedFires — runs on every game page.
     * If the incomings tab was navigated away, its setTimeout calls died.
     * Each scheduled command is persisted to twDesviador_sched_<cmdId> so any
     * page load can detect overdue fires and open the place tab.
     * Removing the key acts as an atomic "claim" — prevents duplicate tabs.
     */
    function recoverMissedFires() {
        const now = Date.now();
        for (let i = localStorage.length - 1; i >= 0; i--) {
            const key = localStorage.key(i);
            if (!key || !key.startsWith(SCHED_PREFIX)) continue;
            try {
                const d = JSON.parse(localStorage.getItem(key));
                if (!d) { localStorage.removeItem(key); continue; }
                if (now > d.arrivalMs) {
                    /* Attack already landed — clean up */
                    localStorage.removeItem(key);
                    continue;
                }
                if (now >= d.fireAt) {
                    /* Overdue — claim it and open the place tab */
                    localStorage.removeItem(key);
                    setPending({ phase: 'send', village: d.village, cancelMs: d.cancelMs, cmdId: d.cmdId });
                    window.open(
                        `/game.php?village=${d.village}&screen=place&__desv=${d.cmdId}`,
                        '_blank'
                    );
                }
            } catch { localStorage.removeItem(key); }
        }
    }

    /* Run recovery on every page load — lightweight localStorage scan */
    recoverMissedFires();

    /* =========================================================
       INCOMINGS PAGE
    ========================================================= */

    if (isIncomings) whenReady(initIncomings);

    function initIncomings() {
        const wasActive = localStorage.getItem(ACTIVE_KEY) === '1';

        /* ── State ── */
        const originalTitle = document.title;

        let active   = false;
        let tickerId = null;
        const scheduled        = new Set();
        const timers           = [];   /* fire timers */
        const alertTimers      = [];   /* pre-alert timers */
        /* cmdId → { label, villageName, destVillage, arrivalMs, fireAt, fired } */
        const scheduledDetails = new Map();

        /* ── Title countdown ── */
        function pad2(n) { return String(n).padStart(2, '0'); }

        function updateTitle() {
            if (!active) {
                document.title = originalTitle;
                return;
            }
            const now = Date.now();
            let next = Infinity;
            scheduledDetails.forEach(d => {
                if (!d.fired && d.fireAt > now) next = Math.min(next, d.fireAt - now);
            });
            if (next === Infinity) {
                document.title = originalTitle;
                return;
            }
            const total = Math.floor(next / 1000);
            const hh = Math.floor(total / 3600);
            const mm = Math.floor((total % 3600) / 60);
            const ss = total % 60;
            document.title = `Desviador: ${pad2(hh)}:${pad2(mm)}:${pad2(ss)}`;
        }

        /* ── State dispatcher → React overlay ── */
        function dispatchState() {
            updateTitle();
            document.dispatchEvent(new CustomEvent('xbot:desviador:state', {
                detail: {
                    active,
                    scheduled: Array.from(scheduledDetails.values()),
                    notifPermission: Notification.permission,
                },
            }));
        }

        /* ── Command listener ← React overlay ── */
        document.addEventListener('xbot:desviador:cmd', function (e) {
            const type = e.detail && e.detail.type;
            if (type === 'start' && !active)   startMonitoring();
            else if (type === 'stop' && active) stopAll();
            else if (type === 'requestNotif')   Notification.requestPermission().then(dispatchState);
        });

        /* ── Audio helpers ── */
        function playBeep() {
            try {
                const ctx  = new (window.AudioContext || window.webkitAudioContext)();
                const osc  = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.type = 'sine';
                [660, 880, 1100].forEach(function (freq, i) {
                    const t = ctx.currentTime + i * 0.18;
                    osc.frequency.setValueAtTime(freq, t);
                    gain.gain.setValueAtTime(0.25, t);
                    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
                });
                osc.start(ctx.currentTime);
                osc.stop(ctx.currentTime + 0.6);
            } catch (e) { /* AudioContext blocked — silent */ }
        }

        function fireAlert(label, villageName, secLeft) {
            playBeep();
            if (Notification.permission === 'granted') {
                new Notification('⚔️ Desviador — Abre em breve!', {
                    body: `${label} (${villageName}) abre em ~${secLeft}s — muda para esta tab!`,
                    icon: '/graphic/icon/small_attacker.png',
                    tag:  'desviador-alert',
                    requireInteraction: true,
                });
            }
        }

        /* ── Control functions ── */
        function stopAll() {
            active = false;
            localStorage.removeItem(ACTIVE_KEY);
            timers.forEach(clearTimeout);
            timers.length = 0;
            alertTimers.forEach(clearTimeout);
            alertTimers.length = 0;
            /* Remove persisted schedules so recovery doesn't fire after stop */
            scheduled.forEach(cmdId => localStorage.removeItem(SCHED_PREFIX + cmdId));
            scheduled.clear();
            scheduledDetails.clear();
            if (tickerId) { clearInterval(tickerId); tickerId = null; }
            document.title = originalTitle;
            dispatchState();
        }

        function startMonitoring() {
            active = true;
            localStorage.setItem(ACTIVE_KEY, '1');
            if (!tickerId) tickerId = setInterval(dispatchState, 1000);
            if (Notification.permission === 'default') {
                Notification.requestPermission().then(dispatchState);
            }
            scanAndSchedule();
            dispatchState();
        }

        /* Auto-resume after refresh */
        if (wasActive) startMonitoring();
        else dispatchState();

        function scanAndSchedule() {
            if (!active) return;

            const cancelSec = parseInt(localStorage.getItem(CANCEL_SEC_KEY) || '300', 10);
            const cancelMs  = cancelSec * 1000;
            const alertSec  = parseInt(localStorage.getItem(ALERT_SEC_KEY)  || '60',  10);

            const serverNowMs = (
                (typeof game_data !== 'undefined' && game_data.time)
                    ? game_data.time
                    : Math.floor(Date.now() / 1000)
            ) * 1000;

            /* Query quickedit spans directly — avoids relying on CSS4 :has() */
            document.querySelectorAll('span.quickedit[data-id]').forEach(qeSpan => {
                const cmdId = qeSpan.getAttribute('data-id');
                if (scheduled.has(cmdId)) return;

                /* Walk up to the containing <tr> */
                const row = qeSpan.closest('tr');
                if (!row) return;

                /* Read only direct text nodes of the label span to avoid noise from
                   injected child elements (rename-buttons etc.) */
                const labelEl = qeSpan.querySelector('.quickedit-label');
                if (!labelEl) return;
                const labelText = Array.from(labelEl.childNodes)
                    .filter(n => n.nodeType === Node.TEXT_NODE)
                    .map(n => n.textContent)
                    .join('')
                    .trim();
                if (!labelText.includes('[Desviar]')) return;

                /*
                 * Arrival time: 6th <td> (index 5) shows "hoje às HH:MM:SS:" with
                 * milliseconds in <span class="grey small">mmm</span>.
                 * There is no data-endtime here — Torre de Vigia uses data-endtime
                 * elsewhere in the row for intel expiry, so we parse the text directly.
                 */
                const directTds = Array.from(row.querySelectorAll(':scope > td'));
                const arrivalTd = directTds[5];
                if (!arrivalTd) {
                    console.warn(`[Desviador] Ataque ${cmdId}: 6ª coluna não encontrada (${directTds.length} TDs).`);
                    return;
                }
                const msVal     = parseInt(arrivalTd.querySelector('span.grey.small')?.textContent.trim() || '0', 10);
                const timeMatch = arrivalTd.textContent.match(/(\d{2}):(\d{2}):(\d{2})/);
                if (!timeMatch) {
                    console.warn(`[Desviador] Ataque ${cmdId}: hora de chegada não reconhecida — "${arrivalTd.textContent.trim()}"`);
                    return;
                }
                const arrival = new Date(serverNowMs);
                arrival.setHours(+timeMatch[1], +timeMatch[2], +timeMatch[3], msVal);
                /* If the computed time is already past, the attack lands tomorrow */
                if (arrival.getTime() <= serverNowMs) arrival.setDate(arrival.getDate() + 1);
                const arrivalMs = arrival.getTime();

                /* Village: td.incoming_from → 2nd direct-child TD */
                const villageTd = row.querySelector('td.incoming_from') || directTds[1];
                if (!villageTd) {
                    console.warn(`[Desviador] Ataque ${cmdId}: TD da aldeia não encontrado.`);
                    return;
                }
                const td2Link = villageTd.querySelector('a[href*="village="]');
                if (!td2Link) {
                    console.warn(`[Desviador] Ataque ${cmdId}: link de aldeia não encontrado em TD2.`);
                    return;
                }
                const vmatch = (td2Link.getAttribute('href') || '').match(/village=(\d+)/);
                if (!vmatch) return;
                const destVillage  = vmatch[1];
                const villageName  = td2Link.textContent.trim();

                const offsetMs = (Math.random() * 10 + 30) * 1000;
                const delay    = arrivalMs - serverNowMs - offsetMs;

                if (delay <= 0) {
                    console.warn(`[Desviador] Ataque ${cmdId}: tempo insuficiente para programar.`);
                    return;
                }

                /* Skip if an existing support to the same village already covers
                   this arrival (its cancel deadline is after this attack lands). */
                const covered = Array.from(scheduledDetails.values()).some(d =>
                    d.destVillage === destVillage &&
                    (d.fireAt + cancelMs) > arrivalMs
                );
                if (covered) {
                    console.log(`[Desviador] Ataque ${cmdId} coberto por apoio já programado — a ignorar.`);
                    scheduled.add(cmdId); /* mark as seen so we don't re-check next scan */
                    return;
                }

                const fireAt = Date.now() + delay;

                scheduled.add(cmdId);
                scheduledDetails.set(cmdId, {
                    cmdId,
                    label: labelText,
                    villageName,
                    destVillage,
                    arrivalMs,
                    fireAt,
                    fired: false,
                });

                /* Persist schedule so any page can recover if this tab navigates away */
                localStorage.setItem(SCHED_PREFIX + cmdId, JSON.stringify({
                    cmdId, village: destVillage, cancelMs, arrivalMs, fireAt,
                }));

                const td1 = row.querySelector('td:nth-child(1)');
                if (td1) td1.style.outline = '2px solid #22c55e';

                /* Pre-alert: beep + notification N seconds before the tab opens */
                const alertDelay = delay - alertSec * 1000;
                if (alertDelay > 0) {
                    alertTimers.push(setTimeout(() => {
                        if (!active) return;
                        fireAlert(labelText, villageName, alertSec);
                    }, alertDelay));
                }

                const t = setTimeout(() => {
                    if (!active) return;
                    const detail = scheduledDetails.get(cmdId);
                    if (detail) detail.fired = true;
                    /* Claim the sched entry before opening tab — prevents recovery duplicate */
                    localStorage.removeItem(SCHED_PREFIX + cmdId);
                    setPending({ phase: 'send', village: destVillage, cancelMs, cmdId });
                    window.open(`/game.php?village=${destVillage}&screen=place&__desv=${cmdId}`, '_blank');
                    if (td1) td1.style.outline = '2px solid #d97706';
                    dispatchState();
                }, delay);

                timers.push(t);
                console.log(
                    `[Desviador] Ataque ${cmdId} programado em ${Math.round(delay / 1000)}s` +
                    ` (vila ${destVillage})`
                );
            });

            dispatchState();

            timers.push(setTimeout(scanAndSchedule, 15_000));
        }
    }

    /* =========================================================
       PLACE PAGE  (send phase OR cancel phase)
    ========================================================= */

    if (isPlace) whenReady(handlePlace);

    /* Bind this tab to its cmdId via sessionStorage so concurrent tabs for
       the same village never steal each other's pending entry. */
    function resolveTabPending() {
        let tabCmdId = sessionStorage.getItem(TAB_CMD_KEY);
        if (!tabCmdId && desvCmdId) {
            tabCmdId = desvCmdId;
            sessionStorage.setItem(TAB_CMD_KEY, tabCmdId);
        }
        return tabCmdId ? getPending(tabCmdId) : findPendingForVillage(village);
    }

    function handlePlace() {
        const p = resolveTabPending();
        if (!p) return;

        if (p.phase === 'send')        doSendSupport(p);
        else if (p.phase === 'cancel') doScheduleCancel(p);
    }

    function doSendSupport(p) {
        /* 1. Find and click the "Desviar" troop template by name */
        const template = Array.from(
            document.querySelectorAll('a.troop_template_selector')
        ).find(a => a.textContent.trim() === 'Desviar');

        if (!template) {
            console.error('[Desviador] Template "Desviar" não encontrado. A abortar.');
            clearPending(p.cmdId);
            return;
        }
        template.click();

        /* 2. After the template populates troops, click "Anterior" quick-target */
        setTimeout(() => {
            const anteriorBtn = document.querySelector(
                'a.target-last-attacked, a.target-quickbutton[data-title="Anterior"]'
            );
            if (anteriorBtn) anteriorBtn.click();

            /* 3. Poll for #target_support — if it never appears "Anterior" likely
             *    resolved to the player's own village (invalid support target).
             *    In that case fall back to picking from "As suas aldeias" popup. */
            pollForSupport(p, 3000, function () {
                useFallbackTarget(p);
            });
        }, 500);
    }

    /*
     * pollForSupport — waits up to `timeoutMs` for #target_support to become
     * visible and enabled, then clicks it and advances to 'confirm' phase.
     * Calls onFail() if the timeout expires without success.
     */
    function pollForSupport(p, timeoutMs, onFail) {
        const start = Date.now();
        const poll  = () => {
            /* Bail out immediately if TW reports an invalid target */
            const pageText = document.body?.innerText || '';
            if (pageText.includes('Alvo inválido')) {
                console.warn('[Desviador] "Alvo inválido" detectado — a usar fallback.');
                onFail();
                return;
            }

            const supportBtn = document.querySelector('#target_support');
            const isVisible  = supportBtn &&
                               supportBtn.offsetParent !== null &&
                               !supportBtn.disabled;
            if (isVisible) {
                setPending({ ...p, phase: 'confirm' });
                supportBtn.click();
                return;
            }
            if (Date.now() - start > timeoutMs) { onFail(); return; }
            setTimeout(poll, 200);
        };
        setTimeout(poll, 400);
    }

    /*
     * useFallbackTarget — opens the "As suas aldeias" (own villages) popup,
     * waits for it to render, then clicks the first available selectTarget row.
     * Used when "Anterior" resolves to the player's own current village.
     */
    function useFallbackTarget(p) {
        console.warn('[Desviador] "Anterior" falhou — a abrir "As suas aldeias".');

        /* Find the link that opens the own-villages popup */
        const ownVillagesLink = document.querySelector('a[onclick*="ajax=own"]');
        if (!ownVillagesLink) {
            console.error('[Desviador] Link "As suas aldeias" não encontrado. A abortar.');
            clearPending(p.cmdId);
            return;
        }
        ownVillagesLink.click();

        /* Current village coords — used to skip own village in the popup */
        const myX = (typeof game_data !== 'undefined' && game_data.village) ? game_data.village.x : null;
        const myY = (typeof game_data !== 'undefined' && game_data.village) ? game_data.village.y : null;

        /* Wait for the popup to render rows with selectTarget links */
        const start = Date.now();
        const waitForPopup = () => {
            const allRows = Array.from(document.querySelectorAll(
                '.popup_helper a[href^="javascript:selectTarget"]'
            ));
            /* Filter out the current village so we never select ourselves */
            const rows = allRows.filter(a => {
                if (myX === null) return true;
                const m = (a.getAttribute('href') || '').match(/selectTarget\((\d+),\s*(\d+)/);
                if (!m) return true;
                return !(parseInt(m[1]) === myX && parseInt(m[2]) === myY);
            });
            if (rows.length > 0) {
                rows[0].click();
                /* "Alvo inválido" resets the troop form — re-click the template
                   after a short delay so troops are populated before submitting */
                setTimeout(() => {
                    const template = Array.from(
                        document.querySelectorAll('a.troop_template_selector')
                    ).find(a => a.textContent.trim() === 'Desviar');
                    if (template) template.click();
                    /* After target selected and troops filled, poll for #target_support */
                    pollForSupport(p, 4000, function () {
                        console.error('[Desviador] #target_support não apareceu após fallback. A abortar.');
                        clearPending(p.cmdId);
                    });
                }, 500);
                return;
            }
            if (Date.now() - start > 6000) {
                console.error('[Desviador] Popup "As suas aldeias" não carregou. A abortar.');
                clearPending(p.cmdId);
                return;
            }
            setTimeout(waitForPopup, 200);
        };
        setTimeout(waitForPopup, 300);
    }

    function doScheduleCancel(p) {
        const elapsed   = Date.now() - (p.sentAt || 0);
        const remaining = Math.max(p.cancelMs - elapsed, 2000);

        console.log(`[Desviador] Cancelar apoio em ${Math.round(remaining / 1000)}s`);

        setTimeout(() => {
            /*
             * Find cancel links from our village; reload once if none are present
             * (the page may need a refresh after TW processes the command).
             */
            const cancelLinks = Array.from(
                document.querySelectorAll('a.command-cancel[data-home]')
            ).filter(a => a.getAttribute('data-home') === p.village);

            if (cancelLinks.length === 0) {
                console.warn('[Desviador] Nenhum link de cancelamento visível — a recarregar.');
                location.reload();
                return;
            }

            /* The first link is the most recently dispatched command */
            cancelLinks[0].click();
            clearPending(p.cmdId);
            console.log('[Desviador] Apoio cancelado. A fechar tab em 5s…');
            setTimeout(() => window.close(), 5000);
        }, remaining);
    }

    /* =========================================================
       CONFIRM PAGE  (screen=place&try=confirm)
    ========================================================= */

    if (isConfirm) whenReady(handleConfirm);

    function handleConfirm() {
        const p = resolveTabPending();
        if (!p || p.phase !== 'confirm') return;

        const confirmBtn = document.querySelector('#troop_confirm_submit');
        if (!confirmBtn) {
            console.error('[Desviador] Botão "Enviar apoio" não encontrado. A abortar.');
            clearPending(p.cmdId);
            return;
        }

        /* Record dispatch time BEFORE navigating so the cancel phase knows when to fire */
        setPending({ ...p, phase: 'cancel', sentAt: Date.now() });
        setTimeout(() => confirmBtn.click(), 400);
    }

})();

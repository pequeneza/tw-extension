// ==UserScript==
// @name         Mão de deus (Teste-striker) - Hybrid Scheduler + Alerts (10s + Notification)
// @version      2.4.1
// @description  Schedules confirm click using server time with a coarse+fine hybrid timer. Robust duration parsing, safe datetime parsing, status display, and attention at T-10s (banner + title/favicon flash + desktop notification + beep with Chrome unlock). DOM frozen during fine phase for precision.
// @match        *://*.tribalwars.com.pt/game.php*screen=place*try=confirm*
// @match        *://*.tribalwars.com.br/game.php*screen=place*try=confirm*
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  // ---------------- storage keys ----------------
  const LS_FINE_OFFSET   = 'CS.offsetFineMs';        // user calibration (+/- ms)
  const LS_LAT_MULT      = 'CS.latencyMultiplier';   // latency multiplier (default 0.25)
  const LS_SERVER_OFFSET = 'CS.serverOffsetMs';    // serverNow - Date.now()
  const LS_ALERT_LEAD = 'CS.alertLeadMs';          // ms before target to alert
  const LS_ALERT_SOUND = 'CS.alertSoundEnabled';   // "1"/"0"
  const LS_ALERT_FLASH = 'CS.alertFlashEnabled';   // "1"/"0"
  const LS_ALERT_NOTIFY = 'CS.alertNotifyEnabled'; // "1"/"0"
  const LS_AUDIO_UNLOCKED = 'CS.audioUnlocked';    // "1"/"0"

  // ---------------- utils ----------------
  function pad2(n) { return String(n).padStart(2, '0'); }
  function pad3(n) { return String(n).padStart(3, '0'); }

  function clampInt(n, lo, hi) {
    n = Number(n);
    if (!Number.isFinite(n)) return lo;
    return Math.max(lo, Math.min(hi, Math.trunc(n)));
  }

  function safeText($el) {
    try { return ($el.text() || '').trim(); } catch { return ''; }
  }

  function fmtHmsMs(diffMs) {
    const sign = diffMs < 0 ? '-' : '';
    const abs = Math.abs(diffMs);
    const s = Math.floor(abs / 1000);
    const ms = abs % 1000;
    const hh = Math.floor(s / 3600);
    const mm = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    return `${sign}${pad2(hh)}:${pad2(mm)}:${pad2(ss)}.${pad3(ms)}`;
  }

  // ---------------- safe datetime-local parsing/formatting ----------------
  function parseDatetimeLocalMs(value) {
    const m = String(value).match(
      /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?(?:\.(\d{1,3}))?$/
    );
    if (!m) return NaN;

    const yyyy = +m[1], MM = +m[2], dd = +m[3];
    const hh = +m[4], mm = +m[5], ss = +(m[6] || 0);
    const ms = +(String(m[7] || '0').padEnd(3, '0'));

    return new Date(yyyy, MM - 1, dd, hh, mm, ss, ms).getTime();
  }

  function toDatetimeLocalMs(ms) {
    const d = new Date(ms);
    return (
      d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) +
      'T' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds()) +
      '.' + pad3(d.getMilliseconds())
    );
  }

  // ---------------- server time helpers ----------------
  function getTimingServerNowMs() {
    try {
      if (window.Timing?.getCurrentServerTime) return window.Timing.getCurrentServerTime();
    } catch {}
    return null;
  }

  function updateServerOffsetEstimate() {
    const serverNow = getTimingServerNowMs();
    if (serverNow == null) return null;
    const offset = Math.round(serverNow - Date.now());
    localStorage.setItem(LS_SERVER_OFFSET, String(offset));
    return offset;
  }

  function getServerNowMs() {
    const serverNow = getTimingServerNowMs();
    if (serverNow != null) return serverNow;
    const stored = Number(localStorage.getItem(LS_SERVER_OFFSET) || '0');
    return Date.now() + stored;
  }

  // ---------------- duration parsing ----------------
  function parseDurationToMs(text) {
    const t = String(text).trim();

    let m = t.match(/(\d+)\s*:\s*(\d{1,2})\s*:\s*(\d{1,2})/);
    if (m) {
      const h = +m[1], mm = +m[2], ss = +m[3];
      if ([h, mm, ss].every(Number.isFinite)) return ((h * 3600) + (mm * 60) + ss) * 1000;
    }

    const nums = t.match(/\d+/g)?.map(Number) || [];
    if (nums.length >= 3) {
      const [h, mm, ss] = nums.slice(-3);
      if ([h, mm, ss].every(Number.isFinite)) return ((h * 3600) + (mm * 60) + ss) * 1000;
    }

    return NaN;
  }

  function readDurationMsFromForm() {
    const $form = $('#command-data-form');
    if (!$form.length) return NaN;

    const $labelCell = $form.find('td').filter((_, td) => /duraç/i.test($(td).text())).first();
    if (!$labelCell.length) return NaN;

    const $valCell = $labelCell.next('td');
    const txt = safeText($valCell);
    return parseDurationToMs(txt);
  }

  // ---------------- attention helpers ----------------
  let CS_AUDIO_CTX = null;

  function csGetAudioCtx() {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    if (!CS_AUDIO_CTX) CS_AUDIO_CTX = new AudioCtx();
    return CS_AUDIO_CTX;
  }

  async function csUnlockAudio() {
    try {
      const ctx = csGetAudioCtx();
      if (!ctx) return false;
      if (ctx.state === 'suspended') await ctx.resume();

      const o = ctx.createOscillator();
      const g = ctx.createGain();
      g.gain.value = 0.0001;
      o.frequency.value = 440;
      o.connect(g);
      g.connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + 0.02);

      localStorage.setItem(LS_AUDIO_UNLOCKED, '1');
      return true;
    } catch {
      return false;
    }
  }

  function csBeep(freq = 880, ms = 150, vol = 0.05) {
    try {
      const unlocked = localStorage.getItem(LS_AUDIO_UNLOCKED) === '1';
      const ctx = csGetAudioCtx();
      if (!ctx || !unlocked) return false;

      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = freq;
      g.gain.value = vol;
      o.connect(g);
      g.connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + ms / 1000);
      return true;
    } catch {
      return false;
    }
  }

  function csEnsureFaviconLink() {
    let link = document.querySelector('link[rel*="icon"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    return link;
  }

  function csMakeFaviconDataUrl(color) {
    const c = document.createElement('canvas');
    c.width = 32; c.height = 32;
    const x = c.getContext('2d');
    x.fillStyle = color;
    x.fillRect(0, 0, 32, 32);
    x.fillStyle = 'rgba(255,255,255,0.95)';
    x.font = 'bold 20px Arial';
    x.fillText('!', 11, 23);
    return c.toDataURL('image/png');
  }

  function csStartTabAttention(label = 'SEND') {
    const originalTitle = document.title;
    const iconLink = csEnsureFaviconLink();
    const originalIcon = iconLink.href;

    const fav1 = csMakeFaviconDataUrl('#c62828');
    const fav2 = csMakeFaviconDataUrl('#f9a825');

    let on = false;
    const id = setInterval(() => {
      on = !on;
      document.title = on ? `⚠ ${label} ⚠` : originalTitle;
      iconLink.href = on ? fav1 : fav2;
    }, 400);

    return () => {
      clearInterval(id);
      document.title = originalTitle;
      iconLink.href = originalIcon;
    };
  }

  function csEnsureBanner() {
    let el = document.getElementById('CS_send_banner');
    if (el) return el;

    el = document.createElement('div');
    el.id = 'CS_send_banner';
    el.style.cssText = `
      position:fixed;
      left:10px;
      right:10px;
      top:10px;
      z-index:999999;
      display:none;
      padding:10px 12px;
      border:2px solid #b71c1c;
      background:rgba(255,255,255,0.95);
      color:#b71c1c;
      font-family:Verdana,Arial;
      border-radius:10px;
      box-shadow:0 6px 18px rgba(0,0,0,0.25);
    `;
    el.innerHTML = `
      <div style="display:flex; justify-content:space-between; gap:10px; align-items:center;">
        <div>
          <div style="font-weight:bold; font-size:14px;">SEND SOON</div>
          <div id="CS_send_banner_text" style="font-family:monospace; font-size:12px; margin-top:2px;">—</div>
        </div>
        <button id="CS_send_banner_hide" class="btn" type="button">OK</button>
      </div>
    `;
    document.body.appendChild(el);

    document.getElementById('CS_send_banner_hide').addEventListener('click', () => {
      el.style.display = 'none';
    });

    return el;
  }

  async function csEnsureNotificationPermission() {
    try {
      if (!('Notification' in window)) return false;
      if (Notification.permission === 'granted') return true;
      if (Notification.permission === 'denied') return false;
      const res = await Notification.requestPermission();
      return res === 'granted';
    } catch {
      return false;
    }
  }

  function csNotify(title, body) {
    try {
      if (!('Notification' in window)) return false;
      if (Notification.permission !== 'granted') return false;
      new Notification(title, { body, silent: false });
      return true;
    } catch {
      return false;
    }
  }

  // Fires ONCE at (T - leadMs), then stops after target.
  // Returns a freeze() function — call it to stop the banner countdown
  // without hiding the banner (used when fine phase starts).
  function csScheduleAlert(targetServerMs, leadMs, enabledSound, enabledFlash, enabledNotify) {
    leadMs = Math.max(0, Math.trunc(leadMs));

    const banner = csEnsureBanner();
    const bannerText = banner.querySelector('#CS_send_banner_text');

    let fired = false;
    let stopAttention = null;
    let bannerTimer = null;
    let frozen = false;            // ← NEW: set true by finePhase to stop DOM writes

    const poll = setInterval(() => {
      const now = getServerNowMs();
      const diff = targetServerMs - now;

      if (!fired && diff <= leadMs) {
        fired = true;

        banner.style.display = 'block';

        if (enabledNotify) {
          csNotify(
            'TribalWars: SEND em breve',
            `Faltam ${Math.max(0, Math.round(diff))}ms (${fmtHmsMs(diff)}) para confirmar.`
          );
        }

        if (enabledFlash) stopAttention = csStartTabAttention('SEND');
        if (enabledSound) {
          csBeep(880, 180) || console.warn('[CS] Beep blocked (audio not unlocked, or tab/site muted).');
          setTimeout(() => csBeep(880, 180), 250);
          setTimeout(() => csBeep(988, 180), 2000);
          setTimeout(() => csBeep(1175, 220), 4000);
        }

        // Banner countdown — stops itself when frozen
        bannerTimer = setInterval(() => {
          if (frozen) { clearInterval(bannerTimer); bannerTimer = null; return; } // ← NEW
          const left = targetServerMs - getServerNowMs();
          bannerText.textContent = `click in: ${left}ms (${fmtHmsMs(left)})`;
        }, 50);
      }

      if (diff <= -2000) {
        clearInterval(poll);
        if (stopAttention) stopAttention();
        if (bannerTimer) clearInterval(bannerTimer);
        banner.style.display = 'none';
      }
    }, 100);

    // ← NEW: expose a freeze function for finePhase to call
    return () => { frozen = true; };
  }

  // ---------------- hybrid scheduler ----------------
  function scheduleClickAtServerMs(targetServerMs, fineOffsetMs, clickFn, statusEl, attentionCfg) {
    const WAKE_VISIBLE_MS = 1500;
    const WAKE_HIDDEN_MS  = 4500;
    const HIDDEN_POLL_MS  = 25;
    const VISIBLE_RAF_START_MS = 400;

    // Use TW's own WebSocket latency estimate, same formula as Auto Sender v2.6.4:
    //   offset = -(latency × multiplier) + manualOffset
    // Auto Sender's default multiplier is 0.25 — empirically tuned to match
    // the actual upload transit time of a POST command to the TW server.
    // The fineOffsetMs from the UI field acts as the manual offset on top.
    const twLatencyMs = (() => {
      try {
        const v = window.Timing?.getEstimatedLatency?.();
        return (Number.isFinite(v) && v > 0 && v < 500) ? v : 0;
      } catch { return 0; }
    })();
    const TW_LATENCY_MULTIPLIER = (() => {
      const v = parseFloat(localStorage.getItem('CS.latencyMultiplier') || '0.25');
      return (Number.isFinite(v) && v >= 0 && v <= 2) ? v : 0.25;
    })();
    const twOffsetMs = twLatencyMs * TW_LATENCY_MULTIPLIER;

    const target = Math.round(targetServerMs + fineOffsetMs - twOffsetMs);

    let coarse = null;
    let fineInterval = null;
    let statusInterval = null;
    let stopped = false;
    let freezeAlert = null;        // ← holds the freeze() fn from csScheduleAlert

    function stopAll() {
      stopped = true;
      if (coarse) clearTimeout(coarse);
      if (fineInterval) clearInterval(fineInterval);
      if (statusInterval) clearInterval(statusInterval);
      coarse = null;
      fineInterval = null;
      statusInterval = null;
    }

    function doClick() {
      if (stopped) return;
      stopAll();
      clickFn();
    }

    function updateStatus(phase) {
      if (!statusEl) return;
      const now  = getServerNowMs();
      const diff = target - now;

      // Format target (send time) as HH:MM:SS.mmm
      const sendDate = new Date(target);
      const sendStr  =
        String(sendDate.getHours()).padStart(2,'0') + ':' +
        String(sendDate.getMinutes()).padStart(2,'0') + ':' +
        String(sendDate.getSeconds()).padStart(2,'0') + '.' +
        String(sendDate.getMilliseconds()).padStart(3,'0');

      // Countdown: only show when positive (before target)
      const diffRounded = Math.round(diff);
      const countdown = diffRounded > 0 ? fmtHmsMs(diffRounded) : `SEND NOW (${fmtHmsMs(diffRounded)})`;

      const parts = [];
      if (fineOffsetMs !== 0) parts.push(`offset=${fineOffsetMs > 0 ? '+' : ''}${fineOffsetMs}ms`);
      if (twOffsetMs !== 0) parts.push(`lat=${twLatencyMs}ms×0.25=−${twOffsetMs.toFixed(2)}ms`);
      const offsetNote = parts.length ? ' | ' + parts.join(' | ') : '';

      statusEl.text(`enviar às ${sendStr} | T-agora: ${countdown}${offsetNote}`);
    }

    function finePhase() {
      // ── Freeze all DOM updates before precision timing begins ──────────────
      // DOM writes (status text, banner countdown) can trigger style recalc /
      // reflow which steals 5-20ms from the JS thread at the worst moment.
      if (statusInterval) { clearInterval(statusInterval); statusInterval = null; }
      if (freezeAlert) freezeAlert();   // ← stop banner countdown DOM writes

      // ── Freeze TW's own tick handlers ─────────────────────────────────────
      // Timing.resetTickHandlers() stops TW's internal JS tickers:
      // resource display, countdown timers, UI updates — same as Auto Sender.
      // getCurrentServerTime() still works correctly (uses elapsed time, not ticks).
      try { if (window.Timing?.resetTickHandlers) window.Timing.resetTickHandlers(); } catch(e) {}

      // Write one last frozen status line, then silence
      if (statusEl) {
        const frozenDiff = target - getServerNowMs();
        const sendDate   = new Date(target);
        const sendStr    =
          String(sendDate.getHours()).padStart(2,'0') + ':' +
          String(sendDate.getMinutes()).padStart(2,'0') + ':' +
          String(sendDate.getSeconds()).padStart(2,'0') + '.' +
          String(sendDate.getMilliseconds()).padStart(3,'0');
        const frozenParts = [];
        if (fineOffsetMs !== 0) frozenParts.push(`offset=${fineOffsetMs > 0 ? '+' : ''}${fineOffsetMs}ms`);
        if (twOffsetMs !== 0) frozenParts.push(`lat=−${twOffsetMs.toFixed(2)}ms`);
        const frozenNote = frozenParts.length ? ' | ' + frozenParts.join(' | ') : '';
        statusEl.text(`enviar às ${sendStr} | ${fmtHmsMs(Math.round(frozenDiff))} — a calcular${frozenNote}`);
      }

      function rafLoop() {
        if (stopped) return;
        if (getServerNowMs() >= target) return doClick();
        requestAnimationFrame(rafLoop);
      }

      if (document.visibilityState === 'visible') {
        fineInterval = setInterval(() => {
          const now = getServerNowMs();
          const diff = target - now;
          if (diff <= 0) return doClick();
          if (diff <= VISIBLE_RAF_START_MS) {
            clearInterval(fineInterval);
            fineInterval = null;
            requestAnimationFrame(rafLoop);
          }
        }, 10);
      } else {
        fineInterval = setInterval(() => {
          if (getServerNowMs() >= target) return doClick();
        }, HIDDEN_POLL_MS);
      }
    }

    function planFromNow() {
      if (stopped) return;

      if (coarse) clearTimeout(coarse);
      if (fineInterval) clearInterval(fineInterval);
      coarse = null;
      fineInterval = null;

      const now = getServerNowMs();
      const diff = target - now;
      if (diff <= 0) return doClick();

      const wakeBefore = (document.visibilityState === 'visible') ? WAKE_VISIBLE_MS : WAKE_HIDDEN_MS;
      const coarseDelay = Math.max(0, diff - wakeBefore);

      updateStatus('coarse');
      coarse = setTimeout(finePhase, coarseDelay);

    }

    if (statusEl) {
      updateStatus('init');
      statusInterval = setInterval(() => updateStatus('wait'), 100);
    }

    if (attentionCfg?.enabled) {
      freezeAlert = csScheduleAlert(   // ← store the freeze() fn
        target,
        attentionCfg.leadMs,
        attentionCfg.soundEnabled,
        attentionCfg.flashEnabled,
        attentionCfg.notifyEnabled
      );
    }

    planFromNow();
    document.addEventListener('visibilitychange', planFromNow, { passive: true });

    return stopAll;
  }

  // ---------------- UI injection (upgrade-safe) ----------------
  function addGlobalStyle(css) {
    const head = document.head;
    if (!head) return;
    const style = document.createElement('style');
    style.type = 'text/css';
    style.textContent = css;
    head.appendChild(style);
  }

  function getBoolLS(key, defaultVal) {
    const v = localStorage.getItem(key);
    if (v == null) return defaultVal;
    return v === '1' || v === 'true';
  }

  function setBoolLS(key, val) {
    localStorage.setItem(key, val ? '1' : '0');
  }

  function ensureRows($tbody) {
    // Multiplier row
    if (!document.getElementById('CSlatMult')) {
      const storedMult = localStorage.getItem('CS.latencyMultiplier') || '0.25';
      $tbody.append(`
        <tr id="CSlatMultRow">
          <td>Multiplicador latência:</td>
          <td style="display:flex; align-items:center; gap:8px;">
            <input type="number" id="CSlatMult" step="0.05" min="0" max="2"
              value="${storedMult}" style="width:70px;">
            <span style="font-size:11px; color:#555;">
              × latência TW (0 = desligado; Auto Sender usa 0.25)
            </span>
          </td>
        </tr>
      `);
    }

    if (!document.getElementById('CSalertLead')) {
      $tbody.append(`
        <tr id="CSalertRow">
          <td>Alerta:</td>
          <td>
            <label style="margin-right:10px;">
              <input type="checkbox" id="CSalertSound"> Som
            </label>
            <label style="margin-right:10px;">
              <input type="checkbox" id="CSalertFlash"> Flash (aba/ícone)
            </label>
            <label style="margin-right:10px;">
              <input type="checkbox" id="CSalertNotify"> Notificação
            </label>
            <label>
              T- <input type="number" id="CSalertLead" style="width:70px;"> ms
            </label>
            <button type="button" id="CSalertTest" class="btn" style="margin-left:8px;">Testar alerta</button>
            <div style="margin-top:6px; font-size:11px; color:#555;">
              Nota: som no Chrome só funciona depois de clicar no botão (desbloqueio).
              Notificação pode pedir permissão.
            </div>
          </td>
        </tr>
      `);
    }

    if (!document.getElementById('CSstatus')) {
      $tbody.append(`
        <tr id="CSstatusRow">
          <td>Status:</td>
          <td><div id="CSstatus" style="font-family:monospace; font-size:11px; color:#555; line-height:1.25;"></div></td>
        </tr>
      `);
    }
  }

  function injectOrUpgradeUI(durationMs, $confirmBtn) {
    const $tbody = $('#command-data-form').find('tbody').first();
    if (!$tbody.length) return;

    if (!document.getElementById('CSbutton')) {
      const fineOffset = clampInt(Number(localStorage.getItem(LS_FINE_OFFSET) || '0'), -5000, 5000);
      const arrivalDefaultMs = getServerNowMs() + durationMs;

      $tbody.append(`
        <tr>
          <td>Chegada:</td>
          <td><input type="datetime-local" id="CStime" step="0.001"></td>
        </tr>
        <tr>
          <td>Offset (ms):</td>
          <td>
            <input type="number" id="CSoffset" style="width:90px;">
            <button type="button" id="CSbutton" class="btn">Confirmar (agendado)</button>
          </td>
        </tr>
      `);

      $('#CSoffset').val(String(fineOffset));
      $('#CStime').val(toDatetimeLocalMs(arrivalDefaultMs));
    }

    ensureRows($tbody);

    const alertLeadMs = clampInt(Number(localStorage.getItem(LS_ALERT_LEAD) || '10000'), 0, 60000);
    const alertSoundEnabled = getBoolLS(LS_ALERT_SOUND, true);
    const alertFlashEnabled = getBoolLS(LS_ALERT_FLASH, true);
    const alertNotifyEnabled = getBoolLS(LS_ALERT_NOTIFY, true);

    $('#CSalertLead').val(String(alertLeadMs));
    $('#CSalertSound').prop('checked', alertSoundEnabled);
    $('#CSalertFlash').prop('checked', alertFlashEnabled);
    $('#CSalertNotify').prop('checked', alertNotifyEnabled);

    $('#CSalertLead').off('change.cs input.cs').on('change.cs input.cs', () => {
      const v = clampInt(Number($('#CSalertLead').val() || 0), 0, 60000);
      $('#CSalertLead').val(String(v));
      localStorage.setItem(LS_ALERT_LEAD, String(v));
    });
    $('#CSalertSound').off('change.cs').on('change.cs', () => setBoolLS(LS_ALERT_SOUND, $('#CSalertSound').is(':checked')));
    $('#CSalertFlash').off('change.cs').on('change.cs', () => setBoolLS(LS_ALERT_FLASH, $('#CSalertFlash').is(':checked')));
    $('#CSalertNotify').off('change.cs').on('change.cs', () => setBoolLS(LS_ALERT_NOTIFY, $('#CSalertNotify').is(':checked')));

    // Persist latency multiplier
    $('#CSlatMult').off('change.cs input.cs').on('change.cs input.cs', () => {
      const raw = parseFloat($('#CSlatMult').val() || '0.25');
      const v   = (Number.isFinite(raw) && raw >= 0 && raw <= 2) ? raw : 0.25;
      $('#CSlatMult').val(String(v));
      localStorage.setItem('CS.latencyMultiplier', String(v));
    });

    $('#CSalertTest').off('click.cs').on('click.cs', async () => {
      await csUnlockAudio();
      await csEnsureNotificationPermission();
      const lead = clampInt(Number($('#CSalertLead').val() || 0), 0, 60000);
      csScheduleAlert(getServerNowMs() + lead, lead, $('#CSalertSound').is(':checked'), $('#CSalertFlash').is(':checked'), $('#CSalertNotify').is(':checked'));
    });

    $('#CSbutton').off('click.cs').on('click.cs', async function () {
      await csUnlockAudio();
      if ($('#CSalertNotify').is(':checked')) await csEnsureNotificationPermission();

      updateServerOffsetEstimate();

      const fineOffsetMs = clampInt(Number($('#CSoffset').val() || 0), -5000, 5000);
      localStorage.setItem(LS_FINE_OFFSET, String(fineOffsetMs));

      const arrivalMs = parseDatetimeLocalMs($('#CStime').val());
      if (!Number.isFinite(arrivalMs)) {
        alert('Data/hora inválida em "Chegada".');
        return;
      }

      const sendAtServerMs = arrivalMs - durationMs;

      $confirmBtn.addClass('btn-disabled');
      this.disabled = true;

      const attentionCfg = {
        enabled: true,
        leadMs: clampInt(Number($('#CSalertLead').val() || 0), 0, 60000),
        soundEnabled: $('#CSalertSound').is(':checked'),
        flashEnabled: $('#CSalertFlash').is(':checked'),
        notifyEnabled: $('#CSalertNotify').is(':checked')
      };

      scheduleClickAtServerMs(
        sendAtServerMs,
        fineOffsetMs,
        () => $confirmBtn.trigger('click'),
        $('#CSstatus'),
        attentionCfg
      );
    });
  }

  function boot() {
    if (!window.jQuery) return;
    if (!document.getElementById('command-data-form')) return;

    const $confirmBtn = $('#troop_confirm_submit');
    if (!$confirmBtn.length) return;

    const durationMs = readDurationMsFromForm();
    if (!Number.isFinite(durationMs) || durationMs <= 0) return;

    injectOrUpgradeUI(durationMs, $confirmBtn);
  }

  addGlobalStyle(`
    #CStime, #CSoffset, #CSalertLead { font-size: 9pt; font-family: Verdana,Arial; }
    #CSbutton { float:right; }
    #CSstatus { max-width: 560px; word-break: break-word; }
  `);

  const poll = setInterval(() => {
    if (document.getElementById('command-data-form') && window.jQuery) {
      boot();
      clearInterval(poll);
    }
  }, 50);
})();
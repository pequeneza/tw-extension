// ==UserScript==
// @name         xBot Auto Sender
// @version      2.0.0
// @description  Precision attack scheduler: Worker-based timer shim, performance.now busy-wait, queue watcher, place-page filler, confirm auto-click.
// @match        *://*.tribalwars.com.pt/game.php*
// @match        *://*.tribalwars.com.br/game.php*
// @grant        none
// ==/UserScript==

(function () {
  'use strict';
  if (window.__twAutoSenderRunning) return;
  window.__twAutoSenderRunning = true;

  /* ─── Constants ─────────────────────────────────────────────────────────── */
  var LS_QUEUE    = 'xbot_autosender_queue';
  var LS_ACTIVE   = 'xbot_autosender_active';
  var LS_SETTINGS = 'xbot_autosender_settings';
  var SS_CONF     = 'xbot_autosender_confirming';
  var SS_PAUSE    = 'xbot_autosender_paused';
  var CMD_TTL        = 90000;
  var FILL_TIMEOUT_MS = 6000; // max wait for unit_input_* to appear after coord input triggers AJAX re-render
  var UNIT_IDS       = ['spear','sword','axe','archer','spy','light','marcher','heavy','ram','catapult','snob','knight'];

  /* ─── Settings (live-reloadable) ─────────────────────────────────────────── */
  var SETTING_DEFAULTS = {
    lookahead: 40,
    openTabDelay: null,       // if set, overrides lookahead (seconds before launch to open place tab)
    clickOffset: 0,           // legacy: positive = click earlier (ms)
    timingOffset: 0,          // Kumin-style static offset (positive = click later, network compensation)
    autoTimingOffset: false,  // measure round-trip ping and use as offset
    timingOffsetMultiplier: 0.25, // multiply measured ping by this factor (matches Kumin default)
    autoSendNobles: true,     // auto-expand noble train on confirm page (like Kumin's autoSendNobles)
    autoClose: true,
  };
  var _settings = Object.assign({}, SETTING_DEFAULTS);
  function loadSettings() {
    try { _settings = Object.assign({}, SETTING_DEFAULTS,
                                    JSON.parse(localStorage.getItem(LS_SETTINGS) || '{}')); }
    catch (e) {}
    // Resolve effective open-tab delay: prefer explicit openTabDelay, fall back to lookahead
    _settings._openTabDelaySec = _settings.openTabDelay != null
      ? _settings.openTabDelay
      : (_settings.lookahead || 40);
  }
  loadSettings();

  /* ─── Server time ────────────────────────────────────────────────────────── */
  // serverDateDiff mirrors Kumin's calculateTimezoneDifference():
  //   local_now_truncated_to_minute - server_display_truncated_to_minute
  // Derived from #serverDate/#serverTime DOM elements so it does NOT cancel out the
  // server-drift correction inside Timing.getCurrentServerTime(). For Portugal players
  // (same timezone as server) this is ~0, so getEffectiveServerNowMs() ≈ Timing.getCurrentServerTime().
  // Computing the diff from Timing itself (prev approach) collapsed to Date.now() and caused ~300ms early fires.
  var _serverDateDiff = null;

  function computeServerDateDiff() {
    try {
      var dateEl = document.getElementById('serverDate');
      var timeEl = document.getElementById('serverTime');
      if (dateEl && timeEl) {
        var combined = (dateEl.innerText || dateEl.textContent || '').trim()
                     + ' '
                     + (timeEl.innerText || timeEl.textContent || '').trim();
        // Kumin regex: DD/MM/YYYY HH:MM[:SS]
        var m = combined.match(
          /^([0][1-9]|[12][0-9]|3[01])[\/\-]([0][1-9]|1[012])[\/\-](\d{4})( (0?[0-9]|[1][0-9]|[2][0-3])[:]([0-5][0-9])(?:[:]([0-5][0-9]))?)?$/
        );
        if (m) {
          // Kumin: reconstruct as MM/DD/YYYY HH:MM so new Date() parses in LOCAL timezone
          var serverStr = m[2] + '/' + m[1] + '/' + m[3] + (m[4] || '');
          var serverMs  = new Date(new Date(serverStr).setMilliseconds(0)).setSeconds(0);
          var localMs   = new Date(new Date().setMilliseconds(0)).setSeconds(0);
          _serverDateDiff = localMs - serverMs;
          return;
        }
      }
    } catch (e) {}
    _serverDateDiff = 0;
  }

  // Kumin: Timing.getCurrentServerTime() - serverDateDiff
  // fallback: Date.now()
  function getEffectiveServerNowMs() {
    if (_serverDateDiff === null) computeServerDateDiff();
    try {
      if (window.Timing && window.Timing.getCurrentServerTime) {
        return window.Timing.getCurrentServerTime() - _serverDateDiff;
      }
    } catch (e) {}
    return Date.now();
  }

  /* ─── Debug helpers ──────────────────────────────────────────────────────── */
  var _dbg = false; // set true to enable timing diagnostics in console
  function dbg() {
    if (!_dbg) return;
    var args = Array.prototype.slice.call(arguments);
    args[0] = '[AutoSender] ' + args[0];
    console.log.apply(console, args);
  }
  function dbgTimingDiag() {
    var hasTiming = !!(window.Timing && window.Timing.getCurrentServerTime);
    var srv  = hasTiming ? window.Timing.getCurrentServerTime() : null;
    var local = Date.now();
    dbg('TimingDiag: Timing available=%s  server=%s  Date.now=%s  drift=%s ms',
        hasTiming, srv, local, srv != null ? (srv - local) : 'N/A');
  }

  /* ─── Ping measurer (mirrors Kumin's getAverageTimingOffset) ────────────── */
  function measurePing(multiplier) {
    var mul = multiplier || 0.25;
    var samples = [];
    var intervalId = null;
    function takeSample() {
      var t0 = performance.now();
      var img = new Image();
      img.onload = img.onerror = function() { samples.push((performance.now() - t0) * mul); };
      // Kumin: uses window.location.hostname (not origin) — same pattern as _requestImage
      img.src = '//' + window.location.hostname + '?random-no-cache=' + Math.floor((1 + Math.random()) * 65536).toString(32);
    }
    takeSample();
    intervalId = setInterval(takeSample, 5000);
    return {
      getOffset: function() {
        clearInterval(intervalId);
        if (!samples.length) return 0;
        var sorted = samples.slice().sort(function(a, b) { return a - b; });
        var mid = Math.floor(sorted.length / 2);
        var median = sorted[mid];
        var mads = sorted.map(function(v) { return Math.abs(v - median); }).sort(function(a,b){return a-b;});
        var mad = mads[Math.floor(mads.length / 2)];
        var filtered = sorted.filter(function(v) { return Math.abs(v - median) <= 10 * mad; });
        if (!filtered.length) filtered = sorted;
        // exponential-weighted average: most recent sample gets highest weight
        var sumW = 0, sumVW = 0;
        filtered.forEach(function(v, i) {
          var w = Math.pow(0.8, filtered.length - 1 - i);
          sumVW += v * w; sumW += w;
        });
        var result = sumW > 0 ? sumVW / sumW : 0;
        console.log('[AutoSender] ping offset: ' + result.toFixed(1) + 'ms (samples: ' + filtered.length + ')');
        return result;
      }
    };
  }

  /* ─── nativeSet — bypasses React synthetic event system ─────────────────── */
  function nativeSet(el, value) {
    if (!el) return;
    var proto  = el.tagName === 'SELECT' ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
    var desc   = Object.getOwnPropertyDescriptor(proto, 'value');
    if (desc && desc.set) desc.set.call(el, value); else el.value = value;
    el.dispatchEvent(new Event('input',  { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  /* ─── Helpers ────────────────────────────────────────────────────────────── */
  function pad2(n) { return String(n).padStart(2, '0'); }
  function pad3(n) { return String(n).padStart(3, '0'); }
  function fmtTime(ms) {
    var d = new Date(ms);
    return pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds()) + '.' + pad3(d.getMilliseconds());
  }
  function genId() { return 'as_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8); }

  /* ─── Queue helpers ──────────────────────────────────────────────────────── */
  function readQueue()   { try { return JSON.parse(localStorage.getItem(LS_QUEUE) || '[]'); } catch (e) { return []; } }
  function writeQueue(q) { try { localStorage.setItem(LS_QUEUE, JSON.stringify(q)); } catch (e) {} }
  function updateStatus(id, st) {
    var q = readQueue();
    for (var i = 0; i < q.length; i++) { if (q[i].id === id) { q[i].status = st; writeQueue(q); return; } }
  }

  /* ─── Kumin format writer (twKuminGluer_queue) ───────────────────────────── */
  function launchMsToDatetimeLocal(ms) {
    var d = new Date(ms);
    return d.getFullYear() + '-' + pad2(d.getMonth()+1) + '-' + pad2(d.getDate()) +
      'T' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds()) + '.' + pad3(d.getMilliseconds());
  }
  function writeToKumin(entry) {
    try {
      if (!entry || !entry.launch) return false;
      var units = {};
      UNIT_IDS.forEach(function(u) { var n = (entry.units && entry.units[u]) || 0; if (n > 0) units[u] = n; });
      var kEntry = { name: entry.note || (entry.src + ' → ' + entry.tgt),
                     source: entry.src || '', target: entry.tgt || '',
                     date: launchMsToDatetimeLocal(entry.launch), commandType: 'Attack', units: units };
      var existing = [];
      try { existing = JSON.parse(localStorage.getItem('twKuminGluer_queue') || '[]'); } catch (e) {}
      existing.push(kEntry);
      localStorage.setItem('twKuminGluer_queue', JSON.stringify(existing));
      return true;
    } catch (e) { return false; }
  }

  /* ─── Public API (callable by planeador, gluer, etc.) ───────────────────── */
  function addToQueue(entry) {
    if (!entry || !entry.srcVillageId || !entry.launch) {
      console.error('[AutoSender] addToQueue: missing srcVillageId or launch');
      return null;
    }
    var q  = readQueue();
    var id = genId();
    q.push({ id: id, src: entry.src || '', tgt: entry.tgt || '',
             srcVillageId: entry.srcVillageId,
             tgtVillageId: entry.tgtVillageId || null,
             type:    (entry.type || 'attack').toLowerCase(),
             launch:  entry.launch, arrival: entry.arrival || 0,
             units:   entry.units  || {}, note: entry.note || '',
             catapultTarget:   entry.catapultTarget   || null,
             ntTemplate:       entry.ntTemplate       || null,
             sigilPct:         entry.sigilPct         != null ? entry.sigilPct         : 0,
             randomOffset:     entry.randomOffset     != null ? entry.randomOffset     : null,
             randomOffsetTime: entry.randomOffsetTime != null ? entry.randomOffsetTime : null,
             status:  'pending', createdAt: Date.now() });
    writeQueue(q);
    emitState();
    return id;
  }
  window.xbot_addToQueue   = addToQueue;
  window.xbot_writeToKumin = writeToKumin;
  window.xbot_readQueue    = readQueue;

  /* ─── CustomEvent bridge ─────────────────────────────────────────────────── */
  function emitState() {
    document.dispatchEvent(new CustomEvent('xbot:autosender:state', { detail: {
      queue:  readQueue(),
      active: !!localStorage.getItem(LS_ACTIVE),
      paused: !!sessionStorage.getItem(SS_PAUSE),
    }}));
  }
  document.addEventListener('xbot:autosender:run', function(e) {
    var d = (e.detail) || {};
    if      (d.action === 'clear')                   { writeQueue([]); emitState(); }
    else if (d.action === 'pause')                   { sessionStorage.setItem(SS_PAUSE, '1'); emitState(); }
    else if (d.action === 'resume')                  { sessionStorage.removeItem(SS_PAUSE); emitState(); }
    else if (d.action === 'remove' && d.id)          { writeQueue(readQueue().filter(function(e) { return e.id !== d.id; })); emitState(); }
    else if (d.action === 'getState')                { emitState(); }
    else if (d.action === 'applySettings') {
      if (d.settings) {
        try { localStorage.setItem(LS_SETTINGS, JSON.stringify(d.settings)); } catch (e) {}
      }
      loadSettings();
      emitState();
    }
  });

  /* ─── Status overlay ─────────────────────────────────────────────────────── */
  function showStatus(text, color) {
    var el = document.getElementById('__xbot_sender_overlay');
    if (!el) {
      el = document.createElement('div');
      el.id = '__xbot_sender_overlay';
      el.style.cssText = 'position:fixed;bottom:14px;left:14px;z-index:999999;padding:9px 14px;' +
        'border-radius:8px;font-family:monospace;font-size:13px;color:#fff;' +
        'box-shadow:0 4px 14px rgba(0,0,0,.45);pointer-events:none;white-space:pre;line-height:1.4';
      document.body.appendChild(el);
    }
    el.style.background = color || '#1e3a5f';
    el.textContent = text;
  }

  /* ─── Precision scheduler (Kumin-style: 2 s pre-fire + full busy-wait) ──── */
  // getOffsetFn (optional): called at start of busy-wait phase; returns ms to add to targetServerMs.
  // Positive = click later (network compensation, Kumin convention).
  // onFinePhase (optional): called at entry of the 2-s busy-wait window, BEFORE the while() loop.
  function scheduleClickAtMs(targetServerMs, clickFn, getOffsetFn, onFinePhase) {
    var stopped = false;
    function doClick() {
      if (stopped) return;
      stopped = true;
      try { clickFn(); } catch (err) { console.error('[AutoSender] clickFn:', err); }
    }

    function finePhase() {
      if (stopped) return;
      try { if (onFinePhase) onFinePhase(); } catch (e) {}
      try { if (window.Timing && window.Timing.resetTickHandlers) window.Timing.resetTickHandlers(); } catch (e) {}
      // Kumin: pingOffset resolved at fine-phase entry, same timing as getAveragePing() call
      var offset = (getOffsetFn ? getOffsetFn() : 0);
      // Kumin exact: remaining = launchTime + pingOffset - (Timing.getCurrentServerTime() - serverDateDiff)
      var remaining = targetServerMs + offset - getEffectiveServerNowMs();
      dbg('finePhase: target=%s  now=%s  offset=%s  remaining=%s ms',
          targetServerMs, getEffectiveServerNowMs(), offset, remaining.toFixed(1));
      // Kumin exact busy-wait: performance.now() - perfStart < remaining
      var perfStart = performance.now();
      while (!stopped && performance.now() - perfStart < remaining) {}
      dbg('click fired: delta=%s ms  (+ = late, - = early)',
          (getEffectiveServerNowMs() - (targetServerMs + offset)).toFixed(1));
      doClick();
    }

    // Fire 2000 ms before target, matching Kumin's "launchTime - serverTime - 2000"
    var serverNowAtSchedule = getEffectiveServerNowMs();
    var coarseWait = Math.max(0, (targetServerMs - serverNowAtSchedule) - 2000);
    dbg('scheduleClickAtMs: target=%s  serverNow=%s  coarseWait=%s ms',
        targetServerMs, serverNowAtSchedule, coarseWait.toFixed(0));
    dbgTimingDiag();
    var t = setTimeout(finePhase, coarseWait);

    function onVis() {
      if (!stopped && (targetServerMs - getEffectiveServerNowMs()) < 2100) { clearTimeout(t); finePhase(); }
    }
    document.addEventListener('visibilitychange', onVis, { passive: true });

    return function stop() { stopped = true; clearTimeout(t); document.removeEventListener('visibilitychange', onVis); };
  }

  /* ─── Kumin-style worker timer (prevents background-tab throttling) ──────── */
  var _workerScript = null;
  var _worker = null;
  var _fakeIdToCallback = {};
  var _lastFakeId = 0;

  function _getFakeId() {
    do {
      _lastFakeId = _lastFakeId === 2147483647 ? 0 : _lastFakeId + 1;
    } while (_fakeIdToCallback.hasOwnProperty(_lastFakeId));
    return _lastFakeId;
  }

  function initWorkerTimers() {
    if (/MSIE 10/i.test(navigator.userAgent)) return;
    try {
      var blob = new Blob([
        'var fakeIdToId={};' +
        'onmessage=function(e){' +
          'var d=e.data,name=d.name,fakeId=d.fakeId,time;' +
          'if(d.hasOwnProperty("time"))time=d.time;' +
          'switch(name){' +
            'case "setInterval":fakeIdToId[fakeId]=setInterval(function(){postMessage({fakeId:fakeId});},time);break;' +
            'case "clearInterval":if(fakeIdToId.hasOwnProperty(fakeId)){clearInterval(fakeIdToId[fakeId]);delete fakeIdToId[fakeId];}break;' +
            'case "setTimeout":fakeIdToId[fakeId]=setTimeout(function(){postMessage({fakeId:fakeId});if(fakeIdToId.hasOwnProperty(fakeId))delete fakeIdToId[fakeId];},time);break;' +
            'case "clearTimeout":if(fakeIdToId.hasOwnProperty(fakeId)){clearTimeout(fakeIdToId[fakeId]);delete fakeIdToId[fakeId];}break;' +
          '}' +
        '}'
      ]);
      _workerScript = window.URL.createObjectURL(blob);
    } catch (e) {
      console.error('[AutoSender] Error creating worker blob.', e);
      return;
    }
    _overwriteTimers();
  }

  function _overwriteTimers() {
    if (typeof Worker === 'undefined') {
      console.error('[AutoSender] Web Worker not supported.');
      return;
    }
    try {
      _worker = new Worker(_workerScript);
      window.setInterval = function(callback, ms) {
        var id = _getFakeId();
        _fakeIdToCallback[id] = { callback: callback, parameters: Array.prototype.slice.call(arguments, 2) };
        _worker.postMessage({ name: 'setInterval', fakeId: id, time: ms });
        return id;
      };
      window.clearInterval = function(id) {
        if (_fakeIdToCallback.hasOwnProperty(id)) {
          delete _fakeIdToCallback[id];
          _worker.postMessage({ name: 'clearInterval', fakeId: id });
        }
      };
      window.setTimeout = function(callback, ms) {
        var id = _getFakeId();
        _fakeIdToCallback[id] = { callback: callback, parameters: Array.prototype.slice.call(arguments, 2), isTimeout: true };
        _worker.postMessage({ name: 'setTimeout', fakeId: id, time: ms });
        return id;
      };
      window.clearTimeout = function(id) {
        if (_fakeIdToCallback.hasOwnProperty(id)) {
          delete _fakeIdToCallback[id];
          _worker.postMessage({ name: 'clearTimeout', fakeId: id });
        }
      };
      _worker.onmessage = function(e) {
        var fakeId = e.data.fakeId;
        if (!_fakeIdToCallback.hasOwnProperty(fakeId)) return;
        var entry = _fakeIdToCallback[fakeId];
        var fn = entry.callback;
        var params = entry.parameters;
        if (entry.isTimeout) delete _fakeIdToCallback[fakeId];
        if (typeof fn === 'string') { try { fn = new Function(fn); } catch (err) { return; } }
        if (typeof fn === 'function') fn.apply(window, params);
      };
      _worker.onerror = function(e) { console.error('[AutoSender] Worker error:', e); };
    } catch (e) {
      console.error('[AutoSender] Error starting worker timers.', e);
    }
  }

  /* ─── Confirm countdown overlay ─────────────────────────────────────────── */
  function fmtCd(diff) {
    var sign = diff < 0 ? '-' : '';
    var abs  = Math.floor(Math.abs(diff));
    var h    = Math.floor(abs / 3600000);
    var m    = Math.floor((abs % 3600000) / 60000);
    var s    = Math.floor((abs % 60000) / 1000);
    var ms   = abs % 1000;
    return sign + pad2(h) + ':' + pad2(m) + ':' + pad2(s) + '.' + pad3(ms);
  }

  function buildUnitIcons(units) {
    var html = '';
    UNIT_IDS.forEach(function(u) {
      var n = (units && units[u]) || 0;
      if (n <= 0) return;
      html += '<span style="display:inline-flex;align-items:center;gap:3px;margin:3px 5px;">' +
        '<img src="https://dspt.innogamescdn.com/asset/b2fb8d33/graphic/unit/unit_' + u + '.webp"' +
        ' style="width:20px;height:20px;" alt="' + u + '">' +
        '<span style="font-size:12px;color:#d4a84b;font-weight:600;">' + n + '</span>' +
        '</span>';
    });
    return html;
  }

  function showConfirmCountdown(cmd, launchMs) {
    // Full-screen blur backdrop
    var backdrop = document.getElementById('__xbot_backdrop');
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.id = '__xbot_backdrop';
      backdrop.style.cssText = 'position:fixed;inset:0;z-index:999998;' +
        'backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);' +
        'background:rgba(5,8,20,0.55);';
      document.body.appendChild(backdrop);
    }

    // Centered overlay — fixed width so countdown never shifts layout
    var el = document.getElementById('__xbot_confirm_overlay');
    if (!el) {
      el = document.createElement('div');
      el.id = '__xbot_confirm_overlay';
      el.style.cssText = [
        'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:999999;',
        'width:400px;',
        'background:linear-gradient(160deg,#0d1525 0%,#0a1020 100%);',
        'border:1px solid rgba(180,130,40,0.45);border-radius:16px;',
        'padding:22px 32px 20px;font-family:"Trebuchet MS",sans-serif;',
        'color:#e8d9b0;text-align:center;',
        'box-shadow:0 20px 60px rgba(0,0,0,0.85),inset 0 1px 0 rgba(255,220,120,0.08);',
        'user-select:none;',
      ].join('');
      document.body.appendChild(el);
    }

    var unitHtml = buildUnitIcons(cmd.units);

    function render() {
      var diff  = launchMs - getEffectiveServerNowMs();
      // color: gold > 60s, amber 10-60s, red < 10s
      var color = diff > 60000 ? '#d4a84b' : diff > 10000 ? '#e07b28' : '#cc3333';
      var glow  = diff > 60000
        ? '0 0 24px rgba(212,168,75,0.35)'
        : diff > 10000
          ? '0 0 24px rgba(224,123,40,0.4)'
          : '0 0 24px rgba(204,51,51,0.5)';

      el.innerHTML = [
        /* header */
        '<div style="font-size:10px;color:#5a6a7a;letter-spacing:0.12em;margin-bottom:10px;">⚡ XBOT AUTO SENDER</div>',

        /* src → tgt */
        '<div style="font-size:14px;color:#b8a882;margin-bottom:10px;">',
          '<span style="color:#8a9aaa">' + (cmd.src || '') + '</span>',
          '&nbsp;<span style="color:#4a5a6a">→</span>&nbsp;',
          '<span style="color:#d4c8a8">' + (cmd.tgt || '') + '</span>',
        '</div>',

        /* unit icons */
        unitHtml
          ? '<div style="margin-bottom:12px;min-height:26px;">' + unitHtml + '</div>'
          : '',

        /* countdown label */
        '<div style="font-size:10px;color:#4a5a6a;letter-spacing:0.06em;margin-bottom:4px;">PARTIDA EM</div>',

        /* countdown — fixed-width wrapper prevents layout shift */
        '<div style="width:100%;text-align:center;margin-bottom:6px;">',
          '<span style="',
            'display:inline-block;width:280px;',
            'font-size:38px;font-weight:700;font-family:"Courier New",monospace;',
            'font-variant-numeric:tabular-nums;letter-spacing:0.02em;',
            'color:' + color + ';text-shadow:' + glow + ';line-height:1.1;',
          '">' + fmtCd(diff) + '</span>',
        '</div>',

        /* timestamp + note */
        '<div style="font-size:10px;color:#3a4a5a;margin-top:8px;">',
          fmtTime(launchMs),
          (cmd.note ? '&nbsp;·&nbsp;<span style="color:#5a6a4a">' + cmd.note + '</span>' : ''),
        '</div>',
      ].join('');
    }

    render();
    var tickId = setInterval(render, 50);
    el._tickId = tickId;
  }

  function hideConfirmCountdown() {
    var el = document.getElementById('__xbot_confirm_overlay');
    if (el) { if (el._tickId) clearInterval(el._tickId); el.remove(); }
    var bd = document.getElementById('__xbot_backdrop');
    if (bd) bd.remove();
  }

  // Stop the 50ms render tick WITHOUT removing the overlay (called at busy-wait entry)
  function stopCountdownTick() {
    var el = document.getElementById('__xbot_confirm_overlay');
    if (el && el._tickId) { clearInterval(el._tickId); el._tickId = null; }
  }

  /* ─── Place page handler ─────────────────────────────────────────────────── */
  function handlePlacePage() {
    var raw = localStorage.getItem(LS_ACTIVE);
    if (!raw) return;
    var cmd;
    try { cmd = JSON.parse(raw); } catch (e) { localStorage.removeItem(LS_ACTIVE); return; }
    if (!cmd || (Date.now() - (cmd.writtenAt || 0)) > CMD_TTL) { localStorage.removeItem(LS_ACTIVE); return; }

    // Consume immediately so other tabs cannot steal it
    localStorage.removeItem(LS_ACTIVE);

    var gd = window.game_data;
    if (gd && cmd.srcVillageId && gd.village && String(gd.village.id) !== String(cmd.srcVillageId)) {
      showStatus('AutoSender: erro — aldeia errada!', '#b91c1c');
      updateStatus(cmd.id, 'failed');
      return;
    }

    showStatus('AutoSender: a preencher formulário...', '#1d4ed8');
    updateStatus(cmd.id, 'place_open');

    // Fill coord autocomplete
    var coordInput = document.querySelector(
      '.target-input-field.target-input-autocomplete,' +
      '.target-input-autocomplete,' +
      'input.ui-autocomplete-input[id*="target"],' +
      'input.ui-autocomplete-input'
    );
    if (coordInput && cmd.tgt) { coordInput.focus(); nativeSet(coordInput, cmd.tgt); }

    // Wait for unit inputs to appear before filling — the troop form may not be rendered
    // yet when game_data becomes available, and setting the coord input can trigger a TW
    // AJAX re-render that briefly removes unit_input_* elements from the DOM.
    var _fillDeadline = Date.now() + FILL_TIMEOUT_MS;
    function _fillUnitsAndProceed() {
      var spearEl = document.getElementById('unit_input_spear');
      if (!spearEl && Date.now() < _fillDeadline) {
        setTimeout(_fillUnitsAndProceed, 100); // 100ms: tighter than whenReady to catch brief AJAX re-renders
        return;
      }

      UNIT_IDS.forEach(function(unit) {
        var count = (cmd.units && cmd.units[unit]) || 0;
        if (count <= 0) return;
        var el = document.getElementById('unit_input_' + unit);
        if (el) nativeSet(el, String(count));
      });

      updateStatus(cmd.id, 'place_filled');

      // Store full cmd for confirm handler — timing happens there
      try { sessionStorage.setItem(SS_CONF, JSON.stringify(cmd)); } catch (e) {}

      // Click attack or support button based on cmd.type (like Kumin)
      var isSupport = (cmd.type || '').toLowerCase() === 'support';
      setTimeout(function() {
        var btn = isSupport
          ? (document.getElementById('target_support')
              || document.querySelector('input[name="support"]')
              || document.querySelector('input[type="submit"][value*="Apoiar"]')
              || document.querySelector('input[type="submit"][value*="Support"]'))
          : (document.getElementById('target_attack')
              || document.querySelector('input[name="attack"]')
              || document.querySelector('input[type="submit"][value*="Atac"]')
              || document.querySelector('input[type="submit"][value*="Attack"]'));
        if (btn) {
          showStatus('AutoSender: a navegar para confirmação...', '#1d4ed8');
          btn.click();
        } else {
          showStatus('AutoSender: erro — botão ' + (isSupport ? 'apoio' : 'atacar') + ' não encontrado!', '#b91c1c');
          updateStatus(cmd.id, 'failed');
          try { sessionStorage.removeItem(SS_CONF); } catch (e) {}
        }
      }, 400);
    }
    _fillUnitsAndProceed();
  }

  /* ─── Noble-train expander (mirrors Kumin's startNT) ────────────────────── */
  function startNT(cmd) {
    var snobCount = (cmd.units && cmd.units.snob) || 0;
    if (snobCount < 2) return;
    var clicks = snobCount - 1;
    for (var ni = 0; ni < clicks; ni++) {
      (function(idx) {
        setTimeout(function() {
          var trainBtn = document.getElementById('troop_confirm_train');
          if (trainBtn) trainBtn.click();
        }, idx * 200);
      })(ni);
    }
  }

  /* ─── Confirm page handler ───────────────────────────────────────────────── */
  function handleConfirmPage() {
    var raw;
    try { raw = sessionStorage.getItem(SS_CONF); } catch (e) {}
    if (!raw) return;
    var cmd;
    try { cmd = JSON.parse(raw); } catch (e) { return; }
    if (!cmd || !cmd.launch) return;

    // Error box: TW rejected the attack (like Kumin's error_box check)
    if (document.getElementsByClassName('error_box')[0]) {
      updateStatus(cmd.id, 'failed');
      try { sessionStorage.removeItem(SS_CONF); } catch (e) {}
      showStatus('AutoSender: erro na confirmação!', '#b91c1c');
      setTimeout(function() { try { window.close(); } catch (e) {} }, 1500);
      return;
    }

    updateStatus(cmd.id, 'submitted');

    var effectiveLaunch = cmd.randomOffsetTime || cmd.launch;

    // Catapult target (like Kumin: #place_confirm_catapult_target)
    if (cmd.catapultTarget) {
      var catSelect = document.querySelector('#place_confirm_catapult_target select');
      if (catSelect) catSelect.value = cmd.catapultTarget;
    }

    // Noble-train expansion: click #troop_confirm_train (snob-1) times (gated by autoSendNobles)
    if (_settings.autoSendNobles !== false) startNT(cmd);

    // Show countdown overlay immediately (mirrors Kumin's timer render in setupAttack)
    showConfirmCountdown(cmd, effectiveLaunch);

    // 3000 ms delay before entering the timing sequence — mirrors Kumin's
    // setTimeout(prepareToSend, 3000) in setupAttack. DO NOT REMOVE OR SHORTEN.
    setTimeout(function() {

      // Start ping measurement inside the delay, same as Kumin's _0x1e1de0.start()
      // inside prepareToSend (called after the 3000 ms wait).
      var pinger = _settings.autoTimingOffset
        ? measurePing(_settings.timingOffsetMultiplier)
        : null;

      // Offset resolver: called at the start of the 2-s busy-wait window.
      // autoTimingOffset → freeze pinger (like Kumin's getAveragePing())
      // else → use static timingOffset setting
      // Legacy clickOffset is applied as a negative shift (positive = earlier)
      function resolveOffset() {
        var base = _settings.autoTimingOffset
          ? (pinger ? pinger.getOffset() : 0)
          : (_settings.timingOffset || 0);
        return base - (_settings.clickOffset || 0);
      }

      // Pre-cache the confirm button so the click path after the busy-wait is minimal.
      var _confirmBtn = document.getElementById('troop_confirm_submit')
        || document.querySelector('.troop_confirm_go')
        || (function() {
            var btns = document.querySelectorAll('input[type="submit"]');
            for (var i = 0; i < btns.length; i++) { if (/confirmar|confirm/i.test(btns[i].value)) return btns[i]; }
            return null;
          })();

      scheduleClickAtMs(effectiveLaunch, function() {
        // Click FIRST — every ms of work before this adds directly to timing error.
        var _clickDeltaMs = getEffectiveServerNowMs() - effectiveLaunch;
        if (_confirmBtn) {
          _confirmBtn.click();
          // Post-click work (no longer on the critical timing path).
          updateStatus(cmd.id, 'sent');
          emitState();
          hideConfirmCountdown();
          var _deltaStr = (_clickDeltaMs >= 0 ? '+' : '') + _clickDeltaMs.toFixed(0) + 'ms';
          showStatus('AutoSender: enviado! (' + _deltaStr + ')' + (_settings.autoClose ? ' A fechar...' : ''), '#15803d');
          try { sessionStorage.removeItem(SS_CONF); } catch (e) {}
          if (_settings.autoClose !== false) {
            setTimeout(function() { try { window.close(); } catch (e) {} }, 1800);
          }
        } else {
          hideConfirmCountdown();
          showStatus('AutoSender: erro — botão confirmar não encontrado!', '#b91c1c');
          updateStatus(cmd.id, 'failed');
        }
      }, resolveOffset, stopCountdownTick);

    }, 3000); // mirrors Kumin setupAttack → setTimeout(prepareToSend, 3000)
  }

  /* ─── Watcher ────────────────────────────────────────────────────────────── */
  function runWatcher() {
    function tick() {
      if (sessionStorage.getItem(SS_PAUSE))  return;
      if (localStorage.getItem(LS_ACTIVE))   return;

      var q   = readQueue();
      var now = getEffectiveServerNowMs();
      var emitNeeded = false;

      for (var i = 0; i < q.length; i++) {
        var e     = q[i];
        if (e.status !== 'pending') continue;
        var effectiveLaunch = e.randomOffsetTime || e.launch;
        var until = effectiveLaunch - now;
        if (until > _settings._openTabDelaySec * 1000) continue;
        if (effectiveLaunch < now - 10000) {
          // Re-read queue before writing so a concurrent clear/remove isn't overwritten.
          updateStatus(e.id, 'failed');
          emitNeeded = true;
          continue;
        }

        var active = { id: e.id, src: e.src, tgt: e.tgt,
                       srcVillageId: e.srcVillageId, tgtVillageId: e.tgtVillageId,
                       type: (e.type || 'attack').toLowerCase(),
                       launch: e.launch, arrival: e.arrival, units: e.units, note: e.note || '',
                       catapultTarget:   e.catapultTarget   || null,
                       ntTemplate:       e.ntTemplate       || null,
                       sigilPct:         e.sigilPct         != null ? e.sigilPct         : 0,
                       randomOffset:     e.randomOffset     != null ? e.randomOffset     : null,
                       randomOffsetTime: e.randomOffsetTime != null ? e.randomOffsetTime : null,
                       writtenAt: Date.now() };
        try { localStorage.setItem(LS_ACTIVE, JSON.stringify(active)); } catch (err) {}

        // Re-read queue before writing launching status so a concurrent clear isn't overwritten.
        var q2 = readQueue();
        for (var j = 0; j < q2.length; j++) { if (q2[j].id === e.id) { q2[j].status = 'launching'; writeQueue(q2); break; } }
        emitNeeded = true;

        var url = location.origin + '/game.php?village=' + e.srcVillageId + '&screen=place';
        if (e.tgtVillageId) url += '&target=' + e.tgtVillageId;
        window.open(url, '_blank');
        break; // one at a time
      }

      if (emitNeeded) emitState();
    }

    setInterval(tick, 1000);
    setInterval(emitState, 5000);
    tick();
  }

  /* ─── Boot ───────────────────────────────────────────────────────────────── */
  function whenReady(cb) {
    var tries = 0;
    var poll = setInterval(function() {
      if (++tries > 40) { clearInterval(poll); return; }
      if (window.$ && window.game_data) { clearInterval(poll); cb(); }
    }, 200);
  }

  initWorkerTimers();

  whenReady(function() {
    var params = new URLSearchParams(location.search);
    var screen = params.get('screen') || '';
    var tryVal = params.get('try')    || '';

    if (screen === 'place' && tryVal === 'confirm') {
      handleConfirmPage();
    } else if (screen === 'place') {
      handlePlacePage();
    } else {
      runWatcher();
    }
    emitState();
  });
})();

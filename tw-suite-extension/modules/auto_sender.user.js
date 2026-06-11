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
  var LS_QUEUE         = 'xbot_autosender_queue';
  var LS_ACTIVE        = 'xbot_autosender_active';
  var LS_SETTINGS      = 'xbot_autosender_settings';
  var SS_CONF          = 'xbot_autosender_confirming';
  var SS_PAUSE         = 'xbot_autosender_paused';
  var SS_SC_ACTIVE     = 'xbot_snipe_cancel_active';     // sessionStorage flag → cancel pending on next place load
  var SC_PENDING_PFX   = 'xbot_snipe_cancel_pending_';  // snipe-cancel phase key
  var CMD_TTL        = 90000;
  var FILL_TIMEOUT_MS = 6000; // max wait for unit_input_* to appear after coord input triggers AJAX re-render
  var UNIT_IDS       = ['spear','sword','axe','archer','spy','light','marcher','heavy','ram','catapult','snob','knight'];

  // noblesQnt values taken directly from Kumin's ntTemplates object.
  var NT_COUNT = {
    noNT: 1,
    twoNoblesSame: 2, threeNoblesSame: 3, fourNoblesSame: 4, fiveNoblesSame: 5,
    secondNobleWithRest: 2, thirdNobleWithRest: 3, fourNobleWithRest: 4, fiveNobleWithRest: 5,
    splitSecondThirdNobleNT: 4, secondNobleBuffNT: 4, thirdNobleBuffNT: 4,
    secondNobleBuffWith5NoblesNT: 5, secondNobleBuffWith2NoblesNT: 2,
    firstNobleRedNT: 4, secondNobleRedNT: 4, thirdNobleRedNT: 4, fourthNobleRedNT: 4,
    firstNobleRed5NT: 5, secondNobleRed5NT: 5, thirdNobleRed5NT: 5,
  };

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
    // Always use lookahead — openTabDelay is deprecated and ignored
    _settings._openTabDelaySec = _settings.lookahead || 40;
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
  function _sitterPrefix() {
    var t = new URLSearchParams(location.search).get('t');
    return t ? 't=' + t + '&' : '';
  }

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
             cancelAfterMs:    entry.cancelAfterMs    != null ? entry.cancelAfterMs    : null,
             gapAfterMs:       entry.gapAfterMs       != null ? entry.gapAfterMs       : null,
             gapBeforeMs:      entry.gapBeforeMs      != null ? entry.gapBeforeMs      : null,
             travelMs:         entry.travelMs         != null ? entry.travelMs         : null,
             status:  'pending', createdAt: Date.now() });
    q.sort(function(a, b) { return a.launch - b.launch; });
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
    else if (d.action === 'addToQueue' && d.entry)   { addToQueue(d.entry); }
    else if (d.action === 'applySettings') {
      if (d.settings) {
        try { localStorage.setItem(LS_SETTINGS, JSON.stringify(d.settings)); } catch (e) {}
      }
      loadSettings();
      emitState();
    }
    else if (d.action === 'updateEntry' && d.id && d.patch) {
      var q4 = readQueue();
      for (var m = 0; m < q4.length; m++) {
        if (q4[m].id === d.id) {
          var p = d.patch;
          if (p.type     != null) q4[m].type     = p.type;
          if (p.note     != null) q4[m].note     = p.note;
          if (p.arrival  != null) q4[m].arrival  = p.arrival;
          if (p.launch   != null) q4[m].launch   = p.launch;
          if (p.travelMs != null) q4[m].travelMs = p.travelMs;
          if (p.sigilPct    != null) q4[m].sigilPct    = p.sigilPct;
          if (p.ntTemplate  != null) q4[m].ntTemplate  = p.ntTemplate;
          if (p.units    != null) q4[m].units    = p.units;
          writeQueue(q4);
          break;
        }
      }
      emitState();
    }
    else if (d.action === 'sendNow' && d.id) {
      var q3 = readQueue();
      for (var k = 0; k < q3.length; k++) {
        if (q3[k].id === d.id && q3[k].status === 'pending') {
          q3[k].launch = getEffectiveServerNowMs() + (_settings._openTabDelaySec * 1000);
          writeQueue(q3);
          break;
        }
      }
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
      // Kumin: pingOffset resolved at fine-phase entry, same timing as getAveragePing() call
      var offset = (getOffsetFn ? getOffsetFn() : 0);
      // Kumin exact: remaining = launchTime + pingOffset - (Timing.getCurrentServerTime() - serverDateDiff)
      // resetTickHandlers moved to AFTER remaining is captured so server time is still live
      var remaining = targetServerMs + offset - getEffectiveServerNowMs();
      dbg('finePhase: target=%s  now=%s  offset=%s  remaining=%s ms',
          targetServerMs, getEffectiveServerNowMs(), offset, remaining.toFixed(1));
      try { if (window.Timing && window.Timing.resetTickHandlers) window.Timing.resetTickHandlers(); } catch (e) {}
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

  /* ─── Conquest messages ─────────────────────────────────────────────────── */

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
    // Pick message once per attack — never re-randomized during the countdown.
    var _msgs  = (typeof __xbot_msgs !== 'undefined' ? __xbot_msgs : {});
    var _pool  = ((cmd.type || '').toLowerCase() === 'support' ? _msgs.support : _msgs.attack) || [];
    var conquestMsg = _pool.length ? _pool[Math.floor(Math.random() * _pool.length)] : '';

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

    // Static parts written once — avoids re-rendering on every 50ms tick.
    // Show full NT train count if template is set (e.g. twoNoblesSame → snob: 2)
    var _displayUnits = cmd.units;
    var _ntTotal = (cmd.ntTemplate && cmd.ntTemplate !== 'noNT') ? (NT_COUNT[cmd.ntTemplate] || 1) : 0;
    if (_ntTotal > 1) _displayUnits = Object.assign({}, cmd.units, { snob: _ntTotal });
    var unitHtml = buildUnitIcons(_displayUnits);
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
        ? '<div style="margin-bottom:10px;min-height:26px;">' + unitHtml + '</div>'
        : '',

      /* conquest message — chosen once, shown below troops */
      conquestMsg
        ? '<div style="margin-bottom:14px;padding:8px 0;' +
            'border-top:1px solid rgba(180,130,40,0.18);border-bottom:1px solid rgba(180,130,40,0.18);' +
            'font-size:11px;color:#7a6a4a;font-style:italic;letter-spacing:0.015em;line-height:1.45;">' +
            '&#9876;&nbsp;' + conquestMsg + '</div>'
        : '',

      /* countdown label */
      '<div style="font-size:10px;color:#4a5a6a;letter-spacing:0.06em;margin-bottom:4px;">PARTIDA EM</div>',

      /* countdown span — only textContent/color updated by render() */
      '<div style="width:100%;text-align:center;margin-bottom:6px;">',
        '<span id="__xbot_cd_span" style="',
          'display:inline-block;width:280px;',
          'font-size:38px;font-weight:700;font-family:"Courier New",monospace;',
          'font-variant-numeric:tabular-nums;letter-spacing:0.02em;',
          'color:#d4a84b;line-height:1.1;">…</span>',
      '</div>',

      /* timestamp + note */
      '<div style="font-size:10px;color:#3a4a5a;margin-top:8px;">',
        fmtTime(launchMs),
        (cmd.note ? '&nbsp;·&nbsp;<span style="color:#5a6a4a">' + cmd.note + '</span>' : ''),
      '</div>',
    ].join('');

    var cdSpan = el.querySelector('#__xbot_cd_span');

    // render() only updates the countdown number — static parts above are untouched.
    function render() {
      if (!cdSpan) return;
      var diff  = launchMs - getEffectiveServerNowMs();
      cdSpan.textContent = fmtCd(diff);
      cdSpan.style.color      = diff > 60000 ? '#d4a84b' : diff > 10000 ? '#e07b28' : '#cc3333';
      cdSpan.style.textShadow = diff > 60000
        ? '0 0 24px rgba(212,168,75,0.35)'
        : diff > 10000
          ? '0 0 24px rgba(224,123,40,0.4)'
          : '0 0 24px rgba(204,51,51,0.5)';
    }

    render();
    el._tickId = setInterval(render, 50);

    // Separate 1s interval for document.title — kept out of the 50ms hot path
    // to avoid DOM write overhead near the performance.now() busy-wait.
    function renderTitle() {
      var diff = launchMs - getEffectiveServerNowMs();
      document.title = '⚡ ' + fmtCd(diff) + (cmd.tgt ? ' → ' + cmd.tgt : '');
    }
    renderTitle();
    el._titleTickId = setInterval(renderTitle, 1000);
  }

  function hideConfirmCountdown() {
    var el = document.getElementById('__xbot_confirm_overlay');
    if (el) {
      if (el._tickId)      clearInterval(el._tickId);
      if (el._titleTickId) clearInterval(el._titleTickId);
      el.remove();
    }
    var bd = document.getElementById('__xbot_backdrop');
    if (bd) bd.remove();
  }

  // Stop the 50ms render tick WITHOUT removing the overlay (called at busy-wait entry)
  function stopCountdownTick() {
    var el = document.getElementById('__xbot_confirm_overlay');
    if (el && el._tickId)      { clearInterval(el._tickId);      el._tickId      = null; }
    if (el && el._titleTickId) { clearInterval(el._titleTickId); el._titleTickId = null; }
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
    // Persist the xbot_sender flag so the confirm page (which won't have xbot_sender=1 in URL)
    // can also suppress competing scripts (mano_de_deus, Kumin, etc.).
    try { sessionStorage.setItem('xbot_sender_tab', '1'); } catch(e) {}

    var gd = window.game_data;
    var _pageVillageId = new URLSearchParams(location.search).get('village')
      || (gd && gd.village && String(gd.village.id));
    if (_pageVillageId && cmd.srcVillageId && String(_pageVillageId) !== String(cmd.srcVillageId)) {
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
  // Returns ms until all NT expansion clicks are complete (so caller can delay the overlay).
  // Delays are based on the template's noblesQnt so the overlay waits even if the button
  // isn't in the DOM yet at call time — each setTimeout callback re-queries the button.
  function startNT(cmd) {
    var nt     = cmd.ntTemplate && cmd.ntTemplate !== 'noNT' ? cmd.ntTemplate : null;
    var clicks = nt
      ? Math.max(0, (NT_COUNT[nt] || 1) - 1)
      : Math.max(0, ((cmd.units && cmd.units.snob) || 0) - 1);

    if (clicks <= 0) {
      if (nt) setTimeout(function() { fillNT(nt); }, 1200);
      return 0;
    }

    // Schedule expansion clicks — button re-queried at each fire time (same as Kumin)
    for (var ni = 0; ni < clicks; ni++) {
      (function(idx) {
        setTimeout(function() {
          var trainBtn = document.getElementById('troop_confirm_train');
          if (trainBtn) trainBtn.click();
        }, idx * 200);
      })(ni);
    }

    // Fill function at 1200ms (like Kumin's eval(fillFunction)())
    if (nt) setTimeout(function() { fillNT(nt); }, 1200);

    return clicks * 200 + 100; // delay until last click + buffer
  }

  /* ─── NT fill functions (ported from Kumin) ─────────────────────────────── */
  function _ntRow(i) { return (document.getElementsByClassName('units-row')[i] || {}).childNodes; }
  function _trainUi(i) {
    var els = document.getElementsByClassName('train-ui');
    var idx = i;
    if (els[idx] && !els[idx].childNodes[5]) idx = idx + 1;
    return (els[idx] || {}).childNodes;
  }
  function _hasArcher() { return window.gameData && Array.isArray(window.gameData.units) && window.gameData.units.includes('archer'); }
  function _hasKnight() { return window.gameData && Array.isArray(window.gameData.units) && window.gameData.units.includes('knight'); }
  function _updateSum() { try { window.Place.confirmScreen.updateUnitsSum(); } catch(e) {} }
  function _setVal(nodes, idx, val) { if (nodes && nodes[idx] && nodes[idx].childNodes[0]) nodes[idx].childNodes[0].value = val; }
  function _getVal(nodes, idx) { return nodes && nodes[idx] && nodes[idx].childNodes[0] ? parseInt(nodes[idx].childNodes[0].textContent) || 0 : 0; }

  function fillNT(nt) {
    try {
      switch (nt) {
        case 'twoNoblesSame':   return _fillNSame(2);
        case 'threeNoblesSame': return _fillNSame(3);
        case 'fourNoblesSame':  return _fillNSame(4);
        case 'fiveNoblesSame':  return _fillNSame(5);
        case 'splitSecondThirdNobleNT':      return _fill2nd3rdNoblesNT();
        case 'secondNobleBuffNT':             return _fill2ndNobleBuffNT();
        case 'thirdNobleBuffNT':              return _fill3rdNobleBuffNT();
        case 'secondNobleBuffWith5NoblesNT':  return _fill2ndNobleBuffWith5NoblesNT();
        case 'secondNobleBuffWith2NoblesNT':  return _fill2ndNobleBuffWith2NoblesNT();
        case 'secondNobleRedNT':              return _fill2ndNobleRedNT();
        case 'thirdNobleRedNT':               return _fill3rdNobleRedNT();
        case 'fourthNobleRedNT':              return _fill4thNobleRedNT();
        case 'secondNobleRed5NT':             return _fill2ndNobleRed5NT();
        case 'thirdNobleRed5NT':              return _fill3rdNobleRed5NT();
        // no-op templates (Kumin also has empty functions for these):
        // secondNobleWithRest/thirdNobleWithRest/fourNobleWithRest/fiveNobleWithRest
        // firstNobleRedNT / firstNobleRed5NT / noNT
      }
    } catch(e) { console.warn('[AutoSender] fillNT error:', e); }
  }

  // Copy row 0 units to rows 1..N-1
  function _fillNSame(n) {
    var row0 = _ntRow(0);
    if (!row0) return;
    for (var r = 1; r < n; r++) {
      var rowR = _ntRow(r);
      if (!rowR) continue;
      for (var c = 3; c < rowR.length - 1; c++) {
        var src = row0[c + 2];
        var dst = rowR[c];
        if (src && src.childNodes[0] && dst && dst.childNodes[0])
          dst.childNodes[0].value = src.childNodes[0].textContent;
      }
    }
    _updateSum();
  }

  function _buffCommon(rows, n) {
    var hasArcher = _hasArcher(), hasKnight = _hasKnight();
    var lightIdx  = hasArcher ? 8 : 7;
    var archerOff = hasArcher ? 1 : 0;
    var knightOff = hasKnight ? 1 : 0;
    var nobleIdx  = lightIdx + 4 + archerOff + knightOff;
    var axeIdx    = hasArcher ? 6 : 5;
    var ui = _trainUi(1);
    var archer = hasArcher ? _getVal(ui, lightIdx + 1) : 0;
    var light  = _getVal(ui, lightIdx);
    var ram    = _getVal(ui, lightIdx + 2 + archerOff);
    var cat    = _getVal(ui, lightIdx + 3 + archerOff);
    // Clear expanded rows
    for (var r = 1; r < n; r++) {
      var row = _ntRow(r); if (!row) continue;
      for (var c = 1; c < row.length - 1; c++) { if (row[c] && row[c].childNodes[0]) row[c].childNodes[0].value = ''; }
    }
    return { hasArcher: hasArcher, hasKnight: hasKnight, lightIdx: lightIdx, archerOff: archerOff, knightOff: knightOff, nobleIdx: nobleIdx, axeIdx: axeIdx, archer: archer, light: light, ram: ram, cat: cat, ui: ui };
  }

  function _fill2nd3rdNoblesNT() {
    var b    = _buffCommon([1,2,3], 4);
    var spear = _getVal(b.ui, 5);
    var spl   = Math.floor((parseInt(spear) - parseInt(_getVal(_ntRow(0), 5))) / 2);  // simplified split
    // row1
    var r1 = _ntRow(1); _setVal(r1, 3, spl); _setVal(r1, b.axeIdx, b.light); if (b.archer > 0) _setVal(r1, b.axeIdx + 1, b.archer); _setVal(r1, b.nobleIdx, 1);
    // row2
    var r2 = _ntRow(2); _setVal(r2, 3, spl); _setVal(r2, b.axeIdx, b.light); _setVal(r2, b.nobleIdx, 1);
    // row3
    var r3 = _ntRow(3); _setVal(r3, 3, 1000); _setVal(r3, b.nobleIdx, 1);
    _updateSum();
  }

  function _fillBuffNT(buffRow, totalRows, extraCatBase) {
    var b    = _buffCommon(null, totalRows);
    var spear = parseInt((_trainUi(1)[5] || {childNodes:[{textContent:'0'}]}).childNodes[0].textContent) || 0;
    var axe   = 5000 - b.light - b.archer - 1;
    var spearBuff = 1000;
    var needed    = 2000 + (1000 - (b.ram + b.cat)) + (extraCatBase || 0) * 1000;
    if (axe > spear - needed)   axe = spear - needed;
    else if (axe < spear - needed) spearBuff = spear - 2000 - axe;
    if (axe < 0) axe = 0;
    // row buffRow gets the buff
    var rb = _ntRow(buffRow); _setVal(rb, 3, axe); _setVal(rb, b.axeIdx, b.light); if (b.archer > 0) _setVal(rb, b.axeIdx + 1, b.archer); _setVal(rb, b.nobleIdx, 1);
    // other rows get spear + noble only
    for (var r = 1; r < totalRows; r++) {
      if (r === buffRow) continue;
      var rx = _ntRow(r);
      _setVal(rx, 3, r === 2 && buffRow !== 2 ? spearBuff : 1000);
      _setVal(rx, b.axeIdx, 0);
      _setVal(rx, b.nobleIdx, 1);
    }
    _updateSum();
  }

  function _fill2ndNobleBuffNT()            { _fillBuffNT(1, 4, 0); }
  function _fill3rdNobleBuffNT()            { _fillBuffNT(2, 4, 0); }
  function _fill2ndNobleBuffWith5NoblesNT() { _fillBuffNT(1, 5, 1); }
  function _fill2ndNobleBuffWith2NoblesNT() {
    var b = _buffCommon(null, 2);
    var spear = parseInt((_trainUi(1)[5] || {childNodes:[{textContent:'0'}]}).childNodes[0].textContent) || 0;
    var axe = 5000 - b.light - b.archer - 1;
    if (axe > spear - 3000) axe = spear - 3000;
    if (axe < 0) axe = 0;
    var r1 = _ntRow(1); _setVal(r1, 3, axe); _setVal(r1, b.axeIdx, b.light); if (b.archer > 0) _setVal(r1, b.axeIdx + 1, b.archer); _setVal(r1, b.nobleIdx, 1);
    _updateSum();
  }

  function _fillRedNT(redRow, totalRows, spearOverride) {
    var b = _buffCommon(null, totalRows);
    var spear = parseInt((_trainUi(1)[5] || {childNodes:[{textContent:'0'}]}).childNodes[0].textContent) || 0;
    var spearRed = spear - 100; if (spearRed < 0) spearRed = 0;
    for (var r = 1; r < totalRows; r++) {
      var rx = _ntRow(r);
      if (r === redRow) {
        _setVal(rx, 3, spearRed); _setVal(rx, b.axeIdx, b.light); if (b.archer > 0) _setVal(rx, b.axeIdx + 1, b.archer);
        _setVal(rx, b.axeIdx + 2 + b.archerOff, b.ram); _setVal(rx, b.axeIdx + 3 + b.archerOff, b.cat);
        _setVal(rx, b.nobleIdx, 1);
      } else {
        _setVal(rx, 3, spearOverride != null ? spearOverride : 33); _setVal(rx, b.nobleIdx, 1);
      }
    }
    _updateSum();
  }

  function _fill2ndNobleRedNT()  { _fillRedNT(1, 4, 33); }
  function _fill3rdNobleRedNT()  { _fillRedNT(2, 4, 33); }
  function _fill4thNobleRedNT()  { _fillRedNT(3, 4, 33); }

  function _fillRed5NT(redRow, totalRows) {
    var b = _buffCommon(null, totalRows);
    var spear = parseInt((_trainUi(1)[5] || {childNodes:[{textContent:'0'}]}).childNodes[0].textContent) || 0;
    var spearRed = spear - 34 - 100; if (spearRed < 0) spearRed = 0;
    for (var r = 1; r < totalRows; r++) {
      var rx = _ntRow(r);
      if (r === redRow) {
        _setVal(rx, 3, spearRed); _setVal(rx, b.axeIdx, b.light); if (b.archer > 0) _setVal(rx, b.axeIdx + 1, b.archer);
        _setVal(rx, b.axeIdx + 2 + b.archerOff, b.ram); _setVal(rx, b.axeIdx + 3 + b.archerOff, b.cat);
        _setVal(rx, b.nobleIdx, 1);
      } else {
        _setVal(rx, 3, 25); _setVal(rx, b.nobleIdx, 1);
      }
    }
    _updateSum();
  }

  function _fill2ndNobleRed5NT()  { _fillRed5NT(1, 5); }
  function _fill3rdNobleRed5NT()  { _fillRed5NT(2, 5); }

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

    // NT expansion always runs when ntTemplate is explicitly set (overrides autoSendNobles)
    var _hasExplicitNT = cmd.ntTemplate && cmd.ntTemplate !== 'noNT';
    var _ntDelay = (_settings.autoSendNobles !== false || _hasExplicitNT) ? startNT(cmd) : 0;

    // Select NT template type dropdown if present on the confirm page
    if (cmd.ntTemplate && cmd.ntTemplate !== 'noNT') {
      var ntSelect = document.querySelector('#troop_confirm_type, select[name="type"]');
      if (ntSelect) ntSelect.value = cmd.ntTemplate;
    }

    // Show countdown overlay only after NT expansion is done (so the UI reflects the final state)
    setTimeout(function() { showConfirmCountdown(cmd, effectiveLaunch); }, _ntDelay);

    // 3000 ms delay before entering the timing sequence — mirrors Kumin's
    // setTimeout(prepareToSend, 3000) in setupAttack. DO NOT REMOVE OR SHORTEN.
    // Shifted by _ntDelay so timing budget is preserved.
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
        if (_confirmBtn) {
          _confirmBtn.click();
          // Measure delta immediately after click — matches Kumin's zero-work-before-click pattern.
          var _clickDeltaMs = getEffectiveServerNowMs() - effectiveLaunch;
          // Post-click work (no longer on the critical timing path).
          updateStatus(cmd.id, 'sent');
          emitState();
          hideConfirmCountdown();
          try { sessionStorage.removeItem(SS_CONF); } catch (e) {}
          var _sp = { id: cmd.id, src: cmd.src, tgt: cmd.tgt, type: cmd.type,
                      units: cmd.units, launch: cmd.launch, arrival: cmd.arrival,
                      note: cmd.note || '', cancelAfterMs: cmd.cancelAfterMs || null,
                      gapAfterMs: cmd.gapAfterMs || null, gapBeforeMs: cmd.gapBeforeMs || null,
                      travelMs: cmd.travelMs || null };
          setTimeout(function() {
            document.dispatchEvent(new CustomEvent('xbot:autosender:sent', { detail: _sp }));
          }, 0);

          if (cmd.gapAfterMs && cmd.gapBeforeMs) {
            // Write cancel pending state BEFORE the confirm click fires so it's
            // available immediately when TW redirects back to screen=place.
            var _cancelCmdId = 'snipe_' + cmd.id;
            var _sentAt = Date.now();
            var _midGap = Math.floor((cmd.gapAfterMs + cmd.gapBeforeMs) / 2);

            if (_midGap <= _sentAt) {
              showStatus('AutoSender: janela de cancelamento passou!', '#b91c1c');
              setTimeout(function() { try { window.close(); } catch(e) {} }, 1500);
            } else {
            var _cancelMs = Math.max(2000, Math.round((_midGap - _sentAt) / 2 / 1000) * 1000);
            var _sentMs   = _sentAt % 1000;
            var _gapMsLo  = cmd.gapAfterMs  % 1000;
            var _gapMsHi  = cmd.gapBeforeMs % 1000;
            // Supports have priority over attacks at the same ms, so the lower bound is
            // inclusive: arriving at the same ms as the first attack in the gap still
            // lands the support before that attack is processed.
            var _msOk     = _gapMsLo === _gapMsHi
              ? (_sentMs === _gapMsLo)
              : (_sentMs >= _gapMsLo && _sentMs <= _gapMsHi);
            var _retryEntry = {
              src: cmd.src, tgt: cmd.tgt, srcVillageId: cmd.srcVillageId,
              type: cmd.type, units: cmd.units, note: cmd.note,
              gapAfterMs: cmd.gapAfterMs, gapBeforeMs: cmd.gapBeforeMs,
            };
            var _scPayload = JSON.stringify({
              village: cmd.srcVillageId, cancelMs: _cancelMs,
              cmdId: _cancelCmdId, sentAt: _sentAt,
              gapAfterMs: cmd.gapAfterMs, gapBeforeMs: cmd.gapBeforeMs,
              note: cmd.note || null, retryEntry: _retryEntry,
            });
            // Persist state in localStorage (survives navigation) + sessionStorage flag
            try { localStorage.setItem(SC_PENDING_PFX + _cancelCmdId, _scPayload); } catch(e) {}
            try { sessionStorage.setItem(SS_SC_ACTIVE, _cancelCmdId); } catch(e) {}
            // Clear LS_ACTIVE so handlePlacePage doesn't refill the form on the redirect
            try { localStorage.removeItem(LS_ACTIVE); } catch(e) {}
            if (_msOk) {
              showStatus('AutoSender: enviado (ms:' + _sentMs + ')! Cancelar em ' + Math.round(_cancelMs/1000) + 's…', '#0d9488');
            } else {
              showStatus('AutoSender: ms ' + _sentMs + ' fora da janela. A cancelar e tentar novamente…', '#d97706');
            }
            // TW naturally redirects to screen=place after confirm — no manual navigate needed
            }
          } else {
            var _deltaStr = (_clickDeltaMs >= 0 ? '+' : '') + _clickDeltaMs.toFixed(0) + 'ms';
            if (_settings.autoClose !== false) {
              // Set flag BEFORE navigation so the landing page can close the tab.
              // A setTimeout-based close is cancelled when TW navigates away from this page.
              try { sessionStorage.setItem('xbot_autoclose', '1'); } catch(e) {}
            }
            showStatus('AutoSender: enviado! (' + _deltaStr + ')' + (_settings.autoClose !== false ? ' A fechar...' : ''), '#15803d');
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
                       cancelAfterMs:    e.cancelAfterMs    != null ? e.cancelAfterMs    : null,
                       gapAfterMs:       e.gapAfterMs       != null ? e.gapAfterMs       : null,
                       gapBeforeMs:      e.gapBeforeMs      != null ? e.gapBeforeMs      : null,
                       travelMs:         e.travelMs         != null ? e.travelMs         : null,
                       writtenAt: Date.now() };
        try { localStorage.setItem(LS_ACTIVE, JSON.stringify(active)); } catch (err) {}

        // Re-read queue before writing launching status so a concurrent clear isn't overwritten.
        var q2 = readQueue();
        for (var j = 0; j < q2.length; j++) { if (q2[j].id === e.id) { q2[j].status = 'launching'; writeQueue(q2); break; } }
        emitNeeded = true;

        var sitterPfx = e.sitterT ? 't=' + e.sitterT + '&' : _sitterPrefix();
        var url = location.origin + '/game.php?' + sitterPfx + 'village=' + e.srcVillageId + '&screen=place&xbot_sender=1';
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

  // On AutoSender tabs: synchronously rename the confirm button before Kumin's async-loaded
  // script can execute. Kumin looks for #troop_confirm_submit by ID — removing the ID
  // prevents it from finding or clicking the button. AutoSender finds the button via
  // value matching (existing fallback) and still clicks it precisely.
  // This runs synchronously in the same JS tick as Kumin's $.ajax call, guaranteeing it
  // completes before any network response can fire Kumin's script.
  (function() {
    var _isSenderTab = false;
    try { _isSenderTab = sessionStorage.getItem('xbot_sender_tab') === '1'; } catch(e) {}
    if (_isSenderTab) {
      try {
        var _btn = document.getElementById('troop_confirm_submit');
        if (_btn) _btn.removeAttribute('id');
        // Also keep history.replaceState for any URL-checking logic in Kumin
        if (location.search.indexOf('xbot_sender=1') === -1) {
          history.replaceState(null, '', location.href + '&xbot_sender=1');
        }
      } catch(e) {}
    }
  })();

  // Close-after-send: if the confirm click set this flag, close on whatever page TW landed on
  var _shouldAutoClose = false;
  try { _shouldAutoClose = sessionStorage.getItem('xbot_autoclose') === '1'; } catch(e) {}
  if (_shouldAutoClose) {
    try { sessionStorage.removeItem('xbot_autoclose'); } catch(e) {}
    var _closeIn = 3;
    document.title = '✓ Enviado · A fechar em ' + _closeIn + 's';
    var _closeTick = setInterval(function() {
      _closeIn--;
      if (_closeIn <= 0) {
        clearInterval(_closeTick);
        document.title = '✓ A fechar…';
        try { window.close(); } catch(e) {}
      } else {
        document.title = '✓ Enviado · A fechar em ' + _closeIn + 's';
      }
    }, 1000);
    return; // skip watcher / place / confirm logic on this tab
  }

  initWorkerTimers();

  /* ─── Snipe-cancel phase handler ────────────────────────────────────────── */
  function handleSnipeCancel(p) {
    var _retrying = false;
    var cancelAt  = null; // set by _initFromDOM once actual ms is read from DOM

    // Countdown overlay
    var backdrop = document.createElement('div');
    backdrop.style.cssText = 'position:fixed;inset:0;z-index:999998;backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);background:rgba(5,8,20,0.55);';
    var dialog = document.createElement('div');
    dialog.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:999999;width:380px;background:linear-gradient(160deg,#0d1525 0%,#0a1020 100%);border:1px solid rgba(180,130,40,0.45);border-radius:16px;padding:22px 32px 20px;font-family:"Trebuchet MS",sans-serif;color:#e8d9b0;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.85);user-select:none;';
    var titleEl = document.createElement('div');
    titleEl.style.cssText = 'font-size:13px;letter-spacing:0.08em;color:#a89060;margin-bottom:6px;text-transform:uppercase;';
    titleEl.textContent = '🔄 Snipe Cancel — A aguardar comando…';
    var infoEl = document.createElement('div');
    infoEl.style.cssText = 'font-size:12px;color:#7a8fa6;margin-bottom:16px;';
    infoEl.textContent = 'Aldeia ' + p.village + (p.note ? ' · ' + p.note : '');
    var timerEl = document.createElement('div');
    timerEl.style.cssText = 'font-size:38px;font-weight:700;font-family:monospace;font-variant-numeric:tabular-nums;letter-spacing:0.04em;';
    dialog.appendChild(titleEl); dialog.appendChild(infoEl); dialog.appendChild(timerEl);
    document.body.appendChild(backdrop); document.body.appendChild(dialog);

    function fmtCd(ms) {
      if (ms <= 0) return '00:00:00';
      var t = Math.floor(ms / 1000);
      return ('0'+Math.floor(t/3600)).slice(-2)+':'+('0'+Math.floor((t%3600)/60)).slice(-2)+':'+('0'+(t%60)).slice(-2);
    }

    var tickId = null;
    var done = false;
    var _cancelScheduled = false;

    // Once cancelAt is known, schedule the cancel click using the same
    // scheduleClickAtMs precision engine as the confirm-button firing:
    // performance.now() busy-wait, getEffectiveServerNowMs() for drift correction,
    // visibilitychange early-entry, SharedWorker-backed coarse timer.
    function _scheduleCancelClick() {
      if (_cancelScheduled || cancelAt === null || done) return;
      _cancelScheduled = true;
      scheduleClickAtMs(cancelAt, doCancel, null, null);
    }

    // Repurpose the overlay to show a "gap missed" message + close countdown
    function showMissedFeedback(headline, detail, closeMs) {
      titleEl.textContent = headline;
      titleEl.style.color = '#e0a020';
      infoEl.textContent  = detail;
      var closeAt = Date.now() + (closeMs || 8000);
      var fbTick = setInterval(function() {
        var left = closeAt - Date.now();
        if (left <= 0) {
          clearInterval(fbTick);
          backdrop.remove(); dialog.remove();
          try { window.close(); } catch(e) {}
          return;
        }
        timerEl.style.fontSize = '22px';
        timerEl.style.color    = '#e0a020';
        timerEl.textContent    = 'A fechar em ' + Math.ceil(left / 1000) + 's';
      }, 200);
    }

    function doCancel() {
      if (done) return;
      done = true;
      if (tickId) { clearInterval(tickId); tickId = null; }
      localStorage.removeItem(SC_PENDING_PFX + p.cmdId);

      var cancelLinks = Array.from(document.querySelectorAll('a.command-cancel[data-home]'))
        .filter(function(a) { return a.getAttribute('data-home') === p.village; });

      if (!cancelLinks.length) {
        var rc = (p.reloadCount || 0) + 1;
        if (rc >= 3) { console.error('[AutoSender SC] Sem link de cancelamento. A desistir.'); backdrop.remove(); dialog.remove(); setTimeout(function() { try { window.close(); } catch(e) {} }, 1000); return; }
        localStorage.setItem(SC_PENDING_PFX + p.cmdId, JSON.stringify(Object.assign({}, p, { reloadCount: rc })));
        try { sessionStorage.setItem(SS_SC_ACTIVE, p.cmdId); } catch(e) {} // re-arm for reload
        location.reload(); return;
      }

      var cancelClickTime = Date.now();
      cancelLinks[0].click();
      console.log('[AutoSender SC] Apoio cancelado.');

      // Retry if ms missed the gap window
      if (_retrying && p.retryEntry) {
        var _sentAt2        = p.sentAt || cancelClickTime;
        var _expectedReturn = cancelClickTime + (cancelClickTime - _sentAt2);
        var _gapMid = Math.floor(((p.gapAfterMs || 0) + (p.gapBeforeMs || 0)) / 2);
        // Buffer must exceed the watcher's lookahead (default 40 s) so the place tab does not
        // open before troops are back. +2 s keeps the retry fast while ensuring the new tab
        // fires after the expected return.
        var _lookahead  = ((_settings && _settings._openTabDelaySec) || 40) * 1000;
        var _retryBuf   = _lookahead + 2000;
        var _rl  = _expectedReturn + _retryBuf;
        // Adjust ms component of _rl to match midGap so the return lands exactly there
        var _targetMs = _gapMid % 1000;
        _rl += (_targetMs - (_rl % 1000) + 1000) % 1000;
        var _ncm = Math.round((_gapMid - _rl) / 2 / 1000) * 1000;
        if (_gapMid > _rl + 2000 && _ncm > 2000) {
          addToQueue(Object.assign({}, p.retryEntry, { launch: _rl, arrival: _gapMid, cancelAfterMs: _ncm }));
          console.log('[AutoSender SC] Retry na fila (launch ' + new Date(_rl).toLocaleTimeString('pt-PT') + ', cancelar em ' + Math.round(_ncm / 1000) + 's)');
          document.title = '⚠️ Gap perdido — a reagendar';
          showMissedFeedback('⚠️ Gap perdido — a reagendar',
            'ms fora da janela. Nova tentativa às ' + new Date(_rl).toLocaleTimeString('pt-PT'), 8000);
        } else {
          console.warn('[AutoSender SC] Janela passou — sem retry.');
          document.title = '❌ Gap perdido';
          showMissedFeedback('❌ Gap perdido', 'Sem tempo para nova tentativa.', 8000);
        }
        return;
      }

      // Success path — keep overlay up briefly so the user can see the result
      document.title = '✓ Cancelado — tropas a regressar';
      titleEl.textContent = '✓ Snipe Cancel — concluído!';
      titleEl.style.color = '#22c55e';
      infoEl.textContent  = 'Tropas a regressar para ' + (p.village || 'aldeia') + (p.note ? ' · ' + p.note : '');
      timerEl.style.fontSize = '20px';
      timerEl.style.color    = '#4ade80';
      timerEl.textContent    = '✓';
      setTimeout(function() { backdrop.remove(); dialog.remove(); }, 6000);
      setTimeout(function() { try { window.close(); } catch(e) {} }, 6500);
    }

    function render() {
      if (cancelAt === null) { timerEl.textContent = '…'; return; }
      var left = cancelAt - Date.now();
      if (left <= 0) { doCancel(); return; }
      document.title = '⛔ NÃO FECHAR — ' + fmtCd(left);
      timerEl.textContent = fmtCd(left);
    }

    // Poll for command to appear; read actual ms from DOM, rename, then set cancelAt
    function _initFromDOM(attempt) {
      if (done) return;
      var links = Array.from(document.querySelectorAll('a.command-cancel[data-home]'))
        .filter(function(a) { return a.getAttribute('data-home') === p.village; });

      if (!links.length) {
        if (attempt < 3) { setTimeout(function() { _initFromDOM(attempt + 1); }, 3000); return; }
        _applyEstimate(); return; // command never appeared after 9 s — fall back to sentAt estimate
      }

      // Read actual ms from the command row: <td>…:<span class="grey small">752</span></td>
      var row      = links[0].closest('tr');
      var msEl     = row && row.querySelector('span.grey.small');
      var actualMs = msEl ? parseInt(msEl.textContent.trim(), 10) : NaN;

      var _gapLo  = (p.gapAfterMs  || 0) % 1000;
      var _gapHi  = (p.gapBeforeMs || 0) % 1000;
      var _midGap = Math.floor(((p.gapAfterMs || 0) + (p.gapBeforeMs || 0)) / 2);

      if (!isNaN(actualMs) && p.gapAfterMs && p.gapBeforeMs) {
        // Supports have priority over attacks at the same ms, so the lower bound is
        // inclusive: arriving at the same ms as the first attack in the gap still
        // lands the support before that attack is processed.
        var _msOk = _gapLo === _gapHi
          ? (actualMs === _gapLo)                         // exact match when both boundaries share the same ms
          : _gapLo < _gapHi
            ? (actualMs >= _gapLo && actualMs <= _gapHi)
            : (actualMs >= _gapLo || actualMs <= _gapHi); // wraparound across 1-second boundary
        if (_msOk) {
          // Good ms: rename via TW's quickedit-out widget, then compute cancelAt from actual DOM ms
          if (p.note) {
            var qeSpan    = row.querySelector('span.quickedit-out');
            var renameBtn = row.querySelector('a.rename-icon');
            if (renameBtn && qeSpan) {
              renameBtn.click(); // opens inline input
              setTimeout(function() {
                var inp = qeSpan.querySelector('input[type="text"]');
                if (inp) {
                  inp.value = p.note;
                  inp.dispatchEvent(new Event('input', { bubbles: true }));
                  var confirm = qeSpan.querySelector('a.rename-confirm, a[data-type="confirm"], a.quickedit-btn-confirm');
                  if (confirm) {
                    confirm.click();
                    console.log('[AutoSender SC] Renomeado (quickedit): ' + p.note);
                  } else {
                    inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
                    console.log('[AutoSender SC] Renomeado via Enter: ' + p.note);
                  }
                }
              }, 400);
            }
          }
          var _sentSec    = Math.floor((p.sentAt || Date.now()) / 1000) * 1000;
          var _sentWithMs = _sentSec + actualMs;
          var _cancelMs   = Math.max(2000, Math.round((_midGap - _sentWithMs) / 2 / 1000) * 1000);
          // Use midGap-based formula: cancelAt = _midGap - _cancelMs + 20.
          // This equals TW_sentAt + _cancelMs + 20 regardless of whether _sentWithMs is
          // off by ±1000ms (local clock drift). _sentWithMs + _cancelMs + 20 is vulnerable
          // because a 1-second error in _sentWithMs propagates directly to cancelAt.
          cancelAt = _midGap - _cancelMs + 20;
          if (cancelAt < Date.now() + 2000) cancelAt = Date.now() + 2020;
          console.log('[AutoSender SC] ms=' + actualMs + ' ok. Cancelar em ' + Math.round(_cancelMs/1000) + 's às ' + new Date(cancelAt).toLocaleTimeString('pt-PT'));
          titleEl.textContent = '🔄 Snipe Cancel — Aguardando cancelamento';
          _scheduleCancelClick();
        } else {
          // Bad ms: cancel immediately, retry after troops return
          _retrying = true;
          cancelAt  = Date.now() + 2020;
          console.warn('[AutoSender SC] ms=' + actualMs + ' fora da janela (' + _gapLo + '-' + _gapHi + ']. Cancelar e tentar novamente.');
          titleEl.textContent = '🔄 Snipe Cancel — ms fora da janela, a cancelar…';
          _scheduleCancelClick();
        }
      } else {
        _applyEstimate();
      }
    }

    // Fallback when actual ms is unavailable: use sentAt estimate
    function _applyEstimate() {
      if (!p.gapAfterMs || !p.sentAt) { cancelAt = Date.now() + Math.max(2000, p.cancelMs || 2000) + 20; _scheduleCancelClick(); return; }
      var _midGap = Math.floor((p.gapAfterMs + p.gapBeforeMs) / 2);
      var _est    = Math.max(2000, Math.round((_midGap - p.sentAt) / 2 / 1000) * 1000);
      cancelAt    = p.sentAt + _est + 20; // 20ms into the valid window
      if (cancelAt < Date.now() + 2000) cancelAt = Date.now() + 2020;
      titleEl.textContent = '🔄 Snipe Cancel — Aguardando cancelamento';
      _scheduleCancelClick();
    }

    render();
    tickId = setInterval(render, 200);
    _initFromDOM(0);
  }

  whenReady(function() {
    var params = new URLSearchParams(location.search);
    var screen = params.get('screen') || '';
    var tryVal = params.get('try')    || '';

    if (screen === 'place' && tryVal === 'confirm') {
      handleConfirmPage();
    } else if (screen === 'place') {
      // Check for a snipe-cancel pending on this place page load.
      // TW redirects naturally to screen=place after confirm — we detect it via
      // the sessionStorage flag written just before the confirm click.
      var scId = null;
      try { scId = sessionStorage.getItem(SS_SC_ACTIVE); } catch(e) {}
      if (scId) {
        var scPending = null;
        try { scPending = JSON.parse(localStorage.getItem(SC_PENDING_PFX + scId) || 'null'); } catch(e) {}
        if (scPending) {
          try { sessionStorage.removeItem(SS_SC_ACTIVE); } catch(e) {} // consume flag
          handleSnipeCancel(scPending);
        } else {
          handlePlacePage();
        }
      } else {
        handlePlacePage();
      }
    } else {
      runWatcher();
    }
    emitState();
  });
})();

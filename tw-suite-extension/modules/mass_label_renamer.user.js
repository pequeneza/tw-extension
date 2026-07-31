// ==UserScript==
// @name         Renomeador BITO v4
// @version      4.2.1
// @description  BITO colour buttons on every incoming row + row painting.
// @match        https://*.tribalwars.com.pt/game.php*screen=overview_villages*mode=incomings*
// @match        https://*.tribalwars.com.pt/game.php*screen=overview*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function () {
  'use strict';

  if (window.__twMassRenamerLoaded) return;
  window.__twMassRenamerLoaded = true;

  // ── Extension config ─────────────────────────────────────────────────────────
  var _cfg          = (window.__twSuiteCfg && window.__twSuiteCfg('mass_label_renamer')) || {};
  var minDelayMs    = (_cfg.minDelaySeconds  !== undefined ? _cfg.minDelaySeconds  : 120) * 1000;
  var randomExtraMs = (_cfg.randomExtraMax   !== undefined ? _cfg.randomExtraMax   : 30)  * 1000;

  // Per-profile multiplier (persisted once, same pattern as fingerprint-shield.ts's
  // seed): without it, every xBot install shares the exact same base±spread
  // ranges, which is a recognizable tool signature independent of the
  // per-call Math.random() noise already applied below.
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

  // Adds random jitter to fixed UI-automation delays so repeated runs (and
  // different installs of this script) don't produce an identical, mechanically
  // precise timing signature.
  function jitter(baseMs, spreadMs) {
    return Math.max(0, Math.round(baseMs * _jitterMult + (Math.random() * 2 - 1) * spreadMs * _jitterMult));
  }

  // Performs one quickedit rename with minimal pacing: open the inline
  // editor, type the new value, then save. Each pause is jittered to keep
  // the timing from being mechanically identical run-to-run.
  // buildValue(currentVal) -> newVal; onDone(success) called once finished.
  function performRename($row, buildValue, onDone) {
    $row.find('.rename-icon').click();
    setTimeout(function () {
      var $input = $row.find('input[type=text]');
      if (!$input.length) { if (onDone) onDone(false); return; }
      $input.val(buildValue($input.val()));
      setTimeout(function () {
        $row.find('input[type=button]').click();
        if (onDone) onDone(true);
      }, jitter(100, 50));
    }, jitter(200, 100));
  }

  // ── User preferences ────────────────────────────────────────────────────────
  var tamanho_letra     = 10;

  var pagina_de_ataques    = _cfg.highlightMode || 'coluna';
  var kbEnabled            = _cfg.kbEnabled !== undefined ? _cfg.kbEnabled : true;
  var originBadgeEnabled   = _cfg.originBadgeEnabled  !== undefined ? _cfg.originBadgeEnabled  : true;
  var autoFakeEnabled      = _cfg.autoFakeEnabled      !== undefined ? _cfg.autoFakeEnabled      : false;
  var autoFakeWindowMs     = (_cfg.autoFakeWindowSec   !== undefined ? _cfg.autoFakeWindowSec    : 10) * 1000;
  var pageDelayMs          =  _cfg.pageDelayMs         !== undefined ? _cfg.pageDelayMs          : 1500;

  var isIncomingsPage = location.href.indexOf('screen=overview_villages') !== -1 &&
                        location.href.indexOf('mode=incomings') !== -1;

  // ── Paged auto-label state machine ──────────────────────────────────────────
  var AUTOLABEL_RUN_KEY = 'mlr_autolabel_run';

  function getRunState() {
    try { var r = sessionStorage.getItem(AUTOLABEL_RUN_KEY); return r ? JSON.parse(r) : null; }
    catch (e) { return null; }
  }
  function setRunState(s) {
    try {
      if (s) sessionStorage.setItem(AUTOLABEL_RUN_KEY, JSON.stringify(s));
      else   sessionStorage.removeItem(AUTOLABEL_RUN_KEY);
    } catch (e) {}
  }
  // Returns the 0-indexed page TW actually rendered (from pagination <strong> tag).
  // Returns -1 when there is no pagination (single page = page 0).
  function getRenderedPage() {
    var $items = window.$('.paged-nav-item');
    if (!$items.length) return -1;
    var $td = $items.first().closest('td');
    if (!$td.length) return -1;
    var text = window.$.trim($td.find('strong').text()).replace(/[^0-9]/g, '');
    var n = parseInt(text, 10);
    return isNaN(n) ? -1 : n - 1;  // TW shows 1-indexed; convert to 0-indexed
  }

  function buildIncomingsUrl(page) {
    var vid         = (window.game_data && window.game_data.village && window.game_data.village.id) || '';
    var search      = location.search;
    var tMatch      = search.match(/[?&]t=(\d+)/);
    var typeMatch   = search.match(/[?&]type=([^&]*)/);
    var subMatch    = search.match(/[?&]subtype=([^&]*)/);
    var tParam      = tMatch    ? '&t='       + tMatch[1]    : '';
    var typeParam   = typeMatch ? '&type='    + typeMatch[1]  : '';
    var subtypeParam = subMatch ? '&subtype=' + subMatch[1]   : '';
    return location.pathname + '?village=' + vid +
           '&screen=overview_villages&mode=incomings' +
           typeParam + subtypeParam + '&group=0&page=' + page + tParam;
  }

  // Finds the incomings page's real "Etiqueta de comando" filter field
  // (filters[target_comment]) and its "Guardar" submit button.
  function getEtiquetaFilterForm() {
    var $input = window.$('input[name="filters[target_comment]"]');
    if (!$input.length) return null;
    var $form = $input.closest('form');
    if (!$form.length) return null;
    var $submit = $form.find('input[type=submit][value="Guardar"]');
    if (!$submit.length) $submit = $form.find('input[type=submit]').first();
    if (!$submit.length) return null;
    return { $input: $input, $submit: $submit };
  }

  // Fills + submits the real "Etiqueta de comando" filter with the given value
  // (native TW form, persists across page/pagination reloads until cleared).
  // Returns false if the filter form isn't present on this page.
  function setEtiquetaCommentFilter(value) {
    var f = getEtiquetaFilterForm();
    if (!f) return false;
    f.$input.val(value);
    f.$submit[0].click();
    return true;
  }

  // ── PALETTE — [bg, priorityBg]  (priorityBg ≈ 12% darker, used for high-priority badges) ──
  var PALETTE = {
    //              bg          priorityBg
    green:  ['#CDEFCF', '#B5DFBA'],  // mint         → Morto (priority)
    orange: ['#F6D4A7', '#F6D4A7'],  // peach        → Desviado
    purple: ['#DCCEF6', '#DCCEF6'],  // violet       → Desviar
    gray:   ['#E7E7E7', '#E7E7E7'],  // cool gray    → Reconquistar
    white:  ['#EEF0F5', '#EEF0F5'],  // blue-white   → Reconquistado (distinct from gray)
    lblue:  ['#CFEFF5', '#CFEFF5'],  // cyan         → Snipado
    blue:   ['#CFE2FF', '#CFE2FF'],  // sky blue     → Snipar
    dgreen: ['#CEEED8', '#CEEED8'],  // soft forest  → Fubar (distinct from green)
    red:    ['#F2CACA', '#F2CACA'],  // rose         → Snipe Cancel
    Pink:   ['#F5D5E5', '#F5D5E5'],  // pink-violet  → Fake (distinct from red)
    dblue:  ['#C8D4F5', '#B5C4F0'],  // indigo       → Possível Full (priority)
    black:  ['#C8C8C8', '#C8C8C8'],  // dark gray    → Reforçar (distinct from gray)
    teal:   ['#C0EAE7', '#A8DDE0'],  // teal         → Retirar (priority)
    yellow: ['#F8E8A6', '#F0DA80'],  // straw        → Vigiar (priority)
    lgreen: ['#D5EFCA', '#D5EFCA'],  // light mint   → ✓
  };

  // High-priority badge indices (M=0, PV=10, R!=12, V!=13) — slightly darker bg + bold text
  var PRIORITY_IDX = new Set([0, 10, 12, 13]);

  var TAGS = [
    // [ tag string,          btn label, palette key ]
    ['[Morto]',        'M',   'green'  ],
    ['[Desviado]',     'D!',  'orange' ],
    ['[Desviar]',      'D',   'purple' ],
    ['[Reconquistar]', 'R',   'gray'   ],
    ['[Reconquistado]','RR',  'white'  ],
    ['[Snipado]',      'S!',  'lblue'  ],
    ['[Snipar]',       'S',   'blue'   ],
    ['[Fubar]',        'FU',  'dgreen' ],
    ['[Snipe Cancel]', 'SC',  'red'    ],
    ['[Fake]',         'FA',  'Pink'   ],
    ['[Possível Full]','PV',  'dblue'  ],
    ['[Reforçar]',     'RF',  'black'  ],
    [' | Retirar',     'R!',  'teal'   ],
    [' | Vigiar',      'V!',  'yellow' ],
    [' | ✓',           '✓',   'lgreen' ],
  ];

  function colTop(name)  { return (PALETTE[name] || PALETTE.black)[0]; }

  function btnStyle(idx) {
    var bg         = TAGS[idx][2];
    var pal        = PALETTE[bg] || PALETTE.gray;
    var isPriority = PRIORITY_IDX.has(idx);
    var bgColor    = isPriority ? pal[1] : pal[0];
    var marginLeft = isIncomingsPage ? '5px' : '2px';
    var padding    = isIncomingsPage ? '1px 6px' : '1px 3px';
    var minWidth   = isIncomingsPage ? '22px' : '18px';
    return [
      'margin-left:' + marginLeft,
      'color:#444',
      'font-size:' + tamanho_letra + 'px!important',
      'background:' + bgColor,
      'border:1px solid rgba(0,0,0,0.15)',
      'border-radius:5px',
      'padding:' + padding,
      'box-sizing:border-box',
      'min-width:' + minWidth,
      'text-align:center',
      'line-height:14px',
      'cursor:pointer',
      isPriority ? 'font-weight:600' : '',
    ].filter(Boolean).join(';');
  }

  // ── Row-painting helpers ────────────────────────────────────────────────────
  function setBg($el, value) {
    if (!$el || !$el.length) return;
    var cleaned = ($el.attr('style') || '').replace(/\bbackground:[^;]+;?\s*/gi, '').trim();
    $el.attr('style', (cleaned ? cleaned + ';' : '') + 'background:' + value + ' !important;');
  }

  function isSupport(row) {
    try {
      var $row = window.$(row);
      if ($row.find('[data-command-type="support"]').length) return true;
      var found = false;
      $row.find('img').each(function () {
        var s = window.$(this).attr('src') || '';
        if (s.indexOf('support') >= 0) { found = true; return false; }
      });
      return found;
    } catch (e) { return false; }
  }

  function isNoble(row) {
    try {
      var $row = window.$(row);
      var found = false;
      $row.find('img').each(function () {
        var src = window.$(this).attr('src') || '';
        if (src.indexOf('snob') >= 0 || src.indexOf('nobre') >= 0) { found = true; }
      });
      if (found) return true;
      // Fallback: TW PT labels noble commands as "Nobre" in the incomings label cell
      var label = window.$.trim($row.find('td:eq(0)').text());
      return label.toLowerCase().indexOf('nobre') >= 0;
    } catch (e) { return false; }
  }

  function singleTagIndex(name) {
    for (var i = 0; i < TAGS.length; i++) {
      if (name.indexOf(TAGS[i][0]) !== -1) return i;
    }
    return -1;
  }

  function dualTagIndices(name) {
    for (var i = 0; i < TAGS.length; i++) {
      for (var j = 0; j < TAGS.length; j++) {
        if (i !== j && name.indexOf(TAGS[i][0] + TAGS[j][0]) !== -1) return [i, j];
      }
    }
    return null;
  }

  function paintRow($row, row, name) {
    if (isSupport(row)) {
      var yellowTop = colTop('yellow');
      if (pagina_de_ataques === 'linha')  setBg($row.find('td'), yellowTop);
      if (pagina_de_ataques === 'coluna') setBg($row.find('td:eq(0)'), yellowTop);
      return;
    }

    var dual = dualTagIndices(name);
    if (dual) {
      var c1   = colTop(TAGS[dual[0]][2]);
      var c2   = colTop(TAGS[dual[1]][2]);
      var grad = 'repeating-linear-gradient(45deg,' + c1 + ',' + c1 + ' 10px,' + c2 + ' 10px,' + c2 + ' 20px)';
      // In 'linha' mode keep zebra striping — badge already identifies the row
      if (pagina_de_ataques === 'coluna') {
        setBg($row.find('td:eq(0)'), grad);
        $row.find('a:eq(0)').attr('style', 'color:white!important;text-shadow:-1px -1px 0 #000,1px -1px 0 #000,-1px 1px 0 #000,1px 1px 0 #000;');
      }
      return;
    }

    var idx = singleTagIndex(name);
    if (idx !== -1) {
      var color = colTop(TAGS[idx][2]);
      // In 'linha' mode keep zebra striping — badge already identifies the row
      if (pagina_de_ataques === 'coluna') {
        setBg($row.find('td:eq(0)'), color);
        $row.find('a:eq(0)').attr('style', 'color:white!important;text-shadow:-1px -1px 0 #000,1px -1px 0 #000,-1px 1px 0 #000,1px 1px 0 #000;');
      }
      return;
    }

    // Untagged attack → red
    if (pagina_de_ataques === 'linha') {
      setBg($row.find('td'), colTop('red'));
      $row.find('a').attr('style', 'color:white!important;');
    } else if (pagina_de_ataques === 'coluna') {
      setBg($row.find('td:eq(0)'), colTop('red'));
      $row.find('a:eq(0)').attr('style', 'color:white!important;text-shadow:-1px -1px 0 #000,1px -1px 0 #000,-1px 1px 0 #000,1px 1px 0 #000;');
    }
  }

  // ── Chip rendering helpers ───────────────────────────────────────────────────

  /**
   * Render the collapsed chip element for a tagged row.
   * nr     - row index (for re-injection on edit)
   * row    - DOM row element
   * tagIdx - index into TAGS for the active tag
   */
  function injectChip(nr, row, tagIdx) {
    var $row  = window.$(row);
    var tag   = TAGS[tagIdx];
    var bgKey = tag[2];
    var bg    = (PALETTE[bgKey] || PALETTE.gray)[0];

    $row.find('.rename-buttons').remove();
    $row.find('.mlr-chip').remove();

    // Match button span styling for layout consistency
    var chipSpanStyle = isIncomingsPage
      ? 'margin-left:auto;white-space:nowrap;flex-shrink:0;'
      : 'margin-left:4px;white-space:nowrap;flex-shrink:0;';

    var chipHtml = '<span class="mlr-chip"' +
      ' style="' + chipSpanStyle + 'background:' + bg + ';color:#444;padding:2px 6px;' +
      'border-radius:3px;font-size:10px;font-weight:bold;cursor:default;' +
      'display:inline-flex;align-items:center;gap:4px;opacity:0;' +
      'transition:opacity 150ms ease-in;">' +
      tag[1] +
      '<button class="mlr-edit-btn" type="button" title="Re-etiquetar"' +
      ' style="background:rgba(0,0,0,0.25);border:none;color:inherit;cursor:pointer;' +
      'font-size:9px;padding:1px 3px;border-radius:2px;line-height:1;">&#9998;</button>' +
      '</span>';

    var $chip = window.$(chipHtml);
    $row.find('.quickedit').after($chip);

    // Trigger fade-in via reflow
    window.requestAnimationFrame(function () {
      $chip.css('opacity', '1');
    });

    // Clicking the pencil restores full button strip
    $chip.find('.mlr-edit-btn').off('click').on('click', function (e) {
      e.stopPropagation();
      $row.find('.mlr-chip').remove();
      injectButtonsLegacy(nr, row);
    });
  }

  // ── Per-row buttons on main overview ────────────────────────────────────────
  function injectButtonsLegacy(nr, row) {
    var $row = window.$(row);
    $row.find('.rename-buttons').remove();
    $row.find('.mlr-chip').remove();
    var btnSpanStyle = isIncomingsPage
      ? 'margin-left:auto;white-space:nowrap;flex-shrink:0;'
      : 'margin-left:4px;white-space:nowrap;flex-shrink:0;';
    var html = '<span class="rename-buttons" style="' + btnSpanStyle + '">';
    TAGS.forEach(function (tag, num) {
      html += '<button type="button" id="opt' + nr + '_' + num + '" class="btn" title="' + tag[0] + '" style="' + btnStyle(num) + '">' + tag[1] + '</button>';
    });
    html += '</span>';
    $row.find('.quickedit').after(html);
    var tdCss = {'display':'flex','align-items':'center'};
    if (!isIncomingsPage) tdCss['flex-wrap'] = 'wrap';
    $row.find('td:eq(0)').css(tdCss);

    TAGS.forEach(function (tag, num) {
      window.$('#opt' + nr + '_' + num).off('click').on('click', function () {
        performRename($row, function (val) {
          var base = val.split(' ')[0];
          return tag[0].startsWith(' |') ? val + tag[0] : base + ' ' + tag[0];
        }, function (success) {
          if (success) injectChip(nr, row, num);
        });
      });
    });
  }

  // ── Fake-detection helpers ────────────────────────────────────────────────────

  // Base travel speed in seconds per field (game_speed=1, unit_speed=1)
  function getUnitBaseSpeedSec(row) {
    var src = (window.$(row).find('img:eq(0)').attr('src') || '').toLowerCase();
    if (src.indexOf('snob')     >= 0 || src.indexOf('nobre')   >= 0) return 2100; // noble 35 min
    if (src.indexOf('ram')      >= 0)                                 return 1800; // ram   30 min
    if (src.indexOf('catapult') >= 0 || src.indexOf('cat')     >= 0) return 1800; // cat   30 min
    if (src.indexOf('heavy')    >= 0 || src.indexOf('hcav')    >= 0) return  660; // HC    11 min
    if (src.indexOf('marcher')  >= 0 || src.indexOf('mounted') >= 0) return  600; // MA    10 min
    if (src.indexOf('light')    >= 0 || src.indexOf('lcav')    >= 0) return  600; // LC    10 min
    if (src.indexOf('spy')      >= 0 || src.indexOf('scout')   >= 0) return  540; // spy    9 min
    if (src.indexOf('sword')    >= 0)                                 return 1320; // sword 22 min
    return 1080; // spear / axe / archer  18 min
  }

  // Cache game speed values (available from window.game_data in main world)
  var _gSpeed = null;
  var _uSpeed = null;
  function gameSpeedFactors() {
    if (_gSpeed !== null) return;
    _gSpeed = (window.game_data && parseFloat(window.game_data.speed))      || 1.0;
    _uSpeed = (window.game_data && parseFloat(window.game_data.unit_speed)) || 1.0;
  }

  // Returns approximate send timestamp (ms) by back-calculating from "Chega em" + distance
  // Columns (PT): 0=Comando, 1=Destino, 2=Origem, 3=Jogador, 4=Distância, 5=Chegada, 6=Chega em
  function computeSendTimeMs(row) {
    gameSpeedFactors();
    var $row = window.$(row);

    var chegaText = window.$.trim($row.find('td:eq(6)').text()).replace(',', '.');
    var cp = chegaText.split(':');
    if (cp.length < 2 || isNaN(parseInt(cp[0], 10))) return null;
    var remainMs = ((parseInt(cp[0], 10) || 0) * 3600 +
                   (parseInt(cp[1], 10) || 0) * 60  +
                   (parseInt(cp[2], 10) || 0)) * 1000;

    var dist = parseFloat(window.$.trim($row.find('td:eq(4)').text()).replace(',', '.'));
    if (isNaN(dist) || dist <= 0) return null;

    var travelMs = dist * getUnitBaseSpeedSec(row) * 1000 / (_gSpeed * _uSpeed);
    return Date.now() + remainMs - travelMs;
  }

  // ── Auto-fake queue (throttled at 250 ms to avoid server rate-limit) ─────────
  var _autoFakeQueue   = [];
  var _autoFakeRunning = false;

  function drainAutoFakeQueue() {
    if (!_autoFakeQueue.length) { _autoFakeRunning = false; return; }
    _autoFakeRunning = true;
    var item  = _autoFakeQueue.shift();
    var nr    = item[0];
    var row   = item[1];
    var $row  = window.$(row);
    var $lbl  = $row.find('td:eq(0) .quickedit-label');
    var name  = $lbl.length ? window.$.trim($lbl.text()) : window.$.trim($row.find('td:eq(0)').text());
    if (singleTagIndex(name) === -1 && dualTagIndices(name) === null) {
      performRename($row, function (val) {
        return val.split(' ')[0] + ' ' + TAGS[9][0];
      }, function (success) {
        if (success) injectChip(nr, row, 9);
        setTimeout(drainAutoFakeQueue, jitter(250, 60));
      });
    } else {
      setTimeout(drainAutoFakeQueue, jitter(250, 60));
    }
  }

  function queueAutoFake(nr, row) {
    window.$(row).data('mlr-auto-faked', true);
    _autoFakeQueue.push([nr, row]);
    if (!_autoFakeRunning) drainAutoFakeQueue();
  }

  // ── Module-scope deadline variable ───────────────────────────────────────────
  var _etiquetaDeadline = null;

  // ── Change 3: Auto-etiqueta with ETA bar ────────────────────────────────────
  var _etiquetaScheduled = false;

  function scheduleAutoEtiqueta() {
    var $btn = window.$('input[type=submit][name=label]');
    if (!$btn.length || _etiquetaScheduled) return;
    _etiquetaScheduled = true;

    var delayMs  = minDelayMs + Math.random() * randomExtraMs;
    var deadline = Date.now() + delayMs;

    _etiquetaDeadline = deadline;

    // inject ETA bar div above the form
    if (!window.$('#mlr-eta-bar').length) {
      var etaHtml =
        '<div id="mlr-eta-bar" style="padding:6px 10px;background:#1e3a5f;color:#7dd3fc;' +
        'font-size:11px;font-family:monospace;border-radius:4px;margin-bottom:6px;' +
        'display:flex;align-items:center;gap:8px;">' +
        '<span style="font-size:13px;">&#9201;</span>' +
        '<span id="mlr-eta-text">Auto-label em ' + Math.ceil(delayMs / 1000) + 's</span>' +
        '<div style="flex:1;height:3px;background:#0c2540;border-radius:2px;overflow:hidden;">' +
        '<div id="mlr-eta-fill" style="height:100%;background:#7dd3fc;width:0%;transition:width 0.5s linear;border-radius:2px;"></div>' +
        '</div>' +
        '</div>';
      $btn.closest('form').before(etaHtml);
    }

    var tickId = setInterval(function () {
      var elapsed = Date.now() - (deadline - delayMs);
      var left    = Math.ceil((deadline - Date.now()) / 1000);
      var pct     = Math.min(100, (elapsed / delayMs) * 100).toFixed(1);
      var $text   = window.$('#mlr-eta-text');
      var $fill   = window.$('#mlr-eta-fill');
      if ($text.length) $text.text('Auto-label em ' + left + 's');
      if ($fill.length) $fill.css('width', pct + '%');
    }, 500);

    setTimeout(function () {
      clearInterval(tickId);
      window.$('#mlr-eta-bar').remove();
      _etiquetaDeadline  = null;
      _etiquetaScheduled = false;

      // Land on the default (page=-1) view first, then switch the real
      // "Etiqueta de comando" filter to "Ataque" from there. This narrows the
      // paged run below to only the still-unlabeled backlog instead of every
      // incomings page, regardless of whichever page we happened to be on.
      setRunState({ active: true, phase: 'filter', page: 0 });
      location.href = buildIncomingsUrl(-1);
    }, delayMs);
  }

  // ── Bulk-fake CustomEvent listener ───────────────────────────────────────────
  // Processes one row at a time with a 500 ms gap to avoid TW rate-limiting.
  document.addEventListener('xbot:labelrenamer:bulk_fake', function () {
    var queue = [];
    window.$('#incomings_table tr.nowrap').each(function (nr, row) {
      var $row   = window.$(row);
      var $label = $row.find('td:eq(0) .quickedit-label');
      var name   = $label.length ? window.$.trim($label.text()) : '';
      if (singleTagIndex(name) === -1 && dualTagIndices(name) === null) {
        queue.push([nr, row]);
      }
    });

    function processNext(i) {
      if (i >= queue.length) return;
      var nr   = queue[i][0];
      var row  = queue[i][1];
      var $row = window.$(row);
      performRename($row, function (val) {
        return val.split(' ')[0] + ' ' + TAGS[9][0];
      }, function (success) {
        if (success) injectButtonsLegacy(nr, row);
        setTimeout(function () { processNext(i + 1); }, jitter(250, 60));
      });
    }

    processNext(0);
  });

  // ── Keyboard shortcuts ────────────────────────────────────────────────────────

  // Map Alt+key → TAGS index
  var KB_MAP = {
    'm': 0,   // Alt+M → [Morto]
    'f': 9,   // Alt+F → [Fake]
    's': 6,   // Alt+S → [Snipar]
    'd': 2,   // Alt+D → [Desviar]
    'v': 13,  // Alt+V → | Vigiar
    'c': 8,   // Alt+C → [Snipe Cancel]
  };

  function setupKeyboardShortcuts() {
    if (!kbEnabled) return;

    // Track last-hovered row
    window._mlrHoveredRow = null;

    var $tableRows = window.$('#incomings_table tr.nowrap');
    $tableRows.on('mouseenter', function () {
      window._mlrHoveredRow = this;
    });

    document.addEventListener('keydown', function (e) {
      if (!e.altKey) return;
      var key = (e.key || '').toLowerCase();
      if (!(key in KB_MAP)) return;

      // Guard: ignore when focused on a form field
      var active = document.activeElement;
      if (active) {
        var tag = (active.tagName || '').toUpperCase();
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      }

      var hoveredRow = window._mlrHoveredRow;
      if (!hoveredRow) return;

      e.preventDefault();

      var $row   = window.$(hoveredRow);
      var tagIdx = KB_MAP[key];

      // If the row shows a chip, click the edit button first to restore buttons
      var $chip = $row.find('.mlr-chip');
      if ($chip.length) {
        $chip.find('.mlr-edit-btn').click();
        // After re-opening, simulate a small delay then click the target button
        setTimeout(function () {
          $row.find('#opt' + $row.index() + '_' + tagIdx).click();
        }, jitter(50, 20));
        return;
      }

      // If full button strip is present, find and click the matching button
      var $buttons = $row.find('.rename-buttons button');
      if ($buttons.length) {
        // Buttons are ordered by TAGS index, so index = tagIdx
        $buttons.eq(tagIdx).click();
      }
    });
  }

  // ── Per-page label applier for the paged run ────────────────────────────────
  var _pagedApplied = false;

  function finishRun() {
    // Clear the temporary "Ataque" filter so the account's saved incomings view
    // isn't left restricted, then land explicitly back on page 0.
    setRunState({ active: true, phase: 'clearing' });
    if (!setEtiquetaCommentFilter('')) {
      setRunState(null);
      location.href = buildIncomingsUrl(0);
    }
    // else: the filter-clear submission reloads the page; next load sees phase 'clearing'.
  }

  // Phase 'filter' — switch the real incomings filter to "Ataque" (from the
  // page=-1 landing spot), then hand off to the normal paged labeling run.
  function applyFilterPhase() {
    if (_pagedApplied) return;
    _pagedApplied = true;

    if (!setEtiquetaCommentFilter('Ataque')) {
      // Filter form not found (unlikely) — fall back to the old unfiltered walk.
      setRunState({ active: true, phase: 'label', page: 0 });
      location.href = buildIncomingsUrl(0);
      return;
    }
    setRunState({ active: true, phase: 'label', page: 0 });
    // setEtiquetaCommentFilter's submit reloads the page; next load sees phase 'label'.
  }

  // Phase 'clearing' — filter was just cleared; do the final explicit nav to page 0.
  function applyClearingPhase() {
    if (_pagedApplied) return;
    _pagedApplied = true;
    setRunState(null);
    location.href = buildIncomingsUrl(0);
  }

  function applyLabelAndAdvance(state) {
    if (_pagedApplied) return;
    _pagedApplied = true;

    var curPageMatch  = location.search.match(/[?&]page=(\d+)/);
    var curGroupMatch = location.search.match(/[?&]group=(\d+)/);
    var curPage  = curPageMatch  ? parseInt(curPageMatch[1],  10) : 0;
    var curGroup = curGroupMatch ? parseInt(curGroupMatch[1], 10) : -1;

    // Ensure we're on group=0
    if (curGroup !== 0) {
      setRunState({ active: true, phase: 'label', page: state.page, navigatedTo: state.page });
      location.href = buildIncomingsUrl(state.page);
      return;
    }

    // If we explicitly navigated to a page and TW gave us a different one,
    // it redirected (out-of-bounds) — we've passed the last page.
    if (state.navigatedTo !== undefined && curPage !== state.navigatedTo) {
      finishRun();
      return;
    }

    // Not yet on the right page — navigate there after the configured delay
    if (curPage !== state.page) {
      setRunState({ active: true, phase: 'label', page: state.page, navigatedTo: state.page });
      setTimeout(function () { location.href = buildIncomingsUrl(state.page); }, pageDelayMs);
      return;
    }

    // Confirm TW actually rendered this page (out-of-bounds pages show the last valid page's content)
    var rendered = getRenderedPage();
    var effective = rendered >= 0 ? rendered : 0;
    if (effective !== state.page) {
      finishRun();
      return;
    }

    // We're on the correct page — stop if no rows or no label form
    var $rows = window.$('#incomings_table tr.nowrap');
    if (!$rows.length) $rows = window.$('#incomings_table tbody tr');
    var $btn = window.$('input[type=submit][name=label]');
    if (!$btn.length || !$rows.length) {
      finishRun();
      return;
    }

    var $form = $btn.closest('form');
    var $sel  = $form.find('input.selectAll, #select_all');
    if ($sel.length) {
      $sel.prop('checked', true);
      if (typeof window.selectAll === 'function') window.selectAll($form[0], true);
    } else {
      $form.find('input[type=checkbox]').prop('checked', true);
    }

    // Advance page; clear navigatedTo so the TW reload isn't mistaken for a redirect
    setRunState({ active: true, phase: 'label', page: state.page + 1 });
    $btn[0].click();
    // TW reloads to this same page → next tick sees page mismatch → navigates forward with navigatedTo set
  }

  // ── Main polling loop (incomings table) ─────────────────────────────────────
  function runIncomingsTable() {
    function tick() {
      var $rows = window.$('#incomings_table tr.nowrap');
      if (!$rows.length) $rows = window.$('#incomings_table tbody tr');

      var _runState = getRunState();
      if (_runState && _runState.active) {
        if (_runState.phase === 'filter') {
          applyFilterPhase();
        } else if (_runState.phase === 'clearing') {
          applyClearingPhase();
        } else {
          applyLabelAndAdvance(_runState);
        }
      } else {
        scheduleAutoEtiqueta();
      }

      $rows.each(function (nr, row) {
        var $row     = window.$(row);
        var $cmdCell = $row.find('td:eq(0)');
        if (!$cmdCell.length) return;

        if (isSupport(row)) return;

        var $label = $cmdCell.find('.quickedit-label');
        var name   = $label.length
          ? window.$.trim($label.text())
          : window.$.trim($cmdCell.text());
        if (!name) return;

        var hasButtons = $row.find('.rename-buttons').length > 0;
        var hasChip    = $row.find('.mlr-chip').length > 0;
        var hasQE      = $row.find('.quickedit-content').length > 0;

        if (!hasButtons && !hasChip && hasQE) {
          var existingIdx = singleTagIndex(name);
          if (existingIdx !== -1) {
            // Already tagged — render chip directly
            injectChip(nr, row, existingIdx);
          } else if (dualTagIndices(name) !== null) {
            // Dual-tagged — fall back to full buttons so user can still edit
            injectButtonsLegacy(nr, row);
          } else {
            // Untagged — inject full buttons
            injectButtonsLegacy(nr, row);
          }
        }

        /* Only repaint when the label has actually changed */
        if ($row.data('bito-name') === name) return;
        $row.data('bito-name', name);
        paintRow($row, row, name);
      });

      // TW PT column order: Comando | Destino | Origem | Jogador | …
      // Destino = td:eq(1) (our village), Origem = td:eq(2) (attacker).
      // Header scan refines these if sort links are present.
      var origimColIdx  = 2;
      var destinoColIdx = 1;
      window.$('#incomings_table thead th').each(function (i, th) {
        var href = window.$(th).find('a').attr('href') || '';
        if (href.indexOf('start_village') >= 0)  origimColIdx  = i;
        if (href.indexOf('target_village') >= 0) destinoColIdx = i;
      });

      try {
        // originsMap[origCoords] = { name, targets: { destCoords: destName } }
        var originsMap = {};

        $rows.each(function (_, row) {
          if ((!originBadgeEnabled && !autoFakeEnabled) || origimColIdx === -1) return;

          var $r    = window.$(row);
          var $lbl  = $r.find('td:eq(0) .quickedit-label');
          var rname = $lbl.length ? window.$.trim($lbl.text()) : window.$.trim($r.find('td:eq(0)').text());

          // Origin village (who is attacking)
          var $origTd   = $r.find('td:eq(' + origimColIdx + ')');
          var origMatch = $origTd.text().match(/\((\d+)\|(\d+)\)/);
          if (!origMatch) return;
          var origCoords = origMatch[0];
          var origName   = window.$.trim($origTd.find('a').first().text())
                             .replace(/\s*\(\d+\|\d+\)\s*/, '').trim() || origCoords;

          if (!originsMap[origCoords]) {
            originsMap[origCoords] = { name: origName, targets: {}, cmds: [], sendTimes: [] };
          }

          // Always record send time for fake-detection
          originsMap[origCoords].sendTimes.push(computeSendTimeMs(row));

          // Destination village (which of our villages is being attacked)
          if (destinoColIdx !== -1) {
            var $destTd   = $r.find('td:eq(' + destinoColIdx + ')');
            var destMatch = $destTd.text().match(/\((\d+)\|(\d+)\)/);
            if (destMatch) {
              var destCoords = destMatch[0];
              var destName   = window.$.trim($destTd.find('a').first().text())
                                 .replace(/\s*\(\d+\|\d+\)\s*/, '').trim() || destCoords;
              originsMap[origCoords].targets[destCoords] = destName;
              originsMap[origCoords].cmds.push((rname || '?') + ' → ' + (destName || destCoords));
            }
          }
        });

        // Remove badges if feature was disabled mid-session
        if (!originBadgeEnabled) { window.$('.mlr-multi-badge').remove(); }

        // Inject / update multi-target badges in the Origem column
        if (originBadgeEnabled && origimColIdx !== -1) {
          $rows.each(function (_, row) {
            var $row    = window.$(row);
            var $td     = $row.find('td:eq(' + origimColIdx + ')');
            if (!$td.length) return;

            var origMatch = $td.text().match(/\((\d+)\|(\d+)\)/);
            if (!origMatch) return;
            var origCoords  = origMatch[0];
            var info        = originsMap[origCoords];
            var targetCount = info ? Object.keys(info.targets).length : 0;

            var $badge = $td.find('.mlr-multi-badge');

            if (targetCount <= 1) { $badge.remove(); return; }

            // Skip update if already showing the correct count
            if ($badge.length && parseInt($badge.attr('data-tc') || '0', 10) === targetCount) return;
            $badge.remove();

            var col      = targetCount >= 3 ? '#ef4444' : '#f59e0b';
            var tooltip  = ('A atacar ' + targetCount + ' alvos:\n' + info.cmds.join('\n'))
                             .replace(/"/g, '“');
            var badgeHtml =
              '<span class="mlr-multi-badge" data-tc="' + targetCount + '"' +
              ' title="' + tooltip + '"' +
              ' style="display:inline-flex;align-items:center;margin-left:3px;padding:0 4px;' +
              'background:' + col + ';color:#fff;border-radius:3px;font-size:9px;font-weight:700;' +
              'line-height:1.6;cursor:help;vertical-align:middle;letter-spacing:-0.02em;">×' +
              targetCount + '</span>';
            $td.find('a').last().after(badgeHtml);
          });
        }

        // ── Auto-fake detection ───────────────────────────────────────────────
        if (autoFakeEnabled) {
          // Find origins whose attacks cluster within the configured send window
          var likelyFakeOrigins = {};
          for (var oc in originsMap) {
            var times = originsMap[oc].sendTimes.filter(function (t) { return t !== null; });
            if (times.length < 2) continue;
            var spread = Math.max.apply(null, times) - Math.min.apply(null, times);
            if (spread <= autoFakeWindowMs) likelyFakeOrigins[oc] = true;
          }

          if (Object.keys(likelyFakeOrigins).length) {
            $rows.each(function (nr, row) {
              var $rr = window.$(row);
              if ($rr.data('mlr-auto-faked')) return; // already processed

              var oMatch = $rr.find('td:eq(' + origimColIdx + ')').text().match(/\((\d+)\|(\d+)\)/);
              if (!oMatch || !likelyFakeOrigins[oMatch[0]]) return;

              // Only auto-tag untagged rows
              var $ll  = $rr.find('td:eq(0) .quickedit-label');
              var nm   = $ll.length ? window.$.trim($ll.text()) : window.$.trim($rr.find('td:eq(0)').text());
              if (singleTagIndex(nm) !== -1 || dualTagIndices(nm) !== null) return;

              queueAutoFake(nr, row);
            });
          }
        }

        // Live overview totals (total/untagged/nobles/tagCounts) are no longer
        // written from here — the overlay panel now fetches an account-wide
        // count across every incomings page on demand (Refresh button) instead
        // of a continuous per-second snapshot of whatever page happens to be
        // open. Only the auto-label countdown still needs a live tick.
        sessionStorage.setItem('mlr_etiqueta_deadline_v1', JSON.stringify(_etiquetaDeadline));
      } catch (e) {}

    }

    // Run immediately so first paint happens without delay, then poll every 1 s
    tick();
    setInterval(tick, 1000);

    if (kbEnabled) {
      setupKeyboardShortcuts();
    }
  }

  // ── Legacy path: main overview ───────────────────────────────────────────────
  // Uses MutationObserver instead of polling — fires only when DOM changes.
  function runLegacy() {
    function processRows() {
      window.$('#commands_incomings .command-row').each(function (nr, row) {
        if (isSupport(row)) return;

        var $row     = window.$(row);
        var $cmdCell = $row.find('td:eq(0)');
        if (!$cmdCell.length) return;

        var $label = $cmdCell.find('.quickedit-label');
        var name   = $label.length
          ? window.$.trim($label.text())
          : window.$.trim($cmdCell.text());
        if (!name) return;

        var hasButtons = $row.find('.rename-buttons').length > 0;
        var hasChip    = $row.find('.mlr-chip').length > 0;
        var hasQE      = $row.find('.quickedit-content').length > 0;

        if (!hasButtons && !hasChip && hasQE) {
          var existingIdx = singleTagIndex(name);
          if (existingIdx !== -1) {
            injectChip(nr, row, existingIdx);
          } else {
            injectButtonsLegacy(nr, row);
          }
        }

        if ($row.data('bito-name') === name) return;
        $row.data('bito-name', name);
        paintRow($row, row, name);
      });
    }

    // Initial pass on load
    processRows();

    // Watch for TW injecting/updating rows — no polling needed
    var container = document.getElementById('commands_incomings') || document.body;
    var obs = new MutationObserver(processRows);
    obs.observe(container, { childList: true, subtree: true });
  }

  // ── Boot ────────────────────────────────────────────────────────────────────
  function boot() {
    if (typeof window.$ === 'undefined') return;

    var isIncomingsTable = location.href.indexOf('screen=overview_villages') !== -1 &&
                           location.href.indexOf('mode=incomings') !== -1;

    if (!isIncomingsTable && getRunState()) setRunState(null);

    if (isIncomingsTable) {
      runIncomingsTable();
    } else {
      runLegacy();
    }
  }

  function whenReady(fn, tries) {
    tries = tries || 0;
    if (typeof window.$ !== 'undefined' && document.body) return fn();
    if (tries > 200) return;
    setTimeout(function () { whenReady(fn, tries + 1); }, 50);
  }

  whenReady(boot);
})();

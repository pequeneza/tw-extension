// ==UserScript==
// @name         Renomeador BITO v4
// @version      4.2.0
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
  var labelIndex    =  _cfg.labelIndex       !== undefined ? _cfg.labelIndex       : 0;

  // ── User preferences ────────────────────────────────────────────────────────
  var tamanho_letra     = 8;

  // Change 7: Read highlightMode and kbEnabled from config
  var pagina_de_ataques    = _cfg.highlightMode || 'coluna';
  var kbEnabled            = _cfg.kbEnabled !== undefined ? _cfg.kbEnabled : true;
  var originBadgeEnabled   = _cfg.originBadgeEnabled  !== undefined ? _cfg.originBadgeEnabled  : true;
  var autoFakeEnabled      = _cfg.autoFakeEnabled      !== undefined ? _cfg.autoFakeEnabled      : false;
  var autoFakeWindowMs     = (_cfg.autoFakeWindowSec   !== undefined ? _cfg.autoFakeWindowSec    : 10) * 1000;

  // ── Change 1: Revised PALETTE — stronger, distinct two-tone colors ──────────
  var PALETTE = {
    red:     ['#e63030', '#b31f1f'],  // vivid red / dark red
    green:   ['#31c908', '#1f8a03'],  // bright green / dark green
    blue:    ['#1a8fe3', '#0d5fa3'],  // sky blue / deep blue
    yellow:  ['#ffd91c', '#c9a808'],  // yellow / dark amber
    orange:  ['#ef8b10', '#a85c06'],  // orange / dark burnt orange
    lblue:   ['#22e5db', '#0a9e96'],  // cyan / dark teal-cyan
    white:   ['#ffffff', '#c8c8c8'],  // white / light gray
    black:   ['#3a3a3a', '#111111'],  // dark charcoal / near-black
    gray:    ['#adb6c6', '#717b8a'],  // cool gray / dark cool gray
    purple:  ['#9232a8', '#611870'],  // purple / dark purple  (was "dorange")
    Pink:    ['#ffb6c1', '#e07585'],  // light pink / dark rose
    dblue:   ['#1e40af', '#0f2266'],  // indigo-blue / deep navy
    dgreen:  ['#16a34a', '#0d6630'],  // forest green / dark forest green
    teal:    ['#0d9488', '#0a7a6e'],  // teal / dark teal  (new, for [Retirar])
    lgreen:  ['#93cf82', '#5a9e48'],  // light green / medium green
  };

  // Change 1: Every tag uses a unique palette key; [Retirar] now uses "teal"
  // Change 1: "dorange" renamed to "purple"
  var TAGS = [
    // [ tag string,          btn label, btn bg colour, btn text colour ]
    ['[Morto]',        'M',   'green',   'white'],
    ['[Desviado]',     'D!',  'orange',  'white'],
    ['[Desviar]',      'D',   'purple',  'white'],   // was "dorange" → "purple"
    ['[Reconquistar]', 'R',   'gray',    'white'],
    ['[Reconquistado]','RR',  'white',   'black'],
    ['[Snipado]',      'S!',  'lblue',   'white'],
    ['[Snipar]',       'S',   'blue',    'white'],
    ['[Fubar]',        'FU',  'dgreen',  'white'],
    ['[Snipe Cancel]', 'SC',  'red',     'white'],
    ['[Fake]',         'FA',  'Pink',    'black'],
    ['[Possível Full]','PV',  'dblue',   'white'],
    ['[Reforçar]',     'RF',  'black',   'white'],
    [' | Retirar',     'R!',  'teal',    'white'],   // was "dgreen" → "teal"
    [' | Vigiar',      'V!',  'yellow',  'black'],
    [' | ✓',           '✓',   'lgreen',  'black'],
  ];

  function colTop(name)  { return (PALETTE[name] || PALETTE.black)[0]; }
  function colBot(name)  { return (PALETTE[name] || PALETTE.black)[1]; }
  function colText(name) { return (PALETTE[name] || PALETTE.white)[0]; }

  function btnStyle(idx) {
    var bg   = TAGS[idx][2];
    var font = TAGS[idx][3];
    return [
      'margin-left:2px',
      'color:' + colText(font),
      'font-size:' + tamanho_letra + 'px!important',
      'background:linear-gradient(to bottom,' + colTop(bg) + ' 30%,' + colBot(bg) + ' 70%)',
    ].join(';');
  }

  // ── Row-painting helpers ────────────────────────────────────────────────────
  function setBg($el, value) {
    if (!$el || !$el.length) return;
    var cleaned = ($el.attr('style') || '').replace(/\bbackground:[^;]+;?\s*/gi, '').trim();
    $el.attr('style', (cleaned ? cleaned + ';' : '') + 'background:' + value + ' !important;');
  }

  function isSupport(row) {
    try {
      var src = window.$(row).find('img:eq(0)').attr('src');
      return !!(src && src.indexOf('support') >= 0);
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
      if (pagina_de_ataques === 'linha')  setBg($row.find('td'), grad);
      if (pagina_de_ataques === 'coluna') {
        setBg($row.find('td:eq(0)'), grad);
        $row.find('a:eq(0)').attr('style', 'color:white!important;text-shadow:-1px -1px 0 #000,1px -1px 0 #000,-1px 1px 0 #000,1px 1px 0 #000;');
      }
      return;
    }

    var idx = singleTagIndex(name);
    if (idx !== -1) {
      var color = colTop(TAGS[idx][2]);
      if (pagina_de_ataques === 'linha')  setBg($row.find('td'), color);
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

  // ── Change 2: Chip rendering helpers ────────────────────────────────────────

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
    var fgKey = tag[3];
    var bg    = colTop(bgKey);
    var fg    = colText(fgKey);

    $row.find('.rename-buttons').remove();
    $row.find('.mlr-chip').remove();

    var chipHtml = '<span class="mlr-chip"' +
      ' style="background:' + bg + ';color:' + fg + ';margin-left:4px;padding:2px 6px;' +
      'border-radius:3px;font-size:10px;font-weight:bold;cursor:default;' +
      'display:inline-flex;align-items:center;gap:4px;">' +
      tag[1] +
      '<button class="mlr-edit-btn" type="button" title="Re-etiquetar"' +
      ' style="background:rgba(0,0,0,0.25);border:none;color:inherit;cursor:pointer;' +
      'font-size:9px;padding:1px 3px;border-radius:2px;line-height:1;">&#9998;</button>' +
      '</span>';

    $row.find('.quickedit-content').append(chipHtml);

    // Clicking the pencil restores full button strip
    $row.find('.mlr-chip .mlr-edit-btn').off('click').on('click', function (e) {
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
    var html = '<span class="rename-buttons" style="float:right;">';
    TAGS.forEach(function (tag, num) {
      html += '<button type="button" id="opt' + nr + '_' + num + '" class="btn" title="' + tag[0] + '" style="' + btnStyle(num) + '">' + tag[1] + '</button>';
    });
    html += '</span>';
    $row.find('.quickedit-content').append(html);

    TAGS.forEach(function (tag, num) {
      window.$('#opt' + nr + '_' + num).off('click').on('click', function () {
        $row.find('.rename-icon').click();
        var $input = $row.find('input[type=text]');
        if (!$input.length) return;
        var base = $input.val().split(' ')[0];
        $input.val(tag[0].startsWith(' |') ? $input.val() + tag[0] : base + ' ' + tag[0]);
        $row.find('input[type=button]').click();
        // Change 2: collapse to chip after submitting
        injectChip(nr, row, num);
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
      $row.find('.rename-icon').click();
      var $inp = $row.find('input[type=text]');
      if ($inp.length) {
        $inp.val($inp.val().split(' ')[0] + ' ' + TAGS[9][0]);
        $row.find('input[type=button]').click();
        injectChip(nr, row, 9);
      }
    }
    setTimeout(drainAutoFakeQueue, 250);
  }

  function queueAutoFake(nr, row) {
    window.$(row).data('mlr-auto-faked', true);
    _autoFakeQueue.push([nr, row]);
    if (!_autoFakeRunning) drainAutoFakeQueue();
  }

  // ── Change 5: Module-scope deadline variable ─────────────────────────────────
  var _etiquetaDeadline = null;

  // ── Change 3: Auto-etiqueta with ETA bar ────────────────────────────────────
  var _etiquetaScheduled = false;

  function scheduleAutoEtiqueta() {
    var $btn = window.$('input[type=submit][name=label]');
    if (!$btn.length || _etiquetaScheduled) return;
    _etiquetaScheduled = true;

    var $form    = $btn.closest('form');
    var delayMs  = minDelayMs + Math.random() * randomExtraMs;
    var deadline = Date.now() + delayMs;

    // Change 5: record deadline for sessionStorage stats
    _etiquetaDeadline = deadline;

    // Change 3: inject ETA bar div above the form
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

      // Change 3: remove ETA bar
      window.$('#mlr-eta-bar').remove();

      // Change 5: clear deadline
      _etiquetaDeadline = null;

      /* Select all row checkboxes via TW's own helper */
      var $selectAll = $form.find('input.selectAll, #select_all');
      if ($selectAll.length) {
        $selectAll.prop('checked', true);
        if (typeof window.selectAll === 'function') {
          window.selectAll($form[0], true);
        }
      } else {
        $form.find('input[type=checkbox]').prop('checked', true);
      }

      /* Select the configured label radio */
      var $radios = $form.find('input[type=radio]');
      if ($radios.length > labelIndex) {
        $radios.eq(labelIndex).prop('checked', true);
      }

      $btn[0].click();
      _etiquetaScheduled = false;
    }, delayMs);
  }

  // ── Change 6: Listen for bulk-fake CustomEvent ───────────────────────────────
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
      $row.find('.rename-icon').click();
      var $input = $row.find('input[type=text]');
      if ($input.length) {
        var base = $input.val().split(' ')[0];
        $input.val(base + ' ' + TAGS[9][0]);
        $row.find('input[type=button]').click();
        injectButtonsLegacy(nr, row);
      }
      setTimeout(function () { processNext(i + 1); }, 250);
    }

    processNext(0);
  });

  // ── Change 4: Keyboard shortcuts ─────────────────────────────────────────────

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
        }, 50);
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

  // ── Main polling loop (incomings table) ─────────────────────────────────────
  function runIncomingsTable() {
    function tick() {
      var $rows = window.$('#incomings_table tr.nowrap');
      if (!$rows.length) $rows = window.$('#incomings_table tbody tr');

      scheduleAutoEtiqueta();

      $rows.each(function (nr, row) {
        var $row     = window.$(row);
        var $cmdCell = $row.find('td:eq(0)');
        if (!$cmdCell.length) return;

        var $label = $cmdCell.find('.quickedit-label');
        var name   = $label.length
          ? window.$.trim($label.text())
          : window.$.trim($cmdCell.text());
        if (!name) return;

        // Change 2: on load, rows already tagged → show chip immediately
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

      // Change 5: write live stats to sessionStorage + inject multi-target badges
      try {
        var total      = $rows.length;
        var untagged   = 0;
        var nobles     = 0;
        var tagCounts  = {};
        // originsMap[origCoords] = { name, targets: { destCoords: destName } }
        var originsMap = {};

        $rows.each(function (_, row) {
          var noble = isNoble(row);
          if (noble) nobles++;

          var $r    = window.$(row);
          var $lbl  = $r.find('td:eq(0) .quickedit-label');
          var rname = $lbl.length ? window.$.trim($lbl.text()) : window.$.trim($r.find('td:eq(0)').text());
          var ridx  = singleTagIndex(rname);
          if (ridx === -1 && dualTagIndices(rname) === null) {
            untagged++;
          } else if (ridx !== -1) {
            var tagKey = TAGS[ridx][0];
            tagCounts[tagKey] = (tagCounts[tagKey] || 0) + 1;
          }

          if ((!originBadgeEnabled && !autoFakeEnabled) || origimColIdx === -1) return;

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

        sessionStorage.setItem('mlr_stats_v1', JSON.stringify({
          total:            total,
          untagged:         untagged,
          nobles:           nobles,
          tagCounts:        tagCounts,
          etiquetaDeadline: _etiquetaDeadline
        }));
      } catch (e) {}

    }

    // Run immediately so first paint happens without delay, then poll every 1 s
    tick();
    setInterval(tick, 1000);

    // Change 4: set up keyboard shortcuts once table exists
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

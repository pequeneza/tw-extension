// ==UserScript==
// @name         Renomeador BITO v4
// @version      4.1.0
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

  // ── User preferences ────────────────────────────────────────────────────────
  var tamanho_letra     = 8;         // button font-size (px)
  var pagina_de_ataques = 'coluna';  // row highlight mode: 'coluna' | 'linha' | 'nada'

  // ── BITO tag/colour definitions ─────────────────────────────────────────────
  var TAGS = [
    // [ tag string,          btn label, btn bg colour, btn text colour ]
    ['[Morto]',        'M',   'green',   'white'],
    ['[Desviado]',     'D!',  'orange',  'white'],
    ['[Desviar]',      'D',   'dorange', 'white'],
    ['[Reconquistar]', 'R',   'gray',    'white'],
    ['[Reconquistado]','RR',  'white',   'black'],
    ['[Snipado]',      'S!',  'lblue',   'white'],
    ['[Snipar]',       'S',   'blue',    'white'],
    ['[Fubar]',        'FU',  'dgreen',  'white'],
    ['[Snipe Cancel]', 'SC',  'red',     'white'],
    ['[Fake]',         'FA',  'Pink',    'black'],
    ['[Possível Full]','PV',  'dblue',   'white'],
    ['[Reforçar]',     'RF',  'black',   'white'],
    [' | Retirar',     'R!',  'dgreen',  'white'],
    [' | Vigiar',      'V!',  'yellow',  'black'],
    [' | ✓',           '✓',   'lgreen',  'black'],
  ];

  var PALETTE = {
    red:     ['#e20606','#ff0000'],
    green:   ['#31c908','#228c05'],
    blue:    ['#0d83dd','#0860a3'],
    yellow:  ['#ffd91c','#e8c30d'],
    orange:  ['#ef8b10','#d3790a'],
    lblue:   ['#22e5db','#0cd3c9'],
    lime:    ['#ffd400','#ffd400'],
    white:   ['#ffffff','#dbdbdb'],
    black:   ['#000000','#000000'],
    gray:    ['#adb6c6','#828891'],
    dorange: ['#9232a8','#9232a8'],
    Pink:    ['#FFC0CB','#FFC0CB'],
    brown:   ['#892929','#892929'],
    dblue:   ['#00007f','#00007f'],
    dgreen:  ['#004c00','#004c00'],
    lgreen:  ['#93cf82','#93cf82'],
  };

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
      'background:linear-gradient(to bottom,' + colTop(bg) + ' 30%,' + colBot(bg) + ' 10%)',
    ].join(';');
  }

  // ── Row-painting helpers ────────────────────────────────────────────────────
  function setBg($el, value) {
    if (!$el || !$el.length) return;
    $el.attr('style', ($el.attr('style') || '') + 'background:' + value + ' !important;');
  }

  function isSupport(row) {
    try {
      var src = window.$(row).find('img:eq(0)').attr('src');
      return !!(src && src.indexOf('support') >= 0);
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

  // ── Per-row rename buttons (overview_villages incomings table) ──────────────
  function injectRowButtons($cmdCell) {
    var html = '<span class="rename-buttons" style="float:right;">';
    TAGS.forEach(function (tag, num) {
      html += '<button type="button" data-cmd="' + tag[0] + '" title="' + tag[0] + '" style="' + btnStyle(num) + '">' + tag[1] + '</button>';
    });
    html += '</span>';
    $cmdCell.append(html);

    $cmdCell.find('.rename-buttons button').off('click').on('click', function () {
      var tagStr = window.$(this).data('cmd');
      $cmdCell.find('.rename-icon').click();
      var $input = $cmdCell.find('input[type=text]');
      if ($input.length) {
        var base = $input.val().split(' ')[0];
        $input.val(tagStr.startsWith(' |') ? $input.val() + tagStr : base + ' ' + tagStr);
        $cmdCell.find('input[type=button]').click();
      }
    });
  }

  // ── Legacy path: per-row buttons on main overview ───────────────────────────
  function injectButtonsLegacy(nr, row) {
    var $row = window.$(row);
    $row.find('.rename-buttons').remove();
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
        injectButtonsLegacy(nr, row);
      });
    });
  }

  // ── Main polling loop (incomings table) ─────────────────────────────────────
  function runIncomingsTable() {
    setInterval(function () {
      var $rows = window.$('#incomings_table tr.nowrap');
      if (!$rows.length) $rows = window.$('#incomings_table tbody tr');

      $rows.each(function (nr, row) {
        var $row     = window.$(row);
        var $cmdCell = $row.find('td:eq(0)');
        if (!$cmdCell.length) return;

        var $label = $cmdCell.find('.quickedit-label');
        var name   = $label.length
          ? window.$.trim($label.text())
          : window.$.trim($cmdCell.text());
        if (!name) return;

        if ($cmdCell.find('.rename-buttons').length === 0 && $cmdCell.find('.rename-icon').length > 0) {
          injectRowButtons($cmdCell);
        }

        paintRow($row, row, name);
      });
    }, 250);
  }

  // ── Legacy path: main overview ───────────────────────────────────────────────
  function runLegacy() {
    window.$('#commands_incomings .command-row').each(function (nr, row) {
      if (!isSupport(row)) injectButtonsLegacy(nr, row);
    });
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
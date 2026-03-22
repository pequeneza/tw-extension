// ==UserScript==
// @name         Renomeador + Mass Label (BITO v4 merged)
// @version      4.0.0
// @description  BITO colour buttons on every incoming row + floating Mass Label panel to bulk-apply any tag with a human delay.
// @match        https://*.tribalwars.com.pt/game.php*screen=overview_villages*mode=incomings*
// @match        https://*.tribalwars.com.pt/game.php*screen=overview*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function () {
  'use strict';

  if (window.__twMassRenamerLoaded) return;
  window.__twMassRenamerLoaded = true;

  // ── Suite config integration ────────────────────────────────────────────────
  const _cfg = (typeof window.__twSuiteCfg === 'function')
    ? window.__twSuiteCfg('mass_label_renamer')
    : {};

  // ── User preferences ────────────────────────────────────────────────────────
  var tamanho_letra    = 8;         // button font-size (px)
  var pagina_de_ataques = 'coluna'; // row highlight mode: 'coluna' | 'linha' | 'nada'

  // ── BITO tag/colour definitions ─────────────────────────────────────────────
  var TAGS = [
    // [ tag string,        btn label, btn bg colour, btn text colour ]
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

  // palette: name → [top gradient, bottom gradient]
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

  /** Returns the index in TAGS whose tag string appears in `name`, or -1. */
  function singleTagIndex(name) {
    for (var i = 0; i < TAGS.length; i++) {
      if (name.indexOf(TAGS[i][0]) !== -1) return i;
    }
    return -1;
  }

  /** Returns [i, j] if two tags are combined in `name`, else null. */
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
      var c1 = colTop(TAGS[dual[0]][2]);
      var c2 = colTop(TAGS[dual[1]][2]);
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

  // Legacy path: per-row buttons on main overview (not overview_villages)
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

  // ── Mass Label panel ────────────────────────────────────────────────────────
  var massLabelState = {
    tagIndex: Number(_cfg.labelIndex ?? 0),
    delayMin: Number(_cfg.minDelaySeconds ?? 120),
    delayRnd: Number(_cfg.randomExtraMax  ?? 30),
    timer:    null,
    deadline: null,
  };

  function buildMassPanel() {
    if (document.getElementById('ml-panel')) return;

    var panel = document.createElement('div');
    panel.id = 'ml-panel';
    panel.style.cssText = [
      'position:fixed', 'right:14px', 'top:70px', 'z-index:9999',
      'width:280px',
      'background:#f5deb3', 'border:1px solid #7b5b2b',
      'border-radius:6px', 'box-shadow:0 3px 12px rgba(0,0,0,.28)',
      'font-family:Verdana,Arial,sans-serif', 'font-size:12px', 'color:#3b2a12',
    ].join(';');

    // Build tag button rows for picker
    var tagBtns = TAGS.map(function (tag, num) {
      var sel = (num === massLabelState.tagIndex) ? 'outline:2px solid #3b2a12;' : '';
      return '<button type="button" data-mi="' + num + '" title="' + tag[0] + '" ' +
        'style="' + btnStyle(num) + ';' + sel + 'padding:2px 5px;border-radius:3px;cursor:pointer;border:1px solid rgba(0,0,0,.25);">' +
        tag[1] + '</button>';
    }).join('');

    panel.innerHTML = [
      '<div id="ml-header" style="background:#d2b47a;border-bottom:1px solid #7b5b2b;padding:6px 10px;',
        'border-radius:5px 5px 0 0;cursor:move;display:flex;justify-content:space-between;align-items:center;">',
        '<b>Mass Label</b>',
        '<span style="font-size:10px;cursor:pointer;" id="ml-collapse">▾</span>',
      '</div>',
      '<div id="ml-body" style="padding:8px 10px;">',

        // Tag picker
        '<div style="margin-bottom:6px;font-weight:bold;">Tag a aplicar:</div>',
        '<div id="ml-tag-preview" style="margin-bottom:4px;min-height:18px;font-style:italic;color:#7b5b2b;"></div>',
        '<div style="display:flex;flex-wrap:wrap;gap:3px;margin-bottom:10px;" id="ml-tag-btns">',
          tagBtns,
        '</div>',

        // Delay settings
        '<div style="display:grid;grid-template-columns:1fr 70px;gap:4px 8px;align-items:center;margin-bottom:10px;">',
          '<label>Delay mínimo (s)</label>',
          '<input id="ml-min" type="number" min="10" max="600" value="' + massLabelState.delayMin + '" ',
            'style="width:100%;padding:2px 4px;">',
          '<label>Extra aleatório (s)</label>',
          '<input id="ml-rnd" type="number" min="0"  max="120" value="' + massLabelState.delayRnd + '" ',
            'style="width:100%;padding:2px 4px;">',
        '</div>',

        // Status / countdown
        '<div id="ml-status" style="margin-bottom:8px;font-style:italic;min-height:16px;"></div>',

        // Action buttons
        '<div style="display:flex;gap:6px;">',
          '<button id="ml-start" class="btn" type="button" style="flex:1;">Iniciar</button>',
          '<button id="ml-cancel" class="btn" type="button" style="flex:1;display:none;">Cancelar</button>',
        '</div>',

      '</div>',
    ].join('');

    document.body.appendChild(panel);
    updateTagPreview();
    wirePanel();
    makeDraggable(panel, document.getElementById('ml-header'));
  }

  function updateTagPreview() {
    var el = document.getElementById('ml-tag-preview');
    if (el) el.textContent = TAGS[massLabelState.tagIndex][0];
  }

  function setStatus(txt) {
    var el = document.getElementById('ml-status');
    if (el) el.textContent = txt;
  }

  function wirePanel() {
    // Collapse toggle
    document.getElementById('ml-collapse').addEventListener('click', function () {
      var body = document.getElementById('ml-body');
      var collapsed = body.style.display === 'none';
      body.style.display = collapsed ? '' : 'none';
      this.textContent = collapsed ? '▾' : '▸';
    });

    // Tag picker buttons
    document.getElementById('ml-tag-btns').addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-mi]');
      if (!btn) return;
      massLabelState.tagIndex = parseInt(btn.getAttribute('data-mi'), 10);

      // Update selection outline
      document.querySelectorAll('#ml-tag-btns button[data-mi]').forEach(function (b) {
        var cur = b.getAttribute('style').replace(/outline:[^;]+;?/g, '');
        b.setAttribute('style', cur + (b === btn ? 'outline:2px solid #3b2a12;' : ''));
      });
      updateTagPreview();
    });

    // Delay inputs
    document.getElementById('ml-min').addEventListener('change', function () {
      massLabelState.delayMin = Math.max(10, parseInt(this.value, 10) || 120);
      this.value = massLabelState.delayMin;
    });
    document.getElementById('ml-rnd').addEventListener('change', function () {
      massLabelState.delayRnd = Math.max(0, parseInt(this.value, 10) || 30);
      this.value = massLabelState.delayRnd;
    });

    // Start
    document.getElementById('ml-start').addEventListener('click', startMassLabel);

    // Cancel
    document.getElementById('ml-cancel').addEventListener('click', cancelMassLabel);
  }

  var countdownInterval = null;

  function startMassLabel() {
    if (massLabelState.timer) return;

    var extraMs  = Math.random() * massLabelState.delayRnd * 1000;
    var totalMs  = massLabelState.delayMin * 1000 + extraMs;
    massLabelState.deadline = Date.now() + totalMs;

    document.getElementById('ml-start').style.display  = 'none';
    document.getElementById('ml-cancel').style.display = '';

    countdownInterval = setInterval(function () {
      var left = massLabelState.deadline - Date.now();
      if (left <= 0) {
        clearInterval(countdownInterval);
        setStatus('A executar…');
        return;
      }
      setStatus('A iniciar em ' + Math.ceil(left / 1000) + 's…');
    }, 250);

    massLabelState.timer = setTimeout(function () {
      clearInterval(countdownInterval);
      executeMassLabel();
    }, totalMs);

    setStatus('Agendado para ' + Math.round(totalMs / 1000) + 's…');
  }

  function cancelMassLabel() {
    if (massLabelState.timer) {
      clearTimeout(massLabelState.timer);
      massLabelState.timer = null;
    }
    clearInterval(countdownInterval);
    massLabelState.deadline = null;
    document.getElementById('ml-start').style.display  = '';
    document.getElementById('ml-cancel').style.display = 'none';
    setStatus('Cancelado.');
  }

  function executeMassLabel() {
    massLabelState.timer = null;

    // 1. Select all checkboxes
    var selectAll = document.querySelector('input#select_all.selectAll');
    if (!selectAll) {
      setStatus('Erro: botão "selecionar todos" não encontrado.');
      resetPanelButtons();
      return;
    }
    if (!selectAll.checked) selectAll.click();

    // 2. Pick label radio
    setTimeout(function () {
      var radios = document.getElementsByName('label');
      if (!radios || radios.length === 0) {
        setStatus('Erro: radio buttons de etiqueta não encontrados.');
        resetPanelButtons();
        return;
      }
      var li = Math.min(massLabelState.tagIndex, radios.length - 1);
      if (!radios[li].checked) radios[li].click();

      // 3. Submit
      setTimeout(function () {
        var submitBtn = document.querySelector('input[type="submit"][name="label"][value="Etiqueta"]');
        if (submitBtn) {
          submitBtn.click();
          setStatus('✓ Etiqueta "' + TAGS[massLabelState.tagIndex][0].trim() + '" aplicada!');
        } else {
          var form = document.querySelector('#incomings-form, form[action*="label"], form');
          if (form) {
            form.submit();
            setStatus('✓ Enviado via fallback.');
          } else {
            setStatus('Erro: botão de submissão não encontrado.');
          }
        }
        resetPanelButtons();
      }, 800 + Math.random() * 700);
    }, 1200 + Math.random() * 800);
  }

  function resetPanelButtons() {
    var s = document.getElementById('ml-start');
    var c = document.getElementById('ml-cancel');
    if (s) s.style.display = '';
    if (c) c.style.display = 'none';
  }

  // ── Draggable panel ─────────────────────────────────────────────────────────
  function makeDraggable(panel, handle) {
    var dx = 0, dy = 0, x0 = 0, y0 = 0;

    handle.addEventListener('mousedown', function (e) {
      e.preventDefault();
      x0 = e.clientX; y0 = e.clientY;

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });

    function onMove(e) {
      dx = x0 - e.clientX; dy = y0 - e.clientY;
      x0 = e.clientX;      y0 = e.clientY;
      panel.style.top   = (panel.offsetTop  - dy) + 'px';
      panel.style.right = 'auto';
      panel.style.left  = (panel.offsetLeft - dx) + 'px';
    }

    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }
  }

  // ── Main polling loop (incomings table) ─────────────────────────────────────
  function runIncomingsTable() {
    buildMassPanel();

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

        // Inject per-row buttons once
        if ($cmdCell.find('.rename-buttons').length === 0 && $cmdCell.find('.rename-icon').length > 0) {
          injectRowButtons($cmdCell);
        }

        paintRow($row, row, name);
      });
    }, 250);
  }

  // ── Legacy path: main overview (not overview_villages) ──────────────────────
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

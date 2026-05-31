// ==UserScript==
// @name         TW Snipe scheduler
// @namespace    https://pt111.tribalwars.com.pt/
// @version      1.7.0
// @description  🎯 opens UI. Auto mode reads Nobre incomings. Manual mode: enter target coords + attack timings for teammate support. Villages sorted by soonest feasible send. Choose units to send (all are constrained to be <= chosen slowest). Unit icon toggles select-all for that unit. "Select all" fills all shown units. Each candidate has its own countdown timer (multiple timers run simultaneously; negative red after). "Open support" opens new tab and auto place->confirm (no final send). CStime is mid-gap.
// @author       pequeneza
// @match        *://pt111.tribalwars.com.pt/game.php*screen=overview*
// @match        *://pt111.tribalwars.com.pt/game.php*screen=place*
// @grant        GM_xmlhttpRequest
// @connect      pt111.tribalwars.com.pt
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const $ = window.jQuery;
  if (!($ && $.fn && $.fn.on)) return;

  const STORAGE_KEY = 'tw_gap_snipe_plan_v12';
  const MANUAL_KEY   = 'tw_snipe_manual_timings_v1';

  // ── Suite config integration ───────────────────────────────────────────
  const _suiteCfg = (typeof window.__twSuiteCfg === 'function')
    ? window.__twSuiteCfg('tw_snipe_scheduler')
    : {};
  const _defaultGameSpeed = String(_suiteCfg.gameSpeed ?? 1.4);
  const _defaultUnitSpeed = String(_suiteCfg.unitSpeed ?? 0.75);
  // ──────────────────────────────────────────────────────────────────

  const UI_ID = 'twgs_ui';
  const BTN_ID = 'twgs_open_btn';

  const UNIT_MIN_PER_FIELD = {
    spear: 18,
    sword: 22,
    axe: 18,
    archer: 18,
    spy: 9,
    light: 10,
    marcher: 10,
    heavy: 11,
    ram: 30,
    catapult: 30,
    snob: 35,
    knight: 10
  };

  // fastest -> slowest
  const UNIT_ORDER_FAST_TO_SLOW = [
    'spy','light','knight','marcher','heavy','spear','axe','archer','sword','ram','catapult','snob'
  ].filter(u => u in UNIT_MIN_PER_FIELD);

  const PAGES = {
    ownHomeUnits: (villageId) =>
      `https://pt111.tribalwars.com.pt/game.php?village=${encodeURIComponent(villageId)}&screen=overview_villages&mode=units&type=own_home`
  };

  // ---------------- helpers ----------------
  function pad2(n) { return String(n).padStart(2, '0'); }
  function fmtDateMs(d) {
    const sss = String(d.getMilliseconds()).padStart(3, '0');
    return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}.${sss}`;
  }
  function toDatetimeLocalMs(ms) {
    const d = new Date(ms);
    const yyyy = d.getFullYear();
    const MM = pad2(d.getMonth() + 1);
    const dd = pad2(d.getDate());
    const hh = pad2(d.getHours());
    const mm = pad2(d.getMinutes());
    const ss = pad2(d.getSeconds());
    const sss = String(d.getMilliseconds()).padStart(3, '0');
    return `${yyyy}-${MM}-${dd}T${hh}:${mm}:${ss}.${sss}`;
  }
  function parseCoord(str) {
    const m = String(str).match(/(\d{3})\|(\d{3})/);
    if (!m) return null;
    return { x: +m[1], y: +m[2] };
  }
  function dist(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx*dx + dy*dy);
  }

  // speedFactor = 1 / (gameSpeed * unitSpeed)
  function travelMsForUnit(unit, from, to, speedFactor) {
    const mpf = UNIT_MIN_PER_FIELD[unit] ?? UNIT_MIN_PER_FIELD.spear;
    const minutes = mpf * dist(from, to) * speedFactor;
    return minutes * 60 * 1000;
  }

  function clampInt(n, lo, hi) {
    if (!Number.isFinite(n)) return lo;
    return Math.max(lo, Math.min(hi, n));
  }

  function gmGet(url) {
    return new Promise((resolve, reject) => {
      if (typeof GM_xmlhttpRequest === 'function') {
        GM_xmlhttpRequest({
          method: 'GET',
          url,
          onload: (res) => resolve(res.responseText),
          onerror: reject
        });
      } else {
        $.get(url).done(resolve).fail(reject);
      }
    });
  }

  function parseHTML(html) {
    return new DOMParser().parseFromString(html, 'text/html');
  }

  function getQueryParam(name) {
    const m = location.search.match(new RegExp(`[?&]${name}=([^&]+)`));
    return m ? decodeURIComponent(m[1]) : null;
  }

  function getServerNowMs() {
    try {
      if (window.Timing?.getCurrentServerTime) return window.Timing.getCurrentServerTime();
    } catch {}
    return Date.now();
  }

  function unitIconUrl(unit) {
    return `https://dspt.innogamescdn.com/asset/b2fb8d33/graphic/unit/unit_${unit}.webp`;
  }

  function formatCountdown(diffMs) {
    const sign = diffMs < 0 ? '-' : '';
    const abs = Math.abs(diffMs);
    const s = Math.floor(abs / 1000);
    const ms = abs % 1000;
    const mm = Math.floor(s / 60);
    const ss = s % 60;
    return `${sign}${pad2(mm)}:${pad2(ss)}.${String(ms).padStart(3, '0')}`;
  }

  // ---------------- plan storage ----------------
  const PLAN_TTL_MS = 5 * 60 * 1000; // 5 minutes — abandon stale plans

  function loadPlan() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    try {
      const plan = JSON.parse(raw);
      // Discard plans older than TTL — prevents stale plans from firing on
      // unrelated place-page visits (e.g. after closing the tab mid-flow).
      if (plan?.createdAt && (Date.now() - plan.createdAt) > PLAN_TTL_MS) {
        localStorage.removeItem(STORAGE_KEY);
        return null;
      }
      return plan;
    } catch { return null; }
  }
  function clearPlan() { localStorage.removeItem(STORAGE_KEY); }

  // ---------------- manual timings storage ----------------
  function loadManualTimings() {
    try {
      const raw = localStorage.getItem(MANUAL_KEY);
      if (!raw) return { target: '', timings: [] };
      return JSON.parse(raw) || { target: '', timings: [] };
    } catch { return { target: '', timings: [] }; }
  }
  function saveManualTimings(data) {
    localStorage.setItem(MANUAL_KEY, JSON.stringify(data));
  }

  // ---------------- place/confirm automation ----------------
  function fillTargetOnPlace(plan) {
    const $field = $('input.target-input-field').first();
    if (!$field.length) return false;
    $field.val(`${plan.target.x}|${plan.target.y}`).trigger('input').trigger('change');
    return true;
  }

  function fillUnitsOnPlace(plan) {
    const units = plan.unitsToSend || {};
    let wrote = false;

    $('input.unitsInput').each((_, el) => {
      const $e = $(el);
      const nm = $e.attr('name');
      if (nm && (nm in UNIT_MIN_PER_FIELD)) $e.val('0');
    });

    for (const [unit, amount] of Object.entries(units)) {
      if (!amount || amount <= 0) continue;
      const $inp = $(`input.unitsInput[name="${unit}"], input#unit_input_${unit}`);
      if (!$inp.length) continue;
      $inp.val(String(amount)).trigger('input').trigger('change');
      wrote = true;
    }
    return wrote;
  }

  function submitSupportOnPlace() {
    const $btn = $('input[type="submit"][name="suport"], button[name="suport"]').first();
    if ($btn.length) { $btn.trigger('click'); return true; }
    return false;
  }

  function fillCStimeAndConfirm(plan) {
    const $cs = $('#CStime');
    if (!$cs.length) return false;

    $cs.val(toDatetimeLocalMs(plan.midGapArrivalMs)).trigger('input').trigger('change');

    const $confirm =
      $('button, input[type="submit"], a.btn').filter((_, el) => {
        const t = ($(el).text() || $(el).val() || '').trim().toLowerCase();
        return t === 'confirmar';
      }).first();

    if ($confirm.length) {
      clearPlan();
      $confirm.trigger('click');
      return true;
    }
    return false;
  }

  function runPlaceAutomationIfNeeded() {
    if (getQueryParam('screen') !== 'place') return;

    const plan = loadPlan();
    if (!plan?.target || !plan?.sourceVillageId || !plan?.unitsToSend || !plan?.midGapArrivalMs) return;

    if ($('#CStime').length) {
      fillCStimeAndConfirm(plan);
      return;
    }

    const okT = fillTargetOnPlace(plan);
    const okU = fillUnitsOnPlace(plan);
    if (okT && okU) setTimeout(() => submitSupportOnPlace(), 350);
  }

  if (getQueryParam('screen') === 'place') {
    setTimeout(runPlaceAutomationIfNeeded, 500);
    return;
  }

  // ---------------- overview state ----------------
  const state = {
    target: null,
    incomings: [],
    troopsByVillage: [],
    selectedGapIndex: null,
    timers: new Map(), // idx -> interval id
    activeTab: 'auto'  // 'auto' | 'manual'
  };

  function getCurrentVillageId() {
    const dv = document.querySelector('#commands_incomings')?.getAttribute('data-village');
    if (dv && /^\d+$/.test(dv)) return dv;

    const m = location.search.match(/[?&]village=(\d+)/);
    if (m) return m[1];

    const gd = window.game_data?.village?.id;
    if (gd && /^\d+$/.test(String(gd))) return String(gd);

    return null;
  }

  // Extract the command label from a row — works for both #commands_incomings
  // (main overview) and #incomings_table (overview_villages incomings).
  function getCommandLabel($tr) {
    // overview_villages: label lives inside .quickedit-label
    const $ql = $tr.find('.quickedit-label').first();
    if ($ql.length) return $ql.text().trim();
    // main overview: first td text, stripped of timing noise
    return $tr.find('td').first().text().trim();
  }

  // Extract the target village coord from a row.
  // overview_villages: target is in a td containing a link to info_village,
  //   which has a b.nowrap with the coord, or the coord is in the link text.
  // main overview: looks for b.nowrap inside the row.
  function getRowTargetCoord($tr) {
    // Try b.nowrap anywhere in the row first (works for both layouts)
    let coord = null;
    $tr.find('b.nowrap').each((_, el) => {
      if (coord) return;
      const c = parseCoord($(el).text());
      if (c) coord = c;
    });
    if (coord) return coord;

    // Fallback: any link to info_village — coord may be in href or text
    $tr.find('a[href*="info_village"]').each((_, el) => {
      if (coord) return;
      const c = parseCoord($(el).text()) || parseCoord($(el).attr('href') || '');
      if (c) coord = c;
    });
    return coord;
  }

  // Reads incoming attack commands from the current page.
  // Supports both:
  //   - screen=overview / screen=overview_villages&mode=overview → #commands_incomings
  //   - screen=overview_villages&mode=incomings                  → #incomings_table
  //
  // Filtering rules:
  //   1. Skip supports.
  //   2. Only include commands whose label contains "Nobre" (case-insensitive).
  //   3. Only form gaps between consecutive commands sharing the same target coord.
  //   4. Each entry carries { arrivalMs, label, target } for gap labelling.
  function readIncomingsMsFromDOM() {
    // Detect which table is present
    const $cmdWrap = $('#commands_incomings');
    const $incTable = $('#incomings_table');

    const rows = [];

    if ($cmdWrap.length) {
      $cmdWrap.find('tr.command-row').each((_, tr) => {
        rows.push($(tr));
      });
    } else if ($incTable.length) {
      // overview_villages&mode=incomings: rows are tr.nowrap or generic tbody tr
      const $r = $incTable.find('tr.nowrap');
      ($r.length ? $r : $incTable.find('tbody tr')).each((_, tr) => {
        rows.push($(tr));
      });
    }

    if (!rows.length) return [];

    const list = [];

    for (const $tr of rows) {
      // Skip supports
      const cmdType = (
        $tr.attr('data-command-type') ||
        $tr.find('[data-command-type]').first().attr('data-command-type') ||
        ''
      ).toLowerCase();
      if (cmdType === 'support') continue;

      const label = getCommandLabel($tr);

      // Extract timing
      const endSpan = $tr.find('span[data-endtime]').first();
      const endtimeSec = parseInt(endSpan.attr('data-endtime') || '', 10);
      if (!endtimeSec) continue;

      const grey = $tr.find('span.grey.small').first().text().trim();
      const ms = clampInt(parseInt(grey || '0', 10), 0, 999);

      // Extract target coord
      const target = getRowTargetCoord($tr);
      if (!target) continue;

      list.push({ arrivalMs: endtimeSec * 1000 + ms, label, target });
    }

    list.sort((a, b) => a.arrivalMs - b.arrivalMs);
    return list;
  }

  // getTargetCoordFromNowrapB is kept as fallback for pages without labelled rows.
  // The primary target is now derived from incomings themselves (first coord found).
  function getTargetCoordFromNowrapB() {
    let coord = null;
    $('b.nowrap').each((_, el) => {
      if (coord) return;
      const c = parseCoord($(el).text());
      if (c) coord = c;
    });
    return coord;
  }

  function unitFromHeaderImgSrc(src) {
    const m = String(src).match(/\/unit_([a-z0-9_]+)\./i);
    if (!m) return null;
    const raw = m[1].toLowerCase();
    if (raw === 'militia') return null;
    return raw;
  }

  async function fetchOwnHomeTroops(villageId) {
    const html = await gmGet(PAGES.ownHomeUnits(villageId));
    const doc = parseHTML(html);

    const tables = [...doc.querySelectorAll('table.vis')];
    const table = tables.find(t => t.querySelector('thead img[src*="/graphic/unit/unit_"]'));
    if (!table) return [];

    const ths = [...table.querySelectorAll('thead th')];
    const headerUnits = [];
    ths.forEach((th) => {
      const img = th.querySelector('img');
      const u = img ? unitFromHeaderImgSrc(img.getAttribute('src') || '') : null;
      if (u && UNIT_MIN_PER_FIELD[u] != null) headerUnits.push(u);
    });

    const out = [];
    const rows = [...doc.querySelectorAll('table.vis tbody tr')];
    for (const tr of rows) {
      const label = tr.querySelector('.quickedit-label');
      const coord = parseCoord(label?.textContent || tr.textContent || '');
      if (!coord) continue;

      const a = tr.querySelector('a[href*="village="]');
      const href = a?.getAttribute('href') || '';
      const idMatch = href.match(/[?&]village=(\d+)/);
      const villageIdRow = idMatch ? idMatch[1] : null;

      const unitTds = [...tr.querySelectorAll('td.unit-item')];
      if (!unitTds.length) continue;

      const troops = {};
      for (let i = 0; i < headerUnits.length && i < unitTds.length; i++) {
        const unit = headerUnits[i];
        const raw = (unitTds[i].textContent || '').replace(/[^\d]/g, '');
        troops[unit] = raw ? parseInt(raw, 10) : 0;
      }

      out.push({ villageId: villageIdRow, coord, troops });
    }

    return out;
  }

function ensureOpenIcon() {
  if (document.getElementById(BTN_ID)) return;

  // Try several likely headers/anchors across TW layouts
  const $anchors = $([
    '#show_incoming_units h4.head',
    '#commands_incomings h4.head',
    '#commands_incomings .head',
    '#commands_incomings',
    '#contentContainer h2',      // fallback: main title
    '#contentContainer h3',
    '#contentContainer h4.head',
    '#content_value h4.head'
  ].join(',')).filter(':visible');

  let $btn = $(
    `<button id="${BTN_ID}" class="btn" type="button" style="float:right; margin-left:6px;">🎯</button>`
  );
  $btn.on('click', () => openUI());

  if ($anchors.length) {
    // attach to first matching anchor
    $anchors.first().append($btn);
    return;
  }

  // Last resort: fixed button so it's always accessible
  $btn.removeAttr('style').attr(
    'style',
    'position:fixed; right:18px; top:120px; z-index:99999; padding:6px 10px;'
  );
  $('body').append($btn);
}

  function ensureUI() {
  if (document.getElementById(UI_ID)) return;

  const $ui = $(`
    <div id="${UI_ID}" style="
      position: fixed;
      right: 15px;
      top: 80px;
      z-index: 99999;
      width: 660px;
      max-height: 80vh;
      overflow: auto;
      display:none;
    ">
      <div class="vis">
        <h4 class="head">
          Gap Snipe Planner
          <span style="float:right;">
            <a href="#" id="twgs_close">[close]</a>
            <a href="#" id="twgs_reload">[reload]</a>
          </span>
        </h4>

        <div class="content-border">
        <div class="content-bg">

          <!-- Tab bar -->
          <div style="display:flex; gap:0; margin-bottom:10px; border-bottom:2px solid rgba(0,0,0,0.15);">
            <button id="twgs_tab_auto" type="button" class="btn" style="border-radius:4px 4px 0 0; margin-right:4px;">
              🏹 Auto (Nobre incomings)
            </button>
            <button id="twgs_tab_manual" type="button" class="btn" style="border-radius:4px 4px 0 0;">
              ✏️ Manual (teammate support)
            </button>
          </div>

          <!-- Shared speed settings -->
          <table class="vis" width="100%" style="margin-bottom:6px;">
            <tr>
              <th width="150">Game speed</th>
              <td><input id="twgs_gameSpeed" type="number" step="0.01" value="${_defaultGameSpeed}" style="width:80px"></td>
              <th width="100">Unit speed</th>
              <td><input id="twgs_unitSpeed" type="number" step="0.01" value="${_defaultUnitSpeed}" style="width:80px"></td>
              <th width="80">Sigil %</th>
              <td><input id="twgs_sigil" type="number" step="1" min="0" max="100" value="0" style="width:60px" title="Sigil item bonus that reduces travel time (e.g. 20 = 20% faster)"></td>
            </tr>
          </table>

          <!-- AUTO TAB -->
          <div id="twgs_panel_auto">
            <table class="vis" width="100%" style="margin-bottom:6px;">
              <tr>
                <th width="150">Target</th>
                <td id="twgs_target_lbl">—</td>
              </tr>
            </table>
            <h4>Available gaps</h4>
            <div id="twgs_gaps"></div>
            <br>
            <h4>Results</h4>
            <div id="twgs_result">—</div>
          </div>

          <!-- MANUAL TAB -->
          <div id="twgs_panel_manual" style="display:none;">
            <table class="vis" width="100%" style="margin-bottom:8px;">
              <tr>
                <th width="150">Target coords</th>
                <td>
                  <input id="twgs_manual_target" type="text" placeholder="451|601" style="width:120px;">
                  <span style="color:#555; font-size:11px; margin-left:8px;">village the teammate is sending nobles to</span>
                </td>
              </tr>
            </table>

            <h4 style="margin-bottom:4px;">Attack timings
              <button type="button" class="btn" id="twgs_manual_add" style="font-size:11px; padding:2px 8px; margin-left:8px;">+ Add</button>
              <button type="button" class="btn" id="twgs_manual_paste" style="font-size:11px; padding:2px 8px; margin-left:4px;" title="Paste attack arrival times from clipboard (HH:MM:SS, hoje às …, amanhã às …, DD.MM. às …)">📋 Paste</button>
              <span style="color:#555; font-size:11px; margin-left:8px;">enter arrival time of each noble/attack at the target</span>
            </h4>
            <div id="twgs_manual_timings" style="margin-bottom:8px;"></div>

            <div style="display:flex; gap:8px; margin-bottom:6px;">
              <button type="button" class="btn" id="twgs_manual_compute">Compute gaps</button>
              <button type="button" class="btn" id="twgs_manual_clear_all" style="color:#b71c1c;">Clear all</button>
            </div>
            <div id="twgs_paste_error" style="display:none; color:#b71c1c; font-size:11px; margin-bottom:6px;"></div>

            <h4>Results</h4>
            <div id="twgs_result_manual">—</div>
          </div>

        </div>
        </div>
      </div>
    </div>
  `);

  $('body').append($ui);

  // ── close / reload ─────────────────────────────────────────────────────────
  $('#twgs_close').on('click', (e) => { e.preventDefault(); $ui.hide(); });
  $('#twgs_reload').on('click', (e) => { e.preventDefault(); openUI(); });

  // ── speed change: re-render whichever tab is active ────────────────────────
  $('#twgs_gameSpeed, #twgs_unitSpeed, #twgs_sigil').on('change input', () => {
    if (state.activeTab === 'auto' && state.selectedGapIndex != null) renderSelectedGapResults();
    if (state.activeTab === 'manual') renderManualResults();
  });

  // ── tab switching ──────────────────────────────────────────────────────────
  function activateTab(tab) {
    state.activeTab = tab;
    if (tab === 'auto') {
      $('#twgs_panel_auto').show();
      $('#twgs_panel_manual').hide();
      $('#twgs_tab_auto').css('font-weight', 'bold');
      $('#twgs_tab_manual').css('font-weight', 'normal');
    } else {
      $('#twgs_panel_auto').hide();
      $('#twgs_panel_manual').show();
      $('#twgs_tab_auto').css('font-weight', 'normal');
      $('#twgs_tab_manual').css('font-weight', 'bold');
      restoreManualForm();
    }
  }
  $('#twgs_tab_auto').on('click', () => activateTab('auto'));
  $('#twgs_tab_manual').on('click', () => activateTab('manual'));


  // ── Paste timings: parse clipboard text into timing rows ──────────────────
  // Recognised formats (PT locale + plain):
  //   hoje às HH:MM:SS[.mmm]       → today
  //   amanhã às HH:MM:SS[.mmm]     → tomorrow
  //   DD.MM. às HH:MM:SS[.mmm]     → specific date (current year)
  //   HH:MM:SS[.mmm]               → today (bare time, rolls to tomorrow if past)
  function parsePastedTimings(text) {
    const now   = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const norm = text.replace(/\u00a0/g, ' ').replace(/às/g, 'as');

    const results = [];
    const re = /(?:(hoje|amanha|amanh[aã])|(\d{1,2})\.(\d{1,2})\.)?\s*(?:as\s+)?(\d{1,2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?/gi;

    let m;
    while ((m = re.exec(norm)) !== null) {
      const [, todayKw, dayStr, monStr, hh, mm, ss, msStr] = m;
      const hours   = parseInt(hh, 10);
      const minutes = parseInt(mm, 10);
      const seconds = parseInt(ss, 10);
      const millis  = msStr ? parseInt(msStr.padEnd(3, '0'), 10) : 0;

      let base;
      if (todayKw) {
        base = new Date(today);
        if (!/hoje/i.test(todayKw)) base.setDate(base.getDate() + 1);
      } else if (dayStr && monStr) {
        const day = parseInt(dayStr, 10), month = parseInt(monStr, 10) - 1;
        base = new Date(now.getFullYear(), month, day);
        if (base.getTime() < now.getTime() - 12 * 3600000) base.setFullYear(base.getFullYear() + 1);
      } else {
        base = new Date(today);
        const cand = new Date(today.getFullYear(), today.getMonth(), today.getDate(), hours, minutes, seconds, millis);
        if (cand.getTime() < now.getTime() - 2000) base.setDate(base.getDate() + 1);
      }
      base.setHours(hours, minutes, seconds, 0);
      results.push({ dt: toDatetimeLocalMs(base.getTime()), ms: millis });
    }

    // Deduplicate
    const seen = new Set();
    return results.filter(({ dt, ms }) => {
      const key = `${dt}+${ms}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  // ── Manual tab: timing row management ─────────────────────────────────────
  function addTimingRow(value) {
    const now = new Date();
    const defaultVal = value || toDatetimeLocalMs(now.getTime() + 60 * 60 * 1000);
    const rowId = 'twgs_tr_' + Date.now() + '_' + Math.random().toString(36).slice(2);
    const $row = $(`
      <div class="twgs_timing_row" id="${rowId}" style="display:flex; gap:6px; align-items:center; margin-bottom:4px;">
        <input type="datetime-local" class="twgs_timing_input" step="0.001"
               value="${defaultVal}"
               style="width:240px; font-family:monospace; font-size:12px;">
        <span style="color:#555; font-size:11px;">ms:</span>
        <input type="number" class="twgs_timing_ms" min="0" max="999" value="0"
               style="width:52px; font-size:12px;" placeholder="0-999">
        <button type="button" class="btn twgs_timing_del" style="font-size:11px; padding:1px 6px; color:#b71c1c;">✕</button>
      </div>
    `);
    $row.find('.twgs_timing_del').on('click', () => { $row.remove(); saveManualForm(); });
    $row.find('.twgs_timing_input, .twgs_timing_ms').on('change input', () => saveManualForm());
    $('#twgs_manual_timings').append($row);
  }

  function saveManualForm() {
    const target = $('#twgs_manual_target').val().trim();
    const timings = [];
    $('#twgs_manual_timings .twgs_timing_row').each((_, row) => {
      const dtVal = $(row).find('.twgs_timing_input').val();
      const msExtra = parseInt($(row).find('.twgs_timing_ms').val() || '0', 10) || 0;
      if (dtVal) timings.push({ dt: dtVal, ms: msExtra });
    });
    saveManualTimings({ target, timings });
  }

  function restoreManualForm() {
    const saved = loadManualTimings();
    $('#twgs_manual_target').val(saved.target || '');
    $('#twgs_manual_timings').empty();
    const rows = saved.timings && saved.timings.length ? saved.timings : [];
    if (!rows.length) { addTimingRow(); }
    else rows.forEach(r => addTimingRow(r.dt));
    // restore ms values after rows are added
    saved.timings && saved.timings.forEach((r, i) => {
      $('#twgs_manual_timings .twgs_timing_row').eq(i).find('.twgs_timing_ms').val(String(r.ms || 0));
    });
  }

  $('#twgs_manual_target').on('change input', () => saveManualForm());
  $('#twgs_manual_add').on('click', () => { addTimingRow(); saveManualForm(); });

  $('#twgs_manual_paste').on('click', async () => {
    const $errDiv = $('#twgs_paste_error');
    $errDiv.hide().text('');
    try {
      const text = await navigator.clipboard.readText();
      const parsed = parsePastedTimings(text);
      if (!parsed.length) {
        $errDiv.text('No recognisable timings found. Copy attack arrival times (e.g. 22:32:14 or hoje às 22:32:14).').show();
        return;
      }
      // Collect already-present dt values to avoid duplicates
      const existing = new Set();
      $('#twgs_manual_timings .twgs_timing_row').each((_, row) => {
        const dt = $(row).find('.twgs_timing_input').val();
        const ms = $(row).find('.twgs_timing_ms').val() || '0';
        if (dt) existing.add(dt + '+' + ms);
      });
      const toAdd = parsed.filter(p => !existing.has(p.dt + '+' + (p.ms || 0)));
      if (!toAdd.length) {
        $errDiv.text('All pasted timings are already in the list.').show();
        return;
      }
      const startIdx = $('#twgs_manual_timings .twgs_timing_row').length;
      toAdd.forEach(p => addTimingRow(p.dt));
      toAdd.forEach((p, i) => {
        $('#twgs_manual_timings .twgs_timing_row').eq(startIdx + i).find('.twgs_timing_ms').val(String(p.ms || 0));
      });
      saveManualForm();
    } catch {
      $errDiv.text('Clipboard access denied — please paste manually.').show();
    }
  });
  $('#twgs_manual_clear_all').on('click', () => {
    $('#twgs_manual_timings').empty();
    addTimingRow();
    saveManualForm();
    $('#twgs_result_manual').html('—');
  });

  $('#twgs_manual_compute').on('click', async () => {
    saveManualForm();
    const targetStr = $('#twgs_manual_target').val().trim();
    const target = parseCoord(targetStr);
    if (!target) {
      $('#twgs_result_manual').html('<div style="color:#b71c1c;">Invalid target coords. Use format 451|601.</div>');
      return;
    }

    const incomings = [];
    $('#twgs_manual_timings .twgs_timing_row').each((_, row) => {
      const dtVal = $(row).find('.twgs_timing_input').val();
      const msExtra = parseInt($(row).find('.twgs_timing_ms').val() || '0', 10) || 0;
      if (!dtVal) return;
      const baseMs = new Date(dtVal).getTime();
      if (!isNaN(baseMs)) incomings.push({ arrivalMs: baseMs + msExtra, label: '', target });
    });

    if (incomings.length < 2) {
      $('#twgs_result_manual').html('<div style="color:#b71c1c;">Need at least 2 attack timings to form a gap.</div>');
      return;
    }

    incomings.sort((a, b) => a.arrivalMs - b.arrivalMs);

    // Reuse state to share gap rendering with auto tab
    state.target = target;
    state.incomings = incomings;

    $('#twgs_result_manual').html('<div style="color:#555;">Loading troops…</div>');

    const vid = getCurrentVillageId();
    if (!vid) {
      $('#twgs_result_manual').html('<div style="color:#b71c1c;">Could not detect current village id.</div>');
      return;
    }

    state.troopsByVillage = await fetchOwnHomeTroops(vid);

    renderManualGapsAndResults();
  });
}

  function renderManualGapsAndResults() {
    const incomings = state.incomings;
    const $out = $('#twgs_result_manual');
    $out.html('<div style="color:#555;">Computing…</div>');

    let fullHtml = '';
    for (let i = 0; i < incomings.length - 1; i++) {
      const a = incomings[i];
      const b = incomings[i + 1];
      const midGapArrivalMs = Math.floor((a.arrivalMs + b.arrivalMs) / 2);
      const candidates = buildCandidatesForGap(i, midGapArrivalMs);

      const candHtml = candidates.length === 0
        ? '<div style="color:#b71c1c; font-size:12px;">No feasible candidates (all in the past or no troops in range).</div>'
        : candidates.slice(0, 15).map((c, ci) => {
            const v = c.src.coord;
            const unitsRow = c.allowedUnits.map(u => {
              const avail = c.src.troops?.[u] || 0;
              return `<div class="twgs_unitbox" style="display:flex;flex-direction:column;align-items:center;width:50px;border:1px solid rgba(0,0,0,0.14);border-radius:8px;padding:5px;background:rgba(255,255,255,0.55);">
                <img class="twgs_icon" data-unit="${u}" src="${unitIconUrl(u)}" style="width:20px;height:20px;cursor:pointer;"/>
                <div style="color:#444;font-size:11px;margin-top:3px;">${avail}</div>
                <input class="twgs_amt" data-unit="${u}" data-max="${avail}" type="number" min="0" step="1" value="0"
                  style="width:42px;padding:1px 2px;font-size:11px;text-align:center;margin-top:3px;"/>
              </div>`;
            }).join('');
            return `<div class="twgs_candidate" style="border:1px solid rgba(0,0,0,0.14);border-radius:10px;padding:8px 10px;margin-bottom:8px;background:rgba(255,255,255,0.55);"
                  data-idx="${ci}" data-gap="${i}" data-mid="${midGapArrivalMs}">
              <div style="display:flex;justify-content:space-between;gap:10px;align-items:baseline;">
                <div><b>${v.x}|${v.y}</b></div>
                <div style="color:#333;">slowest: <b>${c.chosenSlowestUnit}</b> | <span style="color:#555;">send</span> <b>${fmtDateMs(new Date(c.sendMs))}</b></div>
              </div>
              <div style="margin-top:8px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
                <button type="button" class="btn twgs_timer">Timer</button>
                <div class="twgs_timer_out" style="min-width:130px;font-family:monospace;color:#555;">—</div>
                <button type="button" class="btn twgs_select_all">Select all</button>
                <button type="button" class="btn twgs_open_support">Open support</button>
              </div>
              <div style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap;align-items:flex-start;">${unitsRow}</div>
            </div>`;
          }).join('');

      fullHtml += `<div style="border:1px solid rgba(0,0,0,0.18);border-radius:6px;padding:8px 10px;margin-bottom:10px;background:rgba(255,255,255,0.4);">
        <div style="font-weight:bold;margin-bottom:6px;font-size:12px;">
          Gap ${i+1}: ${fmtDateMs(new Date(a.arrivalMs))} → ${fmtDateMs(new Date(b.arrivalMs))}
          <span style="color:#555;font-weight:normal;margin-left:8px;">CStime(mid): ${fmtDateMs(new Date(midGapArrivalMs))}</span>
        </div>
        ${candHtml}
      </div>`;

      // Store candidates per gap for event binding
      if (!$out.data('candidates')) $out.data('candidates', {});
      $out.data('candidates')[i] = { candidates, midGapArrivalMs };
    }

    $out.html(fullHtml || '<div style="color:#b71c1c;">No gaps computed.</div>');

    // Bind all events
    $out.find('input.twgs_amt').off('input').on('input', (e) => {
      const el = e.currentTarget;
      el.value = String(clampInt(parseInt(el.value || '0', 10), 0, parseInt(el.getAttribute('data-max') || '0', 10)));
    });

    $out.off('click.twgsIcon').on('click.twgsIcon', 'img.twgs_icon', (e) => {
      e.preventDefault(); e.stopPropagation();
      const unit = e.currentTarget.getAttribute('data-unit');
      const $cand = $(e.currentTarget).closest('.twgs_candidate');
      const $inp = $cand.find(`input.twgs_amt[data-unit="${unit}"]`).first();
      if (!$inp.length) return;
      const max = parseInt($inp.attr('data-max') || '0', 10);
      const cur = parseInt($inp.val() || '0', 10) || 0;
      $inp.val(cur > 0 ? '0' : String(max)).trigger('input');
      $(e.currentTarget).css('filter', cur > 0 ? '' : 'drop-shadow(0 0 4px rgba(46,125,50,0.8))');
    });

    $out.find('.twgs_select_all').off('click').on('click', (e) => {
      $(e.currentTarget).closest('.twgs_candidate').find('input.twgs_amt').each((_, el) => {
        el.value = String(parseInt(el.getAttribute('data-max') || '0', 10));
      });
    });

    $out.find('.twgs_timer').off('click').on('click', (e) => {
      const $cand = $(e.currentTarget).closest('.twgs_candidate');
      const gapIdx = parseInt($cand.attr('data-gap') || '0', 10);
      const candIdx = parseInt($cand.attr('data-idx') || '0', 10);
      const gapData = $out.data('candidates')?.[gapIdx];
      const c = gapData?.candidates?.[candIdx];
      if (!c) return;
      startTimer(gapIdx * 100 + candIdx, c.sendMs, $cand.find('.twgs_timer_out'));
    });

    $out.find('.twgs_open_support').off('click').on('click', (e) => {
      const $cand = $(e.currentTarget).closest('.twgs_candidate');
      const gapIdx = parseInt($cand.attr('data-gap') || '0', 10);
      const candIdx = parseInt($cand.attr('data-idx') || '0', 10);
      const gapData = $out.data('candidates')?.[gapIdx];
      const c = gapData?.candidates?.[candIdx];
      if (!c) return;
      if (!c.src.villageId) { alert('Cannot open support: missing villageId.'); return; }
      const unitsToSend = {};
      $cand.find('input.twgs_amt').each((_, el) => {
        const val = clampInt(parseInt(el.value || '0', 10), 0, parseInt(el.getAttribute('data-max') || '0', 10));
        if (val > 0) unitsToSend[el.getAttribute('data-unit')] = val;
      });
      if (!Object.keys(unitsToSend).length) { alert('Select at least one unit amount (>0).'); return; }
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        createdAt: Date.now(),
        sourceVillageId: c.src.villageId,
        target: state.target,
        unitsToSend,
        midGapArrivalMs: gapData.midGapArrivalMs
      }));
      window.open(
        `https://pt111.tribalwars.com.pt/game.php?village=${encodeURIComponent(c.src.villageId)}&screen=place`,
        '_blank', 'noopener,noreferrer'
      );
    });
  }

  function renderManualResults() {
    if (state.activeTab === 'manual' && state.incomings.length >= 2) {
      renderManualGapsAndResults();
    }
  }


  function getSpeedFactorFromUI() {
    const gameSpeed  = parseFloat($('#twgs_gameSpeed').val()) || 1.4;
    const unitSpeed  = parseFloat($('#twgs_unitSpeed').val()) || 0.75;
    const sigilPct   = parseFloat($('#twgs_sigil').val())     || 0;
    const sigilRatio = 1 + sigilPct / 100;
    // sigilRatio > 1 means troops travel faster → travel time is divided by sigilRatio
    return { gameSpeed, unitSpeed, sigilPct, speedFactor: 1 / (gameSpeed * unitSpeed * sigilRatio) };
  }

  function stopTimer(idx) {
    const existing = state.timers.get(idx);
    if (existing) {
      clearInterval(existing);
      state.timers.delete(idx);
    }
  }

  function startTimer(idx, sendMs, $container) {
    stopTimer(idx);

    const tick = () => {
      const now = getServerNowMs();
      const diff = sendMs - now;
      if (diff < 0) {
        $container.html(`<span style="color:#c62828; font-weight:bold;">${formatCountdown(diff)}</span>`);
      } else {
        $container.html(`<span style="color:#1b5e20; font-weight:bold;">${formatCountdown(diff)}</span>`);
      }
    };

    tick();
    const id = setInterval(tick, 50);
    state.timers.set(idx, id);
  }

  // Build candidate HTML for a gap. Returns HTML string.
  // containerSel is '#twgs_result' or '#twgs_result_manual' — used to bind events.
  function buildCandidatesForGap(gapAfterIdx, midGapArrivalMs) {
    const { speedFactor } = getSpeedFactorFromUI();
    const a = state.incomings[gapAfterIdx];
    const b = state.incomings[gapAfterIdx + 1];
    const afterMs  = a.arrivalMs;
    const beforeMs = b.arrivalMs;
    const nowMs = getServerNowMs();
    const candidates = [];

    for (const src of state.troopsByVillage) {
      let chosen = null;
      for (const unit of UNIT_ORDER_FAST_TO_SLOW.slice().reverse()) {
        const avail = src.troops?.[unit] || 0;
        if (!avail) continue;
        const tMs = travelMsForUnit(unit, src.coord, state.target, speedFactor);
        const earliestSendMs = (afterMs + 1) - tMs;
        const latestSendMs   = (beforeMs - 1) - tMs;
        if (earliestSendMs > latestSendMs) continue;
        if (latestSendMs < nowMs) continue;
        const sendForMid = midGapArrivalMs - tMs;
        const sendMs = Math.min(latestSendMs, Math.max(earliestSendMs, sendForMid));
        const arrivalMs = sendMs + tMs;
        if (!(arrivalMs > afterMs && arrivalMs < beforeMs)) continue;
        if (sendMs < nowMs) continue;
        chosen = { unit, sendMs, arrivalMs };
        break;
      }
      if (!chosen) continue;
      const chosenMpf = UNIT_MIN_PER_FIELD[chosen.unit];
      const allowedUnits = UNIT_ORDER_FAST_TO_SLOW
        .filter(u => UNIT_MIN_PER_FIELD[u] <= chosenMpf)
        .filter(u => (src.troops?.[u] || 0) > 0);
      candidates.push({
        src,
        chosenSlowestUnit: chosen.unit,
        sendMs: chosen.sendMs,
        arrivalMs: chosen.arrivalMs,
        allowedUnits
      });
    }

    candidates.sort((x, y) => x.sendMs - y.sendMs);
    return candidates;
  }

  function renderCandidates(candidates, midGapArrivalMs, $container) {
    if (!candidates.length) {
      $container.html('<div style="color:#b71c1c;">No feasible commands for this gap (or all in the past).</div>');
      return;
    }

    const html = candidates.slice(0, 15).map((c, i) => {
      const v = c.src.coord;
      const unitsRow = c.allowedUnits.map(u => {
        const avail = c.src.troops?.[u] || 0;
        return `
          <div class="twgs_unitbox" style="display:flex; flex-direction:column; align-items:center; width:50px; border:1px solid rgba(0,0,0,0.14); border-radius:8px; padding:5px; background:rgba(255,255,255,0.55);">
            <img class="twgs_icon" data-unit="${u}" src="${unitIconUrl(u)}"
              style="width:20px; height:20px; cursor:pointer;" />
            <div style="color:#444; font-size:11px; margin-top:3px;">${avail}</div>
            <input class="twgs_amt" data-unit="${u}" data-max="${avail}" type="number" min="0" step="1" value="0"
              style="width:42px; padding:1px 2px; font-size:11px; text-align:center; margin-top:3px;" />
          </div>`;
      }).join('');

      return `
        <div class="twgs_candidate" style="border:1px solid rgba(0,0,0,0.14); border-radius:10px; padding:8px 10px; margin-bottom:10px; background:rgba(255,255,255,0.55);"
             data-idx="${i}">
          <div style="display:flex; justify-content:space-between; gap:10px; align-items:baseline;">
            <div><b>${v.x}|${v.y}</b></div>
            <div style="color:#333;">
              slowest: <b>${c.chosenSlowestUnit}</b> |
              <span style="color:#555;">send</span> <b>${fmtDateMs(new Date(c.sendMs))}</b>
            </div>
          </div>
          <div style="margin-top:8px; display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
            <button type="button" class="btn twgs_timer">Timer</button>
            <div class="twgs_timer_out" style="min-width:130px; font-family:monospace; color:#555;">—</div>
            <button type="button" class="btn twgs_select_all">Select all</button>
            <button type="button" class="btn twgs_open_support">Open support</button>
          </div>
          <div style="margin-top:10px; display:flex; gap:6px; flex-wrap:wrap; align-items:flex-start;">
            ${unitsRow}
          </div>
        </div>`;
    }).join('');

    $container.html(html);
    bindCandidateEvents($container, candidates, midGapArrivalMs);
  }

  function bindCandidateEvents($container, candidates, midGapArrivalMs) {
    $container.find('input.twgs_amt').off('input').on('input', (e) => {
      const el = e.currentTarget;
      const max = parseInt(el.getAttribute('data-max') || '0', 10);
      el.value = String(clampInt(parseInt(el.value || '0', 10), 0, max));
    });

    $container.off('click.twgsIcon').on('click.twgsIcon', 'img.twgs_icon', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const img = e.currentTarget;
      const unit = img.getAttribute('data-unit');
      const $cand = $(img).closest('.twgs_candidate');
      const $inp = $cand.find(`input.twgs_amt[data-unit="${unit}"]`).first();
      if (!$inp.length) return;
      const max = parseInt($inp.attr('data-max') || '0', 10);
      const cur = parseInt($inp.val() || '0', 10) || 0;
      $inp.val(cur > 0 ? '0' : String(max)).trigger('input');
      $(img).css('filter', (cur > 0 ? '' : 'drop-shadow(0 0 4px rgba(46,125,50,0.8))'));
    });

    $container.find('.twgs_select_all').off('click').on('click', (e) => {
      const $cand = $(e.currentTarget).closest('.twgs_candidate');
      $cand.find('input.twgs_amt').each((_, el) => {
        el.value = String(parseInt(el.getAttribute('data-max') || '0', 10));
      });
    });

    $container.find('.twgs_timer').off('click').on('click', (e) => {
      const $cand = $(e.currentTarget).closest('.twgs_candidate');
      const idx2 = parseInt($cand.attr('data-idx') || '0', 10);
      const c = candidates[idx2];
      if (!c) return;
      startTimer(idx2, c.sendMs, $cand.find('.twgs_timer_out'));
    });

    $container.find('.twgs_open_support').off('click').on('click', (e) => {
      const $cand = $(e.currentTarget).closest('.twgs_candidate');
      const idx2 = parseInt($cand.attr('data-idx') || '0', 10);
      const c = candidates[idx2];
      if (!c) return;
      if (!c.src.villageId) { alert('Cannot open support: missing villageId.'); return; }
      const unitsToSend = {};
      $cand.find('input.twgs_amt').each((_, el) => {
        const unit = el.getAttribute('data-unit');
        const val = clampInt(parseInt(el.value || '0', 10), 0, parseInt(el.getAttribute('data-max') || '0', 10));
        if (val > 0) unitsToSend[unit] = val;
      });
      if (!Object.keys(unitsToSend).length) { alert('Select at least one unit amount (>0).'); return; }
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        createdAt: Date.now(),
        sourceVillageId: c.src.villageId,
        target: state.target,
        unitsToSend,
        midGapArrivalMs
      }));
      window.open(
        `https://pt111.tribalwars.com.pt/game.php?village=${encodeURIComponent(c.src.villageId)}&screen=place`,
        '_blank', 'noopener,noreferrer'
      );
    });
  }

  function renderSelectedGapResults() {
    const idx = state.selectedGapIndex;
    if (idx == null) {
      $('#twgs_result').html('<div style="color:#555;">Select a gap.</div>');
      return;
    }
    const a = state.incomings[idx];
    const b = state.incomings[idx + 1];
    const afterMs  = a.arrivalMs;
    const beforeMs = b.arrivalMs;
    const midGapArrivalMs = Math.floor((afterMs + beforeMs) / 2);

    const candidates = buildCandidatesForGap(idx, midGapArrivalMs);

    $('#twgs_result').html(`
      <div style="color:#333; margin-bottom:8px; font-size:11px;">
        Gap: <b>${fmtDateMs(new Date(afterMs))}</b> → <b>${fmtDateMs(new Date(beforeMs))}</b> |
        CStime(mid): <b>${fmtDateMs(new Date(midGapArrivalMs))}</b> |
        showing <b>${Math.min(candidates.length, 15)}</b>
      </div>
      <div id="twgs_candidates_auto"></div>
    `);
    renderCandidates(candidates, midGapArrivalMs, $('#twgs_candidates_auto'));

    // FIX: icon click handler now uses event delegation and stops propagation,
    // and explicitly selects the matching input in the same candidate.
    $('#twgs_result').off('click.twgsIcon').on('click.twgsIcon', 'img.twgs_icon', (e) => {
      e.preventDefault();
      e.stopPropagation();
      // handled by bindCandidateEvents on #twgs_candidates_auto
    });
  }

  async function openUI() {
    ensureUI();
    $(`#${UI_ID}`).show();

    $('#twgs_gaps').html('<div style="color:#555;">Loading incomings + troops…</div>');
    $('#twgs_result').text('—');

    // Read all Nobre-labelled incomings (already filtered in readIncomingsMsFromDOM).
    const allIncomings = readIncomingsMsFromDOM();

    if (!allIncomings.length) {
      $('#twgs_target_lbl').text('—');
      $('#twgs_gaps').html('<div style="color:#b71c1c;">No "Nobre" labelled incomings found.</div>');
      return;
    }

    // Derive target: all Nobre commands must share the same target village.
    // Use the most common coord as the canonical target (majority vote is
    // robust against any stray mislabelled row).
    const coordKey = c => `${c.x}|${c.y}`;
    const tally = {};
    for (const inc of allIncomings) {
      const k = coordKey(inc.target);
      tally[k] = (tally[k] || 0) + 1;
    }
    const canonicalKey = Object.entries(tally).sort((a, b) => b[1] - a[1])[0][0];
    state.target = allIncomings.find(inc => coordKey(inc.target) === canonicalKey).target;

    // Only keep incomings whose target matches the canonical target.
    state.incomings = allIncomings.filter(inc => coordKey(inc.target) === canonicalKey);

    $('#twgs_target_lbl').text(canonicalKey);

    // Build gaps only between consecutive entries (already same target).
    // A "gap" carries the label of the later command so the UI can name it.
    const gaps = [];
    for (let i = 0; i < state.incomings.length - 1; i++) {
      gaps.push({
        afterIdx:  i,
        beforeIdx: i + 1,
        // Name = label of the *later* command (the one to snipe in front of)
        label: state.incomings[i + 1].label || `Gap #${gaps.length + 1}`,
      });
    }

    if (!gaps.length) {
      $('#twgs_gaps').html('<div style="color:#b71c1c;">Need at least 2 "Nobre" incomings to the same target.</div>');
      return;
    }

    const vid = getCurrentVillageId();
    if (!vid) {
      $('#twgs_gaps').html('<div style="color:#b71c1c;">Could not detect current village id.</div>');
      return;
    }

    state.troopsByVillage = await fetchOwnHomeTroops(vid);

    const $g = $('#twgs_gaps').empty();
    gaps.forEach((gap, gapIdx) => {
      const a = state.incomings[gap.afterIdx];
      const b = state.incomings[gap.beforeIdx];
      const id = `twgs_gap_${gapIdx}`;

      $g.append(`
        <div id="${id}" style="
          margin:0 0 8px 0; padding:8px 10px;
          border:1px solid rgba(0,0,0,0.14); border-left:3px solid rgba(0,0,0,0.35);
          background: rgba(255,255,255,0.55);
          cursor: pointer; border-radius: 6px;
        ">
          <b>${gap.label}</b>
          <span style="color:#555; font-size:11px; margin-left:6px;">
            ${fmtDateMs(new Date(a.arrivalMs))} → ${fmtDateMs(new Date(b.arrivalMs))}
          </span>
        </div>
      `);

      $(`#${id}`).on('click', () => {
        state.selectedGapIndex = gap.afterIdx;
        $('#twgs_gaps > div').css('outline', 'none');
        $(`#${id}`).css('outline', '2px solid rgba(46,125,50,0.85)');
        renderSelectedGapResults();
      });
    });

    state.selectedGapIndex = gaps[0].afterIdx;
    $(`#twgs_gap_0`).trigger('click');
  }

  function boot() {
    ensureOpenIcon();
    let tries = 0;
    const t = setInterval(() => {
      ensureOpenIcon();
      tries++;
      if (document.getElementById(BTN_ID) || tries > 60) clearInterval(t);
    }, 200);
  }

  boot();
})();
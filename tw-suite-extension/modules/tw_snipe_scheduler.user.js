// ==UserScript==
// @name         TW Snipe scheduler
// @namespace    https://pt111.tribalwars.com.pt/
// @version      1.6.1
// @description  🎯 opens UI. Select a ms-precise gap. Villages sorted by soonest feasible send. Choose units to send (all are constrained to be <= chosen slowest). Unit icon toggles select-all for that unit. "Select all" fills all shown units. Each candidate has its own countdown timer (multiple timers run simultaneously; negative red after). "Open support" opens new tab and auto place->confirm (no final send). CStime is mid-gap.
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
  const PLAN_TTL_MS = 0.1 * 60 * 1000; // 5 minutes — abandon stale plans

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
    timers: new Map() // idx -> interval id
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

  function getTargetCoordFromNowrapB() {
    let coord = null;
    $('b.nowrap').each((_, el) => {
      if (coord) return;
      const c = parseCoord($(el).text());
      if (c) coord = c;
    });
    return coord;
  }

function readIncomingsMsFromDOM() {
  const $wrap = $('#commands_incomings');
  if (!$wrap.length) return [];

  const list = [];
  $wrap.find('tr.command-row').each((_, tr) => {
    const $tr = $(tr);

    // NEW: ignore supports (data-command-type="support")
    const cmdType =
      ($tr.attr('data-command-type') ||
        $tr.find('[data-command-type]').first().attr('data-command-type') ||
        '').toLowerCase();

    if (cmdType === 'support') return;

    const endSpan = $tr.find('span[data-endtime]').first();
    const endtimeSec = parseInt(endSpan.attr('data-endtime') || '', 10);
    if (!endtimeSec) return;

    const grey = $tr.find('span.grey.small').first().text().trim();
    const ms = clampInt(parseInt(grey || '0', 10), 0, 999);

    list.push({ arrivalMs: endtimeSec * 1000 + ms });
  });

  list.sort((a, b) => a.arrivalMs - b.arrivalMs);
  return list;
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
      width: 640px;
      max-height: 75vh;
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

          <table class="vis" width="100%">
            <tr>
              <th width="150">Target</th>
              <td id="twgs_target_lbl">—</td>
            </tr>

            <tr>
              <th>Game speed</th>
              <td>
                <input id="twgs_gameSpeed" type="number" step="0.01" value="' + _defaultGameSpeed + '" style="width:80px">
              </td>
            </tr>

            <tr>
              <th>Unit speed</th>
              <td>
                <input id="twgs_unitSpeed" type="number" step="0.01" value="' + _defaultUnitSpeed + '" style="width:80px">
              </td>
            </tr>
          </table>

          <br>

          <h4>Available gaps</h4>
          <div id="twgs_gaps"></div>

          <br>

          <h4>Results</h4>
          <div id="twgs_result">—</div>

        </div>
        </div>

      </div>

    </div>
  `);

  $('body').append($ui);

  $('#twgs_close').on('click', (e) => {
    e.preventDefault();
    $ui.hide();
  });

  $('#twgs_reload').on('click', (e) => {
    e.preventDefault();
    openUI();
  });

  $('#twgs_gameSpeed, #twgs_unitSpeed').on('change input', () => {
    if (state.selectedGapIndex != null) renderSelectedGapResults();
  });
}


  function getSpeedFactorFromUI() {
    const gameSpeed = parseFloat($('#twgs_gameSpeed').val()) || 1.4;
    const unitSpeed = parseFloat($('#twgs_unitSpeed').val()) || 0.75;
    return { gameSpeed, unitSpeed, speedFactor: 1 / (gameSpeed * unitSpeed) };
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

  function renderSelectedGapResults() {
    const idx = state.selectedGapIndex;
    if (idx == null) {
      $('#twgs_result').html('<div style="color:#555;">Select a gap.</div>');
      return;
    }

    const { speedFactor } = getSpeedFactorFromUI();

    const a = state.incomings[idx];
    const b = state.incomings[idx + 1];

    const afterMs = a.arrivalMs;
    const beforeMs = b.arrivalMs;
    const midGapArrivalMs = Math.floor((afterMs + beforeMs) / 2);

    const nowMs = getServerNowMs();

    const candidates = [];

    for (const src of state.troopsByVillage) {
      let chosen = null;

      for (const unit of UNIT_ORDER_FAST_TO_SLOW.slice().reverse()) {
        const avail = src.troops?.[unit] || 0;
        if (!avail) continue;

        const tMs = travelMsForUnit(unit, src.coord, state.target, speedFactor);
        const earliestSendMs = (afterMs + 1) - tMs;
        const latestSendMs = (beforeMs - 1) - tMs;
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

    if (!candidates.length) {
      $('#twgs_result').html('<div style="color:#b71c1c;">No feasible commands for this gap (or all in the past).</div>');
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
          </div>
        `;
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
        </div>
      `;
    }).join('');

    $('#twgs_result').html(`
      <div style="color:#333; margin-bottom:8px; font-size:11px;">
        Gap: <b>${fmtDateMs(new Date(afterMs))}</b> → <b>${fmtDateMs(new Date(beforeMs))}</b> |
        CStime(mid): <b>${fmtDateMs(new Date(midGapArrivalMs))}</b> |
        showing <b>${Math.min(candidates.length, 15)}</b>
      </div>
      ${html}
    `);

    // clamp amounts
    $('#twgs_result input.twgs_amt').off('input').on('input', (e) => {
      const el = e.currentTarget;
      const max = parseInt(el.getAttribute('data-max') || '0', 10);
      const cur = parseInt(el.value || '0', 10);
      el.value = String(clampInt(cur, 0, max));
    });

    // FIX: icon click handler now uses event delegation and stops propagation,
    // and explicitly selects the matching input in the same candidate.
    $('#twgs_result').off('click.twgsIcon').on('click.twgsIcon', 'img.twgs_icon', (e) => {
      e.preventDefault();
      e.stopPropagation();

      const img = e.currentTarget;
      const unit = img.getAttribute('data-unit');
      const $cand = $(img).closest('.twgs_candidate');

      const $inp = $cand.find(`input.twgs_amt[data-unit="${unit}"]`).first();
      if (!$inp.length) return;

      const max = parseInt($inp.attr('data-max') || '0', 10);
      const cur = parseInt($inp.val() || '0', 10) || 0;

      // toggle
      $inp.val(cur > 0 ? '0' : String(max)).trigger('input');
      // visual cue
      $(img).css('filter', (cur > 0 ? '' : 'drop-shadow(0 0 4px rgba(46,125,50,0.8))'));
    });

    // select all troops for this candidate
    $('#twgs_result .twgs_select_all').off('click').on('click', (e) => {
      const $cand = $(e.currentTarget).closest('.twgs_candidate');
      $cand.find('input.twgs_amt').each((_, el) => {
        const max = parseInt(el.getAttribute('data-max') || '0', 10);
        el.value = String(max);
      });
    });

    // timers (multiple)
    $('#twgs_result .twgs_timer').off('click').on('click', (e) => {
      const $cand = $(e.currentTarget).closest('.twgs_candidate');
      const idx2 = parseInt($cand.attr('data-idx') || '0', 10);
      const c = candidates[idx2];
      if (!c) return;
      startTimer(idx2, c.sendMs, $cand.find('.twgs_timer_out'));
    });

    // open support in NEW TAB
    $('#twgs_result .twgs_open_support').off('click').on('click', (e) => {
      const $cand = $(e.currentTarget).closest('.twgs_candidate');
      const idx2 = parseInt($cand.attr('data-idx') || '0', 10);
      const c = candidates[idx2];
      if (!c) return;

      if (!c.src.villageId) {
        alert('Cannot open support because this row is missing villageId in the troop overview list.');
        return;
      }

      const unitsToSend = {};
      $cand.find('input.twgs_amt').each((_, el) => {
        const unit = el.getAttribute('data-unit');
        const max = parseInt(el.getAttribute('data-max') || '0', 10);
        const val = clampInt(parseInt(el.value || '0', 10), 0, max);
        if (val > 0) unitsToSend[unit] = val;
      });

      if (!Object.keys(unitsToSend).length) {
        alert('Select at least one unit amount (>0).');
        return;
      }

      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        createdAt: Date.now(),
        sourceVillageId: c.src.villageId,
        target: state.target,
        unitsToSend,
        midGapArrivalMs
      }));

      const url = `https://pt111.tribalwars.com.pt/game.php?village=${encodeURIComponent(c.src.villageId)}&screen=place`;
      window.open(url, '_blank', 'noopener,noreferrer');
    });
  }

  async function openUI() {
    ensureUI();
    $(`#${UI_ID}`).show();

    state.target = getTargetCoordFromNowrapB();
    if (!state.target) {
      $('#twgs_target_lbl').text('No target found.');
      $('#twgs_gaps').html('<div style="color:#b71c1c;">No target found.</div>');
      return;
    }
    $('#twgs_target_lbl').text(`${state.target.x}|${state.target.y}`);

    $('#twgs_gaps').html('<div style="color:#555;">Loading incomings + troops…</div>');
    $('#twgs_result').text('—');

    state.incomings = readIncomingsMsFromDOM();
    if (state.incomings.length < 2) {
      $('#twgs_gaps').html('<div style="color:#b71c1c;">Need at least 2 incomings to compute gaps.</div>');
      return;
    }

    const vid = getCurrentVillageId();
    if (!vid) {
      $('#twgs_gaps').html('<div style="color:#b71c1c;">Could not detect current village id.</div>');
      return;
    }

    state.troopsByVillage = await fetchOwnHomeTroops(vid);

    const $g = $('#twgs_gaps').empty();
    for (let i = 0; i < state.incomings.length - 1; i++) {
      const a = state.incomings[i];
      const b = state.incomings[i + 1];
      const id = `twgs_gap_${i}`;

      $g.append(`
        <div id="${id}" style="
          margin:0 0 8px 0; padding:8px 10px;
          border:1px solid rgba(0,0,0,0.14); border-left:3px solid rgba(0,0,0,0.35);
          background: rgba(255,255,255,0.55);
          cursor: pointer; border-radius: 6px;
        ">
          <b>Gap #${i + 1}</b>: ${fmtDateMs(new Date(a.arrivalMs))} → ${fmtDateMs(new Date(b.arrivalMs))}
        </div>
      `);

      $(`#${id}`).on('click', () => {
        state.selectedGapIndex = i;
        $('#twgs_gaps > div').css('outline', 'none');
        $(`#${id}`).css('outline', '2px solid rgba(46,125,50,0.85)');
        renderSelectedGapResults();
      });
    }

    state.selectedGapIndex = 0;
    $('#twgs_gap_0').trigger('click');
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
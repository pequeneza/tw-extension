// ==UserScript==
// @name         TW Snipe scheduler
// @namespace    https://pt111.tribalwars.com.pt/
// @version      1.7.1
// @description  Place-page automator for Gap Snipe Planner. Reads plan written by SnipeView.tsx and auto-fills/submits the support form.
// @author       pequeneza
// @match        *://pt111.tribalwars.com.pt/game.php*screen=place*
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const $ = window.jQuery;
  if (!($ && $.fn && $.fn.on)) return;

  const STORAGE_KEY = 'tw_gap_snipe_plan_v12';
  const PLAN_TTL_MS = 5 * 60 * 1000;

  // Used to zero-out all unit inputs before filling from plan
  const UNIT_MIN_PER_FIELD = {
    spear: 18, sword: 22, axe: 18, archer: 18, spy: 9,
    light: 10, marcher: 10, heavy: 11, ram: 30, catapult: 30,
    snob: 35, knight: 10
  };

  // Adds random jitter to fixed UI-automation delays so repeated runs (and
  // different installs of this script) don't produce an identical, mechanically
  // precise timing signature. Does not touch actual snipe arrival-time math.
  function jitter(baseMs, spreadMs) {
    return Math.max(0, Math.round(baseMs + (Math.random() * 2 - 1) * spreadMs));
  }

  function pad2(n) { return String(n).padStart(2, '0'); }

  function toDatetimeLocalMs(ms) {
    const d = new Date(ms);
    const sss = String(d.getMilliseconds()).padStart(3, '0');
    return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`
         + `T${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}.${sss}`;
  }

  function getQueryParam(name) {
    const m = location.search.match(new RegExp('[?&]' + name + '=([^&]+)'));
    return m ? decodeURIComponent(m[1]) : null;
  }

  function loadPlan() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    try {
      const plan = JSON.parse(raw);
      if (plan?.createdAt && (Date.now() - plan.createdAt) > PLAN_TTL_MS) {
        localStorage.removeItem(STORAGE_KEY);
        return null;
      }
      return plan;
    } catch { return null; }
  }

  function clearPlan() { localStorage.removeItem(STORAGE_KEY); }

  function fillTargetOnPlace(plan) {
    const $field = $('input.target-input-field').first();
    if (!$field.length) return false;
    $field.val(`${plan.target.x}|${plan.target.y}`).trigger('input').trigger('change');
    return true;
  }

  function fillUnitsOnPlace(plan) {
    const units = plan.unitsToSend || {};
    $('input.unitsInput').each((_, el) => {
      const nm = $(el).attr('name');
      if (nm && (nm in UNIT_MIN_PER_FIELD)) $(el).val('0');
    });
    let wrote = false;
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
    const $confirm = $('button, input[type="submit"], a.btn').filter((_, el) => {
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
    const plan = loadPlan();
    if (!plan?.target || !plan?.sourceVillageId || !plan?.unitsToSend || !plan?.midGapArrivalMs) return;

    if ($('#CStime').length) {
      fillCStimeAndConfirm(plan);
      return;
    }

    const okT = fillTargetOnPlace(plan);
    const okU = fillUnitsOnPlace(plan);
    if (okT && okU) setTimeout(() => submitSupportOnPlace(), jitter(350, 100));
  }

  if (getQueryParam('screen') === 'place') {
    setTimeout(runPlaceAutomationIfNeeded, jitter(500, 120));
  }
})();

// ==UserScript==
// @name         Tribal Wars Resource Buyer (Manual Start + Storage Target)
// @namespace    http://tampermonkey.net/
// @version      2.0.0
// @description  Manual-start resource buyer for Tribal Wars premium market. UI is provided by the xBot React overlay.
// @author       ricardofauch (modified) + copilot rewrite
// @match        https://*.tribalwars.com.pt/*game.php?*&screen=market&mode=exchange*
// @grant        none
// @license      MIT
// ==/UserScript==

(function () {
  'use strict';

  // ────────────────────────────────────────────────
  // CONFIGURATION
  // ────────────────────────────────────────────────
  const DEFAULT_CONFIG = {
    ENABLED: true,
    buy_wood: true,
    buy_stone: true,
    buy_iron: true,
    priority: ['wood', 'stone', 'iron'],
    MIN_PP_TO_BUY: 100,
    PURCHASE_PERCENTAGE: 0.70,
    MIN_STOCK_THRESHOLD: 50,
    PAGE_RELOAD_INTERVAL: 30000,
    RANDOM_INTERVAL_MIN: 600,
    RANDOM_INTERVAL_MAX: 2500
  };

  function loadConfig() {
    try { return JSON.parse(localStorage.getItem('tw_buyer_config') || '{}'); } catch { return {}; }
  }
  function persistConfig(cfg) {
    localStorage.setItem('tw_buyer_config', JSON.stringify(cfg));
  }

  const RUNNING_KEY       = 'tw_buyer_running';
  const LAST_PURCHASE_KEY = 'tw_buyer_last_purchase';
  const PP_BEFORE_KEY     = 'tw_buyer_pp_before';
  const LAST_BOUGHT_KEY   = 'tw_buyer_last_bought';
  const STATS_KEY         = 'tw_buyer_stats';
  const NEXT_ACTION_KEY   = 'tw_buyer_next_action_at';
  const COOLDOWN_MS       = 7000;

  function loadRunning() {
    return localStorage.getItem(RUNNING_KEY) === 'true';
  }
  function persistRunning(state) {
    localStorage.setItem(RUNNING_KEY, String(state));
  }

  function loadStats() {
    try { return JSON.parse(localStorage.getItem(STATS_KEY) || '{}'); } catch { return {}; }
  }
  function persistStats(s) {
    localStorage.setItem(STATS_KEY, JSON.stringify(s));
  }

  let config = Object.assign({}, DEFAULT_CONFIG, loadConfig());
  let running = loadRunning();
  let stats   = Object.assign({ ppSpent: 0, wood: 0, stone: 0, iron: 0 }, loadStats());
  let _minTrade = { wood: null, stone: null, iron: null };
  let cycleTimeout = null;

  // ────────────────────────────────────────────────
  // REACT OVERLAY BRIDGE
  // ────────────────────────────────────────────────
  function dispatchState() {
    document.dispatchEvent(new CustomEvent('xbot:buyer:state', {
      detail: { running, config, stats, minTrade: _minTrade }
    }));
  }

  // React → userscript: start
  document.addEventListener('xbot:buyer:start', () => {
    if (!config.ENABLED || running) return;
    setRunning(true);
  });

  // React → userscript: stop
  document.addEventListener('xbot:buyer:stop', () => {
    setRunning(false);
  });

  // React → userscript: save new config
  document.addEventListener('xbot:buyer:save', (e) => {
    const incoming = e.detail && e.detail.config;
    if (!incoming) return;
    config = Object.assign({}, DEFAULT_CONFIG, incoming);
    persistConfig(config);
    dispatchState();
    console.log('[Buyer] Config saved via overlay');
  });

  // React → userscript: state probe (overlay just opened)
  document.addEventListener('xbot:buyer:getState', () => {
    dispatchState();
  });

  // React → userscript: reset session stats
  document.addEventListener('xbot:buyer:resetStats', () => {
    stats = { ppSpent: 0, wood: 0, stone: 0, iron: 0 };
    persistStats(stats);
    dispatchState();
  });

  // ────────────────────────────────────────────────
  // RUN LOOP
  // ────────────────────────────────────────────────
  function setRunning(state) {
    running = state;
    persistRunning(state);
    dispatchState();

    if (cycleTimeout) { clearTimeout(cycleTimeout); cycleTimeout = null; }

    if (running) {
      scheduleNextCycle(getStartDelay());
      console.log('[Buyer] Started');
    } else {
      console.log('[Buyer] Stopped');
    }
  }

  function getStartDelay() {
    const last    = parseInt(localStorage.getItem(LAST_PURCHASE_KEY) || '0', 10);
    const elapsed = Date.now() - last;
    return elapsed < COOLDOWN_MS ? COOLDOWN_MS - elapsed + 50 : 50 + Math.random() * 250;
  }

  function scheduleNextCycle(ms) {
    if (!running) return;
    localStorage.setItem(NEXT_ACTION_KEY, String(Date.now() + ms));
    cycleTimeout = setTimeout(async () => {
      let result = 'skip';
      try {
        result = await checkAndBuyResources();
      } catch (e) {
        console.error('[Buyer] Cycle error:', e);
      } finally {
        if (!running) return;
        if (result === 'purchased') {
          scheduleNextCycle(COOLDOWN_MS);           // 4 s cooldown after purchase
        } else if (result === 'nothing') {
          // reload already scheduled inside checkAndBuyResources — don't reschedule
        } else {
          scheduleNextCycle(1000 + Math.random() * 2000); // skip/error → retry shortly
        }
      }
    }, ms);
  }

  // ────────────────────────────────────────────────
  // DOM READERS
  // ────────────────────────────────────────────────
  function readStorageCapacity() {
    const el = document.querySelector('#storage');
    if (!el) return null;
    const n = parseInt(el.textContent.replace(/\D/g, ''), 10);
    return Number.isNaN(n) ? null : n;
  }

  function readVillageResource(res) {
    const el = document.getElementById(res);
    if (!el) return null;
    const n = parseInt(el.textContent.replace(/\D/g, ''), 10);
    return Number.isNaN(n) ? null : n;
  }

  function readExchangeStock(res) {
    const el = document.getElementById(`premium_exchange_stock_${res}`);
    if (!el) return null;
    const n = parseInt(el.textContent.replace(/\D/g, ''), 10);
    return Number.isNaN(n) ? null : n;
  }

  function readIncomingResources() {
    const result = { wood: 0, stone: 0, iron: 0 };
    let incomingTh = null;
    for (const th of document.querySelectorAll('th')) {
      if (th.textContent.trim().startsWith('A chegar')) { incomingTh = th; break; }
    }
    if (!incomingTh) return result;
    for (const res of ['wood', 'stone', 'iron']) {
      for (const nowrap of incomingTh.querySelectorAll('.nowrap')) {
        if (nowrap.querySelector(`.icon.header.${res}`)) {
          // textContent includes the icon space + number with "." thousand separators
          const n = parseInt(nowrap.textContent.replace(/\D/g, ''), 10);
          if (!Number.isNaN(n)) result[res] = n;
          break;
        }
      }
    }
    return result;
  }

  function readMinTradePerResource(res) {
    // Try direct ID pattern (consistent with premium_exchange_stock_<res>)
    const direct = document.querySelector(`#premium_exchange_rate_${res}`);
    if (direct) {
      const m = direct.textContent.match(/\d+/);
      if (m) return parseInt(m[0], 10);
    }
    // Fall back: find the "Classificar" row by label text, read the resource column
    const COL = { wood: 1, stone: 2, iron: 3 };
    for (const row of document.querySelectorAll('table tr')) {
      const cells = row.querySelectorAll('td');
      if (cells.length < 2) continue;
      if (/classificar/i.test(cells[0].textContent || '')) {
        const cell = cells[COL[res]];
        if (cell) {
          const m2 = cell.textContent.match(/\d+/);
          if (m2) return parseInt(m2[0], 10);
        }
      }
    }
    return null;
  }

  function readPremiumPoints() {
    const candidates = [
      document.querySelector('#premium_points'),
      document.querySelector('.premium_points'),
      document.querySelector('#premium'),
      document.querySelector('.icon.header.premium')?.closest('th'),
      document.querySelector('[class*="premium"] [class*="amount"]')
    ].filter(Boolean);

    for (const el of candidates) {
      const n = parseInt(el.textContent.replace(/\D/g, ''), 10);
      if (!Number.isNaN(n) && n >= 0) return n;
    }
    return null;
  }

  // ────────────────────────────────────────────────
  // CORE ACTIONS
  // ────────────────────────────────────────────────
  function checkPremiumPointsGuard() {
    const pp = readPremiumPoints();
    if (pp === null) {
      console.warn('[Buyer] Could not read premium points → blocking buying (fail-safe).');
      return false;
    }
    console.log(`[Buyer] Premium points: ${pp}`);
    if (pp < config.MIN_PP_TO_BUY) {
      console.warn(`[Buyer] PP (${pp}) < minimum (${config.MIN_PP_TO_BUY}) → skipping cycle`);
      return false;
    }
    return true;
  }

  function checkForUsageWarningAndReload() {
    const errors = document.querySelectorAll('.error_box');
    for (const el of errors) {
      const t = (el.textContent || '').toLowerCase();
      if (t.includes('premium') || t.includes('börse') || t.includes('exchange') || t.includes('market')) {
        console.warn('[Buyer] Usage warning detected → reloading');
        location.reload();
        return true;
      }
    }
    return false;
  }

  function clickBuyButton() {
    const btn = document.querySelector('.btn-premium-exchange-buy');
    if (btn) { console.log('[Buyer] Clicking BUY'); btn.click(); }
    else console.warn('[Buyer] Buy button not found');
  }

  function readConfirmedAmount(dialog) {
    // Parse "Comprar [img] 65 por [img] 1" — the actual amount TW will sell this transaction
    for (const td of dialog.querySelectorAll('td')) {
      const m = td.textContent.replace(/\s+/g, ' ').match(/(\d[\d ]*)\s+por\s+\d/);
      if (m) return parseInt(m[1].replace(/\s/g, ''), 10);
    }
    return null;
  }

  function clickConfirmButton(onActualAmount) {
    let attempts = 0;
    const iv = setInterval(() => {
      attempts++;
      const dialog = document.querySelector('.confirmation-box');
      if (dialog && dialog.style.display !== 'none') {
        clearInterval(iv);
        const actual = readConfirmedAmount(dialog);
        if (actual !== null && onActualAmount) onActualAmount(actual);
        const yes = document.querySelector('.btn-confirm-yes');
        if (yes) {
          console.log('[Buyer] Clicking YES in confirmation, actual amount:', actual);
          yes.click();
        }
      }
      if (attempts > 80) clearInterval(iv);
    }, 40);
  }

  async function checkAndBuyResources() {
    if (!running || !config.ENABLED) return 'skip';
    console.log('─ Resource check cycle ─');

    if (checkForUsageWarningAndReload()) return 'skip';

    const ppOk = checkPremiumPointsGuard();
    if (!ppOk) return 'skip';

    const storageCap = readStorageCapacity();
    if (storageCap === null) {
      console.warn('[Buyer] Cannot read storage capacity. Aborting cycle.');
      return 'skip';
    }

    let purchased = false;
    const incoming = readIncomingResources();
    console.log(`[Buyer] Incoming: wood=${incoming.wood} stone=${incoming.stone} iron=${incoming.iron}`);

    // Refresh min-trade rates each cycle; send to overlay
    for (const r of ['wood', 'stone', 'iron']) {
      _minTrade[r] = readMinTradePerResource(r);
    }
    console.log(`[Buyer] Min trade: wood=${_minTrade.wood} stone=${_minTrade.stone} iron=${_minTrade.iron}`);
    dispatchState();

    for (const res of config.priority) {
      if (!config[`buy_${res}`]) { console.log(`[Buyer] ${res} disabled`); continue; }

      const stock = readExchangeStock(res);
      if (stock === null) { console.warn(`[Buyer] Cannot read stock for ${res}`); continue; }
      if (stock <= config.MIN_STOCK_THRESHOLD) { console.log(`[Buyer] ${res} stock too low (${stock} ≤ ${config.MIN_STOCK_THRESHOLD})`); continue; }

      const current = readVillageResource(res);
      if (current === null) { console.warn(`[Buyer] Cannot read village ${res}`); continue; }

      const target    = Math.floor(storageCap * config.PURCHASE_PERCENTAGE);
      const effective = current + (incoming[res] || 0);
      // Don't count incoming toward the "do we need more?" decision — incoming may be
      // slow or large from a prior bulk buy. Cap by remaining storage space to avoid overflow.
      const spaceLeft = storageCap - effective;
      const missing   = Math.min(target - current, spaceLeft);
      console.log(`[Buyer] ${res.toUpperCase()} ${current} + ${incoming[res] || 0} incoming = ${effective} → target ${target} | still missing ${target - effective} | stock ${stock}`);

      if (missing <= 0) continue;

      // Floor to multiple of minimum trade unit to avoid silent TW rounding
      const minUnit = _minTrade[res];
      if (!minUnit || minUnit <= 0) { console.warn(`[Buyer] Min trade unknown for ${res} — skipping`); continue; }
      const amount = Math.floor(Math.min(missing, stock) / minUnit) * minUnit;
      if (amount <= 0) continue;

      const input = document.querySelector(`#premium_exchange_buy_${res} input`);
      if (!input) { console.warn(`[Buyer] Input not found for ${res}`); continue; }

      console.log(`[Buyer] → Buying up to ${amount} ${res.toUpperCase()}`);

      // snapshot PP; LAST_BOUGHT_KEY starts with the requested amount and gets updated
      // to the actual confirmed amount once the popup is read (TW may serve less per tier)
      const ppSnap = readPremiumPoints();
      if (ppSnap !== null) localStorage.setItem(PP_BEFORE_KEY, String(ppSnap));
      localStorage.setItem(LAST_BOUGHT_KEY, JSON.stringify({ res, amount }));
      localStorage.setItem(LAST_PURCHASE_KEY, String(Date.now()));

      // Human-like staggered delays:
      //   preDelay  — pause before touching the input (200-600ms)
      //   fillToClick — delay between filling and clicking buy (RANDOM_INTERVAL_MIN..MAX, default 600-2500ms)
      //   clickToConf — delay between buy click and confirm click (400-800ms)
      // COOLDOWN_MS (7000ms) must exceed preDelay_max + fillToClick_max + clickToConf_max (~3900ms)
      const preDelay    = 200 + Math.random() * 400;
      const fillToClick = config.RANDOM_INTERVAL_MIN + Math.random() * (config.RANDOM_INTERVAL_MAX - config.RANDOM_INTERVAL_MIN);
      const clickToConf = 400 + Math.random() * 400;

      setTimeout(() => {
        input.value = amount;
        setTimeout(clickBuyButton, fillToClick);
        setTimeout(() => clickConfirmButton((actual) => {
          if (actual !== null && actual !== amount) {
            console.log(`[Buyer] Popup actual: ${actual} (requested ${amount}) — updating record`);
            localStorage.setItem(LAST_BOUGHT_KEY, JSON.stringify({ res, amount: actual }));
          }
        }), fillToClick + clickToConf);
      }, preDelay);

      purchased = true;
      break;
    }

    if (!purchased) {
      console.log(`[Buyer] Nothing to buy → reload in ~${Math.round(config.PAGE_RELOAD_INTERVAL / 1000)}s`);
      localStorage.setItem(NEXT_ACTION_KEY, String(Date.now() + config.PAGE_RELOAD_INTERVAL));
      setTimeout(() => location.reload(), config.PAGE_RELOAD_INTERVAL);
      return 'nothing';
    }

    return 'purchased';
  }

  // ────────────────────────────────────────────────
  // STARTUP
  // ────────────────────────────────────────────────
  function reconcileStats() {
    const ppBefore   = parseInt(localStorage.getItem(PP_BEFORE_KEY) || '', 10);
    const lastBought = JSON.parse(localStorage.getItem(LAST_BOUGHT_KEY) || 'null');
    localStorage.removeItem(PP_BEFORE_KEY);
    localStorage.removeItem(LAST_BOUGHT_KEY);
    if (isNaN(ppBefore) || !lastBought) return;
    const ppNow = readPremiumPoints();
    if (ppNow === null) return;
    const delta = ppBefore - ppNow;
    if (delta > 0) {
      stats.ppSpent        += delta;
      stats[lastBought.res] = (stats[lastBought.res] || 0) + lastBought.amount;
      persistStats(stats);
      console.log(`[Buyer] Stats: +${delta} PP, +${lastBought.amount} ${lastBought.res} → total PP=${stats.ppSpent}`);
    }
  }

  console.log('Resource Buyer v2.0.0 • xBot overlay mode');
  reconcileStats(); // compute PP delta from previous purchase before announcing state
  dispatchState();  // announce presence to overlay
  if (running) {
    setRunning(true); // restore auto-start after page reload
  }
})();
